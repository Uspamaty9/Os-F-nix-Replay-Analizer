const KEY = 'fenix-settings';

export const THEMES = [
  { id: 'fenix', name: 'Fênix', bg: '#111111', card: '#181818', acc: '#C89A3D', red: '#7A0E1A', txt: '#F7F3E8', btn: '#111111' },
  { id: 'oscuro', name: 'Oscuro', bg: '#0d0d0d', card: '#1c1c1c', acc: '#E8E8EC', red: '#5b5b63', txt: '#EDEDED', btn: '#0d0d0d' },
  { id: 'claro', name: 'Claro', bg: '#F7F3E8', card: '#ffffff', acc: '#7A0E1A', red: '#7A0E1A', txt: '#1b1b1b', btn: '#ffffff' },
  { id: 'medianoche', name: 'Medianoche', bg: '#0B1630', card: '#14264d', acc: '#35D0C8', red: '#1f6f9c', txt: '#E8F1FF', btn: '#04201f' },
  { id: 'bosque', name: 'Bosque', bg: '#0E1F14', card: '#17301f', acc: '#8BC34A', red: '#3f7d34', txt: '#EAF5E4', btn: '#10200a' },
  { id: 'laliga', name: 'La Liga', bg: '#120A0C', card: '#1F1013', acc: '#FF4B44', red: '#B3202A', txt: '#FFF3EE', btn: '#ffffff' },
  { id: 'premier', name: 'PL', bg: '#1B0A24', card: '#2D0F3A', acc: '#00FF85', red: '#E90052', txt: '#F6F0FA', btn: '#06220F' },
  { id: 'seriea', name: 'Serie A', bg: '#12104A', card: '#1A1659', acc: '#2DE2FF', red: '#0032A0', txt: '#FFFFFF', btn: '#0A0A3A', c: ['#1A1659', '#FFFFFF', '#2DE2FF'] },
  { id: 'bundesliga', name: 'Bundesliga', bg: '#0D0D0D', card: '#1B1B1B', acc: '#F0243A', red: '#B00012', txt: '#FFFFFF', btn: '#ffffff' },
  { id: 'champions', name: 'Champions', bg: '#020619', card: '#0A1B5C', acc: '#E6EEFF', red: '#3D7BFF', txt: '#F4F8FF', btn: '#020619' },
].map((t) => ({ ...t, group: ['laliga', 'premier', 'seriea', 'bundesliga', 'champions'].includes(t.id) ? 'comp' : 'def', c: t.c || (t.id === 'fenix' ? [t.red, t.acc, t.bg] : [t.bg, t.acc, t.card]) }));

// ===== Tema personalizado: cada color se guarda como tono (h 0-360), saturación, intensidad (v) y opacidad (a), 0-100 =====
export const CUSTOM_SLOTS = [
  { id: 'bg', name: 'Fondo' },
  { id: 'card', name: 'Tarjetas' },
  { id: 'acc', name: 'Acento' },
  { id: 'txt', name: 'Texto' },
];
export const CUSTOM_DEFAULT = {
  bg: { h: 265, s: 62, v: 17, a: 100 },
  card: { h: 265, s: 52, v: 29, a: 100 },
  acc: { h: 38, s: 82, v: 100, a: 100 },
  txt: { h: 40, s: 6, v: 100, a: 100 },
};

// Temas personalizados guardados (máximo 3)
export const MAX_CUSTOMS = 3;
export function customsOf(s) {
  if (Array.isArray(s.customs)) return s.customs;
  if (s.custom && s.theme === 'custom') return [{ name: 'Personalizado 1', colors: { ...CUSTOM_DEFAULT, ...s.custom } }];
  return [];
}
export function activeCustom(s) {
  const l = customsOf(s);
  const i = Math.min(Math.max(0, Number(s.customIdx) || 0), l.length - 1);
  return l[i] ? { ...CUSTOM_DEFAULT, ...l[i].colors } : { ...CUSTOM_DEFAULT, ...(s.custom || {}) };
}
export function hexToSlot(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h = Math.round(h * 60); if (h < 0) h += 360; }
  return { h, s: Math.round(mx ? d / mx * 100 : 0), v: Math.round(mx * 100), a };
}

export function hsvToRgb(h, s, v) {
  s /= 100; v /= 100;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
export function rgbToHex(r, g, b) { return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''); }
export function slotHex(c) { const [r, g, b] = hsvToRgb(c.h, c.s, c.v); return rgbToHex(r, g, b); }
export function slotCss(c) { const [r, g, b] = hsvToRgb(c.h, c.s, c.v); return 'rgba(' + r + ',' + g + ',' + b + ',' + (c.a / 100).toFixed(2) + ')'; }

