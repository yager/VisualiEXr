import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { generatePlugins } from './gen-plugins.mjs';

const watch = process.argv.includes('--watch');

// プラグインの自動登録ファイルを生成してから束ねる。
generatePlugins();

mkdirSync('dist-extension', { recursive: true });
mkdirSync('dist-app', { recursive: true });

// ── 拡張ホスト（Chrome/YouTube）→ dist-extension/ ──
cpSync('public/manifest.json', 'dist-extension/manifest.json');
const extension = {
  entryPoints: ['src/hosts/extension/content.ts'],
  bundle: true,
  outfile: 'dist-extension/content.js',
  format: 'iife',
  target: 'chrome110',
  logLevel: 'info',
};

// ── スタンドアロンホスト（Electron）→ dist-app/ ──
cpSync('src/hosts/standalone/output.html', 'dist-app/output.html');
cpSync('src/hosts/standalone/control.html', 'dist-app/control.html');
const standalone = {
  entryPoints: [
    'src/hosts/standalone/output.ts',
    'src/hosts/standalone/control.ts',
  ],
  bundle: true,
  outdir: 'dist-app',
  format: 'iife',
  target: 'chrome120',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(extension);
  await ctx.watch();
  console.log('watching (extension → dist-extension/)... アプリは npm start で再ビルド。新規プラグインは再起動。');
} else {
  await esbuild.build(extension);
  await esbuild.build(standalone);
  console.log('built -> dist-extension/ (拡張) , dist-app/ (Electron)');
}
