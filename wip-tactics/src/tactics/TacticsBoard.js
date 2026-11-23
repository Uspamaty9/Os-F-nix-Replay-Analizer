// Pizarra táctica profesional para HaxBall. Módulo independiente del analizador de repeticiones:
// solo LEE el estado Redux (gameStats.matches) para ofrecer los jugadores registrados y guarda en su propia base.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import './tactics.scss';
import Icon from './icons';
import Library from './Library';
import Timeline from './Timeline';
import { DocPanel, PlayerPanel, MultiPanel, ShapePanel, StylePanel } from './panels';
import { TacticsController } from './controller';
import { TOOLS } from './shapes';
import { newDoc, TEAM_COLORS, MAX_PER_TEAM, teamCount } from './model';
import { listDocs, saveDoc, listFolders, listRoster, saveRosterPlayer, getKv, setKv, serializeDoc } from './storage';
import { collectFromMatches, mergeRegistry, keyOf } from './players';
import { renderImage, renderScheme, renderSheet, canvasToBlob, recordAnimation, webmSupported, saveBlob, fileName, projectBlob } from './exporter';

// Categorías del dock inferior: al tocarlas se despliegan sus herramientas
const CATS = [
  { id: 'add', label: 'Añadir', icon: 'plus', tools: ['player', 'ball'] },
  { id: 'draw', label: 'Dibujar', icon: 'pen', tools: ['pen', 'line', 'dline', 'arrow', 'carrow', 'rect', 'oval', 'polygon', 'text'] },
  { id: 'more', label: 'Más', icon: 'more', tools: [] }
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const DRAWING = new Set(['pen', 'line', 'dline', 'arrow', 'carrow', 'rect', 'oval', 'polygon']);
// Estado mostrado mientras se abre el proyecto: el árbol de la interfaz es siempre el mismo (el canvas no se recrea)
const EMPTY = {
  doc: newDoc('Cargando…'), fi: 0, tool: 'select', multi: false, shadow: false, snap: true, names: true, trails: false, ghost: true, newTeam: 'red',
  style: { color: '#F5C542', width: 3, opacity: 1, fill: false, dashed: false }, viewMode: 'full', zoom: 1, selPlayers: [], selShapes: [],
  canUndo: false, canRedo: false, polyActive: false, play: { state: 'stopped', speed: 1, loop: false }, progress: 0
};
const SAVE_TXT = { saved: 'Guardado', saving: 'Guardando…', dirty: 'Sin guardar', error: 'Error al guardar' };

// playerProvider (opcional): async () => entradas del registro (ver players.js). Lo aporta quien integra la pizarra con el Centro de análisis.
export default function TacticsBoard({ onClose, playerProvider, stadiumProvider, onReadMap }) {
  const canvasRef = useRef(null);
  const ctlRef = useRef(null);
  const [snap0, setS] = useState(null);
  const [progress, setProgress] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveState, setSaveState] = useState('saved');
  const [msg, setMsg] = useState('');
  const [lib, setLib] = useState(false);
  const [expOpen, setExpOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [folders, setFolders] = useState([]);
  const [roster, setRoster] = useState([]);
  const [external, setExternal] = useState([]);
  const [panel, setPanel] = useState(false);
  const [cat, setCat] = useState(null);
  const [anim, setAnim] = useState(false);
  const [bar, setBar] = useState(null); // bandeja de fichas abierta: 'red' | 'blue' | null
  const [menuOpen, setMenuOpen] = useState(false);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [stadiums, setStadiums] = useState([]);
  const matches = useSelector((st) => (st.gameStats ? st.gameStats.matches : null));

  const pending = useRef(null), timer = useRef(0), msgTimer = useRef(0), progT = useRef(0), notesT = useRef({});
  const abortRef = useRef(null);
  const menuRef = useRef(false), libRef = useRef(false), expRef = useRef(false), busyRef = useRef(null);
  menuRef.current = menuOpen; libRef.current = lib; expRef.current = expOpen; busyRef.current = busy;
  const fieldRef = useRef(false); fieldRef.current = fieldOpen;

  const flash = useCallback((m) => { setMsg(m); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(''), String(m).startsWith('✓') ? 5000 : 2600); }, []);
  const saved = (what, n, how) => '✓ ' + what + (how === 'native' ? ' guardado en Descargas: ' : ' descargado: ') + n;

  // ---------- guardado automático ----------
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const d = pending.current; if (!d) return;
    pending.current = null; setSaveState('saving');
    const ok = await saveDoc(d);
    if (pending.current) return; // llegaron más cambios mientras se guardaba
    setSaveState(ok ? 'saved' : 'error');
    if (ok) setKv('last', d.id);
  }, []);

  const onDocChange = useCallback((doc) => {
    pending.current = doc; setSaveState('dirty');
    clearTimeout(timer.current); timer.current = setTimeout(flush, 800);
  }, [flush]);

  const reloadMeta = useCallback(async () => { setFolders(await listFolders()); setRoster(await listRoster()); }, []);

  // ---------- arranque ----------
  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    const ctl = new TacticsController(canvas, {
      onState: (snap) => { if (alive) setS(snap); },
      onDocChange,
      onToast: flash,
      onProgress: (x) => { const t = performance.now(); if (t - progT.current > 50) { progT.current = t; setProgress(x); } },
      onFocus: () => { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); },
      onFocusLabel: () => { setPanel(true); setTimeout(() => { const el = document.getElementById('tx-shape-label'); if (el) { el.focus(); el.select(); } }, 80); },
      onSave: () => { flush(); flash('Guardado'); }
    });
    ctlRef.current = ctl;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => ctl.resize()) : null;
    if (ro) ro.observe(canvas.parentElement); else window.addEventListener('resize', () => ctl.resize());
    (async () => {
      await reloadMeta();
      const docs = await listDocs();
      const last = await getKv('last');
      let d = docs.find((x) => x.id === last) || docs[0];
      if (!d) { d = newDoc('Pizarra 1'); await saveDoc(d); await setKv('last', d.id); }
      if (alive) ctl.load(d);
    })();
    const hide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => {
      alive = false; flush();
      document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', flush);
      if (ro) ro.disconnect();
      ctl.destroy(); ctlRef.current = null;
      clearTimeout(msgTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- botón atrás del móvil / Esc: cierra lo último que se abrió ----------
  const requestClose = useCallback(async () => { await flush(); onClose && onClose(); }, [flush, onClose]);
  useEffect(() => {
    const prev = window.__fenixBack;
    window.__fenixBack = function () {
      const ctl = ctlRef.current;
      if (busyRef.current) { if (abortRef.current) abortRef.current.abort(); return 'ok'; }
      if (menuRef.current) { setMenuOpen(false); return 'ok'; }
      if (fieldRef.current) { setFieldOpen(false); return 'ok'; }
      if (expRef.current) { setExpOpen(false); return 'ok'; }
      if (libRef.current) { setLib(false); return 'ok'; }
      if (ctl && ctl.poly) { ctl.cancelPoly(); return 'ok'; }
      requestClose();
      return 'ok';
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current) { setMenuOpen(false); e.stopPropagation(); } else if (expRef.current) { setExpOpen(false); e.stopPropagation(); } else if (libRef.current) { setLib(false); e.stopPropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.__fenixBack = prev; window.removeEventListener('keydown', onKey, true); };
  }, [requestClose]);

  // ---------- jugadores registrados ----------
  const live = useMemo(() => collectFromMatches(matches), [matches]);
  const registry = useMemo(() => mergeRegistry(live, roster, external), [live, roster, external]);

  // Perfiles del proveedor externo (se actualizan solos cuando cambian los datos del Centro de análisis)
  useEffect(() => {
    if (!playerProvider) return undefined;
    let alive = true;
    const load = async () => { try { const list = await playerProvider(); if (alive && Array.isArray(list)) setExternal(list); } catch (e) { /* sin proveedor: se sigue con lo local */ } };
    load();
    window.addEventListener('fenix-scouting-changed', load);
    return () => { alive = false; window.removeEventListener('fenix-scouting-changed', load); };
  }, [playerProvider]);

  // Canchas de los partidos importados
  useEffect(() => {
    if (!stadiumProvider) return undefined;
    let alive = true;
    const load = async () => { try { const list = await stadiumProvider(); if (alive && Array.isArray(list)) setStadiums(list); } catch (e) { /* sin canchas importadas: solo Classic */ } };
    load();
    window.addEventListener('fenix-scouting-changed', load);
    return () => { alive = false; window.removeEventListener('fenix-scouting-changed', load); };
  }, [stadiumProvider]);

  // El plantel guarda a los jugadores vistos en el analizador para que sigan disponibles después
  useEffect(() => {
    const list = Object.values(live); if (!list.length) return undefined;
    const t = setTimeout(async () => {
      let changed = false;
      for (const e of list) {
        const prev = roster.find((r) => (r.key || keyOf(r.nick)) === e.key);
        if (prev && JSON.stringify(prev.stats) === JSON.stringify(e.stats) && prev.team === e.team) continue;
        await saveRosterPlayer({ id: prev && prev.id, key: e.key, nick: e.nick, nation: e.nation, team: e.team, stats: e.stats, position: (prev && prev.position) || '', info: (prev && prev.info) || '' });
        changed = true;
      }
      if (changed) setRoster(await listRoster());
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const addRegistered = (r) => {
    const ctl = ctlRef.current; if (!ctl) return;
    ctl.addPlayerCenter({ nick: r.nick, regKey: r.key, team: r.team || 'neutral', color: TEAM_COLORS[r.team || 'neutral'] });
    setPanel(true);
  };
  const saveToRoster = async (p) => {
    const key = keyOf(p.nick); if (!key) return;
    await saveRosterPlayer({ key, nick: p.nick, team: p.team, nation: '' });
    setRoster(await listRoster());
    ctlRef.current.updatePlayer(p.id, { regKey: key });
    flash('«' + p.nick + '» guardado en el plantel');
  };
  const saveNotes = (reg, info) => {
    clearTimeout(notesT.current[reg.key]);
    notesT.current[reg.key] = setTimeout(async () => {
      await saveRosterPlayer({ id: reg.id, key: reg.key, nick: reg.nick, nation: reg.nation, team: reg.team, stats: reg.external ? null : reg.stats, position: reg.position || '', info });
      setRoster(await listRoster());
    }, 600);
  };

  // ---------- biblioteca ----------
  const openDoc = async (d) => { await flush(); ctlRef.current.load(d); setLib(false); pending.current = null; setSaveState('saved'); await setKv('last', d.id); };
  const newBoard = async (folderId) => {
    await flush();
    const docs = await listDocs();
    const d = newDoc('Pizarra ' + (docs.length + 1)); d.folderId = folderId || null;
    await saveDoc(d); await setKv('last', d.id);
    ctlRef.current.load(d); setLib(false); pending.current = null; setSaveState('saved'); flash('Pizarra nueva');
  };
  const libChanged = async (deletedId) => {
    await reloadMeta();
    if (deletedId && ctlRef.current && ctlRef.current.doc.id === deletedId) { // se borró la pizarra abierta
      const docs = await listDocs();
      const d = docs[0] || newDoc('Pizarra 1'); if (!docs.length) await saveDoc(d);
      ctlRef.current.load(d); await setKv('last', d.id);
    }
  };

  // ---------- exportación ----------
  const doExport = async (kind) => {
    setExpOpen(false);
    const ctl = ctlRef.current; if (!ctl) return;
    ctl.stop();
    const doc = ctl.doc;
    try {
      if (kind === 'json') { const n = fileName(doc, '', 'json'); const how = await saveBlob(projectBlob(doc), n, 'application/json'); flash(saved('Proyecto', n, how)); return; }
      if (kind === 'png') { const n = fileName(doc, 'paso-' + (ctl.fi + 1), 'png'); const how = await saveBlob(await canvasToBlob(renderImage(doc, ctl.fi, { shadow: ctl.shadow, shadowIds: ctl.shadowIds, trails: ctl.trails, names: ctl.names })), n, 'image/png'); flash(saved('Imagen', n, how)); return; }
      if (kind === 'scheme') { const n = fileName(doc, 'esquema', 'png'); const how = await saveBlob(await canvasToBlob(renderScheme(doc)), n, 'image/png'); flash(saved('Esquema', n, how)); return; }
      if (kind === 'sheet') { const n = fileName(doc, 'secuencia', 'png'); const how = await saveBlob(await canvasToBlob(renderSheet(doc)), n, 'image/png'); flash(saved('Secuencia', n, how)); return; }
      if (kind === 'video') {
        if (doc.frames.length < 2) { flash('Añade al menos 2 pasos para exportar la animación'); return; }
        if (!webmSupported()) { flash('Este dispositivo no graba vídeo: se exporta la secuencia como imagen'); await doExport('sheet'); return; }
        const ac = new AbortController(); abortRef.current = ac; setBusy({ label: 'Grabando animación…', pct: 0 });
        const blob = await recordAnimation(doc, { speed: ctl.play.speed, signal: ac.signal, onProgress: (p) => setBusy({ label: 'Grabando animación…', pct: p }) });
        setBusy(null); abortRef.current = null;
        if (ac.signal.aborted) { flash('Exportación cancelada'); return; }
        const n = fileName(doc, 'animacion', 'webm'); const how = await saveBlob(blob, n, 'video/webm'); flash(saved('Animación', n, how));
      }
    } catch (e) { setBusy(null); flash('No se pudo exportar: ' + (e && e.message ? e.message : 'error')); }
  };

  const s = snap0 || EMPTY;
  const ctl = ctlRef.current;

  // En pantallas estrechas el panel se abre al tocar una ficha o figura existente (no al colocar fichas nuevas)
  const selSig = s.selPlayers.join(',') + '|' + s.selShapes.join(',');
  const nShapes = s.selShapes.length, nPl = s.selPlayers.filter((i) => i !== 'ball').length, ballSel = s.selPlayers.includes('ball');
  const tool = TOOL[s.tool];
  let body, title;
  if (nShapes) { body = <ShapePanel ctl={ctl} s={s} />; title = 'Figura'; } else if (nPl >= 2) { body = <MultiPanel ctl={ctl} s={s} />; title = 'Selección'; } else if (nPl === 1) { body = <PlayerPanel ctl={ctl} s={s} registry={registry} onSaveRoster={saveToRoster} onNotes={saveNotes} />; title = 'Jugador'; } else if (ballSel) {
    body = (<section className='tx-sec'><h4>Balón</h4><button type='button' className='tx-btn danger' onClick={() => ctl.removeBall()}><Icon name='trash' size={16} /><span>Quitar balón</span></button></section>); title = 'Balón';
  } else if (DRAWING.has(s.tool)) {
    body = <StylePanel ctl={ctl} s={s} st={s.style} title={tool.label} fillable={['rect', 'oval', 'polygon'].includes(s.tool)} />; title = 'Dibujo';
  } else { body = <DocPanel ctl={ctl} s={s} folders={folders} registry={registry} onAddRegistered={addRegistered} />; title = 'Pizarra'; }

  // La cancha de la jugada se actualiza sola con lo último analizado de ese mapa (postes, paredes, colores)
  const fieldName = s.doc.field ? s.doc.field.name : null, fieldJson = s.doc.field ? JSON.stringify(s.doc.field) : '';
  useEffect(() => {
    if (!ctl || !fieldName || s.play.state !== 'stopped') return;
    const fresh = stadiums.find((g) => g.name === fieldName);
    if (fresh && JSON.stringify(fresh) !== fieldJson) ctl.setField(fresh);
  }, [stadiums, fieldName, fieldJson, ctl, s.play.state]);
  const toggleBar = (k) => { setCat(null); setBar((b) => (b === k ? null : k)); };
  const dis = s.play.state !== 'stopped';
  const nRed = teamCount(s.doc, 'red'), nBlue = teamCount(s.doc, 'blue');
  const views = [['full', 'full', 'Cancha completa'], ['left', 'halfr', 'Media cancha izquierda'], ['right', 'halfl', 'Media cancha derecha']];

  const tree = (
    <div className={'tx-root' + (panel ? ' panel-open' : '') + ((cat || bar) ? ' flyopen' : '')} data-ready={snap0 ? '1' : '0'} role='application' aria-label='Pizarra táctica'>
      <div className='tx-body'>
        <main className='tx-stage'>
          <canvas ref={canvasRef} className='tx-canvas' aria-label='Campo de HaxBall' />
          <header className='tx-top2'>
            <button type='button' className='tx-round tx-back' onClick={requestClose} aria-label='Volver al inicio' title='Volver al inicio'><Icon name='back' size={22} /></button>
            <button type='button' className='tx-namepill' onClick={() => setMenuOpen(true)} title='Abrir el menú'>
              <b>{s.doc.name}</b><i className={'tx-dot ' + saveState} aria-hidden='true' /><small className={'tx-sr tx-save ' + saveState}>{SAVE_TXT[saveState]}</small>
            </button>
            <button type='button' className={'tx-round tx-menu2' + (menuOpen ? ' on' : '')} onClick={() => setMenuOpen(true)} aria-label='Menú' aria-haspopup='dialog' title='Menú: nueva, abrir, guardar, cancha, compartir'><Icon name='menu' size={22} /></button>
          </header>
          {[['red', 'Rojo', nRed, 'tl'], ['blue', 'Azul', nBlue, 'tr']].map(([t, lbl, n, pos]) => (
            <button type='button' key={t} className={'tx-corner tx-team ' + t + ' ' + pos + (bar === t ? ' on' : '')} onClick={() => toggleBar(t)} aria-pressed={bar === t} aria-label={'Jugadores ' + lbl.toLowerCase() + 's'} title={'Equipo ' + lbl.toLowerCase() + ': toca para ver sus fichas'}>
              <span className='tx-chev'><Icon name={t === 'red' ? 'next' : 'prev'} size={16} /></span>
              <span className='tx-badge'><Icon name='team' size={26} /></span>
              <small>{lbl} {n}/{MAX_PER_TEAM}</small>
            </button>
          ))}
          <div className='tx-hintbar' aria-live='polite'>
            <b>{tool ? tool.label : ''}</b>
            <span>{dis ? 'Animación en curso: pausa para editar' : s.multi && s.tool === 'select' ? 'Selección múltiple activa: toca varias fichas' : tool ? tool.hint : ''}</span>
          </div>
          {s.polyActive && (
            <div className='tx-polybar'>
              <button type='button' className='tx-btn primary' onClick={() => ctl.finishPoly()}><Icon name='check' size={16} /><span>Cerrar figura</span></button>
              <button type='button' className='tx-btn' onClick={() => ctl.undoPolyPoint()}><Icon name='undo' size={16} /><span>Quitar punto</span></button>
              <button type='button' className='tx-btn' onClick={() => ctl.cancelPoly()}><Icon name='close' size={16} /><span>Cancelar</span></button>
            </div>
          )}
          {nPl >= 2 && !s.polyActive && !dis && (
            <div className='tx-quick'>
              <button type='button' className='tx-btn primary' onClick={() => ctl.linkSelection()}>
                <Icon name='link' size={16} /><span>{nPl === 2 ? 'Crear conexión' : nPl === 3 ? 'Crear triángulo' : nPl === 4 ? 'Crear estructura' : 'Crear polígono'}</span>
              </button>
            </div>
          )}
          {dis && <div className='tx-playing'>{s.play.state === 'playing' ? 'Reproduciendo' : 'En pausa'} · paso {Math.min(s.doc.frames.length, Math.floor(s.play.state === 'playing' ? progress : s.progress) + 1)} de {s.doc.frames.length}</div>}
        </main>

        <aside className='tx-panel' aria-label={'Panel: ' + title}>
          <div className='tx-panel-head'>
            <h3>{title}</h3>
            <button type='button' className='tx-icon' onClick={() => setPanel(false)} aria-label='Cerrar panel'><Icon name='close' /></button>
          </div>
          <div className='tx-panel-body'>{body}</div>
        </aside>
      </div>

      {(
        <div className='tx-dockwrap'>
          {anim && <Timeline ctl={ctl} s={s} progress={progress} />}
          {cat && cat !== 'more' && (
          <div className='tx-fly' role='group' aria-label={CATS.find((c) => c.id === cat).label}>
            {cat === 'add' && (
              <>
                <button type='button' className={'tx-ft team red' + (s.tool === 'player' && s.newTeam === 'red' ? ' on' : '')} onClick={() => { ctl.setNewTeam('red'); ctl.setTool('player'); setCat(null); }}><i /><span>Rojo {nRed}/{MAX_PER_TEAM}</span></button>
                <button type='button' className={'tx-ft team blue' + (s.tool === 'player' && s.newTeam === 'blue' ? ' on' : '')} onClick={() => { ctl.setNewTeam('blue'); ctl.setTool('player'); setCat(null); }}><i /><span>Azul {nBlue}/{MAX_PER_TEAM}</span></button>
                <button type='button' className={'tx-ft' + (s.tool === 'ball' ? ' on' : '')} onClick={() => { ctl.setTool('ball'); setCat(null); }}><Icon name='ball' size={22} /><span>Balón</span></button>
                {[2, 3, 4].map((n) => <button type='button' key={n} className='tx-ft' onClick={() => { ctl.addFormation(n); setCat(null); }}><Icon name='team' size={22} /><span>{n} vs {n}</span></button>)}
                <button type='button' className='tx-ft' onClick={() => { ctl.setTool('select'); setPanel(true); setCat(null); }}><Icon name='user' size={22} /><span>Registrados</span></button>
              </>
            )}
            {cat === 'draw' && (
              <>
                <div className='tx-fgrp'>Líneas</div>
                {['pen', 'line', 'dline', 'arrow', 'carrow'].map((id) => (
                  <button type='button' key={id} className={'tx-ft' + (s.tool === id ? ' on' : '')} onClick={() => { ctl.setTool(id); setCat(null); }} title={TOOL[id].hint} aria-pressed={s.tool === id}><Icon name={id} size={22} /><span>{TOOL[id].label}</span></button>
                ))}
                <div className='tx-fgrp'>Formas</div>
                {['rect', 'oval', 'polygon', 'text'].map((id) => (
                  <button type='button' key={id} className={'tx-ft' + (s.tool === id ? ' on' : '')} onClick={() => { ctl.setTool(id); setCat(null); }} title={TOOL[id].hint} aria-pressed={s.tool === id}><Icon name={id} size={22} /><span>{TOOL[id].label}</span></button>
                ))}
              </>
            )}
          </div>
        )}
        {cat === 'more' && (
          <div className='tx-fly' role='group' aria-label='Más'>
            <button type='button' className={'tx-ft anim' + (anim ? ' on' : '')} onClick={() => { if (anim) { if (ctl) ctl.stop(); setAnim(false); } else setAnim(true); setCat(null); }} aria-pressed={anim} title='Mostrar pasos y reproducción'><Icon name='film' size={22} /><span>Animación</span></button>
            <button type='button' className={'tx-ft' + (s.tool === 'pan' ? ' on' : '')} onClick={() => { ctl.setTool('pan'); setCat(null); }} aria-pressed={s.tool === 'pan'} title='Desplazar el campo'><Icon name='pan' size={22} /><span>Mano</span></button>
            <button type='button' className={'tx-ft shadow' + (s.shadow ? ' on' : '')} onClick={() => { ctl.setFlag('shadow', !s.shadow); setCat(null); }} aria-pressed={!!s.shadow} title='El balón es un foco y cada jugador tapa la luz: lo oscuro es adonde no se puede tirar en línea recta'><Icon name='shadow' size={22} /><span>Sombras</span></button>
            {s.shadow && (
              <>
                <button type='button' className={'tx-ft' + (s.tool === 'shadowpick' ? ' on' : '')} onClick={() => { ctl.setTool('shadowpick'); setCat(null); }} aria-pressed={s.tool === 'shadowpick'} title='Elige qué jugadores proyectan sombra'><Icon name='select' size={22} /><span>{s.shadowN ? 'Sombra: ' + s.shadowN + ' elegido' + (s.shadowN > 1 ? 's' : '') : 'Elegir quién'}</span></button>
                {s.shadowN > 0 && <button type='button' className='tx-ft' onClick={() => { ctl.clearShadowPick(); setCat(null); }} title='Que todos los jugadores proyecten sombra'><Icon name='team' size={22} /><span>Todos</span></button>}
              </>
            )}
            <button type='button' className={'tx-ft' + (s.multi ? ' on' : '')} onClick={() => { ctl.setTool('select'); ctl.setFlag('multi', !s.multi); setCat(null); }} aria-pressed={s.multi} title='Selección múltiple: toca varias fichas'><Icon name='multi' size={22} /><span>Varios</span></button>
            <button type='button' className={'tx-ft danger' + (confirmClear ? ' on' : '')} disabled={!s.doc.players.length && !s.doc.shapes.length} onClick={() => { if (confirmClear) { ctl.clearBoard(); setConfirmClear(false); setCat(null); } else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); } }}><Icon name='trash' size={22} /><span>{confirmClear ? '¿Seguro?' : 'Vaciar todo'}</span></button>
          </div>
        )}
          {(
            <div className='tx-dock' role='toolbar' aria-label='Herramientas'>
              <button type='button' className={'tx-db' + (s.tool === 'select' && !s.multi ? ' on' : '')} onClick={() => { ctl.setFlag('multi', false); ctl.setTool('select'); setCat(null); }} aria-pressed={s.tool === 'select' && !s.multi} title='Mover y seleccionar'><Icon name='select' size={22} /><span>Mover</span></button>
              {CATS.filter((c) => c.id !== 'more').map((c) => {
                const cur = c.tools.includes(s.tool) ? s.tool : null;
                return (
                  <button type='button' key={c.id} className={'tx-db cat' + (cat === c.id ? ' open' : '') + (cur ? ' on' : '')} onClick={() => setCat(cat === c.id ? null : c.id)} aria-expanded={cat === c.id} title={c.label}>
                    <Icon name={cur && c.id !== 'add' ? cur : c.icon} size={22} /><span>{c.label}</span>
                  </button>
                );
              })}
              <button type='button' className={'tx-db' + (s.tool === 'erase' ? ' on' : '')} onClick={() => { ctl.setTool(s.tool === 'erase' ? 'select' : 'erase'); setCat(null); }} aria-pressed={s.tool === 'erase'} title='Borrador: toca lo que quieras quitar'><Icon name='erase' size={22} /><span>Borrador</span></button>
              <button type='button' className='tx-db ico danger' aria-label='Eliminar' disabled={dis || !(s.selPlayers.length + s.selShapes.length)} onClick={() => ctl.deleteSelection()} title='Eliminar lo seleccionado'><Icon name='trash' size={22} /><span>Eliminar</span></button>
              <button type='button' className='tx-db ico' aria-label='Deshacer' disabled={dis || !s.canUndo} onClick={() => ctl.undo()} title='Deshacer (Ctrl+Z)'><Icon name='undo' size={22} /><span>Deshacer</span></button>
              <button type='button' className='tx-db ico' aria-label='Rehacer' disabled={dis || !s.canRedo} onClick={() => ctl.redo()} title='Rehacer (Ctrl+Y)'><Icon name='redo' size={22} /><span>Rehacer</span></button>
              <button type='button' className={'tx-db cat' + (cat === 'more' ? ' open' : '') + (anim || s.shadow || s.tool === 'pan' || s.multi ? ' on' : '')} onClick={() => setCat(cat === 'more' ? null : 'more')} aria-expanded={cat === 'more'} title='Más'><Icon name='more' size={22} /><span>Más</span></button>
            </div>
          )}
          {(bar === 'red' || bar === 'blue') && (
            <div className='tx-fly tx-roster' role='group' aria-label={'Fichas del equipo ' + (bar === 'red' ? 'rojo' : 'azul')}>
              <button type='button' className={'tx-tok ball'} onClick={() => ctl.placeBall(0, 0)} title='Poner el balón en el centro'><i><Icon name='ball' size={22} /></i><span>Balón</span></button>
              {Array.from({ length: MAX_PER_TEAM }, (_, i) => i + 1).map((n) => {
                const used = s.doc.players.some((q) => (q.team || 'red') === bar && Number(q.num) === n);
                return (
                  <button type='button' key={n} className={'tx-tok ' + bar + (used ? ' used' : '')} onClick={() => ctl.addPlayerCenter({ team: bar, num: n })} title={'Ficha ' + n + (used ? ' (ya está en el campo)' : '')}>
                    <i>{n}</i><span>Jugador {n}</span>
                  </button>
                );
              })}
              {registry.filter((r) => (r.team || 'neutral') === bar).map((r) => (
                <button type='button' key={r.key} className={'tx-tok reg ' + bar} onClick={() => addRegistered(r)} title={'Añadir a ' + r.nick}><i>{String(r.nick || '?').slice(0, 2)}</i><span>{r.nick}</span></button>
              ))}
              <button type='button' className='tx-tok gear' onClick={() => setPanel(!panel)} title='Panel de la jugada y plantel'><i><Icon name='panel' size={22} /></i><span>Ajustes</span></button>
            </div>
          )}
        </div>
      )}
      {menuOpen && (
        <div className='tx-overlay tx-menuov' onClick={() => setMenuOpen(false)}>
          <section className='tx-sheet tx-menusheet' role='dialog' aria-label='Menú' onClick={(e) => e.stopPropagation()}>
            <div className='tx-sheet-head'><h3>{s.doc.name}<small className={saveState}>{SAVE_TXT[saveState]}</small></h3><button type='button' className='tx-icon' onClick={() => setMenuOpen(false)} aria-label='Cerrar'><Icon name='close' /></button></div>
            <div className='tx-tiles'>
              <button type='button' className='tx-tile' onClick={() => { setMenuOpen(false); newBoard(); }}><Icon name='plus' size={24} /><span>Nueva</span></button>
              <button type='button' className='tx-tile' aria-label='Biblioteca' onClick={() => { setMenuOpen(false); flush(); setLib(true); }}><Icon name='folder' size={24} /><span>Abrir</span></button>
              <button type='button' className='tx-tile' onClick={() => { flush(); flash('Guardado'); setMenuOpen(false); }}><Icon name='save' size={24} /><span>Guardar</span></button>
              <button type='button' className='tx-tile' onClick={() => { setMenuOpen(false); setFieldOpen(true); }}><Icon name='board' size={24} /><span>Cancha</span></button>
              <button type='button' className='tx-tile' aria-label='Exportar' onClick={() => { setMenuOpen(false); setExpOpen(true); }}><Icon name='download' size={24} /><span>Compartir</span></button>
              <button type='button' className={'tx-tile' + (panel ? ' on' : '')} aria-label='Panel' aria-pressed={panel} onClick={() => { setMenuOpen(false); setPanel(!panel); }}><Icon name='panel' size={24} /><span>Ajustes</span></button>
            </div>
            <div className='tx-vseg' role='group' aria-label='Vista del campo'>
              {views.map(([m, ic, vt]) => <button type='button' key={m} className={s.viewMode === m ? 'on' : ''} aria-label={vt} aria-pressed={s.viewMode === m} onClick={() => { ctl.setViewMode(m); setMenuOpen(false); }}><Icon name={ic} size={18} /><span>{m === 'full' ? 'Completa' : m === 'left' ? 'Izquierda' : 'Derecha'}</span></button>)}
              <button type='button' aria-label='Ajustar' onClick={() => { ctl.fit(); setMenuOpen(false); }}><Icon name='fit' size={18} /><span>Ajustar</span></button>
            </div>
            <button type='button' className='tx-exit' onClick={() => { setMenuOpen(false); requestClose(); }}>Salir al inicio</button>
          </section>
        </div>
      )}
      {expOpen && (
        <div className='tx-overlay' onClick={() => setExpOpen(false)}>
          <div className='tx-sheet tx-fieldsheet' role='menu' aria-label='Exportar' onClick={(e) => e.stopPropagation()}>
            <div className='tx-sheet-head'><h3>Compartir</h3><button type='button' className='tx-icon' onClick={() => setExpOpen(false)} aria-label='Cerrar'><Icon name='close' /></button></div>
            <div className='tx-fieldlist tx-explist'>
              <button type='button' role='menuitem' className='tx-field-opt' onClick={() => doExport('png')}><b>Imagen del paso actual</b><small>PNG</small><Icon name='image' size={20} /></button>
              <button type='button' role='menuitem' className='tx-field-opt' onClick={() => doExport('scheme')}><b>Esquema táctico</b><small>PNG con trayectorias</small><Icon name='trail' size={20} /></button>
              <button type='button' role='menuitem' className='tx-field-opt' onClick={() => doExport('sheet')}><b>Secuencia por pasos</b><small>PNG con todos los pasos</small><Icon name='film' size={20} /></button>
              <button type='button' role='menuitem' className='tx-field-opt' onClick={() => doExport('video')}><b>Animación</b><small>{webmSupported() ? 'Vídeo WebM' : 'No disponible aquí'}</small><Icon name='play' size={20} /></button>
              <button type='button' role='menuitem' className='tx-field-opt' onClick={() => doExport('json')}><b>Jugada individual</b><small>Archivo de proyecto (.json)</small><Icon name='save' size={20} /></button>
            </div>
          </div>
        </div>
      )}
      {fieldOpen && (
        <div className='tx-overlay' onClick={() => setFieldOpen(false)}>
          <div className='tx-sheet tx-fieldsheet' role='dialog' aria-label='Elegir cancha' onClick={(e) => e.stopPropagation()}>
            <div className='tx-sheet-head'><h3>Cancha</h3><button type='button' className='tx-icon' onClick={() => setFieldOpen(false)} aria-label='Cerrar'><Icon name='close' /></button></div>
            <div className='tx-fieldlist'>
              <button type='button' className={'tx-field-opt' + (!s.doc.field ? ' on' : '')} onClick={() => { ctl.setField(null); setFieldOpen(false); }}>
                <b>Classic</b><small>Predeterminada · 740 × 340</small>{!s.doc.field && <Icon name='check' size={18} />}
              </button>
              {stadiums.map((g) => (
                <React.Fragment key={g.name}>
                <button type='button' className={'tx-field-opt' + (s.doc.field && s.doc.field.name === g.name ? ' on' : '')} onClick={() => { ctl.setField(g); setFieldOpen(false); flash('Cancha: ' + g.name); }}>
                  <b>{g.name}</b><small>De tus partidos importados · {Math.round(g.halfW * 2)} × {Math.round(g.halfH * 2)}{Array.isArray(g.discs) ? '' : ' · sin postes'}</small>{s.doc.field && s.doc.field.name === g.name && <Icon name='check' size={18} />}
                </button>
                {!Array.isArray(g.discs) && onReadMap && <button type='button' className='tx-btn' onClick={() => onReadMap(g.name)} title='Abre un replay de este mapa para leer sus postes exactos'><span>Leer postes de «{g.name}» desde un replay</span></button>}
                </React.Fragment>
              ))}
              {!stadiums.length && <p className='tx-note'>Aquí aparecerán las canchas de los partidos que analices. Abre una repetición en el analizador y vuelve: su cancha quedará disponible.</p>}
            </div>
          </div>
        </div>
      )}

      {lib && <Library currentId={s.doc.id} onOpen={openDoc} onNew={newBoard} onClose={() => setLib(false)} onChanged={libChanged} toast={flash} />}
      {busy && (
        <div className='tx-overlay'>
          <div className='tx-sheet tx-busy' role='alertdialog' aria-label={busy.label}>
            <h3>{busy.label}</h3>
            <div className='tx-bar'><i style={{ width: Math.round(busy.pct * 100) + '%' }} /></div>
            <button type='button' className='tx-btn' onClick={() => abortRef.current && abortRef.current.abort()}>Cancelar</button>
          </div>
        </div>
      )}
      {msg && <div className='tx-toast' role='status'>{msg}</div>}
    </div>
  );
  // En un portal sobre <body>, como las demás hojas de la app: no depende de la posición del inicio
  return typeof document !== 'undefined' && document.body ? createPortal(tree, document.body) : tree;
}

export { serializeDoc };
