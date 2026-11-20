// Usage: node scripts/smoke-ui.mjs <baseUrl> <outDir>
// Opens each path in headless Chromium at desktop and phone size. Fails on page errors,
// console errors, or missing expected text; saves one screenshot per path and size.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [baseUrl = 'http://localhost:3100', outDir = '/tmp/dptos-smoke'] = process.argv.slice(2);

const PAGES = [
  { path: '/', texts: ['Inicio', 'Mis inversiones', 'Mercado', 'Supuestos: TEA', 'Recomendados'] },
  { path: '/departamentos', texts: ['Supuestos: TEA'] },
  { path: '/departamentos?tea=7&inicial=20', texts: ['Supuestos: TEA', 'supuestos del enlace'] },
];
const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const failures = [];

for (const size of SIZES) {
  for (const { path, texts } of PAGES) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    const label = `${path} @ ${size.name}`;
    page.on('pageerror', (e) => failures.push(`${label}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') failures.push(`${label}: console error: ${m.text()}`);
    });
    try {
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 60_000 });
      const body = await page.locator('body').innerText();
      for (const t of texts) {
        if (!body.includes(t)) failures.push(`${label}: missing text "${t}"`);
      }
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
    }
    const file = `${outDir}/${path === '/' ? 'inicio' : path.slice(1).replace(/[^a-z0-9]+/gi, '-')}-${size.name}.png`;
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    await context.close();
  }
}

await browser.close();
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
