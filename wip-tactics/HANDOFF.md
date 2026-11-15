# Pizarra táctica — traspaso (carpeta `wip-tactics/`, rama `wip/scouting-module`)

Módulo nuevo e independiente: `src/tactics/` (React + canvas, sin dependencias nuevas, móvil primero). **No modifica** `game2.js`, slices ni el analizador. Todo su CSS va bajo `.tx-root`; guarda en su propia IndexedDB `os-fenix-tactics`.

## Qué hace
Campo HaxBall Classic (completo/mitad/zoom/pan/ajustar), fichas arrastrables y coloreables con nick/dorsal (selección simple y múltiple, enlaces 2→línea, 3→triángulo, 4→cuadrilátero, 5+→polígono que siguen a los jugadores), 19 herramientas de dibujo (lápiz, flechas rectas/curvas, líneas, discontinuas, círculo, cuadrado, rectángulo, triángulo, polígono, zonas de presión/defensa/cobertura, espacios), pasos de jugada con animación (reproducir, pausar, reanudar, reiniciar, paso a paso, velocidad, repetir), panel contextual del jugador, biblioteca (carpetas, duplicar, mover, borrar, importar JSON), deshacer/rehacer, autoguardado, exportación (PNG, esquema, hoja, WebM animado, JSON). Ratón y táctil (pellizco para zoom). Botón atrás de Android integrado vía `window.__fenixBack`.

## Archivos
- `src/tactics/` — el módulo. Entrada: `TacticsBoard.js` (`<TacticsBoard onClose playerProvider? />`). Estilos: `tactics.scss` (importado por TacticsBoard).
- `src/tactics/scoutingProvider.js.optional` — puente OPCIONAL con el Centro de análisis. Renombrar a `scoutingProvider.js` solo si existe `src/scouting/` (lo hace `integrate.py --with-scouting`).
- `integrate.py` — parche idempotente para `Home.js` (ver abajo).
- `tests/ui/` — prueba de interfaz en Chromium (escritorio, móvil táctil, exportaciones). `tests/combined/` — prueba del puente con el módulo de scouting.

## Integración en Home.js (lo hace quien ya toca Home.js; son 5 hunks pequeños)
`python3 wip-tactics/integrate.py RUTA/Home.js --with-scouting` (o sin la bandera si no hay scouting). Hace, y solo esto:
1. `import TacticsBoard from '../tactics/TacticsBoard'` (+ `import { scoutingPlayers } from '../tactics/scoutingProvider'`).
2. `const [showTactics, setShowTactics] = useState(false);` junto a `mainMode`.
3. `.tx-root` añadido al selector que bloquea los atajos de Home (`... .fenix-exit-overlay, .tx-root`).
4. Botón `.fh-tactics` «Pizarra táctica» justo bajo `.fh-import`, dentro de `.fh-hero`.
5. `{showTactics && <TacticsBoard onClose={() => setShowTactics(false)} playerProvider={scoutingPlayers} />}` tras `<ReplaysList />`.
Es compatible con el `Home.js` ya integrado con scouting (se aplica encima). Si lo prefieres a mano, el diff completo es ese.

Paquete v4: copiar además `src/tactics/` (incluido `scoutingProvider.js` ya renombrado) al zip. El workflow `build-apk.yml` no necesita cambios.

## Contrato del proveedor de jugadores
`playerProvider: async () => [{ key, nick, aliases[], teamName, position, info, avatar, stats:[{id,label,value,prov:'E'|'C'|'M'}], rating:{value,n,prov}|null }]`. Reglas de datos del proyecto: no se inventa nada; sin calificación → «Sin calificación…». El puente lee con `loadAll/buildModel/playerProfile/ratingAverage` del Centro de análisis, así las cifras coinciden. Sin datos devuelve `[]`.
Nota para el dueño de scouting: `ratingAverage` no aplica por sí mismo el umbral de ≥8 actuaciones de ≥2 partidos; el puente muestra lo que devuelve (con `n`). Si el umbral debe cumplirse en `autoRatings`, es cosa de ese módulo.

## Cómo verificar
- UI: `cd wip-tactics/tests/ui && node build.mjs ENTRY.jsx OUT/bundle.js` (ver cabecera de `ui-test.mjs`; requiere esbuild, react 18/19 y playwright).
- Puente: `cd wip-tactics/tests/combined && node run.mjs` (usa `ESBUILD=ruta/a/esbuild/lib/main.js` si hace falta). Datos sintéticos solo de prueba.

## Sin verificar (honestidad)
- No se ha corrido una compilación real de CRA/Sass (sin red en el entorno): se probó con esbuild; el SCSS usa anidado simple, sin variables Sass.
- WebM depende de `MediaRecorder` del navegador; si no existe, el botón avisa.
- Falta probarlo dentro de la app real con Home.js ya integrado.
