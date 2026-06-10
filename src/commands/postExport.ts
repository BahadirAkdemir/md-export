import * as vscode from 'vscode';
import { readConfig } from '../config';

export async function notifyExportSuccess(outUri: vscode.Uri, formatLabel: string): Promise<void> {
  const cfg = readConfig(outUri);
  const rel = vscode.workspace.asRelativePath(outUri);

  if (cfg.openAfterExport) {
    void vscode.env.openExternal(outUri);
    void vscode.window.showInformationMessage(
      `Markdown Export: ${formatLabel} saved to ${rel}`,
      'Reveal',
    ).then((choice) => {
      if (choice === 'Reveal') void vscode.commands.executeCommand('revealFileInOS', outUri);
    });
    return;
  }

  const action = await vscode.window.showInformationMessage(
    `Markdown Export: ${formatLabel} saved to ${rel}`,
    'Open',
    'Reveal',
  );
  if (action === 'Open') {
    await vscode.env.openExternal(outUri);
  } else if (action === 'Reveal') {
    await vscode.commands.executeCommand('revealFileInOS', outUri);
  }
}
