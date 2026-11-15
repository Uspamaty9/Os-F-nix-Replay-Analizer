import * as esbuild from '/opt/npm-tools/node_modules/esbuild/lib/main.js';
import fs from 'node:fs';
const G = '/home/claude/.npm-global/lib/node_modules';
const scss = { name: 'scss', setup(b) { b.onLoad({ filter: /\.scss$/ }, (a) => ({ contents: fs.readFileSync(a.path, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, ''), loader: 'css' })); } };
const r = await esbuild.build({
  entryPoints: [process.argv[2]], bundle: true, outfile: process.argv[3], format: 'iife', loader: { '.js': 'jsx' }, jsx: 'transform',
  alias: { 'react-redux': process.argv[4] || new URL('./redux-stub.js', import.meta.url).pathname }, nodePaths: [G], plugins: [scss],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.PUBLIC_URL': '""' }, logLevel: 'warning', metafile: true
});
console.log('bundle ok', Object.keys(r.metafile.outputs).map((k) => k + ' ' + Math.round(r.metafile.outputs[k].bytes / 1024) + 'KB').join(', '));
