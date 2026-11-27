// Informes profesionales en PDF (equipo, jugador, partido). Todo el contenido sale del modelo: ninguna cifra se inventa.
import { Pdf, PAGE, textWidth } from './pdf';
import { applyFilters, dashboardData, playerProfile, passNetwork, ratingAverage, criteriaAverage, rowHasRole, getRating, teamName, fmtPct, fmtNum, fmtDate, fmtDur, EMPTY_FILTERS } from './model';
import { CRITERIA, ROLE_SETS, ROLE_LABEL, PROV_LABEL, DEFINITIONS, aggregateRows } from './analysis';

const C = { gold: '#C89A3D', red: '#7A0E1A', dark: '#111111', ivory: '#F7F3E8', grey: '#6b6b6b', light: '#ECE6D6', line: '#D8D0BB', blue: '#3A78B5', green: '#3C8D50' };
const M = 40, CW = PAGE.w - 2 * M;

class Doc {
  constructor(title, subtitle) { this.p = new Pdf(); this.y = 0; this.title = title; this.subtitle = subtitle; this.cover(); }
  cover() {
    const p = this.p; p.rect(0, 0, PAGE.w, 96, { fill: C.dark }); p.rect(0, 96, PAGE.w, 4, { fill: C.gold });
    p.text(M, 34, 'OS FÊNIX · REPLAY ANALYZER', { size: 9, bold: true, color: C.gold });
    p.text(M, 62, this.title, { size: 21, bold: true, color: C.ivory });
    p.text(M, 82, this.subtitle, { size: 10, color: '#cfc7b0' });
    this.y = 120;
  }
  ensure(h) { if (this.y + h > PAGE.h - 50) { this.p.addPage(); this.y = 48; return true; } return false; }
  h2(t) { this.ensure(110); this.y += 8; this.p.text(M, this.y + 12, t, { size: 13, bold: true, color: C.red }); this.p.line(M, this.y + 18, M + CW, this.y + 18, { color: C.gold, lw: 1.2 }); this.y += 28; }
  h3(t) { this.ensure(60); this.p.text(M, this.y + 10, t, { size: 10.5, bold: true, color: C.dark }); this.y += 18; }
  wrap(t, size, w) { const words = String(t).split(/\s+/); const lines = []; let cur = ''; words.forEach((wd) => { const tr = cur ? cur + ' ' + wd : wd; if (textWidth(tr, size) > w && cur) { lines.push(cur); cur = wd; } else cur = tr; }); if (cur) lines.push(cur); return lines; }
  para(t, o) { o = o || {}; const size = o.size || 10; const lines = this.wrap(t, size, CW - (o.indent || 0)); lines.forEach((l) => { this.ensure(size + 5); this.p.text(M + (o.indent || 0), this.y + size, l, { size, color: o.color || '#222', bold: o.bold }); this.y += size + 4; }); this.y += o.gap == null ? 3 : o.gap; }
  bullets(list) { list.forEach((t) => { const lines = this.wrap(t, 10, CW - 14); lines.forEach((l, i) => { this.ensure(15); if (i === 0) this.p.circle(M + 3, this.y + 7, 1.8, { fill: C.gold }); this.p.text(M + 12, this.y + 10, l, { size: 10, color: '#222' }); this.y += 14; }); this.y += 2; }); }
  kpis(items) {
    const per = Math.min(4, items.length), gap = 8, w = (CW - gap * (per - 1)) / per; this.ensure(58);
    items.forEach((k, i) => { const col = i % per, row = Math.floor(i / per); if (col === 0 && row > 0) { this.y += 58; this.ensure(58); }
      const x = M + col * (w + gap); this.p.rect(x, this.y, w, 50, { fill: '#FAF7EE', stroke: C.line, lw: 0.7 }); this.p.rect(x, this.y, 3, 50, { fill: C.gold });
      this.p.text(x + 10, this.y + 18, String(k.value), { size: 17, bold: true, color: C.dark }); this.p.text(x + 10, this.y + 32, k.label, { size: 8, color: C.grey }); if (k.sub) this.p.text(x + 10, this.y + 43, k.sub, { size: 7, color: C.grey }); });
    this.y += 58;
  }
  table(cols, rows, o) {
    o = o || {}; const tot = cols.reduce((s, c) => s + c.w, 0); const k = CW / tot; const ws = cols.map((c) => c.w * k); const rh = o.rowH || 17;
    const head = () => { this.ensure(rh + 12); let x = M; this.p.rect(M, this.y, CW, rh, { fill: C.dark }); cols.forEach((c, i) => { this.p.text(c.align === 'left' ? x + 4 : x + ws[i] - 4, this.y + 11.5, c.h, { size: 7.5, bold: true, color: C.ivory, align: c.align === 'left' ? 'left' : 'right' }); x += ws[i]; }); this.y += rh; };
    head();
    rows.forEach((r, ri) => {
      if (this.ensure(rh)) head();
      if (ri % 2 === 0) this.p.rect(M, this.y, CW, rh, { fill: '#F6F2E7' });
      let x = M; cols.forEach((c, i) => { let v = r[i]; const bold = o.boldFirst && i === 0; let s = v == null ? '—' : String(v); const maxW = ws[i] - 8; while (s.length > 2 && textWidth(s, 8.5, bold) > maxW) s = s.slice(0, -2) + '…'; this.p.text(c.align === 'left' ? x + 4 : x + ws[i] - 4, this.y + 11.5, s, { size: 8.5, bold, align: c.align === 'left' ? 'left' : 'right', color: '#222' }); x += ws[i]; });
      this.y += rh;
    });
    this.p.line(M, this.y, M + CW, this.y, { color: C.line }); this.y += 8;
  }
  bars(data, fmt, o) {
    o = o || {}; const mx = Math.max.apply(null, data.map((d) => d.value).concat([1e-9])); const lw = o.labelW || 110;
    data.forEach((d) => { this.ensure(16); this.p.text(M, this.y + 10, d.label, { size: 8.5, color: '#222' }); this.p.rect(M + lw, this.y + 2, CW - lw - 50, 9, { fill: '#EFE9D8' }); this.p.rect(M + lw, this.y + 2, Math.max(1, (CW - lw - 50) * (d.value / mx)), 9, { fill: d.color || C.gold }); this.p.text(M + CW, this.y + 10, fmt ? fmt(d.value) : String(d.value), { size: 8.5, bold: true, align: 'right' }); this.y += 15; });
    this.y += 4;
  }
  stack(parts, label) {
    this.ensure(34); const t = parts.reduce((s, p) => s + p.value, 0); if (label) this.p.text(M, this.y + 9, label, { size: 8.5, color: C.grey });
    this.y += 13; if (!t) { this.y += 12; return; } let x = M; parts.forEach((p) => { const w = (p.value / t) * CW; if (w > 0) { this.p.rect(x, this.y, w, 12, { fill: p.color }); if (w > 28) this.p.text(x + w / 2, this.y + 9, p.value + '', { size: 7.5, bold: true, color: '#fff', align: 'center' }); x += w; } }); this.y += 16;
    let lx = M; parts.forEach((p) => { this.p.rect(lx, this.y + 1, 7, 7, { fill: p.color }); lx += 10 + this.p.text(lx + 10, this.y + 8, p.label, { size: 7.5, color: C.grey }) + 10; }); this.y += 16;
  }
  lineChart(labels, series, o) {
    o = o || {}; const h = o.h || 130; this.ensure(h + 30); const x0 = M + 30, x1 = M + CW - 6, y0 = this.y + 6, y1 = this.y + h - 14; const all = series.flatMap((s) => s.data).filter((v) => v != null);
    if (!all.length) { this.y += 20; return; } let lo = Math.min(0, Math.min.apply(null, all)), hi = Math.max.apply(null, all); if (hi === lo) hi = lo + 1; const n = labels.length;
    const X = (i) => x0 + (n === 1 ? (x1 - x0) / 2 : (i * (x1 - x0)) / (n - 1)), Y = (v) => y0 + (1 - (v - lo) / (hi - lo)) * (y1 - y0);
    for (let k = 0; k <= 3; k++) { const v = lo + ((hi - lo) * k) / 3; this.p.line(x0, Y(v), x1, Y(v), { color: '#E2DAC6', lw: 0.5 }); this.p.text(x0 - 4, Y(v) + 3, (o.fmt || ((q) => fmtNum(q, 1)))(v), { size: 7, color: C.grey, align: 'right' }); }
    const step = Math.max(1, Math.ceil(n / 8)); labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) this.p.text(X(i), y1 + 11, l, { size: 7, color: C.grey, align: 'center' }); });
    series.forEach((s) => { const pts = s.data.map((v, i) => (v == null ? null : [X(i), Y(v)])).filter(Boolean); this.p.poly(pts, { stroke: s.color, lw: 1.8 }); pts.forEach((q) => this.p.circle(q[0], q[1], 2.2, { fill: s.color })); });
    this.y += h + 4; if (series.length > 1) { let lx = M; series.forEach((s) => { this.p.rect(lx, this.y, 7, 7, { fill: s.color }); lx += 10 + this.p.text(lx + 10, this.y + 7, s.name, { size: 7.5, color: C.grey }) + 12; }); this.y += 14; }
  }
  network(net) {
    const h = 250; this.ensure(h + 8); const x0 = M, y0 = this.y, W = CW, H = h; this.p.rect(x0, y0, W, H, { fill: '#F2EEDD', stroke: C.line });
    this.p.line(x0 + W / 2, y0, x0 + W / 2, y0 + H, { color: '#DDD5BE' });
    const nodes = net.nodes; if (!nodes.length) { this.y += h + 8; return; }
    const mean = nodes.map((n) => ({ id: n.id, x: n.kicks ? n.sx / n.kicks : 0, y: n.kicks ? n.sy / n.kicks : 0 }));
    const xs = mean.map((m) => m.x), ys = mean.map((m) => m.y); const ax = Math.min.apply(null, xs), bx = Math.max.apply(null, xs), ay = Math.min.apply(null, ys), by = Math.max.apply(null, ys);
    const pos = {}; mean.forEach((m) => { pos[m.id] = [x0 + 40 + (bx === ax ? 0.5 : (m.x - ax) / (bx - ax)) * (W - 80), y0 + 30 + (by === ay ? 0.5 : (m.y - ay) / (by - ay)) * (H - 60)]; });
    const ids = Object.keys(pos); for (let it = 0; it < 40; it++) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = pos[ids[i]], b = pos[ids[j]]; const dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 0.01; if (d < 40) { const f = (40 - d) / 2; a[0] -= (dx / d) * f; a[1] -= (dy / d) * f; b[0] += (dx / d) * f; b[1] += (dy / d) * f; } }
    const mx = Math.max.apply(null, net.edges.map((e) => e.n).concat([1])), mk = Math.max.apply(null, nodes.map((n) => n.conn).concat([1]));
    net.edges.slice(0, 40).forEach((e) => { const a = pos[e.a], b = pos[e.b]; if (!a || !b) return; const t = e.n / mx; this.p.line(a[0], a[1], b[0], b[1], { color: t > 0.6 ? C.gold : '#C9B27A', lw: 0.6 + t * 4.5 }); });
    nodes.forEach((n) => { const q = pos[n.id]; const r = 8 + (n.conn / mk) * 6; this.p.circle(q[0], q[1], r, { fill: n.color || (n.team === 'R' ? C.red : C.blue), stroke: '#fff', lw: 1.5 }); this.p.text(q[0], q[1] + r + 9, n.nick, { size: 7.5, bold: true, align: 'center', color: '#222' }); this.p.text(q[0], q[1] + 3, String(n.out + n.inn), { size: 7, bold: true, align: 'center', color: '#fff' }); });
    this.p.text(x0 + W - 6, y0 + 10, 'Grosor = nº de pases · tamaño = conexiones · posición = zona media de toques', { size: 6.5, color: C.grey, align: 'right' });
    this.y += h + 10;
  }
  radar(axes, series, size) {
    size = size || 190; this.ensure(size + 30); const cx = M + CW / 2, cy = this.y + size / 2 + 10, R = size / 2 - 22, n = axes.length;
    const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * R * (v / 10), cy + Math.sin(a) * R * (v / 10)]; };
    [0.25, 0.5, 0.75, 1].forEach((k) => this.p.poly(axes.map((_, i) => pt(i, 10 * k)), { stroke: '#D8D0BB', lw: 0.5, close: true }));
    axes.forEach((a, i) => { const q = pt(i, 10), l = pt(i, 11.8); this.p.line(cx, cy, q[0], q[1], { color: '#D8D0BB', lw: 0.5 }); this.p.text(l[0], l[1] + 3, a.label, { size: 7, color: C.grey, align: l[0] < cx - 6 ? 'right' : l[0] > cx + 6 ? 'left' : 'center' }); });
    series.forEach((s) => this.p.poly(axes.map((a, i) => pt(i, s.values[a.id] == null ? 0 : s.values[a.id])), { stroke: s.color, fill: null, lw: 1.8, close: true }));
    this.y += size + 20;
  }
  finish(note) {
    this.h2('Origen de los datos y definiciones');
    this.para('E = Extraído por el motor · C = Calculado a partir de datos extraídos · M = Introducido manualmente. Los datos que el motor no registra (p. ej. posición de los rivales, tiros fuera) no se estiman.', { size: 8.5, color: C.grey });
    DEFINITIONS.forEach((d) => this.para('[' + (d[1] === 'auto' ? 'E' : d[1] === 'calc' ? 'C' : 'M') + '] ' + d[0] + ': ' + d[2], { size: 7.5, color: C.grey, gap: 1 }));
    if (note) this.para(note, { size: 8, color: C.grey });
    const total = this.p.pages.length; const date = new Date().toLocaleDateString('es');
    for (let i = 0; i < total; i++) { this.p.setPage(i); this.p.line(M, PAGE.h - 36, M + CW, PAGE.h - 36, { color: C.line }); this.p.text(M, PAGE.h - 24, 'Os Fênix Replay Analyzer · ' + date, { size: 7.5, color: C.grey }); this.p.text(M + CW, PAGE.h - 24, 'Página ' + (i + 1) + ' de ' + total, { size: 7.5, color: C.grey, align: 'right' }); }
    return this.p.output();
  }
}

