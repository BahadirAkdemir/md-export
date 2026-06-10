import * as path from 'node:path';
import * as vscode from 'vscode';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type {
  Root,
  RootContent,
  Heading,
  Paragraph,
  Text,
  Emphasis,
  Strong,
  Delete,
  InlineCode,
  Link,
  Image,
  List,
  ListItem,
  Code,
  Blockquote,
  Table,
  TableRow,
  TableCell,
  Html,
} from 'mdast';

import { readMarkdownDocument, writeTextFile, ensureDir, readBinaryFile, fileExists } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';
import { splitFrontmatter, Frontmatter } from '../pipeline/frontmatter';
import { log } from '../logger';
import { imageDimensions, resolveLocalImagePath } from '../util/images';

/**
 * Write Markdown to RTF 1.9.1.
 *
 * Approach: walk the mdast tree directly, emit RTF control words into a buffer.
 * Coverage: headings (h1..h6), paragraphs, inline (strong/emphasis/delete/code/
 * link), lists (ul/ol, nested), tables (basic grid), code blocks (Courier mono),
 * blockquotes (indent), thematicBreak (horizontal line), pagebreak directive,
 * and local images embedded as hex \pict.
 *
 * Not in v1: Mermaid (left as code block w/ language tag), KaTeX (left as raw
 * $...$ text), footnotes (rendered inline).
 */
export async function exportRtf(
  _context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const source = await readMarkdownDocument(sourceUri);
  const { body, frontmatter } = splitFrontmatter(source);

  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as Root;

  const sourceDir = path.dirname(sourceUri.fsPath);
  const writer = new RtfWriter(sourceDir);
  await writer.document(tree, frontmatter);
  const rtf = writer.build();

  const outUri = resolveOutputPath(sourceUri, 'rtf', config);
  await ensureDir(path.dirname(outUri.fsPath));
  await writeTextFile(outUri, rtf);
  return outUri;
}

// Heading sizes in RTF half-points (so h1 = 72/2 = 36pt, h2 = 28pt, etc.).
// Font table is built inline in document(); control words reference \f0 (Times), \f1 (Courier).
const HEADING_HALFPT = [72, 56, 44, 36, 32, 28];

class RtfWriter {
  private parts: string[] = [];
  private listDepth = 0;
  private inTable = false;

  constructor(private sourceDir: string) {}

  async document(tree: Root, fm: Frontmatter): Promise<void> {
    this.emit('{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat');
    this.emit('{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fmodern\\fcharset0 Courier New;}{\\f2\\fswiss\\fcharset0 Helvetica;}}');
    this.emit('{\\colortbl ;\\red100\\green100\\blue100;\\red9\\green105\\blue218;}');
    this.emit('{\\*\\generator Markdown Export RTF v1;}');

    // Title page header (optional)
    if (fm.title) {
      this.emit('\\pard\\qc\\f0\\fs48\\b ');
      this.emitText(fm.title);
      this.emit('\\b0\\par');
      if (fm.author) {
        const author = Array.isArray(fm.author) ? fm.author.join(', ') : fm.author;
        this.emit('\\pard\\qc\\f0\\fs24 ');
        this.emitText(author);
        this.emit('\\par');
      }
      if (fm.date) {
        this.emit('\\pard\\qc\\f0\\fs22 ');
        this.emitText(fm.date);
        this.emit('\\par');
      }
      this.emit('\\par');
    }

    this.resetParagraph();
    await this.walkBlocks(tree.children);

    this.emit('}');
  }

  build(): string {
    return this.parts.join('');
  }

  // ---------- emission helpers ----------

  private emit(s: string): void {
    this.parts.push(s);
  }

  private emitText(s: string): void {
    this.parts.push(rtfEscape(s));
  }

  private resetParagraph(): void {
    this.emit('\\pard\\sa180\\sl276\\slmult1\\f0\\fs24 ');
  }

  // ---------- block walkers ----------

