import React, { useState } from 'react';
import { Sheet } from './ui';
import { fmtDate, fmtDur } from './model';

// Hoja para unir varias repeticiones en un solo partido: orden, bandos cambiados y nombre.
export default function MergeSheet({ items, onClose, onDone }) {
  const [list, setList] = useState(() => items.slice().sort((a, b) => a.date - b.date));
  const [swaps, setSwaps] = useState(() => list.map(() => false));
  const [name, setName] = useState('');
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const l = list.slice(), s = swaps.slice(); [l[i], l[j]] = [l[j], l[i]]; [s[i], s[j]] = [s[j], s[i]]; setList(l); setSwaps(s); };
  const score = list.reduce((a, m) => [a[0] + (swaps[list.indexOf(m)] ? m.score[1] : m.score[0]), a[1] + (swaps[list.indexOf(m)] ? m.score[0] : m.score[1])], [0, 0]);
  return (
    <Sheet title="Unir en un solo partido" onClose={onClose} foot={<><button className="sc-btn ghost" onClick={onClose}>Cancelar</button><button className="sc-btn" onClick={() => onDone(list.map((m) => m.rec), swaps, name.trim())}>Unir {list.length} repeticiones</button></>}>
      <p className="sc-note">Se verán seguidas, en este orden, y sus estadísticas se sumarán como un solo partido. Las repeticiones originales quedarán excluidas para no contar dos veces; puedes deshacerlo cuando quieras.</p>
      <ul className="sc-list">{list.map((m, i) => (
        <li key={m.id} style={{ cursor: 'default' }}>
          <div className="sc-score"><i className="r" />{swaps[i] ? m.score[1] : m.score[0]}<em>–</em>{swaps[i] ? m.score[0] : m.score[1]}<i className="b" /></div>
          <div className="mid"><b>{i + 1}. {m.rec.name}</b><small>{fmtDate(m.date)} · {fmtDur(m.ticks)}</small>
            {i > 0 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 12 }}><input type="checkbox" checked={swaps[i]} onChange={(e) => setSwaps(swaps.map((v, k) => (k === i ? e.target.checked : v)))} /> Los bandos están cambiados (rojo ↔ azul)</label>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button className="sc-btn small ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">▲</button>
            <button className="sc-btn small ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">▼</button>
          </div>
        </li>))}</ul>
      <p className="sc-note"><b>Marcador unido: {score[0]} – {score[1]}</b></p>
      <input className="sc-search" placeholder="Nombre del partido (opcional)" value={name} onChange={(e) => setName(e.target.value)} />
    </Sheet>
  );
}
