import * as vscode from 'vscode';
import { visit } from 'unist-util-visit';
import type { Root, Element, RootContent } from 'hast';
import { withPage } from '../browser/browserPool';
import { log } from '../logger';

interface RasterizeOptions {
  context: vscode.ExtensionContext;
  /** Bitmap width target in CSS pixels (height auto). */
  width?: number;
}

interface PendingSvg {
  parent: { children: RootContent[] };
  index: number;
  svg: string;
}

/**
 * Rehype plugin used by DOCX/RTF exporters: rasterize Mermaid + KaTeX SVG to
 * PNG and replace the SVG node with an <img>. html-to-docx handles SVG poorly,
 * so we pre-render through the shared browser instead.
 */
export function rehypeSvgToPng(opts: RasterizeOptions) {
  return async (tree: Root): Promise<void> => {
    const pending: PendingSvg[] = [];

    visit(tree, (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (node.type !== 'element') return;
      const el = node as Element;

      // Case 1: Mermaid wrapper. The Mermaid plugin emits <div class="mermaid">
      // containing a raw SVG string (a `raw` node), which is then turned into
      // proper SVG by rehype-raw. After that pass, the div holds an <svg> child.
      const classes = Array.isArray(el.properties?.className) ? el.properties.className : [];
      const isMermaid = classes.some((c) => c === 'mermaid');
      if (isMermaid && el.tagName === 'div') {
        const svgString = serializeFirstSvg(el);
        if (svgString) {
          pending.push({ parent: parent as { children: RootContent[] }, index, svg: svgString });
        }
        return;
      }

      // Case 2: KaTeX. rehype-katex emits a <span class="katex"> containing
      // both MathML and HTML output. We rasterize the whole span (KaTeX HTML
      // is more reliable in DOCX than a raw SVG since KaTeX doesn't emit SVG
      // by default). Skip: leave KaTeX as inline HTML — html-to-docx handles
      // <span>s fine. Only Mermaid genuinely needs rasterization.
    });

    if (pending.length === 0) return;

    const svgs = pending.map((p) => p.svg);
    const widths = pending.map((p) => extractWidth(p.svg) ?? opts.width ?? 600);
    const pngs = await rasterize(opts.context, svgs, widths);

    for (let i = 0; i < pending.length; i++) {
      const png = pngs[i];
      if (!png) continue;
      const dataUrl = `data:image/png;base64,${png}`;
      const img: Element = {
        type: 'element',
        tagName: 'img',
        properties: { src: dataUrl, alt: 'Diagram' },
        children: [],
      };
      pending[i].parent.children[pending[i].index] = img as unknown as RootContent;
    }
  };
}

function serializeFirstSvg(el: Element): string | undefined {
  for (const child of el.children ?? []) {
    if ((child as Element).type === 'element' && (child as Element).tagName === 'svg') {
      return serialize(child as Element);
    }
    // After rehype-raw the SVG may have been re-parsed; recurse one level.
    if ((child as Element).type === 'element') {
      const inner = serializeFirstSvg(child as Element);
      if (inner) return inner;
    }
  }
  return undefined;
}

function serialize(node: Element): string {
  const attrs = Object.entries(node.properties ?? {})
    .filter(([_, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => {
      const name = htmlAttrName(k);
      const value = Array.isArray(v) ? v.join(' ') : String(v);
      return `${name}="${escapeAttr(value)}"`;
    })
    .join(' ');
  const open = attrs ? `<${node.tagName} ${attrs}>` : `<${node.tagName}>`;
  const inner = (node.children ?? [])
    .map((c) => {
      const ct = (c as { type: string }).type;
      if (ct === 'text') return escapeText((c as { value: string }).value);
      if (ct === 'element') return serialize(c as Element);
      if (ct === 'raw') return (c as { value: string }).value;
      return '';
    })
    .join('');
  return `${open}${inner}</${node.tagName}>`;
}

function htmlAttrName(key: string): string {
  if (key === 'className') return 'class';
  if (key === 'htmlFor') return 'for';
  return key;
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractWidth(svg: string): number | undefined {
  const m = svg.match(/width="([\d.]+)(?:px)?"/i);
  if (m) return Math.round(parseFloat(m[1]));
  const vb = svg.match(/viewBox="[^"]*?\s([\d.]+)\s+[\d.]+"/i);
  if (vb) return Math.round(parseFloat(vb[1]));
  return undefined;
}

async function rasterize(
  context: vscode.ExtensionContext,
  svgs: string[],
  widths: number[],
): Promise<(string | undefined)[]> {
  return withPage(context, async (page) => {
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;background:#fff;"></body></html>`,
      { waitUntil: 'load' },
    );
    const results: (string | undefined)[] = [];
    for (let i = 0; i < svgs.length; i++) {
      try {
        const dataUrl = await page.evaluate(
          async (svg: string, width: number): Promise<string | undefined> => {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'inline-block';
            wrapper.style.width = `${width}px`;
            wrapper.innerHTML = svg;
            document.body.appendChild(wrapper);
            const rect = wrapper.getBoundingClientRect();
            const scale = 2;
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(rect.width * scale);
            canvas.height = Math.ceil(rect.height * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) return undefined;
            const img = new Image();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
              img.onload = () => resolve(null);
              img.onerror = reject;
              img.src = url;
            });
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
            URL.revokeObjectURL(url);
            wrapper.remove();
            return canvas.toDataURL('image/png');
          },
          svgs[i],
          widths[i],
        );
        if (!dataUrl) {
          results.push(undefined);
          continue;
        }
        results.push(dataUrl.replace(/^data:image\/png;base64,/, ''));
      } catch (err) {
        log(`SVG rasterization failed: ${(err as Error).message}`);
        results.push(undefined);
      }
    }
    return results;
  });
}
