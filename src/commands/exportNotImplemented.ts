import * as vscode from 'vscode';

export function exportNotImplementedFactory(label: string, phase: string) {
  return async (): Promise<void> => {
    await vscode.window.showInformationMessage(
      `Markdown Export: ${label} is not implemented yet — coming in ${phase}.`,
    );
  };
}
