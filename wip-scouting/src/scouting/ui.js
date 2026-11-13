// Componentes y utilidades de interfaz compartidos por todas las pantallas del módulo.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as db from './db';
import { buildModel } from './model';
import { PROV_LABEL } from './analysis';
import { sendBytes } from '../extras';

// ---------- Datos ----------
export function useModel() {
  const [store, setStore] = useState(null); const timer = useRef(null);
  const reload = useCallback(async () => { try { setStore(await db.loadAll()); } catch (e) { setStore({ error: String(e && e.message || e), teams: [], players: [], seasons: [], competitions: [], fixtures: [], matches: [], ratings: [] }); } }, []);
  useEffect(() => {
    reload(); const h = () => { clearTimeout(timer.current); timer.current = setTimeout(reload, 40); };
    window.addEventListener(db.CHANGED, h); return () => { window.removeEventListener(db.CHANGED, h); clearTimeout(timer.current); };
  }, [reload]);
  const model = useMemo(() => (store ? buildModel(store) : null), [store]);
  return { model, error: store && store.error, reload };
}

export function useLocal(key, init) {
  const [v, setV] = useState(() => { try { const r = localStorage.getItem(key); return r ? Object.assign({}, init, JSON.parse(r)) : init; } catch (e) { return init; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }, [key, v]);
  return [v, setV];
}

// ---------- Archivos ----------
export function bytesToB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
export async function saveFile(name, mime, bytes) { await sendBytes(name, mime, bytesToB64(bytes), 'downloads', false); }
export function textBytes(str) { return new TextEncoder().encode(str); }
export function stamp() { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
export function slug(s) { return String(s || 'informe').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'informe'; }
export function pickFile(accept) { return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept || ''; i.onchange = () => res(i.files && i.files[0] || null); i.click(); }); }
export function resizeImage(file, size) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'); const s = Math.min(im.width, im.height); x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, size, size); res(c.toDataURL('image/jpeg', 0.82)); }; im.src = fr.result; }; fr.readAsDataURL(file); });
}

// ---------- Piezas visuales ----------
export function Prov({ k }) { if (!k) return null; return <span className={'sc-prov ' + k} title={PROV_LABEL[k]}>{k === 'auto' ? 'E' : k === 'calc' ? 'C' : 'M'}</span>; }
export function Card({ title, right, children, className }) { return <section className={'sc-card ' + (className || '')}>{(title || right) && <header><h3>{title}</h3>{right}</header>}{children}</section>; }
export function Empty({ children, small }) { return <div className={'sc-empty' + (small ? ' small' : '')}>{children}</div>; }
export function Kpi({ label, value, sub, prov, tone }) { return <div className={'sc-kpi' + (tone ? ' ' + tone : '')}><b>{value}</b><span>{label}{prov && <Prov k={prov} />}</span>{sub && <small>{sub}</small>}</div>; }
export function Seg({ value, onChange, options }) { return <div className="sc-seg" role="tablist">{options.map((o) => <button key={o[0]} role="tab" aria-selected={value === o[0]} className={value === o[0] ? 'on' : ''} onClick={() => onChange(o[0])}>{o[1]}</button>)}</div>; }
const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
export function Avatar({ player, size = 40 }) {
  const nick = (player && player.nick) || '?';
  if (player && player.avatar) return <img className="sc-avatar" src={player.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return <span className="sc-avatar init" style={{ width: size, height: size, fontSize: size * 0.4, background: 'hsl(' + hue(nick) + ',38%,32%)' }}>{nick.slice(0, 2).toUpperCase()}</span>;
}
export function Select({ value, onChange, options, placeholder, label, className }) {
  return <label className={'sc-field ' + (className || '')}>{label && <span>{label}</span>}<select value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)}>{placeholder != null && <option value="">{placeholder}</option>}{options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select></label>;
}
export function Input({ label, value, onChange, type = 'text', ...rest }) { return <label className="sc-field">{label && <span>{label}</span>}<input type={type} value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)} {...rest} /></label>; }

// ---------- Hoja inferior (formularios) y confirmación ----------
export function Sheet({ title, onClose, children, foot }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(<div className="sc-overlay" onClick={onClose}><div className="sc-sheet sc-root" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}><div className="sc-sheet-head"><h3>{title}</h3><button className="sc-x" onClick={onClose} aria-label="Cerrar">✕</button></div><div className="sc-sheet-body">{children}</div>{foot && <div className="sc-sheet-foot">{foot}</div>}</div></div>, document.body);
}
export function useConfirm() {
  const [st, setSt] = useState(null);
  const ask = useCallback((text, okLabel) => new Promise((res) => setSt({ text, okLabel: okLabel || 'Aceptar', res })), []);
  const el = st ? <Sheet title="Confirmar" onClose={() => { st.res(false); setSt(null); }} foot={<><button className="sc-btn ghost" onClick={() => { st.res(false); setSt(null); }}>Cancelar</button><button className="sc-btn danger" onClick={() => { st.res(true); setSt(null); }}>{st.okLabel}</button></>}><p>{st.text}</p></Sheet> : null;
  return [ask, el];
}
export function toast(msg) { try { const t = document.createElement('div'); t.className = 'sc-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2400); } catch (e) { } }

export const POSITIONS = ['Portero', 'Defensa', 'Mediocentro', 'Delantero', 'Polivalente'];
