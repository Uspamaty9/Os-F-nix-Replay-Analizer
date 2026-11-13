// Gráficos SVG propios (sin dependencias). Interactivos: tooltip al pasar/tocar, selección de elementos.
import React, { useRef, useState } from 'react';

export const PALETTE = ['var(--sc-acc)', 'var(--sc-red2)', '#3FA7D6', '#59B96B', '#B77CD9', '#E0A030', '#E06C9F', '#7F8C9A'];
const col = (i) => PALETTE[i % PALETTE.length];

function Tip({ tip }) {
  if (!tip) return null;
  return <div className="sc-tip" style={{ left: tip.x + '%', top: tip.y + '%', transform: tip.x > 60 ? 'translate(-105%,-110%)' : 'translate(8px,-110%)' }}>{tip.lines.map((l, i) => <div key={i} className={i === 0 ? 'h' : ''}>{l}</div>)}</div>;
}

// ---------- Líneas / áreas ----------
export function LineChart({ labels, series, height = 190, yMin, yMax, fmt = (v) => v, ariaLabel }) {
  const [hov, setHov] = useState(null);
  const ref = useRef(null);
  const W = 360, H = height, L = 34, R = 10, T = 12, B = 24;
  const n = labels.length;
  const all = series.flatMap((s) => s.data).filter((v) => v != null);
  if (!n || !all.length) return <div className="sc-empty small">Sin datos para graficar.</div>;
  let lo = yMin != null ? yMin : Math.min.apply(null, all), hi = yMax != null ? yMax : Math.max.apply(null, all);
  if (lo === hi) { hi = lo + 1; }
  if (yMin == null && lo > 0) lo = 0;
  const X = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  const step = Math.max(1, Math.ceil(n / 6));
  function move(e) {
    const r = ref.current.getBoundingClientRect(); const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(((cx / r.width) * W - L) / ((W - L - R) / Math.max(1, n - 1)))));
    setHov(i);
  }
  const tip = hov != null ? { x: (X(hov) / W) * 100, y: 18, lines: [labels[hov]].concat(series.map((s) => s.name + ': ' + (s.data[hov] == null ? '—' : fmt(s.data[hov])))) } : null;
  return (
    <div className="sc-chart" ref={ref} onPointerMove={move} onPointerDown={move} onPointerLeave={() => setHov(null)} role="img" aria-label={ariaLabel || 'Gráfico de líneas'}>
      <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ width: '100%', height }}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - R} y1={Y(t)} y2={Y(t)} className="grid" /><text x={L - 5} y={Y(t) + 3} className="ax" textAnchor="end">{fmt(Math.round(t * 10) / 10)}</text></g>)}
        {labels.map((l, i) => (i % step === 0 || i === n - 1) && <text key={i} x={X(i)} y={H - 7} className="ax" textAnchor="middle">{l}</text>)}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => (v == null ? null : [X(i), Y(v)]));
          const segs = []; let cur = []; pts.forEach((p) => { if (p) cur.push(p); else { if (cur.length) segs.push(cur); cur = []; } }); if (cur.length) segs.push(cur);
          const c = s.color || col(si);
          return <g key={si}>
            {s.area && segs.map((sg, k) => <path key={'a' + k} d={'M' + sg[0][0] + ',' + Y(lo) + ' L' + sg.map((p) => p.join(',')).join(' L') + ' L' + sg[sg.length - 1][0] + ',' + Y(lo) + 'Z'} fill={c} opacity=".12" />)}
            {segs.map((sg, k) => <polyline key={k} points={sg.map((p) => p.join(',')).join(' ')} fill="none" stroke={c} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
            {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hov === i ? 4.2 : 2.6} fill={c} stroke="var(--sc-card)" strokeWidth="1" />)}
          </g>;
        })}
        {hov != null && <line x1={X(hov)} x2={X(hov)} y1={T} y2={H - B} className="guide" />}
      </svg>
      <Tip tip={tip} />
      {series.length > 1 && <div className="sc-legend">{series.map((s, i) => <span key={i}><i style={{ background: s.color || col(i) }} />{s.name}</span>)}</div>}
    </div>
  );
}