const outcomeLetter = { W: 'V', D: 'E', L: 'D' };
function filterSummary(model, f) {
  const parts = [];
  if (f.seasonId) parts.push('Temporada: ' + ((model.seasons.find((s) => s.id === f.seasonId) || {}).name || '—'));
  if (f.competitionId) parts.push('Competición: ' + ((model.competitions.find((s) => s.id === f.competitionId) || {}).name || '—'));
  if (f.teamId) parts.push('Equipo: ' + teamName(model, f.teamId));
  if (f.playerId) parts.push('Jugador: ' + ((model.playerById.get(f.playerId) || {}).nick || '—'));
  return parts.length ? parts.join(' · ') : 'Todos los datos guardados';
}
function groupRowsByPlayer(model, rows) {
  const g = new Map(); rows.forEach((r) => { const k = r.playerId || 'n:' + r.nick; if (!g.has(k)) g.set(k, { key: k, playerId: r.playerId, nick: r.nick, rows: [] }); g.get(k).rows.push(r); });
  return Array.from(g.values()).map((x) => Object.assign(x, { agg: aggregateRows(x.rows), nick: (model.playerById.get(x.playerId) || {}).nick || x.nick }));
}
function playerTable(doc, model, groups, matchIds) {
  const rows = groups.sort((a, b) => b.agg.goalInvolvements - a.agg.goalInvolvements || b.agg.kicks - a.agg.kicks).map((g) => { const ra = g.playerId ? ratingAverage(model, g.playerId, matchIds) : null; const a = g.agg; return [g.nick, a.matches, a.goals, a.assists, a.kicks, a.passesCompleted, fmtPct(a.passAccuracy), a.recoveries + a.interceptions, a.turnovers, fmtPct(a.goalShare), ra ? fmtNum(ra.avg, 1) : '—']; });
  doc.table([{ h: 'Jugador', w: 92, align: 'left' }, { h: 'PJ', w: 22 }, { h: 'G', w: 22 }, { h: 'A', w: 22 }, { h: 'Toques', w: 34 }, { h: 'Pases', w: 32 }, { h: 'Prec.', w: 32 }, { h: 'Rec+Int', w: 38 }, { h: 'Pérd.', w: 30 }, { h: 'Part.gol', w: 38 }, { h: 'Nota', w: 28 }], rows, { boldFirst: true });
  doc.para('PJ partidos · G goles [E] · A asistencias [E] · Toques [E] · Pases completados [C] · Prec. = pases completados / (completados + fallidos) [C] · Rec+Int = recuperaciones + intercepciones [C] · Pérd. pérdidas [C] · Part.gol = goles y asistencias sobre los goles del equipo [C] · Nota = media de calificaciones (manual o automática) [M/C].', { size: 7.5, color: C.grey });
}

