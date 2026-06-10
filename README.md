# Markdown Export

Convert Markdown to **PDF, HTML, DOCX, RTF, EPUB, XML (DocBook), and PNG** — no system pandoc, wkhtmltopdf, or LaTeX required. Works in VS Code and VS Code-based editors (Cursor, Windsurf, Antigravity).

## Features

- Export to PDF, HTML, DOCX, RTF, EPUB, XML (DocBook), and PNG
- GitHub-Flavored Markdown: tables, task lists, strikethrough, footnotes
- Syntax-highlighted code blocks via Shiki
- KaTeX math (inline and block)
- Mermaid diagrams
- YAML front-matter for per-document setting overrides
- Auto table of contents (opt-in)
- Page-break directive: `<!-- pagebreak -->`
- Four built-in CSS themes (`github`, `academic`, `minimal`, `dark`) plus custom CSS
- One-click export from the status bar; right-click export from editor and explorer

## Usage

Open a Markdown file, then either:

- Run **Markdown Export: Export as PDF** (or any other format) from the command palette
- Right-click in the editor or on a `.md` file in the explorer and pick a format under **Export Markdown**
- Click the **Export** button in the status bar (format set by `mdExport.defaultExportFormat`)

### First run

The first PDF/PNG export downloads Chromium (~170 MB, one time) into the extension's storage. A progress notification shows the download. The cached binary is reused for all later exports.

## Settings

| Setting                          | Default        | Description                                             |
| -------------------------------- | -------------- | ------------------------------------------------------- |
| `mdExport.theme`                 | `github`       | Built-in CSS theme                                      |
| `mdExport.customCssPath`         | `""`           | Path to custom CSS (absolute or workspace-relative)     |
| `mdExport.defaultExportFormat`   | `pdf`          | Format used by the status-bar button                    |
| `mdExport.outputDirectory`       | `""` (beside)  | Output directory; empty = next to the .md file          |
| `mdExport.fileNameTemplate`      | `${basename}.${ext}` | Vars: `${basename}`, `${ext}`, `${date}`          |
| `mdExport.openAfterExport`       | `true`         | Open the exported file in default app on success        |
| `mdExport.pdf.format`            | `A4`           | A4 / Letter / Legal / A3 / A5                           |
| `mdExport.pdf.margin`            | 20mm all       | Object with top/right/bottom/left (CSS length strings)  |
| `mdExport.pdf.printBackground`   | `true`         | Print CSS backgrounds                                   |
| `mdExport.pdf.headerTemplate`    | `""`           | Puppeteer header HTML                                   |
| `mdExport.pdf.footerTemplate`    | Page X / Y     | Puppeteer footer HTML                                   |
| `mdExport.png.width`             | `1024`         | Viewport width for PNG rendering                        |
| `mdExport.png.deviceScaleFactor` | `2`            | Device pixel ratio for PNG rendering                    |
| `mdExport.shiki.theme`           | `github-light` | Any Shiki bundled theme name                            |
| `mdExport.mermaid.theme`         | `default`      | Mermaid diagram theme                                   |
| `mdExport.toc.enabled`           | `false`        | Insert auto-generated TOC                               |
| `mdExport.toc.depth`             | `3`            | Max heading depth in TOC                                |
| `mdExport.chromium.idleTimeoutMs`| `120000`       | Close headless browser after N ms idle                  |
| `mdExport.chromium.buildId`      | `""`           | Override pinned Chromium build                          |

## Front-matter

Per-document overrides via YAML front-matter:

```markdown
---
title: My Document
author: Jane Doe
theme: academic
pageSize: Letter
toc: true
tocDepth: 2
shikiTheme: github-dark
---

# My Document
```

Supported keys: `title`, `subtitle`, `author`, `date`, `description`, `keywords`, `lang`, `theme`, `customCssPath`, `pageSize`, `margin`, `printBackground`, `headerTemplate`, `footerTemplate`, `toc`, `tocDepth`, `shikiTheme`, `mermaidTheme`.

## License

[MIT](LICENSE)
