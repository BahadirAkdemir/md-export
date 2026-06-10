import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportEpub } from '../exporters/epub';
import { notifyExportSuccess } from './postExport';

export async function exportEpubCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to EPUB…' },
    async () => {
      const out = await exportEpub(context, source);
      await notifyExportSuccess(out, 'EPUB');
    },
  );
}
