// Jugadores registrados de la pizarra.
//
// Fuentes (de menor a mayor prioridad), todas de SOLO LECTURA respecto al analizador:
//   1. Plantel guardado por la pizarra (copia de lo visto en el analizador / añadido a mano).
//   2. Repeticiones cargadas ahora en el analizador (estado Redux gameStats.matches).
//   3. Un "proveedor" externo opcional (p. ej. el Centro de análisis): perfiles reales con posición, equipo,
//      estadísticas y calificación media. Si existe, sus cifras mandan, para que sean las mismas en toda la app.
//
// Reglas de datos de la app: no se inventan estadísticas ni calificaciones. Cada cifra lleva su procedencia:
//   E = extraído del motor · C = calculado · M = manual.
//
// Forma de una entrada del registro:
//   { key, nick, aliases:[], nation, team:'red'|'blue'|null, teamName, position, info, avatar,
//     stats:[{ id, label, value, prov }], rating:{ value, n, prov } | null, ratingNote,
//     live, saved, external, id }

export const keyOf = (nick) => String(nick == null ? '' : nick).trim().toLowerCase();

export const PROV_LABEL = { E: 'Extraído', C: 'Calculado', M: 'Manual' };
export const POSITIONS = ['Portero', 'Defensa', 'Mediocentro', 'Delantero', 'Polivalente'];
export const NO_RATING = 'Sin calificación: se calcula en el Centro de análisis con suficientes partidos (≥ 8 actuaciones de ≥ 2 partidos) o se introduce a mano.';

const safe = (v) => (Array.isArray(v) ? v : []);

// Estadísticas que el motor mide directamente por jugador (las mismas que usa el resto de la app)
export function statsFromCounts(c) {
  return [
    { id: 'matches', label: 'Partidos', value: c.matches, prov: 'C' },
    { id: 'goals', label: 'Goles', value: c.goals, prov: 'E' },
    { id: 'assists', label: 'Asistencias', value: c.assists, prov: 'E' },
    { id: 'kicks', label: 'Toques', value: c.kicks, prov: 'E' }
  ];
}

// Agrega las repeticiones cargadas: { [key]: entrada }
export function collectFromMatches(matches) {
  const acc = {};
  for (const m of safe(matches)) {
    if (!m) continue;
    const red = new Set(safe(m.redTeam)), blue = new Set(safe(m.blueTeam));
    const goals = safe(m.goals), kicks = safe(m.kicks);
    for (const pr of safe(m.player)) {
      if (!pr || !pr.nick) continue;
      const nick = pr.nick, k = keyOf(nick);
      const team = red.has(nick) ? 'red' : blue.has(nick) ? 'blue' : null;
      const e = acc[k] || (acc[k] = { key: k, nick, nation: pr.nation || '', team, c: { matches: 0, goals: 0, assists: 0, kicks: 0 } });
      if (!e.nation && pr.nation) e.nation = pr.nation;
      if (team) { e.team = team; e.c.matches++; }
      for (const g of goals) {
        if (!g) continue;
        if (g.scorer === nick) e.c.goals++;
        else if (g.assist && g.assist.player === nick) e.c.assists++;
      }
      for (const x of kicks) if (x && x.player === nick) e.c.kicks++;
    }
  }
  const out = {};
  for (const e of Object.values(acc)) {
    out[e.key] = { key: e.key, nick: e.nick, aliases: [], nation: e.nation, team: e.team, teamName: '', position: '', info: '', avatar: null, stats: statsFromCounts(e.c), rating: null, live: true };
  }
  return out;
}

// Une las tres fuentes. Los alias del proveedor externo enlazan con el mismo jugador.
export function mergeRegistry(live, roster, external) {
  const map = {};
  const aliasTo = {};
  for (const x of safe(external)) {
    const k = x.key || keyOf(x.nick);
    aliasTo[k] = k; for (const a of safe(x.aliases)) if (!aliasTo[keyOf(a)]) aliasTo[keyOf(a)] = k;
  }
  const resolve = (k) => aliasTo[k] || k;

  for (const r of safe(roster)) {
    const k = resolve(r.key || keyOf(r.nick));
    map[k] = { key: k, nick: r.nick, aliases: [], nation: r.nation || '', team: r.team || null, teamName: '', position: r.position || '', info: r.info || '', avatar: null, stats: Array.isArray(r.stats) ? r.stats : null, rating: null, saved: true, id: r.id };
  }
  for (const e of Object.values(live || {})) {
    const k = resolve(e.key), prev = map[k];
    map[k] = { ...(prev || {}), ...e, key: k, nick: (prev && prev.saved && prev.nick) || e.nick, nation: e.nation || (prev && prev.nation) || '', team: e.team || (prev && prev.team) || null, position: (prev && prev.position) || '', info: (prev && prev.info) || '', saved: !!(prev && prev.saved), id: prev && prev.id, live: true };
  }
  for (const x of safe(external)) {
    const k = x.key || keyOf(x.nick), prev = map[k];
    map[k] = {
      ...(prev || {}), ...x, key: k, aliases: safe(x.aliases),
      team: (prev && prev.team) || x.team || null,
      stats: x.stats && x.stats.length ? x.stats : (prev && prev.stats) || null,
      info: x.info || (prev && prev.info) || '', saved: !!(prev && prev.saved), id: prev && prev.id, live: !!(prev && prev.live), external: true
    };
  }
  return Object.values(map).sort((a, b) => a.nick.localeCompare(b.nick, 'es', { sensitivity: 'base' }));
}

// Busca por nick o alias
export function findRegistered(registry, nick) {
  const k = keyOf(nick); if (!k) return null;
  return registry.find((r) => r.key === k || safe(r.aliases).some((a) => keyOf(a) === k)) || null;
}
