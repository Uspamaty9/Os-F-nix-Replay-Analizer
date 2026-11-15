// Empaqueta el módulo con esbuild para probarlo en Chromium. Requiere: esbuild, react y react-dom (v18/19) y playwright instalados.
// Uso:  node build.mjs && (python3 -m http.server 8765 &) && mkdir -p shots && node run3.js
import { build } from 'esbuild';
const S = new URL('.', import.meta.url).pathname;
await build({
  entryPoints: [S + 'main.jsx'], bundle: true, outfile: S + 'out.js', loader: { '.js': 'jsx', '.scss': 'css' }, logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /^\.\.\/extras$/ }, () => ({ path: S + 'stubs_extras.js' }));
    b.onResolve({ filter: /^\.\.\/storage\/history$/ }, () => ({ path: S + 'stubs_history.js' }));
  } }],
});
console.log('built');
