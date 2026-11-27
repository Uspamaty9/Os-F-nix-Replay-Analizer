import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { Card, Kpi, Empty, Avatar, Seg, Select, Prov, Hint, toast } from './ui';
import { Radar } from './charts';
import { getRating, rowFor, ratingKey, ratingAverage, criteriaAverage, teamName, fmtNum, fmtDate, fmtPct } from './model';
import { CRITERIA, GK_CRITERIA, ROLE_SETS, criteriaFor, finalRatings, ROLE_LABEL } from './analysis';

const AUTO_HINT = {
  positioning: 'Reparto de su juego entre ataque y defensa, dominio del balón de su equipo y su peso en los toques.', vision: 'Pases clave y asistencias, con la calidad de sus pases completados.',
  passing: 'Precisión de pases (completados / intentos), comparada con el resto cuando hay datos.', finishing: 'Goles y tiros a puerta (los autogoles restan).', defense: 'Bloqueos e intercepciones, y los goles que encajó su equipo.',
  recoveries: 'Balones recuperados.', saves: 'Paradas según los tiros a puerta que recibió su equipo (más paradas, mejor nota).', concede: 'Goles encajados por su equipo: cuantos menos, mejor.', gkPosition: 'Cómo se coloca respecto a su portería y al balón.', clearances: 'Despejes y salidas para cortar el peligro.', distribution: 'Calidad de sus pases al sacar el balón.', security: 'Cuidar el balón: pocas pérdidas por toque.', involvement: 'Su cuota de los toques del equipo.', creation: 'Asistencias y pases que acaban en tiro.', decisions: 'Cuidar el balón (pérdidas por toque) y elegir bien los tiros.',
  cuts: 'Bloqueos e intercepciones; los autogoles restan.', solidity: 'Goles que encajó su equipo (menos = mejor) y su trabajo defensivo.', defPosition: 'Qué tanto jugó en la zona defensiva (zona ideal: atrás).',
  buildUp: 'Precisión de sus pases al sacar el balón.',
  control: 'Su parte de los toques y el dominio de posesión del equipo.', work: 'Bloqueos, intercepciones y recuperaciones (trabajo sin balón).', midPosition: 'Jugar en la zona media, conectando campo.',
  shooting: 'Tiros a puerta y cuántos acaban en gol.', threat: 'Su participación en las jugadas de ataque del equipo.', linkup: 'Asistencias, pases clave y precisión de pase.', fwdPosition: 'Ubicarse arriba, en zona de remate.', pressing: 'Trabajo defensivo adelantado (no cuenta si no hubo).', involvement: 'Su cuota de los toques del equipo.', creation: 'Asistencias y pases que acaban en tiro.', decisions: 'Cuidar el balón (pérdidas por toque) y elegir bien los tiros.',
};

export default function Scouting({ model, view, nav, params }) {
  const [tab, setTab] = useState('eval');
  return (
    <div className="sc-view">
      <Seg value={tab} onChange={setTab} options={[['eval', 'Evaluar'], ['rank', 'Ranking']]} />
      {tab === 'eval' ? <Evaluate model={model} view={view} params={params} nav={nav} /> : <Ranking model={model} view={view} nav={nav} />}
    </div>
  );
}

