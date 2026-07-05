import * as esbuild from 'esbuild';

// tools/og-poster 専用の小さなビルドスクリプト。本サイトの build.mjs / dist-web には一切関与しない。
const watch = process.argv.includes('--watch');

const config = {
  entryPoints: ['tools/og-poster/poster.ts'],
  bundle: true,
  outfile: 'tools/og-poster/dist/poster.js',
  format: 'iife',
  target: 'chrome120',
  logLevel: 'info',
  // ビルド時刻を埋め込む。画面に表示して「古いJSを実行していないか」を一目で判別する。
  define: { __BUILD_ID__: JSON.stringify(new Date().toISOString()) },
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('watching (og-poster) -> tools/og-poster/dist/poster.js');
} else {
  await esbuild.build(config);
  console.log('built -> tools/og-poster/dist/poster.js');
}
