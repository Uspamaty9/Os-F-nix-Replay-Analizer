// Análisis de datos de partido. Funciones puras (sin React ni IndexedDB) para que sean verificables.
// Regla de oro: solo se calcula lo que los datos del motor permiten. Nada se inventa.
//
// ORIGEN DE CADA DATO (se muestra en la interfaz con una etiqueta):
//   auto   = extraído tal cual por el motor del analizador (goles, asistencias, toques, tiros a puerta, posesión, tercios, marcador)
//   calc   = calculado a partir de datos extraídos (secuencia de toques, porcentajes, ratios, valoraciones automáticas)
//   manual = introducido por el usuario (calificaciones, notas, posiciones, fechas, equipos asignados)

export const PROV = {
  goals: 'auto', assists: 'auto', ownGoals: 'auto', kicks: 'auto', shotsOT: 'auto', score: 'auto', possession: 'auto', thirds: 'auto', ticks: 'auto',
  passesCompleted: 'calc', passesReceived: 'calc', passesFailed: 'calc', turnovers: 'calc', recoveries: 'calc', interceptions: 'calc', blocks: 'calc',
  keyPasses: 'calc', goalInvolvements: 'calc', offParticipation: 'calc', defParticipation: 'calc', kickShare: 'calc', passAccuracy: 'calc', conversion: 'calc', savesImplied: 'calc',
};
export const PROV_LABEL = { auto: 'Extraído', calc: 'Calculado', manual: 'Manual' };

export const DEFINITIONS = [
  ['Goles / Asistencias / Toques / Tiros a puerta', 'auto', 'Los registra el motor al reproducir la repetición. «Tiros a puerta» son solo los disparos cuya trayectoria entra en la portería (el motor no registra tiros fuera).'],
  ['Pases completados', 'calc', 'Toque de un jugador seguido del toque de un compañero distinto. Se reconstruye de la secuencia de toques con la misma regla del motor y se verifica contra su contador.'],
  ['Pases fallidos', 'calc', 'Toque que no es tiro a puerta y tras el cual el siguiente toque es de un rival (sin gol de por medio).'],
  ['Pérdidas', 'calc', 'Pases fallidos + tiros a puerta tras los cuales el siguiente toque es de un rival (balón perdido).'],
  ['Recuperaciones', 'calc', 'Primer toque tras un toque rival (no tiro) cuando el balón recorrió poca distancia: balón suelto o duelo ganado.'],
  ['Intercepciones', 'calc', 'Como una recuperación, pero con el balón en vuelo (distancia entre toques ≥ ' + 10 + ' % del ancho de juego observado). Es una heurística: el motor no guarda la posición de los rivales.'],
  ['Bloqueos', 'calc', 'Primer toque de un jugador tras un tiro a puerta rival que no fue gol (despeje o parada).'],
  ['Pases clave', 'calc', 'Pase completado cuyo receptor hace a continuación un tiro a puerta o marca. Incluye las asistencias.'],
  ['Participación en goles', 'calc', 'Goles + asistencias del jugador entre los goles de su equipo.'],
  ['Participación ofensiva', 'calc', '(Goles + asistencias + tiros a puerta + pases clave) del jugador sobre el total de su equipo.'],
  ['Participación defensiva', 'calc', '(Recuperaciones + intercepciones + bloqueos) del jugador sobre el total de su equipo.'],
  ['Posesión', 'auto', 'Reparto de ticks en que el último toque fue de cada equipo (dato del motor).'],
  ['Conversión', 'calc', 'Goles / tiros a puerta. Puede superar 100 % si hubo goles sin trayectoria registrada como tiro.'],
  ['Valoración automática', 'calc', 'Posición percentil (0–10) del jugador frente al resto de actuaciones guardadas. Solo se muestra con ≥ 8 actuaciones de ≥ 2 partidos. 5,0 = mediana.'],
  ['Calificaciones', 'calc', 'Se calculan solas con el resultado del partido, los goles, tiros, pases, toques y recuperaciones del jugador (y su comparación con el resto de actuaciones guardadas). Las notas escritas son del usuario.'],
];

const r1 = (n) => Math.round(n * 10) / 10;
const INTERCEPT_RATIO = 0.10;

