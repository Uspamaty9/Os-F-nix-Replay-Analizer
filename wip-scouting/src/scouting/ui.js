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
// Guarda/descarga el archivo y AVISA claramente al usuario cuando ya está listo (con el nombre y dónde quedó).
export async function saveFile(name, mime, bytes) {
  await sendBytes(name, mime, bytesToB64(bytes), 'downloads', false);
  const native = !!(typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  toast('✓ ' + (native ? 'Guardado en Descargas: ' : 'Descargado: ') + name);
}
// Pregunta antes de generar un archivo (PDF, copia de seguridad…). Devuelve una promesa con true/false.
export function askExport(text, okLabel) {
  return new Promise((res) => {
    const ov = document.createElement('div'); ov.className = 'sc-overlay';
    const sh = document.createElement('div'); sh.className = 'sc-sheet sc-root'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-label', 'Confirmar descarga');
    const done = (v) => { ov.remove(); res(v); };
    const h = document.createElement('div'); h.className = 'sc-sheet-head'; const t = document.createElement('h3'); t.textContent = 'Descargar'; h.appendChild(t);
    const b = document.createElement('div'); b.className = 'sc-sheet-body'; const p = document.createElement('p'); p.textContent = text; b.appendChild(p);
    const f = document.createElement('div'); f.className = 'sc-sheet-foot';
    const no = document.createElement('button'); no.className = 'sc-btn ghost'; no.textContent = 'Cancelar'; no.onclick = () => done(false);
    const ok = document.createElement('button'); ok.className = 'sc-btn'; ok.textContent = okLabel || 'Sí, descargar'; ok.onclick = () => done(true);
    f.append(no, ok); sh.append(h, b, f); ov.appendChild(sh); ov.onclick = (e) => { if (e.target === ov) done(false); };
    document.body.appendChild(ov); ok.focus();
  });
}
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
// La etiqueta de origen (E extraído · C calculado · M manual) solo se muestra al tocar la tarjeta.
export function Kpi({ label, value, sub, prov, tone }) {
  const [open, setOpen] = useState(false);
  return <div className={'sc-kpi' + (tone ? ' ' + tone : '') + (prov ? ' tap' : '')} onClick={prov ? () => setOpen(!open) : undefined}><b>{value}</b><span>{label}{prov && open && <Prov k={prov} />}</span>{sub && <small>{sub}</small>}{prov && open && <small className="why">{PROV_LABEL[prov]}</small>}</div>;
}
// Texto de ayuda plegado tras un icono «?»
export function Hint({ children }) { const [o, setO] = useState(false); return <span className="sc-hint"><button className={'sc-q' + (o ? ' on' : '')} onClick={() => setO(!o)} aria-label="Ayuda" aria-expanded={o}>?</button>{o && <span className="sc-note">{children}</span>}</span>; }
// Bloque plegable (acordeón)
export function Fold({ title, children, open }) { return <details className="sc-fold" open={open}><summary>{title}</summary><div>{children}</div></details>; }
export function Seg({ value, onChange, options }) { return <div className="sc-seg" role="tablist">{options.map((o) => <button key={o[0]} role="tab" aria-selected={value === o[0]} className={value === o[0] ? 'on' : ''} onClick={() => onChange(o[0])}>{o[1]}</button>)}</div>; }
const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
// Avatares de HaxBall (texto) que publica el motor al reproducir; misma clave que la pizarra (`fenix.avatars.v1`).
const AV_KEY = 'fenix.avatars.v1';
export function avatarTexts() {
  let stored = {}; try { stored = JSON.parse(localStorage.getItem(AV_KEY) || '{}') || {}; } catch (e) { stored = {}; }
  let live = {}; try { live = window.__fenixAvatars || {}; } catch (e) { live = {}; }
  const merged = { ...stored, ...live };
  try { if (window.__fenixAvatarsDirty) { localStorage.setItem(AV_KEY, JSON.stringify(merged)); window.__fenixAvatarsDirty = false; } } catch (e) { /* sin almacenamiento */ }
  return merged;
}
export function avatarTextOf(map, p) { const names = [p.nick].concat(p.aliases || []); for (const n of names) { const v = map[String(n == null ? '' : n).trim().toLowerCase()]; if (v) return v; } return null; }
const Ic = { cmp: 'M5 20V10M12 20V4M19 20v-7', sel: 'M4 12l5 5L20 6', mine: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z', pick: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', add: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18' };
export function BtnIc({ n }) { return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={Ic[n]} /></svg>; }
export function Avatar({ player, size = 40 }) {
  const nick = (player && player.nick) || '?';
  if (player && player.avatar) return <img className="sc-avatar" src={player.avatar} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  const at = player ? (player.avatarText || avatarTextOf(avatarTexts(), player)) : null;
  if (at) return <span className="sc-avatar init txt" style={{ width: size, height: size, fontSize: size * (Array.from(at).length > 1 ? 0.42 : 0.55), background: 'hsl(' + hue(nick) + ',38%,32%)' }}>{at}</span>;
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
export function toast(msg, action) {
  try {
    document.querySelectorAll('.sc-toast').forEach((x) => x.remove());
    const t = document.createElement('div'); t.className = 'sc-toast'; const sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
    const kill = () => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
    if (action) { const b = document.createElement('button'); b.className = 'sc-toast-act'; b.textContent = action.label || 'Deshacer'; b.onclick = () => { try { action.fn(); } finally { kill(); } }; t.appendChild(b); }
    document.body.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(kill, action ? 7000 : (String(msg).startsWith('✓') ? 5000 : 2400));
  } catch (e) { }
}

export const POSITIONS = ['Portero', 'Defensa', 'Mediocentro', 'Delantero', 'Polivalente'];
