/**
 * Browser loader interface and implementations (Playwright & Puppeteer).
 * Loads HTML from URLs using a real browser to bypass Cloudflare.
 *
 * The browser runs headed because Urbania's Cloudflare rule answers 403 to
 * headless Chromium and 200 to the same browser headed, regardless of channel.
 * Set SCRAPER_HEADLESS=1 to check whether that has changed. Running headed means
 * a run needs a logged-in GUI session.
 *
 * Channels are tried in order (installed Chrome first, then Playwright's
 * Chromium) so the machine does not need a Chrome install to work.
 *
 * Three other choices here are anti-detection, not preference:
 * - The user agent is never overridden. A declared Chrome/120 string on a browser
 *   whose real fingerprint says otherwise is itself a bot signal.
 * - Cookies are persisted between runs, so the challenge is solved once instead
 *   of every night.
 * - Images, fonts, media and analytics are aborted, which is also by far the
 *   biggest speedup available.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Browser, BrowserContext } from 'playwright';

const CHALLENGE_WAIT_MS = Number(process.env.CHALLENGE_WAIT_MS) || 15_000;
const DEFAULT_TIMEOUT_MS = Number(process.env.BROWSER_TIMEOUT_MS) || 45_000;
const STORAGE_STATE_PATH =
  process.env.STORAGE_STATE_PATH || path.join(process.cwd(), '.cache', 'urbania-storage-state.json');
const BLOCK_RESOURCES = process.env.BLOCK_RESOURCES !== '0';
const HEADLESS = process.env.SCRAPER_HEADLESS === '1';

/** Tried in order; `undefined` means Playwright's default Chromium build. */
const CHANNEL_CANDIDATES: Array<string | undefined> = process.env.PLAYWRIGHT_CHANNEL
  ? [process.env.PLAYWRIGHT_CHANNEL]
  : ['chrome', 'chromium', undefined];

export type BrowserEngine = 'playwright' | 'puppeteer';

export interface LoadResult {
  html: string;
  /** HTTP status of the navigation, or null when the browser reported none. */
  status: number | null;
  /** Final URL after redirects. */
  url: string;
}

export interface BrowserLoader {
  /** Load a URL and return the HTML plus the response status, without throwing on 4xx/5xx. */
  load(url: string): Promise<LoadResult>;
  close(): Promise<void>;
}

const BLOCKED_RESOURCE_TYPES = new Set(['image', 'font', 'media']);

const BLOCKED_HOST_PATTERNS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'googlesyndication.com',
  'facebook.net',
  'facebook.com/tr',
  'hotjar.com',
  'clarity.ms',
  'newrelic.com',
  'nr-data.net',
  'segment.com',
  'sentry.io',
  'branch.io',
  'criteo.',
  'taboola.com',
  'outbrain.com',
];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pattern) => url.includes(pattern));
}

async function readStorageState(): Promise<string | undefined> {
  try {
    await fs.access(STORAGE_STATE_PATH);
    return STORAGE_STATE_PATH;
  } catch {
    return undefined;
  }
}

async function writeStorageState(save: () => Promise<unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await save();
  } catch (error) {
    console.warn('Could not persist storage state:', error instanceof Error ? error.message : error);
  }
}

/**
 * Create a browser loader using Playwright, trying each channel until one gets
 * past the challenge on the origin.
 */
export async function createPlaywrightLoader(originUrl: string): Promise<BrowserLoader> {
  const { chromium } = await import('playwright');
  const storageState = await readStorageState();
  const failures: string[] = [];

  for (const channel of CHANNEL_CANDIDATES) {
    let browser;
    try {
      browser = await chromium.launch({
        headless: HEADLESS,
        channel,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });
    } catch (error) {
      failures.push(`${channel ?? 'default'}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
      continue;
    }

    const context = await browser.newContext({
      storageState,
      viewport: { width: 1920, height: 1080 },
      locale: 'es-PE',
      timezoneId: 'America/Lima',
    });

    if (BLOCK_RESOURCES) {
      await context.route('**/*', (route) => {
        const request = route.request();
        if (BLOCKED_RESOURCE_TYPES.has(request.resourceType()) || isBlockedUrl(request.url())) {
          return route.abort();
        }
        return route.continue();
      });
    }

    const page = await context.newPage();
    const goResponse = await page.goto(originUrl, {
      waitUntil: 'domcontentloaded',
      timeout: DEFAULT_TIMEOUT_MS,
    }).catch(() => null);

    if (!goResponse?.ok()) {
      failures.push(`${channel ?? 'default'}: HTTP ${goResponse?.status() ?? 'no response'}`);
      await context.close();
      await browser.close();
      continue;
    }

    console.log(`Browser: playwright channel=${channel ?? 'default'} headless=${HEADLESS}`);
    await new Promise((r) => setTimeout(r, CHALLENGE_WAIT_MS));
    await page.close();
    await writeStorageState(() => context.storageState({ path: STORAGE_STATE_PATH }));

    return makePlaywrightLoader(context, browser);
  }

  throw new Error(
    `Playwright could not reach ${originUrl}. Tried ${failures.join('; ')}. ` +
      (HEADLESS
        ? 'Headless Chromium gets 403 from Urbania; unset SCRAPER_HEADLESS to run headed.'
        : `Install Chrome with "pnpm exec playwright install chrome", or increase CHALLENGE_WAIT_MS (current: ${CHALLENGE_WAIT_MS}ms).`)
  );
}

function makePlaywrightLoader(context: BrowserContext, browser: Browser): BrowserLoader {
  return {
    async load(url: string): Promise<LoadResult> {
      const p = await context.newPage();
      try {
        const response = await p.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_TIMEOUT_MS,
        });
        return {
          html: await p.content(),
          status: response?.status() ?? null,
          url: p.url(),
        };
      } finally {
        await p.close();
      }
    },

    async close(): Promise<void> {
      await writeStorageState(() => context.storageState({ path: STORAGE_STATE_PATH }));
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Create a browser loader using Puppeteer.
 * Visits origin first to pass Cloudflare, then load() uses the same browser.
 */
export async function createPuppeteerLoader(originUrl: string): Promise<BrowserLoader> {
  const puppeteer = await import('puppeteer');

  const browser = await puppeteer.default.launch({
    headless: HEADLESS,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  async function newPage() {
    const p = await browser.newPage();
    await p.setViewport({ width: 1920, height: 1080 });
    if (BLOCK_RESOURCES) {
      await p.setRequestInterception(true);
      p.on('request', (request) => {
        if (BLOCKED_RESOURCE_TYPES.has(request.resourceType()) || isBlockedUrl(request.url())) {
          void request.abort();
        } else {
          void request.continue();
        }
      });
    }
    return p;
  }

  const page = await newPage();
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
    async load(url: string): Promise<LoadResult> {
      const p = await newPage();
      try {
        const response = await p.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: DEFAULT_TIMEOUT_MS,
        });
        return {
          html: await p.content(),
          status: response?.status() ?? null,
          url: p.url(),
        };
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
