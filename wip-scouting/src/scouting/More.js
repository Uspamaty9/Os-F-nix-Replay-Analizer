// Menú «Más»: secciones secundarias (Pases, Informes), papelera y copia de seguridad.
import React, { useState } from 'react';
import * as db from './db';
import { Card, Empty, Sheet, Avatar, useConfirm, toast, saveFile, askExport, textBytes, pickFile, stamp } from './ui';
import { fmtDate, teamName } from './model';

const ICON = (d) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;

export default function More({ model, nav }) {
  const trashN = model.trash.length + model.allPlayers.filter((p) => p.hidden).length;
  return (
    <div className="sc-view">
      <Card>
        <div className="sc-menu">
          <button onClick={() => nav('network')}>{ICON('M5 6a2 2 0 100-4 2 2 0 000 4zM19 6a2 2 0 100-4 2 2 0 000 4zM12 22a2 2 0 100-4 2 2 0 000 4zM6.5 5.5l4.5 12M17.5 5.5L13 17.5M7 4h10')}<span>Red de pases<small>Quién pasa a quién, rutas y conexiones</small></span><span className="chev">›</span></button>
          <button onClick={() => nav('reports')}>{ICON('M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8')}<span>Informes en PDF<small>Equipo, jugador y partido · cómo se calcula cada dato</small></span><span className="chev">›</span></button>
          <button onClick={() => nav('trash')}>{ICON('M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15')}<span>Papelera{trashN ? ' (' + trashN + ')' : ''}<small>Restaura partidos, equipos y jugadores borrados</small></span><span className="chev">›</span></button>
          <button onClick={() => nav('backup')}>{ICON('M12 3v12M7 10l5 5 5-5M4 21h16')}<span>Copia de seguridad<small>Guardar o restaurar todos los datos del Centro de análisis</small></span><span className="chev">›</span></button>
        </div>
      </Card>
    </div>
  );
}

export function Trash({ model }) {
  const [confirm, confirmEl] = useConfirm();
  const hidden = model.allPlayers.filter((p) => p.hidden);
  const items = model.trash.slice().sort((a, b) => b.at - a.at);
  const label = { match: 'Partido', team: 'Equipo' };
  async function restore(e) { await db.restoreTrash(e); toast('Restaurado'); }
  async function purge(e) { if (await confirm('¿Eliminar «' + e.name + '» para siempre? Ya no se podrá restaurar.', 'Eliminar')) await db.del('trash', e.id); }
  async function empty() { if (await confirm('¿Vaciar la papelera? Todo lo que contiene (partidos, equipos y jugadores) se eliminará para siempre.', 'Vaciar todo')) { await db.delMany('trash', items.map((e) => e.id)); await db.delMany('players', hidden.map((p) => p.id)); toast('Papelera vaciada'); } }
  // Un jugador borrado se elimina del todo. Si vuelve a salir en una repetición nueva, se creará de nuevo (como «sin elegir»).
  async function purgePlayer(p) { if (await confirm('¿Eliminar a «' + p.nick + '» para siempre? Ya no se podrá restaurar. Si aparece en una repetición nueva, volverá a crearse sin elegir.', 'Eliminar')) { await db.del('players', p.id); toast('Jugador eliminado'); } }
  return (
    <div className="sc-view">
      <Card title="Papelera" right={(items.length > 0 || hidden.length > 0) && <button className="sc-btn small ghost danger" onClick={empty}>Vaciar todo</button>}>
        {!items.length && !hidden.length ? <Empty>La papelera está vacía. Lo que borres de Partidos, Equipos o Jugadores aparece aquí para poder restaurarlo.</Empty> : (
          <ul className="sc-list">
            {items.map((e) => <li key={e.id} style={{ cursor: 'default' }}><div className="mid"><b>{e.name}</b><small>{label[e.kind] || e.kind} · borrado {fmtDate(e.at)}</small></div><button className="sc-btn small" onClick={() => restore(e)}>Restaurar</button><button className="sc-btn small ghost danger" onClick={() => purge(e)}>✕</button></li>)}
            {hidden.map((p) => <li key={p.id} style={{ cursor: 'default' }}><Avatar player={p} size={30} /><div className="mid"><b>{p.nick}</b><small>Jugador · se conserva su historial de partidos</small></div><button className="sc-btn small" onClick={async () => { await db.put('players', { ...p, hidden: false, updatedAt: Date.now() }); toast('Jugador restaurado (sin elegir: actívalo en «Elegir»)'); }}>Restaurar</button><button className="sc-btn small ghost danger" aria-label="Eliminar para siempre" onClick={() => purgePlayer(p)}>✕</button></li>)}
          </ul>)}
        <p className="sc-note">La papelera guarda los últimos 40 partidos y equipos borrados. Con ✕ eliminas uno para siempre; «Vaciar todo» elimina todo.</p>
      </Card>
      {confirmEl}
    </div>
  );
}

