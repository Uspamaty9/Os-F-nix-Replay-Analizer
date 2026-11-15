// Barra inferior: pasos de la jugada y reproducción (reproducir, pausar, reanudar, reiniciar, avanzar/retroceder, velocidad).
import React, { useState } from 'react';
import Icon from './icons';
import { TextField } from './panels';

export default function Timeline({ ctl, s, progress }) {
  const doc = s.doc, n = doc.frames.length;
  const state = s.play.state;
  const x = state === 'playing' ? progress : s.progress;
  const cur = Math.min(n - 1, Math.max(0, Math.round(state === 'stopped' ? s.fi : x)));
  const [ops, setOps] = useState(false);
  const secs = ((n - 1) * doc.stepMs) / 1000 / s.play.speed;
  return (
    <footer className='tx-bottom'>
      <div className='tx-transport'>
        <button type='button' className='tx-icon' onClick={() => ctl.restart()} title='Reiniciar (volver al inicio)' aria-label='Reiniciar'><Icon name='restart' /></button>
        <button type='button' className='tx-icon' onClick={() => ctl.stepBy(-1)} disabled={cur <= 0 && state === 'stopped'} title='Paso anterior ( , )' aria-label='Paso anterior'><Icon name='prev' /></button>
        <button type='button' className='tx-icon big' onClick={() => ctl.toggle()} title={state === 'playing' ? 'Pausar (P)' : state === 'paused' ? 'Reanudar (P)' : 'Reproducir (P)'} aria-label={state === 'playing' ? 'Pausar' : state === 'paused' ? 'Reanudar' : 'Reproducir'}>
          <Icon name={state === 'playing' ? 'pause' : 'play'} size={22} />
        </button>
        <button type='button' className='tx-icon' onClick={() => ctl.stepBy(1)} disabled={cur >= n - 1 && state === 'stopped'} title='Paso siguiente ( . )' aria-label='Paso siguiente'><Icon name='next' /></button>
        <button type='button' className='tx-speed' onClick={() => ctl.cycleSpeed()} title='Velocidad'>{s.play.speed}×</button>
        <button type='button' className={'tx-icon' + (s.play.loop ? ' on' : '')} onClick={() => ctl.setLoop(!s.play.loop)} aria-pressed={s.play.loop} title='Repetir' aria-label='Repetir'><Icon name='loop' /></button>
        <input className='tx-scrub' type='range' min={0} max={Math.max(1, n - 1)} step={0.01} value={x} disabled={n < 2} aria-label='Posición de la animación' onChange={(e) => ctl.seek(Number(e.target.value))} />
        <span className='tx-time'>{n > 1 ? secs.toFixed(1) + ' s' : '—'}</span>
      </div>
      <div className='tx-steps'>
        <div className='tx-chips' role='tablist' aria-label='Pasos de la jugada'>
          {doc.frames.map((f, i) => (
            <button type='button' role='tab' key={f.id} aria-selected={i === cur} className={'tx-step' + (i === cur ? ' on' : '')} onClick={() => ctl.setFrame(i)} title={f.name}>
              <i>{i + 1}</i><span>{f.name}</span>
            </button>
          ))}
          <button type='button' className='tx-step add' onClick={() => ctl.addFrame()} title='Crear un paso nuevo a partir del actual'><Icon name='plus' size={16} /><span>Paso</span></button>
          <button type='button' className={'tx-step opts show-sm' + (ops ? ' on' : '')} onClick={() => setOps(!ops)} aria-expanded={ops} title='Opciones del paso'><Icon name='more' size={16} /><span>Opciones</span></button>
        </div>
        {(
          <div className={'tx-stepops' + (ops ? ' open' : '')}>
            <div className='tx-stepname'><TextField value={doc.frames[cur] ? doc.frames[cur].name : ''} onChange={(v) => ctl.renameFrame(v)} maxLength={24} placeholder='Nombre del paso' /></div>
            <button type='button' className='tx-icon' onClick={() => ctl.moveFrame(-1)} disabled={cur <= 0} title='Mover paso a la izquierda' aria-label='Mover paso a la izquierda'><Icon name='back' /></button>
            <button type='button' className='tx-icon' onClick={() => ctl.moveFrame(1)} disabled={cur >= n - 1} title='Mover paso a la derecha' aria-label='Mover paso a la derecha'><Icon name='back' className='flip' /></button>
            <button type='button' className='tx-icon' onClick={() => ctl.removeFrame()} disabled={n < 2} title='Eliminar este paso' aria-label='Eliminar paso'><Icon name='trash' /></button>
            <label className='tx-dur' title='Tiempo entre un paso y el siguiente'>
              <span>{(doc.stepMs / 1000).toFixed(1)} s / paso</span>
              <input type='range' min={300} max={4000} step={100} value={doc.stepMs} onChange={(e) => ctl.setStepMs(Number(e.target.value))} />
            </label>
          </div>
        )}
        {n < 2 && <p className='tx-hint hide-sm'>Mueve las fichas y pulsa «+ Paso» para crear el siguiente momento de la jugada; luego dale a reproducir.</p>}
      </div>
    </footer>
  );
}
