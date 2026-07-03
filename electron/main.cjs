// Electron メインプロセス（CommonJS）。
// dist-app/ を localhost で配信し、出力ウィンドウ＋操作ウィンドウの2枚を開く。
// localhost は「安全なコンテキスト」なので getUserMedia が確実に動き、
// 同一オリジンなので出力⇔操作の BroadcastChannel も繋がる。完全オフライン（ループバック）。

const { app, BrowserWindow, session, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', 'dist-app');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// ユーザーが JS プラグインを置くフォルダ（直接配布版の追加プラグイン置き場）
const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins');

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // プラグイン一覧（JSON）
    if (urlPath === '/plugins.json') {
      let files = [];
      try { files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.js')); } catch { /* 無ければ空 */ }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ dir: PLUGINS_DIR, files }));
      return;
    }
    // プラグインフォルダを Finder で開く
    if (urlPath === '/open-plugins') {
      void shell.openPath(PLUGINS_DIR);
      res.writeHead(200); res.end('ok');
      return;
    }
    // プラグイン本体（JS）を配信
    if (urlPath.startsWith('/plugins/')) {
      const file = path.join(PLUGINS_DIR, urlPath.slice('/plugins/'.length));
      if (!file.startsWith(PLUGINS_DIR)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/javascript' });
        res.end(buf);
      });
      return;
    }

    // それ以外は dist-app を配信
    const rel = urlPath === '/' ? 'output.html' : urlPath.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  // マイク等のメディア権限を自動許可（ローカルアプリなので）
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' ? true : true);
  });

  // プラグイン置き場を用意（無ければ作る）
  try { fs.mkdirSync(PLUGINS_DIR, { recursive: true }); } catch { /* ignore */ }
  console.log('[plugins] フォルダ:', PLUGINS_DIR);

  const port = await startServer();
  const base = `http://localhost:${port}`;

  const icon = path.join(__dirname, 'icon.png');

  // 出力ウィンドウ（通常ウィンドウで起動。手動で全画面にできる）
  const output = new BrowserWindow({
    width: 960, height: 540, backgroundColor: '#000000',
    title: 'Visualizer Output', icon,
  });
  output.loadURL(`${base}/output.html`);

  // 操作ウィンドウ（手元だけ・観客に見せない）
  const control = new BrowserWindow({
    width: 340, height: 560, x: 40, y: 40,
    title: 'Visualizer Control', icon,
  });
  control.loadURL(`${base}/control.html`);

  // macOS の Dock アイコン（開発時=npm start でも反映される）
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(icon);
});

app.on('window-all-closed', () => app.quit());
