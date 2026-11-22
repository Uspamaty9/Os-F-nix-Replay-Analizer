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
  pop.innerHTML = '<button type="button" class="rb-pop-it" role="switch"><span class="ic"></span><span class="tx"><b>Sombras de tiro</b><small>El balón es un foco y cada jugador tapa la luz: lo oscuro es adonde no se puede tirar en línea recta.</small></span><i class="sw"></i></button><div class="rb-pop-row"><span class="tx"><b>Quién proyecta sombra</b><small class="who">Todos los jugadores</small></span><button type="button" class="rb-pop-btn" data-act="pick">Elegir</button><button type="button" class="rb-pop-btn ghost" data-act="all" hidden>Todos</button></div>';
  const item = pop.querySelector('.rb-pop-it'); pop.querySelector('.ic').innerHTML = iconSvg('shadow', 22);
  const who = pop.querySelector('.who'), bPick = pop.querySelector('[data-act=pick]'), bAll = pop.querySelector('[data-act=all]');
  const chosen = new Set(); let picking = false;
  const bar = document.createElement('section'); bar.className = 'rb-pickbar'; bar.hidden = true;
  bar.innerHTML = '<span>Toca los jugadores que proyectan sombra</span><button type="button">Listo</button>'; host.appendChild(bar);
  const stop = (e) => e.stopPropagation();
  [btn, pop].forEach((el) => { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); });
  const syncWho = () => { who.textContent = chosen.size ? chosen.size + (chosen.size > 1 ? ' jugadores elegidos' : ' jugador elegido') : 'Todos los jugadores'; bAll.hidden = !chosen.size; };
  const sync = () => { item.classList.toggle('on', on); item.setAttribute('aria-checked', String(on)); btn.classList.toggle('active', on); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); });
  item.addEventListener('click', (e) => { e.stopPropagation(); on = !on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (x) { /* nada */ } sync(); wake(); pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); });
  const closePop = () => { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) closePop(); }, true);
  host.appendChild(btn); host.appendChild(pop); sync(); syncWho();
  [bar].forEach((el) => { el.addEventListener('pointerdown', stop); el.addEventListener('touchstart', stop, { passive: true }); });
  const setPicking = (v) => { picking = v; bar.hidden = !v; canvas.style.cursor = v ? 'pointer' : ''; };
  bPick.addEventListener('click', (e) => { e.stopPropagation(); on = true; try { localStorage.setItem(KEY, '1'); } catch (x) { /* nada */ } sync(); setPicking(true); closePop(); wake(); });
  bAll.addEventListener('click', (e) => { e.stopPropagation(); chosen.clear(); syncWho(); });
  bar.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); setPicking(false); });
  const hitLive = (ev) => {
    const r = canvas.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, t = makeT(canvas, W || r.width, H || r.height);
    if (!t.ok || !Array.isArray(window.__fenixLive)) return null;
    let best = null, bd = 1e9;
    for (const l of window.__fenixLive) { if (!l || !(l.r > 0)) continue; const d = Math.hypot(px - t.sx(l.x), py - t.sy(l.y)); if (d <= Math.max(18, l.r * t.s + 8) && d < bd) { bd = d; best = l; } }
    return best;
  };
  // en modo «elegir», los toques sobre la cancha eligen jugadores y no mueven la vista del motor
  const eat = (ev) => { if (!picking) return; ev.stopImmediatePropagation(); if (ev.cancelable) ev.preventDefault(); };
  ['pointerup', 'pointermove', 'pointercancel', 'mousedown', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'wheel'].forEach((n) => canvas.addEventListener(n, eat, true));
  canvas.addEventListener('pointerdown', (ev) => {
    if (!picking) return; eat(ev);
    const l = hitLive(ev); if (l) { if (chosen.has(l.id)) chosen.delete(l.id); else chosen.add(l.id); syncWho(); }
  }, true);

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
        const all = live.filter((p) => p && p.r > 0), sel = chosen.size ? all.filter((p) => chosen.has(p.id)) : [];
        const circles = (sel.length ? sel : all).map((p) => ({ x: p.x, y: p.y, r: p.r }));
        paintShadows(ctx, { sx: t.sx, sy: t.sy, k: t.s }, ball, circles, { reach: 4000, glow: 60 });
        if (picking || sel.length) { // aros: dorado = proyecta sombra; blanco tenue = se puede elegir
          ctx.save(); ctx.lineWidth = 2.5;
          for (const p of all) { const on1 = chosen.has(p.id); if (!picking && !on1) continue; ctx.strokeStyle = on1 ? 'rgba(255, 214, 90, 0.95)' : 'rgba(255, 255, 255, 0.35)'; ctx.setLineDash(on1 ? [5, 4] : []); ctx.beginPath(); ctx.arc(t.sx(p.x), t.sy(p.y), p.r * t.s + 6, 0, Math.PI * 2); ctx.stroke(); }
          ctx.restore();
        }
        // El cartel de gol lo dibuja el motor dentro de la cancha (centro). El parche game2-cartel-gol.patch publica window.__fenixCard
        // en cada fotograma en que lo dibuja: se vuelve a pegar su placa y su pastilla por ENCIMA de la sombra, con su escala y opacidad reales.
        const cd = window.__fenixCard;
        if (cd && performance.now() - cd.t < 120 && cd.al > 0.01) {
          const f = W / (canvas.width || W), s = 0.5 * cd.sc * f, iw = cd.w * s, ih = cd.h * s, ix = W / 2 - iw / 2, iy = H / 2 - ih / 2 + cd.dy * f;
          const tag = document.querySelector('.fenix-goal-toast .gt-tag'), own = !!tag && /AUTOGOL/i.test(tag.textContent);
          ctx.save(); ctx.font = '900 24px Poppins, "Arial Black", Arial, sans-serif'; if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
          const tw = (ctx.measureText(own ? 'AUTOGOL' : 'GOL').width + 56) * s; ctx.restore();
          const rr = (x, y, w, h, r) => { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
          ctx.save(); ctx.beginPath();
          rr(ix + 14 * s, iy + 26 * s, iw - 28 * s, ih - 40 * s, 28 * s);   // placa
          rr(W / 2 - tw / 2, iy + 4 * s, tw, 42 * s, 21 * s);               // pastilla GOL
          ctx.clip(); ctx.globalAlpha = Math.min(1, cd.al);
          ctx.drawImage(canvas, ix / f, iy / f, iw / f, ih / f, ix, iy, iw, ih); ctx.restore();
        }
      }
    }
    raf = requestAnimationFrame(loop);
  };
  function wake() { if (!raf && alive) raf = requestAnimationFrame(loop); layer.hidden = !on; }
  wake();
  const obs = new MutationObserver(() => { if (on && !raf) wake(); });
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  return { destroy() { alive = false; setPicking(false); cancelAnimationFrame(raf); obs.disconnect(); layer.remove(); btn.remove(); pop.remove(); } };
}