export function Backup() {
  async function backup() { if (!(await askExport('¿Crear la copia de seguridad? Se descargará un archivo con todos los datos del Centro de análisis.', 'Sí, crear copia'))) return; try { await saveFile('OsFenix-scouting-' + stamp() + '.fenixscout', 'application/octet-stream', textBytes(await db.exportScouting())); } catch (e) { toast('No se pudo crear la copia'); } }
  async function restore() { const f = await pickFile('.fenixscout,.json,application/json'); if (!f) return; try { const n = await db.importScouting(await f.text()); toast(n + ' registros restaurados'); } catch (e) { toast('Archivo no válido'); } }
  return (
    <div className="sc-view">
      <Card title="Copia de seguridad">
        <p className="sc-note">Guarda equipos, jugadores (con fotos), partidos analizados, calificaciones, competiciones y papelera. Los datos ya se guardan solos en este dispositivo; la copia sirve para pasarlos a otro dispositivo, a la app nueva o protegerlos. Restaurar no borra nada: solo añade o actualiza.</p>
        <div className="sc-row wrap"><button className="sc-btn" onClick={backup}>Crear copia</button><button className="sc-btn ghost" onClick={restore}>Restaurar copia</button></div>
      </Card>
    </div>
  );
}

// Búsqueda global: jugadores, equipos y partidos.
export function SearchSheet({ model, nav, onClose }) {
  const [q, setQ] = useState(''); const k = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = k(q).trim();
  const pl = n ? model.players.filter((p) => k(p.nick).includes(n)).slice(0, 8) : [];
  const tm = n ? model.teams.filter((t) => k(t.name).includes(n)).slice(0, 6) : [];
  const ms = n ? model.matches.concat(model.excluded).filter((m) => k(m.rec.name + ' ' + teamName(model, m.redTeamId, '') + ' ' + teamName(model, m.blueTeamId, '')).includes(n)).slice(0, 8) : [];
  const go = (t, p) => { onClose(); nav(t, p); };
  return (
    <Sheet title="Buscar" onClose={onClose}>
      <input className="sc-search" autoFocus placeholder="Jugador, equipo o partido…" value={q} onChange={(e) => setQ(e.target.value)} />
      {n && !pl.length && !tm.length && !ms.length && <Empty small>Sin resultados.</Empty>}
      {pl.length > 0 && <><h4>Jugadores</h4><ul className="sc-list">{pl.map((p) => <li key={p.id} onClick={() => go('players', { playerId: p.id })}><Avatar player={p} size={30} /><div className="mid"><b>{p.nick}</b><small>{teamName(model, p.teamId, 'Sin equipo')}</small></div></li>)}</ul></>}
      {tm.length > 0 && <><h4>Equipos</h4><ul className="sc-list">{tm.map((t) => <li key={t.id} onClick={() => go('teams', {})}><span className="sc-swatch" style={{ background: t.color || 'var(--sc-acc)', height: 26 }} /><div className="mid"><b>{t.name}</b></div></li>)}</ul></>}
      {ms.length > 0 && <><h4>Partidos</h4><ul className="sc-list">{ms.map((m) => <li key={m.id} onClick={() => go('matches', { matchId: m.id })}><div className="sc-score"><i className="r" />{m.score[0]}<em>–</em>{m.score[1]}<i className="b" /></div><div className="mid"><b>{teamName(model, m.redTeamId, 'Rojo')} vs {teamName(model, m.blueTeamId, 'Azul')}</b><small>{m.rec.name} · {fmtDate(m.date)}</small></div></li>)}</ul></>}
    </Sheet>
  );
}
