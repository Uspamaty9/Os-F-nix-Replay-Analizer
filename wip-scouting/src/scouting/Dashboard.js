import React, { useEffect, useState } from 'react';
import { Card, Kpi, Empty, Avatar, Fold } from './ui';
import { LineChart, StackBar, Donut, VBars } from './charts';
import { dashboardData, applyFilters, ownTeamId, fmtPct, fmtNum, fmtDate, teamName, ratingAverage } from './model';
import { pendingReplays } from './ingest';

export default function Dashboard({ model, view: baseView, nav, openReplay }) {
  const [allTeams, setAllTeams] = useState(false);
  const own = ownTeamId(model);
  // Ámbito único: todas las cifras del panel se refieren al mismo equipo (el filtro, o «Mi equipo» por defecto).
  const useOwn = !baseView.filters.teamId && !!own && !allTeams;
  const view = useOwn ? applyFilters(model, { ...baseView.filters, teamId: own }) : baseView;
  const unassigned = useOwn ? baseView.matches.filter((m) => !m.redTeamId && !m.blueTeamId).length : 0;
  const d = dashboardData(model, view, { noOwn: allTeams });
  const [pending, setPending] = useState([]);
  useEffect(() => { let alive = true; pendingReplays().then((p) => { if (alive) setPending(p); }).catch(() => { }); return () => { alive = false; }; }, [model.matches.length]);
  const hasTeam = !!d.perspective;
  return (
    <div className="sc-view">
      {!view.matches.length && !model.matches.length && (
        <Card title="Bienvenido al centro de análisis"><Empty>Aún no hay partidos analizados. Abre una repetición desde el historial: al terminar de analizarla, sus estadísticas se guardan aquí automáticamente. {pending.length > 0 ? 'Tienes ' + pending.length + ' repeticiones en el historial listas para analizar (abajo).' : ''}</Empty></Card>
      )}
      {!view.matches.length && model.matches.length > 0 && <Card><Empty small>Ningún partido coincide con los filtros actuales.</Empty></Card>}
      {!baseView.filters.teamId && own && (
        <p className="sc-note scope">{useOwn ? 'Datos de ' + teamName(model, own) + ' (Mi equipo).' : 'Datos de todos los equipos.'} <button className="sc-link" onClick={() => setAllTeams(!allTeams)}>{useOwn ? 'Ver todos los equipos' : 'Solo mi equipo'}</button>{unassigned > 0 && useOwn ? ' · ' + unassigned + ' partido(s) sin equipo asignado no se incluyen.' : ''}</p>
      )}
      <div className="sc-kpis">
        <Kpi label="Partidos analizados" value={d.matchCount} prov="auto" />
        <Kpi label={hasTeam ? 'Victorias' : 'Partidos con ganador'} value={hasTeam ? d.W : d.decisive} tone={hasTeam ? 'good' : ''} />
        <Kpi label={hasTeam ? 'Empates' : 'Empates'} value={hasTeam ? d.D : d.draws} />
        <Kpi label={hasTeam ? 'Derrotas' : 'Equipo'} value={hasTeam ? d.L : '—'} tone={hasTeam ? 'bad' : ''} sub={hasTeam ? '' : 'Elige uno en los filtros'} />
        <Kpi label="Victorias (%)" value={fmtPct(d.winPct)} prov="calc" sub={hasTeam ? teamName(model, d.perspective) : 'Requiere equipo'} />
        <Kpi label="Goles" value={hasTeam && d.played ? d.goals + ' / ' + d.goalsAgainst : d.goals} sub={hasTeam ? 'a favor / en contra' : 'totales'} prov="auto" />
      </div>
      {hasTeam && d.manualResults > 0 && <p className="sc-note">Incluye {d.manualResults} resultados introducidos manualmente (sin repetición).</p>}
      <Fold title="Más cifras y promedios">
        <div className="sc-kpis small">
        <Kpi label="Jugadores registrados" value={d.players} />
        <Kpi label="Equipos registrados" value={d.teams} />
        <Kpi label="Asistencias" value={d.assists} prov="auto" />
        <Kpi label="Posesión media" value={fmtPct(d.possession)} prov="auto" />
        </div>
      <Card title="Promedios por partido">
        <div className="sc-kpis small">
          <Kpi label="Goles" value={fmtNum(d.perMatch.goals, 2)} prov="auto" />
          <Kpi label="Tiros a puerta" value={fmtNum(d.perMatch.shotsOT, 2)} prov="auto" />
          <Kpi label="Pases completados" value={fmtNum(d.perMatch.passes, 1)} prov="calc" />
          <Kpi label="Precisión de pases" value={fmtPct(d.perMatch.passAccuracy)} prov="calc" />
          <Kpi label="Recup. + intercep." value={fmtNum(d.perMatch.recoveries, 1)} prov="calc" />
        </div>
      </Card>
      </Fold>


      {hasTeam && d.played > 0 && <Card title="Resultados"><StackBar parts={[{ label: 'Victorias', value: d.W, color: '#59B96B' }, { label: 'Empates', value: d.D, color: '#9aa0a6' }, { label: 'Derrotas', value: d.L, color: '#D2504A' }]} height={16} /><div className="sc-legend"><span><i style={{ background: '#59B96B' }} />V {d.W}</span><span><i style={{ background: '#9aa0a6' }} />E {d.D}</span><span><i style={{ background: '#D2504A' }} />D {d.L}</span></div></Card>}

      {d.evo.length > 1 && (
        <Card title="Evolución del equipo" right={<span className="sc-sub">{teamName(model, d.perspective)}</span>}>
          <LineChart labels={d.evo.map((e) => String(e.i))} series={[{ name: 'Puntos acumulados', data: d.evo.map((e) => e.pts), area: true }, { name: 'Goles a favor', data: d.evo.map((e) => e.gf), color: '#59B96B' }, { name: 'Goles en contra', data: d.evo.map((e) => e.ga), color: '#D2504A' }]} fmt={(v) => fmtNum(v, 0)} ariaLabel="Evolución de puntos y goles" />
        </Card>
      )}

      <Fold title="Más gráficos">
          <LineChart labels={d.evo.map((e) => String(e.i))} series={[{ name: '% de victorias acumulado', data: d.evo.map((e) => Math.round(e.winPct * 100)), color: '#3FA7D6', area: true }]} yMin={0} yMax={100} height={130} fmt={(v) => v + '%'} ariaLabel="Evolución del porcentaje de victorias" />
      {view.matches.length > 1 && <Card title="Goles por partido"><VBars labels={view.matches.slice(0, 14).reverse().map((m) => fmtDate(m.date).slice(0, 5))} series={d.perspective ? [{ name: 'A favor', data: view.matches.slice(0, 14).reverse().map((m) => m.score[m.redTeamId === d.perspective ? 0 : 1]), color: '#59B96B' }, { name: 'En contra', data: view.matches.slice(0, 14).reverse().map((m) => m.score[m.redTeamId === d.perspective ? 1 : 0]), color: '#D2504A' }] : [{ name: 'Rojo', data: view.matches.slice(0, 14).reverse().map((m) => m.score[0]), color: '#B23A48' }, { name: 'Azul', data: view.matches.slice(0, 14).reverse().map((m) => m.score[1]), color: '#3A78B5' }]} /></Card>}
      </Fold>

      <Card title="Últimos partidos" right={view.matches.length > 0 && <button className="sc-link" onClick={() => nav('matches')}>Ver todos</button>}>
        {!d.lastMatches.length ? <Empty small>Sin partidos.</Empty> : <ul className="sc-list">{d.lastMatches.map((m) => (
          <li key={m.id} onClick={() => nav('matches', { matchId: m.id })}>
            <div className="sc-score"><i className="r" />{m.score[0]}<em>–</em>{m.score[1]}<i className="b" /></div>
            <div className="mid"><b>{teamName(model, m.redTeamId, 'Rojo')} vs {teamName(model, m.blueTeamId, 'Azul')}</b><small>{m.rec.name} · {fmtDate(m.date)}</small></div><span className="chev">›</span>
          </li>))}</ul>}
      </Card>

      <Card title="Jugadores destacados" right={<span className="sc-sub">goles + asistencias</span>}>
        {!d.top.length ? <Empty small>Sin datos de jugadores.</Empty> : <>
          <ul className="sc-list">{d.top.map((t) => { const p = model.playerById.get(t.playerId); if (!p) return null; const ra = ratingAverage(model, t.playerId, new Set(view.matches.map((m) => m.id))); return (
            <li key={t.playerId} onClick={() => nav('players', { playerId: t.playerId })}><Avatar player={p} size={38} /><div className="mid"><b>{p.nick}</b><small>{t.agg.matches} PJ · {t.agg.goals} G · {t.agg.assists} A{ra ? ' · nota ' + fmtNum(ra.avg, 1) : ''}</small></div><span className="big">{t.agg.goalInvolvements}</span></li>); })}</ul>
        </>}
      </Card>

      {pending.length > 0 && (
        <Fold title={'Repeticiones no analizadas (' + pending.length + ')'}>
          <p className="sc-note">Estas repeticiones del historial se guardaron antes de existir este módulo. Ábrelas una vez: al terminar el análisis, sus estadísticas se guardan solas.</p>
          <ul className="sc-list">{pending.slice(0, 6).map((r) => <li key={r.id} onClick={() => openReplay(r.id)}><div className="mid"><b>{r.name}</b><small>{r.info ? r.info.red + ' - ' + r.info.blue : 'Sin analizar'} · {fmtDate(r.addedAt)}</small></div><span className="sc-btn small">Analizar</span></li>)}</ul>
          {pending.length > 6 && <p className="sc-note">y {pending.length - 6} más en el historial.</p>}
        </Fold>
      )}
    </div>
  );
}
