import * as vscode from 'vscode';
import { buildHtml } from '../pipeline';
import { readMarkdownDocument, writeTextFile } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';

export async function exportHtml(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const source = await readMarkdownDocument(sourceUri);
  const { html } = await buildHtml(source, {
    context,
    sourceUri,
    config,
    inlineImages: true,
    renderMermaid: true,
  });
  const outUri = resolveOutputPath(sourceUri, 'html', config);
  await writeTextFile(outUri, html);
  return outUri;
}
