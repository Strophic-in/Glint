// Screenshots of the hero demo at fixed points of its pinned scroll, desktop + phone + reduced motion,
// plus a contrast and overflow check. Usage: node shots.mjs [url]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:5199/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function run(name, viewport, opts = {}) {
  mkdirSync(`lab/${name}`, { recursive: true });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const d = document.querySelector('.demo');
    const r = d.getBoundingClientRect();
    return { top: r.top + scrollY, h: r.height, vh: innerHeight, docW: document.documentElement.scrollWidth, w: innerWidth };
  });
  const stops = opts.reduced ? [0] : [0, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.95];
  for (const f of stops) {
    const y = info.top + f * Math.max(0, info.h - info.vh);
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(250);
    const state = await page.evaluate(() => ({
      mark: document.querySelector('.cap mark')?.textContent ?? null,
      asked: document.querySelector('.asked')?.textContent ?? null,
      status: document.querySelector('.status')?.textContent ?? null
    }));
    await page.screenshot({ path: `lab/${name}/p${String(Math.round(f * 100)).padStart(3, '0')}.png` });
    console.log(name, f, JSON.stringify(state));
  }
  // Rest of the page, in viewport-height steps.
  const full = await page.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = info.top + info.h; y < full && i < 14; y += info.vh, i++) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `lab/${name}/rest-${String(i).padStart(2, '0')}.png` });
  }
  console.log(name, 'horizontal overflow:', info.docW > info.w ? `${info.docW} > ${info.w}` : 'none', 'errors:', errors.length ? errors : 'none');
  await ctx.close();
}

await run('desktop', { width: 1440, height: 900 });
await run('mobile', { width: 390, height: 844 });
await run('reduced', { width: 1440, height: 900 }, { reduced: true });
await browser.close();
