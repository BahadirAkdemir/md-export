import * as vscode from 'vscode';
import { resolveMarkdownSource } from './resolveSource';
import { exportXml } from '../exporters/xml';
import { notifyExportSuccess } from './postExport';

export async function exportXmlCommand(
  context: vscode.ExtensionContext,
  uri?: vscode.Uri,
): Promise<void> {
  const source = await resolveMarkdownSource(uri);
  if (!source) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to XML (DocBook)…' },
    async () => {
      const out = await exportXml(context, source);
      await notifyExportSuccess(out, 'XML (DocBook)');
    },
  );
}
