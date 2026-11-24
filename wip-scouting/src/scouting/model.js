// Modelo de consulta: convierte los registros guardados en estadísticas coherentes.
// Todas las pantallas (panel, jugadores, partidos, red de pases, informes) leen de aquí => mismas cifras en todas partes.
import { analyzePart, aggregateRows, autoRatings, finalRatings, CRITERIA } from './analysis';
import { playerIndex, normNick } from './ingest';

const memo = new WeakMap();
function analysisOf(rec) {
  const part = rec.parts && rec.parts[rec.partIdx]; if (!part) return null;
  let m = memo.get(rec.parts); if (!m) { m = {}; memo.set(rec.parts, m); }
  if (!m[rec.partIdx]) m[rec.partIdx] = analyzePart(part);
  return m[rec.partIdx];
}

export const ratingKey = (matchId, playerId) => matchId + '|' + playerId;
export const outcomeOf = (gf, ga) => (gf > ga ? 'W' : gf < ga ? 'L' : 'D');

export function buildModel(store) {
  const { teams = [], players: allPlayers = [], seasons = [], competitions = [], fixtures = [], matches = [], ratings = [], trash = [] } = store;
  // Jugadores "ignorados" (no elegidos para analizar): siguen reconocidos por su nick, pero no cuentan en ninguna cifra ni lista.
  const players = allPlayers.filter((p) => !p.ignored);
  const idx = playerIndex(allPlayers);
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playerById = new Map(players.map((p) => [p.id, p]));
  const ratingMap = new Map(ratings.map((r) => [r.id, r]));
  const ms = [], rows = [], excluded = [], seen = new Map();
  matches.forEach((rec) => {
    const an = analysisOf(rec); if (!an) return;
    const m = { id: rec.id, rec, an, date: rec.date || rec.ingestedAt, redTeamId: rec.redTeamId || null, blueTeamId: rec.blueTeamId || null, seasonId: rec.seasonId || null, competitionId: rec.competitionId || null, round: rec.round || '', score: an.score, ticks: an.ticks };
    m.excluded = !!rec.excluded;
    if (m.excluded) { excluded.push(m); return; } // partido excluido: se conserva pero no cuenta en ninguna estadística
    ms.push(m);
    an.players.forEach((p) => {
      if (p.team !== 'R' && p.team !== 'B') return;
      const pl = idx.get(normNick(p.nick));
      if (pl) seen.set(pl.id, (seen.get(pl.id) || 0) + 1);
      if (pl && pl.ignored) return;
      rows.push(Object.assign({}, p, { matchId: rec.id, date: m.date, playerId: pl ? pl.id : null, side: p.team, teamId: p.team === 'R' ? m.redTeamId : m.blueTeamId, seasonId: m.seasonId, competitionId: m.competitionId, won: outcomeOf(an.score[p.team === 'R' ? 0 : 1], an.score[p.team === 'R' ? 1 : 0]), ctx: { gf: an.score[p.team === 'R' ? 0 : 1], ga: an.score[p.team === 'R' ? 1 : 0], poss: (an.teams[p.team] || {}).possession, size: (an.teams[p.team] || {}).players, shotsOTAgainst: (an.teams[p.team] || {}).shotsOTAgainst }, }));
    });
  });
  ms.sort((a, b) => b.date - a.date);
  // Resultados por equipo: partidos analizados + resultados manuales sin repetición
  const results = [];
  ms.forEach((m) => {
    [['R', m.redTeamId, m.blueTeamId, 0, 1], ['B', m.blueTeamId, m.redTeamId, 1, 0]].forEach(([side, tid, oid, gi, ai]) => {
      if (!tid) return;
      const gf = m.score[gi], ga = m.score[ai];
      results.push({ key: m.id + side, source: 'replay', matchId: m.id, teamId: tid, oppId: oid, gf, ga, outcome: outcomeOf(gf, ga), date: m.date, seasonId: m.seasonId, competitionId: m.competitionId, round: m.round });
    });
  });
  const linked = new Set(matches.map((m) => m.fixtureId).filter(Boolean));
  fixtures.forEach((f) => {
    if (linked.has(f.id) || f.homeGoals == null || f.awayGoals == null || f.homeGoals === '' || f.awayGoals === '') return;
    const hg = +f.homeGoals, ag = +f.awayGoals;
    results.push({ key: f.id + 'H', source: 'manual', fixtureId: f.id, teamId: f.homeId, oppId: f.awayId, gf: hg, ga: ag, outcome: outcomeOf(hg, ag), date: f.date || 0, seasonId: (competitions.find((c) => c.id === f.competitionId) || {}).seasonId || null, competitionId: f.competitionId, round: f.round });
    results.push({ key: f.id + 'A', source: 'manual', fixtureId: f.id, teamId: f.awayId, oppId: f.homeId, gf: ag, ga: hg, outcome: outcomeOf(ag, hg), date: f.date || 0, seasonId: (competitions.find((c) => c.id === f.competitionId) || {}).seasonId || null, competitionId: f.competitionId, round: f.round });
  });
  const model = { store, teams, players, allPlayers, excluded, seenCount: seen, seasons, competitions, fixtures, ratings, trash, teamById, playerById, idx, matches: ms, rows, results, ratingMap };
  model.matchById = new Map(ms.concat(excluded).map((m) => [m.id, m]));
  return model;
}

