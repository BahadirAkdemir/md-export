import * as path from 'node:path';
import * as vscode from 'vscode';
import { install, computeExecutablePath, Browser, resolveBuildId, detectBrowserPlatform } from '@puppeteer/browsers';
import { ensureDir, fileExists } from '../util/fs';
import { log, logError } from '../logger';

// Default: resolve the current Chrome-for-Testing stable build at install time
// via @puppeteer/browsers' version-history endpoint. Override with a specific
// version string (e.g. "131.0.6778.204") via mdExport.chromium.buildId.
// Fallback used if version resolution fails (offline, endpoint outage).
const DEFAULT_CHANNEL = 'stable';
const FALLBACK_BUILD_ID = '131.0.6778.204';

interface ResolvedBrowser {
  executablePath: string;
  buildId: string;
}

let cached: ResolvedBrowser | undefined;

export async function ensureChromium(
  context: vscode.ExtensionContext,
  overrideBuildId: string,
): Promise<ResolvedBrowser> {
  if (cached) return cached;

  const cacheDir = path.join(context.globalStorageUri.fsPath, 'chromium');
  await ensureDir(cacheDir);

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error('Unsupported platform for headless Chrome download.');
  }

  // Channel name → resolve to a concrete build via @puppeteer/browsers.
  // Numeric version string → use as-is.
  let buildId = overrideBuildId.trim() || DEFAULT_CHANNEL;
  if (/^[a-z]+$/i.test(buildId)) {
    try {
      buildId = await resolveBuildId(Browser.CHROME, platform, buildId);
      log(`Resolved Chrome ${overrideBuildId.trim() || DEFAULT_CHANNEL} → ${buildId}`);
    } catch (err) {
      log(`Channel resolution failed (${(err as Error).message}); falling back to ${FALLBACK_BUILD_ID}`);
      buildId = FALLBACK_BUILD_ID;
    }
  }

  const executablePath = computeExecutablePath({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
  });

  if (await fileExists(executablePath)) {
    cached = { executablePath, buildId };
    return cached;
  }

  // Not installed yet — download with a progress notification.
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Markdown Export: downloading rendering engine (Chrome ${buildId})`,
      cancellable: false,
    },
    async (progress) => {
      let lastPct = -1;
      try {
        await install({
          browser: Browser.CHROME,
          buildId,
          cacheDir,
          downloadProgressCallback: (downloaded: number, total: number) => {
            if (!total) return;
            const pct = Math.floor((downloaded / total) * 100);
            if (pct === lastPct) return;
            progress.report({ increment: pct - Math.max(0, lastPct), message: `${pct}%` });
            lastPct = pct;
          },
        });
        log(`Chrome ${buildId} installed at ${executablePath}`);
      } catch (err) {
        logError(`Chrome ${buildId} install failed`, err);
        throw err;
      }
    },
  );

  cached = { executablePath, buildId };
  return cached;
}
