import React, { useMemo, useState } from 'react';
import * as db from './db';
import { Card, Empty, Seg, Select, Input, Sheet, Avatar, useConfirm, useLocal, toast } from './ui';
import { PlayerEditor } from './Players';
import { toInputDate, standings, ownTeamId, teamName, fmtDate, fmtNum } from './model';

const TYPES = [['liga', 'Liga'], ['torneo', 'Torneo']];
const TYPE_LABEL = { liga: 'Liga', torneo: 'Torneo', amistoso: 'Amistoso' };

export default function Teams({ model, nav }) {
  const [tab, setTab] = useState('teams');
  return (
    <div className="sc-view">
      <div className="sc-scrollx"><Seg value={tab} onChange={setTab} options={[['teams', 'Equipos'], ['comps', 'Ligas/Torneos'], ['fix', 'Jornadas'], ['h2h', 'Amistosos']]} /></div>
      {tab === 'teams' && <TeamsTab model={model} nav={nav} />}
      {tab === 'seasons' && <SeasonsTab model={model} />}
      {tab === 'comps' && <CompsTab model={model} />}
      {tab === 'fix' && <FixturesTab model={model} nav={nav} />}
      {tab === 'h2h' && <H2H model={model} />}
    </div>
  );
}

function TeamsTab({ model, nav }) {
  const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null); const [pe, setPe] = useState(null);
  const [selMode, setSelMode] = useState(false); const [chk, setChk] = useState(() => new Set()); const [merge, setMerge] = useState(false); const [keepId, setKeepId] = useState('');
  const [confirm, confirmEl] = useConfirm();
  const stats = (id) => { let w = 0, d = 0, l = 0; model.matches.forEach((m) => { const r = m.redTeamId === id, b = m.blueTeamId === id; if (!r && !b) return; const gf = m.score[r ? 0 : 1], ga = m.score[r ? 1 : 0]; if (gf > ga) w++; else if (gf < ga) l++; else d++; }); return { pj: w + d + l, w, d, l }; };
  const inUse = (t) => model.matches.some((m) => m.redTeamId === t.id || m.blueTeamId === t.id) || model.fixtures.some((f) => f.homeId === t.id || f.awayId === t.id);
  // Borrado de varios equipos: solo los que no tienen partidos ni jornadas (para esos, usa «Fusionar»). Van a la papelera.
  async function bulkDelete() {
    const picked = model.teams.filter((t) => chk.has(t.id)); const ok = picked.filter((t) => !inUse(t)); const skipped = picked.length - ok.length;
    if (!ok.length) { toast('Los equipos elegidos tienen partidos o jornadas: usa «Fusionar» para unirlos con otro'); return; }
    if (!(await confirm('¿Eliminar ' + ok.length + (ok.length === 1 ? ' equipo' : ' equipos') + '? Sus jugadores quedarán sin equipo.' + (skipped ? ' (' + skipped + ' con partidos o jornadas se conservan.)' : ''), 'Eliminar'))) return;
    const entries = [];
    for (const t of ok) { const pl = model.allPlayers.filter((p) => p.teamId === t.id).map((p) => ({ ...p })); entries.push(await db.toTrash('team', t, { players: pl })); await db.putMany('players', pl.map((p) => ({ ...p, teamId: null, updatedAt: Date.now() }))); await db.del('teams', t.id); }
    setChk(new Set());
    toast(ok.length + (ok.length === 1 ? ' equipo eliminado' : ' equipos eliminados'), { label: 'Deshacer', fn: async () => { for (const e of entries) await db.restoreTrash(e); toast('Restaurado'); } });
  }
  // Fusionar: el equipo elegido absorbe jugadores, partidos, jornadas y competiciones de los demás, que desaparecen.
  async function doMerge() {
    const ids = [...chk].filter((i) => i !== keepId); if (!keepId || !ids.length) return; const set = new Set(ids); const fix = (x) => (set.has(x) ? keepId : x);
    await db.putMany('players', model.allPlayers.filter((p) => set.has(p.teamId)).map((p) => ({ ...p, teamId: keepId, updatedAt: Date.now() })));
    await db.putMany('matches', model.matches.concat(model.excluded).filter((m) => set.has(m.rec.redTeamId) || set.has(m.rec.blueTeamId)).map((m) => ({ ...m.rec, redTeamId: fix(m.rec.redTeamId), blueTeamId: fix(m.rec.blueTeamId) })));
    await db.putMany('fixtures', model.fixtures.filter((f) => set.has(f.homeId) || set.has(f.awayId)).map((f) => ({ ...f, homeId: fix(f.homeId), awayId: fix(f.awayId) })));
    await db.putMany('competitions', model.competitions.filter((c) => (c.teamIds || []).some((t) => set.has(t))).map((c) => ({ ...c, teamIds: [...new Set((c.teamIds || []).map(fix))] })));
    await db.delMany('teams', ids); setMerge(false); setChk(new Set()); setSelMode(false); toast('Equipos fusionados en «' + teamName(model, keepId) + '»');
  }
  async function remove(t) {
    const used = model.matches.some((m) => m.redTeamId === t.id || m.blueTeamId === t.id) || model.fixtures.some((f) => f.homeId === t.id || f.awayId === t.id);
    if (used) { toast('El equipo tiene partidos o jornadas: no se puede eliminar'); return; }
    if (!(await confirm('¿Eliminar el equipo «' + t.name + '»? Sus jugadores quedarán sin equipo.', 'Eliminar'))) return;
    const pl = model.allPlayers.filter((p) => p.teamId === t.id).map((p) => ({ ...p })); const e = await db.toTrash('team', t, { players: pl });
    await db.putMany('players', pl.map((p) => ({ ...p, teamId: null, updatedAt: Date.now() }))); await db.del('teams', t.id);
    toast('Equipo eliminado', { label: 'Deshacer', fn: async () => { await db.restoreTrash(e); toast('Restaurado'); } });
  }
  async function setOwn(t) { await db.putMany('teams', model.teams.map((x) => ({ ...x, own: x.id === t.id ? !x.own : false }))); }
  return (
    <>
      <Card title="Equipos" right={<div className="sc-row"><button className={'sc-btn small' + (selMode ? '' : ' ghost')} onClick={() => { setSelMode(!selMode); setChk(new Set()); }}>{selMode ? 'Listo' : 'Seleccionar'}</button><button className="sc-btn small" onClick={() => setEdit({})}>+ Nuevo</button></div>}>
        {selMode && <div className="sc-selbar"><button className="sc-btn small ghost" onClick={() => setChk(new Set(model.teams.map((t) => t.id)))}>Todos</button><button className="sc-btn small ghost" onClick={() => setChk(new Set())}>Ninguno</button><button className="sc-btn small ghost" disabled={chk.size < 2} onClick={() => { setKeepId([...chk][0]); setMerge(true); }}>Fusionar ({chk.size})</button><button className="sc-btn small danger" disabled={!chk.size} onClick={bulkDelete}>Borrar ({chk.size})</button></div>}
        {!model.teams.length ? <Empty>Crea tus equipos y asígnales jugadores para obtener victorias, derrotas y plantillas. Marca uno como «Mi equipo» para ver sus resultados en el panel.</Empty> : (
          <ul className="sc-list">{model.teams.map((t) => { const roster = model.players.filter((p) => p.teamId === t.id); return (
            <li key={t.id} className="col"><div className="row" onClick={() => (selMode ? setChk((c) => { const n = new Set(c); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; }) : setOpen(open === t.id ? null : t.id))}>{selMode && <span className={'sc-check' + (chk.has(t.id) ? ' on' : '')}>{chk.has(t.id) ? '✓' : ''}</span>}<span className="sc-swatch" style={{ background: t.color || 'var(--sc-acc)' }} /><div className="mid"><b>{t.name}{t.own ? ' ★' : ''}</b><small>{(() => { const st = stats(t.id); return roster.length + ' jug.' + (st.pj ? ' · ' + st.pj + ' PJ · ' + st.w + 'V ' + st.d + 'E ' + st.l + 'D' : '') + (t.own ? ' · Mi equipo' : ''); })()}</small></div>{!selMode && <span className="chev">{open === t.id ? '⌄' : '›'}</span>}</div>
              {open === t.id && !selMode && <div className="sc-roster">
                <div className="sc-row wrap"><button className="sc-btn small" onClick={() => setEdit(t)}>Editar</button><button className="sc-btn small ghost" onClick={() => setOwn(t)}>{t.own ? 'Quitar «Mi equipo»' : 'Marcar «Mi equipo»'}</button><button className="sc-btn small ghost danger" onClick={() => remove(t)}>Eliminar</button></div>
                <h4>Plantilla</h4>{roster.length ? <ul className="sc-list">{roster.map((p) => <li key={p.id} onClick={() => nav('players', { playerId: p.id })}><Avatar player={p} size={30} /><div className="mid"><b>{p.nick}</b><small>{p.position || 'Posición sin definir'}</small></div></li>)}</ul> : <Empty small>Sin jugadores.</Empty>}
                <Select label="Añadir jugador a la plantilla" value="" onChange={async (v) => { const p = model.playerById.get(v); if (p) await db.put('players', { ...p, teamId: t.id, updatedAt: Date.now() }); }} placeholder="Elegir jugador…" options={model.players.filter((p) => p.teamId !== t.id).map((p) => [p.id, p.nick + (p.teamId ? ' (' + teamName(model, p.teamId) + ')' : '')])} />
                <button className="sc-btn small ghost" onClick={() => setPe({})}>+ Crear jugador nuevo</button>
              </div>}
            </li>); })}</ul>)}
      </Card>
      {edit && <TeamEditor team={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {pe && <PlayerEditor model={model} player={null} onClose={() => setPe(null)} onSaved={async (p) => { if (p && open) await db.put('players', { ...p, teamId: open }); }} />}
      {merge && <Sheet title="Fusionar equipos" onClose={() => setMerge(false)} foot={<><button className="sc-btn ghost" onClick={() => setMerge(false)}>Cancelar</button><button className="sc-btn" onClick={doMerge}>Fusionar</button></>}><div className="sc-form"><p className="sc-note">Se unen {chk.size} equipos en uno: sus jugadores, partidos, jornadas y competiciones pasan al equipo que elijas y los demás desaparecen.</p><Select label="Conservar el equipo" value={keepId} onChange={setKeepId} options={model.teams.filter((t) => chk.has(t.id)).map((t) => [t.id, t.name])} /></div></Sheet>}
      {confirmEl}
    </>
  );
}
function TeamEditor({ team, onClose }) {
  const [f, setF] = useState(team || { name: '', color: '#C89A3D', own: false });
  async function save() { if (!f.name.trim()) { toast('Escribe un nombre'); return; } await db.put('teams', { ...(team || { id: db.uid('t'), createdAt: Date.now() }), name: f.name.trim(), color: f.color, own: !!f.own, updatedAt: Date.now() }); onClose(); }
  return <Sheet title={team ? 'Editar equipo' : 'Nuevo equipo'} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}><div className="sc-form"><Input label="Nombre" value={f.name} onChange={(v) => setF({ ...f, name: v })} maxLength={30} /><label className="sc-field"><span>Color</span><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></label><label className="sc-check2"><input type="checkbox" checked={!!f.own} onChange={(e) => setF({ ...f, own: e.target.checked })} /> Es mi equipo</label></div></Sheet>;
}