export function teamName(model, id, fallback) { const t = id && model.teamById.get(id); return t ? t.name : (fallback || 'Sin equipo'); }
export function playerLabel(model, id) { const p = id && model.playerById.get(id); return p ? p.nick : '—'; }

// ---- Filtros globales (temporada, competición, equipo, jugador)
export const EMPTY_FILTERS = { seasonId: '', competitionId: '', teamId: '', playerId: '' };
export function applyFilters(model, f) {
  f = f || EMPTY_FILTERS;
  const mOk = (m) => (!f.seasonId || m.seasonId === f.seasonId) && (!f.competitionId || m.competitionId === f.competitionId)
    && (!f.teamId || m.redTeamId === f.teamId || m.blueTeamId === f.teamId);
  let matches = model.matches.filter(mOk);
  let rows = model.rows.filter((r) => matches.some((m) => m.id === r.matchId));
  if (f.playerId) { const ids = new Set(rows.filter((r) => r.playerId === f.playerId).map((r) => r.matchId)); matches = matches.filter((m) => ids.has(m.id)); rows = rows.filter((r) => ids.has(r.matchId)); }
  const rowsScope = rows.filter((r) => (!f.teamId || r.teamId === f.teamId) && (!f.playerId || r.playerId === f.playerId));
  const results = model.results.filter((r) => (!f.seasonId || r.seasonId === f.seasonId) && (!f.competitionId || r.competitionId === f.competitionId) && (!f.teamId || r.teamId === f.teamId));
  return { filters: f, matches, rows, rowsScope, results };
}

export function ownTeamId(model) { const t = model.teams.find((x) => x.own); return t ? t.id : ''; }

