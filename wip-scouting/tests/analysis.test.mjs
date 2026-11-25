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
const gkR = autoRatings(mk({ role: 'GK', depth: -0.85 }), []); assert.strictEqual(gkR.criteria, 'GK'); ['saves', 'concede', 'gkPosition', 'clearances', 'distribution', 'security'].forEach((k) => assert.ok(typeof gkR.values[k] === 'number', 'criterio de portero ' + k));
assert.strictEqual(gkR.values.finishing, undefined, 'el portero no tiene criterios de delantero'); assert.ok(gkR.values.saves > 5, 'paradas: ' + gkR.values.saves);
const gkBad = autoRatings(mk({ role: 'GK', depth: -0.85, ctx: { gf: 0, ga: 5, poss: 0.5, size: 4, shotsOTAgainst: 5 } }), []); assert.ok(finalRatings(null, gkBad).values.overall < finalRatings(null, gkR).values.overall, 'encajar más puntúa menos');
const gkClean = autoRatings(mk({ role: 'GK', depth: -0.85, ctx: { gf: 2, ga: 0, poss: 0.5, size: 4, shotsOTAgainst: 4 } }), []); assert.ok(gkClean.values.concede === 10 && gkClean.values.saves >= 9, 'portería a cero con paradas');
const fwR = autoRatings(mk({ role: 'FWD', depth: 0.4, recoveries: 0 }), []); assert.ok(fwR.values.finishing != null && fwR.values.finishing <= 4, 'delantero sin tiros se nota'); assert.strictEqual(fwR.values.pressing, null, 'delantero sin presión: no se castiga'); assert.strictEqual(fwR.criteria, 'FWD');
{ const R = { DEF: ['cuts', 'solidity', 'defPosition', 'recoveries', 'buildUp', 'security'], MID: ['passing', 'creation', 'vision', 'control', 'work', 'midPosition', 'decisions'], FWD: ['finishing', 'shooting', 'threat', 'linkup', 'fwdPosition', 'pressing', 'decisions'] };
  for (const k of Object.keys(R)) { const r = autoRatings(mk({ role: k, depth: k === 'DEF' ? -0.35 : k === 'FWD' ? 0.4 : 0 }), []); assert.deepStrictEqual(Object.keys(r.values).sort(), R[k].slice().sort(), k); Object.values(r.values).forEach((v) => assert.ok(v == null || (v >= 0 && v <= 10))); assert.ok(finalRatings(null, r).values.overall != null, k + ' overall'); } }
const ovGK = finalRatings(null, gkR).values.overall; assert.ok(ovGK != null && ovGK > 4, 'portero con paradas no sale castigado: ' + ovGK);
console.log('autoRatings B', ar.values, 'final', fr.values.overall);
const agg = aggregateRows([by('A'), by('B')]); assert.strictEqual(agg.goals, 1); assert.strictEqual(agg.matches, 2);
console.log('OK analysis');