// ---------- 1. Compactar un tramo (match) del motor ----------
// Guarda lo mínimo para poder recalcular todo más adelante sin volver a abrir la repetición.
export function compactPart(m) {
  if (!m) return null;
  const red = (m.redTeam || []).map(String), blue = (m.blueTeam || []).map(String);
  const nat = {};
  (m.player || []).forEach((p) => { if (p && p.nick != null) nat[String(p.nick)] = p.nation || ''; });
  const names = [], idx = {};
  const pi = (n) => { n = String(n); if (!(n in idx)) { idx[n] = names.length; names.push(n); } return idx[n]; };
  red.forEach(pi); blue.forEach(pi);
  const kicks = (m.kicks || []).map((k) => [pi(k.player), r1(k.x), r1(k.y)]);
  // tiros a puerta: se enlazan con su toque (mismo jugador y misma posición del balón)
  const shots = []; let ptr = 0;
  (m.shots || []).forEach((s) => {
    const p = pi(s.player); let ki = -1;
    for (let j = ptr; j < kicks.length; j++) {
      if (kicks[j][0] === p && kicks[j][1] === r1(s.from.x) && kicks[j][2] === r1(s.from.y)) { ki = j; ptr = j + 1; break; }
    }
    shots.push([p, ki]);
  });
  const rawKicks = m.kicks || [];
  const goals = (m.goals || []).map((g) => {
    const own = /\(own goal\)\s*$/.test(String(g.scorer));
    const sName = String(g.scorer).replace(/\s*\(own goal\)\s*$/, '');
    const as = g.assist; const aName = as ? (as.player || (typeof as === 'string' ? as : null)) : null;
    let ki = -1;
    if (g.shot) { ki = rawKicks.indexOf(g.shot); if (ki < 0) { for (let j = kicks.length - 1; j >= 0; j--) if (kicks[j][0] === pi(sName) && kicks[j][1] === r1(g.shot.x) && kicks[j][2] === r1(g.shot.y)) { ki = j; break; } } }
    return { ki, s: pi(sName), a: aName != null ? pi(aName) : -1, f: g.for === 'Red' ? 'R' : 'B', own, sc: g.currentScore ? [g.currentScore[0] | 0, g.currentScore[1] | 0] : null };
  });
  const players = names.map((n) => ({ nick: n, nation: nat[n] || '', team: red.includes(n) && blue.includes(n) ? 'RB' : red.includes(n) ? 'R' : blue.includes(n) ? 'B' : '' }));
  const ep = {}; // pases según el motor, por jugador (solo para verificar)
  (m.passes || []).forEach((p) => { const n = p && p.player != null ? p.player : p; if (typeof n === 'string') { const k = pi(n); ep[k] = (ep[k] || 0) + 1; } });
  return {
    v: 1, ticks: m.gameTicks | 0, spaceMode: !!m.spaceMode, stadium: m.stadium && m.stadium.name ? String(m.stadium.name).slice(0, 40) : '',
    scoreRed: m.scoreRed | 0, scoreBlue: m.scoreBlue | 0, possRed: m.possRed | 0, possBlue: m.possBlue | 0,
    thirds: (m.thirds || [0, 0, 0]).slice(0, 3), kicksRed: m.kicksRed | 0, kicksBlue: m.kicksBlue | 0, passesRed: m.passesRed | 0, passesBlue: m.passesBlue | 0,
    players: players.concat(names.slice(players.length).map((n) => ({ nick: n, nation: nat[n] || '', team: '' }))).slice(0, names.length),
    kicks, shots, goals, ep,
  };
}

