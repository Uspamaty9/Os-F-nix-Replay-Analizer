// Sombras de tiro SOBRE LA REPETICIÓN: el balón es un foco y cada jugador un objeto opaco.
// Capa transparente (no toca el motor): lee window.__fenixLive (jugadores), window.__fenixBall y la cámara window.__fenixView.
// Se activa desde el botón «Más» (⋮) de la vista de repetición.
import './replayBoard.scss';
import { iconSvg } from './icons';
import { makeT } from './replayBoard';
import { paintShadows } from './shadow';

const KEY = 'fenix-replay-shadow';
let on = false; try { on = localStorage.getItem(KEY) === '1'; } catch (e) { /* sin almacenamiento */ }

export function installReplayShadow(host, canvas) {
  const layer = document.createElement('div'); layer.className = 'rs-layer';
  const cv = document.createElement('canvas'); cv.className = 'rs-canvas'; layer.appendChild(cv); host.appendChild(layer);
  const ctx = cv.getContext('2d');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rb-more'; btn.setAttribute('aria-label', 'Más opciones'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = iconSvg('more', 24);
  const pop = document.createElement('div'); pop.className = 'rb-pop'; pop.hidden = true;
  pop.innerHTML = '<button type="button" class="rb-pop-it" role="switch"><span class="ic"></span><span class="tx"><b>Sombras de tiro</b><small>El balón es un foco y cada jugador tapa la luz: lo oscuro es adonde no se puede tirar en línea recta.</small></span><i class="sw"></i></button>';
  const item = pop.querySelector('.rb-pop-it'); pop.querySelector('.ic').innerHTML = iconSvg('shadow', 22);
  const stop = (e) => e.stopPropagation();
  [btn, pop].forEach((el) => { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); });
  const sync = () => { item.classList.toggle('on', on); item.setAttribute('aria-checked', String(on)); btn.classList.toggle('active', on); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); });
  item.addEventListener('click', (e) => { e.stopPropagation(); on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (x) { /* nada */ } sync(); wake(); pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  const closePop = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) closePop(); }, true);
  host.appendChild(btn); host.appendChild(pop); sync();

  let W = 0, H = 0, dpr = 1, raf = 0, alive = true;
  const place = () => {
    const cr = canvas.getBoundingClientRect(); if (!cr.width || !cr.height) return false;
    const hr = host.getBoundingClientRect();
    layer.style.left = (cr.left - hr.left) + 'px'; layer.style.top = (cr.top - hr.top) + 'px'; layer.style.width = cr.width + 'px'; layer.style.height = cr.height + 'px';
    const d = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(cr.width - W) > 0.5 || Math.abs(cr.height - H) > 0.5 || d !== dpr) { W = cr.width; H = cr.height; dpr = d; cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
    return true;
  };
  const loop = () => {
    if (!alive) return;
    if (!on || document.body.classList.contains('fenix-despejado')) { layer.hidden = true; raf = 0; return; }
    layer.hidden = false;
    if (place()) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const ball = window.__fenixBall, live = window.__fenixLive, t = makeT(canvas, W, H);
      if (t.ok && ball && live) {
        const circles = live.filter((p) => p && p.r > 0).map((p) => ({ x: p.x, y: p.y, r: p.r }));
        paintShadows(ctx, { sx: t.sx, sy: t.sy, k: t.s }, ball, circles, { reach: 4000, glow: 60 });
        // el cartel de gol lo dibuja el motor en el centro de la cancha (640×156/214 a la mitad de escala): se le abre un hueco para que no lo oscurezca la sombra
        if (document.querySelector('.fenix-goal-toast')) {
          const f = W / (canvas.width || W), hasAs = !!document.querySelector('.fenix-goal-toast .gt-assist');
          const cw = 320 * f * 1.06 + 8, ch = (hasAs ? 107 : 78) * f * 1.06 + 8, x = W / 2 - cw / 2, y = H / 2 - ch / 2, r = 16 * f + 4;
          ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.beginPath();
          ctx.moveTo(x + r, y); ctx.arcTo(x + cw, y, x + cw, y + ch, r); ctx.arcTo(x + cw, y + ch, x, y + ch, r); ctx.arcTo(x, y + ch, x, y, r); ctx.arcTo(x, y, x + cw, y, r); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  function wake() { if (!raf && alive) raf = requestAnimationFrame(loop); layer.hidden = !on; }
  wake();
  const obs = new MutationObserver(() => { if (on && !raf) wake(); });
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { destroy() { alive = false; cancelAnimationFrame(raf); obs.disconnect(); layer.remove(); btn.remove(); pop.remove(); } };
}
