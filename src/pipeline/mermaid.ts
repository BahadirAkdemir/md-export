import * as path from 'node:path';
import * as vscode from 'vscode';
import { visit } from 'unist-util-visit';
import type { Root, Element, RootContent } from 'hast';
import { pathToFileURL } from 'node:url';
import { withPage } from '../browser/browserPool';
import { fileExists } from '../util/fs';
import { log } from '../logger';

interface MermaidOptions {
  context: vscode.ExtensionContext;
  theme: 'default' | 'dark' | 'forest' | 'neutral';
}

interface PendingBlock {
  index: number;
  parent: { children: RootContent[] };
  source: string;
}

/**
 * Rehype plugin: replace ```mermaid fenced code blocks with rendered SVG.
 * Renders all blocks in one batched puppeteer page load.
 */
export function rehypeMermaid(opts: MermaidOptions) {
  return async (tree: Root): Promise<void> => {
    const pending: PendingBlock[] = [];

    visit(tree, 'element', (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (node.tagName !== 'pre') return;
      const codeChild = (node.children ?? []).find(
        (c): c is Element => (c as Element).type === 'element' && (c as Element).tagName === 'code',
      );
      if (!codeChild) return;
      const className = codeChild.properties?.className;
      const classes = Array.isArray(className) ? className : [];
      const isMermaid = classes.some((c) => typeof c === 'string' && /^language-mermaid$/i.test(c));
      if (!isMermaid) return;

      const source = textOf(codeChild).trim();
      if (!source) return;
      pending.push({ index, parent: parent as { children: RootContent[] }, source });
    });

    if (pending.length === 0) return;

    const mermaidPath = path.join(opts.context.extensionPath, 'media', 'mermaid', 'mermaid.min.js');
    if (!(await fileExists(mermaidPath))) {
      log(`Mermaid library missing at ${mermaidPath}; leaving blocks as code.`);
      return;
    }

    const sources = pending.map((p) => p.source);
    const svgs = await renderAll(opts.context, mermaidPath, opts.theme, sources);

    for (let i = 0; i < pending.length; i++) {
      const svg = svgs[i];
      const wrapper: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['mermaid'] },
        children: svg
          ? [{ type: 'raw', value: svg } as unknown as RootContent as Element]
          : [],
      };
      pending[i].parent.children[pending[i].index] = wrapper as unknown as RootContent;
    }
  };
}

function textOf(node: Element): string {
  return (node.children ?? [])
    .map((c) => {
      if ((c as { type: string }).type === 'text') return (c as { value: string }).value;
      if ((c as Element).type === 'element') return textOf(c as Element);
      return '';
    })
    .join('');
}

async function renderAll(
  context: vscode.ExtensionContext,
  mermaidPath: string,
  theme: string,
  sources: string[],
): Promise<(string | undefined)[]> {
  const mermaidUrl = pathToFileURL(mermaidPath).toString();
  return withPage(context, async (page) => {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8"><script src="${mermaidUrl}"></script></head><body></body></html>`,
      { waitUntil: 'networkidle0' },
    );
    const result = await page.evaluate(
      async (defs: string[], themeArg: string): Promise<(string | undefined)[]> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mermaid = (window as any).mermaid;
        mermaid.initialize({ startOnLoad: false, theme: themeArg, securityLevel: 'loose' });
        const out: (string | undefined)[] = [];
        for (let i = 0; i < defs.length; i++) {
          try {
            const { svg } = await mermaid.render(`mmd-${i}`, defs[i]);
            out.push(svg);
          } catch (err) {
            console.error('Mermaid render failed:', err);
            out.push(undefined);
          }
        }
        return out;
      },
      sources,
      theme,
    );
    return result;
  });
}
