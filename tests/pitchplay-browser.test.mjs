import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.css':'text/css' };

test('real Chromium can type, change team colour, save teams/players, and start a match', async t => {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = path === '/' ? 'index.html' : (path.startsWith('/') ? path.slice(1) : path);
    const file = resolve(root, rel);
    if (!(file === root || file.startsWith(root + sep)) || !existsSync(file)) {
      res.writeHead(404); res.end('Not found'); return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store' });
    res.end(readFileSync(file));
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => new Promise(resolveClose => server.close(resolveClose)));

  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil:'networkidle' });
  assert.match(await page.locator('#saveStatus').innerText(), /Build 22/);

  await page.locator('.welcome-actions [data-action="new-team"]').click();
  await page.waitForSelector('#teamNameInput', { timeout: 5000 }).catch(async () => {
    throw new Error('Team entry screen did not render. App text: ' + (await page.locator('#app').innerText()) + ' Page errors: ' + pageErrors.join(' | '));
  });
  const teamNameInput = page.locator('#teamNameInput');
  await teamNameInput.evaluate(el => {
    window.__originalTeamNameInput = el;
    window.__inputDebug = [];
    window.__focusEvents = [];
    for (const type of ['pointerdown','mousedown','click','focusin','focusout','keydown','keyup','input']) {
      document.addEventListener(type, ev => window.__focusEvents.push({ type, target:ev.target && ev.target.id, active:document.activeElement && document.activeElement.id, defaultPrevented:ev.defaultPrevented }), true);
    }
    document.addEventListener('input', ev => window.__inputDebug.push({ id:ev.target.id, value:ev.target.value, active:document.activeElement && document.activeElement.id, same:ev.target===window.__originalTeamNameInput }), true);
  });
  await teamNameInput.click();
  const focusState = await teamNameInput.evaluate(el => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    const cs = getComputedStyle(el);
    return { focused:document.activeElement===el, activeId:document.activeElement&&document.activeElement.id,
      disabled:el.disabled, readOnly:el.readOnly, pointerEvents:cs.pointerEvents, visibility:cs.visibility,
      display:cs.display, opacity:cs.opacity, rect:{x:r.x,y:r.y,w:r.width,h:r.height},
      hitTag:hit&&hit.tagName, hitId:hit&&hit.id, hitClass:hit&&hit.className, outerHTML:el.outerHTML };
  });
  if (!focusState.focused) throw new Error('Team name click did not focus input: '+JSON.stringify({focusState,events:await teamNameInput.evaluate(()=>window.__focusEvents),pageErrors,appText:await page.locator('#app').innerText()}));
  await page.keyboard.type('Metro XI');
  const typingState = await teamNameInput.evaluate(el => ({
    value: el.value,
    focused: document.activeElement === el,
    activeId: document.activeElement && document.activeElement.id,
    disabled: el.disabled,
    readOnly: el.readOnly,
    outerHTML: el.outerHTML,
    sameElement: el === window.__originalTeamNameInput,
    inputEvents: window.__inputDebug
  }));
  assert.equal(typingState.value, 'Metro XI', JSON.stringify({ typingState, pageErrors, appText: await page.locator('#app').innerText() }));
  await page.locator('input[name="short"]').fill('MTX');
  await page.locator('input[name="color"]').evaluate(el => {
    el.value = '#c2185b';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.locator('textarea[name="players"]').fill('Alpha Batter\nBravo Batter');
  await page.getByRole('button', { name:/Create team & squad/ }).click();
  const metro = page.locator('.teamcard').filter({ hasText:'Metro XI' });
  await metro.waitFor();
  assert.equal(await metro.locator('.teamstripe').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(194, 24, 91)');
  assert.equal(await metro.locator('.playerrow').count(), 2);
  await metro.locator('input[data-team-color]').evaluate(el => {
    el.value = '#1b7f3a';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  });
  assert.equal(await metro.locator('.teamstripe').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(27, 127, 58)');
  assert.match(await page.locator('#saveStatus').innerText(), /Team colour saved: Metro XI/);

  await page.locator('#teamNameInput').fill('Harbor XI');
  await page.locator('input[name="short"]').fill('HBX');
  await page.locator('input[name="color"]').evaluate(el => {
    el.value = '#173f75';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.locator('textarea[name="players"]').fill('Delta Batter\nEcho Batter');
  await page.getByRole('button', { name:/Create team & squad/ }).click();
  const harbor = page.locator('.teamcard').filter({ hasText:'Harbor XI' });
  await harbor.waitFor();
  assert.equal(await page.locator('.teamcard').count(), 2);

  await metro.locator('input[name="playerName"]').fill('Third Batter');
  await metro.locator('input[name="jersey"]').fill('9');
  await metro.getByRole('button', { name:/Add player/ }).click();
  await metro.locator('.playerrow .playername').filter({ hasText:/^Third Batter$/ }).waitFor();

  await page.locator('.nav [data-tab="matches"]').click();
  await page.locator('#matchForm').waitFor();
  await page.locator('#matchForm input[name="name"]').fill('Real Browser Final');
  await page.locator('#matchForm select[name="teamA"]').selectOption({ label:'Metro XI' });
  await page.locator('#matchForm select[name="teamB"]').selectOption({ label:'Harbor XI' });
  await page.locator('#matchForm button[type="submit"]').click();
  await page.getByText('Real Browser Final').waitFor();
  assert.deepEqual(pageErrors, []);
});
