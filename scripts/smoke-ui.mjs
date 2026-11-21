// Usage: node scripts/smoke-ui.mjs <baseUrl> <outDir>
// Opens each path in headless Chromium at desktop and phone size. Fails on page errors,
// console errors, or missing expected text; saves one screenshot per path and size.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [baseUrl = 'http://localhost:3100', outDir = '/tmp/dptos-smoke'] = process.argv.slice(2);

const PAGES = [
  { path: '/', texts: ['Inicio', 'Continuar', 'Mis inversiones', 'Mercado', 'Supuestos: TEA', 'Recomendados'] },
  { path: '/mercado', texts: ['Alquiler mensual vs precio de venta', 'Nuestras fuentes', 'Estudios', 'Voces del mercado', 'Noticias'] },
  { path: '/inversiones', texts: ['Mis inversiones', '+ Nueva inversión'] },
  { path: '/runs', texts: ['Corridas'] },
  { path: '/configuracion', texts: ['Configuración', 'Duplicados'] },
  { path: '/configuracion/duplicados', texts: ['Duplicados'] },
];
// Steps that click through from a page: open it, click the link, expect the texts on the next page.
const FLOWS = [
  // On a desktop the map starts open: wait for its canvas and a moment for tiles and pins.
  { name: 'inversion-workspace', from: '/inversiones', link: 'main a[href^="/inversiones/"]', texts: ['elegido'], desktopTexts: ['Comparar'], desktopWait: 'canvas.maplibregl-canvas' },
];
FLOWS.push({ name: 'inversion-comparar', from: '/inversiones', link: 'main a[href^="/inversiones/"]', then: '/comparar', texts: ['Comparar', 'Precio por m²', 'Rentabilidad bruta'] });
// Removed pages: a bookmarked old URL must answer 404 (the Next.js not-found page) with no page error.
const GONE = ['/departamentos', '/departamentos?tea=7&inicial=20', '/favoritos', '/zonas', '/estadisticas', '/alertas', '/agregar'];
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
  for (const path of GONE) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    const label = `${path} (gone) @ ${size.name}`;
    page.on('pageerror', (e) => failures.push(`${label}: page error: ${e.message}`));
    page.on('console', (m) => {
      // The browser logs the 404 document itself as a console error; any other error counts.
      if (m.type() === 'error' && !m.text().includes('Failed to load resource')) failures.push(`${label}: console error: ${m.text()}`);
    });
    try {
      const response = await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 60_000 });
      if (response?.status() !== 404) failures.push(`${label}: expected 404, got ${response?.status()}`);
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
    }
    await context.close();
  }
  for (const flow of FLOWS) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height } });
    const page = await context.newPage();
    const label = `${flow.name} @ ${size.name}`;
    page.on('pageerror', (e) => failures.push(`${label}: page error: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') failures.push(`${label}: console error: ${m.text()}`);
    });
    try {
      await page.goto(baseUrl + flow.from, { waitUntil: 'networkidle', timeout: 60_000 });
      if ((await page.locator(flow.link).count()) === 0) {
        // Skip only for a real empty state; a missing link on a page that has inversiones is a failure.
        if (await page.getByText('Todavía no tienes inversiones.').count()) {
          console.log(`skip: no hay inversiones (${label})`);
        } else {
          failures.push(`${label}: no inversion link and no empty-state text`);
        }
        await context.close();
        continue;
      }
      await page.locator(flow.link).first().click();
      await page.waitForURL((u) => u.pathname !== flow.from, { timeout: 60_000 });
      await page.waitForLoadState('networkidle', { timeout: 60_000 });
      if (flow.then) {
        await page.goto(page.url().replace(/\/$/, '') + flow.then, { waitUntil: 'networkidle', timeout: 60_000 });
      }
      if (flow.desktopWait && size.name === 'desktop') {
        await page.waitForSelector(flow.desktopWait, { timeout: 60_000 });
        await page.waitForTimeout(4_000);
      }
      const body = await page.locator('body').innerText();
      for (const t of [...flow.texts, ...(size.name === 'desktop' ? flow.desktopTexts ?? [] : [])]) {
        if (!body.includes(t)) failures.push(`${label}: missing text "${t}"`);
      }
    } catch (e) {
      failures.push(`${label}: ${e.message}`);
    }
    await page.screenshot({ path: `${outDir}/${flow.name}-${size.name}.png`, fullPage: false }).catch(() => {});
    await context.close();
  }
}

// Checks that act on a page: each gets a fresh desktop page and a fail(message) helper.
const CHECKS = [
  {
    name: 'top-bar',
    path: '/',
    async run(page, fail) {
      const links = await page.locator('header nav a').allInnerTexts();
      const want = ['Inicio', 'Mis inversiones', 'Mercado', 'Configuración', 'Corridas'];
      if (JSON.stringify(links.map((t) => t.trim())) !== JSON.stringify(want)) fail(`nav links ${JSON.stringify(links)}`);
      if (await page.locator('[aria-label="Más"]').count()) fail('the "Más" menu is still there');
    },
  },
  {
    name: 'pointer-cursor',
    path: '/',
    async run(page, fail) {
      const cursor = await page.locator('main button:not(:disabled)').first().evaluate((el) => getComputedStyle(el).cursor);
      if (cursor !== 'pointer') fail(`button cursor is ${cursor}`);
    },
  },
  {
    name: 'filters-from-url',
    path: '/?dorm_min=2&dorm_max=2',
    async run(page, fail) {
      const cards = page.locator('[style*="--cols"] > div');
      const before = await cards.allInnerTexts();
      if (before.length === 0) fail('no cards for 2 dorm');
      for (const t of before) if (!t.includes('2 dorm')) fail(`card outside the filter: ${t.split('\n').slice(0, 2).join(' ')}`);
      const more = page.getByRole('button', { name: 'Ver más' });
      if (await more.count()) {
        await more.click();
        await page.waitForFunction((n) => document.querySelectorAll('[style*="--cols"] > div').length > n, before.length, { timeout: 30_000 });
        for (const t of await cards.allInnerTexts()) if (!t.includes('2 dorm')) fail(`"Ver más" card outside the filter: ${t.split('\n').slice(0, 2).join(' ')}`);
      }
      if (!(await page.getByRole('button', { name: 'Limpiar filtros' }).count())) fail('no "Limpiar filtros" with a filter on');
    },
  },
  {
    name: 'filters-junk',
    path: '/?precio_min=abc&distrito=nowhere&dorm_min=-3',
    async run(page, fail) {
      const body = await page.locator('body').innerText();
      if (!body.includes('Recomendados')) fail('no "Recomendados"');
      if ((await page.locator('[style*="--cols"] > div').count()) === 0) fail('junk values hid every card');
    },
  },
  {
    name: 'filters-empty',
    path: '/?precio_min=999999999',
    async run(page, fail) {
      if (!(await page.getByText('Ningún departamento cumple estos filtros.').count())) fail('no empty-state text');
      const clear = page.getByRole('button', { name: 'Limpiar filtros' }).first();
      await clear.click();
      await page.waitForFunction(() => !location.search.includes('precio_min'), null, { timeout: 30_000 });
      await page.waitForSelector('[style*="--cols"] > div', { timeout: 30_000 });
    },
  },
];

for (const check of CHECKS) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const label = `check ${check.name}`;
  page.on('pageerror', (e) => failures.push(`${label}: page error: ${e.message}`));
  try {
    await page.goto(baseUrl + check.path, { waitUntil: 'networkidle', timeout: 60_000 });
    await check.run(page, (m) => failures.push(`${label}: ${m}`));
  } catch (e) {
    failures.push(`${label}: ${e.message}`);
  }
  await context.close();
}

await browser.close();
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('smoke ok');
