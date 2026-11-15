// Prueba del puente pizarra <-> Centro de análisis. Uso: node run.mjs  (requiere esbuild y playwright; datos SINTÉTICOS solo de prueba)
import { createRequire } from 'node:module'; import { spawn } from 'node:child_process'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const esbuild = await import(process.env.ESBUILD || 'esbuild');
const S = new URL('.', import.meta.url).pathname, out = fs.mkdtempSync(path.join(os.tmpdir(), 'txc-'));
const stub = (re, file) => ({ filter: re, path: path.resolve(S, '../../../wip-scouting/tests/browser', file) });
await esbuild.build({ entryPoints: [S + 'entry.js'], bundle: true, outfile: out + '/b.js', loader: { '.js': 'jsx', '.optional': 'js' }, logLevel: 'error', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'stubs', setup(b) { b.onResolve({ filter: /^\.\.\/scouting\/(db|model|ingest)$/ }, (x) => ({ path: path.resolve(S, '../../../wip-scouting/src/scouting', x.path.split('/').pop() + '.js') })); b.onResolve({ filter: /^\.\.\/extras$/ }, () => ({ path: stub(0, 'stubs_extras.js').path })); b.onResolve({ filter: /^\.\.\/storage\/history$/ }, () => ({ path: stub(0, 'stubs_history.js').path })); } }] });
fs.writeFileSync(out + '/index.html', '<!doctype html><body><script src="b.js"></script></body>');
const srv = spawn('python3', ['-m', 'http.server', '8771'], { cwd: out, stdio: 'ignore' }); await new Promise((r) => setTimeout(r, 700));
const b = await chromium.launch(), pg = await b.newPage(); const errs = []; pg.on('pageerror', (e) => errs.push(String(e)));
await pg.goto('http://localhost:8771/index.html'); await pg.waitForFunction(() => window.__prov && window.__gen);
assert.deepEqual(await pg.evaluate(() => window.__prov()), [], 'sin datos: lista vacía (no se inventa nada)');
const list = await pg.evaluate(async () => {
  const db = window.__db, ing = window.__ingest; const n1 = ['Matheus', 'Kevin'], n2 = ['Rojas', 'Lopez'];
  await db.putMany('teams', [{ id: 't_f', name: 'Os Fênix', color: '#C89A3D', own: true, createdAt: 1 }]);
  await db.putMany('players', [{ id: 'p0', nick: 'Matheus', aliases: ['Mat'], teamId: 't_f', position: 'Delantero', avatar: null, notes: 'Zurdo', source: 'manual', createdAt: 1 }]);
  for (let i = 0; i < 3; i++) await ing.ingestStats('r' + i, [window.__gen(100 + i * 7, i % 2 ? n2 : n1, i % 2 ? n1 : n2, 160)]);
  return window.__prov();
});
const m = list.find((p) => p.nick === 'Matheus');
assert.ok(list.length >= 4, 'jugadores de las repeticiones: ' + list.length);
assert.equal(m.position, 'Delantero'); assert.equal(m.teamName, 'Os Fênix'); assert.deepEqual(m.aliases, ['Mat']); assert.equal(m.info, 'Zurdo'); assert.equal(m.key, 'matheus');
assert.ok(m.stats.every((s) => ['E', 'C', 'M'].includes(s.prov)) && m.stats.find((s) => s.id === 'matches').value === 3, 'partidos');
for (const p of list) assert.ok(p.rating === null || (typeof p.rating.value === 'number' && p.rating.n >= 1 && ['C', 'M'].includes(p.rating.prov)), 'rating válido o ausente: ' + p.nick);
console.log('puente OK;', list.length, 'jugadores; rating Matheus:', JSON.stringify(m.rating));
assert.deepEqual(errs, []); await b.close(); srv.kill(); console.log('OK combined');