// ------------------------------------------------------------------ INFORME DE EQUIPO / COLECTIVO
export function buildTeamReport(model, filters) {
  const f = Object.assign({}, EMPTY_FILTERS, filters); const view = applyFilters(model, f); const d = dashboardData(model, view, { noOwn: !f.teamId });
  const tName = d.perspective ? teamName(model, d.perspective) : 'Todos los equipos';
  const doc = new Doc('Informe colectivo · ' + tName, filterSummary(model, f) + ' · Generado el ' + fmtDate(Date.now()));
  doc.h2('Resumen del rendimiento');
  doc.kpis([
    { label: 'Partidos analizados', value: view.matches.length, sub: d.manualResults ? d.manualResults + ' resultados manuales aparte' : '' },
    { label: 'Victorias · Empates · Derrotas', value: d.perspective ? d.W + ' · ' + d.D + ' · ' + d.L : '—', sub: d.perspective ? 'de ' + d.played + ' resultados' : 'Elige un equipo' },
    { label: 'Victorias (%)', value: fmtPct(d.winPct) }, { label: 'Goles a favor / contra', value: d.perspective ? d.goals + ' / ' + d.goalsAgainst : d.goals },
    { label: 'Asistencias [E]', value: d.assists }, { label: 'Posesión media [E]', value: fmtPct(d.possession) },
    { label: 'Pases comp. por partido [C]', value: fmtNum(d.perMatch.passes, 1) }, { label: 'Precisión de pases [C]', value: fmtPct(d.perMatch.passAccuracy) },
  ]);
  if (d.evo.length > 1) {
    doc.h2('Evolución del equipo');
    doc.lineChart(d.evo.map((e) => String(e.i)), [{ name: 'Puntos acumulados (3-1-0)', color: C.gold, data: d.evo.map((e) => e.pts) }, { name: 'Goles a favor', color: C.green, data: d.evo.map((e) => e.gf) }, { name: 'Goles en contra', color: C.red, data: d.evo.map((e) => e.ga) }], { fmt: (v) => fmtNum(v, 0) });
  }
  doc.h2('Últimos partidos');
  const last = view.matches.slice(0, 12).map((m) => { const sd = d.perspective ? (m.redTeamId === d.perspective ? 'R' : 'B') : 'R'; const gf = m.score[sd === 'R' ? 0 : 1], ga = m.score[sd === 'R' ? 1 : 0]; const t = m.an.teams[sd], o = m.an.teams[sd === 'R' ? 'B' : 'R']; return [fmtDate(m.date), teamName(model, sd === 'R' ? m.redTeamId : m.blueTeamId, sd === 'R' ? 'Rojo' : 'Azul') + ' - ' + teamName(model, sd === 'R' ? m.blueTeamId : m.redTeamId, sd === 'R' ? 'Azul' : 'Rojo'), gf + ' - ' + ga, outcomeLetter[gf > ga ? 'W' : gf < ga ? 'L' : 'D'], fmtPct(t.possession), t.shotsOT + ' / ' + o.shotsOT, t.passesCompleted, fmtDur(m.ticks)]; });
  if (last.length) doc.table([{ h: 'Fecha', w: 52, align: 'left' }, { h: 'Partido', w: 130, align: 'left' }, { h: 'Result.', w: 40 }, { h: 'R', w: 20 }, { h: 'Posesión', w: 44 }, { h: 'Tiros pta. (fav/contra)', w: 78 }, { h: 'Pases', w: 36 }, { h: 'Duración', w: 40 }], last);
  else doc.para('No hay partidos analizados con estos filtros.');
  const groups = groupRowsByPlayer(model, view.rowsScope);
  if (groups.length) { doc.h2('Estadísticas individuales'); playerTable(doc, model, groups, new Set(view.matches.map((m) => m.id))); }
  const rated = groups.filter((g) => g.playerId).map((g) => ({ g, ra: ratingAverage(model, g.playerId, new Set(view.matches.map((m) => m.id))) })).filter((x) => x.ra);
  if (rated.length) { doc.h2('Calificaciones'); doc.bars(rated.sort((a, b) => b.ra.avg - a.ra.avg).slice(0, 12).map((x) => ({ label: x.g.nick, value: x.ra.avg, color: C.gold })), (v) => fmtNum(v, 1)); doc.para('Nota media 0–10. Un valor manual prevalece sobre el automático; la automática solo existe con datos suficientes [C].', { size: 7.5, color: C.grey }); }
  const net = passNetwork(model, view.matches, f.teamId || '');
  if (net.edges.length) {
    doc.h2('Red de pases'); doc.network(net);
    doc.h3('Conexiones más frecuentes [C]');
    const nm = (id) => (net.nodes.find((n) => n.id === id) || {}).nick || '—';
    doc.table([{ h: 'Pasador', w: 100, align: 'left' }, { h: 'Receptor', w: 100, align: 'left' }, { h: 'Pases', w: 40 }, { h: 'Sentido inverso', w: 70 }], net.rel.slice(0, 8).map((e) => [nm(e.a), nm(e.b), e.n, e.mutual]));
  }
  doc.h2('Conclusiones');
  doc.bullets(teamConclusions(model, view, d, groups, net));
  return doc.finish();
}