function hexToRgba(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
function slotRgba(c) { const [r, g, b] = hsvToRgb(c.h, c.s, c.v); return [r, g, b, c.a / 100]; }
function css(c, k = 1) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (c[3] * k).toFixed(3) + ')'; }
function lum(c) { return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255; }
function mix(a, b, k) { return [Math.round(a[0] * (1 - k) + b[0] * k), Math.round(a[1] * (1 - k) + b[1] * k), Math.round(a[2] * (1 - k) + b[2] * k), 1]; }

// Los temas se quitaron de la app: siempre se usa el tema por defecto (aunque quede uno guardado de antes).
export function getSettings() {
  const base = { theme: 'fenix', chat: true, arrows: true, names: true, nameSize: 1, chatSize: 1, countdown: true, custom: CUSTOM_DEFAULT };
  try { return { ...base, ...(JSON.parse(localStorage.getItem(KEY)) || {}), theme: 'fenix' }; } catch (e) { return base; }
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { }
  applySettings(s);
}

// Paleta completa de un tema (colores en rgba)
export function paletteOf(s) {
  if (s.theme === 'custom') {
    const cu = activeCustom(s);
    const bg = slotRgba(cu.bg), card = slotRgba(cu.card), acc = slotRgba(cu.acc), txt = slotRgba(cu.txt);
    const red = mix(acc, [0, 0, 0, 1], 0.45);
    const btn = lum(acc) > 0.55 ? [17, 17, 17, 1] : [255, 255, 255, 1];
    return { bg, card, acc, txt, red, btn };
  }
  const t = THEMES.find((x) => x.id === s.theme) || THEMES[0];
  return { bg: hexToRgba(t.bg), card: hexToRgba(t.card), acc: hexToRgba(t.acc), txt: hexToRgba(t.txt), red: hexToRgba(t.red), btn: hexToRgba(t.btn) };
}

const VAR_NAMES = ['--bg', '--card', '--acc', '--red', '--txt', '--btn-txt', '--bg2', '--bg-90', '--card-90', '--acc-08', '--acc-15', '--acc-30', '--acc-55', '--txt-60', '--shade'];

export function applySettings(s = getSettings()) {
  const b = document.body;
  if (!b) return;
  const fenix = !s.theme || s.theme === 'fenix';
  if (!fenix) b.setAttribute('data-theme', s.theme); else b.removeAttribute('data-theme');
  const st = b.style;
  if (fenix) {
    VAR_NAMES.forEach((n) => st.removeProperty(n));
  } else {
    const p = paletteOf(s);
    const dark = lum(p.bg) < 0.5;
    st.setProperty('--bg', css(p.bg));
    st.setProperty('--card', css(p.card));
    st.setProperty('--acc', css(p.acc));
    st.setProperty('--red', css(p.red));
    st.setProperty('--txt', css(p.txt));
    st.setProperty('--btn-txt', css(p.btn));
    st.setProperty('--bg2', css(mix(p.bg, dark ? [255, 255, 255, 1] : [0, 0, 0, 1], 0.07)));
    st.setProperty('--bg-90', css(p.bg, 0.9));
    st.setProperty('--card-90', css(p.card, 0.9));
    st.setProperty('--acc-08', css(p.acc, 0.08));
    st.setProperty('--acc-15', css(p.acc, 0.15));
    st.setProperty('--acc-30', css(p.acc, 0.3));
    st.setProperty('--acc-55', css(p.acc, 0.55));
    st.setProperty('--txt-60', css(p.txt, 0.6));
    st.setProperty('--shade', dark ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.35)');
  }
  if (s.chat === false && !b.classList.contains('fenix-nochat') && b.classList.contains('fenix-ready')) {
    // el chat se desvanece antes de ocultarse
    b.classList.add('fenix-chat-hiding');
    clearTimeout(window.__fenixChatT);
    window.__fenixChatT = setTimeout(() => { b.classList.remove('fenix-chat-hiding'); b.classList.add('fenix-nochat'); }, 200);
  } else {
    clearTimeout(window.__fenixChatT);
    b.classList.remove('fenix-chat-hiding');
    b.classList.toggle('fenix-nochat', s.chat === false);
  }
  b.classList.add('fenix-chat-clear');
  window.__fenixArrows = s.arrows !== false;
  window.__fenixNames = s.names !== false;
  window.__fenixNameScale = Number(s.nameSize) || 1;
  b.style.setProperty('--fenix-chat-k', String(Number(s.chatSize) || 1));
  try {
    const light = lum(paletteOf(s).bg) > 0.6;
    if (window.FenixNative && window.FenixNative.lightBars) window.FenixNative.lightBars(light);
  } catch (e) { }
}
