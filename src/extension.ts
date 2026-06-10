import * as vscode from 'vscode';
import { log, logError, getLogger, disposeLogger } from './logger';
import { registerStatusBar } from './statusBar';
import { exportPdfCommand } from './commands/exportPdf';
import { exportHtmlCommand } from './commands/exportHtml';
import { exportPngCommand } from './commands/exportPng';
import { exportEpubCommand } from './commands/exportEpub';
import { exportDocxCommand } from './commands/exportDocx';
import { exportXmlCommand } from './commands/exportXml';
import { exportRtfCommand } from './commands/exportRtf';
import { closeBrowser } from './browser/browserPool';

export function activate(context: vscode.ExtensionContext): void {
  getLogger(); // initialize output channel
  log('Markdown Export extension activated.');

  const register = (id: string, fn: (uri?: vscode.Uri) => unknown) =>
    context.subscriptions.push(
      vscode.commands.registerCommand(id, async (uri?: vscode.Uri) => {
        try {
          await fn(uri);
        } catch (err) {
          logError(`Command ${id} failed`, err);
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`Markdown Export: ${msg}`);
        }
      }),
    );

  register('mdExport.exportPdf',  (uri) => exportPdfCommand(context, uri));
  register('mdExport.exportHtml', (uri) => exportHtmlCommand(context, uri));
  register('mdExport.exportPng',  (uri) => exportPngCommand(context, uri));
  register('mdExport.exportEpub', (uri) => exportEpubCommand(context, uri));
  register('mdExport.exportDocx', (uri) => exportDocxCommand(context, uri));
  register('mdExport.exportXml',  (uri) => exportXmlCommand(context, uri));
  register('mdExport.exportRtf',  (uri) => exportRtfCommand(context, uri));

  registerStatusBar(context);
}

export async function deactivate(): Promise<void> {
  log('Markdown Export deactivating.');
  try {
    await closeBrowser();
  } catch (err) {
    logError('Failed to close headless browser on deactivate', err);
  }
  disposeLogger();
}