function teamConclusions(model, view, d, groups, net) {
  const out = []; const n = view.matches.length;
  if (!n) return ['No hay partidos analizados con los filtros seleccionados; no se pueden extraer conclusiones.'];
  if (d.perspective && d.played) {
    out.push(tn(model, d) + ' suma ' + d.W + ' victorias, ' + d.D + ' empates y ' + d.L + ' derrotas (' + fmtPct(d.winPct) + ' de victorias) con ' + d.goals + ' goles a favor y ' + d.goalsAgainst + ' en contra (' + fmtNum(d.goals / d.played, 2) + ' y ' + fmtNum(d.goalsAgainst / d.played, 2) + ' por partido).');
    out.push(d.goals / d.played > d.goalsAgainst / d.played ? 'El balance de goles es positivo (' + (d.goals - d.goalsAgainst > 0 ? '+' : '') + (d.goals - d.goalsAgainst) + '): el equipo marca más de lo que recibe.' : d.goals / d.played < d.goalsAgainst / d.played ? 'El balance de goles es negativo (' + (d.goals - d.goalsAgainst) + '): la defensa recibe más goles de los que el ataque convierte.' : 'El balance de goles está equilibrado.');
    if (d.evo.length >= 6) { const a = d.evo.slice(-3), b = d.evo.slice(-6, -3); const pa = a.filter((x) => x.outcome === 'W').length, pb = b.filter((x) => x.outcome === 'W').length; out.push('En los últimos 3 partidos hay ' + pa + ' victorias frente a ' + pb + ' en los 3 anteriores.'); }
  } else out.push('Se analizaron ' + n + ' partidos. Para obtener victorias, derrotas y empates hay que asignar equipos a los partidos o marcar un equipo como «Mi equipo».');
  if (d.possession != null) out.push('Posesión media del ' + fmtPct(d.possession) + ' [dato del motor]; precisión de pases del ' + fmtPct(d.perMatch.passAccuracy) + ' [calculada].');
  const topG = groups.slice().sort((a, b) => b.agg.goalInvolvements - a.agg.goalInvolvements)[0];
  if (topG && topG.agg.goalInvolvements > 0) out.push(topG.nick + ' participó en ' + topG.agg.goalInvolvements + ' goles (' + topG.agg.goals + ' goles y ' + topG.agg.assists + ' asistencias) en ' + topG.agg.matches + ' partidos.');
  const topD = groups.slice().sort((a, b) => (b.agg.recoveries + b.agg.interceptions + b.agg.blocks) - (a.agg.recoveries + a.agg.interceptions + a.agg.blocks))[0];
  if (topD && (topD.agg.recoveries + topD.agg.interceptions + topD.agg.blocks) > 0) out.push(topD.nick + ' lidera las acciones defensivas calculadas (' + (topD.agg.recoveries + topD.agg.interceptions + topD.agg.blocks) + ' entre recuperaciones, intercepciones y bloqueos).');
  if (net.edges.length) { const e = net.edges[0]; const nm = (id) => (net.nodes.find((x) => x.id === id) || {}).nick; out.push('La conexión más repetida es ' + nm(e.a) + ' → ' + nm(e.b) + ' con ' + e.n + ' pases; el jugador más conectado es ' + net.nodes.slice().sort((a, b) => b.conn - a.conn)[0].nick + '.'); }
  out.push('Limitaciones: el motor registra tiros solo cuando van a puerta y no guarda la posición de los rivales; por eso intercepciones y recuperaciones son estimaciones calculadas.');
  return out;
}
const tn = (model, d) => teamName(model, d.perspective);