// ---------- 1b. Unir tramos de varias repeticiones en un solo partido ----------
// parts = tramos compactos en orden; swaps[i] = true si en ese tramo los bandos están cambiados respecto al primero (p. ej. segundo tiempo).
export function mergeParts(parts, swaps) {
  const sw = (t) => (t === 'R' ? 'B' : t === 'B' ? 'R' : t);
  const out = { v: 1, ticks: 0, spaceMode: false, stadium: '', scoreRed: 0, scoreBlue: 0, possRed: 0, possBlue: 0, thirds: [0, 0, 0], kicksRed: 0, kicksBlue: 0, passesRed: 0, passesBlue: 0, players: [], kicks: [], shots: [], goals: [], ep: {}, breaks: [] };
  const idx = new Map(); let accR = 0, accB = 0;
  const pmap = (nick) => { if (!idx.has(nick)) { idx.set(nick, out.players.length); out.players.push({ nick, nation: '', team: '' }); } return idx.get(nick); };
  parts.forEach((pt, n) => {
    const flip = !!(swaps && swaps[n]); const T = (t) => (flip ? sw(t) : t);
    const map = pt.players.map((pl) => {
      const i = pmap(pl.nick); const o = out.players[i]; const t = T(pl.team);
      if (!o.nation) o.nation = pl.nation || '';
      o.team = !o.team ? t : (t && t !== o.team ? 'RB' : o.team); // si cambió de bando, queda en ambos
      return i;
    });
    const off = out.kicks.length;
    if (off) out.breaks.push(off - 1);
    pt.kicks.forEach((k) => out.kicks.push([map[k[0]], k[1] * (flip ? -1 : 1), k[2] * (flip ? -1 : 1)]));
    pt.shots.forEach((sh) => out.shots.push([map[sh[0]], sh[1] >= 0 ? sh[1] + off : -1]));
    const scR = flip ? pt.scoreBlue : pt.scoreRed, scB = flip ? pt.scoreRed : pt.scoreBlue;
    pt.goals.forEach((g) => out.goals.push({ ki: g.ki >= 0 ? g.ki + off : -1, s: map[g.s], a: g.a >= 0 ? map[g.a] : -1, f: flip ? sw(g.f) : g.f, own: g.own, sc: g.sc ? (flip ? [accR + g.sc[1], accB + g.sc[0]] : [accR + g.sc[0], accB + g.sc[1]]) : null }));
    Object.keys(pt.ep || {}).forEach((k) => { const i = map[k]; out.ep[i] = (out.ep[i] || 0) + pt.ep[k]; });
    out.ticks += pt.ticks | 0; out.spaceMode = out.spaceMode || !!pt.spaceMode; if (!out.stadium) out.stadium = pt.stadium;
    out.scoreRed += scR; out.scoreBlue += scB; accR += scR; accB += scB;
    out.possRed += flip ? pt.possBlue : pt.possRed; out.possBlue += flip ? pt.possRed : pt.possBlue;
    out.kicksRed += flip ? pt.kicksBlue : pt.kicksRed; out.kicksBlue += flip ? pt.kicksRed : pt.kicksBlue;
    out.passesRed += flip ? pt.passesBlue : pt.passesRed; out.passesBlue += flip ? pt.passesRed : pt.passesBlue;
    for (let i = 0; i < 3; i++) out.thirds[i] += (flip ? pt.thirds[2 - i] : pt.thirds[i]) | 0;
  });
  return out;
}

// ---------- 2. Analizar un tramo compacto ----------
function blankPlayer(pi, p) {
  return { pi, nick: p.nick, nation: p.nation, team: p.team, goals: 0, assists: 0, ownGoals: 0, kicks: 0, shotsOT: 0, passesCompleted: 0, passesReceived: 0, passesFailed: 0, turnovers: 0, recoveries: 0, interceptions: 0, blocks: 0, keyPasses: 0, goalInvolvements: 0, consecutive: 0, sx: 0, sy: 0 };
}

