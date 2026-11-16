import HistoryList from "./HistoryList";
import { saveReplayFile, saveReplayFiles, setReplayInfo, getReplayData } from "../storage/history";
import $ from 'jquery'
import { handleFile, replayFromSite, fenixEnter } from "../game2.js";
import LoadingScreen from "./LoadingScreen";
import { useSelector, useDispatch } from "react-redux";
import { setMainMode, setUserUploaded } from "../slices/mainModeSlice";
import { setDivStyle, setStats, setPlayerList, setPlayerPos, clearStats, setConnectHalves, setRedTeamName, setBlueTeamName, setConnectedHalves } from "../slices/gameStatsSlice";
import GameStats from "./game stats/GameStats";
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { useEffect, useState } from "react";
import { createPortal } from 'react-dom';
import ReplaysList from "./replays/ReplaysList";
import { setReplays, setReplaysLoaded, setReplaysType, setLoadingMore, addMoreReplays } from "../slices/replaysSlice";
import { openModal } from "./Modal";
import Downloading from "./Downloading";
import SettingsSheet from './SettingsSheet';
import ReplayFav from './ReplayFav';
import TacticsBoard from '../tactics/TacticsBoard';
import { scoutingPlayers } from '../tactics/scoutingProvider';
import ScoutingApp from '../scouting/ScoutingApp';
import { ingestFromEngine } from '../scouting/ingest';
import './scout-entry.scss';

export function showStats() { }
export function setGameStats() { }
export function dispatchPlayerList() { }
export function dispatchPlayerPos() { }
export function dispatchClearStats() { }
export function sendSocketMessage() { }
export function sendMessageExp() { }
export function search4Replays() { }
export function checkParamsExp() { }
export function changeTeamNames() { }
export function loadMoreReplays() { }

var queryMessage = {};
var replayData = [];
var waitingForStats = true;
var waitingForSocket = true;
var replayIdToSend;

// Resumen del partido para la tarjeta del historial (A1)
function summarizeMatch(stats) {
  const played = (stats || []).filter((m) => m && m.gameTicks > 0);
  if (!played.length) return null;
  const main = played.reduce((a, b) => (b.gameTicks > a.gameTicks ? b : a));
  const names = (arr) => (arr || []).map((n) => String(n)).slice(0, 12);
  return {
    red: main.scoreRed | 0,
    blue: main.scoreBlue | 0,
    ticks: main.gameTicks | 0,
    parts: played.length,
    stadium: main.stadium && main.stadium.name ? String(main.stadium.name).slice(0, 40) : '',
    redNames: names(main.redTeam),
    blueNames: names(main.blueTeam),
  };
}

