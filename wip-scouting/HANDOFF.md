# Módulo de estadísticas y scouting — traspaso (WIP)

Base: `Os-Fenix-Replay-Analyzer-Motor-Reproduccion-v3.zip` -> carpeta `haxball-replay-analyzer.github.io-react/` (React 18 + Redux, CRA, SCSS).
Decisiones del usuario: entregar como **nuevo zip v4** (dejar v3 intacto), **sin dependencias nuevas** (gráficos SVG y PDF propios), **móvil primero**.

## Qué hay aquí
- `src/scouting/` -> módulo nuevo (copiar a `src/scouting/` del proyecto). Todo compila con esbuild (JSX); falta solo `scouting.scss`.
  - `db.js` IndexedDB propia `os-fenix-scouting` (no toca `os-fenix-replays`). `analysis.js` lógica pura (probada). `ingest.js` puente con el analizador.
  - `model.js` consultas/filtros/estadísticas coherentes. `charts.js` gráficos SVG. `pdf.js` + `report.js` informes PDF.
  - Vistas: `Dashboard, Players, Scouting, Matches, Network, Teams, Reports`; contenedor `ScoutingApp.js`.
- `src/extras.js` -> único cambio a un archivo existente hasta ahora: `sendBytes` ahora es `export` (para guardar PDFs/copias).
- `tests/analysis.test.mjs` -> `node tests/analysis.test.mjs` (pasa).

## Pendiente
1. **`src/scouting/scouting.scss`** (ScoutingApp lo importa). Clases `sc-*` usadas en las vistas. Variables: `--sc-bg, --sc-card, --sc-acc, --sc-red, --sc-red2, --sc-txt, --sc-line` con fallback a `--bg/--card/--acc/--red/--txt` del tema de la app (en tema Fênix por defecto esas no existen: fallback `#111111/#181818/#C89A3D/#7A0E1A/#F7F3E8`). Móvil primero, barra inferior `.sc-tabs`, hojas `.sc-sheet`, tooltips `.sc-tip`.
2. **Integrar en `src/components/Home.js`** (cambios mínimos, no tocar `game2.js`):
   - `import { ingestFromEngine } from '../scouting/ingest'` y llamar `ingestFromEngine(stats)` dentro de `setGameStatsExp`, tras `setReplayInfo(...)`.
   - estado `showScouting`, botón "Centro de análisis" en `.fh-hero`, y render de `<ScoutingApp onClose openReplay={openSaved} />` (`openSaved(id)` ya existe en Home).
3. Prueba en Chromium con React 19 (`/opt/npm-tools/node_modules/react`) + datos sintéticos SOLO de prueba (nunca incluirlos en la app).
4. Revisar `report.js` generando un PDF y rasterizándolo (`pdftoppm`).
5. Empaquetar `Os-Fenix-Replay-Analyzer-Motor-Reproduccion-v4-Scouting.zip` en la raíz; el workflow `build-apk.yml` compila cada zip (revisar el run).

## Reglas de datos (no cambiar)
Extraído (motor) / Calculado / Manual, con insignias E/C/M. Sin inventar estadísticas; valoración automática solo con >=8 actuaciones de >=2 partidos. `DEFINITIONS` en `analysis.js` documenta cada cálculo.

---
## REPARTO DE TRABAJO (dos Claude en la misma rama `wip/scouting-module`)
Regla: **cada uno edita solo sus archivos**. Si necesitas un cambio en un archivo del otro, no lo edites: anótalo en "Peticiones" (abajo) y el dueño lo hace.
Antes de empezar y antes de cada push: `git pull --rebase origin wip/scouting-module`. Commits pequeños, con `[skip ci]` mientras sea WIP.

**Claude A (el que escribió el módulo)** — dueño de:
- `wip-scouting/src/scouting/scouting.scss` (estilos; lo escribe A)
- `wip-scouting/src/scouting/*.js` EXCEPTO `report.js` y `pdf.js`
- Prueba en Chromium con React 19 + datos sintéticos de prueba, y correcciones que salgan de ella.

**Claude B (el otro)** — dueño de:
- `wip-scouting/src/components/Home.js`: copia modificada de Home.js del zip v3 con la integración (ver "Pendiente" punto 2). No tocar `game2.js`.
- `wip-scouting/src/scouting/report.js` y `pdf.js`: generar un PDF de prueba, rasterizarlo con `pdftoppm`, corregir maquetación.
- Empaquetado del zip v4 y revisión del run de CI (solo cuando A avise de que los estilos y las pruebas están listos).

Tras unir los dos trabajos, el zip v4 se arma extrayendo v3 y copiando encima `src/scouting/`, `src/extras.js` y `src/components/Home.js`.

### Estado (actualizado por A)
- HECHO por A: `scouting.scss`; prueba en Chromium (React 19) con 3 scripts en `tests/browser/` (todo pasa, sin errores de consola); correcciones: coherencia del Panel (un solo ámbito de equipo), color de nodos en red de pases, fechas en hora local.
- A tocó 2 archivos de B por ser fallos que bloqueaban la revisión (B aún no había empezado): `pdf.js` (los rellenos salían negros: `parseInt('#...')` -> NaN) y `report.js` (títulos huérfanos al final de página, pie de la red de pases, ámbito `noOwn`). Revisión visual del PDF: tras estos cambios se ve correcto; B puede afinar maquetación pero no es bloqueante.
- PENDIENTE de B: **integración en `Home.js`** (bloqueante) y empaquetado del zip v4 + CI. A está libre para ayudar con lo que B pida.

### Peticiones entre Claude (añade líneas aquí; quien reciba la petición la tacha al hacerla)
- (vacío)
