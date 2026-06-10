import * as vscode from 'vscode';
import { readConfig } from './config';

export function registerStatusBar(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

  const update = (editor: vscode.TextEditor | undefined) => {
    if (editor && editor.document.languageId === 'markdown') {
      const fmt = readConfig(editor.document.uri).defaultExportFormat.toUpperCase();
      item.text = `$(file-pdf) Export ${fmt}`;
      item.tooltip = `Markdown Export — quick export as ${fmt}. Configure default in mdExport.defaultExportFormat.`;
      item.command = commandForDefault(readConfig(editor.document.uri).defaultExportFormat);
      item.show();
    } else {
      item.hide();
    }
  };

  context.subscriptions.push(
    item,
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mdExport')) update(vscode.window.activeTextEditor);
    }),
  );
  update(vscode.window.activeTextEditor);
}

function commandForDefault(format: string): string {
  const map: Record<string, string> = {
    pdf:  'mdExport.exportPdf',
    html: 'mdExport.exportHtml',
    docx: 'mdExport.exportDocx',
    rtf:  'mdExport.exportRtf',
    epub: 'mdExport.exportEpub',
    xml:  'mdExport.exportXml',
    png:  'mdExport.exportPng',
  };
  return map[format] ?? 'mdExport.exportPdf';
}