// ------------------------------------------------------------------ INFORME DE JUGADOR
export function buildPlayerReport(model, playerId, filters) {
  const f = Object.assign({}, EMPTY_FILTERS, filters || {}, { playerId }); const pr = playerProfile(model, playerId, f); const pl = pr.player; if (!pl) return null;
  const a = pr.agg; const ids = new Set(pr.matches.map((m) => m.id)); const ra = ratingAverage(model, playerId, ids); const ca = criteriaAverage(model, playerId, new Set(pr.rows.filter((r) => !r.role).map((r) => r.matchId)));
  const doc = new Doc('Informe individual · ' + pl.nick, [pl.position || 'Posición sin definir', teamName(model, pl.teamId, 'Sin equipo'), filterSummary(model, Object.assign({}, f, { playerId: '' })), 'Generado el ' + fmtDate(Date.now())].join(' · '));
  doc.h2('Resumen');
  doc.kpis([{ label: 'Partidos [E]', value: a.matches }, { label: 'Goles [E]', value: a.goals, sub: fmtNum(a.perMatch.goals, 2) + ' por partido' }, { label: 'Asistencias [E]', value: a.assists, sub: fmtNum(a.perMatch.assists, 2) + ' por partido' }, { label: 'Nota media', value: ra ? fmtNum(ra.avg, 1) : '—', sub: ra ? 'de ' + ra.n + ' partidos [M/C]' : 'sin calificaciones' },
    { label: 'Participación ofensiva [C]', value: fmtPct(a.offParticipation) }, { label: 'Participación defensiva [C]', value: fmtPct(a.defParticipation) }, { label: 'Precisión de pases [C]', value: fmtPct(a.passAccuracy), sub: a.passesCompleted + ' completados' }, { label: 'Part. en goles [C]', value: fmtPct(a.goalShare) }]);
  doc.h2('Estadísticas acumuladas');
  doc.table([{ h: 'Métrica', w: 150, align: 'left' }, { h: 'Total', w: 50 }, { h: 'Por partido', w: 60 }, { h: 'Origen', w: 50 }],
    [['Toques', a.kicks, fmtNum(a.perMatch.kicks, 1), 'Extraído'], ['Tiros a puerta', a.shotsOT, fmtNum(a.perMatch.shotsOT, 1), 'Extraído'], ['Pases completados', a.passesCompleted, fmtNum(a.perMatch.passesCompleted, 1), 'Calculado'], ['Pases recibidos', a.passesReceived, fmtNum(a.perMatch.passesReceived, 1), 'Calculado'], ['Pases fallidos', a.passesFailed, fmtNum(a.perMatch.passesFailed, 1), 'Calculado'], ['Pérdidas', a.turnovers, fmtNum(a.perMatch.turnovers, 1), 'Calculado'], ['Recuperaciones', a.recoveries, fmtNum(a.perMatch.recoveries, 1), 'Calculado'], ['Intercepciones', a.interceptions, fmtNum(a.perMatch.interceptions, 1), 'Calculado'], ['Bloqueos', a.blocks, fmtNum(a.perMatch.blocks, 1), 'Calculado'], ['Pases clave', a.keyPasses, fmtNum(a.perMatch.keyPasses, 1), 'Calculado'], ['Goles en propia', a.ownGoals, fmtNum(a.perMatch.ownGoals, 1), 'Extraído']]);
  const hasCrit = CRITERIA.some((c) => ca[c.id] != null);
  if (hasCrit) { doc.h2('Perfil de scouting (0–10)'); doc.radar(CRITERIA.map((c) => ({ id: c.id, label: c.label })), [{ values: ca, color: C.gold }]); doc.bars(CRITERIA.filter((c) => ca[c.id] != null).map((c) => ({ label: c.label, value: ca[c.id], color: C.gold })), (v) => fmtNum(v, 1), { labelW: 130 }); }
  const roleProf = ['GK', 'DEF', 'MID', 'FWD'].map((rk) => { const g = new Set(pr.rows.filter((r) => rowHasRole(r, rk)).map((r) => r.matchId)); if (!g.size) return null; const set = ROLE_SETS[rk]; const av = criteriaAverage(model, playerId, g, set, rk); return set.some((c) => av[c.id] != null) ? { rk, set, av, n: g.size } : null; }).filter(Boolean);
  roleProf.forEach((x) => { doc.h2('Perfil como ' + ROLE_LABEL[x.rk].toLowerCase() + ' (0–10, ' + x.n + (x.n === 1 ? ' partido)' : ' partidos)')); doc.radar(x.set.map((c) => ({ id: c.id, label: c.label })), [{ values: x.av, color: C.gold }]); doc.bars(x.set.filter((c) => x.av[c.id] != null).map((c) => ({ label: c.label, value: x.av[c.id], color: C.gold })), (v) => fmtNum(v, 1), { labelW: 130 }); });
  const rated = pr.history.filter((h) => h.rating && h.rating.final.values.overall != null);
  if (rated.length > 1) { doc.h2('Evolución de la nota'); doc.lineChart(rated.map((h) => fmtDate(h.row.date).slice(0, 5)), [{ name: 'Nota general', color: C.gold, data: rated.map((h) => h.rating.final.values.overall) }], { fmt: (v) => fmtNum(v, 1) }); }
  doc.h2('Historial de partidos');
  doc.table([{ h: 'Fecha', w: 50, align: 'left' }, { h: 'Partido', w: 110, align: 'left' }, { h: 'Res.', w: 34 }, { h: 'G', w: 20 }, { h: 'A', w: 20 }, { h: 'Toq.', w: 28 }, { h: 'Pases', w: 30 }, { h: 'Prec.', w: 30 }, { h: 'Nota', w: 28 }],
    pr.history.slice().reverse().slice(0, 30).map((h) => { const m = h.match; const sd = h.row.side; const gf = m.score[sd === 'R' ? 0 : 1], ga = m.score[sd === 'R' ? 1 : 0]; return [fmtDate(h.row.date), m.rec.name, gf + '-' + ga + ' ' + outcomeLetter[gf > ga ? 'W' : gf < ga ? 'L' : 'D'], h.row.goals, h.row.assists, h.row.kicks, h.row.passesCompleted, fmtPct(h.row.passAccuracy), h.rating && h.rating.final.values.overall != null ? fmtNum(h.rating.final.values.overall, 1) : '—']; }));
  const notes = pr.history.filter((h) => h.rating && h.rating.notes);
  if (notes.length) { doc.h2('Notas del analista [M]'); notes.slice(-8).forEach((h) => doc.para(fmtDate(h.row.date) + ' · ' + h.match.rec.name + ': ' + h.rating.notes, { size: 9 })); }
  doc.h2('Conclusiones');
  const out = [];
  if (!a.matches) out.push('El jugador no tiene partidos analizados con estos filtros.');
  else {
    out.push(pl.nick + ' disputó ' + a.matches + ' partidos con ' + a.goals + ' goles y ' + a.assists + ' asistencias (' + fmtNum(a.perMatch.goalInvolvements, 2) + ' participaciones en gol por partido).');
    if (a.passAccuracy != null) out.push('Completó ' + a.passesCompleted + ' pases con una precisión calculada del ' + fmtPct(a.passAccuracy) + ' y generó ' + a.keyPasses + ' pases clave.');
    if (a.recoveries + a.interceptions + a.blocks > 0) out.push('En defensa acumula ' + a.recoveries + ' recuperaciones, ' + a.interceptions + ' intercepciones y ' + a.blocks + ' bloqueos (calculados).');
    if (ra) out.push('Su nota media es ' + fmtNum(ra.avg, 1) + ' sobre ' + ra.n + ' partidos calificados.'); else out.push('Aún no hay calificaciones suficientes para valorar su rendimiento general.');
    roleProf.forEach((x) => { const b = x.set.filter((c) => x.av[c.id] != null).sort((p, q) => x.av[q.id] - x.av[p.id]); if (b.length) out.push('Como ' + ROLE_LABEL[x.rk].toLowerCase() + ': mejor ' + b[0].label + ' (' + fmtNum(x.av[b[0].id], 1) + ')' + (b.length > 1 ? ', más bajo ' + b[b.length - 1].label + ' (' + fmtNum(x.av[b[b.length - 1].id], 1) + ').' : '.')); });
    if (hasCrit) { const best = CRITERIA.filter((c) => ca[c.id] != null).sort((x, y) => ca[y.id] - ca[x.id]); out.push('Mejor criterio: ' + best[0].label + ' (' + fmtNum(ca[best[0].id], 1) + ')' + (best.length > 1 ? '; el más bajo: ' + best[best.length - 1].label + ' (' + fmtNum(ca[best[best.length - 1].id], 1) + ').' : '.')); }
  }
  doc.bullets(out);
  return doc.finish();
}

