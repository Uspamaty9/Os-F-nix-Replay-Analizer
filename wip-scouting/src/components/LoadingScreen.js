import { useState, useEffect } from 'react';

// Pantalla "Analizando…": escudo con anillo animado y un porcentaje real del análisis. Al terminar se entra directo a la repetición.
function LoadingScreen() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => { const v = Math.max(0, Math.min(100, Math.round(Number(window.__fenixLoadPct) || 0))); setPct((p) => (p === v ? p : v)); }, 120);
    return () => clearInterval(t);
  }, []);
  return (
    <div id='loading-screen' className='loading fenix-wait'>
      <div className='fw-crest'>
        <span className='fw-ring' aria-hidden='true' />
        <img src={process.env.PUBLIC_URL + '/brand/escudo.png'} alt='' />
      </div>
      <h1>Analizando…</h1>
      <div className='fw-meter' role='progressbar' aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className='fw-pct'>{pct}<small>%</small></div>
        <div className='fw-bar'><i style={{ width: pct + '%' }} /></div>
      </div>
    </div>
  );
}

export default LoadingScreen;
