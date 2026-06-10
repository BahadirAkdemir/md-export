import * as path from 'node:path';
import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Element } from 'hast';
import { readBinaryFile, fileExists } from '../util/fs';
import { IMAGE_MIME, resolveLocalImagePath } from '../util/images';

interface Options {
  baseDir: string;
}

// Rehype plugin: rewrite local <img src> to data URIs so HTML/EPUB/DOCX outputs
// are self-contained. Remote URLs are left untouched.
export const rehypeInlineImages: Plugin<[Options], Root> = (opts) => {
  return async (tree) => {
    const tasks: Promise<void>[] = [];
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return;
      const src = node.properties?.src;
      if (typeof src !== 'string') return;
      if (/^(data:|https?:)/i.test(src)) return;

      tasks.push(
        (async () => {
          const abs = resolveLocalImagePath(src, opts.baseDir);
          if (!abs) return;
          if (!(await fileExists(abs))) return;
          const ext = path.extname(abs).toLowerCase();
          const mime = IMAGE_MIME[ext];
          if (!mime) return;
          const buf = await readBinaryFile(abs);
          const dataUrl =
            mime === 'image/svg+xml'
              ? `data:${mime};utf8,${encodeURIComponent(buf.toString('utf8'))}`
              : `data:${mime};base64,${buf.toString('base64')}`;
          node.properties = { ...node.properties, src: dataUrl };
        })(),
      );
    });
    await Promise.all(tasks);
  };
};
