import * as path from 'node:path';
import * as vscode from 'vscode';
import { MdExportConfig, ExportFormat } from '../config';

export function resolveOutputPath(
  sourceUri: vscode.Uri,
  format: ExportFormat,
  config: MdExportConfig,
): vscode.Uri {
  const sourcePath = sourceUri.fsPath;
  const ext = formatExtension(format);
  const basename = path.basename(sourcePath, path.extname(sourcePath));
  const fileName = renderTemplate(config.fileNameTemplate, { basename, ext, date: dateStamp() });

  let dir: string;
  if (config.outputDirectory) {
    dir = path.isAbsolute(config.outputDirectory)
      ? config.outputDirectory
      : path.resolve(workspaceRoot(sourceUri) ?? path.dirname(sourcePath), config.outputDirectory);
  } else {
    dir = path.dirname(sourcePath);
  }

  return vscode.Uri.file(path.join(dir, fileName));
}

export function formatExtension(format: ExportFormat): string {
  switch (format) {
    case 'pdf':  return 'pdf';
    case 'html': return 'html';
    case 'docx': return 'docx';
    case 'rtf':  return 'rtf';
    case 'epub': return 'epub';
    case 'xml':  return 'xml';
    case 'png':  return 'png';
  }
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\$\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

function dateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function workspaceRoot(uri: vscode.Uri): string | undefined {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder?.uri.fsPath;
}

export function resolveCustomCss(customCssPath: string, sourceUri: vscode.Uri): string | undefined {
  if (!customCssPath) return undefined;
  if (path.isAbsolute(customCssPath)) return customCssPath;
  const root = workspaceRoot(sourceUri);
  return root ? path.resolve(root, customCssPath) : path.resolve(path.dirname(sourceUri.fsPath), customCssPath);
}
