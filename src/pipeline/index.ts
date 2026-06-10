import * as path from 'node:path';
import * as vscode from 'vscode';
import { unified, Processor } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
// @ts-ignore — no types shipped
import rehypeToc from '@jsdevtools/rehype-toc';
import rehypeKatex from 'rehype-katex';
// @ts-ignore — types may not be present
import rehypeShiki from '@shikijs/rehype';
import rehypeDocument from 'rehype-document';
import rehypeStringify from 'rehype-stringify';
import juice from 'juice';

import { splitFrontmatter, Frontmatter } from './frontmatter';
import { rehypePagebreak } from './pagebreak';
import { rehypeInlineImages } from './inlineAssets';
import { rehypeMermaid } from './mermaid';
import { rehypeSvgToPng } from './svgToPngForDocx';
import { loadThemeCss, loadCustomCss, loadKatexCss, pagebreakCss } from './theme';
import { MdExportConfig } from '../config';
import { resolveCustomCss } from '../util/paths';
import { log } from '../logger';

export interface BuildHtmlOptions {
  context: vscode.ExtensionContext;
  sourceUri: vscode.Uri;
  config: MdExportConfig;
  inlineImages?: boolean;
  renderMermaid?: boolean;
  /** Convert inline SVG (e.g. rendered Mermaid) to PNG <img>. Use for DOCX/RTF. */
  rasterizeSvgForDocx?: boolean;
  /** Wrap headings in self-links. Disable for Word export because html-to-docx shrinks linked heading runs. */
  autolinkHeadings?: boolean;
  overrides?: Partial<Pick<MdExportConfig, 'theme' | 'tocEnabled' | 'tocDepth' | 'shikiTheme'>>;
}

export interface BuiltHtml {
  html: string;
  frontmatter: Frontmatter;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProcessor = Processor<any, any, any, any, any>;

export async function buildHtml(source: string, opts: BuildHtmlOptions): Promise<BuiltHtml> {
  const { frontmatter, body } = splitFrontmatter(source);
  const merged = mergeFrontmatter(opts.config, frontmatter, opts.overrides);

  const themeCss = await loadThemeCss(opts.context, merged.theme);
  const katexCss = await loadKatexCss(opts.context);
  const customAbs = resolveCustomCss(merged.customCssPath, opts.sourceUri);
  const customCss = await loadCustomCss(customAbs);
  const css = [katexCss, themeCss, pagebreakCss(), customCss].filter(Boolean).join('\n\n');

  const sourceDir = path.dirname(opts.sourceUri.fsPath);
  const title = merged.title ?? path.basename(opts.sourceUri.fsPath, path.extname(opts.sourceUri.fsPath));

  // Required stages first. Optional stages added through the cast processor
  // below; unified's strict types make per-conditional .use() chains painful,
  // so we widen once and push the rest imperatively.
  const proc: AnyProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypePagebreak)
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(safeShiki(merged.shikiTheme));

  if (opts.autolinkHeadings !== false) {
    proc.use(rehypeAutolinkHeadings, { behavior: 'wrap' });
  }

  if (merged.tocEnabled) {
    // rehype-toc lacks proper types; widen the call site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    proc.use(rehypeToc as any, { headings: tocHeadings(merged.tocDepth) });
  }
  if (opts.renderMermaid) {
    proc.use(rehypeMermaid, { context: opts.context, theme: opts.config.mermaidTheme });
  }
  if (opts.rasterizeSvgForDocx) {
    proc.use(rehypeSvgToPng, { context: opts.context });
  }
  if (opts.inlineImages !== false) {
    proc.use(rehypeInlineImages, { baseDir: sourceDir });
  }

  proc
    .use(rehypeDocument, {
      title,
      language: merged.lang ?? 'en',
      meta: buildMeta(merged),
      style: css,
    })
    .use(rehypeStringify, { allowDangerousHtml: true });

  const file = await proc.process(body);
  let html = String(file);

  try {
    html = juice(html, { preserveImportant: true, preserveMediaQueries: true });
  } catch (err) {
    log(`juice inlining failed (continuing with non-inlined HTML): ${(err as Error).message}`);
  }

  return { html, frontmatter };
}

/** Shiki may throw on unknown themes — wrap in a tolerant plugin factory. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeShiki(theme: string): any {
  return function shikiPluginWrapper() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inner = (rehypeShiki as any)({ themes: { light: theme, dark: theme }, defaultColor: 'light' });
      return inner;
    } catch (err) {
      log(`Shiki init failed (skipping highlighting): ${(err as Error).message}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (tree: any) => tree;
    }
  };
}

interface Merged {
  theme: 'github' | 'academic' | 'minimal' | 'dark';
  customCssPath: string;
  tocEnabled: boolean;
  tocDepth: number;
  shikiTheme: string;
  title?: string;
  lang?: string;
  description?: string;
  keywords?: string[];
  author?: string | string[];
  date?: string;
}

function mergeFrontmatter(
  cfg: MdExportConfig,
  fm: Frontmatter,
  overrides?: BuildHtmlOptions['overrides'],
): Merged {
  return {
    theme: overrides?.theme ?? (fm.theme as Merged['theme']) ?? cfg.theme,
    customCssPath: fm.customCssPath ?? cfg.customCssPath,
    tocEnabled: overrides?.tocEnabled ?? fm.toc ?? cfg.tocEnabled,
    tocDepth: overrides?.tocDepth ?? fm.tocDepth ?? cfg.tocDepth,
    shikiTheme: overrides?.shikiTheme ?? fm.shikiTheme ?? cfg.shikiTheme,
    title: fm.title,
    lang: fm.lang,
    description: fm.description,
    keywords: fm.keywords,
    author: fm.author,
    date: fm.date,
  };
}

function buildMeta(m: Merged): Array<Record<string, string>> {
  const meta: Array<Record<string, string>> = [];
  if (m.description) meta.push({ name: 'description', content: m.description });
  if (m.keywords?.length) meta.push({ name: 'keywords', content: m.keywords.join(', ') });
  if (m.author) {
    const author = Array.isArray(m.author) ? m.author.join(', ') : m.author;
    meta.push({ name: 'author', content: author });
  }
  return meta;
}

function tocHeadings(depth: number): string[] {
  const all = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  return all.slice(0, Math.max(1, Math.min(6, depth)));
}
