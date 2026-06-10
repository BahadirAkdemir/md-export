import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root, Element, RootContent } from 'hast';

// Rehype plugin: turn HTML comments matching `<!-- pagebreak -->` / `<!-- pb -->`
// (parsed by rehype-raw as `raw` nodes) into a <div class="page-break"></div>.
const PAGEBREAK_RE = /^<!--\s*(?:pagebreak|pb|page-break)\s*-->$/i;

export const rehypePagebreak: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, (node, index, parent) => {
      if (!parent || typeof index !== 'number') return;
      if (node.type !== 'raw') return;
      const raw = node as unknown as { type: 'raw'; value: string };
      if (!PAGEBREAK_RE.test(raw.value.trim())) return;
      const div: Element = {
        type: 'element',
        tagName: 'div',
        properties: { className: ['page-break'] },
        children: [],
      };
      (parent as { children: RootContent[] }).children[index] = div as unknown as RootContent;
    });
  };
};