export function analyzePart(part) {
  if (!part) return null;
  const P = part.players.map((p, i) => blankPlayer(i, p));
  const teamOf = (i) => { const t = part.players[i] && part.players[i].team; return t === 'R' || t === 'B' ? t : null; };
  const shotKi = new Set(part.shots.filter((s) => s[1] >= 0).map((s) => s[1]));
  const goalKi = new Set(part.goals.filter((g) => g.ki >= 0 && !g.own).map((g) => g.ki));
  const goalKiAll = new Set(part.goals.filter((g) => g.ki >= 0).map((g) => g.ki)); // tras estos toques hay saque inicial
  (part.breaks || []).forEach((k) => goalKiAll.add(k)); // empalmes de repeticiones unidas: tampoco hay pérdida ni recuperación entre el último toque de una y el primero de la siguiente
  const xs = part.kicks.map((k) => k[1]);
  const width = xs.length >= 10 ? Math.max.apply(null, xs) - Math.min.apply(null, xs) : 0;
  const dMin = width * INTERCEPT_RATIO;
  const pairs = {}, lost = {};
  let passesDerived = 0, unclassified = 0;

  part.goals.forEach((g) => {
    if (g.own) { if (P[g.s]) P[g.s].ownGoals++; return; }
    if (P[g.s]) { P[g.s].goals++; P[g.s].goalInvolvements++; }
    if (g.a >= 0 && P[g.a]) { P[g.a].assists++; P[g.a].goalInvolvements++; }
  });
  part.shots.forEach((s) => { if (P[s[0]]) P[s[0]].shotsOT++; });

  // Los shots sin enlace (ki = -1) no se pueden asociar a un toque: se cuentan como tiro pero no como "tiro previo"
  for (let i = 0; i < part.kicks.length; i++) {
    const c = part.kicks[i];
    if (P[c[0]]) { P[c[0]].kicks++; P[c[0]].sx += c[1]; P[c[0]].sy += c[2]; }
    if (i === 0) continue;
    const pr = part.kicks[i - 1];
    const a = pr[0], b = c[0];
    if (a === b) { if (P[a]) P[a].consecutive++; continue; }
    const ta = teamOf(a), tb = teamOf(b);
    if (!ta || !tb) { unclassified++; continue; }
    if (ta === tb) { // mismo equipo: pase completado (misma regla que el motor, incluso tras un gol)
      P[a].passesCompleted++; P[b].passesReceived++; passesDerived++;
      const k = a + '>' + b; pairs[k] = (pairs[k] || 0) + 1;
      // pase clave: el receptor, en su racha de toques consecutivos, dispara a puerta o marca
      let j = i; while (j + 1 < part.kicks.length && part.kicks[j + 1][0] === b) j++;
      for (let q = i; q <= j; q++) { if (shotKi.has(q) || goalKi.has(q)) { P[a].keyPasses++; break; } }
      continue;
    }
    if (goalKiAll.has(i - 1)) continue; // saque tras gol: no es pérdida ni recuperación
    const wasShot = shotKi.has(i - 1);
    P[a].turnovers++;
    if (!wasShot) P[a].passesFailed++;
    const lk = a + '>' + b; lost[lk] = (lost[lk] || 0) + 1;
    if (wasShot) { P[b].blocks++; continue; }
    const dist = Math.hypot(c[1] - pr[1], c[2] - pr[2]);
    if (dMin > 0 && dist >= dMin) P[b].interceptions++; else P[b].recoveries++;
  }

  // Equipos
  const mkTeam = (code) => {
    const mem = P.filter((p) => p.team === code);
    const sum = (k) => mem.reduce((s, p) => s + p[k], 0);
    const red = code === 'R';
    const poss = red ? part.possRed : part.possBlue, possO = red ? part.possBlue : part.possRed;
    const t = {
      code, goals: red ? part.scoreRed : part.scoreBlue, goalsAgainst: red ? part.scoreBlue : part.scoreRed,
      shotsOT: sum('shotsOT'), kicks: sum('kicks'), passesCompleted: sum('passesCompleted'), passesFailed: sum('passesFailed'), turnovers: sum('turnovers'),
      recoveries: sum('recoveries'), interceptions: sum('interceptions'), blocks: sum('blocks'), keyPasses: sum('keyPasses'),
      assists: sum('assists'), possession: poss + possO > 0 ? poss / (poss + possO) : null, thirds: red ? part.thirds.slice() : part.thirds.slice().reverse(),
      players: mem.length,
    };
    return t;
  };
  const R = mkTeam('R'), B = mkTeam('B');
  R.shotsOTAgainst = B.shotsOT; B.shotsOTAgainst = R.shotsOT;
  [R, B].forEach((t) => {
    t.conversion = t.shotsOT > 0 ? t.goals / t.shotsOT : null;
    t.savesImplied = Math.max(0, t.shotsOTAgainst - t.goalsAgainst);
    const att = t.passesCompleted + t.passesFailed;
    t.passAccuracy = att > 0 ? t.passesCompleted / att : null;
  });
  const T = { R, B };
  P.forEach((p) => {
    const t = T[p.team]; if (!t) { p.offParticipation = null; p.defParticipation = null; p.kickShare = null; p.goalShare = null; p.passAccuracy = null; return; }
    const off = p.goals + p.assists + p.shotsOT + p.keyPasses;
    const goalsReal = P.filter((q) => q.team === p.team).reduce((s, q) => s + q.goals, 0);
    const offTeam = goalsReal + t.assists + t.shotsOT + t.keyPasses;
    const def = p.recoveries + p.interceptions + p.blocks, defTeam = t.recoveries + t.interceptions + t.blocks;
    p.offParticipation = offTeam > 0 ? off / offTeam : null;
    p.defParticipation = defTeam > 0 ? def / defTeam : null;
    p.kickShare = t.kicks > 0 ? p.kicks / t.kicks : null;
    p.goalShare = t.goals > 0 ? p.goalInvolvements / t.goals : null;
    const att = p.passesCompleted + p.passesFailed; p.passAccuracy = att > 0 ? p.passesCompleted / att : null;
    p.conversion = p.shotsOT > 0 ? p.goals / p.shotsOT : null;
  });
  const formations = detectRoles(part, P); R.formation = formations.R; B.formation = formations.B;
  const arr = (o) => Object.keys(o).map((k) => { const s = k.split('>'); return { a: +s[0], b: +s[1], n: o[k] }; });
  // Verificación cruzada contra los contadores del motor
  const engineGoalsR = part.goals.filter((g) => g.f === 'R').length, engineGoalsB = part.goals.filter((g) => g.f === 'B').length;
  const passesEngine = part.passesRed + part.passesBlue;
  const consistency = {
    scoreMatchesGoals: engineGoalsR === part.scoreRed && engineGoalsB === part.scoreBlue,
    passesMatch: part.spaceMode ? null : passesDerived === passesEngine,
    passesEngine, passesDerived, unclassifiedTransitions: unclassified,
    kicksMatch: part.kicks.length === part.kicksRed + part.kicksBlue,
  };
  return { players: P, teams: T, pairs: arr(pairs), lost: arr(lost), consistency, spaceMode: part.spaceMode, ticks: part.ticks, stadium: part.stadium, score: [part.scoreRed, part.scoreBlue], goalsList: part.goals, names: part.players.map((p) => p.nick) };
}


