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

## Novedades (15 nov, tarde)
- **Pizarra sobre la repetición** (`src/tactics/replayBoard.js` + `.scss`): botón flotante dentro de la vista de repetición (abajo a la derecha, sobre «Seguir jugador»). Abre una capa transparente encima de la cancha: lápiz, flecha, zona, fichas roja y azul numeradas, balón, borrador, deshacer, limpiar todo (con confirmación), captura PNG (repetición + dibujo) y «Mover» para seguir manejando la repetición. **No modifica el partido ni `game2.js`**: se engancha observando el DOM. Se activa con 2 líneas en `src/index.js` (`python3 wip-tactics/integrate.py RUTA/index.js`). El botón Atrás de Android cierra primero la pizarra.
- Pizarra independiente: **Borrador** (toca o arrastra), botones de **ficha roja / azul** en la barra, barra de acciones grande para el móvil (Borrador · Borrar selección · Limpiar todo con confirmación).
- Pruebas nuevas: `tests/replay/` (capa sobre una vista simulada, escritorio y móvil táctil) y `tests/ui/eraser-test.mjs`.
- Sin verificar: la capa se probó sobre una vista de repetición SIMULADA (misma estructura de DOM que `.fenix-fit` + `canvas`), no sobre el motor real; las anotaciones se anclan a la pantalla (no al campo), así que conviene pausar la repetición al dibujar.

## Anclaje al campo (B, 15 nov noche, a petición del usuario)
`replayBoard.js` reescrito para que todo lo dibujado se guarde en **coordenadas del campo** (unidades HaxBall) y no de la pantalla. Usa `window.__fenixView` ({camX, camY, k, W, H, h}, publicado por el motor cada fotograma; misma fórmula que el toque a jugador de game2.js) para convertir pantalla ↔ campo. La capa se repinta cuando cambia la cámara (seguir jugador, zoom, arrastre) y también con la pizarra cerrada. Prueba: `tests/replay/anchor.mjs` (mueve la cámara y comprueba que la raya la sigue); `index.html` del mock ahora publica `__fenixView`.

## 16 nov (C): más herramientas, gestos y barra sin solapes
- **Pizarra sobre la repetición**: ahora con línea, discontinua, flecha recta/curva, círculo, rectángulo, triángulo, zonas de presión/defensa/cobertura, fichas roja/azul numeradas, balón, texto, **Mover marca** (arrastrar una marca), borrador, relleno y 3 grosores. Mantiene el anclaje al campo de B (`__fenixView`), con unidades de campo.
- **Gesto**: un toque con **2 dedos = deshacer**, con **3 dedos = rehacer** (capa de la repetición y pizarra independiente). Si el primer dedo acababa de colocar algo, eso se descarta y no cuenta.
- **Layout**: al abrir la pizarra se ocultan los botones flotantes de la repetición (restablecer vista, seguir, estrella, grabar, despejar, zoom) para que no se superpongan; las acciones (Listo, Deshacer, Rehacer, Limpiar, Captura) van en una columna arriba a la derecha y las herramientas abajo.
- Pruebas: `tests/replay/test.mjs` (herramientas, mover, 2/3 dedos, captura, atrás) y `anchor.mjs` (B). `tests/ui/eraser-test.mjs` incluye 2/3 dedos en la pizarra independiente.

## Rediseño visual + selector de cancha (B)
- Herramientas ahora en un **dock inferior** (`.tx-dock`): acciones siempre visibles (Mover, Mano, Varios, Borrador, Eliminar, Deshacer, Rehacer), categorías con menú desplegable (Añadir, Líneas, Formas, Zonas, Más) y botón **Animar** que monta/oculta `Timeline`.
- Se quitó la barra lateral de herramientas, la barra flotante (`tx-actbar`), undo/redo del encabezado y «Colocar jugadores» de `DocPanel` (duplicados).
- **Cancha**: `doc.field` = geometría compacta (`{name,bgType,halfW,halfH,boundW,boundH,kickOff,bgColor,segs,goals}`); `geometry.setPitch()` cambia `PITCH` globalmente; `render.drawStadium` la dibuja. Prop nueva `stadiumProvider` (async → lista). Las canchas salen de `kv 'stadiums'` (se guardan en `ingest.js` desde `stats[].stadium`; el parche de `game2.js` añade `curveS` con signo). Repeticiones ya importadas necesitan reabrirse una vez para guardar su geometría.