// ---------- Barras horizontales (clicables) ----------
export function HBars({ data, fmt = (v) => v, max, onSelect, empty = 'Sin datos.' }) {
  if (!data.length) return <div className="sc-empty small">{empty}</div>;
  const m = max != null ? max : Math.max.apply(null, data.map((d) => d.value).concat([1e-9]));
  return (
    <div className="sc-hbars">
      {data.map((d, i) => (
        <div key={i} className={'row' + (onSelect ? ' click' : '')} onClick={onSelect ? () => onSelect(d) : undefined} role={onSelect ? 'button' : undefined} title={d.detail || ''}>
          <span className="lb">{d.label}</span>
          <span className="tr"><i style={{ width: Math.max(2, (d.value / m) * 100) + '%', background: d.color || col(i) }} /></span>
          <b>{fmt(d.value)}</b>
        </div>
      ))}
    </div>
  );
}

// ---------- Barras verticales por partido ----------
export function VBars({ labels, series, height = 150, fmt = (v) => v }) {
  const [hov, setHov] = useState(null);
  const n = labels.length; if (!n) return <div className="sc-empty small">Sin datos.</div>;
  const W = 360, H = height, L = 24, B = 22, T = 8; const mx = Math.max(1, Math.max.apply(null, series.flatMap((s) => s.data)));
  const gw = (W - L - 6) / n, bw = Math.min(22, (gw * 0.8) / series.length);
  const step = Math.max(1, Math.ceil(n / 8));
  const tip = hov != null ? { x: ((L + gw * hov + gw / 2) / W) * 100, y: 20, lines: [labels[hov]].concat(series.map((s) => s.name + ': ' + fmt(s.data[hov]))) } : null;
  return (
    <div className="sc-chart" onPointerLeave={() => setHov(null)}>
      <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <line x1={L} x2={W - 4} y1={H - B} y2={H - B} className="grid" />
        {labels.map((l, i) => {
          const x0 = L + gw * i + (gw - bw * series.length) / 2;
          return <g key={i} onPointerEnter={() => setHov(i)} onPointerDown={() => setHov(i)}>
            <rect x={L + gw * i} y={T} width={gw} height={H - B - T} fill="transparent" />
            {series.map((s, si) => { const h = (s.data[i] / mx) * (H - B - T); return <rect key={si} x={x0 + si * bw} y={H - B - h} width={bw - 1} height={Math.max(0, h)} rx="2" fill={s.color || col(si)} opacity={hov == null || hov === i ? 1 : 0.45} />; })}
            {(i % step === 0) && <text x={L + gw * i + gw / 2} y={H - 7} className="ax" textAnchor="middle">{l}</text>}
          </g>;
        })}
        <text x={L - 4} y={T + 6} className="ax" textAnchor="end">{mx}</text>
      </svg>
      <Tip tip={tip} />
      {series.length > 1 && <div className="sc-legend">{series.map((s, i) => <span key={i}><i style={{ background: s.color || col(i) }} />{s.name}</span>)}</div>}
    </div>
  );
}

// ---------- Barra apilada (V/E/D, posesión...) ----------
export function StackBar({ parts, height = 14 }) {
  const t = parts.reduce((s, p) => s + p.value, 0);
  if (!t) return <div className="sc-empty small">Sin datos.</div>;
  return <div className="sc-stack" style={{ height }} role="img" aria-label={parts.map((p) => p.label + ' ' + p.value).join(', ')}>{parts.map((p, i) => p.value > 0 && <i key={i} title={p.label + ': ' + p.value} style={{ width: (p.value / t) * 100 + '%', background: p.color || col(i) }} />)}</div>;
}

// ---------- Anillo ----------
export function Donut({ parts, size = 120, center }) {
  const t = parts.reduce((s, p) => s + p.value, 0); const r = 44, c = 2 * Math.PI * r; let off = 0;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={parts.map((p) => p.label + ' ' + p.value).join(', ')}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--sc-line)" strokeWidth="14" />
      {t > 0 && parts.map((p, i) => { const len = (p.value / t) * c; const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={p.color || col(i)} strokeWidth="14" strokeDasharray={len + ' ' + (c - len)} strokeDashoffset={-off} transform="rotate(-90 60 60)"><title>{p.label + ': ' + p.value}</title></circle>; off += len; return el; })}
      {center && <><text x="60" y="58" textAnchor="middle" className="dn-big">{center.big}</text><text x="60" y="74" textAnchor="middle" className="dn-sm">{center.small}</text></>}
    </svg>
  );
}

