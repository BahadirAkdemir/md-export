import * as vscode from 'vscode';

/**
 * Resolve the .md file the user is acting on. Priority:
 *   1. URI passed by VS Code (right-click in editor/explorer)
 *   2. Active text editor, if it's a markdown document
 *   3. Prompt the user to pick a .md from the workspace
 */
export async function resolveMarkdownSource(maybeUri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (maybeUri && maybeUri.scheme === 'file') {
    if (maybeUri.fsPath.toLowerCase().endsWith('.md') || maybeUri.fsPath.toLowerCase().endsWith('.markdown')) {
      return maybeUri;
    }
  }

  const active = vscode.window.activeTextEditor;
  if (active && active.document.languageId === 'markdown') {
    return active.document.uri;
  }

  const picks = await vscode.workspace.findFiles('**/*.{md,markdown}', '**/node_modules/**', 50);
  if (picks.length === 0) {
    void vscode.window.showWarningMessage('Markdown Export: no Markdown files found.');
    return undefined;
  }
  const items: vscode.QuickPickItem[] = picks.map((u) => ({
    label: vscode.workspace.asRelativePath(u),
    description: u.fsPath,
  }));
  const chosen = await vscode.window.showQuickPick(items, {
    title: 'Markdown Export: pick a file to convert',
    matchOnDescription: true,
  });
  if (!chosen) return undefined;
  return picks.find((u) => vscode.workspace.asRelativePath(u) === chosen.label);
}
