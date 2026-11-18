import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { Card, Kpi, Empty, Avatar, Seg, Select, Prov, Hint, toast } from './ui';
import { Radar } from './charts';
import { getRating, rowFor, ratingKey, ratingAverage, criteriaAverage, teamName, fmtNum, fmtDate, fmtPct } from './model';
import { CRITERIA, finalRatings } from './analysis';

const AUTO_HINT = {
  passing: 'Posición percentil de la precisión de pases (completados / intentos).', finishing: 'Media de los percentiles de goles y tiros a puerta.', defense: 'Percentil de bloqueos + intercepciones.', recoveries: 'Percentil de recuperaciones.', involvement: 'Percentil de la cuota de toques del equipo.', creation: 'Media de los percentiles de asistencias y pases clave.',
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
  const setC = (id, v) => { setDraft((d) => ({ ...d, manual: { ...d.manual, [id]: v } })); setDirty(true); };
  const fin = rt ? rt.final : null; const auto = rt ? rt.auto : null;
  // la nota final de la vista previa usa el borrador (antes de guardar)
  const preview = cur ? finalRatings(draft.manual, auto) : null;
  async function save() {
    const manual = {}; Object.keys(draft.manual).forEach((k) => { const v = draft.manual[k]; if (v !== null && v !== '' && v !== undefined && !isNaN(+v)) manual[k] = Math.max(0, Math.min(10, +v)); });
    await db.put('ratings', { id: key, matchId: m.id, playerId: cur.playerId, manual, notes: draft.notes.trim(), updatedAt: Date.now() }); setDirty(false); toast('Calificación guardada');
  }
  async function clearAll() { await db.del('ratings', key); toast('Calificación manual borrada'); }
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
          <div className="sc-bigrate"><b>{preview && preview.values.overall != null ? fmtNum(preview.values.overall, 1) : '—'}</b><small>{preview && preview.sources.overall ? (preview.sources.overall === 'manual' ? 'Manual' : 'Calculada') : 'sin nota'}</small>{mateAvg != null && preview && preview.values.overall != null && <small className="sc-vs2">Equipo: {fmtNum(mateAvg, 1)} ({preview.values.overall - mateAvg >= 0 ? '+' : ''}{fmtNum(preview.values.overall - mateAvg, 1)})</small>}</div></Card>
        <div className="sc-kpis small"><Kpi label="Goles" value={cur.goals} prov="auto" /><Kpi label="Asist." value={cur.assists} prov="auto" /><Kpi label="Toques" value={cur.kicks} prov="auto" /><Kpi label="Pases" value={cur.passesCompleted + '/' + (cur.passesCompleted + cur.passesFailed)} prov="calc" sub={fmtPct(cur.passAccuracy)} /><Kpi label="Rec.+Int." value={cur.recoveries + cur.interceptions} prov="calc" /></div>
        {auto && !auto.enough && <p className="sc-note warn">Valoración automática no disponible. {auto.reason}</p>}
        <Card title="Criterios (0–10)" right={<span className="sc-sub">manual prevalece sobre automático</span>}>
          {CRITERIA.map((c) => { const mv = draft.manual[c.id]; const av = auto && auto.values ? auto.values[c.id] : null; const has = mv !== undefined && mv !== null && mv !== ''; const shown = has ? +mv : av != null ? av : 5;
            return (<div className="sc-crit" key={c.id}>
              <div className="top"><b>{c.label}</b><span className={'val' + (has ? '' : ' dim')}>{has ? fmtNum(+mv, 1) : av != null ? fmtNum(av, 1) : '—'}{has ? <Prov k="manual" /> : av != null ? <Prov k="calc" /> : null}</span></div>
              <input type="range" min="0" max="10" step="0.5" value={shown} onChange={(e) => setC(c.id, +e.target.value)} aria-label={c.label} />
              <div className="sub">{c.auto ? (av != null ? <span>Auto: <b>{fmtNum(av, 1)}</b> <small>{AUTO_HINT[c.id]}</small></span> : <span>Auto: sin datos suficientes</span>) : <span>Solo manual: el motor no registra este dato.</span>}
                <span className="act">{av != null && <button className="sc-link" onClick={() => setC(c.id, av)}>Usar auto</button>}{has && <button className="sc-link" onClick={() => setC(c.id, null)}>Quitar</button>}</span></div>
            </div>); })}
          <div className="sc-crit"><div className="top"><b>Rendimiento general</b><span className="val">{preview && preview.values.overall != null ? fmtNum(preview.values.overall, 1) : '—'}{preview && preview.sources.overall && <Prov k={preview.sources.overall} />}</span></div>
            <input type="range" min="0" max="10" step="0.5" value={draft.manual.overall != null && draft.manual.overall !== '' ? +draft.manual.overall : preview && preview.values.overall != null ? preview.values.overall : 5} onChange={(e) => setC('overall', +e.target.value)} aria-label="Rendimiento general" />
            <div className="sub"><span>Si no la fijas, es la media de los criterios disponibles (mínimo 3).</span><span className="act">{draft.manual.overall != null && <button className="sc-link" onClick={() => setC('overall', null)}>Quitar</button>}</span></div></div>
          <label className="sc-field"><span>Notas del partido <Prov k="manual" /></span><textarea rows={4} placeholder="Observaciones, puntos fuertes, a mejorar…" value={draft.notes} onChange={(e) => { setDraft((d) => ({ ...d, notes: e.target.value })); setDirty(true); }} /></label>
          <div className="sc-row end"><button className="sc-btn ghost" onClick={() => nav('players', { playerId: cur.playerId })}>Ver perfil</button>{rt && rt.record && <button className="sc-btn ghost danger" onClick={clearAll}>Borrar manual</button>}<button className="sc-btn" disabled={!dirty} onClick={save}>{dirty ? 'Guardar' : 'Guardado'}</button></div>
        </Card>
        {preview && CRITERIA.some((c) => preview.values[c.id] != null) && <Card title="Perfil del partido"><div className="sc-center"><Radar axes={CRITERIA.map((c) => ({ id: c.id, label: c.label }))} series={[{ name: cur.nick, values: preview.values }]} /></div></Card>}
      </>}
    </>
  );
}
function sides_label(model, x) { return teamName(model, x.redTeamId, 'Rojo') + ' ' + x.score[0] + '-' + x.score[1] + ' ' + teamName(model, x.blueTeamId, 'Azul') + ' · ' + x.rec.name; }

