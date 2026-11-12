const { app, BrowserWindow, protocol, net, shell, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const webDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'web');
let win;

function create() {
  win = new BrowserWindow({
    width: 1280, height: 780, minWidth: 1024, minHeight: 640,
    title: 'Replay Analyzer Os Fênix',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());
  win.setTitle('Replay Analyzer Os Fênix');
  win.on('page-title-updated', e => e.preventDefault());
  // Enlaces externos (redes sociales) se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type === 'keyDown' && i.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.loadURL('app://app/index.html');
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', req => {
      let p = decodeURIComponent(new URL(req.url).pathname);
      if (p === '/' || p === '') p = '/index.html';
      const full = path.normalize(path.join(webDir, p));
      if (!full.startsWith(webDir)) return new Response('', { status: 403 });
      return net.fetch(pathToFileURL(full).toString());
    });
    create();
  });
  app.on('window-all-closed', () => app.quit());
}
