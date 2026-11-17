// Chromium is expensive and fragile: launching one per request meant every
// agreement generation spawned a full browser, and a browser that died took
// the API process down with it. One browser is kept alive and reused, renders
// run one at a time, and anything the browser throws stays inside this file.

import { Logger } from '@nestjs/common';

const logger = new Logger('PdfRenderer');

const PDF_TIMEOUT_MS = Number(process.env.PDF_TIMEOUT_MS) || 60_000;

type Browser = any;

let browserPromise: Promise<Browser> | null = null;
// Renders are chained onto this so only one page is open at a time.
let queue: Promise<unknown> = Promise.resolve();

async function launchBrowser(): Promise<Browser> {
  const puppeteerModule: any = await import('puppeteer');
  const puppeteer = puppeteerModule.default || puppeteerModule;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // /dev/shm is tiny in containers; without this Chromium dies mid-render.
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  // The child process emitting 'error' with no listener is an uncaught
  // exception, which is exactly how a failed render used to kill the server.
  browser.process()?.on('error', (err: Error) => {
    logger.error(`Chromium process error: ${err.message}`);
  });

  browser.on('disconnected', () => {
    logger.warn('Chromium disconnected; a new browser will be launched on the next render');
    browserPromise = null;
  });

  return browser;
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected !== false) return existing;
    } catch {
      // Fall through and launch a fresh one.
    }
    browserPromise = null;
  }

  const pending = launchBrowser();
  browserPromise = pending;
  pending.catch(() => {
    // A failed launch must not be cached, or every later render fails too.
    if (browserPromise === pending) browserPromise = null;
  });
  return pending;
}

async function render(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  let page: any;
  try {
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: PDF_TIMEOUT_MS });
    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: PDF_TIMEOUT_MS,
    });
    return Buffer.from(pdfBytes);
  } finally {
    if (page) await page.close().catch(() => undefined);
  }
}

/**
 * Render HTML to a PDF buffer. Renders are serialized, so a burst of requests
 * queues instead of starting a browser each.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const run = () => render(html);
  // Run whether or not the previous render succeeded.
  const result = queue.then(run, run);
  // Keep the chain alive: an unhandled rejection here would end the process.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Close the shared browser, e.g. on shutdown. */
export async function closePdfRenderer(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const browser = await pending;
    await browser.close();
  } catch (err) {
    logger.warn(`Could not close Chromium cleanly: ${(err as Error).message}`);
  }
}
