// Puente entre el analizador de repeticiones y el módulo de estadísticas.
// Se llama cuando el motor termina de analizar una repetición; NO modifica el motor ni su flujo.
import * as db from './db';
import { compactPart, mainPartIndex } from './analysis';
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
    return {
      name: String(st.name).slice(0, 40), bgType: bg.type || 'grass', halfW: r1(halfW), halfH: r1(halfH),
      boundW: r1(Math.max(boundW, halfW + 20)), boundH: r1(Math.max(boundH, halfH + 20)), kickOff: r1(bg.kickOffRadius || 0),
      bgColor: bg.color && bg.color !== 'transparent' ? String(bg.color) : '', segs: segs.slice(0, 300), goals: goals.slice(0, 4),
    };
  } catch (e) { return null; }
}

async function saveStadiums(played) {
  try {
    const cur = (await db.getKv('stadiums', {})) || {};
    let ch = false;
    played.forEach((m) => { const g = stadiumGeo(m.stadium); if (g && (!cur[g.name] || cur[g.name].segs.length < g.segs.length || (g.segs.some((x) => x[4]) && !cur[g.name].segs.some((x) => x[4])))) { cur[g.name] = g; ch = true; } });
    if (ch) await db.setKv('stadiums', cur);
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
