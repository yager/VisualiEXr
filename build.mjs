import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
import { generatePlugins } from './gen-plugins.mjs';

const watch = process.argv.includes('--watch');

// プラグインの自動登録ファイルを生成してから束ねる。
generatePlugins();

mkdirSync('dist-extension', { recursive: true });
mkdirSync('dist-app', { recursive: true });
mkdirSync('dist-web', { recursive: true });

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

// ── Web ホスト（GitHub Pages 等の静的配信）→ dist-web/ ──
// github.io はサブパス配信（username.github.io/リポジトリ名/）になるため、
// 生成HTML内の資産参照は相対パス（先頭 / なし）にしてある。esbuild の outfile 名もそれに合わせる。
cpSync('src/hosts/web/index.html', 'dist-web/index.html');
// legal（プライバシー/利用規約/特商法/サポート）は変換不要の静的HTML。そのまま dist-web/legal/ へ。
cpSync('src/hosts/web/legal', 'dist-web/legal', { recursive: true });
const web = {
  entryPoints: ['src/hosts/web/main.ts'],
  bundle: true,
  outfile: 'dist-web/main.js',
  format: 'iife',
  target: 'chrome120',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(extension);
  await ctx.watch();
  console.log('watching (extension → dist-extension/)... アプリ/Web版は npm run build で再ビルド。新規プラグインは再起動。');
} else {
  await esbuild.build(extension);
  await esbuild.build(standalone);
  await esbuild.build(web);
  console.log('built -> dist-extension/ (拡張) , dist-app/ (Electron) , dist-web/ (Web版デモ)');
}
