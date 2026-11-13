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
  ['Calificaciones y notas', 'manual', 'Las introduce el usuario. Un valor manual siempre prevalece sobre el automático.'],
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
  { id: 'positioning', label: 'Posicionamiento', auto: false },
  { id: 'vision', label: 'Visión de juego', auto: false },
  { id: 'passing', label: 'Precisión de pases', auto: true },
  { id: 'finishing', label: 'Definición', auto: true },
  { id: 'defense', label: 'Defensa', auto: true },
  { id: 'recoveries', label: 'Recuperaciones', auto: true },
  { id: 'involvement', label: 'Participación', auto: true },
  { id: 'creation', label: 'Creación de oportunidades', auto: true },
  { id: 'decisions', label: 'Decisiones', auto: false },
];
export const MIN_POP_ROWS = 8, MIN_POP_MATCHES = 2, MIN_PLAYER_KICKS = 3;

function pctRank(v, pop) {
  if (v == null || !pop.length) return null;
  let lt = 0, eq = 0; pop.forEach((x) => { if (x < v) lt++; else if (x === v) eq++; });
  return (lt + 0.5 * eq) / pop.length;
}
const mean = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

// population: filas {matchId, ...métricas}. Devuelve { values: {critId: 0-10|null}, enough, reason }
export function autoRatings(row, population) {
  const matchesInPop = new Set(population.map((r) => r.matchId)).size;
  if (population.length < MIN_POP_ROWS || matchesInPop < MIN_POP_MATCHES) return { values: {}, enough: false, reason: 'Datos insuficientes: se necesitan al menos ' + MIN_POP_ROWS + ' actuaciones de ' + MIN_POP_MATCHES + ' partidos (hay ' + population.length + ' de ' + matchesInPop + ').' };
  if (row.kicks < MIN_PLAYER_KICKS) return { values: {}, enough: false, reason: 'El jugador tiene menos de ' + MIN_PLAYER_KICKS + ' toques en este partido.' };
  const col = (f) => population.map(f);
  const acc = (r) => { const a = r.passesCompleted + r.passesFailed; return a >= 3 ? r.passesCompleted / a : null; };
  const popAcc = col(acc).filter((x) => x != null);
  const s = (p) => (p == null ? null : Math.round(p * 100) / 10);
  const v = {
    passing: s(pctRank(acc(row), popAcc)),
    finishing: s(mean([pctRank(row.goals, col((r) => r.goals)), pctRank(row.shotsOT, col((r) => r.shotsOT))])),
    defense: s(pctRank(row.blocks + row.interceptions, col((r) => r.blocks + r.interceptions))),
    recoveries: s(pctRank(row.recoveries, col((r) => r.recoveries))),
    involvement: s(pctRank(row.kickShare, col((r) => r.kickShare).filter((x) => x != null))),
    creation: s(mean([pctRank(row.assists, col((r) => r.assists)), pctRank(row.keyPasses, col((r) => r.keyPasses))])),
  };
  return { values: v, enough: true, reason: '' };
}

// Valor final por criterio: manual > automático. La nota general sale de la media de criterios disponibles (≥ 3) salvo que haya una manual.
export function finalRatings(manual, auto) {
  const out = {}, src = {};
  CRITERIA.forEach((c) => {
    const m = manual && manual[c.id]; const a = auto && auto.values ? auto.values[c.id] : null;
    if (m != null && m !== '') { out[c.id] = +m; src[c.id] = 'manual'; } else if (a != null) { out[c.id] = a; src[c.id] = 'calc'; } else { out[c.id] = null; src[c.id] = null; }
  });
  const vals = CRITERIA.map((c) => out[c.id]).filter((x) => x != null);
  if (manual && manual.overall != null && manual.overall !== '') { out.overall = +manual.overall; src.overall = 'manual'; }
  else if (vals.length >= 3) { out.overall = Math.round(mean(vals) * 10) / 10; src.overall = 'calc'; }
  else { out.overall = null; src.overall = null; }
  return { values: out, sources: src };
}
