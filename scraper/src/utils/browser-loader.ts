/**
 * Browser loader interface and implementations (Playwright & Puppeteer).
 * Loads HTML from URLs using a real browser to bypass Cloudflare.
 *
 * Playwright defaults to using installed Chrome (better at passing Cloudflare).
 * Set PLAYWRIGHT_USE_CHROME=0 to use bundled Chromium instead.
 */

const CHALLENGE_WAIT_MS = Number(process.env.CHALLENGE_WAIT_MS) || 15_000;
const DEFAULT_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS) || 45_000;

export type BrowserEngine = 'playwright' | 'puppeteer';

export interface BrowserLoader {
  /** Load a URL and return the full HTML string */
  loadHtml(url: string): Promise<string>;
  close(): Promise<void>;
}

/**
 * Create a browser loader using Playwright.
 * Uses installed Chrome by default (passes Cloudflare better). Set PLAYWRIGHT_USE_CHROME=0 to use bundled Chromium.
 */
export async function createPlaywrightLoader(originUrl: string): Promise<BrowserLoader> {
  const { chromium } = await import('playwright');

  const useChrome = process.env.PLAYWRIGHT_USE_CHROME !== '0' && process.env.PLAYWRIGHT_USE_CHROME !== 'false';
  const browser = await chromium.launch({
    headless: true,
    channel: useChrome ? 'chrome' : undefined,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  });

  const page = await context.newPage();
  const goResponse = await page.goto(originUrl, {
    waitUntil: 'domcontentloaded',
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (!goResponse?.ok()) {
    await context.close();
    await browser.close();
    throw new Error(
      `Playwright: Cloudflare challenge failed (${goResponse?.status()}). Install Chrome and run "pnpm exec playwright install chrome", or try SCRAPER_ENGINE=puppeteer, or increase CHALLENGE_WAIT_MS (current: ${CHALLENGE_WAIT_MS}ms).`
    );
  }
  await new Promise((r) => setTimeout(r, CHALLENGE_WAIT_MS));
  await page.close();

  return {
    async loadHtml(url: string): Promise<string> {
      const p = await context.newPage();
      try {
        const response = await p.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_TIMEOUT_MS,
        });
        if (!response || !response.ok()) {
          throw new Error(`Playwright load failed: ${response?.status()} ${response?.statusText()}`);
        }
        return await p.content();
      } finally {
        await p.close();
      }
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Create a browser loader using Puppeteer.
 * Visits origin first to pass Cloudflare, then loadHtml() uses the same browser.
 */
export async function createPuppeteerLoader(originUrl: string): Promise<BrowserLoader> {
  const puppeteer = await import('puppeteer');

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1920, height: 1080 });
  const goResponse = await page.goto(originUrl, {
    waitUntil: 'domcontentloaded',
    timeout: DEFAULT_TIMEOUT_MS,
  });
  if (!goResponse?.ok()) {
    await browser.close();
    throw new Error(
      `Puppeteer: Cloudflare challenge failed (${goResponse?.status()}). Try SCRAPER_ENGINE=playwright (uses Chrome by default), or increase CHALLENGE_WAIT_MS (current: ${CHALLENGE_WAIT_MS}ms).`
    );
  }
  await new Promise((r) => setTimeout(r, CHALLENGE_WAIT_MS));
  await page.close();

  return {
    async loadHtml(url: string): Promise<string> {
      const p = await browser.newPage();
      try {
        await p.setUserAgent(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        const response = await p.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_TIMEOUT_MS,
        });
        if (!response || !response.ok()) {
          throw new Error(`Puppeteer load failed: ${response?.status()} ${response?.statusText()}`);
        }
        return await p.content();
      } finally {
        await p.close();
      }
    },

    async close(): Promise<void> {
      await browser.close();
    },
  };
}

/**
 * Create a browser loader with the specified engine.
 */
export async function createBrowserLoader(
  originUrl: string,
  engine: BrowserEngine = 'playwright'
): Promise<BrowserLoader> {
  if (engine === 'puppeteer') {
    return createPuppeteerLoader(originUrl);
  }
  return createPlaywrightLoader(originUrl);
}
