import React, { useMemo, useState } from 'react';
import * as db from './db';
import { Card, Kpi, Empty, Avatar, Seg, Select, Input, Sheet, Prov, useConfirm, toast, POSITIONS, pickFile, resizeImage, saveFile, slug, stamp } from './ui';
import { LineChart, Radar, HBars } from './charts';
import { playerProfile, ratingAverage, criteriaAverage, teamName, fmtPct, fmtNum, fmtDate, EMPTY_FILTERS } from './model';
import { aggregateRows, CRITERIA } from './analysis';
import { buildPlayerReport } from './report';
import { normNick } from './ingest';

export function PlayerEditor({ model, player, onClose, onSaved }) {
  const isNew = !player;
  const [f, setF] = useState(() => player ? { ...player, aliasText: (player.aliases || []).join(', ') } : { nick: '', aliasText: '', teamId: '', position: '', avatar: null, notes: '' });
  const [mergeId, setMergeId] = useState('');
  const [confirm, confirmEl] = useConfirm();
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const clash = (n) => model.players.find((p) => (!player || p.id !== player.id) && (normNick(p.nick) === normNick(n) || (p.aliases || []).some((a) => normNick(a) === normNick(n))));
  async function save() {
    const nick = f.nick.trim(); if (!nick) { toast('Escribe un nickname'); return; }
    const c = clash(nick); if (c) { toast('Ya existe «' + c.nick + '» con ese nick o alias'); return; }
    const aliases = f.aliasText.split(',').map((s) => s.trim()).filter(Boolean);
    if (player && normNick(player.nick) !== normNick(nick) && !aliases.some((a) => normNick(a) === normNick(player.nick))) aliases.push(player.nick); // el nick anterior sigue enlazando sus partidos
    for (const a of aliases) { const k = clash(a); if (k) { toast('El alias «' + a + '» ya pertenece a ' + k.nick); return; } }
    const rec = { ...(player || { id: db.uid('p'), source: 'manual', createdAt: Date.now() }), nick, aliases, teamId: f.teamId || null, position: f.position || '', avatar: f.avatar || null, notes: f.notes || '', updatedAt: Date.now() };
    delete rec.aliasText; await db.put('players', rec); toast('Jugador guardado'); onSaved && onSaved(rec); onClose();
  }
  async function merge() {
    const o = model.playerById.get(mergeId); if (!o || !player) return;
    if (!(await confirm('Se unirá «' + o.nick + '» con «' + player.nick + '»: sus partidos y calificaciones pasarán a este perfil y «' + o.nick + '» quedará como alias. ¿Continuar?', 'Unir'))) return;
    const rec = { ...player, aliases: Array.from(new Set([...(player.aliases || []), o.nick, ...(o.aliases || [])])), updatedAt: Date.now() }; await db.put('players', rec);
    for (const r of model.ratings.filter((x) => x.playerId === o.id)) { const nid = r.matchId + '|' + player.id; if (!model.ratingMap.get(nid)) await db.put('ratings', { ...r, id: nid, playerId: player.id }, true); await db.del('ratings', r.id); }
    await db.del('players', o.id); toast('Perfiles unidos'); onClose();
  }
  async function del() {
    const used = model.rows.some((r) => r.playerId === player.id);
    if (used) { toast('Tiene partidos guardados: úne el perfil con otro en lugar de eliminarlo'); return; }
    if (!(await confirm('¿Eliminar a «' + player.nick + '»? No tiene partidos guardados.', 'Eliminar'))) return;
    await db.del('players', player.id); toast('Jugador eliminado'); onClose(); onSaved && onSaved(null);
  }
  return (
    <Sheet title={isNew ? 'Nuevo jugador' : 'Editar jugador'} onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar</button></>}>
      <div className="sc-form">
        <div className="sc-avrow"><Avatar player={{ nick: f.nick || '?', avatar: f.avatar }} size={64} />
          <div><button className="sc-btn small" onClick={async () => { const fl = await pickFile('image/*'); if (fl) { try { set('avatar', await resizeImage(fl, 128)); } catch (e) { toast('No se pudo leer la imagen'); } } }}>Subir foto</button>{f.avatar && <button className="sc-btn small ghost" onClick={() => set('avatar', null)}>Quitar</button>}</div></div>
        <Input label="Nickname (como aparece en HaxBall)" value={f.nick} onChange={(v) => set('nick', v)} maxLength={32} />
        <Input label="Alias (otros nicks, separados por coma)" value={f.aliasText} onChange={(v) => set('aliasText', v)} />
        <Select label="Equipo" value={f.teamId || ''} onChange={(v) => set('teamId', v)} placeholder="Sin equipo" options={model.teams.map((t) => [t.id, t.name])} />
        <Select label="Posición" value={f.position} onChange={(v) => set('position', v)} placeholder="Sin definir" options={POSITIONS.map((p) => [p, p])} />
        <label className="sc-field"><span>Notas</span><textarea rows={3} value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} /></label>
        {!isNew && <>
          <hr />
          <Select label="Unir con otro perfil (mismo jugador con otro nick)" value={mergeId} onChange={setMergeId} placeholder="Elegir…" options={model.players.filter((p) => p.id !== player.id).map((p) => [p.id, p.nick])} />
          {mergeId && <button className="sc-btn small" onClick={merge}>Unir perfiles</button>}
          <button className="sc-btn small danger" onClick={del}>Eliminar jugador</button>
        </>}
      </div>{confirmEl}
    </Sheet>
  );
}

