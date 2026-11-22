// Exportación: imagen de la pizarra, esquema con trayectorias, hoja de pasos, vídeo de la animación y proyecto JSON.
import { fitView, toScreen, PITCH, setPitch } from './geometry';
import { drawScene, drawPlayer, drawBall } from './render';
import { resolvedPos, animPos } from './model';
import { serializeDoc } from './storage';

const STRIP = 44;
const slug = (s) => String(s || 'pizarra').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'pizarra';

function fieldSize(width) { return Math.round(width * ((PITCH.boundH * 2 + 20) / (PITCH.boundW * 2 + 20))); }

function caption(ctx, w, y, doc, extra) {
  ctx.save();
  ctx.fillStyle = '#111'; ctx.fillRect(0, y, w, STRIP);
  ctx.fillStyle = '#C89A3D'; ctx.fillRect(0, y, w, 2);
  ctx.font = '700 ' + Math.round(STRIP * 0.4) + 'px "Open Sans", Roboto, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = '#fff'; ctx.fillText(doc.name + (extra ? '  ·  ' + extra : ''), 14, y + STRIP / 2 + 1);
  ctx.textAlign = 'right'; ctx.fillStyle = '#C89A3D'; ctx.font = '600 ' + Math.round(STRIP * 0.32) + 'px "Open Sans", Roboto, sans-serif';
  ctx.fillText('Os Fênix · Pizarra táctica', w - 14, y + STRIP / 2 + 1);
  ctx.restore();
}

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Imagen de un paso (o de la posición pos si se da)
export function renderImage(doc, fi, opts = {}) {
  setPitch(doc.field || null);
  const w = opts.width || 1600, fh = fieldSize(w), h = fh + STRIP;
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  const v = fitView(w, fh, 'full', 10);
  drawScene(ctx, v, w, h, { doc, fi, pos: opts.pos || null, trails: !!opts.trails, shadow: !!opts.shadow, shadowIds: opts.shadowIds || null, names: opts.names !== false, ghost: false, hideUI: true });
  caption(ctx, w, fh, doc, doc.frames.length > 1 ? (doc.frames[fi] && doc.frames[fi].name) || '' : doc.category);
  return c;
}

// Esquema táctico: posiciones iniciales (translúcidas), finales y trayectorias de todos los pasos
export function renderScheme(doc, opts = {}) {
  setPitch(doc.field || null);
  const w = opts.width || 1600, fh = fieldSize(w), h = fh + STRIP, last = doc.frames.length - 1;
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  const v = fitView(w, fh, 'full', 10);
  drawScene(ctx, v, w, h, { doc, fi: last, trails: true, names: true, ghost: false, hideUI: true });
  if (last > 0) {
    const p0 = resolvedPos(doc, 0);
    for (const pl of doc.players) if (p0[pl.id]) drawPlayer(ctx, v, pl, p0[pl.id], { ghost: true, names: false });
    if (p0.ball) drawBall(ctx, v, p0.ball, { ghost: true });
  }
  caption(ctx, w, fh, doc, last > 0 ? 'Esquema · ' + (last + 1) + ' pasos' : 'Esquema');
  return c;
}

// Hoja con todos los pasos en cuadrícula (alternativa al vídeo, funciona en cualquier navegador)
export function renderSheet(doc, opts = {}) {
  setPitch(doc.field || null);
  const cols = doc.frames.length > 2 ? 2 : 1, cw = opts.cell || 900;
  const fh = fieldSize(cw), rows = Math.ceil(doc.frames.length / cols), lab = 34;
  const w = cols * cw, h = rows * (fh + lab) + STRIP;
  const c = newCanvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
  const v = fitView(cw, fh, 'full', 8);
  doc.frames.forEach((f, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * (fh + lab);
    ctx.save(); ctx.translate(x, y); ctx.beginPath(); ctx.rect(0, 0, cw, fh + lab); ctx.clip();
    drawScene(ctx, v, cw, fh, { doc, fi: i, trails: i > 0 && opts.trails !== false, names: true, ghost: false, hideUI: true });
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(0, fh, cw, lab);
    ctx.fillStyle = '#C89A3D'; ctx.font = '700 16px "Open Sans", Roboto, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText((i + 1) + '. ' + (f.name || 'Paso ' + (i + 1)), 12, fh + lab / 2);
    ctx.restore();
  });
  caption(ctx, w, h - STRIP, doc, 'Secuencia · ' + doc.frames.length + ' pasos');
  return c;
}

export function canvasToBlob(canvas, type = 'image/png', q) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), type, q));
}

export const webmSupported = () => typeof window !== 'undefined' && !!window.MediaRecorder && !!HTMLCanvasElement.prototype.captureStream;

// Vídeo WebM de la animación (tiempo real). onProgress(0..1). cancel(): detiene la grabación.
export function recordAnimation(doc, opts = {}) {
  return new Promise((resolve, reject) => {
    if (!webmSupported()) { reject(new Error('Este dispositivo no puede grabar vídeo. Exporta la hoja de pasos (imagen).')); return; }
    setPitch(doc.field || null);
    const w = opts.width || 1280, fh = fieldSize(w), h = fh + STRIP;
    const c = newCanvas(w, h), ctx = c.getContext('2d');
    const v = fitView(w, fh, 'full', 10);
    const speed = opts.speed || 1, hold = 700;
    const n = doc.frames.length, total = Math.max(1, (n - 1) * doc.stepMs / speed);
    const mimes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = mimes.find((m) => window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(m)) || '';
    let rec;
    try { rec = new window.MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 4000000 } : undefined); } catch (e) { reject(e); return; }
    const chunks = []; let stopped = false;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    rec.onerror = (e) => reject(e.error || new Error('Error al grabar'));
    const frame = (x) => {
      const a = animPos(doc, x);
      drawScene(ctx, v, w, h, { doc, fi: a.fi, pos: a.pos, trails: false, names: true, ghost: false, hideUI: true });
      caption(ctx, w, fh, doc, n > 1 ? (doc.frames[Math.min(n - 1, Math.round(x))].name || '') : '');
    };
    frame(0); rec.start(250);
    const t0 = performance.now();
    const loop = (now) => {
      if (stopped) return;
      const el = now - t0;
      if (opts.signal && opts.signal.aborted) { stopped = true; try { rec.stop(); } catch (e) { /* nada */ } return; }
      const x = el < hold ? 0 : Math.min(n - 1, ((el - hold) / total) * (n - 1));
      frame(x);
      if (opts.onProgress) opts.onProgress(Math.min(1, el / (hold * 2 + total)));
      if (el >= hold * 2 + total) { stopped = true; setTimeout(() => { try { rec.stop(); } catch (e) { /* nada */ } }, 150); return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

// ---- Guardar / compartir el archivo (misma vía que el resto de la app: puente nativo en Android, descarga en web/escritorio)
function cap() {
  const c = window.Capacitor;
  return c && c.isNativePlatform && c.isNativePlatform() && c.nativePromise ? c : null;
}

function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function saveBlob(blob, name, mime) {
  const c = cap();
  if (c) {
    await c.nativePromise('HbrScanner', 'shareBytes', { name, mime: mime || blob.type || 'application/octet-stream', data: await blobToB64(blob), dest: 'downloads', share: false });
    return 'native';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 2500);
  return 'web';
}

export const fileName = (doc, suffix, ext) => slug(doc.name) + (suffix ? '-' + suffix : '') + '.' + ext;

export function projectBlob(doc) { return new Blob([serializeDoc(doc)], { type: 'application/json' }); }

export { toScreen };
