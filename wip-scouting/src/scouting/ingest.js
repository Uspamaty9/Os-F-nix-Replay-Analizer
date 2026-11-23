// Puente entre el analizador de repeticiones y el módulo de estadísticas.
// Se llama cuando el motor termina de analizar una repetición; NO modifica el motor ni su flujo.
import * as db from './db';
import { compactPart, mainPartIndex, mergeParts } from './analysis';
import { getMeta, listReplays } from '../storage/history';

export const normNick = (s) => String(s == null ? '' : s).trim().toLowerCase();

export function playerIndex(players) {
  const m = new Map();
  players.forEach((p) => { m.set(normNick(p.nick), p); (p.aliases || []).forEach((a) => { if (!m.has(normNick(a))) m.set(normNick(a), p); }); });
  return m;
}

// Si todos los jugadores conocidos de un bando pertenecen al mismo equipo (≥ 2), se sugiere ese equipo.
export function suggestTeams(part, players) {
  const idx = playerIndex(players); const out = { R: null, B: null };
  ['R', 'B'].forEach((side) => {
    const ids = (part.players || []).filter((p) => p.team === side).map((p) => (idx.get(normNick(p.nick)) || {}).teamId).filter(Boolean);
    if (ids.length >= 2 && ids.every((x) => x === ids[0])) out[side] = ids[0];
  });
  if (out.R && out.R === out.B) return { R: null, B: null };
  return out;
}

function lastModifiedOf(meta) {
  const sig = String((meta && meta.signature) || '').split('|'); const lm = Number(sig[2]);
  return lm > 946684800000 && lm < Date.now() + 864e5 ? lm : (meta && meta.addedAt) || Date.now();
}

// Geometría compacta del estadio (solo lo que hace falta para dibujar la cancha en la pizarra táctica)
const r1 = (n) => Math.round(Number(n) * 10) / 10;
export function stadiumGeo(st) {
  try {
    if (!st || !st.name || !Array.isArray(st.vertexes)) return null;
    const bg = st.bg || {};
    const boundW = Number(st.width) || 0, boundH = Number(st.height) || 0;
    const halfW = Number(bg.width) || boundW, halfH = Number(bg.height) || boundH;
    if (!(halfW > 20 && halfH > 20)) return null;
    const segs = [];
    (st.segments || []).forEach((sg) => {
      const a = st.vertexes[sg.v0], b = st.vertexes[sg.v1];
      if (!a || !b || sg.vis === false || !sg.color || sg.color === 'transparent') return;
      segs.push([r1(a.x), r1(a.y), r1(b.x), r1(b.y), r1(sg.curveS != null ? sg.curveS : 0), String(sg.color)]);
    });
    const goals = (st.goals || []).map((g) => [r1(g.p0[0]), r1(g.p0[1]), r1(g.p1[0]), r1(g.p1[1]), g.team === 'red' ? 'R' : 'B']);
    // discos fijos del mapa (postes de las porterías y adornos): se dibujan tal cual los trae el mapa, sin postes por defecto
    const discs = (st.discs || []).filter((d) => d && d.pos && Number(d.radius) > 0 && d.color !== 'transparent' && Number(d.invMass) === 0)
      .map((d) => [r1(d.pos[0]), r1(d.pos[1]), r1(d.radius), d.color ? String(d.color) : 'FFFFFF']).slice(0, 80);
    let ex = 0, ey = 0;
    segs.forEach((s) => { ex = Math.max(ex, Math.abs(s[0]), Math.abs(s[2])); ey = Math.max(ey, Math.abs(s[1]), Math.abs(s[3])); });
    goals.forEach((q) => { ex = Math.max(ex, Math.abs(q[0]), Math.abs(q[2])); ey = Math.max(ey, Math.abs(q[1]), Math.abs(q[3])); });
    return {
      discs, name: String(st.name).slice(0, 40), bgType: bg.type || 'grass', halfW: r1(halfW), halfH: r1(halfH),
      boundW: r1(Math.max(boundW, halfW + 20, ex + 20)), boundH: r1(Math.max(boundH, halfH + 20, ey + 20)), kickOff: r1(bg.kickOffRadius || 0),
      bgColor: bg.color && bg.color !== 'transparent' ? String(bg.color) : '', segs: segs.slice(0, 300), goals: goals.slice(0, 4),
    };
  } catch (e) { return null; }
}

async function saveStadiums(played) {
  try {
    const cur = (await db.getKv('stadiums', {})) || {};
    let ch = false;
    // siempre se actualiza la cancha con lo último analizado (paredes, postes, colores), si cambió algo
    played.forEach((m) => { const g = stadiumGeo(m.stadium); if (g && JSON.stringify(cur[g.name] || null) !== JSON.stringify(g)) { cur[g.name] = g; ch = true; } });
    if (ch) { await db.setKv('stadiums', cur); try { window.dispatchEvent(new Event('fenix-scouting-changed')); } catch (e) { /* nada */ } }
  } catch (e) { /* nunca debe afectar al análisis */ }
}

