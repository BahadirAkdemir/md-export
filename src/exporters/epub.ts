import * as vscode from 'vscode';
import { EPub } from '@lesjoursfr/html-to-epub';
import { buildHtml } from '../pipeline';
import { readMarkdownDocument, ensureDir } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';
import { splitFrontmatter } from '../pipeline/frontmatter';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileExists } from '../util/fs';
import { resolveLocalImagePath } from '../util/images';

export async function exportEpub(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const source = await readMarkdownDocument(sourceUri);
  const { frontmatter } = splitFrontmatter(source);

  const { html } = await buildHtml(source, {
    context,
    sourceUri,
    config,
    inlineImages: false,
    renderMermaid: true,
  });

  const sanitized = await rewriteLocalImagesForEpub(sanitizeForEpub(html), path.dirname(sourceUri.fsPath));
  const bodyOnly = extractBody(sanitized);
  const inlineCss = extractStyleBlocks(sanitized);

  const basename = path.basename(sourceUri.fsPath, path.extname(sourceUri.fsPath));
  const title = frontmatter.title ?? basename;
  const author = normalizeAuthor(frontmatter.author);

  const outUri = resolveOutputPath(sourceUri, 'epub', config);
  await ensureDir(path.dirname(outUri.fsPath));

  const epub = new EPub(
    {
      title,
      description: frontmatter.description ?? title,
      author,
      publisher: 'Markdown Export',
      lang: frontmatter.lang ?? 'en',
      date: frontmatter.date,
      tocTitle: 'Table of Contents',
      appendChapterTitles: false,
      hideToC: false,
      verbose: false,
      version: 3,
      css: inlineCss,
      content: [
        {
          title,
          data: bodyOnly,
          author,
        },
      ],
    },
    outUri.fsPath,
  );

  await epub.render();
  return outUri;
}

function sanitizeForEpub(html: string): string {
  // EPUB readers choke on <script> and some inline event handlers.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+="[^"]*"/gi, '');
}

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

function extractStyleBlocks(html: string): string {
  const matches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)];
  return matches.map((m) => m[1]).join('\n\n');
}

async function rewriteLocalImagesForEpub(html: string, sourceDir: string): Promise<string> {
  const replacements = new Map<string, string>();
  const matches = [...html.matchAll(/\s(src)=("([^"]*)"|'([^']*)')/gi)];

  await Promise.all(
    matches.map(async (match) => {
      const raw = match[0];
      const src = match[3] ?? match[4] ?? '';
      if (!src || replacements.has(raw) || /^(?:data:|https?:)/i.test(src)) return;

      const abs = resolveLocalImagePath(src, sourceDir);
      if (!abs || !(await fileExists(abs))) return;

      const quote = match[2].startsWith("'") ? "'" : '"';
      const fileUrl = pathToFileURL(abs).toString();
      replacements.set(raw, ` src=${quote}${escapeHtmlAttr(fileUrl)}${quote}`);
    }),
  );

  let rewritten = html;
  for (const [from, to] of replacements) {
    rewritten = rewritten.split(from).join(to);
  }
  return rewritten;
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeAuthor(author: string | string[] | undefined): string[] {
  if (!author) return ['Unknown'];
  return Array.isArray(author) ? author : [author];
}
