// Generador de PDF propio (sin dependencias): páginas A4, texto Helvetica (WinAnsi), rectángulos, líneas, círculos y polígonos vectoriales.
const HELV = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
const BOLD = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
const MAP = { '–': '\x96', '—': '\x97', '…': '\x85', '·': '\xB7', '’': '\x92', '‘': '\x91', '“': '\x93', '”': '\x94', '•': '\x95', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '✓': 'ok', '★': '*', 'Δ': 'D', '×': '\xD7' };
export function sanitize(s) {
  let o = ''; s = String(s == null ? '' : s);
  for (const ch of s) { if (MAP[ch] != null) o += MAP[ch]; else { const c = ch.charCodeAt(0); o += c < 256 ? ch : (ch.normalize('NFD').replace(/[̀-ͯ]/g, '').charCodeAt(0) < 256 ? ch.normalize('NFD').replace(/[̀-ͯ]/g, '') : '?'); } }
  return o;
}
function cw(ch, bold) {
  let c = ch.charCodeAt(0);
  if (c > 126 || c < 32) { const b = ch.normalize('NFD').replace(/[̀-ͯ]/g, ''); c = b.charCodeAt(0); if (!(c >= 32 && c <= 126)) return 556; }
  return (bold ? BOLD : HELV)[c - 32] || 556;
}
export function textWidth(str, size, bold) { let w = 0; for (const ch of sanitize(str)) w += cw(ch, bold); return (w * size) / 1000; }
const esc = (s) => sanitize(s).replace(/[\\()]/g, (m) => '\\' + m).replace(/[\x80-\xff]/g, (m) => '\\' + m.charCodeAt(0).toString(8).padStart(3, '0'));
const hex = (c) => { c = String(c || '#000000'); if (c[0] !== '#') c = '#000000'; c = c.slice(1); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; let n = parseInt(c, 16); if (isNaN(n)) n = 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' '); };
const f2 = (n) => (Math.round(n * 100) / 100).toString();

export const PAGE = { w: 595.28, h: 841.89 };

export class Pdf {
  constructor() { this.pages = []; this.cur = null; this.addPage(); }
  addPage() { this.cur = []; this.pages.push(this.cur); return this.pages.length; }
  setPage(i) { this.cur = this.pages[i]; }
  y(v) { return PAGE.h - v; }
  text(x, y, str, o) {
    o = o || {}; const size = o.size || 10, bold = !!o.bold; let s = sanitize(str);
    const w = textWidth(s, size, bold); let px = x; if (o.align === 'center') px = x - w / 2; else if (o.align === 'right') px = x - w;
    this.cur.push('BT /F' + (bold ? 2 : 1) + ' ' + f2(size) + ' Tf ' + hex(o.color || '#1b1b1b') + ' rg ' + f2(px) + ' ' + f2(this.y(y)) + ' Td (' + esc(s) + ') Tj ET');
    return w;
  }
  rect(x, y, w, h, o) {
    o = o || {}; const ops = [];
    if (o.fill) ops.push(hex(o.fill) + ' rg'); if (o.stroke) ops.push(hex(o.stroke) + ' RG ' + f2(o.lw || 0.8) + ' w');
    const op = o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S';
    this.cur.push(ops.join(' ') + ' ' + f2(x) + ' ' + f2(this.y(y + h)) + ' ' + f2(w) + ' ' + f2(h) + ' re ' + op);
  }
  line(x1, y1, x2, y2, o) {
    o = o || {}; this.cur.push(hex(o.color || '#999999') + ' RG ' + f2(o.lw || 0.6) + ' w ' + (o.dash ? '[' + o.dash + '] 0 d ' : '[] 0 d ') + f2(x1) + ' ' + f2(this.y(y1)) + ' m ' + f2(x2) + ' ' + f2(this.y(y2)) + ' l S');
  }
  poly(points, o) {
    o = o || {}; if (points.length < 2) return; const ops = [];
    if (o.fill) ops.push(hex(o.fill) + ' rg'); if (o.stroke) ops.push(hex(o.stroke) + ' RG ' + f2(o.lw || 1) + ' w 1 j 1 J');
    const path = points.map((p, i) => f2(p[0]) + ' ' + f2(this.y(p[1])) + (i ? ' l' : ' m')).join(' ') + (o.close ? ' h' : '');
    this.cur.push(ops.join(' ') + ' ' + path + ' ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
  }
  circle(cx, cy, r, o) {
    o = o || {}; const k = 0.5523 * r; const ops = [];
    if (o.fill) ops.push(hex(o.fill) + ' rg'); if (o.stroke) ops.push(hex(o.stroke) + ' RG ' + f2(o.lw || 1) + ' w');
    const Y = this.y(cy); const c = (a, b, c2, d, e, f) => [a, b, c2, d, e, f].map(f2).join(' ') + ' c';
    this.cur.push(ops.join(' ') + ' ' + f2(cx + r) + ' ' + f2(Y) + ' m ' + c(cx + r, Y + k, cx + k, Y + r, cx, Y + r) + ' ' + c(cx - k, Y + r, cx - r, Y + k, cx - r, Y) + ' ' + c(cx - r, Y - k, cx - k, Y - r, cx, Y - r) + ' ' + c(cx + k, Y - r, cx + r, Y - k, cx + r, Y) + ' ' + (o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S'));
  }
  output() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); // 2 = Pages (se rellena después)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    this.pages.forEach((ops) => {
      const body = ops.join('\n'); const cid = add('<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream');
      const pid = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + f2(PAGE.w) + ' ' + f2(PAGE.h) + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>');
      kids.push(pid + ' 0 R');
    });
    objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xr = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xr + '\n%%EOF';
    const u = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) u[i] = out.charCodeAt(i) & 255; return u;
  }
}