// ---- Panel general
export function dashboardData(model, view, opts) {
  const f = view.filters;
  const perspective = f.teamId || (opts && opts.noOwn ? '' : ownTeamId(model)) || '';
  const res = perspective ? model.results.filter((r) => r.teamId === perspective && (!f.seasonId || r.seasonId === f.seasonId) && (!f.competitionId || r.competitionId === f.competitionId)) : [];
  const resSorted = res.slice().sort((a, b) => a.date - b.date);
  const W = res.filter((r) => r.outcome === 'W').length, D = res.filter((r) => r.outcome === 'D').length, L = res.filter((r) => r.outcome === 'L').length;
  let pts = 0; const evo = resSorted.map((r, i) => { pts += r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0; const w = resSorted.slice(0, i + 1).filter((x) => x.outcome === 'W').length; return { i: i + 1, date: r.date, gf: r.gf, ga: r.ga, outcome: r.outcome, pts, winPct: w / (i + 1), label: teamName(model, r.oppId, 'Rival'), source: r.source }; });
  // partidos sin perspectiva: con ganador / empate
  const decisive = view.matches.filter((m) => m.score[0] !== m.score[1]).length, draws = view.matches.length - decisive;
  const scope = view.rowsScope.length ? view.rowsScope : [];
  const agg = aggregateRows(scope);
  const matchCount = view.matches.length;
  // posesión media (de los equipos en foco)
  const possVals = []; view.matches.forEach((m) => {
    const t = f.teamId ? (m.redTeamId === f.teamId ? m.an.teams.R : m.an.teams.B) : null;
    if (t) { if (t.possession != null) possVals.push(t.possession); } else { if (m.an.teams.R.possession != null) possVals.push(m.an.teams.R.possession); }
  });
  const teamsView = []; view.matches.forEach((m) => { if (!f.teamId || m.redTeamId === f.teamId) teamsView.push(m.an.teams.R); if (!f.teamId || m.blueTeamId === f.teamId) teamsView.push(m.an.teams.B); });
  const sumT = (k) => teamsView.reduce((s, t) => s + (t[k] || 0), 0);
  const tn = teamsView.length;
  const lastMatches = view.matches.slice(0, 8);
  // jugadores destacados
  const byPlayer = new Map(); view.rowsScope.forEach((r) => { if (!r.playerId) return; if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, []); byPlayer.get(r.playerId).push(r); });
  const top = Array.from(byPlayer.entries()).map(([pid, rs]) => ({ playerId: pid, agg: aggregateRows(rs) })).sort((a, b) => (b.agg.goalInvolvements - a.agg.goalInvolvements) || (b.agg.goals - a.agg.goals) || (b.agg.matches - a.agg.matches)).slice(0, 6);
  return {
    perspective, matchCount, players: model.players.length, teams: model.teams.length, W, D, L, played: res.length, winPct: res.length ? W / res.length : null, decisive, draws, manualResults: res.filter((r) => r.source === 'manual').length,
    goals: perspective && res.length ? res.reduce((s, r) => s + r.gf, 0) : sumT('goals'), goalsAgainst: perspective && res.length ? res.reduce((s, r) => s + r.ga, 0) : sumT('goalsAgainst'),
    assists: scope.reduce((s, r) => s + r.assists, 0), evo, possession: possVals.length ? possVals.reduce((a, b) => a + b, 0) / possVals.length : null,
    // promedios por equipo y partido (con filtro de equipo = ese equipo; sin filtro = media de los equipos)
    perMatch: { goals: tn ? sumT('goals') / tn : null, shotsOT: tn ? sumT('shotsOT') / tn : null, passes: tn ? sumT('passesCompleted') / tn : null, recoveries: tn ? (sumT('recoveries') + sumT('interceptions')) / tn : null, passAccuracy: (() => { const c = sumT('passesCompleted'), x = sumT('passesFailed'); return c + x > 0 ? c / (c + x) : null; })() },
    lastMatches, top, agg,
  };
}

// ---- Perfil de jugador
export function playerProfile(model, playerId, filters) {
  const f = Object.assign({}, EMPTY_FILTERS, filters || {}, { playerId });
  const view = applyFilters(model, f);
  const rows = view.rowsScope.slice().sort((a, b) => a.date - b.date);
  const agg = aggregateRows(rows);
  const history = rows.map((r) => {
    const m = model.matchById.get(r.matchId); const rt = getRating(model, r.matchId, playerId);
    return { row: r, match: m, rating: rt };
  });
  return { player: model.playerById.get(playerId), rows, agg, history, matches: view.matches };
}

export function rowFor(model, matchId, playerId) { return model.rows.find((r) => r.matchId === matchId && r.playerId === playerId) || null; }

export function getRating(model, matchId, playerId) {
  const row = rowFor(model, matchId, playerId); if (!row) return null;
  const rec = model.ratingMap.get(ratingKey(matchId, playerId)) || null;
  const auto = autoRatings(row, model.rows);
  const fin = finalRatings(rec && rec.manual, auto);
  return { record: rec, auto, final: fin, notes: rec ? rec.notes || '' : '' };
}