// ---------- Radar ----------
export function Radar({ axes, series, max = 10, size = 260 }) {
  const cx = 130, cy = 130, R = 88, n = axes.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * R * (v / max), cy + Math.sin(a) * R * (v / max)]; };
  return (
    <svg viewBox="0 0 260 260" width="100%" style={{ maxWidth: size }} role="img" aria-label="Gráfico radar">
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={axes.map((_, i) => pt(i, max * k).join(',')).join(' ')} className="grid" fill="none" />)}
      {axes.map((a, i) => { const [x, y] = pt(i, max); const [lx, ly] = pt(i, max * 1.2); return <g key={a.id}><line x1={cx} y1={cy} x2={x} y2={y} className="grid" /><text x={lx} y={ly + 3} textAnchor={lx < cx - 6 ? 'end' : lx > cx + 6 ? 'start' : 'middle'} className="ax">{a.label}</text></g>; })}
      {series.map((s, si) => {
        const c = s.color || col(si); const pts = axes.map((a, i) => pt(i, s.values[a.id] == null ? 0 : s.values[a.id]));
        return <g key={si}><polygon points={pts.map((p) => p.join(',')).join(' ')} fill={c} fillOpacity=".18" stroke={c} strokeWidth="2" strokeLinejoin="round">{s.name && <title>{s.name}</title>}</polygon>{pts.map((p, i) => s.values[axes[i].id] != null && <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={c}><title>{axes[i].label + ': ' + (Math.round(s.values[axes[i].id] * 10) / 10)}</title></circle>)}</g>;
      })}
    </svg>
  );
}