function Ranking({ model, view, nav }) {
  const ids = useMemo(() => new Set(view.matches.map((m) => m.id)), [view]);
  const [sort, setSort] = useState('overall');
  const rows = useMemo(() => model.players.map((p) => { const ra = ratingAverage(model, p.id, ids); const ca = criteriaAverage(model, p.id, ids); return { p, ra, ca }; }).filter((x) => x.ra).sort((a, b) => (sort === 'overall' ? b.ra.avg - a.ra.avg : (b.ca[sort] == null ? -1 : b.ca[sort]) - (a.ca[sort] == null ? -1 : a.ca[sort]))), [model, ids, sort]);
  if (!rows.length) return <Card><Empty>Todavía no hay jugadores con calificaciones en este filtro. Evalúa a un jugador (manual) o analiza más partidos para activar las valoraciones automáticas.</Empty></Card>;
  const short = { positioning: 'Pos', vision: 'Vis', passing: 'Pas', finishing: 'Def', defense: 'Dfn', recoveries: 'Rec', involvement: 'Par', creation: 'Cre', decisions: 'Dec' };
  return <Card title="Ranking de scouting" right={<span className="sc-sub">toca una columna para ordenar</span>}><div className="sc-scrollx"><table className="sc-table rank"><thead><tr><th>#</th><th>Jugador</th><th className={sort === 'overall' ? 'on' : ''} onClick={() => setSort('overall')}>Nota</th>{CRITERIA.map((c) => <th key={c.id} title={c.label} className={sort === c.id ? 'on' : ''} onClick={() => setSort(c.id)}>{short[c.id]}</th>)}<th>PJ</th></tr></thead>
    <tbody>{rows.map((x, i) => <tr key={x.p.id} onClick={() => nav('players', { playerId: x.p.id })}><td>{i + 1}</td><td className="nm"><Avatar player={x.p} size={22} /> {x.p.nick}</td><td><b>{fmtNum(x.ra.avg, 1)}</b></td>{CRITERIA.map((c) => <td key={c.id}>{x.ca[c.id] == null ? '·' : fmtNum(x.ca[c.id], 1)}</td>)}<td>{x.ra.n}</td></tr>)}</tbody></table></div>
    <p className="sc-note">Pos posicionamiento · Vis visión · Pas pases · Def definición · Dfn defensa · Rec recuperaciones · Par participación · Cre creación · Dec decisiones.</p></Card>;
}
