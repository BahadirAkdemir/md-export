import * as vscode from 'vscode';

export type ExportFormat = 'pdf' | 'html' | 'docx' | 'rtf' | 'epub' | 'xml' | 'png';

export interface PdfMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface MdExportConfig {
  theme: 'github' | 'academic' | 'minimal' | 'dark';
  customCssPath: string;
  defaultExportFormat: ExportFormat;
  outputDirectory: string;
  fileNameTemplate: string;
  openAfterExport: boolean;

  pdfFormat: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';
  pdfMargin: PdfMargin;
  pdfPrintBackground: boolean;
  pdfHeaderTemplate: string;
  pdfFooterTemplate: string;

  pngDeviceScaleFactor: number;
  pngWidth: number;

  tocEnabled: boolean;
  tocDepth: number;

  shikiTheme: string;
  mermaidTheme: 'default' | 'dark' | 'forest' | 'neutral';

  batchGlob: string;
  batchParallelism: number;

  previewScrollSync: boolean;

  chromiumBuildId: string;
  chromiumIdleTimeoutMs: number;
}

export function readConfig(scope?: vscode.ConfigurationScope): MdExportConfig {
  const c = vscode.workspace.getConfiguration('mdExport', scope);
  return {
    theme: c.get('theme', 'github'),
    customCssPath: c.get('customCssPath', ''),
    defaultExportFormat: c.get('defaultExportFormat', 'pdf'),
    outputDirectory: c.get('outputDirectory', ''),
    fileNameTemplate: c.get('fileNameTemplate', '${basename}.${ext}'),
    openAfterExport: c.get('openAfterExport', true),

    pdfFormat: c.get('pdf.format', 'A4'),
    pdfMargin: c.get('pdf.margin', { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' }),
    pdfPrintBackground: c.get('pdf.printBackground', true),
    pdfHeaderTemplate: c.get('pdf.headerTemplate', ''),
    pdfFooterTemplate: c.get('pdf.footerTemplate', ''),

    pngDeviceScaleFactor: c.get('png.deviceScaleFactor', 2),
    pngWidth: c.get('png.width', 1024),

    tocEnabled: c.get('toc.enabled', false),
    tocDepth: c.get('toc.depth', 3),

    shikiTheme: c.get('shiki.theme', 'github-light'),
    mermaidTheme: c.get('mermaid.theme', 'default'),

    batchGlob: c.get('batch.glob', '**/*.md'),
    batchParallelism: c.get('batch.parallelism', 4),

    previewScrollSync: c.get('preview.scrollSync', true),

    chromiumBuildId: c.get('chromium.buildId', ''),
    chromiumIdleTimeoutMs: c.get('chromium.idleTimeoutMs', 120_000),
  };
}