// ---------- Red de pases ----------
// layout: 'campo' (posición media de toques) | 'circulo'
export function NetworkGraph({ nodes, edges, layout = 'campo', selected, onSelect, minEdge = 1, height = 300 }) {
  const W = 360, H = height, P = 34;
  if (!nodes.length) return <div className="sc-empty small">Sin jugadores.</div>;
  const pos = {};
  if (layout === 'campo') {
    const mean = nodes.map((n) => ({ id: n.id, x: n.kicks ? n.sx / n.kicks : 0, y: n.kicks ? n.sy / n.kicks : 0 }));
    const xs = mean.map((m) => m.x), ys = mean.map((m) => m.y);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    mean.forEach((m) => { pos[m.id] = [P + (x1 === x0 ? 0.5 : (m.x - x0) / (x1 - x0)) * (W - 2 * P), P + (y1 === y0 ? 0.5 : (m.y - y0) / (y1 - y0)) * (H - 2 * P)]; });
    // evita solapamientos: separa nodos muy juntos
    const ids = Object.keys(pos);
    for (let it = 0; it < 30; it++) for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = pos[ids[i]], b = pos[ids[j]]; const dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 0.01; if (d < 44) { const f = (44 - d) / 2; a[0] -= (dx / d) * f; a[1] -= (dy / d) * f; b[0] += (dx / d) * f; b[1] += (dy / d) * f; } }
    ids.forEach((id) => { pos[id][0] = Math.max(18, Math.min(W - 18, pos[id][0])); pos[id][1] = Math.max(18, Math.min(H - 18, pos[id][1])); });
  } else {
    nodes.forEach((n, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / nodes.length; pos[n.id] = [W / 2 + Math.cos(a) * (W / 2 - P - 6), H / 2 + Math.sin(a) * (H / 2 - P)]; });
  }
  const mx = Math.max.apply(null, edges.map((e) => e.n).concat([1])), mk = Math.max.apply(null, nodes.map((n) => n.conn).concat([1]));
  const vis = edges.filter((e) => e.n >= minEdge && pos[e.a] && pos[e.b]);
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} width="100%" className="sc-net" role="img" aria-label="Red de pases entre jugadores">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="var(--sc-acc)" /></marker></defs>
      {layout === 'campo' && <g className="pitch"><rect x="4" y="4" width={W - 8} height={H - 8} rx="8" /><line x1={W / 2} y1="4" x2={W / 2} y2={H - 4} /><circle cx={W / 2} cy={H / 2} r="32" /></g>}
      {vis.map((e, i) => {
        const a = pos[e.a], b = pos[e.b]; const dx = b[0] - a[0], dy = b[1] - a[1]; const d = Math.hypot(dx, dy) || 1; const ux = dx / d, uy = dy / d;
        const ra = 12 + (nodes.find((n) => n.id === e.a).conn / mk) * 8, rb = 12 + (nodes.find((n) => n.id === e.b).conn / mk) * 8;
        const nx = -uy * 3, ny = ux * 3; // desplaza para distinguir A→B de B→A
        const x1 = a[0] + ux * ra + nx, y1 = a[1] + uy * ra + ny, x2 = b[0] - ux * (rb + 4) + nx, y2 = b[1] - uy * (rb + 4) + ny;
        const on = !selected || selected === e.a || selected === e.b;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--sc-acc)" strokeWidth={0.8 + (e.n / mx) * 5} opacity={on ? 0.35 + 0.55 * (e.n / mx) : 0.08} markerEnd="url(#arr)"><title>{(nodes.find((n) => n.id === e.a) || {}).nick + ' → ' + (nodes.find((n) => n.id === e.b) || {}).nick + ': ' + e.n + ' pases'}</title></line>;
      })}
      {nodes.map((n) => {
        const p = pos[n.id]; const r = 12 + (n.conn / mk) * 8; const on = !selected || selected === n.id;
        return <g key={n.id} onClick={() => onSelect && onSelect(selected === n.id ? null : n.id)} style={{ cursor: 'pointer' }} opacity={on ? 1 : 0.4}>
          <circle cx={p[0]} cy={p[1]} r={r} fill={n.team === 'R' ? 'var(--sc-red2)' : '#3A78B5'} stroke={selected === n.id ? 'var(--sc-acc)' : 'var(--sc-card)'} strokeWidth="2.5"><title>{n.nick + ' · ' + n.conn + ' conexiones'}</title></circle>
          <text x={p[0]} y={p[1] + r + 11} textAnchor="middle" className="nl">{n.nick.length > 11 ? n.nick.slice(0, 10) + '…' : n.nick}</text>
          <text x={p[0]} y={p[1] + 4} textAnchor="middle" className="nn">{n.out + n.inn}</text>
        </g>;
      })}
    </svg>
  );
}

// ---------- Matriz de pases (quién → a quién) ----------
export function PassMatrix({ nodes, edges }) {
  if (!nodes.length) return null;
  const list = nodes.slice().sort((a, b) => b.conn - a.conn).slice(0, 10);
  const get = (a, b) => (edges.find((e) => e.a === a && e.b === b) || { n: 0 }).n;
  const mx = Math.max.apply(null, edges.map((e) => e.n).concat([1]));
  return (
    <div className="sc-scrollx"><table className="sc-matrix"><thead><tr><th>De ↓ a →</th>{list.map((n) => <th key={n.id}>{n.nick}</th>)}</tr></thead>
      <tbody>{list.map((a) => <tr key={a.id}><th>{a.nick}</th>{list.map((b) => { const v = a.id === b.id ? null : get(a.id, b.id); return <td key={b.id} style={v ? { background: 'color-mix(in srgb, var(--sc-acc) ' + Math.round(15 + (v / mx) * 70) + '%, transparent)' } : undefined}>{v == null ? '·' : v || ''}</td>; })}</tr>)}</tbody></table></div>
  );
}

export function Sparkline({ data, width = 80, height = 24, color = 'var(--sc-acc)' }) {
  const v = data.filter((x) => x != null); if (v.length < 2) return null;
  const lo = Math.min.apply(null, v), hi = Math.max.apply(null, v) || 1; const X = (i) => (i * (width - 4)) / (data.length - 1) + 2, Y = (x) => height - 3 - ((x - lo) / (hi - lo || 1)) * (height - 6);
  return <svg width={width} height={height} aria-hidden="true"><polyline fill="none" stroke={color} strokeWidth="2" points={data.map((x, i) => (x == null ? null : X(i) + ',' + Y(x))).filter(Boolean).join(' ')} /></svg>;
}
