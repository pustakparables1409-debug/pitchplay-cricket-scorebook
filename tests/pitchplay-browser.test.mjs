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
    const rel = path === '/' ? 'index.html' : path.replace(/^\\/+/, '');
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
  assert.match(await page.locator('#saveStatus').innerText(), /Build 16/);

  await page.locator('[data-action="new-team"]').click();
  await page.locator('#teamNameInput').fill('Metro XI');
  assert.equal(await page.locator('#teamNameInput').inputValue(), 'Metro XI');
  await page.locator('input[name="short"]').fill('MTX');
  await page.locator('input[name="color"]').evaluate(el => {
    el.value = '#c2185b';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.locator('textarea[name="players"]').fill('Alpha Batter\\nBravo Batter');
  await page.getByRole('button', { name:/Create team & squad/ }).click();
  const metro = page.locator('.teamcard').filter({ hasText:'Metro XI' });
  await metro.waitFor();
  assert.equal(await metro.locator('.teamstripe').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(194, 24, 91)');
  assert.equal(await metro.locator('.playerrow').count(), 2);

  await page.locator('#teamNameInput').fill('Harbor XI');
  await page.locator('input[name="short"]').fill('HBX');
  await page.locator('input[name="color"]').evaluate(el => {
    el.value = '#173f75';
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await page.locator('textarea[name="players"]').fill('Delta Batter\\nEcho Batter');
  await page.getByRole('button', { name:/Create team & squad/ }).click();
  const harbor = page.locator('.teamcard').filter({ hasText:'Harbor XI' });
  await harbor.waitFor();
  assert.equal(await page.locator('.teamcard').count(), 2);

  await metro.locator('input[name="playerName"]').fill('Third Batter');
  await metro.locator('input[name="jersey"]').fill('9');
  await metro.getByRole('button', { name:/Add player/ }).click();
  await metro.getByText('Third Batter').waitFor();

  await page.locator('[data-tab="matches"]').click();
  await page.locator('#matchForm').waitFor();
  await page.locator('#matchForm input[name="name"]').fill('Real Browser Final');
  await page.locator('#matchForm select[name="teamA"]').selectOption({ label:'Metro XI' });
  await page.locator('#matchForm select[name="teamB"]').selectOption({ label:'Harbor XI' });
  await page.locator('#matchForm button[type="submit"]').click();
  await page.getByText('Real Browser Final').waitFor();
  assert.deepEqual(pageErrors, []);
});