function Home() {

  const socketUrl = 'wss://haxball-replay-analyzer.com:443/';
  // const socketUrl = 'ws://haxball-replay-analyzer.com:8080/';
  // const socketUrl = 'ws://localhost:8080/';
  const STATIC_OPTIONS = {
    onOpen: () => {
      // console.log('Connected with WebSocket')
      getWebSocket().onmessage = ev => receiveMessage(ev);
      if (!paramsChecked) {
        checkParams();
        setParamsChecked(true)
      }
    },
    onClose: (e) => {
      console.log('Connection closed', e.reason);
    },
    shouldReconnect: (closeEvent) => false
  }
  const { sendMessage, readyState, getWebSocket } = useWebSocket(socketUrl, STATIC_OPTIONS, false);
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Open',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Closed',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  const dispatch = useDispatch();
  const mainMode = useSelector((state) => state.mainMode.value);
  const [showTactics, setShowTactics] = useState(false);
  const [showScouting, setShowScouting] = useState(false);
  // Botón atrás del móvil: cierra la hoja abierta, vuelve de un perfil/detalle o cierra el Centro de análisis (en vez de preguntar por salir de la app)
  useEffect(() => {
    if (!showScouting) return undefined;
    const prev = window.__fenixBack;
    window.__fenixBack = function () {
      const sheet = document.querySelector('.sc-overlay');
      if (sheet) { sheet.click(); return 'ok'; }
      const back = document.querySelector('.sc-overlay-full .sc-link.back');
      if (back) { back.click(); return 'ok'; }
      setShowScouting(false); return 'ok';
    };
    return () => { window.__fenixBack = prev; };
  }, [showScouting]);
  const version = useSelector((state) => state.mainMode.version);
  const userDidUpload = useSelector(state => state.mainMode.userUploaded);
  const [replayId, setReplayId] = useState(null);
  const [replayName, setReplayName] = useState(null);
  const [replayLastModified, setLastModified] = useState(null);
  const [paramsChecked, setParamsChecked] = useState(false);
  const [IP, setIP] = useState(null);
  const [historyTick, setHistoryTick] = useState(0);
  const filterPlayer = useSelector(state => state.replays.filters.player)
  const filterTeam = useSelector(state => state.replays.filters.team)
  const filterReplay = useSelector(state => state.replays.filters.replay)
  const filterGoal = useSelector(state => state.replays.filters.goal)
  const filterStadium = useSelector(state => state.replays.filters.stadium)
  const filterSpaceMode = useSelector(state => state.replays.filters.spaceMode)
  const filterRealSoccer = useSelector(state => state.replays.filters.realSoccer)
  const searchText = useSelector(state => state.replays.filters.searchText)
  const periodState = useSelector(state => state.replays.filters.period)
  const replaysType = useSelector(state => state.replays.type);
  const replays = useSelector(state => state.replays.replays);
  const replaysQty = replays.replays?.length;
  const startDate = useSelector(state => state.replays.filters.startDate)
  const endDate = useSelector(state => state.replays.filters.endDate)

  function receiveMessage(m) {
    const x = JSON.parse(m.data);
    // console.log(x);
    if (x.header === 'insertedReplayId') {
      const addURL = "?replayId=" + x.id;
      window.history.pushState(null, null, addURL);
      setReplayId(x.id);
      waitingForSocket = false;
      replayIdToSend = x.id;
      if (!waitingForStats) {
        sendMessage(JSON.stringify(queryMessage));
      }
    } else if (x.header === 'replayPart') {
      replayData = replayData.concat(x.rec.data);
    } else if (x.header === 'replaySent') {
      if (x?.connectHalves) dispatch(setConnectHalves(true))
      else dispatch(setConnectHalves(false))

      for (var i = 0; i < x.teamNames.length; i++) {
        const j = Math.floor(i / 2);
        if (i % 2 === 0) {
          dispatch(setRedTeamName({ mtc: j, name: x.teamNames[i].TeamName }))
        } else dispatch(setBlueTeamName({ mtc: j, name: x.teamNames[i].TeamName }))
      }

      const y = replayData;
      const buffer = new ArrayBuffer(y.length);
      const uint8View = new Uint8Array(buffer);
      for (let i = 0; i < y.length; i++) {
        uint8View[i] = y[i]; // zapisywanie danych z tablicy do bufora ArrayBuffer
      }
      const newBuffer = uint8View.buffer; // konwersja widoku Uint8Array na ArrayBuffer
      dispatch(setUserUploaded(false));
      replayData = [];

      $(function () {

        $('#downloading-screen').animate({
          left: '-150%',
        }, { duration: 700, easing: 'swing', queue: false, complete: function () { $("#downloading-screen").css('left', '100%') } });

        $('#loading-screen').animate({
          left: '8vw',
        }, { duration: 700, easing: 'swing', queue: false, complete: function () { replayFromSite(newBuffer); } });

      })
    } else if (x.header === 'alreadyUploaded') {
      const addURL = "?replayId=" + x.replayId;
      window.history.pushState(null, null, addURL);
      setReplayId(x.id);
      openModal('This recording has already been uploaded. Redirected to this replay.', 'darkgoldenrod', 5)
    } else if (x.header === 'top10 stats') {
      for (var i = 0; i < x.replays.replays.length; i++) {
        if (x.replays.replays[i].ConnectedHalves) {
          connectHalves(x.replays, i)
        }
      }
      // console.log(x.replays);
      dispatch(setReplaysLoaded(true));
      dispatch(setReplays(x.replays));
      dispatch(setMainMode('replays'));
    } else if (x.header === 'invalidLink') {
      openModal('Invalid link - replay with given ID doesn\'t exist', 'darkgoldenrod', 4)
    } else if (x.header === 'next10 stats') {
      for (var i = 0; i < x.replays.replays.length; i++) {
        if (x.replays.replays[i].ConnectedHalves) {
          connectHalves(x.replays, i)
        }
      }
      if (x.replays.replays.length > 0) dispatch(addMoreReplays(x.replays));
      dispatch(setLoadingMore(false))
    }
  }

  function connectHalves(replays, i) {
    const firstMatchId = replays.matches[i][0].MatchId;
    const firstTeamId = replays.teams[i][0].TeamId;
    const teamIds = [firstTeamId, firstTeamId + 1, firstTeamId + 2, firstTeamId + 3]
    for (let goal of replays.goals[i]) {
      goal.MatchId = firstMatchId;
    }
    replays.matches[i][0].RedScore += replays.matches[i][1].BlueScore;
    replays.matches[i][0].BlueScore += replays.matches[i][1].RedScore;
    replays.matches[i].splice(1, 1);
    var tempPlayers = [];
    for (let player of replays.players[i]) {
      if (!tempPlayers.includes(player.Nick)) {
        if (player.TeamId === teamIds[2]) player.TeamId = teamIds[1];
        if (player.TeamId === teamIds[3]) player.TeamId = teamIds[0];
      }
      tempPlayers.push(player.Nick)
    }
  }

  function checkParams() {
    const params = window.location.toLocaleString().split('?replayId=');
    if (params.length > 1) {
      const toSend = {
        header: 'select',
        id: params[1]
      }
      sendMessage(JSON.stringify(toSend))
      $(function () {

        $('.roomlist-view').animate({
          left: '-150%',
        }, { duration: 700, easing: 'swing', queue: false });

        $('#downloading-screen').animate({
          left: '8vw',
        }, { duration: 700, easing: 'swing', queue: false });

      })
    }
  }

  function showReplays(ev) {
    // console.log('showreplays');
    if (connectionStatus === 'Open') {
      if (ev.target.textContent === 'Most viewed replays') {
        var replaysType = 'mostViewed'
      } else {
        var replaysType = 'latest'
      }

      dispatch(setReplaysType(replaysType))

      const toSend = {
        header: 'top10',
        period: 'week',
        replaysType: replaysType
      }
      sendMessage(JSON.stringify(toSend))
    } else if (connectionStatus === 'Connecting') {
      openModal('Connecting to server... Please try again after few seconds.', 'darkgoldenrod', 4)
    } else {
      openModal('Error: Can\'t connect to server. Try again later.', 'darkred', 4)
    }
  }

  async function getIP() {
    const response = await fetch('https://ipapi.co/json/')
    const data = await response.json();
    setIP(data.ip)
  }

  function showStatsExp(elStyle) {
    const { offsetLeft, offsetTop, clientWidth, clientHeight } = elStyle;
    const offsetParentTop = elStyle.offsetParent ? elStyle.offsetParent.offsetTop : 0;
    dispatch(setDivStyle({ offsetLeft, offsetTop, offsetParentTop, clientWidth, clientHeight }));
    dispatch(setMainMode('stats'));
  }

  function setGameStatsExp(stats) {
    dispatch(setStats(stats));
    // Guarda en el historial los datos del partido para mostrarlos en la tarjeta
    try { setReplayInfo(window.__fenixCurrentId, summarizeMatch(stats)); } catch (e) { }
    // Centro de análisis: guarda las estadísticas del partido (tolerante a errores, no afecta a la reproducción)
    ingestFromEngine(stats);
    if (userDidUpload) {
      var message = [];
      for (var i = 0; i < stats.length; i++) {
        const match = stats[i];
        dispatch(setRedTeamName({ mtc: i, name: 'ROJO' }))
        dispatch(setBlueTeamName({ mtc: i, name: 'AZUL' }))
        message.push({
          blueTeam: match.blueTeam,
          goals: match.goals,
          redTeam: match.redTeam,
          scoreBlue: match.scoreBlue,
          scoreRed: match.scoreRed,
          spaceMode: match.spaceMode,
          realSoccerMode: match.realSoccerMode,
          stadiumName: match.stadium.name
        })
      }
      const toSend = {
        header: 'setStats',
        stats: message,
        replayId: replayIdToSend,
        replayName: replayName,
        lastModified: replayLastModified,
        IP: IP
      }
      queryMessage = toSend;
      waitingForStats = false;
      if (!waitingForSocket) {
        sendMessage(JSON.stringify(queryMessage))
      }
    }
  }

  function setPlayerListExp(el) {
    dispatch(setPlayerList(el));
  }

  function setPlayerPosExp(el) {
    dispatch(setPlayerPos(el));
  }

  function dispatchClearStatsExp() {
    dispatch(clearStats());
  }

  changeTeamNames = function (names, matchId) {
    const toSend = {
      header: 'changeTeamNames',
      names: names,
      matchId: matchId,
      replayId: replayId
    }
    sendMessage(JSON.stringify(toSend))
  }

  loadMoreReplays = function (a) {
    const toSend = {
      header: 'next10 filtered',
      replaysType: replaysType,
      searchText: searchText,
      filterPlayer: filterPlayer,
      filterGoal: filterGoal,
      filterRealSoccer: filterRealSoccer,
      filterReplay: filterReplay,
      filterSpaceMode: filterSpaceMode,
      filterStadium: filterStadium,
      filterTeam: filterTeam,
      period: periodState,
      alreadyLoaded: replaysQty,
      startDate: startDate,
      endDate: endDate
    }
    sendMessage(JSON.stringify(toSend))
  }

  sendMessageExp = function (m) {
    sendMessage(JSON.stringify(m))
  }

  sendSocketMessage = function (m, n, o) {
    setReplayName(n);
    if (m.byteLength > 50_000) {
      var replayParts = [];
      var x = new Uint8Array(m);
      x = Array.from(x)
      do {
        replayParts.push(x.splice(0, 50_000))
      } while (x.length > 50_000)
      replayParts.push(x);
      for (let part of replayParts) {
        const buffer = new ArrayBuffer(part.length);
        const uint8View = new Uint8Array(buffer);
        for (let i = 0; i < part.length; i++) {
          uint8View[i] = part[i]; // zapisywanie danych z tablicy do bufora ArrayBuffer
        }
        const newBuffer = uint8View.buffer;
        sendMessage(newBuffer)
      }
    } else {
      sendMessage(m)
    }
    const toSend = {
      header: 'replaySent'
    }
    sendMessage(JSON.stringify(toSend))
    setLastModified(o);
  }

  search4Replays = function (toSend) {
    dispatch(setReplaysLoaded(false));
    sendMessage(JSON.stringify(toSend))
  }

  showStats = showStatsExp;
  setGameStats = setGameStatsExp;
  dispatchPlayerList = setPlayerListExp;
  dispatchPlayerPos = setPlayerPosExp;
  dispatchClearStats = dispatchClearStatsExp;
  checkParamsExp = function () {
    checkParams();
  }

  async function openSaved(id) {
    const data = await getReplayData(id);
    if (!data) return;
    window.__fenixCurrentId = id;
    dispatch(setUserUploaded(true));
    dispatch(setConnectHalves(false))
    dispatch(setConnectedHalves(false))
    setReplayId(null);
    waitingForSocket = true;
    waitingForStats = true;
    fenixEnter(function () { replayFromSite(data) });
  }

  function callbackFn(e) {
    handleFile(e);
  }

  function nativeCap() {
    const cap = window.Capacitor;
    return cap && cap.isNativePlatform && cap.isNativePlatform() && cap.nativePromise ? cap : null;
  }

  // Explorador del sistema (muestra todos los archivos; solo se pueden elegir los binarios)
  async function systemPick() {
    const cap = nativeCap();
    if (!cap) { const inp = document.getElementById('replayfile'); if (inp) inp.click(); return; }
    try {
      const r = await cap.nativePromise('HbrScanner', 'pick', {});
      deliver(r.name, r.data, Date.now());
    } catch (err) {
      if (!/cancel/i.test(String(err && (err.message || err)))) {
        const inp = document.getElementById('replayfile'); if (inp) inp.click();
      }
    }
  }

  function deliver(name, b64, modified) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    const file = new File([bytes], name || 'repeticion.hbr2', { lastModified: modified || Date.now() });
    handleChange({ target: { files: [file], value: null } });
  }

  // En el celular: lista propia con SOLO los archivos .hbr2 (necesita "Acceso a todos los archivos")
  async function openImport() {
    const cap = nativeCap();
    if (!cap) { const inp = document.getElementById('replayfile'); if (inp) inp.click(); return; }
    try {
      const a = await cap.nativePromise('HbrScanner', 'hasAccess', {});
      if (a.granted) { showHbrList(); return; }
      if (a.api >= 30) { setHbr({ mode: 'perm' }); return; }
    } catch (e) { }
    systemPick();
  }

  async function showHbrList() {
    const cap = nativeCap();
    setHbr({ mode: 'loading' });
    try {
      const r = await cap.nativePromise('HbrScanner', 'list', {});
      setHbr({ mode: 'list', files: r.files || [] });
    } catch (e) { setHbr(null); systemPick(); }
  }

  async function saveSelected() {
    const cap = nativeCap();
    const chosen = hbr.files.filter((f) => hbr.sel && hbr.sel.includes(f.path));
    setHbr(null);
    if (!chosen.length) return;
    const files = [];
    for (const f of chosen) {
      try {
        const r = await cap.nativePromise('HbrScanner', 'readFile', { path: f.path });
        const bin = atob(r.data);
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
        files.push(new File([bytes], r.name || f.name, { lastModified: f.modified || Date.now() }));
      } catch (err) { }
    }
    if (!files.length) { openModal('No se pudieron leer los archivos', 'darkred', 4); return; }
    await importMany(files);
  }

  function toggleSel(f) {
    setHbr((h) => {
      const sel = h.sel || [];
      return { ...h, sel: sel.includes(f.path) ? sel.filter((x) => x !== f.path) : [...sel, f.path] };
    });
  }

  async function pickPath(f) {
    const cap = nativeCap();
    setHbr(null);
    try {
      const r = await cap.nativePromise('HbrScanner', 'readFile', { path: f.path });
      deliver(r.name || f.name, r.data, f.modified);
    } catch (e) { openModal('No se pudo leer el archivo', 'darkred', 4); }
  }

  async function askAccess() {
    const cap = nativeCap();
    try { await cap.nativePromise('HbrScanner', 'requestAccess', {}); } catch (e) { }
  }

  const [hbr, setHbr] = useState(null);
  useEffect(() => {
    if (!hbr || hbr.mode !== 'perm') return undefined;
    const check = async () => {
      const cap = nativeCap();
      try { const a = await cap.nativePromise('HbrScanner', 'hasAccess', {}); if (a.granted) showHbrList(); } catch (e) { }
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hbr]);

  function fmtSz(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1024 / 1024).toFixed(1) + ' MB'; }
  function fmtDt(t) { try { return new Date(t).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

  const [showSettings, setShowSettings] = useState(false);
  const [histTab, setHistTab] = useState('all');

  // Las animaciones de entrada del inicio solo se ven al abrir la app, no al abrir/cerrar paneles
  useEffect(() => { const t = setTimeout(() => document.body.classList.add('fenix-booted'), 1500); return () => clearTimeout(t); }, []);
  // Atajos de escritorio (solo con ratón/teclado): Esc cierra ventanas del inicio, Ctrl+O importa, Ctrl+F o "/" busca
  useEffect(() => {
    const fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!fine) return undefined;
    const onKey = (ev) => {
      const tag = ev.target && ev.target.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      const home = document.querySelector('.fenix-home');
      const hr = home ? home.getBoundingClientRect() : null;
      const homeVisible = !!hr && hr.left > -50 && hr.left < window.innerWidth / 2;
      if (ev.key === 'Escape') {
        if (document.querySelector('.fs-overlay, .fh-rename-overlay, .fh-hbr-overlay') && window.__fenixBack) { ev.preventDefault(); window.__fenixBack(); }
        return;
      }
      if (!homeVisible || document.querySelector('.fs-overlay, .fh-rename-overlay, .fh-hbr-overlay, .fenix-exit-overlay, .tx-root, .sc-root')) return;
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'o' || ev.key === 'O')) {
        ev.preventDefault();
        const l = document.querySelector('.fh-import label');
        if (l) l.click();
      } else if (((ev.ctrlKey || ev.metaKey) && (ev.key === 'f' || ev.key === 'F')) || (ev.key === '/' && !typing)) {
        const i = document.querySelector('.fh-search');
        if (i) { ev.preventDefault(); i.focus(); i.select(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // A3: varias repeticiones a la vez: se guardan en el historial sin abrir ninguna
  async function importMany(list) {
    const valid = list.filter((f) => /\.hbr2$/i.test(f.name));
    if (!valid.length) { openModal('Ningún archivo tiene formato .hbr2', 'darkred', 4); return; }
    const r = await saveReplayFiles(valid);
    setHistoryTick((t) => t + 1);
    const skipped = list.length - valid.length;
    const dup = valid.length - r.added - r.failed;
    let msg = r.added + (r.added === 1 ? ' repetición guardada' : ' repeticiones guardadas');
    if (dup > 0) msg += ' · ' + dup + (dup === 1 ? ' ya estaba' : ' ya estaban');
    if (skipped > 0) msg += ' · ' + skipped + ' no eran .hbr2';
    if (r.failed > 0) msg += ' · ' + r.failed + ' fallaron';
    openModal(msg + '. Ábrelas para ver el marcador.', r.failed ? 'darkgoldenrod' : 'darkgreen', 5);
  }

  function handleChange(e) {
    const all = e.target.files ? Array.from(e.target.files) : [];
    if (all.length > 1) {
      importMany(all);
      try { e.target.value = null; } catch (x) { }
      return;
    }
    const picked = all[0];
    if (picked && !/\.hbr2$/i.test(picked.name)) {
      openModal('El archivo debe tener formato .hbr2', 'darkred', 4);
      e.target.value = null;
      return;
    }
    if (picked) {
      saveReplayFile(picked)
        .then((id) => { setHistoryTick((t) => t + 1); if (id) openSaved(id); else legacyOpen(e); })
        .catch(() => legacyOpen(e));
      return;
    }
    legacyOpen(e);
  }

  function legacyOpen(e) {
    window.__fenixCurrentId = null;
    dispatch(setUserUploaded(true));
    dispatch(setConnectHalves(false))
    dispatch(setConnectedHalves(false))
    setReplayId(null);
    waitingForSocket = true;
    waitingForStats = true;

    fenixEnter(function () { callbackFn(e) });

  }


  useEffect(() => {
    // La reproducción local no requiere consultar la IP del usuario.
  }, []);

  return (
    <>
      <div className='roomlist-view fenix-home' style={{ zIndex: 5 }}>
        <img className='fh-watermark' src={process.env.PUBLIC_URL + '/brand/escudo.png'} alt='' aria-hidden='true' />
        <button className='fh-gear' aria-label='Configuración' onClick={() => setShowSettings(true)}>
          <svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><circle cx='12' cy='12' r='3' /><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' /></svg>
        </button>
        <button className='fh-gear fh-exit' aria-label='Salir de la app' onClick={() => { if (window.__fenixAskExit) window.__fenixAskExit(); }}>
          <svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'><path d='M12 3v9' /><path d='M6.4 6.6a8 8 0 1 0 11.2 0' /></svg>
        </button>
        <div className='fh-scroll'>
          <div className='fh-hero'>
            <img className='fh-logo' src={process.env.PUBLIC_URL + '/brand/escudo-nombre.png'} alt='Associação Esportiva Fênix' />
            <h1>PRO TACTICAL ANALYZER AEF</h1>
            <p className='fh-tag'>Os Fênix</p>
            <div className='file-btn fh-import'>
              <label htmlFor='replayfile'>
                <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' strokeLinejoin='round'><path d='M12 16V4M7 9l5-5 5 5M4 20h16' /></svg>
                <span>Importar repetición</span>
              </label>
              <input id='replayfile' type='file' accept='.hbr2,application/octet-stream' multiple data-hook='replayfile' onClick={(e) => { e.target.value = null; }} onChange={handleChange} />
            </div>
            <button type='button' className='fh-scout' onClick={() => setShowScouting(true)}>
              <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><path d='M4 20V10M10 20V4M16 20v-7M22 20H2' /></svg>
              <span>Centro de análisis</span>
            </button>
            <button type='button' className='fh-tactics' onClick={() => setShowTactics(true)}>
              <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><rect x='3' y='5' width='18' height='14' rx='2' /><path d='M12 5v14' /><circle cx='12' cy='12' r='2.6' /></svg>
              <span>Pizarra táctica</span>
            </button>
          </div>
          <section className='fh-history'>
            <div className='fh-tabs' role='tablist'>
              <button role='tab' aria-selected={histTab === 'all'} className={histTab === 'all' ? 'on' : ''} onClick={() => setHistTab('all')}><svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='9' /><path d='M12 7v5l3.2 2' /></svg><span>Historial</span></button>
              <button role='tab' aria-selected={histTab === 'fav'} className={histTab === 'fav' ? 'on' : ''} onClick={() => setHistTab('fav')}><svg width='18' height='18' viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'><path d='M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2 6.6 20.1l1-6.1L3.2 9.7l6.1-.9z' /></svg><span>Favoritos</span></button>
            </div>
            <HistoryList key={histTab} filter={histTab} refreshKey={historyTick} onOpen={openSaved} />
          </section>
        </div>
      </div>
      {hbr && createPortal(
        <div className='fh-hbr-overlay' onClick={() => setHbr(null)}>
          <div className='fh-hbr-sheet' onClick={(e) => e.stopPropagation()}>
            <div className='fh-hbr-head'>
              <h3>{hbr.mode === 'perm' ? 'Permiso necesario' : 'Repeticiones .hbr2'}</h3>
              <button type='button' className='fs-close' onClick={() => setHbr(null)} aria-label='Cerrar'>✕</button>
            </div>
            {hbr.mode === 'perm' && (
              <div className='fh-hbr-body'>
                <p>Para mostrar <b>solo tus archivos .hbr2</b> la app necesita el permiso «Acceso a todos los archivos». Actívalo y vuelve a la app.</p>
                <button type='button' className='fh-hbr-main' onClick={askAccess}>Dar permiso</button>
                <button type='button' className='fh-hbr-alt' onClick={() => { setHbr(null); systemPick(); }}>Usar el explorador de archivos</button>
              </div>
            )}
            {hbr.mode === 'loading' && <div className='fh-hbr-body'><p>Buscando archivos .hbr2…</p></div>}
            {hbr.mode === 'list' && (
              <>
                <div className='fh-hbr-list'>
                  {hbr.files.length === 0 && <p className='fh-hbr-none'>No se encontraron archivos .hbr2 en tu celular.</p>}
                  {hbr.files.map((f) => {
                    const on = !!(hbr.sel && hbr.sel.includes(f.path));
                    return (
                      <button type='button' key={f.path} className={'fh-hbr-item' + (hbr.multi ? ' multi' : '') + (on ? ' on' : '')} aria-pressed={hbr.multi ? on : undefined} onClick={() => (hbr.multi ? toggleSel(f) : pickPath(f))}>
                        {hbr.multi && <span className='fh-hbr-check' aria-hidden='true'>{on ? '✓' : ''}</span>}
                        <span className='fh-hbr-text'>
                          <span className='fh-hbr-name'>{f.name}</span>
                          <span className='fh-hbr-sub'>{fmtDt(f.modified)} · {fmtSz(f.size)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className='fh-hbr-foot'>
                  {hbr.multi ? (
                    <>
                      <button type='button' className='fh-hbr-alt' onClick={() => setHbr({ ...hbr, multi: false, sel: [] })}>Cancelar</button>
                      <button type='button' className='fh-hbr-main fh-hbr-save' disabled={!(hbr.sel && hbr.sel.length)} onClick={saveSelected}>Guardar{hbr.sel && hbr.sel.length ? ' (' + hbr.sel.length + ')' : ''}</button>
                    </>
                  ) : (
                    <>
                      <button type='button' className='fh-hbr-alt' onClick={showHbrList}>Actualizar</button>
                      {hbr.files.length > 1 && <button type='button' className='fh-hbr-alt' onClick={() => setHbr({ ...hbr, multi: true, sel: [] })}>Elegir varias</button>}
                      <button type='button' className='fh-hbr-alt' onClick={() => { setHbr(null); systemPick(); }}>Explorador</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} onCleared={() => setHistoryTick((t) => t + 1)} />}
      <ReplayFav />
      <Downloading />
      <LoadingScreen />
      {mainMode === 'stats' && <GameStats replayId={replayId} />}
      {mainMode === 'replays' && <ReplaysList />}
      {showScouting && <ScoutingApp onClose={() => setShowScouting(false)} openReplay={openSaved} />}
      {showTactics && <TacticsBoard onClose={() => setShowTactics(false)} playerProvider={scoutingPlayers} />}
    </>
  );
}

export default Home;