function SeasonsTab({ model }) {
  const [edit, setEdit] = useState(null);
  return <><Card title="Temporadas" right={<button className="sc-btn small" onClick={() => setEdit({})}>+ Nueva</button>}>{!model.seasons.length ? <Empty>Crea una temporada para agrupar competiciones y filtrar estadísticas.</Empty> : <ul className="sc-list">{model.seasons.map((s) => <li key={s.id} onClick={() => setEdit(s)}><div className="mid"><b>{s.name}</b><small>{s.start ? fmtDate(s.start) : '—'} → {s.end ? fmtDate(s.end) : '—'} · {model.matches.filter((m) => m.seasonId === s.id).length} partidos</small></div><span className="chev">›</span></li>)}</ul>}</Card>
    {edit && <SimpleEditor title="Temporada" item={edit.id ? edit : null} onClose={() => setEdit(null)} store="seasons" prefix="s" fields={[['name', 'Nombre', 'text'], ['start', 'Inicio', 'date'], ['end', 'Fin', 'date']]} usedBy={(id) => model.matches.some((m) => m.seasonId === id) || model.competitions.some((c) => c.seasonId === id)} />}</>;
}

function CompsTab({ model }) {
  const [edit, setEdit] = useState(null); const [open, setOpen] = useState(null);
  return <><Card title="Ligas y torneos" right={<button className="sc-btn small" onClick={() => setEdit({})}>+ Nueva</button>}>{!model.competitions.length ? <Empty>Crea una liga o torneo, añade equipos y programa jornadas.</Empty> : <ul className="sc-list">{model.competitions.map((c) => { const st = open === c.id ? standings(model, c.id) : null; return (
    <li key={c.id} className="col"><div className="row" onClick={() => setOpen(open === c.id ? null : c.id)}><div className="mid"><b>{c.name}</b><small>{(TYPES.find((t) => t[0] === c.type) || [0, TYPE_LABEL[c.type] || 'Competición'])[1]}{c.seasonId ? ' · ' + ((model.seasons.find((s) => s.id === c.seasonId) || {}).name || '') : ''} · {(c.teamIds || []).length} equipos</small></div><span className="chev">{open === c.id ? '⌄' : '›'}</span></div>
      {open === c.id && <div className="sc-roster"><button className="sc-btn small" onClick={() => setEdit(c)}>Editar</button>
        <h4>Clasificación</h4>{st && st.length ? <div className="sc-scrollx"><table className="sc-table"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead><tbody>{st.map((r, i) => <tr key={r.teamId}><td>{i + 1}</td><td>{teamName(model, r.teamId)}</td><td>{r.pj}</td><td>{r.g}</td><td>{r.e}</td><td>{r.p}</td><td>{r.gf}</td><td>{r.gc}</td><td>{r.gf - r.gc}</td><td><b>{r.pts}</b></td></tr>)}</tbody></table></div> : <Empty small>Sin resultados todavía.</Empty>}</div>}
    </li>); })}</ul>}</Card>{edit && <CompEditor model={model} comp={edit.id ? edit : null} onClose={() => setEdit(null)} />}</>;
}
function CompEditor({ model, comp, onClose }) {
  const [f, setF] = useState(comp || { name: '', type: 'liga', seasonId: '', teamIds: [] });
  const [confirm, confirmEl] = useConfirm();
  const toggle = (id) => setF((x) => ({ ...x, teamIds: x.teamIds.includes(id) ? x.teamIds.filter((t) => t !== id) : [...x.teamIds, id] }));
  async function save() { if (!f.name.trim()) { toast('Escribe un nombre'); return; } await db.put('competitions', { ...(comp || { id: db.uid('c'), createdAt: Date.now() }), name: f.name.trim(), type: f.type, seasonId: f.seasonId || null, teamIds: f.teamIds, updatedAt: Date.now() }); onClose(); }
  async function remove() { if (model.matches.some((m) => m.competitionId === comp.id) || model.fixtures.some((x) => x.competitionId === comp.id)) { toast('Tiene partidos o jornadas: no se puede eliminar'); return; } if (await confirm('¿Eliminar «' + comp.name + '»?', 'Eliminar')) { await db.del('competitions', comp.id); onClose(); } }
  return <Sheet title={comp ? 'Editar competición' : 'Nueva competición'} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}><div className="sc-form"><Input label="Nombre" value={f.name} onChange={(v) => setF({ ...f, name: v })} /><Select label="Tipo" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={TYPES} /><Select label="Temporada" value={f.seasonId || ''} onChange={(v) => setF({ ...f, seasonId: v })} placeholder="Sin temporada" options={model.seasons.map((s) => [s.id, s.name])} />
    <div className="sc-field"><span>Equipos participantes</span><div className="sc-chips">{model.teams.map((t) => <button key={t.id} className={'sc-chip' + (f.teamIds.includes(t.id) ? ' on' : '')} onClick={() => toggle(t.id)}>{t.name}</button>)}{!model.teams.length && <small>Crea equipos primero.</small>}</div></div>
    {comp && <button className="sc-btn small danger" onClick={remove}>Eliminar competición</button>}</div>{confirmEl}</Sheet>;
}