## Funcional de la pizarra (B)
- Máx. **5 jugadores por equipo** (`model.MAX_PER_TEAM`; `addPlayer` devuelve `id:null` al superarlo; el controlador avisa con un toast).
- Con cualquier herramienta de dibujo activa, el tirador de la figura seleccionada se puede arrastrar sin pasar a «Mover» (`controller._grabHandle`); con «Ficha» activa, tocar una ficha existente la mueve.
- **Flecha curva**: `pts[1]` es ahora un punto POR DONDE PASA la curva (`thru:true`); el lado de la curva sale de hacia dónde se desvía el dedo (`_bendFor`). Las jugadas antiguas se migran en `normalizeDoc`.
- Eliminados círculo, cuadrado y triángulo (herramientas, botones, render e iconos); en jugadas antiguas pasan a polígono. En la capa sobre la repetición se quitaron círculo y triángulo y la curva también elige lado.
- Polígono/zona libre: si los vértices se tocan en un orden que cruza la figura, `geometry.untangle` (2-opt) los reordena.
- Pruebas puras: `tests/ui/geo-test.mjs` (empaquetar con esbuild `--platform=node --format=esm` y ejecutar).
- **Zonas eliminadas** (presión/defensa/cobertura/espacio libre): herramientas, `ZONES`, render y paneles; las zonas de jugadas antiguas se descartan en `normalizeDoc`.
- **Óvalo** (`type:'oval'`): 8 puntos de control en elipse, dibujado como curva cerrada suave; cada punto es un tirador, así que se deforma a gusto. En la capa sobre la repetición es una elipse por caja.

## Pizarra con diseño tipo TacticalPad (pedido directo del usuario)
- `TacticsBoard.js`: se quitó la cabecera. Cancha a pantalla completa; `.tx-hud` flotante (nombre, vistas, zoom); insignias de equipo arriba izq./der. (abren la bandeja de fichas Rojo/Azul: Balón, Jugador 1–5, registrados, Ajustes); botón **Menú** (abajo izq.: Nueva, Abrir, Guardar, Cancha, Compartir, Ajustes, Pantalla, Salir) y **Herramientas** (abajo der.: pestañas Edición/Animación + dock de herramientas). Estado `bar`: `'tools'|'menu'|'red'|'blue'`.
- Las fichas de la bandeja se colocan en el centro y se arrastran. No se implementó el diálogo de ajustes de equipo.
- `tactics.scss`: bloque nuevo al final (`.tx-corner`, `.tx-team`, `.tx-cbtn`, `.tx-roster`, `.tx-tok`); CSS de la antigua cabecera (`.tx-top`, `.tx-menu`, `.tx-viewbar`) queda sin uso.
- Tests actualizados: el panel se abre con Menú → Ajustes; exportar/biblioteca desde Menú.

## Dock de una sola fila (móvil y escritorio)
- Fila única: Mover · Añadir · Dibujar · Borrador · Eliminar/Deshacer/Rehacer (solo icono en móvil) · Más.
- «Dibujar» agrupa Líneas, Formas y Texto; «Más» agrupa Animación (`.tx-ft.anim`), Mano, Varios y Vaciar todo. Se quitaron las pestañas Edición/Animación y CATS `lines/shapes`.
- Tests ajustados (`.tx-db.cat:has-text("Más")` → `.tx-ft.anim`).
- Opciones desplegadas (Dibujar/Añadir/Más): una fila flotante deslizable sin recuadro de fondo (`.tx-fly` absoluta sobre el dock).
- (18 nov, Claude C) Pizarra: sin barra inferior los botones Menú/Herramientas respetan `--inb` (`.tx-root.nobar`); la fila de opciones desplegadas (`.tx-fly`) sube por encima de ellos (no se superpone) y las opciones/botones son gris translúcido, sin recuadro de fondo. Barra de la repetición y Centro de análisis también respetan `--inb`/`--int`.

