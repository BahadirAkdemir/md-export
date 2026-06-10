import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportDocx } from '../exporters/docx';
import { notifyExportSuccess } from './postExport';

export async function exportDocxCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to DOCX…' },
    async () => {
      const out = await exportDocx(context, source);
      await notifyExportSuccess(out, 'DOCX');
    },
  );
}