function FixturesTab({ model, nav }) {
  const [comp, setComp] = useState(''); const [edit, setEdit] = useState(null);
  const list = model.fixtures.filter((f) => !comp || f.competitionId === comp).slice().sort((a, b) => (+a.round || 0) - (+b.round || 0) || (a.date || 0) - (b.date || 0));
  // partidos analizados de esa competición que no están enlazados a una jornada
  const loose = model.matches.filter((m) => (!comp || m.competitionId === comp) && !m.fixtureId && (m.competitionId));
  const byRound = {}; list.forEach((f) => { const k = f.round || '—'; (byRound[k] = byRound[k] || []).push(f); });
  return <><Card title="Jornadas y resultados" right={<button className="sc-btn small" onClick={() => setEdit({})}>+ Programar</button>}>
    <Select value={comp} onChange={setComp} placeholder="Todas las competiciones" options={model.competitions.map((c) => [c.id, c.name])} />
    {!list.length && !loose.length ? <Empty>Programa jornadas con dos equipos. Puedes escribir el resultado a mano o vincular una repetición analizada desde el detalle del partido.</Empty> : <>
      {Object.keys(byRound).map((r) => <div key={r}><h4>Jornada {r}</h4><ul className="sc-list">{byRound[r].map((f) => { const lm = model.matches.find((m) => m.fixtureId === f.id); const hg = lm ? lm.score[0] : f.homeGoals, ag = lm ? lm.score[1] : f.awayGoals; const has = hg !== '' && hg != null; return <li key={f.id} onClick={() => (lm ? nav('matches', { matchId: lm.id }) : setEdit(f))}><div className="mid"><b>{teamName(model, f.homeId)} {has ? hg + ' – ' + ag : 'vs'} {teamName(model, f.awayId)}</b><small>{(model.competitions.find((c) => c.id === f.competitionId) || {}).name || ''} · {f.date ? fmtDate(f.date) : 'sin fecha'} · {lm ? 'con repetición' : has ? 'resultado manual' : 'pendiente'}</small></div><span className="chev">›</span></li>; })}</ul></div>)}
      {loose.length > 0 && <><h4>Partidos analizados en la competición</h4><ul className="sc-list">{loose.map((m) => <li key={m.id} onClick={() => nav('matches', { matchId: m.id })}><div className="mid"><b>{teamName(model, m.redTeamId, 'Rojo')} {m.score[0]} – {m.score[1]} {teamName(model, m.blueTeamId, 'Azul')}</b><small>{m.round ? 'Jornada ' + m.round + ' · ' : ''}{fmtDate(m.date)}</small></div><span className="chev">›</span></li>)}</ul></>}</>}
  </Card>{edit && <FixtureEditor model={model} fx={edit.id ? edit : null} defComp={comp} onClose={() => setEdit(null)} />}</>;
}
function FixtureEditor({ model, fx, defComp, onClose }) {
  const [f, setF] = useState(fx || { competitionId: defComp || '', round: '', homeId: '', awayId: '', date: null, homeGoals: '', awayGoals: '' });
  const [confirm, confirmEl] = useConfirm(); const c = model.competitions.find((x) => x.id === f.competitionId);
  const teams = c && c.teamIds && c.teamIds.length ? model.teams.filter((t) => c.teamIds.includes(t.id)) : model.teams;
  async function save() { if (!f.competitionId || !f.homeId || !f.awayId || f.homeId === f.awayId) { toast('Elige competición y dos equipos distintos'); return; } await db.put('fixtures', { ...(fx || { id: db.uid('f'), createdAt: Date.now() }), competitionId: f.competitionId, round: f.round, homeId: f.homeId, awayId: f.awayId, date: f.date, homeGoals: f.homeGoals === '' ? null : +f.homeGoals, awayGoals: f.awayGoals === '' ? null : +f.awayGoals, updatedAt: Date.now() }); onClose(); }
  async function remove() { if (model.matches.some((m) => m.fixtureId === fx.id)) { toast('Tiene una repetición vinculada'); return; } if (await confirm('¿Eliminar esta jornada?', 'Eliminar')) { await db.del('fixtures', fx.id); onClose(); } }
  return <Sheet title={fx ? 'Editar jornada' : 'Programar jornada'} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}><div className="sc-form">
    <Select label="Competición" value={f.competitionId} onChange={(v) => setF({ ...f, competitionId: v })} placeholder="Elegir…" options={model.competitions.map((x) => [x.id, x.name])} />
    <Input label="Jornada / ronda" value={f.round} onChange={(v) => setF({ ...f, round: v })} /><Select label="Local" value={f.homeId} onChange={(v) => setF({ ...f, homeId: v })} placeholder="Elegir…" options={teams.map((t) => [t.id, t.name])} /><Select label="Visitante" value={f.awayId} onChange={(v) => setF({ ...f, awayId: v })} placeholder="Elegir…" options={teams.map((t) => [t.id, t.name])} />
    <Input label="Fecha" type="date" value={f.date ? toInputDate(f.date) : ''} onChange={(v) => setF({ ...f, date: v ? new Date(v + 'T12:00:00').getTime() : null })} />
    <div className="sc-grid2"><Input label="Goles local (opcional)" type="number" min="0" value={f.homeGoals == null ? '' : f.homeGoals} onChange={(v) => setF({ ...f, homeGoals: v })} /><Input label="Goles visitante" type="number" min="0" value={f.awayGoals == null ? '' : f.awayGoals} onChange={(v) => setF({ ...f, awayGoals: v })} /></div>
    <p className="sc-note">Si más tarde vinculas una repetición a esta jornada, el resultado saldrá de la repetición y este se ignorará.</p>
    {fx && <button className="sc-btn small danger" onClick={remove}>Eliminar jornada</button>}</div>{confirmEl}</Sheet>;
}

