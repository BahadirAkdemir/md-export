import * as path from 'node:path';
import * as vscode from 'vscode';
import JSZip from 'jszip';
import { convert } from 'xmlbuilder2';
import { buildDocxBytes } from './docx';
import { writeTextFile, ensureDir } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig } from '../config';

const PACKAGE_NS = 'http://schemas.microsoft.com/office/2006/xmlPackage';

interface ContentTypes {
  defaults: Map<string, string>;
  overrides: Map<string, string>;
}

export async function exportXml(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const docxBytes = await buildDocxBytes(context, sourceUri);
  const xml = await docxToFlatOpcXml(docxBytes);

  const outUri = resolveOutputPath(sourceUri, 'xml', config);
  await ensureDir(path.dirname(outUri.fsPath));
  await writeTextFile(outUri, xml);
  return outUri;
}

async function docxToFlatOpcXml(docxBytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(Buffer.from(docxBytes));
  const contentTypesPart = zip.file('[Content_Types].xml');
  if (!contentTypesPart) throw new Error('DOCX package is missing [Content_Types].xml');

  const contentTypesXml = await contentTypesPart.async('string');
  const contentTypes = parseContentTypes(contentTypesXml);
  const files = Object.values(zip.files)
    .filter((file) => !file.dir)
    .sort((a, b) => partPriority(a.name) - partPriority(b.name) || a.name.localeCompare(b.name));

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<pkg:package xmlns:pkg="${PACKAGE_NS}">`,
  ];

  for (const file of files) {
    const partName = `/${file.name}`;
    const contentType = contentTypeFor(partName, contentTypes);
    if (!contentType) continue;

    parts.push(
      `  <pkg:part pkg:name="${escapeXmlAttr(partName)}" pkg:contentType="${escapeXmlAttr(contentType)}" pkg:compression="store">`,
    );

    if (isXmlPart(file.name, contentType)) {
      const xml = stripXmlDeclaration(await file.async('string')).trim();
      parts.push('    <pkg:xmlData>');
      parts.push(indent(xml, 6));
      parts.push('    </pkg:xmlData>');
    } else {
      const data = await file.async('nodebuffer');
      parts.push('    <pkg:binaryData>');
      parts.push(wrapBase64(data.toString('base64'), 76, 6));
      parts.push('    </pkg:binaryData>');
    }

    parts.push('  </pkg:part>');
  }

  parts.push('</pkg:package>');
  return `${parts.join('\n')}\n`;
}

function parseContentTypes(xml: string): ContentTypes {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const object = convert(xml, { format: 'object' }) as any;
  const types = object.Types ?? {};
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();

  for (const item of toArray(types.Default)) {
    const ext = item['@Extension'];
    const contentType = item['@ContentType'];
    if (ext && contentType) defaults.set(String(ext).toLowerCase(), String(contentType));
  }

  for (const item of toArray(types.Override)) {
    const partName = item['@PartName'];
    const contentType = item['@ContentType'];
    if (partName && contentType) overrides.set(String(partName), String(contentType));
  }

  return { defaults, overrides };
}

function contentTypeFor(partName: string, types: ContentTypes): string | undefined {
  if (partName === '/[Content_Types].xml') {
    return 'application/vnd.openxmlformats-package.content-types+xml';
  }

  const override = types.overrides.get(partName);
  if (override) return override;

  const ext = path.extname(partName).replace(/^\./, '').toLowerCase();
  return types.defaults.get(ext);
}

function isXmlPart(name: string, contentType: string): boolean {
  return (
    name.endsWith('.xml') ||
    name.endsWith('.rels') ||
    /(?:\+xml|\/xml)$/i.test(contentType)
  );
}

function stripXmlDeclaration(xml: string): string {
  return xml.replace(/^\uFEFF/, '').replace(/^\s*<\?xml\b[^?]*\?>\s*/i, '');
}

function wrapBase64(value: string, width: number, spaces: number): string {
  const pad = ' '.repeat(spaces);
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += width) {
    lines.push(`${pad}${value.slice(i, i + width)}`);
  }
  return lines.join('\n');
}

function indent(value: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return value.split(/\r?\n/).map((line) => `${pad}${line}`).join('\n');
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArray(value: any): any[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function partPriority(name: string): number {
  if (name === '[Content_Types].xml') return 0;
  if (name === '_rels/.rels') return 1;
  if (name === 'word/document.xml') return 2;
  return 10;
}