function Evaluate({ model, view, params, nav }) {
  const matches = view.matches.length ? view.matches : model.matches;
  const [matchId, setMatchId] = useState((params && params.matchId) || (matches[0] && matches[0].id) || '');
  const [playerId, setPlayerId] = useState((params && params.playerId) || '');
  useEffect(() => { if (params && params.matchId) setMatchId(params.matchId); if (params && params.playerId) setPlayerId(params.playerId); }, [params]);
  const m = model.matchById.get(matchId) || matches[0];
  const players = useMemo(() => (m ? model.rows.filter((r) => r.matchId === m.id && r.playerId).sort((a, b) => (!!(model.playerById.get(b.playerId) || {}).fav - !!(model.playerById.get(a.playerId) || {}).fav) || (a.side === b.side ? a.nick.localeCompare(b.nick) : a.side === 'R' ? -1 : 1)) : []), [model, m]);
  const cur = players.find((r) => r.playerId === playerId) || null;
  useEffect(() => { if (m && !cur && players[0]) setPlayerId(players[0].playerId); }, [m, cur, players]);
  const rt = m && cur ? getRating(model, m.id, cur.playerId) : null;
  const [draft, setDraft] = useState({ manual: {}, notes: '' }); const [dirty, setDirty] = useState(false);
  const key = m && cur ? ratingKey(m.id, cur.playerId) : '';
  useEffect(() => { const r = key ? model.ratingMap.get(key) : null; setDraft({ manual: { ...((r && r.manual) || {}) }, notes: (r && r.notes) || '' }); setDirty(false); }, [key, model.ratingMap]);
  if (!model.matches.length) return <Card><Empty>Sin partidos analizados. Las calificaciones se vinculan siempre a un partido y a un jugador.</Empty></Card>;
  if (!m) return null;
    const fin = rt ? rt.final : null; const auto = rt ? rt.auto : null;
  // la nota final de la vista previa usa el borrador (antes de guardar)
  const preview = cur ? finalRatings(null, auto) : null;
  async function save() {
    const manual = {}; // las calificaciones son automáticas: solo se guardan las notas
    await db.put('ratings', { id: key, matchId: m.id, playerId: cur.playerId, manual, notes: draft.notes.trim(), updatedAt: Date.now() }); setDirty(false); toast('Notas guardadas');
  }
  async function clearAll() { await db.del('ratings', key); toast('Notas borradas'); }
  const mates = cur ? players.filter((r) => r.side === cur.side && r.playerId !== cur.playerId).map((r) => { const g = getRating(model, m.id, r.playerId); return g && g.final && g.final.values.overall != null ? g.final.values.overall : null; }).filter((v) => v != null) : [];
  const mateAvg = mates.length ? mates.reduce((a, b) => a + b, 0) / mates.length : null;
  const sides = { R: teamName(model, m.redTeamId, 'Rojo'), B: teamName(model, m.blueTeamId, 'Azul') };
  return (
    <>
      <Card title="Partido y jugador">
        <Select label="Partido" value={m.id} onChange={(v) => { setMatchId(v); setPlayerId(''); }} options={matches.map((x) => [x.id, fmtDate(x.date) + ' · ' + sides_label(model, x)])} />
        <div className="sc-chips one">{players.map((r) => <button key={r.playerId} className={'sc-chip' + (r.playerId === playerId ? ' on' : '') + (r.side === 'R' ? ' r' : ' b')} onClick={() => setPlayerId(r.playerId)}>{(model.playerById.get(r.playerId) || {}).fav ? '★ ' : ''}{r.nick}</button>)}</div>
        {!players.length && <Empty small>Este partido no tiene jugadores vinculados.</Empty>}
      </Card>
      {cur && <>
        <Card className="sc-phead"><Avatar player={model.playerById.get(cur.playerId)} size={52} /><div className="mid"><h2>{cur.nick}</h2><small>{sides[cur.side]} · {m.score[0]}–{m.score[1]} · {fmtDate(m.date)}</small></div>
          <div className="sc-bigrate"><b>{preview && preview.values.overall != null ? fmtNum(preview.values.overall, 1) : '—'}</b><small>{preview && preview.sources.overall ? 'Calculada' : 'sin nota'}</small>{mateAvg != null && preview && preview.values.overall != null && <small className="sc-vs2">Equipo: {fmtNum(mateAvg, 1)} ({preview.values.overall - mateAvg >= 0 ? '+' : ''}{fmtNum(preview.values.overall - mateAvg, 1)})</small>}</div></Card>
        <div className="sc-kpis small"><Kpi label="Goles" value={cur.goals} prov="auto" /><Kpi label="Asist." value={cur.assists} prov="auto" /><Kpi label="Toques" value={cur.kicks} prov="auto" /><Kpi label="Pases" value={cur.passesCompleted + '/' + (cur.passesCompleted + cur.passesFailed)} prov="calc" sub={fmtPct(cur.passAccuracy)} /><Kpi label="Rec.+Int." value={cur.recoveries + cur.interceptions} prov="calc" /></div>
        <Card title="Criterios (0–10)" right={<span className="sc-sub">calculados con el partido</span>}>
          {auto && auto.role && (() => { const hab = (model.playerById.get(cur.playerId) || {}).position; const map = { Portero: 'GK', Defensa: 'DEF', Mediocentro: 'MID', Delantero: 'FWD' }; const diff = hab && map[hab] && map[hab] !== auto.role;
            return <p className="sc-note"><b>Jugó de {ROLE_LABEL[auto.role].toLowerCase()}</b> en este partido{diff ? ' (su posición habitual es ' + hab.toLowerCase() + ')' : ''}: se le puntúa por lo que hizo en ese puesto{auto.role === 'GK' ? ' (criterios de portero: paradas, goles encajados, colocación, despejes, distribución y seguridad con el balón)' : auto.role === 'DEF' ? ' (no se le exige marcar ni crear)' : auto.role === 'FWD' ? ' (no se le castiga por no defender)' : ''}.</p>; })()}
          {auto && auto.mix && auto.mix.length > 1 && <p className="sc-note"><b>Cambió de puesto durante el partido:</b> {auto.mix.map((m) => ROLE_LABEL[m.role] + ' ' + Math.round(m.share * 100) + ' %').join(' · ')}. La nota general es la media de su nota en cada puesto, según el tiempo que jugó en él.</p>}
          {auto && auto.reason && <p className="sc-note">{auto.reason}</p>}
          {auto && auto.played != null && auto.played < 0.98 && <p className="sc-note"><b>Minutos jugados:</b> {auto.playedSec != null ? Math.floor(auto.playedSec / 60) + ':' + String(auto.playedSec % 60).padStart(2, '0') : '—'} ({Math.round(auto.played * 100)} % del partido). {auto.played < 0.6 ? 'Al haber jugado poco, su nota se acerca al 5 neutro y pesa menos en sus medias.' : 'Jugó casi todo el partido.'}</p>}
          {criteriaFor(auto && auto.criteria).map((c) => { const v = fin ? fin.values[c.id] : null;
            return (<div className="sc-crit" key={c.id}>
              <div className="top"><b>{c.label}<Hint>{AUTO_HINT[c.id]}</Hint></b><span className="val">{v != null ? fmtNum(v, 1) : '—'}<Prov k="calc" /></span></div>
              <div className="sc-bar" role="img" aria-label={c.label + ' ' + (v != null ? v : 0) + ' de 10'} style={{ height: 8, borderRadius: 6, background: 'var(--sc-line, rgba(255,255,255,.12))', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: (v != null ? v * 10 : 0) + '%', background: 'var(--sc-acc, #C89A3D)' }} /></div>
            </div>); })}
          <div className="sc-crit"><div className="top"><b>Rendimiento general<Hint>75 % la media de los criterios{auto && auto.criteria === 'GK' ? ' de portero (paradas y goles encajados pesan más)' : ''} + 25 % el resultado del partido{auto && auto.result != null ? ' (' + fmtNum(auto.result, 1) + ': ' + m.score[cur.side === 'R' ? 0 : 1] + '–' + m.score[cur.side === 'R' ? 1 : 0] + ' para su equipo)' : ''}.</Hint></b><span className="val">{fin && fin.values.overall != null ? fmtNum(fin.values.overall, 1) : '—'}<Prov k="calc" /></span></div>
            <div className="sc-bar" style={{ height: 8, borderRadius: 6, background: 'var(--sc-line, rgba(255,255,255,.12))', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: (fin && fin.values.overall != null ? fin.values.overall * 10 : 0) + '%', background: 'var(--sc-acc, #C89A3D)' }} /></div>
            </div>
          <label className="sc-field"><span>Notas del partido <Prov k="manual" /></span><textarea rows={4} placeholder="Observaciones, puntos fuertes, a mejorar…" value={draft.notes} onChange={(e) => { setDraft((d) => ({ ...d, notes: e.target.value })); setDirty(true); }} /></label>
          <div className="sc-row end"><button className="sc-btn ghost" onClick={() => nav('players', { playerId: cur.playerId })}>Ver perfil</button>{rt && rt.record && rt.record.notes && <button className="sc-btn ghost danger" onClick={clearAll}>Borrar notas</button>}<button className="sc-btn" disabled={!dirty} onClick={save}>{dirty ? 'Guardar notas' : 'Notas guardadas'}</button></div>
        </Card>
        {preview && criteriaFor(preview.criteria).some((c) => preview.values[c.id] != null) && <Card title={preview.criteria && ROLE_SETS[preview.criteria] ? 'Perfil del partido (' + ROLE_LABEL[preview.criteria].toLowerCase() + ')' : 'Perfil del partido'}><div className="sc-center"><Radar axes={criteriaFor(preview.criteria).map((c) => ({ id: c.id, label: c.label }))} series={[{ name: cur.nick, values: preview.values }]} /></div></Card>}
      </>}
    </>
  );
}
function sides_label(model, x) { return teamName(model, x.redTeamId, 'Rojo') + ' ' + x.score[0] + '-' + x.score[1] + ' ' + teamName(model, x.blueTeamId, 'Azul') + ' · ' + x.rec.name; }

