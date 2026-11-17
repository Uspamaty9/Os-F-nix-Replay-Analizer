// Paneles contextuales de la pizarra. Reciben el controlador (ctl) y el snapshot (s); no guardan estado del documento.
import React, { useEffect, useState } from 'react';
import Icon from './icons';
import { PALETTE, TEAM_COLORS, CATEGORIES, ZONES, shapePts, resolvedPos } from './model';
import { FILLABLE, describe, ZONE_TOOLS } from './shapes';
import { PROV_LABEL, POSITIONS, NO_RATING, findRegistered } from './players';

// ---------- controles básicos ----------
export function TextField({ value, onChange, placeholder, multiline, maxLength = 80, id, label, inputMode, autoFocus }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  const props = {
    id, value: v, placeholder, maxLength, inputMode, autoFocus, autoComplete: 'off', spellCheck: false,
    onChange: (e) => { setV(e.target.value); onChange(e.target.value); }
  };
  return (
    <label className='tx-field'>
      {label && <span>{label}</span>}
      {multiline ? <textarea rows={3} {...props} maxLength={400} /> : <input type='text' {...props} />}
    </label>
  );
}

export function Swatches({ value, onChange }) {
  return (
    <div className='tx-swatches' role='group' aria-label='Color'>
      {PALETTE.map((c) => (
        <button type='button' key={c} className={'tx-sw' + (String(value).toLowerCase() === c.toLowerCase() ? ' on' : '')} style={{ background: c }} onClick={() => onChange(c)} aria-label={'Color ' + c} />
      ))}
      <label className='tx-sw custom' title='Color personalizado'>
        <input type='color' value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

export function Range({ label, value, min, max, step = 1, onChange, unit = '' }) {
  return (
    <label className='tx-range'>
      <span>{label}<b>{Math.round(value * 100) / 100}{unit}</b></span>
      <input type='range' min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ on, onClick, icon, children, title }) {
  return (
    <button type='button' className={'tx-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={onClick} title={title}>
      {icon && <Icon name={icon} size={16} />}<span>{children}</span>
    </button>
  );
}

function Btn({ icon, children, onClick, danger, disabled, title, primary }) {
  return (
    <button type='button' className={'tx-btn' + (danger ? ' danger' : '') + (primary ? ' primary' : '')} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon name={icon} size={16} />}<span>{children}</span>
    </button>
  );
}

function Section({ title, children }) {
  return (<section className='tx-sec'>{title && <h4>{title}</h4>}{children}</section>);
}

// ---------- panel de estilo (herramienta de dibujo activa) ----------
export function StylePanel({ ctl, s, st, title, fillable, zoneKind }) {
  return (
    <>
      <Section title={title}>
        {!zoneKind && <Swatches value={st.color} onChange={(c) => ctl.setStyle({ color: c })} />}
        <Range label='Grosor' value={st.width} min={1} max={14} onChange={(v) => ctl.setStyle({ width: v })} unit=' px' />
        <Range label='Transparencia' value={Math.round((1 - st.opacity) * 100)} min={0} max={90} step={5} onChange={(v) => ctl.setStyle({ opacity: 1 - v / 100 })} unit=' %' />
        <div className='tx-row'>
          {fillable && <Toggle on={st.fill} onClick={() => ctl.setStyle({ fill: !st.fill })} icon='square'>Relleno</Toggle>}
          {!zoneKind && <Toggle on={st.dashed} onClick={() => ctl.setStyle({ dashed: !st.dashed })} icon='dline'>Discontinua</Toggle>}
        </div>
      </Section>
    </>
  );
}

// ---------- panel de figura seleccionada ----------
export function ShapePanel({ ctl, s }) {
  const doc = s.doc, pos = resolvedPos(doc, s.fi);
  const shapes = doc.shapes.filter((x) => s.selShapes.includes(x.id));
  const sh = shapes[0]; if (!sh) return null;
  const one = shapes.length === 1;
  const closed = FILLABLE.has(sh.type);
  const st = { color: sh.color, width: sh.width, opacity: sh.opacity != null ? sh.opacity : 1, fill: !!sh.fill, dashed: !!sh.dashed };
  const nPl = s.selPlayers.filter((i) => i !== 'ball').length;
  const zone = sh.zone ? ZONES[sh.zone] : null;
  return (
    <>
      <Section title={one ? describe(sh) + (zone ? ' · ' + zone.label : '') : shapes.length + ' figuras'}>
        {sh.attach && <p className='tx-note'><Icon name='link' size={14} /> Vinculada a {sh.attach.length} jugadores: se actualiza cuando se mueven.</p>}
        <StylePanel ctl={ctl} s={s} st={st} fillable={closed && !sh.zone} zoneKind={false} />
        {one && <TextField label={sh.type === 'text' ? 'Texto' : 'Etiqueta'} value={sh.label} onChange={(v) => ctl.updateSelShapes({ label: v })} placeholder={sh.type === 'text' ? 'Escribe una nota…' : 'Opcional'} id='tx-shape-label' />}
      </Section>
      <Section title='Orientación y tamaño'>
        <div className='tx-row'>
          <Btn icon='rotate' onClick={() => ctl.rotateSelection(-15)} title='Girar a la izquierda'>−15°</Btn>
          <Btn icon='rotate' onClick={() => ctl.rotateSelection(15)} title='Girar a la derecha'>+15°</Btn>
          <Btn onClick={() => ctl.rotateSelection(90)} title='Girar 90°'>90°</Btn>
        </div>
        <div className='tx-row'>
          <Btn icon='minus' onClick={() => ctl.scaleSelection(0.9)}>Más pequeña</Btn>
          <Btn icon='plus' onClick={() => ctl.scaleSelection(1.1)}>Más grande</Btn>
        </div>
        {shapes.some((x) => x.attach) && <p className='tx-note'>Las figuras vinculadas cambian de forma moviendo a los jugadores.</p>}
      </Section>
      <Section title='Acciones'>
        <div className='tx-row'>
          {shapes.some((x) => x.attach) && <Btn icon='unlink' onClick={() => ctl.unlinkSelection()}>Desvincular</Btn>}
          {one && !sh.attach && nPl >= 2 && <Btn icon='link' onClick={() => ctl.relinkSelectionShape()}>Vincular a jugadores</Btn>}
          <Btn icon='copy' onClick={() => ctl.duplicateSelection()}>Duplicar</Btn>
          <Btn icon='trash' danger onClick={() => ctl.deleteSelection()}>Eliminar</Btn>
        </div>
      </Section>
    </>
  );
}

// ---------- varios jugadores seleccionados ----------
export function MultiPanel({ ctl, s }) {
  const ids = s.selPlayers.filter((i) => i !== 'ball');
  const n = ids.length;
  const kinds = n === 2 ? [['link', 'Conexión', 'link']] : n === 3 ? [['tri', 'Triángulo', 'polygon']] : n === 4 ? [['quad', 'Estructura (4 vértices)', 'polygon']] : n >= 5 ? [['poly', 'Polígono', 'polygon']] : [];
  return (
    <>
      <Section title={n + ' jugadores seleccionados'}>
        <p className='tx-note'>{n === 2 ? 'Crea una conexión entre los dos jugadores.' : n === 3 ? 'Genera un triángulo entre sus posiciones.' : n === 4 ? 'Crea una estructura que une los cuatro.' : n >= 5 ? 'Une todos con un polígono.' : ''}</p>
        <div className='tx-row'>
          {kinds.map(([k, label, icon]) => <Btn key={k} icon={icon} primary onClick={() => ctl.linkSelection(k)}>{label}</Btn>)}
        </div>
        <p className='tx-note small'>Las figuras vinculadas se actualizan cuando los jugadores se mueven.</p>
      </Section>
      <Section title='Equipo'>
        <div className='tx-row'>
          {['red', 'blue', 'neutral'].map((t) => (
            <button type='button' key={t} className='tx-team' style={{ '--c': TEAM_COLORS[t] }} onClick={() => ctl.updateSelPlayers({ team: t, color: TEAM_COLORS[t] })}>{t === 'red' ? 'Rojo' : t === 'blue' ? 'Azul' : 'Neutral'}</button>
          ))}
        </div>
        <Swatches value='' onChange={(c) => ctl.updateSelPlayers({ color: c })} />
      </Section>
      <Section title='Formación'>
        <div className='tx-row'>
          <Btn icon='rotate' onClick={() => ctl.rotateSelection(-15)}>−15°</Btn>
          <Btn icon='rotate' onClick={() => ctl.rotateSelection(15)}>+15°</Btn>
          <Btn icon='minus' onClick={() => ctl.scaleSelection(0.9)}>Juntar</Btn>
          <Btn icon='plus' onClick={() => ctl.scaleSelection(1.1)}>Separar</Btn>
        </div>
      </Section>
      <Section>
        <div className='tx-row'>
          <Btn icon='copy' onClick={() => ctl.duplicateSelection()}>Duplicar</Btn>
          <Btn icon='trash' danger onClick={() => ctl.deleteSelection()}>Eliminar</Btn>
        </div>
      </Section>
    </>
  );
}

const ROLES = [''].concat(POSITIONS);

function Prov({ p }) { return p ? <i className={'tx-prov ' + p} title={PROV_LABEL[p]}>{p}</i> : null; }

// ---------- una ficha seleccionada ----------
export function PlayerPanel({ ctl, s, registry, onSaveRoster, onNotes }) {
  const doc = s.doc, id = s.selPlayers.find((i) => i !== 'ball');
  const p = doc.players.find((x) => x.id === id);
  if (!p) return null;
  const pos = resolvedPos(doc, s.fi)[id];
  const reg = p.regKey ? registry.find((r) => r.key === p.regKey) : null;
  const stats = reg && reg.stats && reg.stats.length ? reg.stats : null;
  const nPl = s.selPlayers.filter((i) => i !== 'ball').length;
  const linkedShapes = doc.shapes.filter((x) => x.attach && x.attach.includes(id));
  const pick = (nick) => {
    const r = findRegistered(registry, nick);
    if (r) ctl.updatePlayer(id, { nick: r.nick, regKey: r.key, team: r.team || p.team, color: r.team ? TEAM_COLORS[r.team] : p.color, role: p.role || r.position || '' });
    else ctl.updatePlayer(id, { nick, regKey: null });
  };
  return (
    <>
      <Section title='Jugador'>
        <label className='tx-field'>
          <span>Nickname</span>
          <NickInput value={p.nick} onCommit={pick} list='tx-reg-list' />
          <datalist id='tx-reg-list'>{registry.map((r) => <option key={r.key} value={r.nick} />)}</datalist>
        </label>
        <div className='tx-grid2'>
          <TextField label='Dorsal' value={String(p.num == null ? '' : p.num)} onChange={(v) => ctl.updatePlayer(id, { num: v.replace(/[^0-9]/g, '').slice(0, 3) })} inputMode='numeric' maxLength={3} />
          <label className='tx-field'>
            <span>Posición</span>
            <select value={p.role || ''} onChange={(e) => ctl.updatePlayer(id, { role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r || '—'}</option>)}
            </select>
          </label>
        </div>
        {pos && <p className='tx-note small'>Coordenadas en este paso: {Math.round(pos.x)}, {Math.round(pos.y)}</p>}
      </Section>
      <Section title='Equipo y color'>
        <div className='tx-row'>
          {['red', 'blue', 'neutral'].map((t) => (
            <button type='button' key={t} className={'tx-team' + (p.team === t ? ' on' : '')} style={{ '--c': TEAM_COLORS[t] }} onClick={() => ctl.updatePlayer(id, { team: t, color: TEAM_COLORS[t] })}>{t === 'red' ? 'Rojo' : t === 'blue' ? 'Azul' : 'Neutral'}</button>
          ))}
        </div>
        <Swatches value={p.color} onChange={(c) => ctl.updatePlayer(id, { color: c })} />
      </Section>
      <Section title='Información del jugador'>
        {reg ? (
          <div className='tx-reg'>
            <div className='tx-reg-head'>
              {reg.avatar ? <img className='tx-avatar' src={reg.avatar} alt='' /> : <Icon name='user' size={18} />}
              <b>{reg.nick}</b>{reg.nation && <span className='tx-nation'>{String(reg.nation).toUpperCase()}</span>}
              <span className='tx-badge'>{reg.external ? 'Centro de análisis' : reg.live ? 'En el analizador' : 'Plantel guardado'}</span>
            </div>
            {(reg.teamName || reg.position) && <p className='tx-note'>{[reg.teamName, reg.position].filter(Boolean).join(' · ')}</p>}
            {reg.rating ? (
              <div className='tx-rating'>
                <span>Calificación media<Prov p={reg.rating.prov} /></span>
                <div className='tx-bar'><i style={{ width: Math.max(0, Math.min(100, reg.rating.value * 10)) + '%' }} /></div>
                <b>{Number(reg.rating.value).toFixed(1)}</b>
              </div>
            ) : <p className='tx-note small'>{NO_RATING}</p>}
            {reg.rating && <p className='tx-note small'>Media de {reg.rating.n} {reg.rating.n === 1 ? 'partido' : 'partidos'}.</p>}
            {stats ? (
              <>
                <dl className='tx-stats'>{stats.map((x) => (<div key={x.id}><dt>{x.label}<Prov p={x.prov} /></dt><dd>{x.value == null ? '—' : x.value}</dd></div>))}</dl>
                <p className='tx-note small'>E = extraído del motor · C = calculado · M = manual. {reg.external ? 'Mismas cifras que el Centro de análisis.' : 'Solo de las repeticiones cargadas.'}</p>
              </>
            ) : <p className='tx-note'>Aún no hay estadísticas de este jugador. Abre una repetición donde juegue.</p>}
            <TextField label='Notas' multiline value={reg.info || ''} onChange={(v) => onNotes(reg, v)} placeholder='Rol, hábitos, fortalezas…' />
          </div>
        ) : (
          <>
            <p className='tx-note'>Ficha sin asociar. Escribe el nick de un jugador registrado para ver su perfil real{registry.length ? '' : ' (abre una repetición para que aparezcan)'}.</p>
            {p.nick && <Btn icon='user' onClick={() => onSaveRoster(p)}>Guardar «{p.nick}» en el plantel</Btn>}
          </>
        )}
      </Section>
      <Section title='Acciones'>
        <div className='tx-row'>
          {linkedShapes.length > 0 && <Btn icon='unlink' onClick={() => { ctl.sel.shapes = new Set(linkedShapes.map((x) => x.id)); ctl.unlinkSelection(); }}>Desvincular figuras</Btn>}
          <Btn icon='copy' onClick={() => ctl.duplicateSelection()}>Duplicar</Btn>
          <Btn icon='trash' danger onClick={() => ctl.deleteSelection()}>Eliminar</Btn>
        </div>
        {nPl === 1 && <p className='tx-note small'>Mayús o «Selección múltiple» para elegir varios jugadores.</p>}
      </Section>
    </>
  );
}

// Campo de nick: confirma al escribir y al elegir de la lista
function NickInput({ value, onCommit, list }) {
  const [v, setV] = useState(value || '');
  useEffect(() => { setV(value || ''); }, [value]);
  return <input type='text' list={list} value={v} maxLength={24} autoComplete='off' spellCheck={false} placeholder='Nombre del jugador' onChange={(e) => { setV(e.target.value); onCommit(e.target.value); }} />;
}

// ---------- ajustes de la pizarra (nada seleccionado) ----------
export function DocPanel({ ctl, s, folders, registry, onAddRegistered }) {
  const doc = s.doc;
  const [q, setQ] = useState('');
  const list = registry.filter((r) => !q || r.nick.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const onField = doc.players.map((p) => p.regKey).filter(Boolean);
  return (
    <>
      <Section title='Pizarra'>
        <TextField label='Nombre' value={doc.name} onChange={(v) => ctl.setMeta({ name: v || 'Sin nombre' })} maxLength={60} />
        <TextField label='Descripción' multiline value={doc.description} onChange={(v) => ctl.setMeta({ description: v })} placeholder='Objetivo de la jugada, cómo se ejecuta…' />
        <div className='tx-grid2'>
          <label className='tx-field'>
            <span>Tipo de jugada</span>
            <select value={doc.category} onChange={(e) => ctl.setMeta({ category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className='tx-field'>
            <span>Carpeta</span>
            <select value={doc.folderId || ''} onChange={(e) => ctl.setMeta({ folderId: e.target.value || null })}>
              <option value=''>Sin carpeta</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
        </div>
      </Section>
      <Section title={'Jugadores registrados' + (registry.length ? ' (' + registry.length + ')' : '')}>
        {registry.length === 0 ? <p className='tx-note'>Cuando abras repeticiones en el analizador, sus jugadores aparecerán aquí con sus estadísticas reales.</p> : (
          <>
            <TextField value={q} onChange={setQ} placeholder='Buscar jugador…' maxLength={24} />
            <ul className='tx-reglist'>
              {list.map((r) => (
                <li key={r.key}>
                  <button type='button' onClick={() => onAddRegistered(r)} disabled={onField.includes(r.key)} title={onField.includes(r.key) ? 'Ya está en la pizarra' : 'Colocar en el campo'}>
                    <i style={{ background: r.team ? TEAM_COLORS[r.team] : TEAM_COLORS.neutral }} />
                    <span>{r.nick}</span>
                    {r.rating && r.rating.value != null && <em title='Calificación media'>{Number(r.rating.value).toFixed(1)}</em>}
                    <Icon name={onField.includes(r.key) ? 'check' : 'plus'} size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
      <Section title='Vista'>
        <div className='tx-row'>
          <Toggle on={s.names} onClick={() => ctl.setFlag('names', !s.names)} icon='names'>Nombres</Toggle>
          <Toggle on={s.trails} onClick={() => ctl.setFlag('trails', !s.trails)} icon='trail'>Trayectorias</Toggle>
          <Toggle on={s.ghost} onClick={() => ctl.setFlag('ghost', !s.ghost)} icon='ghost'>Paso anterior</Toggle>
          <Toggle on={s.snap} onClick={() => ctl.setFlag('snap', !s.snap)} icon='magnet'>Imán a fichas</Toggle>
        </div>
      </Section>
    </>
  );
}

export const ZONE_LABELS = ZONES;
export { ZONE_TOOLS, shapePts };
