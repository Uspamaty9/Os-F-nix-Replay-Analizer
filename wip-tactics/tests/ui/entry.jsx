import React from 'react';
import { createRoot } from 'react-dom/client';
import TacticsBoard from '../../src/tactics/TacticsBoard.js';
window.__closed = 0;
window.__mount = (opts = {}) => {
  const el = document.getElementById('root'); window.__root && window.__root.unmount();
  window.__root = createRoot(el);
  window.__root.render(<TacticsBoard onClose={() => { window.__closed++; }} playerProvider={opts.provider ? window.__provider : undefined} />);
};
window.__mount();