const METRICS = [['goals', 'Goles', 'auto'], ['assists', 'Asistencias', 'auto'], ['kicks', 'Toques', 'auto'], ['shotsOT', 'Tiros a puerta', 'auto'], ['passesCompleted', 'Pases completados', 'calc'], ['passesReceived', 'Pases recibidos', 'calc'], ['passesFailed', 'Pases fallidos', 'calc'], ['turnovers', 'Pérdidas', 'calc'], ['recoveries', 'Recuperaciones', 'calc'], ['interceptions', 'Intercepciones', 'calc'], ['blocks', 'Bloqueos', 'calc'], ['keyPasses', 'Pases clave', 'calc'], ['goalInvolvements', 'Participaciones en gol', 'calc'], ['ownGoals', 'Goles en propia', 'auto']];

export default function Players({ model, view, filters, nav, params }) {
  const [q, setQ] = useState(''); const [edit, setEdit] = useState(null); const [cmp, setCmp] = useState([]); const [cmpMode, setCmpMode] = useState(false); const [tab, setTab] = useState('sum');
  const sel = params && params.playerId; const setSel = (id) => nav('players', { playerId: id });
  const ids = useMemo(() => new Set(view.matches.map((m) => m.id)), [view]);
  const list = useMemo(() => {
    const by = new Map(); view.rowsScope.forEach((r) => { if (!r.playerId) return; if (!by.has(r.playerId)) by.set(r.playerId, []); by.get(r.playerId).push(r); });
    return model.players.filter((p) => !q || normNick(p.nick).includes(normNick(q))).map((p) => ({ p, agg: aggregateRows(by.get(p.id) || []) })).sort((a, b) => (b.agg.goalInvolvements - a.agg.goalInvolvements) || (b.agg.matches - a.agg.matches) || a.p.nick.localeCompare(b.p.nick));
  }, [model, view, q]);

  if (cmpMode && cmp.length >= 2 && params && params.compare) return <Compare model={model} view={view} filters={filters} players={cmp.map((id) => model.playerById.get(id)).filter(Boolean)} onBack={() => nav('players', {})} />;
  if (sel && model.playerById.get(sel)) return <Profile model={model} view={view} filters={filters} player={model.playerById.get(sel)} ids={ids} tab={tab} setTab={setTab} nav={nav} onBack={() => nav('players', {})} onEdit={() => setEdit(model.playerById.get(sel))} edit={edit} setEdit={setEdit} />;

  return (
    <div className="sc-view">
      <Card title="Jugadores" right={<div className="sc-row"><button className={'sc-btn small' + (cmpMode ? '' : ' ghost')} onClick={() => { setCmpMode(!cmpMode); setCmp([]); }}>{cmpMode ? 'Cancelar' : 'Comparar'}</button><button className="sc-btn small" onClick={() => setEdit({})}>+ Nuevo</button></div>}>
        <input className="sc-search" placeholder="Buscar por nickname…" value={q} onChange={(e) => setQ(e.target.value)} />
        {cmpMode && <p className="sc-note">Marca de 2 a 4 jugadores para compararlos. {cmp.length >= 2 && <button className="sc-btn small" onClick={() => nav('players', { compare: true })}>Comparar ({cmp.length})</button>}</p>}
        {!list.length ? <Empty>{model.players.length ? 'Ningún jugador coincide.' : 'Todavía no hay jugadores. Se registran solos al analizar una repetición, o puedes crearlos a mano.'}</Empty> : (
          <ul className="sc-list">{list.map(({ p, agg }) => { const ra = ratingAverage(model, p.id, ids); const on = cmp.includes(p.id); return (
            <li key={p.id} className={on ? 'sel' : ''} onClick={() => { if (cmpMode) setCmp((c) => (on ? c.filter((x) => x !== p.id) : c.length < 4 ? [...c, p.id] : c)); else setSel(p.id); }}>
              {cmpMode && <span className={'sc-check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>}
              <Avatar player={p} size={40} /><div className="mid"><b>{p.nick}</b><small>{teamName(model, p.teamId, 'Sin equipo')}{p.position ? ' · ' + p.position : ''}</small></div>
              <div className="nums"><span><b>{agg.matches}</b> PJ</span><span><b>{agg.goals}</b> G</span><span><b>{agg.assists}</b> A</span>{ra && <span className="rt"><b>{fmtNum(ra.avg, 1)}</b></span>}</div>
            </li>); })}</ul>)}
      </Card>
      {edit && <PlayerEditor model={model} player={edit.id ? edit : null} onClose={() => setEdit(null)} onSaved={(r) => r && setSel(r.id)} />}
    </div>
  );
}

function Profile({ model, view, filters, player, ids, tab, setTab, nav, onBack, onEdit, edit, setEdit }) {
  const pr = useMemo(() => playerProfile(model, player.id, { ...filters, playerId: player.id, teamId: filters.teamId }), [model, player, filters]);
  const a = pr.agg; const ra = ratingAverage(model, player.id, new Set(pr.matches.map((m) => m.id))); const ca = criteriaAverage(model, player.id, new Set(pr.matches.map((m) => m.id)));
  const bySeason = useMemo(() => { const g = new Map(); pr.rows.forEach((r) => { const k = r.seasonId || ''; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }); return Array.from(g.entries()).map(([k, rs]) => ({ k, name: k ? (model.seasons.find((s) => s.id === k) || {}).name : 'Sin temporada', agg: aggregateRows(rs) })); }, [pr, model]);
  const labels = pr.rows.map((r) => fmtDate(r.date).slice(0, 5));
  async function pdf() { try { const b = buildPlayerReport(model, player.id, filters); if (!b) return; await saveFile('Informe-' + slug(player.nick) + '-' + stamp() + '.pdf', 'application/pdf', b); toast('Informe PDF guardado'); } catch (e) { toast('No se pudo crear el informe'); } }
  return (
    <div className="sc-view">
      <button className="sc-link back" onClick={onBack}>‹ Jugadores</button>
      <Card className="sc-phead">
        <Avatar player={player} size={64} />
        <div className="mid"><h2>{player.nick}</h2><small>{teamName(model, player.teamId, 'Sin equipo')}{player.position ? ' · ' + player.position : ' · Posición sin definir'}</small>{(player.aliases || []).length > 0 && <small>También: {player.aliases.join(', ')}</small>}</div>
        <div className="sc-col"><button className="sc-btn small" onClick={onEdit}>Editar</button><button className="sc-btn small ghost" onClick={pdf}>PDF</button><button className="sc-btn small ghost" onClick={() => nav('scouting', { playerId: player.id })}>Evaluar</button></div>
      </Card>
      <div className="sc-kpis">
        <Kpi label="Partidos" value={a.matches} prov="auto" /><Kpi label="Goles" value={a.goals} prov="auto" sub={fmtNum(a.perMatch.goals, 2) + ' / partido'} /><Kpi label="Asistencias" value={a.assists} prov="auto" sub={fmtNum(a.perMatch.assists, 2) + ' / partido'} />
        <Kpi label="Particip. ofensiva" value={fmtPct(a.offParticipation)} prov="calc" /><Kpi label="Particip. defensiva" value={fmtPct(a.defParticipation)} prov="calc" /><Kpi label="Nota media" value={ra ? fmtNum(ra.avg, 1) : '—'} sub={ra ? ra.n + ' partidos' : 'sin calificar'} prov={ra ? 'calc' : null} />
      </div>
      <Seg value={tab} onChange={setTab} options={[['sum', 'Resumen'], ['hist', 'Historial'], ['evo', 'Evolución']]} />
      {!a.matches && <Card><Empty small>Este jugador no tiene partidos con los filtros actuales.</Empty></Card>}
      {tab === 'sum' && a.matches > 0 && <>
        <Card title="Estadísticas acumuladas"><table className="sc-table"><thead><tr><th>Métrica</th><th>Total</th><th>/ partido</th></tr></thead><tbody>{METRICS.map(([k, l, pv]) => <tr key={k}><td>{l}<Prov k={pv} /></td><td>{a[k]}</td><td>{fmtNum(a.perMatch[k], 2)}</td></tr>)}
          <tr><td>Precisión de pases<Prov k="calc" /></td><td colSpan={2}>{fmtPct(a.passAccuracy)}</td></tr><tr><td>Conversión (goles / tiros a puerta)<Prov k="calc" /></td><td colSpan={2}>{fmtPct(a.conversion)}</td></tr><tr><td>Cuota de toques del equipo<Prov k="calc" /></td><td colSpan={2}>{fmtPct(a.kickShare)}</td></tr><tr><td>Participación en goles del equipo<Prov k="calc" /></td><td colSpan={2}>{fmtPct(a.goalShare)}</td></tr></tbody></table></Card>
        {CRITERIA.some((c) => ca[c.id] != null) && <Card title="Perfil de scouting" right={<span className="sc-sub">media 0–10</span>}><div className="sc-center"><Radar axes={CRITERIA.map((c) => ({ id: c.id, label: c.label }))} series={[{ name: player.nick, values: ca }]} /></div></Card>}
        {bySeason.length > 0 && <Card title="Histórico por temporada"><div className="sc-scrollx"><table className="sc-table"><thead><tr><th>Temporada</th><th>PJ</th><th>G</th><th>A</th><th>Toques</th><th>Pases</th></tr></thead><tbody>{bySeason.map((s) => <tr key={s.k}><td>{s.name}</td><td>{s.agg.matches}</td><td>{s.agg.goals}</td><td>{s.agg.assists}</td><td>{s.agg.kicks}</td><td>{s.agg.passesCompleted}</td></tr>)}</tbody></table></div></Card>}
      </>}
      {tab === 'hist' && a.matches > 0 && <Card title="Historial de partidos"><ul className="sc-list">{pr.history.slice().reverse().map((h) => { const m = h.match; const sd = h.row.side; const gf = m.score[sd === 'R' ? 0 : 1], ga = m.score[sd === 'R' ? 1 : 0]; const o = gf > ga ? 'W' : gf < ga ? 'L' : 'D'; const ov = h.rating && h.rating.final.values.overall; return (
        <li key={m.id} onClick={() => nav('matches', { matchId: m.id })}><span className={'sc-res ' + o}>{o === 'W' ? 'V' : o === 'D' ? 'E' : 'D'}</span><div className="mid"><b>{gf} – {ga} · {m.rec.name}</b><small>{fmtDate(m.date)} · {h.row.goals} G · {h.row.assists} A · {h.row.kicks} toques · {fmtPct(h.row.passAccuracy)} pases</small></div>{ov != null && <span className="sc-rate">{fmtNum(ov, 1)}</span>}</li>); })}</ul></Card>}
      {tab === 'evo' && pr.rows.length > 0 && <>
        <Card title="Goles y asistencias por partido">{pr.rows.length > 1 ? <LineChart labels={labels} series={[{ name: 'Goles', data: pr.rows.map((r) => r.goals), color: '#59B96B' }, { name: 'Asistencias', data: pr.rows.map((r) => r.assists), color: '#3FA7D6' }]} fmt={(v) => fmtNum(v, 0)} /> : <Empty small>Hace falta más de un partido para ver la evolución.</Empty>}</Card>
        {pr.rows.length > 1 && <Card title="Precisión de pases y participación"><LineChart labels={labels} series={[{ name: 'Precisión de pases', data: pr.rows.map((r) => (r.passAccuracy == null ? null : Math.round(r.passAccuracy * 100))), color: '#E0A030' }, { name: 'Particip. ofensiva', data: pr.rows.map((r) => (r.offParticipation == null ? null : Math.round(r.offParticipation * 100))), color: '#B77CD9' }]} yMin={0} yMax={100} fmt={(v) => v + '%'} /></Card>}
        {pr.history.filter((h) => h.rating && h.rating.final.values.overall != null).length > 1 && <Card title="Evolución de la nota"><LineChart labels={pr.history.filter((h) => h.rating && h.rating.final.values.overall != null).map((h) => fmtDate(h.row.date).slice(0, 5))} series={[{ name: 'Nota general', data: pr.history.filter((h) => h.rating && h.rating.final.values.overall != null).map((h) => h.rating.final.values.overall), area: true }]} yMin={0} yMax={10} fmt={(v) => fmtNum(v, 1)} /></Card>}
      </>}
      {edit && <PlayerEditor model={model} player={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function Compare({ model, view, filters, players, onBack }) {
  const data = players.map((p) => { const pr = playerProfile(model, p.id, { ...filters, playerId: p.id }); const ids = new Set(pr.matches.map((m) => m.id)); return { p, a: pr.agg, ra: ratingAverage(model, p.id, ids), ca: criteriaAverage(model, p.id, ids) }; });
  const colors = ['var(--sc-acc)', '#3FA7D6', '#59B96B', '#B77CD9'];
  const axes = [['goals', 'Goles/PJ'], ['assists', 'Asist./PJ'], ['kicks', 'Toques/PJ'], ['passesCompleted', 'Pases/PJ'], ['recoveries', 'Recup./PJ'], ['keyPasses', 'P. clave/PJ']];
  const mx = {}; axes.forEach(([k]) => { mx[k] = Math.max.apply(null, data.map((d) => d.a.perMatch[k]).concat([1e-9])); });
  const series = data.map((d, i) => ({ name: d.p.nick, color: colors[i], values: Object.fromEntries(axes.map(([k]) => [k, (d.a.perMatch[k] / mx[k]) * 10])) }));
  const rows = [['Partidos', (d) => d.a.matches, 'auto'], ['Goles', (d) => d.a.goals, 'auto'], ['Asistencias', (d) => d.a.assists, 'auto'], ['Toques', (d) => d.a.kicks, 'auto'], ['Pases completados', (d) => d.a.passesCompleted, 'calc'], ['Precisión de pases', (d) => d.a.passAccuracy, 'calc', fmtPct], ['Recuperaciones + intercep.', (d) => d.a.recoveries + d.a.interceptions, 'calc'], ['Pases clave', (d) => d.a.keyPasses, 'calc'], ['Particip. ofensiva', (d) => d.a.offParticipation, 'calc', fmtPct], ['Particip. defensiva', (d) => d.a.defParticipation, 'calc', fmtPct], ['Nota media', (d) => (d.ra ? d.ra.avg : null), 'calc', (v) => fmtNum(v, 1)]];
  return (
    <div className="sc-view">
      <button className="sc-link back" onClick={onBack}>‹ Jugadores</button>
      <Card title="Comparación de jugadores"><div className="sc-legend">{data.map((d, i) => <span key={d.p.id}><i style={{ background: colors[i] }} />{d.p.nick}</span>)}</div>
        <div className="sc-center"><Radar axes={axes.map(([id, label]) => ({ id, label }))} series={series} /></div><p className="sc-note">Cada eje se escala de 0 a 10 respecto al mayor valor por partido entre los jugadores comparados.</p></Card>
      <Card title="Estadísticas"><div className="sc-scrollx"><table className="sc-table cmp"><thead><tr><th></th>{data.map((d) => <th key={d.p.id}>{d.p.nick}</th>)}</tr></thead><tbody>{rows.map(([l, fn, pv, fm]) => { const vals = data.map((d) => fn(d)); const best = Math.max.apply(null, vals.filter((v) => v != null).concat([-Infinity])); return <tr key={l}><td>{l}<Prov k={pv} /></td>{vals.map((v, i) => <td key={i} className={v != null && v === best && vals.filter((x) => x === best).length === 1 ? 'best' : ''}>{v == null ? '—' : fm ? fm(v) : v}</td>)}</tr>; })}</tbody></table></div></Card>
      <Card title="Goles + asistencias"><HBars data={data.map((d, i) => ({ label: d.p.nick, value: d.a.goalInvolvements, color: colors[i] }))} /></Card>
    </div>
  );
}