// ---------- Roles y formación por partido ----------
// A partir de DÓNDE tocó el balón cada jugador (posición del balón en sus toques) se deduce de qué jugó en ese partido:
// 'GK' portero, 'DEF' defensa, 'MID' medio, 'FWD' delantero. Así un 9 que se puso de portero se juzga como portero.
export const ROLE_LABEL = { GK: 'Portero', DEF: 'Defensa', MID: 'Medio', FWD: 'Delantero' };
export function detectRoles(part, P) {
  const dir = {};
  ['R', 'B'].forEach((code) => {
    const xs = [];
    part.shots.forEach((sh) => { if (P[sh[0]] && P[sh[0]].team === code && sh[1] >= 0 && part.kicks[sh[1]]) xs.push(part.kicks[sh[1]][1]); });
    part.goals.forEach((g) => { if (g.f === code && !g.own && g.ki >= 0 && part.kicks[g.ki]) xs.push(part.kicks[g.ki][1]); });
    const m = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; dir[code] = Math.abs(m) > 20 ? Math.sign(m) : 0;
  });
  if (!dir.R && dir.B) dir.R = -dir.B; if (!dir.B && dir.R) dir.B = -dir.R;
  ['R', 'B'].forEach((code) => { // sin tiros ni goles: se supone que cada equipo toca más en campo rival
    if (dir[code]) return; let n = 0, sx = 0; P.forEach((p) => { if (p.team === code) { n += p.kicks; sx += p.sx; } }); dir[code] = n && Math.abs(sx / n) > 20 ? Math.sign(sx / n) : 0;
  });
  const xsAll = part.kicks.map((k) => Math.abs(k[1])); const half = xsAll.length >= 6 ? Math.max(200, Math.max.apply(null, xsAll)) : 0;
  const form = {};
  ['R', 'B'].forEach((code) => {
    const mem = P.filter((p) => p.team === code); mem.forEach((p) => { p.depth = null; p.role = null; });
    if (!dir[code] || !half) { form[code] = null; return; }
    const rated = mem.filter((p) => p.kicks >= 2);
    rated.forEach((p) => { p.depth = Math.max(-1, Math.min(1, dir[code] * (p.sx / p.kicks) / half)); });
    rated.sort((a, b) => a.depth - b.depth);
    rated.forEach((p, i) => {
      const gap = rated[i + 1] ? rated[i + 1].depth - p.depth : 1;
      if (i === 0 && rated.length >= 2 && p.depth <= -0.45 && (gap >= 0.12 || p.depth <= -0.7)) p.role = 'GK';
      else p.role = p.depth < -0.12 ? 'DEF' : p.depth > 0.22 ? 'FWD' : 'MID';
    });
    const c = { GK: 0, DEF: 0, MID: 0, FWD: 0 }; rated.forEach((p) => { c[p.role]++; });
    form[code] = { GK: c.GK, DEF: c.DEF, MID: c.MID, FWD: c.FWD, text: (c.GK ? 'Portero + ' : '') + [c.DEF, c.MID, c.FWD].join('-'), dir: dir[code] };
  });
  return form;
}

// Tramo principal de una repetición (el de más duración, igual que el historial de la app)
export function mainPartIndex(parts) {
  let best = 0; (parts || []).forEach((p, i) => { if (p.ticks > parts[best].ticks) best = i; }); return best;
}

// ---------- 3. Agregación de actuaciones ----------
export const SUM_KEYS = ['goals', 'assists', 'ownGoals', 'kicks', 'shotsOT', 'passesCompleted', 'passesReceived', 'passesFailed', 'turnovers', 'recoveries', 'interceptions', 'blocks', 'keyPasses', 'goalInvolvements'];
export function aggregateRows(rows) {
  const t = { matches: rows.length };
  SUM_KEYS.forEach((k) => { t[k] = rows.reduce((s, r) => s + (r[k] || 0), 0); });
  const avg = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  t.offParticipation = avg('offParticipation'); t.defParticipation = avg('defParticipation'); t.kickShare = avg('kickShare'); t.goalShare = avg('goalShare');
  const att = t.passesCompleted + t.passesFailed; t.passAccuracy = att > 0 ? t.passesCompleted / att : null;
  t.conversion = t.shotsOT > 0 ? t.goals / t.shotsOT : null;
  t.perMatch = {}; SUM_KEYS.forEach((k) => { t.perMatch[k] = rows.length ? t[k] / rows.length : 0; });
  return t;
}

