import React, { useCallback, useState } from 'react';
import './scouting.scss';
import { useModel, useLocal, Select, Seg } from './ui';
import { applyFilters, EMPTY_FILTERS, teamName } from './model';
import Dashboard from './Dashboard';
import Players from './Players';
import Scouting from './Scouting';
import Matches from './Matches';
import Network from './Network';
import Teams from './Teams';
import Reports from './Reports';

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() { return this.state.err ? <div className="sc-card"><div className="sc-empty">Algo falló al mostrar esta sección. Tus datos están a salvo. <small>{String(this.state.err.message || this.state.err)}</small></div></div> : this.props.children; }
}

const TABS = [['dash', 'Panel', 'M4 20V10M10 20V4M16 20v-7M22 20H2'], ['players', 'Jugadores', 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0'], ['scouting', 'Scouting', 'M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6L12 16.8 6.6 19.6l1.2-6L3.3 9.4l6.1-.8z'], ['matches', 'Partidos', 'M3 5h18v14H3zM12 5v14M3 12h18'], ['network', 'Pases', 'M5 6a2 2 0 100-4 2 2 0 000 4zM19 8a2 2 0 100-4 2 2 0 000 4zM12 21a2 2 0 100-4 2 2 0 000 4zM7 5l10 2M6 7l5 11M18 9l-5 8'], ['teams', 'Equipos', 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6'], ['reports', 'Informes', 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6']];

export default function ScoutingApp({ onClose, openReplay }) {
  const { model, error } = useModel();
  const [tab, setTab] = useState('dash'); const [params, setParams] = useState({});
  const [filters, setFilters] = useLocal('sc-filters', EMPTY_FILTERS); const [fopen, setFopen] = useState(false);
  const nav = useCallback((t, p) => { setTab(t); setParams(p || {}); const el = document.querySelector('.sc-main'); if (el) el.scrollTop = 0; }, []);
  const open = useCallback((id) => { onClose(); openReplay(id); }, [onClose, openReplay]);
  let f = filters;
  if (model) { // limpia filtros que apuntan a elementos eliminados
    const ok = (list, id) => !id || list.some((x) => x.id === id);
    f = { seasonId: ok(model.seasons, filters.seasonId) ? filters.seasonId : '', competitionId: ok(model.competitions, filters.competitionId) ? filters.competitionId : '', teamId: ok(model.teams, filters.teamId) ? filters.teamId : '', playerId: ok(model.players, filters.playerId) ? filters.playerId : '' };
  }
  const view = model ? applyFilters(model, f) : null;
  const active = Object.values(f).filter(Boolean).length;
  const set = (k) => (v) => setFilters({ ...f, [k]: v });
  const showFilters = tab !== 'teams' && tab !== 'reports';
  return (
    <div className="sc-root sc-overlay-full" role="dialog" aria-label="Centro de análisis">
      <header className="sc-top">
        <button className="sc-x" onClick={onClose} aria-label="Volver">‹</button>
        <h1>Centro de análisis</h1>
        {showFilters && <button className={'sc-filterbtn' + (active ? ' on' : '')} onClick={() => setFopen(!fopen)} aria-expanded={fopen}>Filtros{active ? ' · ' + active : ''}</button>}
      </header>
      {showFilters && fopen && model && (
        <div className="sc-filterbar">
          <Select label="Temporada" value={f.seasonId} onChange={set('seasonId')} placeholder="Todas" options={model.seasons.map((s) => [s.id, s.name])} />
          <Select label="Competición" value={f.competitionId} onChange={set('competitionId')} placeholder="Todas" options={model.competitions.map((c) => [c.id, c.name])} />
          <Select label="Equipo" value={f.teamId} onChange={set('teamId')} placeholder="Todos" options={model.teams.map((t) => [t.id, t.name])} />
          <Select label="Jugador" value={f.playerId} onChange={set('playerId')} placeholder="Todos" options={model.players.map((p) => [p.id, p.nick])} />
          {active > 0 && <button className="sc-link" onClick={() => setFilters(EMPTY_FILTERS)}>Limpiar filtros</button>}
        </div>
      )}
      <main className="sc-main">
        {!model ? <div className="sc-empty">Cargando…</div> : error ? <div className="sc-card"><div className="sc-empty">No se pudo abrir el almacenamiento local ({error}). Las estadísticas no se podrán guardar en este navegador.</div></div> : (
          <Boundary k={tab + JSON.stringify(params)}>
            {tab === 'dash' && <Dashboard model={model} view={view} nav={nav} openReplay={open} />}
            {tab === 'players' && <Players model={model} view={view} filters={f} nav={nav} params={params} />}
            {tab === 'scouting' && <Scouting model={model} view={view} nav={nav} params={params} />}
            {tab === 'matches' && <Matches model={model} view={view} nav={nav} params={params} openReplay={open} />}
            {tab === 'network' && <Network model={model} view={view} filters={f} nav={nav} params={params} />}
            {tab === 'teams' && <Teams model={model} nav={nav} />}
            {tab === 'reports' && <Reports model={model} view={view} filters={f} />}
          </Boundary>
        )}
      </main>
      <nav className="sc-tabs" aria-label="Secciones">
        {TABS.map(([id, label, d]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => nav(id, {})} aria-current={tab === id ? 'page' : undefined}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg><span>{label}</span></button>)}
      </nav>
    </div>
  );
}
