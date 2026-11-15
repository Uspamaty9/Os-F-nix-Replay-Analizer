// Biblioteca: pizarras y jugadas guardadas, carpetas, duplicar, mover, eliminar, importar.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './icons';
import { listDocs, listFolders, createFolder, renameFolder, deleteFolder, saveDoc, deleteDoc, parseDoc } from './storage';
import { cloneDoc, CATEGORIES } from './model';

const fmt = (t) => { try { return new Date(t).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

export default function Library({ currentId, onOpen, onNew, onClose, onChanged, toast }) {
  const [docs, setDocs] = useState(null);
  const [folders, setFolders] = useState([]);
  const [folder, setFolder] = useState('all'); // all | none | id
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [newFolder, setNewFolder] = useState(null); // null | string
  const [confirm, setConfirm] = useState(null); // 'doc:<id>' | 'folder:<id>'
  const [renaming, setRenaming] = useState(null); // folder id
  const [menu, setMenu] = useState(null); // doc id con acciones abiertas
  const fileRef = useRef(null);

  const reload = useCallback(async () => {
    const [d, f] = await Promise.all([listDocs(), listFolders()]);
    setDocs(d); setFolders(f);
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const shown = useMemo(() => {
    if (!docs) return [];
    return docs.filter((d) => (folder === 'all' || (folder === 'none' ? !d.folderId : d.folderId === folder)) && (!cat || d.category === cat) && (!q || (d.name + ' ' + (d.description || '')).toLowerCase().includes(q.toLowerCase())));
  }, [docs, folder, q, cat]);

  const count = (f) => (docs || []).filter((d) => (f === 'all' ? true : f === 'none' ? !d.folderId : d.folderId === f)).length;

  async function duplicate(d) { const c = cloneDoc(d); c.folderId = d.folderId; await saveDoc(c); toast('Duplicada: ' + c.name); await reload(); onChanged && onChanged(); }
  async function move(d, fid) { await saveDoc({ ...d, folderId: fid || null, updatedAt: Date.now() }); await reload(); onChanged && onChanged(); }
  async function remove(d) { await deleteDoc(d.id); setConfirm(null); toast('Eliminada'); await reload(); onChanged && onChanged(d.id); }
  async function addFolder() { const n = (newFolder || '').trim(); setNewFolder(null); if (!n) return; const f = await createFolder(n); setFolder(f.id); await reload(); }
  async function renFolder(id, name) { await renameFolder(id, name); setRenaming(null); await reload(); }
  async function delFolder(id) { await deleteFolder(id); setConfirm(null); setFolder('all'); toast('Carpeta eliminada; sus pizarras siguen guardadas'); await reload(); onChanged && onChanged(); }
  async function importFile(e) {
    const files = Array.from(e.target.files || []); e.target.value = '';
    let ok = 0;
    for (const f of files) {
      try { const d = parseDoc(await f.text()); if (folder !== 'all' && folder !== 'none') d.folderId = folder; await saveDoc(d); ok++; } catch (err) { toast('No se pudo importar «' + f.name + '»'); }
    }
    if (ok) { toast(ok + (ok === 1 ? ' pizarra importada' : ' pizarras importadas')); await reload(); }
  }

  return (
    <div className='tx-overlay' onClick={onClose}>
      <div className='tx-sheet tx-lib' role='dialog' aria-label='Biblioteca de pizarras' onClick={(e) => e.stopPropagation()}>
        <div className='tx-sheet-head'>
          <h3>Biblioteca táctica</h3>
          <button type='button' className='tx-icon' onClick={onClose} aria-label='Cerrar'><Icon name='close' /></button>
        </div>
        <div className='tx-lib-bar'>
          <button type='button' className='tx-btn primary' onClick={() => onNew(folder !== 'all' && folder !== 'none' ? folder : null)}><Icon name='plus' size={16} /><span>Nueva pizarra</span></button>
          <button type='button' className='tx-btn' onClick={() => setNewFolder('')}><Icon name='folder' size={16} /><span>Nueva carpeta</span></button>
          <button type='button' className='tx-btn' onClick={() => fileRef.current && fileRef.current.click()}><Icon name='upload' size={16} /><span>Importar</span></button>
          <input ref={fileRef} type='file' accept='.json,application/json' multiple hidden onChange={importFile} />
        </div>
        {newFolder !== null && (
          <form className='tx-inline' onSubmit={(e) => { e.preventDefault(); addFolder(); }}>
            <input autoFocus type='text' maxLength={40} placeholder='Nombre de la carpeta' value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
            <button type='submit' className='tx-btn primary'>Crear</button>
            <button type='button' className='tx-btn' onClick={() => setNewFolder(null)}>Cancelar</button>
          </form>
        )}
        <div className='tx-folders' role='tablist'>
          <button type='button' className={folder === 'all' ? 'on' : ''} onClick={() => setFolder('all')}>Todas <i>{count('all')}</i></button>
          <button type='button' className={folder === 'none' ? 'on' : ''} onClick={() => setFolder('none')}>Sin carpeta <i>{count('none')}</i></button>
          {folders.map((f) => (
            <button type='button' key={f.id} className={folder === f.id ? 'on' : ''} onClick={() => setFolder(f.id)}><Icon name='folder' size={14} /> {f.name} <i>{count(f.id)}</i></button>
          ))}
        </div>
        {folder !== 'all' && folder !== 'none' && (() => {
          const f = folders.find((x) => x.id === folder); if (!f) return null;
          return renaming === f.id ? (
            <form className='tx-inline' onSubmit={(e) => { e.preventDefault(); renFolder(f.id, e.target.elements.n.value); }}>
              <input name='n' autoFocus defaultValue={f.name} maxLength={40} />
              <button type='submit' className='tx-btn primary'>Guardar</button>
              <button type='button' className='tx-btn' onClick={() => setRenaming(null)}>Cancelar</button>
            </form>
          ) : (
            <div className='tx-inline'>
              <span className='tx-grow'>Carpeta «{f.name}»</span>
              <button type='button' className='tx-btn' onClick={() => setRenaming(f.id)}>Renombrar</button>
              {confirm === 'folder:' + f.id
                ? <button type='button' className='tx-btn danger' onClick={() => delFolder(f.id)}>Confirmar: eliminar carpeta</button>
                : <button type='button' className='tx-btn danger' onClick={() => setConfirm('folder:' + f.id)}><Icon name='trash' size={16} /><span>Eliminar</span></button>}
            </div>
          );
        })()}
        <div className='tx-lib-filter'>
          <input type='search' placeholder='Buscar por nombre o descripción…' value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label='Tipo de jugada'>
            <option value=''>Todos los tipos</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className='tx-lib-list'>
          {docs === null && <p className='tx-empty'>Cargando…</p>}
          {docs !== null && shown.length === 0 && <p className='tx-empty'>{docs.length ? 'No hay pizarras con ese filtro.' : 'Todavía no hay pizarras guardadas. Crea la primera con «Nueva pizarra».'}</p>}
          {shown.map((d) => (
            <article key={d.id} className={'tx-card' + (d.id === currentId ? ' current' : '')}>
              <button type='button' className='tx-card-main' onClick={() => onOpen(d)}>
                <b>{d.name}</b>
                <span className='tx-card-meta'>{d.category} · {d.players.length} jugadores · {d.frames.length} {d.frames.length === 1 ? 'paso' : 'pasos'} · {fmt(d.updatedAt)}</span>
                {d.description && <span className='tx-card-desc'>{d.description}</span>}
              </button>
              <button type='button' className='tx-icon' aria-label='Más acciones' onClick={() => setMenu(menu === d.id ? null : d.id)}><Icon name='more' /></button>
              {menu === d.id && (
                <div className='tx-card-menu'>
                  <button type='button' className='tx-btn' onClick={() => duplicate(d)}><Icon name='copy' size={16} /><span>Duplicar</span></button>
                  <label className='tx-field inline'>
                    <span>Mover a</span>
                    <select value={d.folderId || ''} onChange={(e) => move(d, e.target.value)}>
                      <option value=''>Sin carpeta</option>
                      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </label>
                  {confirm === 'doc:' + d.id
                    ? <button type='button' className='tx-btn danger' onClick={() => remove(d)}>Confirmar: eliminar</button>
                    : <button type='button' className='tx-btn danger' onClick={() => setConfirm('doc:' + d.id)}><Icon name='trash' size={16} /><span>Eliminar</span></button>}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
