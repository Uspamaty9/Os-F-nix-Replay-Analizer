import React, { useMemo, useState } from 'react';
import * as db from './db';
import { Card, Kpi, Empty, Avatar, Seg, Select, Input, Prov, useConfirm, toast, saveFile, slug, stamp } from './ui';
import { NetworkGraph, StackBar } from './charts';
import { passNetwork, teamName, fmtPct, fmtNum, fmtDate, fmtDur } from './model';
import { suggestTeams } from './ingest';
import { buildMatchReport } from './report';

export default function Matches({ model, view, nav, params, openReplay }) {
  const sel = params && params.matchId && model.matchById.get(params.matchId);
  const [q, setQ] = useState('');
  if (sel) return <Detail model={model} m={sel} nav={nav} openReplay={openReplay} />;
  const list = view.matches.filter((m) => !q || (m.rec.name + ' ' + teamName(model, m.redTeamId, '') + ' ' + teamName(model, m.blueTeamId, '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="sc-view"><Card title="Partidos analizados" right={<span className="sc-sub">{view.matches.length}</span>}>
      <input className="sc-search" placeholder="Buscar partido o equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!list.length ? <Empty>{model.matches.length ? 'Ningún partido coincide con los filtros.' : 'Aún no hay partidos. Abre una repetición desde el historial y, cuando termine de analizarse, aparecerá aquí con todas sus estadísticas.'}</Empty> : (
        <ul className="sc-list">{list.map((m) => <li key={m.id} onClick={() => nav('matches', { matchId: m.id })}>
          <div className="sc-score"><i className="r" />{m.score[0]}<em>–</em>{m.score[1]}<i className="b" /></div>
          <div className="mid"><b>{teamName(model, m.redTeamId, 'Rojo')} vs {teamName(model, m.blueTeamId, 'Azul')}</b><small>{m.rec.name} · {fmtDate(m.date)} · {fmtDur(m.ticks)}{m.rec.parts.length > 1 ? ' · ' + m.rec.parts.length + ' tramos' : ''}</small></div><span className="chev">›</span></li>)}</ul>)}
    </Card></div>
  );
}

