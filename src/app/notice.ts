/**
 * showAudioNotice — 音声を取得できないときの案内バナー。
 *
 * `createMediaElementSource` は「メディア要素につき1つ」しか使えないため、別の音声ビジュアライザ
 * 拡張が先に動画音声を掴んでいると、こちらは無音になり何も反応しない。競合は無言で失敗しがちなので、
 * 「他の同種拡張をOFFにして再読み込み」を明示的に案内する（サポート品質での差別化）。
 */
export function showAudioNotice(): void {
  if (document.getElementById('vexr-notice')) return; // 二重表示防止

  const el = document.createElement('div');
  el.id = 'vexr-notice';
  el.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
    'z-index:2147483002', 'background:rgba(20,20,20,0.96)', 'color:#fff',
    'padding:12px 14px', 'border-radius:10px', 'font:13px/1.6 sans-serif',
    'max-width:min(92vw,440px)', 'box-shadow:0 6px 24px rgba(0,0,0,0.5)',
    'pointer-events:auto',
  ].join(';');

  const msg = document.createElement('div');
  msg.textContent =
    '🎵 音声を取得できませんでした。別の音声ビジュアライザ拡張が動画の音声を使っている可能性があります'
    + '（音声は拡張ひとつだけが利用できます）。他の同種拡張をオフにして、ページを再読み込みしてください。';
  el.appendChild(msg);

  const row = document.createElement('div');
  row.style.cssText = 'margin-top:10px;display:flex;gap:8px;justify-content:flex-end;';

  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.style.cssText = 'background:transparent;color:#bbb;border:1px solid #555;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;';
  close.addEventListener('click', () => el.remove());

  const reload = document.createElement('button');
  reload.textContent = '再読み込み';
  reload.style.cssText = 'background:#2e7d32;color:#fff;border:none;border-radius:6px;padding:6px 12px;cursor:pointer;font:inherit;';
  reload.addEventListener('click', () => location.reload());

  row.appendChild(close);
  row.appendChild(reload);
  el.appendChild(row);

  document.body.appendChild(el);
}