export function ratingAverage(model, playerId, matchIds) {
  const vals = [];
  model.rows.forEach((r) => { if (r.playerId !== playerId || (matchIds && !matchIds.has(r.matchId))) return; const g = getRating(model, r.matchId, playerId); if (g && g.final.values.overall != null) vals.push(g.final.values.overall); });
  return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
}
export function criteriaAverage(model, playerId, matchIds) {
  const out = {}; CRITERIA.forEach((c) => { const v = []; model.rows.forEach((r) => { if (r.playerId !== playerId || (matchIds && !matchIds.has(r.matchId))) return; const g = getRating(model, r.matchId, playerId); if (g && g.final.values[c.id] != null) v.push(g.final.values[c.id]); }); out[c.id] = v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
  return out;
}

// ---- Red de pases (suma de uno o varios partidos, para un bando o ambos)
export function passNetwork(model, matches, teamId) {
  const nodes = new Map(), edges = new Map(), lostEdges = new Map();
  matches.forEach((m) => {
    const an = m.an;
    const sideOk = (code) => !teamId || (code === 'R' ? m.redTeamId : m.blueTeamId) === teamId;
    const keyOf = (pi) => { const p = an.players[pi]; const pl = model.idx.get(normNick(p.nick)); return pl ? pl.id : 'n:' + normNick(p.nick); };
    const nick = (pi) => an.players[pi].nick;
    const ign = (pi) => { const pl = model.idx.get(normNick(an.players[pi].nick)); return !!(pl && pl.ignored); };
    an.players.forEach((p) => {
      if (!sideOk(p.team) || (p.team !== 'R' && p.team !== 'B') || ign(p.pi)) return;
      const k = keyOf(p.pi); const n = nodes.get(k) || { id: k, nick: p.nick, team: p.team, sx: 0, sy: 0, kicks: 0, out: 0, inn: 0, failed: 0, goals: 0, assists: 0, matches: 0 };
      n.kicks += p.kicks; n.sx = (n.sx || 0) + (p.team === 'B' ? -p.sx : p.sx); n.sy = (n.sy || 0) + p.sy; n.out += p.passesCompleted; n.inn += p.passesReceived; n.failed += p.passesFailed; n.goals += p.goals; n.assists += p.assists; n.matches += 1; n.nick = (model.playerById.get(k) || {}).nick || p.nick; const pl2 = model.playerById.get(k); const tm = pl2 && pl2.teamId ? model.teamById.get(pl2.teamId) : null; n.color = matches.length === 1 ? (p.team === 'R' ? '#B23A48' : '#3A78B5') : (tm && tm.color ? tm.color : '#7F8C9A'); nodes.set(k, n);
    });
    an.pairs.forEach((e) => { const a = an.players[e.a], b = an.players[e.b]; if (!sideOk(a.team) || !sideOk(b.team) || ign(e.a) || ign(e.b)) return; const k = keyOf(e.a) + '>' + keyOf(e.b); edges.set(k, (edges.get(k) || 0) + e.n); });
    an.lost.forEach((e) => { const a = an.players[e.a]; if (!sideOk(a.team) || ign(e.a) || ign(e.b)) return; const k = keyOf(e.a) + '>' + keyOf(e.b) + '|' + nick(e.b); lostEdges.set(k, (lostEdges.get(k) || 0) + e.n); });
  });
  const E = Array.from(edges.entries()).map(([k, n]) => { const [a, b] = k.split('>'); return { a, b, n }; }).sort((x, y) => y.n - x.n);
  nodes.forEach((n) => { n.conn = E.filter((e) => e.a === n.id || e.b === n.id).reduce((s, e) => s + e.n, 0); n.partners = new Set(E.filter((e) => e.a === n.id || e.b === n.id).map((e) => (e.a === n.id ? e.b : e.a))).size; });
  const rel = E.map((e) => { const rev = E.find((x) => x.a === e.b && x.b === e.a); return Object.assign({ mutual: rev ? rev.n : 0 }, e); });
  return { nodes: Array.from(nodes.values()), edges: E, rel, totalPasses: E.reduce((s, e) => s + e.n, 0), failedTotal: Array.from(nodes.values()).reduce((s, n) => s + n.failed, 0) };
}

// ---- Clasificación y enfrentamientos
export function standings(model, competitionId) {
  const t = new Map();
  model.results.filter((r) => r.competitionId === competitionId).forEach((r) => {
    const x = t.get(r.teamId) || { teamId: r.teamId, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0 };
    x.pj++; x.gf += r.gf; x.gc += r.ga; if (r.outcome === 'W') { x.g++; x.pts += 3; } else if (r.outcome === 'D') { x.e++; x.pts += 1; } else x.p++; t.set(r.teamId, x);
  });
  return Array.from(t.values()).sort((a, b) => (b.pts - a.pts) || ((b.gf - b.gc) - (a.gf - a.gc)) || (b.gf - a.gf));
}
export function headToHead(model, aId, bId) {
  const list = model.results.filter((r) => r.teamId === aId && r.oppId === bId).sort((x, y) => y.date - x.date);
  return { list, W: list.filter((r) => r.outcome === 'W').length, D: list.filter((r) => r.outcome === 'D').length, L: list.filter((r) => r.outcome === 'L').length, gf: list.reduce((s, r) => s + r.gf, 0), ga: list.reduce((s, r) => s + r.ga, 0) };
}

export function fmtPct(v, d) { return v == null ? '—' : (v * 100).toFixed(d == null ? 0 : d) + '%'; }
export function fmtNum(v, d) { return v == null || isNaN(v) ? '—' : (Math.round(v * Math.pow(10, d == null ? 1 : d)) / Math.pow(10, d == null ? 1 : d)).toString(); }
export function fmtDate(t) { if (!t) return '—'; const d = new Date(t); const p = (n) => (n < 10 ? '0' : '') + n; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear(); }
export function fmtDur(ticks) { const t = Math.round((ticks || 0) / 60); const m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

// ---- Relaciones ofensivas: quién asiste a quién (asistencia → gol), sumando partidos
export function goalLinks(model, matches, teamId) {
  const links = new Map();
  matches.forEach((m) => m.an.goalsList.forEach((g) => {
    if (g.own || g.a < 0) return; const side = g.f; const tid = side === 'R' ? m.redTeamId : m.blueTeamId; if (teamId && tid !== teamId) return;
    const key = (pi) => { const pl = model.idx.get(normNick(m.an.names[pi])); return pl ? pl.id : 'n:' + normNick(m.an.names[pi]); };
    const k = key(g.a) + '>' + key(g.s); const cur = links.get(k) || { a: key(g.a), b: key(g.s), an: m.an.names[g.a], bn: m.an.names[g.s], n: 0 }; cur.n++; links.set(k, cur);
  }));
  return Array.from(links.values()).map((l) => Object.assign(l, { an: (model.playerById.get(l.a) || {}).nick || l.an, bn: (model.playerById.get(l.b) || {}).nick || l.bn })).sort((x, y) => y.n - x.n);
}

// ---- Rutas de circulación: cadenas de 3 jugadores distintos del mismo equipo con toques consecutivos (A → B → C)
export function passChains(model, matches, teamId) {
  const chains = new Map();
  matches.forEach((m) => {
    const part = m.rec.parts[m.rec.partIdx]; const pl = part.players; const K = part.kicks;
    const idOf = (pi) => { const x = model.idx.get(normNick(pl[pi].nick)); return x ? x.id : 'n:' + normNick(pl[pi].nick); };
    const nameOf = (id, pi) => (model.playerById.get(id) || {}).nick || pl[pi].nick;
    for (let i = 2; i < K.length; i++) {
      const a = K[i - 2][0], b = K[i - 1][0], c = K[i][0]; if (a === b || b === c || a === c) continue;
      const ta = pl[a].team, tb = pl[b].team, tc = pl[c].team; if ((ta !== 'R' && ta !== 'B') || ta !== tb || tb !== tc) continue;
      const tid = ta === 'R' ? m.redTeamId : m.blueTeamId; if (teamId && tid !== teamId) continue;
      const ids = [idOf(a), idOf(b), idOf(c)]; const k = ids.join('>'); const cur = chains.get(k) || { path: [nameOf(ids[0], a), nameOf(ids[1], b), nameOf(ids[2], c)], n: 0 }; cur.n++; chains.set(k, cur);
    }
  });
  return Array.from(chains.values()).sort((x, y) => y.n - x.n);
}

// Fecha local para <input type="date"> (toISOString usaría UTC y mostraría otro día en zonas con desfase)
export function toInputDate(t) { if (!t) return ''; const d = new Date(t); const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