// ---------- 4. Calificaciones ----------
export const CRITERIA = [
  { id: 'positioning', label: 'Posicionamiento', auto: true },
  { id: 'vision', label: 'Visión de juego', auto: true },
  { id: 'passing', label: 'Precisión de pases', auto: true },
  { id: 'finishing', label: 'Definición', auto: true },
  { id: 'defense', label: 'Defensa', auto: true },
  { id: 'recoveries', label: 'Recuperaciones', auto: true },
  { id: 'involvement', label: 'Participación', auto: true },
  { id: 'creation', label: 'Creación de oportunidades', auto: true },
  { id: 'decisions', label: 'Decisiones', auto: true },
];
// Criterios propios del portero (se usan cuando en ese partido jugó de portero)
export const GK_CRITERIA = [
  { id: 'saves', label: 'Paradas', auto: true },
  { id: 'concede', label: 'Goles encajados', auto: true },
  { id: 'gkPosition', label: 'Colocación', auto: true },
  { id: 'clearances', label: 'Despejes y salidas', auto: true },
  { id: 'distribution', label: 'Distribución', auto: true },
  { id: 'security', label: 'Seguridad con el balón', auto: true },
];
export const GK_WEIGHTS = { saves: 2.2, concede: 2.2, gkPosition: 1.4, clearances: 1, distribution: 1, security: 1 };
export const criteriaFor = (role) => (role === 'GK' ? GK_CRITERIA : CRITERIA);
export const MIN_POP_ROWS = 8, MIN_POP_MATCHES = 2, MIN_PLAYER_KICKS = 3;

function pctRank(v, pop) {
  if (v == null || !pop.length) return null;
  let lt = 0, eq = 0; pop.forEach((x) => { if (x < v) lt++; else if (x === v) eq++; });
  return (lt + 0.5 * eq) / pop.length;
}
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const clamp10 = (x) => Math.max(0, Math.min(10, x));

// Nota del resultado del partido para el equipo del jugador (0–10): victoria 7–10 según la diferencia, empate 5, derrota 0–3.
export function resultScore(gf, ga) {
  if (gf == null || ga == null) return null;
  const d = gf - ga;
  return d > 0 ? Math.min(10, 7 + 0.75 * d) : d < 0 ? Math.max(0, 3 + 0.75 * d) : 5;
}

