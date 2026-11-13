// Funciones extra de Os Fênix: compartir, copia de seguridad, guía de bienvenida e imagen del partido
import { getMeta, getReplayData, exportAll, importAll } from './storage/history';

function cap() {
  const c = window.Capacitor;
  return c && c.isNativePlatform && c.isNativePlatform() && c.nativePromise ? c : null;
}

export function toast(msg) {
  const old = document.querySelector('.fenix-toast');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const t = document.createElement('div');
  t.className = 'fenix-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
  setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2900);
}

function bufToB64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function sendBytes(name, mime, b64, dest, share) {
  const c = cap();
  if (c) { await c.nativePromise('HbrScanner', 'shareBytes', { name, mime, data: b64, dest, share }); return true; }
  // Navegador: descarga directa
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([u], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2000);
  return true;
}

// Compartir una repetición con otro jugador
export async function shareReplay(id) {
  try {
    const meta = await getMeta(id); const data = await getReplayData(id);
    if (!meta || !data) { toast('No se encontró la repetición'); return; }
    await sendBytes(meta.fileName || (meta.name + '.hbr2'), 'application/octet-stream', bufToB64(data), 'downloads', true);
  } catch (e) { toast('No se pudo compartir'); }
}

// Copia de seguridad del historial y favoritos
export async function backupExport() {
  try {
    const txt = await exportAll();
    const b64 = btoa(unescape(encodeURIComponent(txt)));
    const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
    const name = 'OsFenix-respaldo-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.fenixbak';
    await sendBytes(name, 'application/octet-stream', b64, 'downloads', false);
    toast(cap() ? 'Respaldo guardado en Descargas' : 'Respaldo descargado');
  } catch (e) { toast('No se pudo crear el respaldo'); }
}

export async function backupImport() {
  try {
    let text = null;
    const c = cap();
    if (c) {
      const r = await c.nativePromise('HbrScanner', 'pick', {});
      text = decodeURIComponent(escape(atob(r.data)));
    } else {
      text = await new Promise((resolve, reject) => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.fenixbak,application/octet-stream';
        inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return reject(new Error('cancel')); const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = reject; fr.readAsText(f); };
        inp.click();
      });
    }
    const n = await importAll(text);
    toast(n ? n + ' repetición(es) restaurada(s)' : 'No había nada nuevo para restaurar');
  } catch (e) {
    if (!/cancel/i.test(String(e && (e.message || e)))) toast('Ese archivo no es un respaldo válido');
  }
}

// Guía de bienvenida
const GUIDE = [
  { t: 'Importa tu repetición', p: 'Toca «Importar repetición» y elige tus archivos .hbr2. Quedan guardados para verlos sin internet.', i: 'M12 16V4M7 9l5-5 5 5M4 20h16' },
  { t: 'Acerca y mueve la cancha', p: 'Pellizca para hacer zoom y arrastra con un dedo. El botón 1.0× vuelve a la vista completa.', i: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' },
  { t: 'Sigue a un jugador', p: 'Toca la mira para elegir a quién seguir. Doble toque en la mira te lleva a la pelota. El ojo despeja la pantalla para grabar.', i: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 2v3M12 19v3M2 12h3M19 12h3' },
];
export function showGuide(force) {
  try { if (!force && localStorage.getItem('fenix-guide') === '1') return; } catch (e) { }
  if (document.querySelector('.fenix-guide')) return;
  let k = 0;
  const o = document.createElement('div');
  o.className = 'fenix-guide';
  const render = () => {
    const g = GUIDE[k];
    o.innerHTML = '<div class="fg-box"><svg class="fg-ico" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + g.i + '"/></svg><h3>' + g.t + '</h3><p>' + g.p + '</p><div class="fg-dots">' + GUIDE.map((_, n) => '<i class="' + (n === k ? 'on' : '') + '"></i>').join('') + '</div><div class="fg-btns"><button type="button" class="fg-skip">Saltar</button><button type="button" class="fg-next">' + (k === GUIDE.length - 1 ? 'Empezar' : 'Siguiente') + '</button></div></div>';
  };
  const close = () => { try { localStorage.setItem('fenix-guide', '1'); } catch (e) { } o.classList.remove('show'); setTimeout(() => { if (o.parentNode) o.parentNode.removeChild(o); }, 300); };
  o.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('fg-skip')) close();
    else if (t.classList.contains('fg-next')) { if (k >= GUIDE.length - 1) close(); else { k++; render(); } }
  });
  render();
  document.body.appendChild(o);
  void o.offsetWidth; o.classList.add('show');
}

