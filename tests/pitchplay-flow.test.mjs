import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const match = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
assert.ok(match, 'the app must contain its inline application script');
const source = match[1];

function createHarness(existingStorage = new Map()) {
  const listeners = Object.create(null);
  const alerts = [];
  const prompts = [];
  const nodes = Object.create(null);
  const node = (id = '') => ({
    id, innerHTML: '', textContent: '', value: '', content: '',
    focused: false,
    classList: { contains: () => false, toggle: () => {} },
    focus() { this.focused = true; },
    setSelectionRange() {},
    insertAdjacentHTML(_where, value) { this.innerHTML = value + this.innerHTML; }
  });
  for (const id of ['#app', '#modalhost', '#saveStatus', '#newTeamName', '#teamNameInput', '#importFile', '#runtimeError', 'meta[name="theme-color"]']) nodes[id] = node(id);
  const document = {
    documentElement: { dataset: {} },
    querySelector(selector) { return nodes[selector] || (nodes[selector] = node(selector)); },
    querySelectorAll() { return []; },
    getElementById(id) { return nodes['#' + id] || null; },
    addEventListener(type, handler, options) {
      (listeners[type] ||= []).push({ handler, options });
    }
  };
  const window = { addEventListener(type, handler) { (listeners['window:' + type] ||= []).push(handler); } };
  const localStorage = {
    getItem(key) { return existingStorage.has(key) ? existingStorage.get(key) : null; },
    setItem(key, value) { existingStorage.set(key, String(value)); },
    removeItem(key) { existingStorage.delete(key); }
  };
  class FormDataShim {
    constructor(form) { this.fields = form.fields || {}; }
    get(key) { return this.fields[key] == null ? null : this.fields[key]; }
    *entries() { yield* Object.entries(this.fields); }
  }
  const context = {
    document, window, navigator: {}, location: { protocol: 'https:' }, localStorage,
    FormData: FormDataShim,
    alert(message) { alerts.push(String(message)); },
    confirm() { return true; },
    prompt(message, fallback) { prompts.push(message); return fallback ?? '0'; },
    console: { log() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(source, context, { filename: 'pitchplay-inline.js' });

  function target(data) {
    return {
      dataset: data,
      parentElement: null,
      closest(selector) {
        if (selector === '[data-tab]' && data.tab !== undefined) return this;
        if (selector === '[data-theme]' && data.theme !== undefined) return this;
        if (selector === '[data-run]' && data.run !== undefined) return this;
        if (selector === '[data-extra]' && data.extra !== undefined) return this;
        if (selector === '[data-action]' && data.action !== undefined) return this;
        return null;
      }
    };
  }
  function click(data) {
    const event = { target: target(data), prevented: false, preventDefault() { this.prevented = true; } };
    for (const entry of (listeners.click || [])) entry.handler(event);
    return event;
  }
  function submit(form) {
    if (!form.classList) form.classList = { contains: () => false };
    if (!form.dataset) form.dataset = {};
    const event = { target: form, prevented: false, preventDefault() { this.prevented = true; } };
    for (const entry of (listeners.submit || [])) entry.handler(event);
    return event;
  }
  function changeBowler(value) {
    const t = target({});
    t.value = value;
    t.matches = selector => selector === '[data-bowler]';
    for (const entry of (listeners.change || [])) entry.handler({ target: t });
  }
  function data() {
    const raw = existingStorage.get('pitchplay-cricket-v3');
    return raw ? JSON.parse(raw) : null;
  }
  return { listeners, alerts, prompts, nodes, existingStorage, click, submit, changeBowler, data };
}

test('inline application JavaScript parses and has a startup status', () => {
  assert.doesNotThrow(() => new Function(source));
  const app = createHarness();
  assert.match(app.nodes['#app'].innerHTML, /Every run has a story|Live Scoring|Create your team/);
  assert.equal(app.nodes['#saveStatus'].textContent, 'Ready · Build 13');
});

test('all rendered action names are represented by the delegated action handler', () => {
  const names = [...new Set([...html.matchAll(/data-action=(?:\\?"|')([^"'\\]+)(?:\\?"|')/g)].map(m => m[1]))];
  const handled = new Set([...source.matchAll(/act===['"]([^'"]+)['"]/g)].map(m => m[1]));
  assert.ok(names.length >= 10, 'expected a meaningful set of interactive actions');
  assert.deepEqual(names.filter(name => !handled.has(name)), []);
});

test('team modal accepts typing, creates a squad, and player form persists', () => {
  const app = createHarness();
  app.click({ action: 'new-team' });
  assert.match(app.nodes['#app'].innerHTML, /id="teamForm"/);
  assert.equal(app.nodes['#teamNameInput'].focused, true);
  assert.equal(app.nodes['#newTeamName'].focused, true);

  app.submit({
    id: 'teamForm', fields: {
      name: 'Metro XI', short: 'MTX', color: '#236447',
      players: 'Alpha Batter\nBravo Batter\nCharlie Batter'
    }, reportValidity() { return true; }
  });
  let db = app.data();
  assert.equal(db.teams.length, 1);
  assert.equal(db.teams[0].name, 'Metro XI');
  assert.equal(db.teams[0].players.length, 3);
  assert.equal(app.nodes['#modalhost'].innerHTML, '');

  app.submit({
    id: '', dataset: { team: db.teams[0].id },
    classList: { contains(name) { return name === 'addPlayerForm'; } },
    fields: { playerName: 'Fourth Player', jersey: '14' }
  });
  db = app.data();
  assert.equal(db.teams[0].players.length, 4);
  assert.equal(db.teams[0].players[3].name, 'Fourth Player');
});

test('match setup, legal scoring, extras, undo, wickets, innings transition and chase are consistent', () => {
  const app = createHarness();
  app.click({ action: 'new-team' });
  app.submit({ id: 'teamForm', fields: { name: 'Metro XI', short: 'MTX', color: '#236447', players: 'Alpha\nBravo\nCharlie' }, reportValidity() { return true; } });
  app.click({ action: 'new-team' });
  app.submit({ id: 'teamForm', fields: { name: 'Harbor XI', short: 'HBX', color: '#173f75', players: 'Delta\nEcho\nFoxtrot' }, reportValidity() { return true; } });
  let db = app.data();
  const [a, b] = db.teams;
  app.submit({ id: 'matchForm', fields: { name: 'Smoke Test Final', teamA: a.id, teamB: b.id, format: 'T20', overs: '20', ballsPerOver: '6', maxBowlerOvers: '4', venue: '', umpires: '' } });
  db = app.data();
  assert.equal(db.matches.length, 1);
  assert.equal(db.matches[0].currentInnings, 0);

  app.click({ run: '4' });
  db = app.data();
  const firstBowler = db.matches[0].innings[0].bowlerId;
  app.changeBowler(db.teams[1].players[1].id);
  assert.equal(app.data().matches[0].innings[0].bowlerId, firstBowler, 'a bowler cannot change mid-over');
  assert.ok(app.alerts.some(message => /only after the over is complete/i.test(message)));
  assert.equal(db.matches[0].innings[0].total, 4);
  assert.equal(db.matches[0].innings[0].balls, 1);

  app.click({ extra: 'noBall' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].total, 5); // one penalty run; no legal ball added
  assert.equal(db.matches[0].innings[0].balls, 1);
  assert.equal(db.matches[0].innings[0].extras.noBall, 1);
  app.click({ action: 'undo' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].total, 4);

  app.click({ extra: 'wide' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].total, 5);
  assert.equal(db.matches[0].innings[0].balls, 1, 'a wide must not use a legal ball');
  assert.equal(db.matches[0].innings[0].extras.wide, 1);
  app.click({ action: 'undo' });
  assert.equal(app.data().matches[0].innings[0].total, 4);

  app.click({ extra: 'bye' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].total, 5);
  assert.equal(db.matches[0].innings[0].balls, 2, 'a bye is a legal delivery');
  assert.equal(db.matches[0].innings[0].extras.bye, 1);
  app.click({ action: 'undo' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].total, 4);
  assert.equal(db.matches[0].innings[0].balls, 1);

  for (let i = 0; i < 5; i++) app.click({ run: '1' });
  db = app.data();
  assert.equal(db.matches[0].innings[0].balls, 6);
  assert.equal(db.matches[0].innings[0].total, 9);

  app.changeBowler(db.teams[1].players[1].id);
  assert.equal(app.data().matches[0].innings[0].bowlerId, db.teams[1].players[1].id, 'a new bowler can be selected at the over boundary');
  app.click({ action: 'wicket' });
  const currentInning = app.data().matches[0].innings[0];
  const thirdPlayer = app.data().teams[0].players[2];
  app.submit({ id: 'wicketForm', fields: { type: 'Bowled', fielder: '', next: thirdPlayer.id } });
  db = app.data();
  assert.equal(db.matches[0].innings[0].wickets, 1);
  assert.equal(db.matches[0].innings[0].balls, 7);

  app.click({ action: 'end-innings' });
  db = app.data();
  assert.equal(db.matches[0].currentInnings, 1);
  assert.equal(db.matches[0].innings[1].target, db.matches[0].innings[0].total + 1);
  app.click({ run: '4' });
  app.click({ run: '6' });
  db = app.data();
  assert.equal(db.matches[0].status, 'completed');
  assert.ok(db.matches[0].completedAt);
  assert.match(db.matches[0].result, /won by .* wickets/);
  assert.equal(db.matches[0].innings.length, 2);
  app.click({ action: 'end-innings' });
  assert.equal(app.data().matches[0].innings.length, 2, 'a completed chase must not start a third innings');

  app.click({ action: 'undo' });
  db = app.data();
  assert.equal(db.matches[0].status, 'live');
  assert.equal(db.matches[0].result, undefined);
  assert.equal(db.matches[0].innings[1].total, 4);
  assert.equal(db.matches[0].innings[1].balls, 1);

  const reloaded = createHarness(app.existingStorage);
  assert.equal(reloaded.data().teams.length, 2);
  assert.equal(reloaded.data().matches[0].innings[1].total, 4);
  assert.match(reloaded.nodes['#app'].innerHTML, /Live Scoring|RUNS|overs/);
});

test('Test cricket can finish with the correct innings result', () => {
  const app = createHarness();
  app.click({ action: 'new-team' });
  app.submit({ id: 'teamForm', fields: { name: 'North XI', short: 'NRTH', color: '#236447', players: 'N1\nN2' }, reportValidity() { return true; } });
  app.click({ action: 'new-team' });
  app.submit({ id: 'teamForm', fields: { name: 'South XI', short: 'STH', color: '#173f75', players: 'S1\nS2' }, reportValidity() { return true; } });
  let db = app.data();
  app.submit({ id: 'matchForm', fields: { name: 'Test innings result', teamA: db.teams[0].id, teamB: db.teams[1].id, format: 'Test', overs: '20', ballsPerOver: '6', maxBowlerOvers: '4', venue: '', umpires: '' } });
  app.click({ action: 'end-innings' }); // North XI: 0
  app.click({ run: '1' });             // South XI: 1
  app.click({ action: 'end-innings' });
  app.click({ action: 'end-innings' }); // North XI second innings: 0
  db = app.data();
  assert.equal(db.matches[0].status, 'completed');
  assert.match(db.matches[0].result, /South XI won by an innings and 1 run/);
  assert.equal(db.matches[0].innings.length, 3, 'the fourth innings must not start when the match is already decided');
});
