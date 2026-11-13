import React, { useMemo, useState } from 'react';
import { Card, Kpi, Empty, Seg, Select } from './ui';
import { NetworkGraph, PassMatrix, HBars } from './charts';
import { passNetwork, goalLinks, passChains, teamName, fmtPct, fmtNum, fmtDate } from './model';

export default function Network({ model, view, filters, params, nav }) {
  const matches = view.matches; const [matchId, setMatchId] = useState((params && params.matchId) || '');
  const [teamSide, setTeamSide] = useState(filters.teamId || ''); const [layout, setLayout] = useState('campo'); const [minE, setMinE] = useState(1); const [selNode, setSelNode] = useState(null);
  const scope = useMemo(() => (matchId ? matches.filter((m) => m.id === matchId) : matches), [matches, matchId]);
  const teamId = teamSide;
  const net = useMemo(() => passNetwork(model, scope, teamId), [model, scope, teamId]);
  const links = useMemo(() => goalLinks(model, scope, teamId), [model, scope, teamId]);
  const chains = useMemo(() => passChains(model, scope, teamId), [model, scope, teamId]);
  const nm = (id) => (net.nodes.find((n) => n.id === id) || model.playerById.get(id) || {}).nick || '—';
  const maxE = Math.max.apply(null, net.edges.map((e) => e.n).concat([1]));
  const node = selNode && net.nodes.find((n) => n.id === selNode);
  const outs = node ? net.edges.filter((e) => e.a === node.id).slice(0, 5) : [], ins = node ? net.edges.filter((e) => e.b === node.id).slice(0, 5) : [];
  if (!model.matches.length) return <div className="sc-view"><Card><Empty>La red de pases necesita partidos analizados.</Empty></Card></div>;
  const attempts = net.totalPasses + net.failedTotal;
  return (
    <div className="sc-view">
      <Card title="Red de pases">
        <div className="sc-filters2">
          <Select label="Partido" value={matchId} onChange={(v) => { setMatchId(v); setSelNode(null); }} placeholder={'Todos los filtrados (' + matches.length + ')'} options={matches.map((m) => [m.id, fmtDate(m.date) + ' · ' + m.score[0] + '–' + m.score[1] + ' ' + m.rec.name])} />
          <Select label="Equipo" value={teamSide} onChange={(v) => { setTeamSide(v); setSelNode(null); }} placeholder="Ambos bandos" options={model.teams.map((t) => [t.id, t.name])} />
        </div>
        <div className="sc-filters2"><Seg value={layout} onChange={setLayout} options={[['campo', 'En el campo'], ['circulo', 'Círculo']]} /><label className="sc-field"><span>Mín. pases por conexión: {minE}</span><input type="range" min="1" max={Math.max(1, maxE)} value={Math.min(minE, Math.max(1, maxE))} onChange={(e) => setMinE(+e.target.value)} /></label></div>
        {!net.edges.length ? <Empty>No hay pases completados con esta selección.</Empty> : <NetworkGraph nodes={net.nodes} edges={net.edges} layout={layout} selected={selNode} onSelect={setSelNode} minEdge={minE} height={320} />}
        <p className="sc-note">Flechas A → B: A pasa a B. Grosor = nº de pases. Tamaño del nodo = conexiones. «En el campo» sitúa cada jugador en su zona media de toques (el rival siempre se ve invertido). Toca un jugador para resaltarlo.</p>
      </Card>
      {net.edges.length > 0 && <>
        <div className="sc-kpis small"><Kpi label="Pases completados" value={net.totalPasses} prov="calc" /><Kpi label="Pases fallidos" value={net.failedTotal} prov="calc" /><Kpi label="Precisión" value={fmtPct(attempts ? net.totalPasses / attempts : null)} prov="calc" /><Kpi label="Conexiones" value={net.edges.length} /></div>
        {node && <Card title={node.nick} right={<button className="sc-link" onClick={() => setSelNode(null)}>Quitar</button>}>
          <div className="sc-kpis small"><Kpi label="Pases dados" value={node.out} /><Kpi label="Pases recibidos" value={node.inn} /><Kpi label="Fallidos" value={node.failed} /><Kpi label="Compañeros" value={node.partners} /></div>
          <div className="sc-grid2"><div><h4>Pasa a</h4>{outs.length ? <HBars data={outs.map((e) => ({ label: nm(e.b), value: e.n }))} /> : <Empty small>—</Empty>}</div><div><h4>Recibe de</h4>{ins.length ? <HBars data={ins.map((e) => ({ label: nm(e.a), value: e.n }))} /> : <Empty small>—</Empty>}</div></div></Card>}
        <Card title="Jugadores más conectados" right={<span className="sc-sub">pases dados + recibidos</span>}><HBars data={net.nodes.slice().sort((a, b) => b.conn - a.conn).slice(0, 8).map((n) => ({ label: n.nick, value: n.conn, detail: n.out + ' dados · ' + n.inn + ' recibidos' }))} onSelect={(d) => setSelNode((net.nodes.find((n) => n.nick === d.label) || {}).id || null)} /></Card>
        <Card title="Conexiones más frecuentes"><div className="sc-scrollx"><table className="sc-table"><thead><tr><th>Pasador</th><th></th><th>Receptor</th><th>Pases</th><th>Inverso</th></tr></thead><tbody>{net.rel.slice(0, 10).map((e, i) => <tr key={i}><td>{nm(e.a)}</td><td>→</td><td>{nm(e.b)}</td><td><b>{e.n}</b></td><td>{e.mutual}</td></tr>)}</tbody></table></div></Card>
        <Card title="Pases completados y fallidos por jugador"><div className="sc-scrollx"><table className="sc-table"><thead><tr><th>Jugador</th><th>Comp.</th><th>Fall.</th><th>Prec.</th><th>Recib.</th></tr></thead><tbody>{net.nodes.slice().sort((a, b) => b.out - a.out).map((n) => <tr key={n.id}><td>{n.nick}</td><td>{n.out}</td><td>{n.failed}</td><td>{fmtPct(n.out + n.failed ? n.out / (n.out + n.failed) : null)}</td><td>{n.inn}</td></tr>)}</tbody></table></div></Card>
        <Card title="Rutas de circulación" right={<span className="sc-sub">A → B → C</span>}>{chains.length ? <ul className="sc-list">{chains.slice(0, 6).map((c, i) => <li key={i}><div className="mid"><b>{c.path.join(' → ')}</b></div><span className="big">{c.n}×</span></li>)}</ul> : <Empty small>No hay cadenas de tres jugadores seguidos.</Empty>}<p className="sc-note">Secuencias de tres toques consecutivos de jugadores distintos del mismo equipo.</p></Card>
        <Card title="Relaciones ofensivas" right={<span className="sc-sub">asistente → goleador</span>}>{links.length ? <ul className="sc-list">{links.slice(0, 8).map((l, i) => <li key={i}><div className="mid"><b>{l.an} → {l.bn}</b></div><span className="big">{l.n} {l.n === 1 ? 'gol' : 'goles'}</span></li>)}</ul> : <Empty small>Aún no hay goles con asistencia.</Empty>}</Card>
        <Card title="Matriz de pases"><PassMatrix nodes={net.nodes} edges={net.edges} /><p className="sc-note">Filas = quién pasa, columnas = quién recibe. Más intenso = más pases.</p></Card>
      </>}
    </div>
  );
}
