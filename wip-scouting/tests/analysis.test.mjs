import { compactPart, analyzePart, autoRatings, finalRatings, aggregateRows } from '../src/scouting/analysis.js';
import assert from 'assert';
const K = (player, x, y) => ({ player, x, y });
const kicks = [K('A',0,0),K('B',50,0),K('B',80,0),K('C',200,0),K('D',210,0),K('A',-150,0),K('B',-100,0),K('B',-60,0),K('C',0,0),K('A',5,0)];
const raw = {
  gameTicks: 3600, scoreRed: 1, scoreBlue: 0, possRed: 70, possBlue: 30, thirds: [10,20,30], kicksRed: 7, kicksBlue: 3, passesRed: 2, passesBlue: 1,
  redTeam: ['A','B'], blueTeam: ['C','D'], player: [{nick:'A',nation:'co'},{nick:'B',nation:'br'},{nick:'C',nation:'ar'},{nick:'D',nation:'uy'}],
  kicks, shots: [{ player: 'B', from: { x: -60, y: 0 }, to: { x: -200, y: 0 } }],
  goals: [{ scorer: 'B', assist: { player: 'A', shot: kicks[6] }, currentScore: [1,0], shot: kicks[7], for: 'Red' }],
  passes: [{player:'A'},{player:'C'},{player:'A'}], stadium: { name: 'Test' },
};
const part = compactPart(raw); const a = analyzePart(part);
const by = (n) => a.players.find((p) => p.nick === n);
assert.deepStrictEqual(part.goals[0].ki, 7); assert.deepStrictEqual(part.shots, [[1,7]]);
assert.strictEqual(a.consistency.passesMatch, true); assert.strictEqual(a.consistency.scoreMatchesGoals, true); assert.strictEqual(a.consistency.kicksMatch, true);
assert.strictEqual(by('A').passesCompleted, 2); assert.strictEqual(by('B').passesReceived, 2); assert.strictEqual(by('C').passesCompleted, 1);
assert.strictEqual(by('B').turnovers, 1); assert.strictEqual(by('B').passesFailed, 1); assert.strictEqual(by('C').interceptions, 1);
assert.strictEqual(by('D').turnovers, 1); assert.strictEqual(by('A').interceptions, 1); assert.strictEqual(by('A').recoveries, 1);
assert.strictEqual(by('C').turnovers, 1); assert.strictEqual(by('B').turnovers, 1, 'saque tras gol no es pérdida de B'); assert.strictEqual(by('C').blocks, 0);
console.log('C turnovers', by('C').turnovers);
assert.strictEqual(by('B').goals, 1); assert.strictEqual(by('A').assists, 1); assert.strictEqual(by('B').shotsOT, 1);
assert.strictEqual(by('A').keyPasses, 1, 'A→B y B dispara en su racha');
assert.strictEqual(a.teams.R.possession, 0.7); assert.strictEqual(a.teams.R.goals, 1); assert.strictEqual(a.teams.B.goalsAgainst, 1);
assert.strictEqual(a.teams.B.shotsOTAgainst, 1); assert.strictEqual(a.teams.B.savesImplied, 0);
assert.ok(a.teams.R.shotsOT === 1);
// valoraciones: siempre automáticas (con o sin población), con el resultado del partido
const ctxB = { gf: a.score[1], ga: a.score[0], poss: a.teams.B.possession, size: a.teams.B.players };
const pop = [by('A'), by('B')].map((r) => ({ ...r, matchId: 'm1' }));
const small = autoRatings({ ...by('B'), ctx: ctxB }, pop); assert.strictEqual(small.enough, true); assert.strictEqual(small.popOk, false);
const big = []; for (let m = 0; m < 3; m++) for (const p of a.players) big.push({ ...p, matchId: 'm' + m });
const ar = autoRatings({ ...by('B'), role: null, ctx: ctxB }, big); assert.strictEqual(ar.enough, true);
['positioning', 'vision', 'passing', 'finishing', 'defense', 'recoveries', 'involvement', 'creation', 'decisions'].forEach((k) => { assert.ok(typeof ar.values[k] === 'number' && ar.values[k] >= 0 && ar.values[k] <= 10, k + ' ' + ar.values[k]); });
const fr = finalRatings({ vision: 8 }, ar); assert.strictEqual(fr.values.vision, ar.values.vision, 'lo manual se ignora'); assert.strictEqual(fr.sources.vision, 'calc');
assert.ok(fr.values.overall >= 0 && fr.values.overall <= 10); assert.strictEqual(fr.sources.overall, 'calc');
// el resultado pesa: mismo jugador, ganando 5-0 sale mejor que perdiendo 0-5
const win = finalRatings(null, autoRatings({ ...by('B'), role: null, ctx: { ...ctxB, gf: 5, ga: 0 } }, big)).values.overall, lose = finalRatings(null, autoRatings({ ...by('B'), role: null, ctx: { ...ctxB, gf: 0, ga: 5 } }, big)).values.overall;
assert.ok(win > lose, 'ganar puntúa más que perder: ' + win + ' vs ' + lose);
// roles: un jugador que solo toca cerca de su propia portería es portero y no se le exige marcar ni crear
const mk = (o) => ({ passesCompleted: 4, passesFailed: 1, kicks: 6, shotsOT: 0, goals: 0, assists: 0, ownGoals: 0, blocks: 0, interceptions: 0, recoveries: 1, turnovers: 1, keyPasses: 0, kickShare: 0.15, offParticipation: 0, defParticipation: 0.3, ctx: { gf: 1, ga: 1, poss: 0.5, size: 4, shotsOTAgainst: 3 }, ...o });
const gkR = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 4 }), []); assert.strictEqual(gkR.criteria, 'GK'); ['saves', 'concede', 'gkPosition', 'clearances', 'distribution', 'security'].forEach((k) => assert.ok(typeof gkR.values[k] === 'number', 'criterio de portero ' + k));
assert.strictEqual(gkR.values.finishing, undefined, 'el portero no tiene criterios de delantero'); assert.ok(gkR.values.saves > 5, 'paradas: ' + gkR.values.saves);
const gkBad = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 0, ctx: { gf: 0, ga: 5, poss: 0.5, size: 4, shotsOTAgainst: 5 } }), []); assert.ok(finalRatings(null, gkBad).values.overall < finalRatings(null, gkR).values.overall, 'encajar más puntúa menos');
const gkClean = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 4, ctx: { gf: 2, ga: 0, poss: 0.5, size: 4, shotsOTAgainst: 4 } }), []); assert.ok(gkClean.values.concede === 10 && gkClean.values.saves >= 9, 'portería a cero con paradas');
// el portero no recibe nota de goles encajados si no tuvo nada que juzgar; sus goles son solo los de su etapa; los bloqueos de defensas no son paradas suyas
const gkIdle = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 0, ctx: { gf: 3, ga: 0, poss: 0.7, size: 4, shotsOTAgainst: 0 } }), []); assert.strictEqual(gkIdle.values.concede, null); assert.strictEqual(gkIdle.values.saves, null);
const gkPart = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 2, gaResp: 0, ctx: { gf: 0, ga: 3, poss: 0.5, size: 4 } }), []), gkAll = autoRatings(mk({ role: 'GK', depth: -0.85, blocks: 2, ctx: { gf: 0, ga: 3, poss: 0.5, size: 4 } }), []); assert.ok(gkPart.values.concede > gkAll.values.concede, 'solo los goles de su etapa');
const fwR = autoRatings(mk({ role: 'FWD', depth: 0.4, recoveries: 0 }), []); assert.ok(fwR.values.finishing == null && fwR.values.shooting == null, 'sin tiros a puerta no se juzga definición/remate (el motor no ve los tiros fallados)'); assert.strictEqual(fwR.values.pressing, null, 'delantero sin presión: no se castiga'); assert.strictEqual(fwR.criteria, 'FWD');
{ // minutos jugados: quien juega poco se acerca al 5 y pesa menos
  const full = finalRatings(null, autoRatings(mk({ role: 'MID', depth: 0, played: 1, goals: 2, shotsOT: 3 }), [])), few = finalRatings(null, autoRatings(mk({ role: 'MID', depth: 0, played: 0.03, playedSec: 20, goals: 2, shotsOT: 3 }), []));
  assert.ok(Math.abs(few.values.overall - 5) < Math.abs(full.values.overall - 5), 'poco tiempo: nota más neutra'); assert.ok(few.weight < 1 && full.weight === 1, 'peso por minutos');
  const bad = finalRatings(null, autoRatings(mk({ role: 'GK', depth: -0.85, played: 0.05, ctx: { gf: 0, ga: 5, poss: 0.5, size: 4, shotsOTAgainst: 5 } }), [])); assert.ok(bad.values.overall > 3.5, 'entrar al final no te hunde: ' + bad.values.overall); }
{ const t = compactPart({ ...raw, changes: [['C', 'Spectators', '0:30'], ['D', 'Red', '0:40']] }); assert.ok(t.players.find((p) => p.nick === 'C').sec <= 30 && t.players.find((p) => p.nick === 'D').sec <= raw.gameTicks / 60, 'minutos desde los cambios'); assert.strictEqual(t.players.find((p) => p.nick === 'A').sec, undefined); }
{ const R = { DEF: ['cuts', 'solidity', 'defPosition', 'recoveries', 'buildUp', 'security'], MID: ['passing', 'creation', 'vision', 'control', 'work', 'midPosition', 'decisions'], FWD: ['finishing', 'shooting', 'threat', 'linkup', 'fwdPosition', 'pressing', 'decisions'] };
  for (const k of Object.keys(R)) { const r = autoRatings(mk({ role: k, depth: k === 'DEF' ? -0.35 : k === 'FWD' ? 0.4 : 0 }), []); assert.deepStrictEqual(Object.keys(r.values).sort(), R[k].slice().sort(), k); Object.values(r.values).forEach((v) => assert.ok(v == null || (v >= 0 && v <= 10))); assert.ok(finalRatings(null, r).values.overall != null, k + ' overall'); } }