// Imagen del partido para compartir (marcador, goleadores y estadísticas)
function cssVar(n, d) { try { const v = getComputedStyle(document.body).getPropertyValue(n).trim(); return v || d; } catch (e) { return d; } }
export async function shareSummaryImage(m, redName, blueName) {
  try {
    const W = 1080, H = 1350;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const bg = cssVar('--bg', '#111111'), card = cssVar('--card', '#1b1b1b'), acc = cssVar('--acc', '#C89A3D'), txt = cssVar('--txt', '#F7F3E8'), red = cssVar('--red', '#7A0E1A');
    const grd = g.createRadialGradient(W / 2, 0, 50, W / 2, 0, 1100); grd.addColorStop(0, red); grd.addColorStop(1, bg);
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = grd; g.globalAlpha = 0.55; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
    const img = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = (process.env.PUBLIC_URL || '') + '/brand/escudo.png'; });
    if (img) { const w = 230, h = w * img.height / img.width; g.drawImage(img, W / 2 - w / 2, 40, w, h); }
    g.textAlign = 'center'; g.fillStyle = acc; g.font = '600 34px Oswald, Arial'; g.fillText('REPLAY ANALYZER · OS FÊNIX', W / 2, 330);
    g.fillStyle = txt; g.font = '600 56px Oswald, Arial';
    const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
    g.fillStyle = '#E56E56'; g.textAlign = 'right'; g.fillText(clip(redName, 14), 410, 450);
    g.fillStyle = '#5689E5'; g.textAlign = 'left'; g.fillText(clip(blueName, 14), 670, 450);
    g.fillStyle = txt; g.textAlign = 'center'; g.font = '700 150px Oswald, Arial'; g.fillText(m.scoreRed + ' - ' + m.scoreBlue, W / 2, 470);
    const secs = Math.max(0, Math.round((m.gameTicks || 0) / 60)); const tm = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    g.fillStyle = acc; g.font = '500 34px Poppins, Arial'; g.fillText('Duración ' + tm + (m.stadium && m.stadium.name ? ' · ' + clip(m.stadium.name, 26) : ''), W / 2, 530);
    // goles
    g.strokeStyle = acc; g.globalAlpha = 0.5; g.beginPath(); g.moveTo(120, 575); g.lineTo(W - 120, 575); g.stroke(); g.globalAlpha = 1;
    g.font = '600 38px Oswald, Arial'; g.fillStyle = acc; g.fillText('GOLES', W / 2, 625);
    let y = 680; g.font = '500 34px Poppins, Arial';
    (m.goals || []).slice(0, 7).forEach((gl) => {
      const label = gl.scorer + (gl.assist && gl.assist.player ? ' (' + gl.assist.player + ')' : '');
      const score = gl.currentScore ? gl.currentScore[0] + ':' + gl.currentScore[1] : '';
      g.fillStyle = txt; g.textAlign = 'center'; g.fillText(score, W / 2, y);
      g.fillStyle = gl.for === 'Red' ? '#E56E56' : '#5689E5';
      if (gl.for === 'Red') { g.textAlign = 'right'; g.fillText(clip(label, 24), W / 2 - 70, y); } else { g.textAlign = 'left'; g.fillText(clip(label, 24), W / 2 + 70, y); }
      y += 52;
    });
    // estadísticas
    y = Math.max(y + 20, 1010);
    const poss = (m.possRed + m.possBlue) > 0 ? Math.round(m.possRed / (m.possRed + m.possBlue) * 100) : 50;
    const rows = [['POSESIÓN', poss, 100 - poss, '%'], ['TOQUES', m.kicksRed, m.kicksBlue, ''], ['PASES', m.passesRed, m.passesBlue, ''], ['TIROS', m.shotsRed, m.shotsBlue, '']];
    rows.forEach((r, n) => {
      const yy = 1030 + n * 66;
      g.textAlign = 'right'; g.fillStyle = '#E56E56'; g.font = '600 36px Poppins, Arial'; g.fillText(r[1] + r[3], 230, yy);
      g.textAlign = 'left'; g.fillStyle = '#5689E5'; g.fillText(r[2] + r[3], W - 230, yy);
      g.textAlign = 'center'; g.fillStyle = txt; g.font = '500 28px Poppins, Arial'; g.fillText(r[0], W / 2, yy - 4);
      const tot = (r[1] + r[2]) || 1, bw = 560, bx = W / 2 - bw / 2;
      g.fillStyle = 'rgba(128,128,128,.3)'; g.fillRect(bx, yy + 8, bw, 8);
      g.fillStyle = '#E56E56'; g.fillRect(bx, yy + 8, bw * r[1] / tot, 8);
      g.fillStyle = '#5689E5'; g.fillRect(bx + bw * r[1] / tot, yy + 8, bw * r[2] / tot, 8);
    });
    const dataUrl = cv.toDataURL('image/png');
    await sendBytes('OsFenix-partido-' + Date.now() + '.png', 'image/png', dataUrl.split(',')[1], 'images', true);
    toast(cap() ? 'Imagen guardada en Imágenes/OsFenix' : 'Imagen descargada');
  } catch (e) { toast('No se pudo crear la imagen'); }
}