// TODAS las calificaciones salen del motor: del partido (resultado, goles, tiros, pases, toques, recuperaciones…) y, si hay suficientes datos,
// se mezclan con el percentil del jugador frente a otras actuaciones EN EL MISMO ROL. No hay nada manual.
// Se juzga según lo que jugó en ESE partido (row.role: GK/DEF/MID/FWD): a un portero no se le exige marcar ni crear, a un delantero no se le
// castiga por no defender. Los criterios que no aplican al rol quedan sin valor (null) y no entran en la media.
// row.ctx = contexto del equipo en ese partido { gf, ga, poss, size, shotsOTAgainst }.
export const ROLE_WEIGHTS = {
  GK: { defense: 2.5, positioning: 1.5, passing: 1, decisions: 1, recoveries: 0.7, vision: 0.5 },
  DEF: { defense: 1.6, recoveries: 1.2, positioning: 1.2, passing: 1, decisions: 1, involvement: 0.8, vision: 0.8, creation: 0.6, finishing: 0.6 },
  MID: { passing: 1.2, vision: 1.2, creation: 1.2, recoveries: 1, involvement: 1.2, positioning: 1, decisions: 1, defense: 0.8, finishing: 0.8 },
  FWD: { finishing: 1.8, creation: 1.2, involvement: 1, positioning: 1, passing: 0.8, decisions: 1, vision: 0.8, recoveries: 0.5, defense: 0.4 },
};
export function autoRatings(row, population) {
  const ctx = row.ctx || {};
  const role = row.role || null;
  const pop = role ? population.filter((r) => r.role === role) : population;
  const popOk = pop.length >= MIN_POP_ROWS && new Set(pop.map((r) => r.matchId)).size >= MIN_POP_MATCHES;
  const col = (f) => pop.map(f);
  const att = row.passesCompleted + row.passesFailed;
  const acc = att >= 3 ? row.passesCompleted / att : null;
  const accOf = (r) => { const a = r.passesCompleted + r.passesFailed; return a >= 3 ? r.passesCompleted / a : null; };
  const blend = (abs, pct) => (abs == null ? null : popOk && pct != null ? 0.5 * abs + 0.5 * (pct * 10) : abs);
  const lowData = row.kicks < MIN_PLAYER_KICKS;
  const size = ctx.size > 0 ? ctx.size : 3;
  const share = row.kickShare != null ? row.kickShare : null;
  const gk = role === 'GK', def = role === 'DEF', fwd = role === 'FWD';
  if (gk) { // ---- criterios de portero (0–10; null = sin datos para valorarlo en este partido)
    const faced = ctx.shotsOTAgainst != null ? ctx.shotsOTAgainst : null, ga = ctx.ga != null ? ctx.ga : null;
    const saved = faced != null && ga != null ? Math.max(0, faced - ga) : null;
    const saves = faced != null && faced > 0 && saved != null ? clamp10(10 * (saved / faced) * 0.9 + Math.min(1.5, 0.5 * saved)) : null;
    const concede = ga != null ? clamp10(10 - 2.2 * ga - 1.5 * row.ownGoals + (faced != null && faced > 0 ? 0.6 * Math.min(saved || 0, 3) : 0)) : null;
    const zone = row.depth != null ? clamp10(10 - 7 * Math.abs(row.depth + 0.8)) : null;
    const gkPosition = zone != null ? zone : 5;
    const act = row.blocks + row.interceptions + row.recoveries;
    const clearances = clamp10(5 + 1.2 * act - 0.4 * (row.turnovers > 2 ? row.turnovers - 2 : 0));
    const distribution = acc != null ? blend(clamp10((acc - 0.4) / 0.55 * 10), pctRank(acc, col(accOf).filter((x) => x != null))) : null;
    const sec = row.kicks > 0 ? 1 - row.turnovers / row.kicks : null;
    const security = sec != null ? clamp10((sec - 0.45) / 0.5 * 10) : null;
    const values = { saves, concede, gkPosition, clearances, distribution, security };
    Object.keys(values).forEach((k) => { values[k] = values[k] == null ? null : r1(clamp10(values[k])); });
    const res = resultScore(ctx.gf, ctx.ga);
    return { values, enough: true, lowData, role, criteria: 'GK', weights: GK_WEIGHTS, result: res, popOk, faced, saved, reason: faced === 0 ? 'Su portería no recibió tiros a puerta: las paradas no se puntúan y la nota se apoya en lo demás.' : (lowData ? 'Pocos toques en este partido (' + row.kicks + '): la nota se apoya sobre todo en las paradas, los goles encajados y el resultado.' : '') };
  }

  // ---- criterios (valor 0–10, o null si no aplica a su rol en este partido)
  const passing = acc != null ? blend(clamp10((acc - 0.4) / 0.55 * 10), pctRank(acc, col(accOf).filter((x) => x != null))) : 5;
  const shots = row.shotsOT + row.goals;
  const finAbs = clamp10((fwd ? 4 : 5) + 1.8 * row.goals + 0.6 * Math.max(0, row.shotsOT - row.goals) - 1.5 * row.ownGoals);
  const finishing = (gk || def || role === 'MID') && shots === 0 && row.ownGoals === 0 ? null : blend(finAbs, mean([pctRank(row.goals, col((r) => r.goals)), pctRank(row.shotsOT, col((r) => r.shotsOT))]));
  const defCount = row.blocks + row.interceptions;
  const concededPenalty = ctx.ga != null ? Math.min(2.5, 0.6 * ctx.ga) : 0, cleanBonus = ctx.ga === 0 ? 1 : 0;
  let defense;
  if (gk) { // portero: paradas (tiros a puerta que le llegaron y no fueron gol), goles encajados y portería a cero
    const faced = ctx.shotsOTAgainst != null ? ctx.shotsOTAgainst : null, saves = faced != null && ctx.ga != null ? Math.max(0, faced - ctx.ga) : 0;
    defense = clamp10(5 + 1.0 * saves + 0.4 * defCount - 1.4 * (ctx.ga || 0) + (ctx.ga === 0 ? 1.5 : 0) - 1.5 * row.ownGoals);
  } else if (fwd && defCount === 0 && row.ownGoals === 0) defense = null;
  else defense = blend(clamp10(5 + 1.1 * defCount + (row.defParticipation != null ? 1.5 * (row.defParticipation - 1 / size) * size / 2 : 0) - (fwd ? 0 : concededPenalty) + (fwd ? 0 : cleanBonus) - 1.5 * row.ownGoals), pctRank(defCount, col((r) => r.blocks + r.interceptions)));
  const recAbs = clamp10((gk ? 5 : 4) + (gk ? 0.8 : 1.0) * row.recoveries + 0.4 * row.interceptions);
  const recoveries = fwd && row.recoveries === 0 && row.interceptions === 0 ? null : blend(recAbs, pctRank(row.recoveries, col((r) => r.recoveries)));
  const invAbs = share != null ? clamp10(5 * (share * size)) : 5;
  const involvement = gk ? null : blend(invAbs, share != null ? pctRank(share, col((r) => r.kickShare).filter((x) => x != null)) : null);
  const creAbs = clamp10(4 + 2.2 * row.assists + 1.0 * row.keyPasses);
  const creation = (gk || def) && row.assists === 0 && row.keyPasses === 0 ? null : blend(creAbs, mean([pctRank(row.assists, col((r) => r.assists)), pctRank(row.keyPasses, col((r) => r.keyPasses))]));
  // Posicionamiento: qué tan bien ocupó la zona que le toca a su rol (portero atrás, defensa atrás-medio, medio centro, delantero arriba) y si su equipo dominó.
  const ideal = gk ? -0.8 : def ? -0.35 : fwd ? 0.4 : 0;
  const dom = ctx.poss != null ? ctx.poss - 0.5 : 0;
  const zone = row.depth != null ? clamp10(10 - 7 * Math.abs(row.depth - ideal)) : null;
  const bal = row.offParticipation != null && row.defParticipation != null ? 1 - Math.min(1, Math.abs(row.offParticipation - row.defParticipation) * size) : 0.5;
  const positioning = zone != null ? clamp10(0.75 * zone + 2.5 * 0.5 + 3 * dom) : clamp10(4 + 3 * bal + 6 * dom + (share != null ? 2 * Math.min(1, share * size / 2) : 0));
  // Visión: pases clave y asistencias con pases de calidad (portero y defensa: solo la calidad del pase)
  const vision = gk || def ? (creation != null ? 0.5 * creation + 0.5 * passing : passing) : clamp10(0.45 * creation + 0.35 * passing + 0.2 * (involvement != null ? involvement : 5));
  // Decisiones: cuidar el balón (pérdidas por toque) y elegir bien los tiros.
  const sec = row.kicks > 0 ? 1 - row.turnovers / row.kicks : null;
  const decAbs = sec != null ? clamp10((sec - 0.45) / 0.5 * 10) : 5;
  const decisions = clamp10(shots > 0 ? 0.8 * decAbs + 0.2 * finAbs : decAbs);
  const values = { positioning, vision, passing, finishing, defense, recoveries, involvement, creation, decisions };
  Object.keys(values).forEach((k) => { values[k] = values[k] == null ? null : r1(clamp10(values[k])); });
  const res = resultScore(ctx.gf, ctx.ga);
  return { values, enough: true, lowData, role, weights: ROLE_WEIGHTS[role] || null, result: res, popOk, reason: lowData ? 'Pocos toques en este partido (' + row.kicks + '): la nota se apoya sobre todo en el resultado y el resto del equipo.' : '' };
}