export async function ingestStats(replayId, stats) {
  if (!replayId) return null;
  const played = (stats || []).filter((m) => m && m.gameTicks > 0);
  if (!played.length) return null;
  const parts = played.map(compactPart).filter(Boolean);
  if (!parts.length) return null;
  await saveStadiums(played);
  const meta = await getMeta(replayId);
  const players = await db.all('players');
  const idx = playerIndex(players);
  const hideNew = await db.getKv('hideNewPlayers', true); // por defecto los jugadores nuevos quedan sin elegir hasta que los marques
  const fresh = [];
  parts.forEach((pt) => pt.players.forEach((p) => {
    if (!p.team || idx.has(normNick(p.nick))) return;
    const np = { id: db.uid('p'), nick: p.nick, aliases: [], teamId: null, position: '', avatar: null, notes: '', source: 'replay', ignored: !!hideNew, createdAt: Date.now(), updatedAt: Date.now() };
    idx.set(normNick(p.nick), np); fresh.push(np); players.push(np);
  }));
  if (fresh.length) await db.putMany('players', fresh);
  if (fresh.length) { try { const pend = await db.getKv('pendingNewPlayers', []); await db.setKv('pendingNewPlayers', pend.concat(fresh.map((p) => p.id))); } catch (e) { /* no crítico */ } } // se le preguntará al usuario cuáles son de su equipo
  const old = await db.get('matches', replayId);
  const partIdx = old && old.partIdx < parts.length ? old.partIdx : mainPartIndex(parts);
  const rec = Object.assign({
    id: replayId, replayId, name: (meta && meta.name) || 'Partido', date: lastModifiedOf(meta), redTeamId: null, blueTeamId: null, teamAuto: false,
    seasonId: null, competitionId: null, fixtureId: null, round: '', notes: '', createdAt: Date.now(),
  }, old || {}, { parts, partIdx, ingestedAt: Date.now(), name: (old && old.name) || (meta && meta.name) || 'Partido' });
  if (!rec.redTeamId && !rec.blueTeamId) {
    const s = suggestTeams(parts[partIdx], players);
    if (s.R || s.B) { rec.redTeamId = s.R; rec.blueTeamId = s.B; rec.teamAuto = true; }
  }
  await db.put('matches', rec);
  return rec;
}

// Llamada desde el analizador (Home.js). Tolerante a errores: nunca debe afectar a la reproducción.
export function ingestFromEngine(stats) {
  try { const id = window.__fenixCurrentId; if (id) ingestStats(id, stats).catch(() => { }); } catch (e) { }
}

// Repeticiones del historial que todavía no tienen estadísticas guardadas
export async function pendingReplays() {
  const [reps, ms] = await Promise.all([listReplays(), db.all('matches')]);
  const have = new Set(ms.map((m) => m.replayId));
  return reps.filter((r) => !have.has(r.id));
}

// Unir varias repeticiones ya analizadas en UN solo partido (p. ej. primer y segundo tiempo guardados por separado).
// recs = registros de 'matches' en orden; swaps[i] = true si en esa repetición los bandos están cambiados respecto a la primera.
// Los registros originales quedan excluidos (para no contar dos veces) y enlazados, y se pueden recuperar con deshacerUnion.
export async function mergeMatches(recs, swaps, name) {
  if (!recs || recs.length < 2) return null;
  const parts = recs.map((r) => r.parts[r.partIdx]).filter(Boolean);
  if (parts.length < 2) return null;
  const first = recs[0];
  const rec = {
    id: db.uid('m'), replayId: first.replayId, replayIds: recs.map((r) => r.replayId), mergedFrom: recs.map((r) => r.id), swaps: recs.map((_, i) => !!(swaps && swaps[i])),
    name: name || recs.map((r) => r.name).join(' + '), date: Math.min.apply(null, recs.map((r) => r.date || Date.now())),
    redTeamId: first.redTeamId || null, blueTeamId: first.blueTeamId || null, teamAuto: !!first.teamAuto,
    seasonId: first.seasonId || null, competitionId: first.competitionId || null, fixtureId: first.fixtureId || null, round: first.round || '', notes: '',
    createdAt: Date.now(), ingestedAt: Date.now(), parts: [mergeParts(parts, swaps)], partIdx: 0,
  };
  await db.putMany('matches', recs.map((r) => Object.assign({}, r, { excluded: true, mergedInto: rec.id })).concat([rec]));
  return rec;
}
export async function undoMerge(rec, originals) {
  const ids = new Set(rec.mergedFrom || []);
  const back = (originals || []).filter((r) => ids.has(r.id)).map((r) => { const n = Object.assign({}, r); delete n.mergedInto; n.excluded = false; return n; });
  if (back.length) await db.putMany('matches', back);
  await db.del('matches', rec.id);
}
