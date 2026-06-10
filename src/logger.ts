import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getLogger(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Markdown Export');
  }
  return channel;
}

export function log(message: string): void {
  const c = getLogger();
  const ts = new Date().toISOString();
  c.appendLine(`[${ts}] ${message}`);
}

export function logError(message: string, err: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  log(`ERROR: ${message}\n${detail}`);
}

export function disposeLogger(): void {
  channel?.dispose();
  channel = undefined;
}
