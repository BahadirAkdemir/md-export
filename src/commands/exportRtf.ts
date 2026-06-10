import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportRtf } from '../exporters/rtf';
import { notifyExportSuccess } from './postExport';

export async function exportRtfCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to RTF…' },
    async () => {
      const out = await exportRtf(context, source);
      await notifyExportSuccess(out, 'RTF');
    },
  );
}
