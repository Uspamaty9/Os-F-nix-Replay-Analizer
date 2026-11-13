import React, { useMemo, useState } from 'react';
import * as db from './db';
import { Card, Empty, Seg, Select, Input, Sheet, Avatar, useConfirm, toast } from './ui';
import { PlayerEditor } from './Players';
import { standings, headToHead, teamName, fmtDate, fmtNum } from './model';

const TYPES = [['liga', 'Liga'], ['torneo', 'Torneo'], ['amistoso', 'Amistosos']];

export default function Teams({ model, nav }) {
  const [tab, setTab] = useState('teams');
  return (
    <div className="sc-view">
      <div className="sc-scrollx"><Seg value={tab} onChange={setTab} options={[['teams', 'Equipos'], ['seasons', 'Temporadas'], ['comps', 'Ligas/Torneos'], ['fix', 'Jornadas'], ['h2h', 'Enfrentamientos']]} /></div>
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
  const [confirm, confirmEl] = useConfirm();
  async function remove(t) {
    const used = model.matches.some((m) => m.redTeamId === t.id || m.blueTeamId === t.id) || model.fixtures.some((f) => f.homeId === t.id || f.awayId === t.id);
    if (used) { toast('El equipo tiene partidos o jornadas: no se puede eliminar'); return; }
    if (!(await confirm('¿Eliminar el equipo «' + t.name + '»? Sus jugadores quedarán sin equipo.', 'Eliminar'))) return;
    await db.putMany('players', model.players.filter((p) => p.teamId === t.id).map((p) => ({ ...p, teamId: null, updatedAt: Date.now() }))); await db.del('teams', t.id);
  }
  async function setOwn(t) { await db.putMany('teams', model.teams.map((x) => ({ ...x, own: x.id === t.id ? !x.own : false }))); }
  return (
    <>
      <Card title="Equipos" right={<button className="sc-btn small" onClick={() => setEdit({})}>+ Nuevo equipo</button>}>
        {!model.teams.length ? <Empty>Crea tus equipos y asígnales jugadores para obtener victorias, derrotas y plantillas. Marca uno como «Mi equipo» para ver sus resultados en el panel.</Empty> : (
          <ul className="sc-list">{model.teams.map((t) => { const roster = model.players.filter((p) => p.teamId === t.id); return (
            <li key={t.id} className="col"><div className="row" onClick={() => setOpen(open === t.id ? null : t.id)}><span className="sc-swatch" style={{ background: t.color || 'var(--sc-acc)' }} /><div className="mid"><b>{t.name}{t.own ? ' ★' : ''}</b><small>{roster.length} jugadores{t.own ? ' · Mi equipo' : ''}</small></div><span className="chev">{open === t.id ? '⌄' : '›'}</span></div>
              {open === t.id && <div className="sc-roster">
                <div className="sc-row wrap"><button className="sc-btn small" onClick={() => setEdit(t)}>Editar</button><button className="sc-btn small ghost" onClick={() => setOwn(t)}>{t.own ? 'Quitar «Mi equipo»' : 'Marcar «Mi equipo»'}</button><button className="sc-btn small ghost danger" onClick={() => remove(t)}>Eliminar</button></div>
                <h4>Plantilla</h4>{roster.length ? <ul className="sc-list">{roster.map((p) => <li key={p.id} onClick={() => nav('players', { playerId: p.id })}><Avatar player={p} size={30} /><div className="mid"><b>{p.nick}</b><small>{p.position || 'Posición sin definir'}</small></div></li>)}</ul> : <Empty small>Sin jugadores.</Empty>}
                <Select label="Añadir jugador a la plantilla" value="" onChange={async (v) => { const p = model.playerById.get(v); if (p) await db.put('players', { ...p, teamId: t.id, updatedAt: Date.now() }); }} placeholder="Elegir jugador…" options={model.players.filter((p) => p.teamId !== t.id).map((p) => [p.id, p.nick + (p.teamId ? ' (' + teamName(model, p.teamId) + ')' : '')])} />
                <button className="sc-btn small ghost" onClick={() => setPe({})}>+ Crear jugador nuevo</button>
              </div>}
            </li>); })}</ul>)}
      </Card>
      {edit && <TeamEditor team={edit.id ? edit : null} onClose={() => setEdit(null)} />}
      {pe && <PlayerEditor model={model} player={null} onClose={() => setPe(null)} onSaved={async (p) => { if (p && open) await db.put('players', { ...p, teamId: open }); }} />}
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
    <li key={c.id} className="col"><div className="row" onClick={() => setOpen(open === c.id ? null : c.id)}><div className="mid"><b>{c.name}</b><small>{(TYPES.find((t) => t[0] === c.type) || [0, 'Competición'])[1]}{c.seasonId ? ' · ' + ((model.seasons.find((s) => s.id === c.seasonId) || {}).name || '') : ''} · {(c.teamIds || []).length} equipos</small></div><span className="chev">{open === c.id ? '⌄' : '›'}</span></div>
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
    <Input label="Fecha" type="date" value={f.date ? new Date(f.date).toISOString().slice(0, 10) : ''} onChange={(v) => setF({ ...f, date: v ? new Date(v + 'T12:00:00').getTime() : null })} />
    <div className="sc-grid2"><Input label="Goles local (opcional)" type="number" min="0" value={f.homeGoals == null ? '' : f.homeGoals} onChange={(v) => setF({ ...f, homeGoals: v })} /><Input label="Goles visitante" type="number" min="0" value={f.awayGoals == null ? '' : f.awayGoals} onChange={(v) => setF({ ...f, awayGoals: v })} /></div>
    <p className="sc-note">Si más tarde vinculas una repetición a esta jornada, el resultado saldrá de la repetición y este se ignorará.</p>
    {fx && <button className="sc-btn small danger" onClick={remove}>Eliminar jornada</button>}</div>{confirmEl}</Sheet>;
}

function H2H({ model }) {
  const [a, setA] = useState(''); const [b, setB] = useState('');
  const h = a && b && a !== b ? headToHead(model, a, b) : null;
  return <Card title="Historial de enfrentamientos"><div className="sc-grid2"><Select label="Equipo A" value={a} onChange={setA} placeholder="Elegir…" options={model.teams.map((t) => [t.id, t.name])} /><Select label="Equipo B" value={b} onChange={setB} placeholder="Elegir…" options={model.teams.map((t) => [t.id, t.name])} /></div>
    {!h ? <Empty small>Elige dos equipos distintos.</Empty> : !h.list.length ? <Empty small>No hay partidos registrados entre estos equipos.</Empty> : <>
      <div className="sc-kpis small"><div className="sc-kpi good"><b>{h.W}</b><span>Victorias {teamName(model, a)}</span></div><div className="sc-kpi"><b>{h.D}</b><span>Empates</span></div><div className="sc-kpi bad"><b>{h.L}</b><span>Victorias {teamName(model, b)}</span></div><div className="sc-kpi"><b>{h.gf}–{h.ga}</b><span>Goles</span></div></div>
      <ul className="sc-list">{h.list.map((r) => <li key={r.key}><span className={'sc-res ' + r.outcome}>{r.outcome === 'W' ? 'V' : r.outcome === 'D' ? 'E' : 'D'}</span><div className="mid"><b>{teamName(model, a)} {r.gf} – {r.ga} {teamName(model, b)}</b><small>{fmtDate(r.date)} · {r.source === 'manual' ? 'resultado manual' : 'repetición analizada'}</small></div></li>)}</ul></>}
  </Card>;
}

function SimpleEditor({ title, item, onClose, store, prefix, fields, usedBy }) {
  const [f, setF] = useState(item ? { ...item } : {}); const [confirm, confirmEl] = useConfirm();
  const toV = (k, t) => (t === 'date' ? (f[k] ? new Date(f[k]).toISOString().slice(0, 10) : '') : f[k] || '');
  async function save() { if (!(f.name || '').trim()) { toast('Escribe un nombre'); return; } await db.put(store, { ...(item || { id: db.uid(prefix), createdAt: Date.now() }), ...f, name: f.name.trim(), updatedAt: Date.now() }); onClose(); }
  async function remove() { if (usedBy(item.id)) { toast('Está en uso: no se puede eliminar'); return; } if (await confirm('¿Eliminar «' + item.name + '»?', 'Eliminar')) { await db.del(store, item.id); onClose(); } }
  return <Sheet title={(item ? 'Editar ' : 'Nueva ') + title.toLowerCase()} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}><div className="sc-form">{fields.map(([k, l, t]) => <Input key={k} label={l} type={t} value={toV(k, t)} onChange={(v) => setF({ ...f, [k]: t === 'date' ? (v ? new Date(v + 'T12:00:00').getTime() : null) : v })} />)}{item && <button className="sc-btn small danger" onClick={remove}>Eliminar</button>}</div>{confirmEl}</Sheet>;
}
