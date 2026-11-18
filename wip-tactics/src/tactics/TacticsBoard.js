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
import { TOOLS, ZONE_TOOLS } from './shapes';
import { newDoc, TEAM_COLORS, ZONES, MAX_PER_TEAM, teamCount } from './model';
import { listDocs, saveDoc, listFolders, listRoster, saveRosterPlayer, getKv, setKv, serializeDoc } from './storage';
import { collectFromMatches, mergeRegistry, keyOf } from './players';
import { renderImage, renderScheme, renderSheet, canvasToBlob, recordAnimation, webmSupported, saveBlob, fileName, projectBlob } from './exporter';

// Categorías del dock inferior: al tocarlas se despliegan sus herramientas
const CATS = [
  { id: 'add', label: 'Añadir', icon: 'plus', tools: ['player', 'ball'] },
  { id: 'lines', label: 'Líneas', icon: 'pen', tools: ['pen', 'line', 'dline', 'arrow', 'carrow'] },
  { id: 'shapes', label: 'Formas', icon: 'polygon', tools: ['rect', 'polygon'] },
  { id: 'zones', label: 'Zonas', icon: 'press', tools: ['press', 'defense', 'cover', 'custom'] },
  { id: 'more', label: 'Más', icon: 'more', tools: [] }
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
const DRAWING = new Set(['pen', 'line', 'dline', 'arrow', 'carrow', 'rect', 'polygon', ...ZONE_TOOLS]);
// Estado mostrado mientras se abre el proyecto: el árbol de la interfaz es siempre el mismo (el canvas no se recrea)
const EMPTY = {
  doc: newDoc('Cargando…'), fi: 0, tool: 'select', multi: false, snap: true, names: true, trails: false, ghost: true, newTeam: 'red',
  style: { color: '#F5C542', width: 3, opacity: 1, fill: false, dashed: false }, viewMode: 'full', zoom: 1, selPlayers: [], selShapes: [],
  canUndo: false, canRedo: false, polyActive: false, play: { state: 'stopped', speed: 1, loop: false }, progress: 0
};
const SAVE_TXT = { saved: 'Guardado', saving: 'Guardando…', dirty: 'Sin guardar', error: 'Error al guardar' };

// playerProvider (opcional): async () => entradas del registro (ver players.js). Lo aporta quien integra la pizarra con el Centro de análisis.
export default function TacticsBoard({ onClose, playerProvider, stadiumProvider }) {
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
  const [fieldOpen, setFieldOpen] = useState(false);
  const [stadiums, setStadiums] = useState([]);
  const matches = useSelector((st) => (st.gameStats ? st.gameStats.matches : null));

  const pending = useRef(null), timer = useRef(0), msgTimer = useRef(0), progT = useRef(0), notesT = useRef({});
  const abortRef = useRef(null);
  const libRef = useRef(false), expRef = useRef(false), busyRef = useRef(null);
  libRef.current = lib; expRef.current = expOpen; busyRef.current = busy;
  const fieldRef = useRef(false); fieldRef.current = fieldOpen;

  const flash = useCallback((m) => { setMsg(m); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(''), 2600); }, []);

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
      if (fieldRef.current) { setFieldOpen(false); return 'ok'; }
      if (expRef.current) { setExpOpen(false); return 'ok'; }
      if (libRef.current) { setLib(false); return 'ok'; }
      if (ctl && ctl.poly) { ctl.cancelPoly(); return 'ok'; }
      requestClose();
      return 'ok';
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (expRef.current) { setExpOpen(false); e.stopPropagation(); } else if (libRef.current) { setLib(false); e.stopPropagation(); }
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
      if (kind === 'json') { const n = fileName(doc, '', 'json'); await saveBlob(projectBlob(doc), n, 'application/json'); flash('Proyecto exportado: ' + n); return; }
      if (kind === 'png') { const n = fileName(doc, 'paso-' + (ctl.fi + 1), 'png'); await saveBlob(await canvasToBlob(renderImage(doc, ctl.fi, { trails: ctl.trails, names: ctl.names })), n, 'image/png'); flash('Imagen guardada: ' + n); return; }
      if (kind === 'scheme') { const n = fileName(doc, 'esquema', 'png'); await saveBlob(await canvasToBlob(renderScheme(doc)), n, 'image/png'); flash('Esquema guardado: ' + n); return; }
      if (kind === 'sheet') { const n = fileName(doc, 'secuencia', 'png'); await saveBlob(await canvasToBlob(renderSheet(doc)), n, 'image/png'); flash('Secuencia guardada: ' + n); return; }
      if (kind === 'video') {
        if (doc.frames.length < 2) { flash('Añade al menos 2 pasos para exportar la animación'); return; }
        if (!webmSupported()) { flash('Este dispositivo no graba vídeo: se exporta la secuencia como imagen'); await doExport('sheet'); return; }
        const ac = new AbortController(); abortRef.current = ac; setBusy({ label: 'Grabando animación…', pct: 0 });
        const blob = await recordAnimation(doc, { speed: ctl.play.speed, signal: ac.signal, onProgress: (p) => setBusy({ label: 'Grabando animación…', pct: p }) });
        setBusy(null); abortRef.current = null;
        if (ac.signal.aborted) { flash('Exportación cancelada'); return; }
        const n = fileName(doc, 'animacion', 'webm'); await saveBlob(blob, n, 'video/webm'); flash('Animación guardada: ' + n);
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
    const z = ZONE_TOOLS.includes(s.tool);
    body = <StylePanel ctl={ctl} s={s} st={s.style} title={tool.label} fillable={['rect', 'polygon'].includes(s.tool)} zoneKind={z} />; title = 'Dibujo';
  } else { body = <DocPanel ctl={ctl} s={s} folders={folders} registry={registry} onAddRegistered={addRegistered} />; title = 'Pizarra'; }

  const dis = s.play.state !== 'stopped';
  const nRed = teamCount(s.doc, 'red'), nBlue = teamCount(s.doc, 'blue');
  const views = [['full', 'full', 'Cancha completa'], ['left', 'halfl', 'Media cancha izquierda'], ['right', 'halfr', 'Media cancha derecha']];
  const viewControls = (
    <>
      <div className='tx-seg' role='group' aria-label='Vista del campo'>
        {views.map(([m, ic, t]) => <button type='button' key={m} className={s.viewMode === m ? 'on' : ''} onClick={() => ctl.setViewMode(m)} title={t} aria-label={t} aria-pressed={s.viewMode === m}><Icon name={ic} /></button>)}
      </div>
      <button type='button' className='tx-icon' onClick={() => ctl.fit()} title='Ajustar al espacio (0)' aria-label='Ajustar'><Icon name='fit' /></button>
    </>
  );

  // Pantalla completa + cancha horizontal (mejor uso del espacio en el móvil). Depende del dispositivo: si no se puede girar, solo pasa a pantalla completa.
  const [full, setFull] = useState(false);
  const toggleFull = useCallback(async () => {
    try {
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); setFull(true); try { await window.screen.orientation.lock('landscape'); } catch (e) { /* sin permiso para girar */ } }
      else { try { window.screen.orientation.unlock(); } catch (e) { /* nada */ } await document.exitFullscreen(); setFull(false); }
    } catch (e) { setFull(false); }
  }, []);
  useEffect(() => { const h = () => setFull(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => { document.removeEventListener('fullscreenchange', h); try { if (document.fullscreenElement) document.exitFullscreen(); window.screen.orientation.unlock(); } catch (e) { /* nada */ } }; }, []);
  const tree = (
    <div className={'tx-root' + (panel ? ' panel-open' : '')} data-ready={snap0 ? '1' : '0'} role='application' aria-label='Pizarra táctica'>
      <header className='tx-top'>
        <button type='button' className='tx-icon' onClick={requestClose} title='Volver al inicio' aria-label='Volver'><Icon name='back' /></button>
        <div className='tx-title'>
          <b title={s.doc.name}>{s.doc.name}</b>
          <small className={'tx-save ' + saveState}>{SAVE_TXT[saveState]}</small>
        </div>
        <div className='tx-top-actions'>
          <button type='button' className='tx-chipbtn' onClick={() => setFieldOpen(true)} title='Cambiar de cancha' aria-label='Cancha'><Icon name='board' size={18} /><span>{s.doc.field ? s.doc.field.name : 'Classic'}</span></button>
          <div className='tx-viewctl hide-sm'>{viewControls}</div>
          <button type='button' className='tx-icon hide-sm' onClick={() => ctl.zoomBy(1 / 1.25)} title='Alejar (−)' aria-label='Alejar'><Icon name='zoomout' /></button>
          <button type='button' className='tx-icon hide-sm' onClick={() => ctl.zoomBy(1.25)} title='Acercar (+)' aria-label='Acercar'><Icon name='zoomin' /></button>
          <span className='tx-sep hide-sm' />
          <button type='button' className='tx-icon' onClick={() => { flush(); setLib(true); }} title='Biblioteca' aria-label='Biblioteca'><Icon name='library' /></button>
          <div className='tx-menu-wrap'>
            <button type='button' className={'tx-icon' + (expOpen ? ' on' : '')} onClick={() => setExpOpen(!expOpen)} title='Exportar' aria-label='Exportar' aria-expanded={expOpen}><Icon name='download' /></button>
            {expOpen && (
              <>
                <div className='tx-menu-back' onClick={() => setExpOpen(false)} />
                <div className='tx-menu' role='menu'>
                  <button type='button' role='menuitem' onClick={() => doExport('png')}><Icon name='image' size={18} /><span>Imagen del paso actual<small>PNG</small></span></button>
                  <button type='button' role='menuitem' onClick={() => doExport('scheme')}><Icon name='trail' size={18} /><span>Esquema táctico<small>PNG con trayectorias</small></span></button>
                  <button type='button' role='menuitem' onClick={() => doExport('sheet')}><Icon name='film' size={18} /><span>Secuencia por pasos<small>PNG con todos los pasos</small></span></button>
                  <button type='button' role='menuitem' onClick={() => doExport('video')}><Icon name='play' size={18} /><span>Animación<small>{webmSupported() ? 'Vídeo WebM' : 'No disponible aquí'}</small></span></button>
                  <button type='button' role='menuitem' onClick={() => doExport('json')}><Icon name='save' size={18} /><span>Jugada individual<small>Archivo de proyecto (.json)</small></span></button>
                </div>
              </>
            )}
          </div>
          <button type='button' className={'tx-icon' + (full ? ' on' : '')} onClick={toggleFull} title='Pantalla completa y cancha horizontal' aria-label='Pantalla completa' aria-pressed={full}><svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>{full ? <path d='M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' /> : <path d='M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' />}</svg></button>
          <button type='button' className={'tx-icon' + (panel ? ' on' : '')} onClick={() => setPanel(!panel)} title='Panel de la jugada' aria-label='Panel'><Icon name='panel' /></button>
        </div>
      </header>

      <div className='tx-body'>
        <main className='tx-stage'>
          <canvas ref={canvasRef} className='tx-canvas' aria-label='Campo de HaxBall' />
          <div className='tx-viewbar show-sm'>{viewControls}</div>
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
            {cat !== 'add' && CATS.find((c) => c.id === cat).tools.map((id) => (
              <button type='button' key={id} className={'tx-ft' + (s.tool === id ? ' on' : '')} onClick={() => { ctl.setTool(id); setCat(null); }} title={TOOL[id].hint} aria-pressed={s.tool === id}><Icon name={id} size={22} /><span>{TOOL[id].label}</span></button>
            ))}
          </div>
        )}
        {cat === 'more' && (
          <div className='tx-fly' role='group' aria-label='Más'>
            <button type='button' className={'tx-ft' + (s.tool === 'text' ? ' on' : '')} onClick={() => { ctl.setTool('text'); setCat(null); }}><Icon name='text' size={22} /><span>Texto</span></button>
            <button type='button' className={'tx-ft danger' + (confirmClear ? ' on' : '')} disabled={!s.doc.players.length && !s.doc.shapes.length} onClick={() => { if (confirmClear) { ctl.clearBoard(); setConfirmClear(false); setCat(null); } else { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); } }}><Icon name='trash' size={22} /><span>{confirmClear ? '¿Seguro?' : 'Vaciar todo'}</span></button>
          </div>
        )}
        <div className='tx-dock' role='toolbar' aria-label='Herramientas'>
          <div className='tx-dg tx-dg-act'>
            <button type='button' className={'tx-db' + (s.tool === 'select' && !s.multi ? ' on' : '')} onClick={() => { ctl.setFlag('multi', false); ctl.setTool('select'); setCat(null); }} aria-pressed={s.tool === 'select' && !s.multi} title='Mover y seleccionar fichas y figuras'><Icon name='select' size={22} /><span>Mover</span></button>
            <button type='button' className={'tx-db' + (s.tool === 'pan' ? ' on' : '')} onClick={() => { ctl.setTool('pan'); setCat(null); }} aria-pressed={s.tool === 'pan'} title='Desplazar el campo'><Icon name='pan' size={22} /><span>Mano</span></button>
            <button type='button' className={'tx-db' + (s.multi ? ' on' : '')} onClick={() => { ctl.setTool('select'); ctl.setFlag('multi', !s.multi); setCat(null); }} aria-pressed={s.multi} title='Selección múltiple: toca varias fichas'><Icon name='multi' size={22} /><span>Varios</span></button>
            <button type='button' className={'tx-db' + (s.tool === 'erase' ? ' on' : '')} onClick={() => { ctl.setTool(s.tool === 'erase' ? 'select' : 'erase'); setCat(null); }} aria-pressed={s.tool === 'erase'} title='Borrador: toca lo que quieras quitar'><Icon name='erase' size={22} /><span>Borrador</span></button>
            <button type='button' className='tx-db danger' disabled={dis || !(s.selPlayers.length + s.selShapes.length)} onClick={() => ctl.deleteSelection()} title='Eliminar lo seleccionado'><Icon name='trash' size={22} /><span>Eliminar</span></button>
            <button type='button' className='tx-db' disabled={dis || !s.canUndo} onClick={() => ctl.undo()} title='Deshacer (Ctrl+Z)'><Icon name='undo' size={22} /><span>Deshacer</span></button>
            <button type='button' className='tx-db' disabled={dis || !s.canRedo} onClick={() => ctl.redo()} title='Rehacer (Ctrl+Y)'><Icon name='redo' size={22} /><span>Rehacer</span></button>
          </div>
          <span className='tx-dsep' />
          <div className='tx-dg tx-dg-cat'>
            {CATS.map((c) => {
              const cur = c.tools.includes(s.tool) ? s.tool : null;
              return (
                <button type='button' key={c.id} className={'tx-db cat' + (cat === c.id ? ' open' : '') + (cur || (c.id === 'more' && s.tool === 'text') ? ' on' : '')} onClick={() => setCat(cat === c.id ? null : c.id)} aria-expanded={cat === c.id} title={c.label}>
                  <Icon name={cur && c.id !== 'add' ? cur : c.icon} size={22} /><span>{c.label}</span>
                </button>
              );
            })}
          </div>
          <span className='tx-dsep' />
          <button type='button' className={'tx-db anim' + (anim ? ' on' : '')} onClick={() => { if (anim && ctl) ctl.stop(); setAnim(!anim); setCat(null); }} aria-pressed={anim} title='Mostrar u ocultar la animación (pasos y reproducción)'><Icon name='film' size={22} /><span>Animar</span></button>
        </div>
      </div>
      {fieldOpen && (
        <div className='tx-overlay' onClick={() => setFieldOpen(false)}>
          <div className='tx-sheet tx-fieldsheet' role='dialog' aria-label='Elegir cancha' onClick={(e) => e.stopPropagation()}>
            <div className='tx-sheet-head'><h3>Cancha</h3><button type='button' className='tx-icon' onClick={() => setFieldOpen(false)} aria-label='Cerrar'><Icon name='close' /></button></div>
            <div className='tx-fieldlist'>
              <button type='button' className={'tx-field-opt' + (!s.doc.field ? ' on' : '')} onClick={() => { ctl.setField(null); setFieldOpen(false); }}>
                <b>Classic</b><small>Predeterminada · 740 × 340</small>{!s.doc.field && <Icon name='check' size={18} />}
              </button>
              {stadiums.map((g) => (
                <button type='button' key={g.name} className={'tx-field-opt' + (s.doc.field && s.doc.field.name === g.name ? ' on' : '')} onClick={() => { ctl.setField(g); setFieldOpen(false); flash('Cancha: ' + g.name); }}>
                  <b>{g.name}</b><small>De tus partidos importados · {Math.round(g.halfW * 2)} × {Math.round(g.halfH * 2)}</small>{s.doc.field && s.doc.field.name === g.name && <Icon name='check' size={18} />}
                </button>
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

export { serializeDoc, ZONES };
