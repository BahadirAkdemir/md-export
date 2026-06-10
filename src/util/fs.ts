import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function readTextFile(p: string): Promise<string> {
  return fs.readFile(p, 'utf8');
}

export async function readBinaryFile(p: string): Promise<Buffer> {
  return fs.readFile(p);
}

export async function writeTextFile(target: vscode.Uri, content: string): Promise<void> {
  await ensureDir(path.dirname(target.fsPath));
  await fs.writeFile(target.fsPath, content, 'utf8');
}

export async function writeBinaryFile(target: vscode.Uri, content: Uint8Array): Promise<void> {
  await ensureDir(path.dirname(target.fsPath));
  await fs.writeFile(target.fsPath, content);
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readMarkdownDocument(uri: vscode.Uri): Promise<string> {
  const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
  if (open) return open.getText();
  return fs.readFile(uri.fsPath, 'utf8');
}
