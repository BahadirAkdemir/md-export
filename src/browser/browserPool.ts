import * as vscode from 'vscode';
import puppeteer, { Browser, Page } from 'puppeteer-core';
import { ensureChromium } from './install';
import { readConfig } from '../config';
import { log } from '../logger';

let currentBrowser: Browser | undefined;
let idleTimer: NodeJS.Timeout | undefined;

async function launch(context: vscode.ExtensionContext): Promise<Browser> {
  const cfg = readConfig();
  const { executablePath } = await ensureChromium(context, cfg.chromiumBuildId);

  log(`Launching headless Chromium: ${executablePath}`);
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  });
  browser.on('disconnected', () => {
    if (currentBrowser === browser) currentBrowser = undefined;
  });
  return browser;
}

export async function getBrowser(context: vscode.ExtensionContext): Promise<Browser> {
  resetIdleTimer(context);
  if (currentBrowser && currentBrowser.connected) return currentBrowser;
  currentBrowser = await launch(context);
  return currentBrowser;
}

export async function withPage<T>(
  context: vscode.ExtensionContext,
  fn: (page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getBrowser(context);
  const page = await browser.newPage();
  try {
    return await fn(page);
  } finally {
    try { await page.close(); } catch { /* swallow */ }
    resetIdleTimer(context);
  }
}

function resetIdleTimer(context: vscode.ExtensionContext): void {
  if (idleTimer) clearTimeout(idleTimer);
  const ms = readConfig().chromiumIdleTimeoutMs;
  if (ms <= 0) return;
  idleTimer = setTimeout(() => {
    log(`Closing headless browser after ${ms}ms idle.`);
    void closeBrowser();
  }, ms);
  context.subscriptions.push({ dispose: () => { if (idleTimer) clearTimeout(idleTimer); } });
}

export async function closeBrowser(): Promise<void> {
  const b = currentBrowser;
  currentBrowser = undefined;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  if (b) {
    try { await b.close(); } catch { /* swallow */ }
  }
}
