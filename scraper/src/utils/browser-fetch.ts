/**
 * A browser session for sites whose own pages call a JSON API.
 *
 * The session opens the origin in a real browser so the site's protection
 * (Cloudflare and the like) runs and sets its cookies. `postJson` then calls the
 * API from inside the page with the page's own `fetch`, so the request carries
 * the same cookies, referer and TLS fingerprint as the site's own calls.
 *
 * Headed by default, like the HTML loader: Urbania answers 403 to headless
 * Chromium. Set SCRAPER_HEADLESS=1 to try headless. The user agent is never
 * overridden, because a declared version that does not match the real browser
 * is itself a bot signal.
 */

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const CHALLENGE_WAIT_MS = Number(process.env.CHALLENGE_WAIT_MS) || 12_000;
const DEFAULT_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS) || 45_000;
const HEADLESS = process.env.SCRAPER_HEADLESS === '1';

/** Tried in order; `undefined` means Playwright's default Chromium build. */
const CHANNEL_CANDIDATES: Array<string | undefined> = process.env.PLAYWRIGHT_CHANNEL
  ? [process.env.PLAYWRIGHT_CHANNEL]
  : ['chrome', undefined];

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);

export interface OpenedPage {
  /** HTTP status of the navigation, or null when the browser reported none. */
  status: number | null;
  html: string;
}

export interface BrowserSession {
  fetchJson<T = unknown>(url: string): Promise<T>;
  /** POST a JSON body from inside the current page and parse the JSON answer. */
  postJson<T = unknown>(url: string, body: unknown): Promise<T>;
  /** Navigate the session's page, as a visitor would, and return the HTML it was served. */
  open(url: string): Promise<OpenedPage>;
  close(): Promise<void>;
}

/** Thrown when an API call answers with a non-2xx status. */
export class HttpStatusError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

async function launch(): Promise<Browser> {
  const failures: string[] = [];
  for (const channel of CHANNEL_CANDIDATES) {
    try {
      return await chromium.launch({
        headless: HEADLESS,
        channel,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (error) {
      failures.push(`${channel ?? 'default'}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
    }
  }
  throw new Error(`Could not launch a browser. Tried ${failures.join('; ')}`);
}

/**
 * Create a browser session that has passed the origin site's protection.
 * Throws when the origin does not answer 2xx.
 */
export async function createBrowserSession(originUrl: string): Promise<BrowserSession> {
  const browser = await launch();
  let context: BrowserContext;
  let page: Page;
  try {
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      locale: 'es-PE',
      timezoneId: 'America/Lima',
    });
    // Images and fonts are never read, and they are most of a search page's weight.
    await context.route('**/*', (route) =>
      BLOCKED_RESOURCE_TYPES.has(route.request().resourceType()) ? route.abort() : route.continue()
    );

    page = await context.newPage();
    const response = await page.goto(originUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    if (!response?.ok()) {
      throw new Error(
        `${originUrl} answered ${response?.status() ?? 'nothing'}` +
          (HEADLESS ? ' (headless; unset SCRAPER_HEADLESS to run headed)' : '')
      );
    }
    // Let a challenge, if any, finish by itself and set its cookies.
    await page.waitForTimeout(CHALLENGE_WAIT_MS);
  } catch (error) {
    await browser.close();
    throw error;
  }

  return {
    async fetchJson<T = unknown>(url: string): Promise<T> {
      const response = await context.request.get(url, {
        headers: { Accept: 'application/json', Referer: `${originUrl}/` },
        timeout: DEFAULT_TIMEOUT_MS,
      });
      if (!response.ok()) {
        const body = await response.text();
        throw new HttpStatusError(
          response.status(),
          `Browser fetch failed: ${response.status()} ${response.statusText()}. Body: ${body.slice(0, 500)}`
        );
      }
      return response.json() as Promise<T>;
    },

    async postJson<T = unknown>(url: string, body: unknown): Promise<T> {
      const result = await page.evaluate(
        async ({ url, payload, timeoutMs }) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/plain, */*',
                'x-requested-with': 'XMLHttpRequest',
              },
              body: payload,
              signal: controller.signal,
            });
            return { status: response.status, text: await response.text() };
          } finally {
            clearTimeout(timer);
          }
        },
        { url, payload: JSON.stringify(body), timeoutMs: DEFAULT_TIMEOUT_MS }
      );

      if (result.status < 200 || result.status >= 300) {
        throw new HttpStatusError(
          result.status,
          `POST ${url} answered ${result.status}. Body: ${result.text.slice(0, 300)}`
        );
      }
      try {
        return JSON.parse(result.text) as T;
      } catch {
        throw new Error(`POST ${url} answered ${result.status} with a body that is not JSON: ${result.text.slice(0, 300)}`);
      }
    },

    async open(url: string): Promise<OpenedPage> {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
      // The HTML as served: the page's scripts remove the embedded state from the
      // live DOM once they have read it.
      const html = (await response?.text().catch(() => null)) ?? (await page.content());
      return { status: response?.status() ?? null, html };
    },

    async close(): Promise<void> {
      await context.close().catch(() => {});
      await browser.close();
    },
  };
}