  private async walkBlocks(nodes: RootContent[]): Promise<void> {
    for (const node of nodes) {
      // eslint-disable-next-line no-await-in-loop
      await this.walkBlock(node);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async walkBlock(node: any): Promise<void> {
    switch (node.type) {
      case 'heading':
        await this.emitHeading(node as Heading);
        break;
      case 'paragraph':
        await this.emitParagraph(node as Paragraph);
        break;
      case 'list':
        await this.emitList(node as List);
        break;
      case 'code':
        this.emitCode(node as Code);
        break;
      case 'blockquote':
        await this.emitBlockquote(node as Blockquote);
        break;
      case 'thematicBreak':
        this.emit('\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par\\pard\\sa180 ');
        this.resetParagraph();
        break;
      case 'table':
        await this.emitTable(node as Table);
        break;
      case 'html':
        this.emitHtmlBlock(node as Html);
        break;
      case 'image':
        // eslint-disable-next-line no-await-in-loop
        await this.emitImageInline(node as Image);
        this.emit('\\par');
        break;
      default:
        // skip unknown block types
        break;
    }
  }

  private async emitHeading(h: Heading): Promise<void> {
    const halfPt = HEADING_HALFPT[Math.max(0, Math.min(5, h.depth - 1))];
    this.emit(`\\pard\\keepn\\sa180\\f0\\fs${halfPt}\\b `);
    await this.walkInline(h.children);
    this.emit('\\b0\\par');
    this.resetParagraph();
  }

  private async emitParagraph(p: Paragraph): Promise<void> {
    if (!this.inTable) this.resetParagraph();
    await this.walkInline(p.children);
    if (!this.inTable) this.emit('\\par');
  }

  private async emitList(list: List): Promise<void> {
    this.listDepth++;
    const indent = this.listDepth * 360;
    for (let i = 0; i < list.children.length; i++) {
      const item = list.children[i] as ListItem;
      const bullet = list.ordered ? `${(list.start ?? 1) + i}.` : '\\bullet';
      this.emit(`\\pard\\fi-360\\li${indent}\\sa120\\f0\\fs24 ${bullet}\\tab `);
      // If item has only a paragraph child, render inline. Otherwise walk blocks.
      if (item.children.length === 1 && item.children[0].type === 'paragraph') {
        // eslint-disable-next-line no-await-in-loop
        await this.walkInline((item.children[0] as Paragraph).children);
        this.emit('\\par');
      } else {
        this.emit('\\par');
        // eslint-disable-next-line no-await-in-loop
        await this.walkBlocks(item.children as RootContent[]);
      }
    }
    this.listDepth--;
    this.resetParagraph();
  }

  private emitCode(code: Code): void {
    this.emit('\\pard\\sa180\\f1\\fs20\\cf1 ');
    if (code.lang) {
      this.emit(`{\\i ${rtfEscape(code.lang)}}\\line `);
    }
    const lines = code.value.split('\n');
    for (let i = 0; i < lines.length; i++) {
      this.emit(rtfEscape(lines[i]));
      if (i < lines.length - 1) this.emit('\\line ');
    }
    this.emit('\\cf0\\par');
    this.resetParagraph();
  }

  private async emitBlockquote(bq: Blockquote): Promise<void> {
    this.emit('\\pard\\li720\\sa180\\f0\\fs24\\i ');
    // Walk inner blocks; preserve italic styling by emitting paragraphs flat.
    for (const child of bq.children) {
      if (child.type === 'paragraph') {
        // eslint-disable-next-line no-await-in-loop
        await this.walkInline((child as Paragraph).children);
        this.emit('\\par');
      } else {
        // eslint-disable-next-line no-await-in-loop
        await this.walkBlock(child);
      }
    }
    this.emit('\\i0 ');
    this.resetParagraph();
  }

  private async emitTable(table: Table): Promise<void> {
    this.inTable = true;
    const cols = table.children[0]?.children.length ?? 0;
    if (!cols) return;
    // Compute column boundaries — equal-width across 9000 twips (6.25in).
    const totalWidth = 9000;
    const cellWidth = Math.floor(totalWidth / cols);
    const cellBoundaries = Array.from({ length: cols }, (_, i) => cellWidth * (i + 1));

    for (let r = 0; r < table.children.length; r++) {
      const row = table.children[r] as TableRow;
      const isHeader = r === 0;

      this.emit('\\trowd\\trgaph100\\trleft0');
      for (const boundary of cellBoundaries) {
        this.emit(`\\clbrdrt\\brdrs\\brdrw10\\clbrdrb\\brdrs\\brdrw10\\clbrdrl\\brdrs\\brdrw10\\clbrdrr\\brdrs\\brdrw10\\cellx${boundary}`);
      }
      for (let c = 0; c < row.children.length; c++) {
        const cell = row.children[c] as TableCell;
        this.emit('\\pard\\intbl\\f0\\fs22 ');
        if (isHeader) this.emit('\\b ');
        // eslint-disable-next-line no-await-in-loop
        await this.walkInline(cell.children);
        if (isHeader) this.emit('\\b0');
        this.emit('\\cell ');
      }
      this.emit('\\row\n');
    }
    this.inTable = false;
    this.resetParagraph();
  }

  private emitHtmlBlock(html: Html): void {
    const raw = html.value.trim();
    if (/^<!--\s*(?:pagebreak|pb|page-break)\s*-->$/i.test(raw)) {
      this.emit('\\page ');
      return;
    }
    // Drop other raw HTML.
  }

  // ---------- inline walkers ----------

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async walkInline(nodes: any[]): Promise<void> {
    for (const node of nodes) {
      // eslint-disable-next-line no-await-in-loop
      await this.walkInlineNode(node);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async walkInlineNode(node: any): Promise<void> {
    switch (node.type) {
      case 'text':
        this.emitText((node as Text).value);
        break;
      case 'strong':
        this.emit('{\\b ');
        await this.walkInline((node as Strong).children);
        this.emit('}');
        break;
      case 'emphasis':
        this.emit('{\\i ');
        await this.walkInline((node as Emphasis).children);
        this.emit('}');
        break;
      case 'delete':
        this.emit('{\\strike ');
        await this.walkInline((node as Delete).children);
        this.emit('}');
        break;
      case 'inlineCode':
        this.emit('{\\f1\\cf1 ');
        this.emitText((node as InlineCode).value);
        this.emit('\\cf0\\f0}');
        break;
      case 'link': {
        const l = node as Link;
        // RTF \field/HYPERLINK pattern
        this.emit('{\\field{\\*\\fldinst HYPERLINK "');
        this.emitText(l.url);
        this.emit('"}{\\fldrslt {\\cf2\\ul ');
        await this.walkInline(l.children);
        this.emit('}}}');
        break;
      }
      case 'image':
        await this.emitImageInline(node as Image);
        break;
      case 'break':
        this.emit('\\line ');
        break;
      case 'html':
        // drop inline HTML
        break;
      case 'footnoteReference':
        // render footnote ref as superscript number
        this.emit('{\\super [');
        this.emitText(String(node.identifier ?? '?'));
        this.emit(']}');
        break;
      default:
        if (Array.isArray(node.children)) await this.walkInline(node.children);
        break;
    }
  }

  // ---------- image helper ----------

  private async emitImageInline(img: Image): Promise<void> {
    const url = img.url;
    if (!url) return;

    // Remote URLs aren't fetched in RTF v1 — substitute alt text.
    if (/^https?:/i.test(url) || /^data:/i.test(url)) {
      this.emit('[');
      this.emitText(img.alt ?? 'image');
      this.emit(']');
      return;
    }

    const abs = resolveLocalImagePath(url, this.sourceDir);
    if (!abs) {
      this.emit('[');
      this.emitText(img.alt ?? 'image');
      this.emit(']');
      return;
    }

    if (!(await fileExists(abs))) {
      log(`RTF: image not found at ${abs}; substituting alt text.`);
      this.emit('[');
      this.emitText(img.alt ?? path.basename(url));
      this.emit(']');
      return;
    }

    const ext = path.extname(abs).toLowerCase();
    const isPng = ext === '.png';
    const isJpg = ext === '.jpg' || ext === '.jpeg';
    if (!isPng && !isJpg) {
      // Other formats need conversion — skip for now.
      this.emit('[');
      this.emitText(img.alt ?? path.basename(url));
      this.emit(']');
      return;
    }

    const data = await readBinaryFile(abs);
    const hex = data.toString('hex');
    const blip = isPng ? '\\pngblip' : '\\jpegblip';
    const dimensions = imageDimensions(data, ext);
    if (dimensions) {
      const widthTwips = Math.round(dimensions.width * 15);
      const heightTwips = Math.round(dimensions.height * 15);
      this.emit(
        `{\\pict${blip}\\picw${dimensions.width}\\pich${dimensions.height}\\picwgoal${widthTwips}\\pichgoal${heightTwips} ${hex}}`,
      );
    } else {
      this.emit(`{\\pict${blip} ${hex}}`);
    }
  }
}

// ---------- RTF text escaping ----------

function rtfEscape(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === '\\' || ch === '{' || ch === '}') {
      out += '\\' + ch;
    } else if (code === 0x0a) {
      out += '\\line ';
    } else if (code === 0x0d) {
      // skip
    } else if (code < 0x80) {
      out += ch;
    } else if (code <= 0xffff) {
      // Unicode escape: \u<signed-16> ?
      const signed = code > 0x7fff ? code - 0x10000 : code;
      out += `\\u${signed}?`;
    } else {
      // Surrogate pair for code points outside BMP
      const adj = code - 0x10000;
      const high = 0xd800 + (adj >> 10);
      const low = 0xdc00 + (adj & 0x3ff);
      const hSigned = high > 0x7fff ? high - 0x10000 : high;
      const lSigned = low > 0x7fff ? low - 0x10000 : low;
      out += `\\u${hSigned}?\\u${lSigned}?`;
    }
  }
  return out;
}