- FYI (pizarra): se quitó el HUD superior; modos de vista/Ajustar/nombre+estado van en la barra Menú. `.tx-fly` queda bajo los botones de esquina (que suben con `.flyopen`). Arcos: `setPitch` amplía bounds con segs/goals, curvas negativas se dibujan anticlockwise, `stadiumGeo` guarda `posts` (discos fijos junto a la portería).
- FYI (pizarra): ya no se dibuja la línea rosa/azul de gol (HaxBall no la dibuja); postes con color/radio del disco real (`posts` en stadiumGeo).
- FYI (pizarra): los postes ya no son los de Classic; se dibujan todos los discos fijos (invMass 0) del mapa importado (`discs` en stadiumGeo: x,y,radio,color). Mapas guardados sin `discs` se actualizan al reimportar un replay.
- FYI (pizarra): mapas guardados sin `discs` (antes de leer los discos) dibujan postes aproximados en los extremos de la portería; se corrigen al volver a analizar el replay (ingestFromEngine).
- FYI (pizarra): sin postes aproximados. En el selector de cancha, los mapas guardados sin `discs` muestran "sin postes" y un botón que abre (vía `onReadMap` de Home.js → `readMapFromReplay`) un replay guardado con ese mapa; al analizarlo se guarda la geometría exacta.
- FYI: `saveStadiums` ahora SIEMPRE sobrescribe la cancha con lo último analizado y avisa con `fenix-scouting-changed`; la pizarra refresca sola el `doc.field` si el mapa guardado cambió.
- FYI (pizarra): la barra Menú ahora tiene grupos: Archivo (nombre/estado, Nueva, Abrir, Guardar) y Vista (Completa, Izquierda, Derecha, Ajustar) como desplegables `.tx-fly`; Cancha, Compartir, Ajustes, Pantalla y Salir siguen directos.

## Sombras de tiro (pedido del usuario)
El balón es un foco de luz y cada jugador un objeto opaco: lo que queda en sombra es adonde no se puede tirar en línea recta.
- `shadow.js` (geometría pura): `shadowQuads` (tangentes de cada ficha vistas desde el balón), `goalOpening` (qué parte de la boca de cada portería queda sin tapar), `paintShadows` (sombra unida con relleno `nonzero` + resplandor del balón).
- **Pizarra**: flag `shadow` del controlador (`setFlag('shadow')`), opción **Sombras** dentro de «Más». `render.js` → `drawShadowLayer`: sombra recortada al campo + raya verde/roja sobre cada portería (libre/tapada) y % libre. Se exporta en el PNG del paso si está activa. Usa la cancha activa (`getField().goals`).
- **Repetición**: `replayShadow.js` (lo instala `installReplayBoard`): botón **Más** (⋮) sobre el de la pizarra → interruptor «Sombras de tiro». Capa transparente `.rs-layer` que lee `__fenixLive` (jugadores x,y,r), `__fenixBall` y `__fenixView`; no toca `game2.js`. Se recuerda en `localStorage` (`fenix-replay-shadow`). Sin % de portería en la repetición porque el motor no publica la geometría de las porterías.
- Pruebas: `tests/ui/shadow-test.mjs`, `tests/replay/shadow.mjs`.
- Ajustes de sombras: el borde cercano de cada sombra sigue el arco de la ficha (ya no hay corte plano). La capa de la repetición ahora vive dentro del `host` con `z-index: 0` (queda por debajo del marcador y de los botones, que no se oscurecen). Botón de zoom (`.fenix-fit`) abajo a la derecha y el de grabar sube a su sitio (`scout-entry.scss`); prueba W2 de `verify-web.cjs` actualizada.
- Cartel de gol: es un elemento del DOM por encima de todo (z-index 100001); no necesita tratamiento especial. Se probó copiar/recortar el cartel del canvas y dejaba un rectángulo sin sombra: eliminado. Zoom: `bottom: var(--edge)`.
- FYI (pizarra): quitado el botón Pantalla; iconos de Vista distintos (completa/izq/der); fichas con círculo tipo HaxBall (relleno del equipo + borde blanco); una ficha (mismo equipo y número, o mismo jugador registrado) no se duplica: se selecciona la existente (`addPlayerCenter`).
- FYI (pizarra): fichas con diseño del motor de HaxBall (relleno del equipo E56E56/5689E5, borde negro fino, dorsal blanco Arial Black, nombre blanco encima); iconos izquierda/derecha intercambiados a petición.
- FYI (pizarra): grosor de líneas del campo/postes/contornos de fichas y balón fijo en píxeles (LINE_PX/EDGE_PX en render.js), ya no depende del zoom.
- FYI (pizarra): corregido: grosor de líneas/contornos del campo, postes, fichas y balón en unidades del campo (LINE_W=3, EDGE_W=2 × zoom), proporcional al mapa en cualquier zoom, sin mínimo en píxeles.
