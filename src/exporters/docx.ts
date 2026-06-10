import * as path from 'node:path';
import * as vscode from 'vscode';
import JSZip from 'jszip';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import HTMLtoDOCX from 'html-to-docx';
import { buildHtml } from '../pipeline';
import { readMarkdownDocument, writeBinaryFile, ensureDir } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';
import { splitFrontmatter } from '../pipeline/frontmatter';

export async function exportDocx(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const bytes = await buildDocxBytes(context, sourceUri);
  const outUri = resolveOutputPath(sourceUri, 'docx', config);
  await ensureDir(path.dirname(outUri.fsPath));
  await writeBinaryFile(outUri, bytes);
  return outUri;
}

export async function buildDocxBytes(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<Uint8Array> {
  const config = readConfig(sourceUri);
  const source = await readMarkdownDocument(sourceUri);
  const { frontmatter } = splitFrontmatter(source);

  const { html } = await buildHtml(source, {
    context,
    sourceUri,
    config,
    inlineImages: true,
    renderMermaid: true,
    rasterizeSvgForDocx: true,
    autolinkHeadings: false,
  });

  const docOptions = {
    title: frontmatter.title ?? path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath)),
    creator: stringifyAuthor(frontmatter.author),
    pageNumber: true,
    pageSize: { width: 12240, height: 15840 }, // US Letter in twips; html-to-docx default
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 720, footer: 720, gutter: 0 },
    table: { row: { cantSplit: true } },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await (HTMLtoDOCX as any)(html, undefined, docOptions);

  // html-to-docx returns either a Buffer (node) or a Blob; normalize to Uint8Array.
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : typeof (buffer as Blob).arrayBuffer === 'function'
      ? new Uint8Array(await (buffer as Blob).arrayBuffer())
      : new Uint8Array(buffer as ArrayBuffer);

  return fixHeadingRunSizes(bytes);
}

function stringifyAuthor(author: string | string[] | undefined): string {
  if (!author) return 'Markdown Export';
  return Array.isArray(author) ? author.join(', ') : author;
}

async function fixHeadingRunSizes(bytes: Uint8Array): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(Buffer.from(bytes));
  const part = zip.file('word/document.xml');
  if (!part) return bytes;

  const xml = await part.async('string');
  const fixed = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!/<w:pStyle w:val="Heading[1-6]"\/>/.test(paragraph)) return paragraph;
    return paragraph
      .replace(/\s*<w:sz w:val="\d+"\/>/g, '')
      .replace(/\s*<w:szCs w:val="\d+"\/>/g, '');
  });

  if (fixed === xml) return bytes;
  zip.file('word/document.xml', fixed);
  const output = await zip.generateAsync({ type: 'nodebuffer' });
  return new Uint8Array(output);
}
