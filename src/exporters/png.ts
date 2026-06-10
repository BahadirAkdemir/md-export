import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildHtml } from '../pipeline';
import { readMarkdownDocument, writeBinaryFile, ensureDir } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';
import { withPage } from '../browser/browserPool';
import { pathToFileURL } from 'node:url';

export async function exportPng(
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

  const baseHref = pathToFileURL(path.dirname(sourceUri.fsPath) + path.sep).toString();
  const htmlWithBase = html.replace(/<head>/i, (m) => `${m}\n<base href="${baseHref}">`);

  const outUri = resolveOutputPath(sourceUri, 'png', config);
  await ensureDir(path.dirname(outUri.fsPath));

  const pngBytes = await withPage(context, async (page) => {
    await page.setViewport({
      width: config.pngWidth,
      height: 800,
      deviceScaleFactor: config.pngDeviceScaleFactor,
    });
    await page.setContent(htmlWithBase, { waitUntil: 'networkidle0' });
    return page.screenshot({ type: 'png', fullPage: true });
  });

  await writeBinaryFile(outUri, pngBytes);
  return outUri;
}
