import * as path from 'node:path';
import * as vscode from 'vscode';
import { readTextFile, fileExists } from '../util/fs';

const BUILTIN_THEMES = new Set(['github', 'academic', 'minimal', 'dark']);

export async function loadThemeCss(
  context: vscode.ExtensionContext,
  themeName: string,
): Promise<string> {
  const safe = BUILTIN_THEMES.has(themeName) ? themeName : 'github';
  const themePath = path.join(context.extensionPath, 'media', 'themes', `${safe}.css`);
  if (await fileExists(themePath)) {
    return readTextFile(themePath);
  }
  return '';
}

export async function loadCustomCss(absPath: string | undefined): Promise<string> {
  if (!absPath) return '';
  if (await fileExists(absPath)) {
    return readTextFile(absPath);
  }
  return '';
}

export async function loadKatexCss(context: vscode.ExtensionContext): Promise<string> {
  const p = path.join(context.extensionPath, 'media', 'katex', 'katex.min.css');
  if (await fileExists(p)) {
    return readTextFile(p);
  }
  return '';
}

const PAGEBREAK_CSS = `
.page-break { page-break-after: always; break-after: page; height: 0; }
@media print { .page-break { page-break-after: always; break-after: page; } }
`;

export function pagebreakCss(): string {
  return PAGEBREAK_CSS;
}