const ovGK = finalRatings(null, gkR).values.overall; assert.ok(ovGK != null && ovGK > 4, 'portero con paradas no sale castigado: ' + ovGK);
console.log('autoRatings B', ar.values, 'final', fr.values.overall);
const agg = aggregateRows([by('A'), by('B')]); assert.strictEqual(agg.goals, 1); assert.strictEqual(agg.matches, 2);
console.log('OK analysis');
// capa 1 y 2 de puestos: equipo adelantado y rotaciones
{ const mkPart = (kicks, names) => ({ v: 1, ticks: 36000, spaceMode: false, stadium: '', scoreRed: 1, scoreBlue: 0, possRed: 60, possBlue: 40, thirds: [1, 1, 1], kicksRed: kicks.length, kicksBlue: 0, passesRed: 0, passesBlue: 0, players: names.map((n) => ({ nick: n, nation: '', team: n === 'X' ? 'B' : 'R' })), kicks, shots: [[3, kicks.length - 1]], goals: [], ep: {} });
  // todo el equipo arriba: el portero (-80) sigue siendo portero y el defensa más atrasado no es delantero
  const K1 = []; [[0, -80], [1, 150], [2, 200], [3, 250]].forEach(([i, x]) => { for (let n = 0; n < 5; n++) K1.push([i, x, 0]); }); K1.push([4, 0, 0], [4, 0, 0]); K1.push([3, 250, 0]);
  const r1 = analyzePart(mkPart(K1, ['G', 'D', 'M', 'F', 'X'])); const R1 = (n) => r1.players.find((p) => p.nick === n);
  assert.strictEqual(R1('G').role, 'GK', 'portero con el equipo arriba'); assert.notStrictEqual(R1('D').role, 'FWD', 'el más atrasado del equipo no es delantero');
  // rotación: A empieza de defensa y acaba de delantero
  const K2 = []; for (let b = 0; b < 3; b++) for (let n = 0; n < 8; n++) { K2.push([0, -250, 0]); K2.push([1, b === 0 ? -150 : b === 1 ? 0 : 250, 0]); K2.push([2, 0, 0]); K2.push([3, 200, 0]); } K2.push([4, 0, 0], [4, 0, 0]); K2.push([3, 250, 0]);
  const r2 = analyzePart(mkPart(K2, ['G', 'A', 'B', 'C', 'X'])); const A = r2.players.find((p) => p.nick === 'A');
  assert.ok(A.roleMix && A.roleMix.length >= 2, 'rotación detectada: ' + JSON.stringify(A.role) + JSON.stringify(A.roleMix));
  const ra = autoRatings({ ...A, ctx: { gf: 1, ga: 0, poss: .5, size: 4, shotsOTAgainst: 0 } }, []); assert.ok(ra.mix && ra.mix.length >= 2 && Math.abs(ra.mix.reduce((s, m) => s + m.share, 0) - 1) < 1e-9, 'mezcla de puestos'); assert.ok(finalRatings(null, ra).values.overall != null);
}
console.log('OK puestos relativos y rotaciones');
// ---- correcciones de errores (lista de fallos)
{ const build = (names, K, shooter, sx = 250, sec = {}) => { K.push([9, 0, 0], [9, 0, 0]); K.push([names.indexOf(shooter), sx, 0]); const p = { v: 1, ticks: 36000, spaceMode: false, stadium: '', scoreRed: 1, scoreBlue: 0, possRed: 60, possBlue: 40, thirds: [1, 1, 1], kicksRed: K.length, kicksBlue: 0, passesRed: 0, passesBlue: 0, players: [...names, 'XX'].map((n) => ({ nick: n, nation: '', team: n === 'XX' ? 'B' : 'R', ...(sec[n] != null ? { sec: sec[n] } : {}) })), kicks: K, shots: [[names.indexOf(shooter), K.length - 1]], goals: [], ep: {} }; return analyzePart(p); };
  const role = (r, n) => r.players.find((p) => p.nick === n);
  // 2 contra 2: nadie es portero
  { const K = []; for (let i = 0; i < 8; i++) { K.push([0, -90, 0]); K.push([1, 180, 0]); } const r = build(['D', 'F'], K, 'F'); assert.notStrictEqual(role(r, 'D').role, 'GK', '2v2 sin portero'); }
  // chutazo desde su campo: no se invierte la dirección
  { const K = []; [['G', -250], ['D', -120], ['M', 0], ['F', 200]].forEach(([n, x], i) => { for (let q = 0; q < 6; q++) K.push([i, x, 0]); }); const r = build(['G', 'D', 'M', 'F'], K, 'F', -25); assert.strictEqual(role(r, 'G').role, 'GK', 'portero con un tiro desde x=-25'); assert.strictEqual(role(r, 'F').role, 'FWD'); }
  // todos suben, incluido el portero: el más atrasado es al menos defensa
  { const K = []; [['G', 100], ['D', 150], ['M', 200], ['F', 250]].forEach(([n, x], i) => { for (let q = 0; q < 6; q++) K.push([i, x, 0]); }); const r = build(['G', 'D', 'M', 'F'], K, 'F'); assert.strictEqual(role(r, 'G').role, 'DEF', 'el más atrasado no es medio/delantero'); }
  // portero que pasa a defensa y entra otro portero: ambos puestos y goles solo de su etapa
  { const K = []; for (let b = 0; b < 2; b++) for (let q = 0; q < 10; q++) { K.push([0, b === 0 ? -250 : -100, 0]); K.push([b === 0 ? 2 : 1, b === 0 ? -100 : -250, 0]); K.push([3, 0, 0]); K.push([4, 200, 0]); }
    const names = ['G1', 'G2', 'D', 'M', 'F']; K.push([5, 0, 0], [5, 0, 0]); K.push([4, 250, 0]); const p0 = { v: 1, ticks: 36000, spaceMode: false, stadium: '', scoreRed: 0, scoreBlue: 1, possRed: 60, possBlue: 40, thirds: [1, 1, 1], kicksRed: K.length, kicksBlue: 0, passesRed: 0, passesBlue: 0, players: [...names, 'XX'].map((n) => ({ nick: n, nation: '', team: n === 'XX' ? 'B' : 'R' })), kicks: K, shots: [[4, K.length - 1]], goals: [{ ki: 5, s: 5, a: -1, f: 'B', own: false, sc: [0, 1] }], ep: {} };
    const r = analyzePart(p0); const g1 = role(r, 'G1'), g2 = role(r, 'G2');
    assert.ok(g1.roleMix && g1.roleMix.some((m) => m.role === 'GK') && g1.roleMix.some((m) => m.role === 'DEF'), 'G1 portero y defensa');
    assert.strictEqual(g2.role, 'GK'); assert.strictEqual(g1.gaResp, 1, 'el gol cayó en la etapa de G1'); assert.strictEqual(g2.gaResp, 0, 'G2 no recibió ese gol'); }
}
{ const mk2 = (o) => ({ passesCompleted: 7, passesFailed: 2, kicks: 10, shotsOT: 3, goals: 2, assists: 0, ownGoals: 0, blocks: 0, interceptions: 0, recoveries: 0, turnovers: 2, keyPasses: 1, kickShare: 0.3, offParticipation: .5, defParticipation: 0.3, role: 'FWD', depth: .4, played: 1, ctx: { gf: 2, ga: 1, poss: .55, size: 3 }, ...o });
  // suplente decisivo: 2 goles en el último minuto no se quedan en 5
  const sub = finalRatings(null, autoRatings(mk2({ played: .05, goals: 2, shotsOT: 2 }), [])).values.overall, idle = finalRatings(null, autoRatings(mk2({ played: .05, goals: 0, shotsOT: 0, offParticipation: .2 }), [])).values.overall; assert.ok(sub > idle + 1, 'suplente decisivo ' + sub + ' vs ' + idle);
  // presión: hacer un poco nunca resta frente a no hacer nada
  const p0 = finalRatings(null, autoRatings(mk2({ recoveries: 0 }), [])).values.overall; [1, 2, 3].forEach((n) => assert.ok(finalRatings(null, autoRatings(mk2({ recoveries: n }), [])).values.overall >= p0, 'presión ' + n));
  // cortes del defensa: sin tope duro a los 4; sin autogol doble; posesión no regala colocación
  const dmk = (o) => ({ ...mk2({ role: 'DEF', depth: -.35, blocks: 2, interceptions: 2, recoveries: 0 }), ...o });
  assert.ok(autoRatings(dmk({ blocks: 6, interceptions: 6 }), []).values.cuts > autoRatings(dmk({}), []).values.cuts, 'más cortes, más nota');
  assert.strictEqual(autoRatings(dmk({ ownGoals: 1 }), []).values.solidity, autoRatings(dmk({}), []).values.solidity, 'el autogol no se cobra dos veces');
  assert.strictEqual(autoRatings(mk2({ role: 'MID', depth: 0, ctx: { gf: 1, ga: 1, poss: .9, size: 3 } }), []).values.midPosition, autoRatings(mk2({ role: 'MID', depth: 0, ctx: { gf: 1, ga: 1, poss: .1, size: 3 } }), []).values.midPosition, 'la posesión no regala colocación');
  // la nota no cambia al añadir partidos (sin percentil)
  const big2 = []; for (let m = 0; m < 4; m++) for (let i = 0; i < 4; i++) big2.push({ ...mk2({ goals: i }), matchId: 'm' + m }); assert.deepStrictEqual(autoRatings(mk2({}), []).values, autoRatings(mk2({}), big2).values, 'nota estable');
}
console.log('OK correcciones');