function Detail({ model, m, nav, openReplay }) {
  const { rec, an } = m; const [side, setSide] = useState('both'); const [pid, setPid] = useState(''); const [confirm, confirmEl] = useConfirm();
  const rn = teamName(model, m.redTeamId, 'Rojo'), bn = teamName(model, m.blueTeamId, 'Azul');
  const upd = async (patch) => { await db.put('matches', { ...rec, ...patch }); };
  const comps = model.competitions.filter((c) => !rec.seasonId || !c.seasonId || c.seasonId === rec.seasonId);
  const fixtures = model.fixtures.filter((f) => (!rec.competitionId || f.competitionId === rec.competitionId));
  const R = an.teams.R, B = an.teams.B;
  const rows = an.players.filter((p) => (p.team === 'R' || p.team === 'B') && (side === 'both' || p.team === side) && (!pid || (model.idx.get(p.nick.trim().toLowerCase()) || {}).id === pid));
  const net = useMemo(() => passNetwork(model, [m], side === 'both' ? '' : side === 'R' ? m.redTeamId || '__none' : m.blueTeamId || '__none'), [model, m, side]);
  const cmpRows = [['Posesión', R.possession, B.possession, 'auto', fmtPct], ['Goles', R.goals, B.goals, 'auto'], ['Tiros a puerta', R.shotsOT, B.shotsOT, 'auto'], ['Conversión', R.conversion, B.conversion, 'calc', fmtPct], ['Toques', R.kicks, B.kicks, 'auto'], ['Pases completados', R.passesCompleted, B.passesCompleted, 'calc'], ['Pases fallidos', R.passesFailed, B.passesFailed, 'calc'], ['Precisión de pases', R.passAccuracy, B.passAccuracy, 'calc', fmtPct], ['Pérdidas', R.turnovers, B.turnovers, 'calc'], ['Recuperaciones', R.recoveries, B.recoveries, 'calc'], ['Intercepciones', R.interceptions, B.interceptions, 'calc'], ['Bloqueos', R.blocks, B.blocks, 'calc'], ['Pases clave', R.keyPasses, B.keyPasses, 'calc'], ['Tiros a puerta evitados', R.savesImplied, B.savesImplied, 'calc'], ['Tercios (def·med·ata)', R.thirds.join(' · '), B.thirds.join(' · '), 'auto']];
  const dateStr = rec.date ? new Date(rec.date).toISOString().slice(0, 10) : '';
  async function pdf() { try { const b = buildMatchReport(model, m.id); await saveFile('Partido-' + slug(rn + '-' + bn) + '-' + stamp() + '.pdf', 'application/pdf', b); toast('Informe PDF guardado'); } catch (e) { toast('No se pudo crear el informe'); } }
  async function remove() { if (await confirm('Se borrarán las estadísticas guardadas de este partido (calificaciones incluidas). La repetición seguirá en el historial y podrás volver a analizarla.', 'Borrar estadísticas')) { await db.delMany('ratings', model.ratings.filter((r) => r.matchId === m.id).map((r) => r.id)); await db.del('matches', m.id); nav('matches', {}); } }
  function suggest() { const s = suggestTeams(rec.parts[rec.partIdx], model.players); if (!s.R && !s.B) { toast('No hay suficientes jugadores con equipo para sugerir'); return; } upd({ redTeamId: s.R, blueTeamId: s.B, teamAuto: true }); toast('Equipos asignados según las plantillas'); }
  return (
    <div className="sc-view">
      <button className="sc-link back" onClick={() => nav('matches', {})}>‹ Partidos</button>
      <Card className="sc-mhead"><div className="sc-bigscore"><div className="t r">{rn}</div><div className="s">{m.score[0]} <em>–</em> {m.score[1]}</div><div className="t b">{bn}</div></div>
        <small>{rec.name} · {fmtDate(m.date)} · {fmtDur(m.ticks)}{an.stadium ? ' · ' + an.stadium : ''}</small>
        <div className="sc-row wrap"><button className="sc-btn small" onClick={() => openReplay(rec.replayId)}>▶ Ver repetición</button><button className="sc-btn small ghost" onClick={pdf}>Informe PDF</button><button className="sc-btn small ghost" onClick={() => nav('scouting', { matchId: m.id })}>Evaluar jugadores</button></div>
        {(an.consistency.scoreMatchesGoals === false || an.consistency.passesMatch === false || an.consistency.kicksMatch === false) && <p className="sc-note warn">Aviso de coherencia: {an.consistency.scoreMatchesGoals === false ? 'el marcador no coincide con la lista de goles. ' : ''}{an.consistency.passesMatch === false ? 'pases reconstruidos ' + an.consistency.passesDerived + ' vs motor ' + an.consistency.passesEngine + '. ' : ''}{an.consistency.kicksMatch === false ? 'toques no coinciden con el contador del motor.' : ''}</p>}
        {an.spaceMode && <p className="sc-note">Partida en modo especial: los pases se reconstruyen de la secuencia de toques.</p>}
      </Card>
      <Card title="Datos del partido" right={<span className="sc-sub">manual <Prov k="manual" /></span>}>
        <div className="sc-grid2">
          <Input label="Nombre" value={rec.name} onChange={(v) => upd({ name: v })} />
          <Input label="Fecha" type="date" value={dateStr} onChange={(v) => v && upd({ date: new Date(v + 'T12:00:00').getTime() })} />
          <Select label="Equipo rojo" value={rec.redTeamId || ''} onChange={(v) => upd({ redTeamId: v || null, teamAuto: false })} placeholder="Sin asignar" options={model.teams.map((t) => [t.id, t.name])} />
          <Select label="Equipo azul" value={rec.blueTeamId || ''} onChange={(v) => upd({ blueTeamId: v || null, teamAuto: false })} placeholder="Sin asignar" options={model.teams.map((t) => [t.id, t.name])} />
          <Select label="Temporada" value={rec.seasonId || ''} onChange={(v) => upd({ seasonId: v || null })} placeholder="Sin temporada" options={model.seasons.map((s) => [s.id, s.name])} />
          <Select label="Competición" value={rec.competitionId || ''} onChange={(v) => upd({ competitionId: v || null })} placeholder="Sin competición" options={comps.map((c) => [c.id, c.name])} />
          <Input label="Jornada / ronda" value={rec.round || ''} onChange={(v) => upd({ round: v })} placeholder="Ej. 3" />
          <Select label="Vincular a jornada programada" value={rec.fixtureId || ''} onChange={(v) => { const f = model.fixtures.find((x) => x.id === v); upd(f ? { fixtureId: f.id, competitionId: f.competitionId, round: String(f.round || ''), redTeamId: f.homeId, blueTeamId: f.awayId, seasonId: (model.competitions.find((c) => c.id === f.competitionId) || {}).seasonId || rec.seasonId, teamAuto: false } : { fixtureId: null }); }} placeholder="Ninguna" options={fixtures.map((f) => [f.id, (f.round ? 'J' + f.round + ' · ' : '') + teamName(model, f.homeId) + ' vs ' + teamName(model, f.awayId)])} />
        </div>
        {rec.teamAuto && <p className="sc-note">Equipos sugeridos automáticamente según las plantillas. Cámbialos si no son correctos.</p>}
        <div className="sc-row wrap"><button className="sc-btn small ghost" onClick={suggest}>Sugerir equipos por plantilla</button>{rec.fixtureId && <small className="sc-sub">Vinculado a la jornada: el resultado sale de la repetición.</small>}</div>
        {rec.parts.length > 1 && <><hr /><p className="sc-note">La repetición contiene {rec.parts.length} tramos. Se usa uno para las estadísticas del partido:</p><Seg value={String(rec.partIdx)} onChange={(v) => upd({ partIdx: +v })} options={rec.parts.map((p, i) => [String(i), 'Tramo ' + (i + 1) + ' · ' + p.scoreRed + '–' + p.scoreBlue + ' · ' + fmtDur(p.ticks)])} /></>}
      </Card>
      <Card title="Comparativa de equipos"><div className="sc-vs">{cmpRows.map(([l, a, b, pv, fm]) => { const f = fm || ((v) => v); const na = typeof a === 'number' ? a : null, nb = typeof b === 'number' ? b : null; return <div key={l} className="row"><b className={na != null && nb != null && na > nb ? 'win' : ''}>{a == null ? '—' : f(a)}</b><span>{l}<Prov k={pv} /></span><b className={na != null && nb != null && nb > na ? 'win' : ''}>{b == null ? '—' : f(b)}</b></div>; })}</div>
        <div className="sc-legend"><span><i style={{ background: '#B23A48' }} />{rn}</span><span><i style={{ background: '#3A78B5' }} />{bn}</span></div>
        {R.possession != null && <StackBar parts={[{ label: rn, value: Math.round(R.possession * 100), color: '#B23A48' }, { label: bn, value: Math.round(B.possession * 100), color: '#3A78B5' }]} />}</Card>
      <Card title="Jugadores"><div className="sc-filters2"><Seg value={side} onChange={setSide} options={[['both', 'Ambos'], ['R', 'Rojo'], ['B', 'Azul']]} /><Select value={pid} onChange={setPid} placeholder="Todos los jugadores" options={model.rows.filter((r) => r.matchId === m.id && r.playerId).map((r) => [r.playerId, r.nick])} /></div>
        <div className="sc-scrollx"><table className="sc-table players"><thead><tr><th>Jugador</th><th>G</th><th>A</th><th>Toq</th><th>T.pta</th><th>Pases</th><th>Fall</th><th>Rec</th><th>Int</th><th>Blq</th><th>Pérd</th><th>P.cl</th><th>Of%</th><th>Df%</th></tr></thead>
          <tbody>{rows.map((p) => { const pl = model.idx.get(p.nick.trim().toLowerCase()); return <tr key={p.pi} className={p.team === 'R' ? 'rr' : 'bb'} onClick={() => pl && nav('players', { playerId: pl.id })}><td className="nm">{p.nick}</td><td>{p.goals}</td><td>{p.assists}</td><td>{p.kicks}</td><td>{p.shotsOT}</td><td>{p.passesCompleted}</td><td>{p.passesFailed}</td><td>{p.recoveries}</td><td>{p.interceptions}</td><td>{p.blocks}</td><td>{p.turnovers}</td><td>{p.keyPasses}</td><td>{fmtPct(p.offParticipation)}</td><td>{fmtPct(p.defParticipation)}</td></tr>; })}</tbody></table></div>
        <p className="sc-note">G, A, Toq y T.pta (tiros a puerta) <Prov k="auto" /> · el resto <Prov k="calc" /> (ver «Cómo se calcula» en Informes).</p></Card>
      {an.goalsList.length > 0 && <Card title="Goles"><ul className="sc-list">{an.goalsList.map((g, i) => <li key={i}><span className={'sc-dot ' + (g.f === 'R' ? 'r' : 'b')} /><div className="mid"><b>{an.names[g.s]}{g.own ? ' (en propia)' : ''}</b><small>{g.a >= 0 ? 'Asistencia: ' + an.names[g.a] : 'Sin asistencia'}</small></div><span className="big">{g.sc ? g.sc[0] + '–' + g.sc[1] : ''}</span></li>)}</ul></Card>}
      {net.edges.length > 0 && <Card title="Red de pases" right={<button className="sc-link" onClick={() => nav('network', { matchId: m.id })}>Abrir análisis</button>}><NetworkGraph nodes={net.nodes} edges={net.edges} /></Card>}
      <div className="sc-row end"><button className="sc-btn small ghost danger" onClick={remove}>Borrar estadísticas de este partido</button></div>
      {confirmEl}
    </div>
  );
}
