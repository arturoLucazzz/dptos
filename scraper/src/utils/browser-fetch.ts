/**
 * Browser-based fetch to bypass Cloudflare and other bot protections.
 * Uses Playwright to run requests in a real browser context.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';

const CHALLENGE_WAIT_MS = 12_000;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface BrowserSession {
  fetchJson<T = unknown>(url: string): Promise<T>;
  close(): Promise<void>;
}

/**
 * Create a browser session that has passed the origin site's protection (e.g. Cloudflare).
 * Call fetchJson() for API URLs; cookies from the origin visit will be sent.
 */
export async function createBrowserSession(originUrl: string): Promise<BrowserSession> {
  const browser: Browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
    ],
  });

  const context: BrowserContext = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  });

  // Visit origin first so Cloudflare challenge runs and cookies are set
  const page = await context.newPage();
  try {
    await page.goto(originUrl, {
      waitUntil: 'domcontentloaded',
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await new Promise((r) => setTimeout(r, CHALLENGE_WAIT_MS));
  } finally {
    await page.close();
  }

  return {
    async fetchJson<T = unknown>(url: string): Promise<T> {
      const response = await context.request.get(url, {
        headers: {
          Accept: 'application/json',
          Referer: `${originUrl}/`,
        },
        timeout: DEFAULT_TIMEOUT_MS,
      });

      if (!response.ok()) {
        const body = await response.text();
        throw new Error(
          `Browser fetch failed: ${response.status()} ${response.statusText()}. Body: ${body.slice(0, 500)}`
        );
      }

      return response.json() as Promise<T>;
    },

    async close(): Promise<void> {
      await context.close();
      await browser.close();
    },
  };
}