// Valor final por criterio: manual > automático. La nota general sale de la media de criterios disponibles (≥ 3) salvo que haya una manual.
export function finalRatings(manual, auto) {
  // La calificación es 100 % calculada (el parámetro manual se conserva solo por compatibilidad con copias antiguas y se ignora).
  const list = criteriaFor(auto && auto.criteria === 'GK' ? 'GK' : null);
  const out = {}, src = {};
  list.forEach((c) => { const a = auto && auto.values ? auto.values[c.id] : null; out[c.id] = a != null ? a : null; src[c.id] = a != null ? 'calc' : null; });
  const vals = list.map((c) => out[c.id]).filter((x) => x != null);
  if (vals.length >= 3) {
    const w = (auto && auto.weights) || {}; let sw = 0, sv = 0; list.forEach((c) => { if (out[c.id] != null) { const k = w[c.id] != null ? w[c.id] : 1; sw += k; sv += k * out[c.id]; } });
    const base = sw > 0 ? sv / sw : mean(vals), res = auto && auto.result != null ? auto.result : null;
    out.overall = r1(clamp10(res != null ? 0.75 * base + 0.25 * res : base)); src.overall = 'calc';
  } else { out.overall = null; src.overall = null; }
  return { values: out, sources: src, criteria: auto && auto.criteria === 'GK' ? 'GK' : 'STD' };
}
