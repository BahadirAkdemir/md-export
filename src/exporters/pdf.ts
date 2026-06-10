import * as path from 'node:path';
import * as vscode from 'vscode';
import { buildHtml } from '../pipeline';
import { readMarkdownDocument, writeBinaryFile, ensureDir } from '../util/fs';
import { resolveOutputPath } from '../util/paths';
import { readConfig, MdExportConfig, PdfMargin } from '../config';
import { splitFrontmatter, Frontmatter } from '../pipeline/frontmatter';
import { withPage } from '../browser/browserPool';
import { pathToFileURL } from 'node:url';

export async function exportPdf(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
): Promise<vscode.Uri> {
  const config = readConfig(sourceUri);
  const source = await readMarkdownDocument(sourceUri);

  const { frontmatter } = splitFrontmatter(source);
  const pdfOpts = resolvePdfOptions(config, frontmatter);

  const { html } = await buildHtml(source, {
    context,
    sourceUri,
    config,
    inlineImages: true,
    renderMermaid: true,
  });

  // Inject a <base> tag so relative images/fonts resolve via file://.
  const baseHref = pathToFileURL(path.dirname(sourceUri.fsPath) + path.sep).toString();
  const baseTag = `<base href="${baseHref}">`;
  const htmlWithBase = html.replace(/<head>/i, (m) => `${m}\n${baseTag}`);

  const outUri = resolveOutputPath(sourceUri, 'pdf', config);
  await ensureDir(path.dirname(outUri.fsPath));

  const pdfBytes = await withPage(context, async (page) => {
    await page.setContent(htmlWithBase, { waitUntil: 'networkidle0' });
    await page.emulateMediaType('print');
    return page.pdf({
      format: pdfOpts.format,
      margin: pdfOpts.margin,
      printBackground: pdfOpts.printBackground,
      displayHeaderFooter: !!(pdfOpts.headerTemplate || pdfOpts.footerTemplate),
      headerTemplate: pdfOpts.headerTemplate || '<span></span>',
      footerTemplate: pdfOpts.footerTemplate || '<span></span>',
      preferCSSPageSize: false,
    });
  });

  await writeBinaryFile(outUri, pdfBytes);
  return outUri;
}

interface ResolvedPdfOptions {
  format: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
  margin: PdfMargin;
  printBackground: boolean;
  headerTemplate: string;
  footerTemplate: string;
}

function resolvePdfOptions(cfg: MdExportConfig, fm: Frontmatter): ResolvedPdfOptions {
  return {
    format: (fm.pageSize as ResolvedPdfOptions['format']) ?? cfg.pdfFormat,
    margin: { ...cfg.pdfMargin, ...(fm.margin ?? {}) },
    printBackground: fm.printBackground ?? cfg.pdfPrintBackground,
    headerTemplate: fm.headerTemplate ?? cfg.pdfHeaderTemplate,
    footerTemplate: fm.footerTemplate ?? cfg.pdfFooterTemplate,
  };
}
