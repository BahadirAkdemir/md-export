import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportPng } from '../exporters/png';
import { notifyExportSuccess } from './postExport';

export async function exportPngCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to PNG…' },
    async () => {
      const out = await exportPng(context, source);
      await notifyExportSuccess(out, 'PNG');
    },
  );
}
