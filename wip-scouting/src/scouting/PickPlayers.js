// Elegir qué jugadores se analizan y borrar jugadores (con «Deshacer»). Separado de Players.js.
import React, { useEffect, useMemo, useState } from 'react';
import * as db from './db';
import { Empty, Avatar, Seg, Select, Sheet, useConfirm, toast } from './ui';
import { normNick } from './ingest';
import { teamName } from './model';

// Borrar jugadores: quita del análisis y de las listas. Sin partidos guardados se elimina del todo; con partidos se conservan los partidos,
// pero el perfil (foto, notas, equipo, calificaciones) se borra y queda oculto (restaurable desde «Elegir» > «Borrados»). Devuelve los ids borrados o null.
export async function wipePlayers(model, list, confirm) {
  if (!list.length) return null;
  const ids = new Set(list.map((p) => p.id));
  const ok = await confirm(list.length === 1 ? '¿Borrar a «' + list[0].nick + '»? Se eliminan su foto, notas y calificaciones y deja de contar en el análisis. Sus partidos se conservan.' : '¿Borrar a ' + list.length + ' jugadores? Se eliminan sus fotos, notas y calificaciones y dejan de contar en el análisis. Los partidos se conservan.', 'Borrar');
  if (!ok) return null;
  const oldRatings = model.ratings.filter((r) => ids.has(r.playerId)); const oldPlayers = list.map((p) => ({ ...p }));
  await db.delMany('ratings', oldRatings.map((r) => r.id));
  await db.delMany('players', list.filter((p) => !model.seenCount.get(p.id)).map((p) => p.id));
  await db.putMany('players', list.filter((p) => model.seenCount.get(p.id)).map((p) => ({ ...p, hidden: true, ignored: true, avatar: null, notes: '', position: '', teamId: null, updatedAt: Date.now() })));
  toast(list.length === 1 ? 'Jugador borrado' : list.length + ' jugadores borrados', { label: 'Deshacer', fn: async () => { await db.putMany('players', oldPlayers); await db.putMany('ratings', oldRatings); toast('Restaurado'); } });
  return ids;
}

// Elegir qué jugadores se analizan: los no marcados siguen reconocidos pero no cuentan ni aparecen en ninguna lista.
export function PickPlayers({ model, onClose, onCreate }) {
  const [q, setQ] = useState(''); const [hideNew, setHideNew] = useState(true); const [teamId, setTeamId] = useState(''); const [showDel, setShowDel] = useState(false);
  const [confirm, confirmEl] = useConfirm();
  const nDel = model.allPlayers.filter((p) => p.hidden).length;
  const [sel, setSel] = useState(() => new Set(model.allPlayers.filter((p) => !p.ignored).map((p) => p.id)));
  useEffect(() => { db.getKv('hideNewPlayers', true).then(setHideNew); }, []);
  const rows = useMemo(() => model.allPlayers.filter((p) => !!p.hidden === showDel).filter((p) => !q || normNick(p.nick).includes(normNick(q))).slice().sort((a, b) => ((model.seenCount.get(b.id) || 0) - (model.seenCount.get(a.id) || 0)) || a.nick.localeCompare(b.nick)), [model, q, showDel]);
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setMany = (list, on) => setSel((s) => { const n = new Set(s); list.forEach((p) => (on ? n.add(p.id) : n.delete(p.id))); return n; });
  // Borrar: quita al jugador de las listas y de todas las cifras. Sin partidos guardados se elimina del todo; con partidos se conservan
  // los partidos, pero el perfil (foto, notas, equipo, calificaciones) se borra y queda oculto. Se puede restaurar desde «Borrados».
  async function wipe(list) {
    const ids = await wipePlayers(model, list, confirm); if (!ids) return;
    setSel((s0) => { const n = new Set(s0); ids.forEach((i) => n.delete(i)); return n; });
  }
  async function restore(list) { await db.putMany('players', list.map((p) => ({ ...p, hidden: false, updatedAt: Date.now() }))); toast('Jugadores restaurados (sin elegir)'); }
  async function save() {
    const changed = model.allPlayers.filter((p) => !p.hidden && !!p.ignored !== !sel.has(p.id)).map((p) => ({ ...p, ignored: !sel.has(p.id), updatedAt: Date.now() }));
    await db.setKv('hideNewPlayers', hideNew); await db.putMany('players', changed); toast(sel.size + ' jugadores se analizan'); onClose();
  }
  return (
    <>
    <Sheet title="Elegir jugadores a analizar" onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={save}>Guardar ({sel.size})</button></>}>
      <div className="sc-form">
        <p className="sc-note">Solo los jugadores marcados cuentan en goles, asistencias, rankings, red de pases e informes. Los demás no se pierden: puedes marcarlos cuando quieras.</p>
        {onCreate && <button className="sc-btn small ghost" onClick={onCreate}>+ Crear jugador desde cero</button>}
        <input className="sc-search" placeholder="Buscar por nickname…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(nDel > 0 || showDel) && <Seg value={showDel ? 'del' : 'act'} onChange={(v) => setShowDel(v === 'del')} options={[['act', 'Jugadores'], ['del', 'Borrados (' + nDel + ')']]} />}
        {!showDel ? <div className="sc-row wrap"><button className="sc-btn small ghost" onClick={() => setMany(rows, true)}>Marcar todos{q ? ' los de la búsqueda' : ''}</button><button className="sc-btn small ghost" onClick={() => setMany(rows, false)}>Quitar todos{q ? ' los de la búsqueda' : ''}</button><button className="sc-btn small danger" disabled={!rows.some((p) => !sel.has(p.id))} onClick={() => wipe(rows.filter((p) => !sel.has(p.id)))}>Borrar los no marcados</button></div>
          : <div className="sc-row wrap"><button className="sc-btn small" disabled={!rows.length} onClick={() => restore(rows)}>Restaurar todos</button></div>}
        {model.teams.length > 0 && <Select label="Marcar solo los de un equipo" value={teamId} onChange={(v) => { setTeamId(v); if (v) setSel(new Set(model.allPlayers.filter((p) => p.teamId === v).map((p) => p.id))); }} placeholder="Elegir equipo…" options={model.teams.map((t) => [t.id, t.name])} />}
        <label className="sc-row"><input type="checkbox" checked={hideNew} onChange={(e) => setHideNew(e.target.checked)} /><span>Los jugadores nuevos que aparezcan en repeticiones quedan sin elegir hasta que los marque</span></label>
        <ul className="sc-list">{rows.map((p) => { const on = sel.has(p.id); return (
          <li key={p.id} className={on ? 'sel' : ''} onClick={() => (showDel ? restore([p]) : toggle(p.id))}>{!showDel && <span className={'sc-check' + (on ? ' on' : '')}>{on ? '✓' : ''}</span>}<Avatar player={p} size={32} /><div className="mid"><b>{p.nick}</b><small>{showDel ? 'Toca para restaurar' : teamName(model, p.teamId, 'Sin equipo') + ' · ' + (model.seenCount.get(p.id) || 0) + ' partidos'}</small></div>{!showDel && <button className="sc-btn small ghost sc-del" aria-label={'Borrar a ' + p.nick} onClick={(e) => { e.stopPropagation(); wipe([p]); }}>Borrar</button>}</li>); })}</ul>
        {!rows.length && showDel && <p className="sc-note">No hay jugadores borrados.</p>}
      </div>
    </Sheet>
    {confirmEl}
    </>
  );
}


