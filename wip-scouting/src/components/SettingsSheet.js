import { useEffect, useState } from 'react';
import { backupExport, backupImport, toast } from '../extras';
import { listReplays, deleteReplay, hideReplay } from '../storage/history';

function fmt(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// Redes sociales de Os Fênix: cada red tiene sus cuentas (pon aquí cada enlace; si queda vacío el botón avisa que aún no está disponible)
const ACC_FENIX = 'Os Fênix', ACC_USP = 'Uspamaty9', ACC_GRAN = 'La Grandeza del Fútbol';
const SOCIALS = [
  { id: 'tiktok', name: 'TikTok', accounts: [
    { name: ACC_FENIX, url: 'https://www.tiktok.com/@os_fenix_haxball?_r=1&_t=ZS-9BIpTshAAAX' },
    { name: ACC_USP, url: 'https://www.tiktok.com/@maty_lara9?_r=1&_t=ZS-9BIph5dbbV3' },
    { name: ACC_GRAN, url: 'https://www.tiktok.com/@la_grandeza_del_futbol?_r=1&_t=ZS-9BIpjkMdMpw' }] },
  { id: 'youtube', name: 'YouTube', accounts: [
    { name: ACC_USP, url: 'https://youtube.com/@uspamaty9390?si=uwtRVMwNZCcwh_tJ' },
    { name: ACC_GRAN, url: 'https://youtube.com/@lagrandezadelfutbol?si=KuLW3pHH__eqHbZD' }] },
  { id: 'facebook', name: 'Facebook', accounts: [
    { name: ACC_USP, url: 'https://www.facebook.com/share/1Kbt5smtUB/' },
    { name: ACC_GRAN, url: 'https://www.facebook.com/share/1CD1WXUuSC/' }] },
  { id: 'discord', name: 'Discord', accounts: [
    { name: ACC_USP, url: '', user: 'uspamaty_9' },
    { name: 'Uspitas', url: 'https://discord.gg/nbaz9PyX8' }] },
];

export default function SettingsSheet({ onClose, onCleared }) {
  const [info, setInfo] = useState({ n: 0, size: 0 });
  const [confirm, setConfirm] = useState(false);
  const [soc, setSoc] = useState(false);
  const [socNet, setSocNet] = useState(null);
  const curNet = SOCIALS.find((n) => n.id === socNet);

  const refresh = () => listReplays().then((l) => setInfo({ n: l.filter((m) => !m.hidden).length, size: l.reduce((a, m) => a + (m.size || 0), 0) }));
  useEffect(() => { refresh(); }, []);

  async function clearAll() {
    const l = await listReplays();
    for (const m of l) { if (m.fav) await hideReplay(m.id); else await deleteReplay(m.id); }
    setConfirm(false); refresh(); if (onCleared) onCleared();
  }

  return (
    <div className='fs-overlay' onClick={() => { if (socNet) setSocNet(null); else if (soc) setSoc(false); else onClose(); }}>
      <div className='fs-sheet' onClick={(e) => e.stopPropagation()}>
        <div className='fs-head'>
          <h3>Configuración</h3>
          <button className='fs-close' onClick={onClose} aria-label='Cerrar'>✕</button>
        </div>
        <div className='fs-body'>
          <section>
            <h4>Respaldo</h4>
            <p className='fs-note'>Guarda todo tu historial y favoritos en un archivo, para pasarlo a otro celular o recuperarlo.</p>
            <div className='fs-btnrow'>
              <button type='button' className='fs-btn' onClick={backupExport}>Crear respaldo</button>
              <button type='button' className='fs-btn' onClick={async () => { await backupImport(); refresh(); if (onCleared) onCleared(); }}>Restaurar</button>
            </div>
          </section>
          <section>
            <h4>Acerca de</h4>
            <p className='fs-note'>Replay Analyzer · Os Fênix<br />Desarrolladores: Mathias Lara (Uspamaty9) y Claude<br />Versión 1.0 · funciona sin conexión.</p>
            <button type='button' className='fs-btn' onClick={() => setSoc(true)}>Redes sociales</button>
          </section>
          <section>
            <h4>Datos</h4>
            <p className='fs-note'>{info.n} repetición(es) guardada(s) · {fmt(info.size)}</p>
            {!confirm
              ? <button className='fs-btn danger' disabled={!info.n} onClick={() => setConfirm(true)}>Borrar historial</button>
              : <div className='fs-confirm'><span>¿Borrar el historial? Los favoritos se conservan.</span><button className='fs-btn danger' onClick={clearAll}>Sí, borrar</button><button className='fs-btn' onClick={() => setConfirm(false)}>No</button></div>}
          </section>
        </div>
        {soc && <div className='fs-sub'>
          <div className='fs-head'>
            <button type='button' className='fs-close fs-back' onClick={() => { if (socNet) setSocNet(null); else setSoc(false); }} aria-label='Volver'>‹</button>
            <h3>{curNet ? curNet.name : 'Redes sociales'}</h3>
            <button className='fs-close' onClick={() => { if (socNet) setSocNet(null); else setSoc(false); }} aria-label='Cerrar'>✕</button>
          </div>
          <div className='fs-body'>
            {!curNet && <>
              <p className='fs-note'>Síguenos y sé parte de la comunidad de Os Fênix.</p>
              <div className='fs-social'>
                {SOCIALS.map((n) => (
                  <button key={n.id} type='button' className={'fs-soc fs-soc-' + n.id} onClick={() => setSocNet(n.id)}>
                    <b>{n.name}</b>
                  </button>
                ))}
              </div>
            </>}
            {curNet && <>
              <p className='fs-note'>Elige la cuenta que quieres visitar en {curNet.name}.</p>
              <div className='fs-accs'>
                {curNet.accounts.map((a) => (
                  <button key={a.name} type='button' className='fs-acc' onClick={() => { if (a.url) { if (window.FenixNative && window.FenixNative.openExternal) window.FenixNative.openExternal(a.url); else window.open(a.url, '_blank', 'noopener'); } else if (a.user) { try { navigator.clipboard.writeText(a.user); } catch (e) { } toast('Usuario copiado: ' + a.user); } else toast('Enlace de ' + a.name + ' en ' + curNet.name + ' próximamente'); }}>
                    <b>{a.name}</b>
                    <span>{a.url ? 'Abrir enlace' : a.user ? 'Usuario: ' + a.user + ' · toca para copiar' : 'Enlace próximamente'}</span>
                  </button>
                ))}
              </div>
            </>}
          </div>
        </div>}
      </div>
    </div>
  );
}
