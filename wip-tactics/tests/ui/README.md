Prueba de interfaz de la pizarra (Chromium, escritorio + móvil táctil). Requiere esbuild, react/react-dom y playwright.
1. `mkdir out && cp index.html out/ && node build.mjs entry.jsx out/bundle.js` (genera `bundle.js` y `bundle.css`).
2. `NODE_PATH=<node_modules globales> node ui-test.mjs out out`  → debe imprimir `ERRS []` y `OK ui`.
`redux-stub.js` sustituye a react-redux solo en la prueba (simula `gameStats.matches`).