function H2H({ model }) {
  // Amistosos: siempre «mi equipo» contra un rival cuyo nombre escribes tú; la repetición que elijas se guarda aquí.
  const own = ownTeamId(model);
  const [st, setSt] = useLocal('sc.friendlies', { opp: '', side: 'R' });
  const [pick, setPick] = useState('');
  const oppName = (st.opp || '').trim();
  const oppTeam = model.teams.find((t) => t.id !== own && t.name.trim().toLowerCase() === oppName.toLowerCase());
  const mine = (m) => (m.redTeamId === own ? 0 : 1);
  const all = model.matches.filter((m) => m.rec.friendly);
  const list = all.filter((m) => !oppName || (oppTeam && (m.redTeamId === oppTeam.id || m.blueTeamId === oppTeam.id))).sort((x, y) => y.date - x.date);
  const cand = model.matches.filter((m) => !m.rec.friendly).sort((x, y) => y.date - x.date);
  const W = list.filter((m) => m.score[mine(m)] > m.score[1 - mine(m)]).length, L = list.filter((m) => m.score[mine(m)] < m.score[1 - mine(m)]).length, D = list.length - W - L;
  const gf = list.reduce((a, m) => a + m.score[mine(m)], 0), ga = list.reduce((a, m) => a + m.score[1 - mine(m)], 0);
  async function add() {
    if (!oppName) { toast('Escribe el nombre del otro equipo'); return; }
    const m = model.matchById.get(pick); if (!m) { toast('Elige una repetición'); return; }
    let opp = oppTeam;
    if (!opp) { opp = { id: db.uid('t'), name: oppName, color: '#3A78B5', own: false, createdAt: Date.now(), updatedAt: Date.now() }; await db.put('teams', opp); }
    const red = st.side === 'R';
    await db.put('matches', { ...m.rec, friendly: true, redTeamId: red ? own : opp.id, blueTeamId: red ? opp.id : own, teamAuto: false });
    setPick(''); toast('Añadida a Amistosos');
  }
  async function remove(m) { await db.put('matches', { ...m.rec, friendly: false }); toast('Quitada de Amistosos'); }
  if (!own) return <Card title="Amistosos"><Empty>Primero marca tu equipo como «Mi equipo» (en Equipos › editar). Los amistosos siempre se juegan con él.</Empty></Card>;
  return <>
    <Card title="Amistosos" right={<span className="sc-sub">{list.length} {list.length === 1 ? 'partido' : 'partidos'}</span>}>
      <div className="sc-grid2">
        <label className="sc-field"><span>Mi equipo</span><input value={teamName(model, own)} readOnly /></label>
        <label className="sc-field"><span>Otro equipo</span><input list="sc-opp" value={st.opp || ''} placeholder="Nombre del rival" onChange={(e) => setSt({ ...st, opp: e.target.value })} /></label>
        <datalist id="sc-opp">{model.teams.filter((t) => t.id !== own).map((t) => <option key={t.id} value={t.name} />)}</datalist>
      </div>
      <Select label="Repetición que se guarda aquí" value={pick} onChange={setPick} placeholder="Elegir partido…" options={cand.map((m) => [m.id, fmtDate(m.date) + ' · ' + m.rec.name + ' · ' + m.score[0] + '-' + m.score[1]])} />
      <div className="sc-row wrap"><Seg value={st.side} onChange={(v) => setSt({ ...st, side: v })} options={[['R', teamName(model, own) + ' = Rojo'], ['B', teamName(model, own) + ' = Azul']]} /></div>
      <div className="sc-row end"><button className="sc-btn" disabled={!pick || !oppName} onClick={add}>Añadir a Amistosos</button></div>
    </Card>
    {list.length > 0 && <Card title={oppName ? 'Contra ' + oppName : 'Todos los amistosos'}>
      <div className="sc-kpis small"><div className="sc-kpi good"><b>{W}</b><span>Victorias</span></div><div className="sc-kpi"><b>{D}</b><span>Empates</span></div><div className="sc-kpi bad"><b>{L}</b><span>Derrotas</span></div><div className="sc-kpi"><b>{gf}–{ga}</b><span>Goles</span></div></div>
      <ul className="sc-list">{list.map((m) => { const o = m.score[mine(m)] - m.score[1 - mine(m)]; const oppId = mine(m) === 0 ? m.blueTeamId : m.redTeamId; return <li key={m.id}><span className={'sc-res ' + (o > 0 ? 'W' : o < 0 ? 'L' : 'D')}>{o > 0 ? 'V' : o < 0 ? 'D' : 'E'}</span><div className="mid"><b>{teamName(model, own)} {m.score[mine(m)]} – {m.score[1 - mine(m)]} {teamName(model, oppId, 'Rival')}</b><small>{fmtDate(m.date)} · {m.rec.name}</small></div><button className="sc-btn small ghost" onClick={() => remove(m)}>Quitar</button></li>; })}</ul>
    </Card>}
    {!list.length && <Card><Empty small>{all.length ? 'No hay amistosos contra ese equipo.' : 'Escribe el nombre del rival, elige una repetición y añádela.'}</Empty></Card>}
  </>;
}

