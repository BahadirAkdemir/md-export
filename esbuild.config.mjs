import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const watch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  define: {
    'import.meta.url': 'importMetaUrl',
  },
  banner: {
    js: "const importMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

const previewConfig = {
  entryPoints: ['src/preview/webview/preview.ts'],
  bundle: true,
  outfile: 'dist/preview.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: !watch,
  logLevel: 'info',
};

const previewEntry = previewConfig.entryPoints[0];

async function build() {
  await copyRuntimeAssets();

  if (watch) {
    const ext = await esbuild.context(extensionConfig);
    await ext.watch();
    console.log('Watching extension bundle...');
    if (await pathExists(previewEntry)) {
      const prev = await esbuild.context(previewConfig);
      await prev.watch();
      console.log('Watching preview bundle...');
    } else {
      console.log('Preview entry not yet present; skipping preview watch.');
    }
  } else {
    await esbuild.build(extensionConfig);
    if (await pathExists(previewEntry)) {
      await esbuild.build(previewConfig);
    } else {
      console.log('Preview entry not yet present; skipping preview build.');
    }
  }
}

async function copyRuntimeAssets() {
  await copyEpubTemplates();
  await copyKatexCss();
}

async function copyEpubTemplates() {
  const source = path.join('node_modules', '@lesjoursfr', 'html-to-epub', 'templates');
  const target = 'templates';
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
}

async function copyKatexCss() {
  const source = path.join('node_modules', 'katex', 'dist', 'katex.min.css');
  const target = path.join('media', 'katex', 'katex.min.css');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
