// Iconos de la pizarra (trazo, 24x24). Se dibujan con currentColor para respetar los temas de la app.
import React from 'react';

const I = {
  select: 'M5 3l14 7-6 2-2 6z',
  pan: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 6-6 6-3 0-4.5-1.5-6-4l-1.5-3a1.5 1.5 0 0 1 2.5-1.5L8 13',
  pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  line: 'M5 19L19 5',
  dline: ['M5 19L19 5', '3 3'],
  arrow: 'M5 19L19 5M10 5h9v9',
  carrow: 'M5 19c0-8 6-12 13-12M13 4l5 3-3 5',
  square: 'M5 5h14v14H5z',
  rect: 'M3 7h18v10H3z',
  oval: 'M12 5c5.5 0 9 3 9 7s-3.5 7-9 7-9-3-9-7 3.5-7 9-7z',
  polygon: 'M12 3l8 6-3 11H7L4 9z',
  text: 'M5 6V4h14v2M12 4v16M9 20h6',
  player: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M8 12h8',
  ball: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8l3 2-1 4h-4l-1-4z',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12h-2',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12h2',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  restart: 'M5 4v16M9 12l11-8v16z',
  prev: 'M19 5L9 12l10 7zM6 5v14',
  next: 'M5 5l10 7-10 7zM18 5v14',
  loop: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  save: 'M5 3h11l4 4v14H5zM8 3v6h8V3M8 21v-7h8v7',
  download: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  library: 'M4 5h16v4H4zM4 11h16v4H4zM4 17h16v3H4z',
  board: 'M3 5h18v14H3zM12 5v14M3 12h3M18 12h3M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  erase: 'M16 3l5 5-9 9H7l-4-4zM9 20h12M7 17l-4-4',
  team: 'M12 5a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 12 5zM5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  unlink: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16',
  rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  zoomin: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6',
  zoomout: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  back: 'M15 5l-7 7 7 7',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  panel: 'M4 4h16v16H4zM15 4v16',
  multi: 'M4 4h9v9H4zM11 11h9v9h-9z',
  trail: 'M4 19c5-12 9 4 16-12M16 5h4v4',
  ghost: 'M6 20V10a6 6 0 0 1 12 0v10l-3-2-3 2-3-2z',
  magnet: 'M5 4v7a7 7 0 0 0 14 0V4h-4v7a3 3 0 0 1-6 0V4zM5 8h4M15 8h4',
  names: 'M4 8h16M4 8v6h16V8M8 18h8',
  check: 'M5 12l5 5 9-10',
  halfl: 'M12 5H3v14h9M12 5v14M3 10h2.5v4H3',
  halfr: 'M12 5h9v14h-9M12 5v14M21 10h-2.5v4H21',
  full: 'M3 5h18v14H3zM12 5v14M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  image: 'M4 5h16v14H4zM8 10a1.5 1.5 0 1 0 0-.01M4 17l5-5 4 4 3-3 4 4',
  shadow: 'M3 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 8h3v8h-3zM16 7l5-2M16 12h5M16 17l5 2',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16'
};

// Mismo icono como texto SVG (para la capa sobre la repetición, que no usa React)
export function iconSvg(name, size = 20) {
  const d = I[name]; if (!d) return '';
  const path = Array.isArray(d) ? d[0] : d, dash = Array.isArray(d) ? d[1] : '';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + (name === 'play' ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/></svg>';
}

export function Icon({ name, size = 20, className }) {
  const d = I[name];
  if (!d) return null;
  const path = Array.isArray(d) ? d[0] : d, dash = Array.isArray(d) ? d[1] : undefined;
  const solid = name === 'play';
  return (
    <svg className={className} width={size} height={size} viewBox='0 0 24 24' fill={solid ? 'currentColor' : 'none'} stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true' focusable='false'>
      <path d={path} strokeDasharray={dash} />
    </svg>
  );
}

export default Icon;
