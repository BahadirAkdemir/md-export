import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportPdf } from '../exporters/pdf';
import { notifyExportSuccess } from './postExport';

export async function exportPdfCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to PDF…' },
    async () => {
      const out = await exportPdf(context, source);
      await notifyExportSuccess(out, 'PDF');
    },
  );
}
