import React, { useState } from 'react';
import * as db from './db';
import { Card, Empty, Seg, Select, Prov, toast, saveFile, textBytes, pickFile, slug, stamp } from './ui';
import { buildTeamReport, buildPlayerReport, buildMatchReport } from './report';
import { dashboardData, applyFilters, ownTeamId, teamName, fmtDate, fmtPct } from './model';
import { DEFINITIONS } from './analysis';

export default function Reports({ model, view, filters }) {
  const [kind, setKind] = useState('team'); const [teamId, setTeamId] = useState(filters.teamId || ownTeamId(model) || ''); const [playerId, setPlayerId] = useState(filters.playerId || ''); const [matchId, setMatchId] = useState('');
  const [busy, setBusy] = useState(false);
  async function gen() {
    setBusy(true);
    try {
      let bytes = null, name = '';
      if (kind === 'team') { bytes = buildTeamReport(model, { ...filters, teamId, playerId: '' }); name = 'Informe-' + slug(teamId ? teamName(model, teamId) : 'colectivo'); }
      else if (kind === 'player') { if (!playerId) { toast('Elige un jugador'); setBusy(false); return; } bytes = buildPlayerReport(model, playerId, { ...filters, playerId }); name = 'Informe-' + slug((model.playerById.get(playerId) || {}).nick); }
      else { if (!matchId) { toast('Elige un partido'); setBusy(false); return; } bytes = buildMatchReport(model, matchId); name = 'Partido-' + slug((model.matchById.get(matchId) || { rec: {} }).rec.name); }
      if (!bytes) { toast('No hay datos para el informe'); setBusy(false); return; }
      await saveFile(name + '-' + stamp() + '.pdf', 'application/pdf', bytes); toast('Informe PDF guardado');
    } catch (e) { toast('No se pudo crear el informe'); }
    setBusy(false);
  }
  async function backup() { try { await saveFile('OsFenix-scouting-' + stamp() + '.fenixscout', 'application/octet-stream', textBytes(await db.exportScouting())); toast('Copia guardada'); } catch (e) { toast('No se pudo crear la copia'); } }
  async function restore() { const f = await pickFile('.fenixscout,.json,application/json'); if (!f) return; try { const n = await db.importScouting(await f.text()); toast(n + ' registros restaurados'); } catch (e) { toast('Archivo no válido'); } }
  const d = kind === 'team' ? dashboardData(model, applyFilters(model, { ...filters, teamId }), { noOwn: !teamId }) : null;
  return (
    <div className="sc-view">
      <Card title="Informes en PDF">
        <Seg value={kind} onChange={setKind} options={[['team', 'Equipo / colectivo'], ['player', 'Jugador'], ['match', 'Partido']]} />
        {kind === 'team' && <><Select label="Equipo" value={teamId} onChange={setTeamId} placeholder="Todos los equipos" options={model.teams.map((t) => [t.id, t.name])} /><p className="sc-note">Estadísticas colectivas, evolución, últimos partidos, individuales, calificaciones, red de pases y conclusiones. Respeta los filtros de temporada y competición.</p></>}
        {kind === 'player' && <><Select label="Jugador" value={playerId} onChange={setPlayerId} placeholder="Elegir…" options={model.players.map((p) => [p.id, p.nick])} /><p className="sc-note">Resumen, estadísticas acumuladas, perfil de scouting, evolución, historial, notas y conclusiones.</p></>}
        {kind === 'match' && <><Select label="Partido" value={matchId} onChange={setMatchId} placeholder="Elegir…" options={model.matches.map((m) => [m.id, fmtDate(m.date) + ' · ' + m.score[0] + '–' + m.score[1] + ' ' + m.rec.name])} /><p className="sc-note">Comparativa de equipos, goles, jugadores, red de pases y conclusiones.</p></>}
        {!model.matches.length ? <Empty small>Aún no hay partidos analizados para informar.</Empty> : <button className="sc-btn wide" disabled={busy} onClick={gen}>{busy ? 'Generando…' : 'Generar PDF'}</button>}
        {d && <p className="sc-note">Vista previa: {d.matchCount} partidos{d.perspective ? ' · ' + d.W + 'V ' + d.D + 'E ' + d.L + 'D (' + fmtPct(d.winPct) + ')' : ''}.</p>}
      </Card>
      <Card title="Cómo se calcula cada dato"><ul className="sc-defs">{DEFINITIONS.map((x) => <li key={x[0]}><b>{x[0]}</b><Prov k={x[1]} /><p>{x[2]}</p></li>)}</ul></Card>
      <Card title="Copia de seguridad del módulo"><p className="sc-note">Guarda equipos, jugadores, partidos analizados, calificaciones y competiciones. Los datos ya se guardan solos en este dispositivo; la copia sirve para pasarlos a otro o protegerlos. Restaurar no borra nada: solo añade o actualiza.</p><div className="sc-row wrap"><button className="sc-btn small" onClick={backup}>Crear copia</button><button className="sc-btn small ghost" onClick={restore}>Restaurar copia</button></div></Card>
    </div>
  );
}