function SimpleEditor({ title, item, onClose, store, prefix, fields, usedBy }) {
  const [f, setF] = useState(item ? { ...item } : {}); const [confirm, confirmEl] = useConfirm();
  const toV = (k, t) => (t === 'date' ? (f[k] ? toInputDate(f[k]) : '') : f[k] || '');
  async function save() { if (!(f.name || '').trim()) { toast('Escribe un nombre'); return; } await db.put(store, { ...(item || { id: db.uid(prefix), createdAt: Date.now() }), ...f, name: f.name.trim(), updatedAt: Date.now() }); onClose(); }
  async function remove() { if (usedBy(item.id)) { toast('Está en uso: no se puede eliminar'); return; } if (await confirm('¿Eliminar «' + item.name + '»?', 'Eliminar')) { await db.del(store, item.id); onClose(); } }
  return <Sheet title={(item ? 'Editar ' : 'Nueva ') + title.toLowerCase()} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}><div className="sc-form">{fields.map(([k, l, t]) => <Input key={k} label={l} type={t} value={toV(k, t)} onChange={(v) => setF({ ...f, [k]: t === 'date' ? (v ? new Date(v + 'T12:00:00').getTime() : null) : v })} />)}{item && <button className="sc-btn small danger" onClick={remove}>Eliminar</button>}</div>{confirmEl}</Sheet>;
}
