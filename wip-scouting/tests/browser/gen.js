// Generador SINTÉTICO solo para pruebas: imita la forma de los datos del motor (kicks, shots, goals, passes...). No se incluye en la app.
window.__gen = function (seed, red, blue, nKicks) {
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const all = red.map((n) => ({ n, t: 'Red' })).concat(blue.map((n) => ({ n, t: 'Blue' })));
  const m = { gameTicks: nKicks * 90, scoreRed: 0, scoreBlue: 0, possRed: 0, possBlue: 0, thirds: [0, 0, 0], kicksRed: 0, kicksBlue: 0, passesRed: 0, passesBlue: 0, redTeam: red.slice(), blueTeam: blue.slice(), player: all.map((p) => ({ nick: p.n, nation: 'co' })), kicks: [], shots: [], goals: [], passes: [], stadium: { name: 'Classic' }, spaceMode: false };
  let last = null, before = null, x = 0, cur = all[0];
  for (let i = 0; i < nKicks; i++) {
    const r = rnd(); let pool;
    if (!last) pool = all; else if (r < 0.62) pool = all.filter((p) => p.t === last.t && p.n !== last.n); else if (r < 0.80) pool = all.filter((p) => p.t !== last.t); else pool = [last];
    cur = pool[Math.floor(rnd() * pool.length)];
    x = Math.max(-330, Math.min(330, x + (rnd() - 0.5) * 220 + (cur.t === 'Red' ? 25 : -25)));
    const k = { player: cur.n, x: Math.round(x * 10) / 10, y: Math.round((rnd() - 0.5) * 240 * 10) / 10 };
    if (last && last.n !== cur.n && last.t === cur.t) { m.passes.push({ player: last.n }); (cur.t === 'Red' ? (m.passesRed++) : (m.passesBlue++)); }
    m.kicks.push(k); cur.t === 'Red' ? m.kicksRed++ : m.kicksBlue++;
    cur.t === 'Red' ? (m.possRed += 5) : (m.possBlue += 5);
    const third = Math.min(2, Math.max(0, Math.floor((k.x + 330) / 220))); m.thirds[third]++;
    const prev = last && last.n !== cur.n ? last : before; if (last && last.n !== cur.n) before = last;
    const goalZone = cur.t === 'Red' ? k.x > 150 : k.x < -150;
    if (goalZone && rnd() < 0.5) {
      m.shots.push({ player: cur.n, from: { x: k.x, y: k.y }, to: { x: cur.t === 'Red' ? 400 : -400, y: 0 } });
      if (rnd() < 0.35) {
        const assist = before && before.t === cur.t && before.n !== cur.n ? { player: before.n, shot: k } : false;
        if (cur.t === 'Red') m.scoreRed++; else m.scoreBlue++;
        m.goals.push({ scorer: cur.n, assist, currentScore: [m.scoreRed, m.scoreBlue], shot: k, for: cur.t });
        i++; if (i < nKicks) { const rs = all.filter((p) => p.t !== cur.t); const q = rs[Math.floor(rnd() * rs.length)]; m.kicks.push({ player: q.n, x: 0, y: 0 }); q.t === 'Red' ? m.kicksRed++ : m.kicksBlue++; last = q; before = cur; x = 0; continue; }
      }
    }
    last = cur;
  }
  return m;
};
