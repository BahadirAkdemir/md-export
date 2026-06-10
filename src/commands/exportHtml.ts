import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportHtml } from '../exporters/html';
import { notifyExportSuccess } from './postExport';

export async function exportHtmlCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to HTML…' },
    async () => {
      const out = await exportHtml(context, source);
      await notifyExportSuccess(out, 'HTML');
    },
  );
}