function Ranking({ model, view, nav }) {
  const ids = useMemo(() => new Set(view.matches.map((m) => m.id)), [view]);
  const [sort, setSort] = useState('overall');
  const [role, setRole] = useState('ALL');
  const list = role === 'ALL' ? null : ROLE_SETS[role];
  const rows = useMemo(() => model.players.map((p) => {
    let mids = ids;
    if (role !== 'ALL') { mids = new Set(model.rows.filter((r) => r.playerId === p.id && r.role === role && ids.has(r.matchId)).map((r) => r.matchId)); if (!mids.size) return null; }
    const ra = ratingAverage(model, p.id, mids); if (!ra) return null;
    const ca = list ? criteriaAverage(model, p.id, mids, list) : {};
    return { p, ra, ca };
  }).filter(Boolean).sort((a, b) => (sort === 'overall' || !list ? b.ra.avg - a.ra.avg : (b.ca[sort] == null ? -1 : b.ca[sort]) - (a.ca[sort] == null ? -1 : a.ca[sort]))), [model, ids, sort, role, list]);
  const seg = <Seg value={role} onChange={(v) => { setRole(v); setSort('overall'); }} options={[['ALL', 'Todos'], ['GK', 'Portero'], ['DEF', 'Defensa'], ['MID', 'Medio'], ['FWD', 'Delantero']]} />;
  if (!rows.length) return <div>{seg}<Card><Empty>Todavía no hay jugadores con calificaciones en este filtro. Analiza más partidos para activar las valoraciones automáticas.</Empty></Card></div>;
  return <div>{seg}<Card title="Ranking de scouting" right={<span className="sc-sub">{list ? 'criterios de ' + ROLE_LABEL[role].toLowerCase() : 'nota global'} · toca una columna para ordenar</span>}><div className="sc-scrollx"><table className="sc-table rank"><thead><tr><th>#</th><th>Jugador</th><th className={sort === 'overall' ? 'on' : ''} onClick={() => setSort('overall')}>Nota</th>{(list || []).map((c) => <th key={c.id} title={c.label} className={sort === c.id ? 'on' : ''} onClick={() => setSort(c.id)}>{c.label.split(' ')[0].slice(0, 6)}</th>)}<th>PJ</th></tr></thead>
    <tbody>{rows.map((x, i) => <tr key={x.p.id} onClick={() => nav('players', { playerId: x.p.id })}><td>{i + 1}</td><td className="nm"><Avatar player={x.p} size={22} /> {x.p.nick}</td><td><b>{fmtNum(x.ra.avg, 1)}</b></td>{(list || []).map((c) => <td key={c.id}>{x.ca[c.id] == null ? '·' : fmtNum(x.ca[c.id], 1)}</td>)}<td>{x.ra.n}</td></tr>)}</tbody></table></div>
    <p className="sc-note">{list ? 'Cada columna es un criterio propio del puesto (media de los partidos jugados ahí).' : 'Elige un puesto para ver sus criterios específicos.'}</p></Card></div>;
}