// ------------------------------------------------------------------ INFORME DE PARTIDO
export function buildMatchReport(model, matchId) {
  const m = model.matchById.get(matchId); if (!m) return null; const an = m.an; const rn = teamName(model, m.redTeamId, 'Rojo'), bn = teamName(model, m.blueTeamId, 'Azul');
  const doc = new Doc('Informe de partido · ' + rn + ' ' + m.score[0] + ' - ' + m.score[1] + ' ' + bn, m.rec.name + ' · ' + fmtDate(m.date) + ' · Duración ' + fmtDur(m.ticks) + (an.stadium ? ' · ' + an.stadium : '') + ' · Generado el ' + fmtDate(Date.now()));
  doc.h2('Estadísticas del equipo'); const R = an.teams.R, B = an.teams.B;
  doc.stack([{ label: rn, value: Math.round((R.possession || 0) * 100), color: C.red }, { label: bn, value: Math.round((B.possession || 0) * 100), color: C.blue }], 'Posesión [E] (%)');
  const rowsT = [['Goles [E]', R.goals, B.goals], ['Tiros a puerta [E]', R.shotsOT, B.shotsOT], ['Conversión [C]', fmtPct(R.conversion), fmtPct(B.conversion)], ['Toques [E]', R.kicks, B.kicks], ['Pases completados [C]', R.passesCompleted, B.passesCompleted], ['Pases fallidos [C]', R.passesFailed, B.passesFailed], ['Precisión de pases [C]', fmtPct(R.passAccuracy), fmtPct(B.passAccuracy)], ['Pérdidas [C]', R.turnovers, B.turnovers], ['Recuperaciones [C]', R.recoveries, B.recoveries], ['Intercepciones [C]', R.interceptions, B.interceptions], ['Bloqueos [C]', R.blocks, B.blocks], ['Pases clave [C]', R.keyPasses, B.keyPasses], ['Tiros a puerta evitados [C]', R.savesImplied, B.savesImplied]];
  doc.table([{ h: 'Métrica', w: 200, align: 'left' }, { h: rn, w: 100 }, { h: bn, w: 100 }], rowsT);
  if (an.goalsList.length) { doc.h2('Goles'); doc.table([{ h: 'Marcador', w: 40 }, { h: 'Equipo', w: 80, align: 'left' }, { h: 'Autor', w: 100, align: 'left' }, { h: 'Asistencia', w: 100, align: 'left' }], an.goalsList.map((g) => [g.sc ? g.sc[0] + '-' + g.sc[1] : '', g.f === 'R' ? rn : bn, (an.names[g.s] || '?') + (g.own ? ' (en propia)' : ''), g.a >= 0 ? an.names[g.a] : '—'])); }
  ['R', 'B'].forEach((side) => {
    const mem = an.players.filter((p) => p.team === side); if (!mem.length) return;
    doc.h2('Jugadores · ' + (side === 'R' ? rn : bn));
    doc.table([{ h: 'Jugador', w: 90, align: 'left' }, { h: 'G', w: 20 }, { h: 'A', w: 20 }, { h: 'Toq.', w: 28 }, { h: 'T.pta', w: 28 }, { h: 'Pases', w: 30 }, { h: 'Fall.', w: 28 }, { h: 'Rec.', w: 26 }, { h: 'Int.', w: 26 }, { h: 'Pérd.', w: 28 }, { h: 'Nota', w: 28 }],
      mem.map((p) => { const pl = model.idx.get(p.nick.trim().toLowerCase()); const rt = pl ? getRating(model, matchId, pl.id) : null; return [p.nick, p.goals, p.assists, p.kicks, p.shotsOT, p.passesCompleted, p.passesFailed, p.recoveries, p.interceptions, p.turnovers, rt && rt.final.values.overall != null ? fmtNum(rt.final.values.overall, 1) : '—']; }), { boldFirst: true });
  });
  const net = passNetwork(model, [m], ''); if (net.edges.length) { doc.h2('Red de pases'); doc.network(net); }
  doc.h2('Conclusiones'); const out = [];
  out.push(m.score[0] === m.score[1] ? 'Empate ' + m.score[0] + '-' + m.score[1] + '.' : (m.score[0] > m.score[1] ? rn : bn) + ' ganó por ' + Math.abs(m.score[0] - m.score[1]) + ' goles de diferencia.');
  if (R.possession != null) out.push((R.possession > B.possession ? rn : bn) + ' dominó la posesión (' + fmtPct(Math.max(R.possession, B.possession)) + ').');
  out.push('Tiros a puerta: ' + rn + ' ' + R.shotsOT + ' · ' + bn + ' ' + B.shotsOT + '. Precisión de pases: ' + fmtPct(R.passAccuracy) + ' · ' + fmtPct(B.passAccuracy) + '.');
  const best = an.players.filter((p) => p.team).slice().sort((a, b) => (b.goalInvolvements - a.goalInvolvements) || (b.kicks - a.kicks))[0]; if (best && best.goalInvolvements > 0) out.push(best.nick + ' participó en ' + best.goalInvolvements + ' goles.');
  if (an.spaceMode) out.push('Partida en modo especial: los pases siguen la secuencia de toques y pueden diferir del contador del motor.');
  else if (an.consistency.passesMatch === false) out.push('Aviso de coherencia: los pases reconstruidos (' + an.consistency.passesDerived + ') difieren del contador del motor (' + an.consistency.passesEngine + ').');
  doc.bullets(out);
  return doc.finish();
}
