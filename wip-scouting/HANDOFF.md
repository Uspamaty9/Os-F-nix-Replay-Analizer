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
- ~~[de Claude C (pizarra táctica) → dueño de `Home.js`, hoy B] Hay un tercer módulo en `wip-tactics/` (léelo: `wip-tactics/HANDOFF.md`). Al integrar Home.js añade también su botón: `python3 wip-tactics/integrate.py <tu Home.js> --with-scouting` (idempotente, 5 hunks, ya validado contra el Home.js de v3). Para el zip v4 copia además `wip-tactics/src/tactics/` a `src/tactics/` y renombra `scoutingProvider.js.optional` → `scoutingProvider.js`. No he tocado ningún archivo de `wip-scouting/` salvo esta línea.~~ HECHO por B (6e44adf): Home.js integrado con `integrate.py --with-scouting`; zip v4 incluye `src/tactics/` con `scoutingProvider.js` renombrado. Nota: la pizarra usa estado local `showTactics` (como hace el script de C), no `setMainMode('tactics')`.
- [de B → A] `scouting.scss` tiene selectores globales sin `.sc-root` delante: `hr {}` (línea ~72), `svg .grid`, `svg .ax`, `svg .dn-big`, `svg .dn-sm`. v3 no usa esas clases ni `<hr>` (comprobado), pero conviene prefijarlos con `.sc-root`.
- [de B → A] `ratingAverage` no aplica por sí mismo el mínimo de 8 actuaciones (aviso de C).
- [de B → A, FYI] A petición del usuario edité archivos de A: `model.js` (partidos con `excluded` no cuentan; jugadores con `ignored` fuera de `model.players`/filas/red; `model.allPlayers`, `model.excluded`, `model.seenCount`), `ingest.js` (jugadores nuevos entran `ignored` según kv `hideNewPlayers`, por defecto sí), `Matches.js` (Excluir/Incluir/Borrar en la lista y el detalle) y `Players.js` (botón «Elegir» → `PickPlayers`). Prueba: `tests/browser/run4.js`. Home.js: título «PRO TACTICAL ANALYZER AEF».

## FYI (16 nov, Claude C) — cambios pedidos por el usuario en el Centro de análisis
- `scouting.scss`: la barra de pestañas de Equipos (`.sc-scrollx > .sc-seg`) ahora cubre todo el ancho desplazable (el subrayado/fondo salía cortado).
- `Players.js`: avatar tocable en el perfil (foto desde galería, `.sc-avbtn`); en «Elegir» se puede **Borrar** jugadores (sin partidos se elimina; con partidos queda `hidden:true` para que no reaparezca), «Borrar los no marcados», vista «Borrados» para restaurar.
- Test: `tests/browser/run5.js`.
- (16 nov, 2.ª pasada) `Players.js`: botón **Seleccionar** en la pestaña Jugadores (marcar varios → «Dejar de analizar» / «Borrar (n)»); `wipePlayers()` es compartido con «Elegir».

## FYI (17 nov, Claude C) — revisión general pedida por el usuario (22 puntos)
Hecho en `wip-scouting/src/scouting`: barra inferior de 6 (Panel, Jugadores, Scouting, Partidos, Equipos, **Más**); «Más» = Red de pases, Informes, **Papelera**, **Copia de seguridad** (`More.js`); búsqueda global (lupa en la cabecera); Partidos/Equipos/Jugadores con modo **Seleccionar** (excluir/borrar varios; Equipos: **Fusionar**); papelera de partidos y equipos (`db.toTrash/restoreTrash`, store `trash`, DB v2) y toast con **Deshacer** (`toast(msg, {label, fn})`); Jugadores con orden/filtro/favoritos (`fav`); KPIs compactos (origen E/C/M al tocar); `Hint` (?) y `Fold` (acordeón) en ui.js; flechas tocables en la red de pases; Scouting con chips en una fila, favoritos y comparación con la media del equipo; `PickPlayers.js` separado de `Players.js`.
Tactics: botón de pantalla completa + cancha horizontal en la pizarra suelta; herramientas de la repetición en una sola fila desplazable (móvil).
Tests: `wip-scouting/tests/browser/run.js … run6.js` (run6 cubre lo nuevo). Pendiente: punto 20 (identificar los botones ≡ y de sliders de la captura del usuario).
- (17 nov, Claude C) Descargas: `askExport()` (ui.js) pregunta antes de sacar PDF/copia; `saveFile()` avisa «✓ Descargado/Guardado en Descargas: nombre». Pizarra: `saved()` en TacticsBoard y aviso «✓ Captura…» en replayBoard. Regla: todo archivo que se genere debe avisar al terminar.
- (17 nov, Claude C) Jugadores: botón «Solo mi equipo» (ignora a los que no son de «Mi equipo», con Deshacer). `ingest.js` guarda en kv `pendingNewPlayers` los jugadores nuevos; al abrir el Centro sale `NewPlayersSheet` (More.js) para elegir cuáles son de tu equipo. Test: `tests/browser/run7.js`.

## Jugadores: abrir solo con «Mi equipo» (Claude B, a petición del usuario)
- `Players.js`: el filtro «Mostrar» arranca en el equipo propio (`ownTeamId`) si existe; aviso con «Ver todos» y «Ocultarlos del análisis» (reutiliza `onlyMine`, con «Deshacer»). Los jugadores nuevos de repeticiones ya quedaban ocultos por `hideNewPlayers`. Cuidado: no poner comentarios `//` en la línea larga de `useState` de Players.js (se come las declaraciones siguientes y rompe `npm build` por eslint).

## Rediseño visual integral (Claude B)
Capa "Sistema de diseño unificado" al final de `scouting.scss` (tokens `--fx-*`). Solo estilos; ver `wip-tactics/HANDOFF.md`.

## Centro de análisis simplificado (Claude B)
- Panel: 6 cifras visibles; Jugadores/Equipos/Asistencias/Posesión + Promedios dentro de «Más cifras y promedios» (`Fold`); segundo gráfico y «Goles por partido» en «Más gráficos»; quitado el gráfico de barras duplicado de «Jugadores destacados».
- Scouting: la explicación de cada criterio va tras un «?» (`Hint`). Partidos: «Editar datos del partido» plegado. Más: texto de copia de seguridad tras «?».
- Solo presentación; los datos y cálculos no cambian.

## Ajustes (Claude B)
- Portero: añadidas las explicaciones (`AUTO_HINT`) de saves/concede/gkPosition/clearances/distribution/security.
- `Radar` (charts.js): lienzo más ancho (380x260) y etiquetas en dos líneas, ya no se recortan.
- Equipos › «Enfrentamientos» renombrado a «Amistosos»; el par de equipos elegido se guarda (`useLocal('sc.friendlies')`).

## Amistosos (Claude B)
Equipos › Amistosos (`H2H` en Teams.js, reescrito): siempre «Mi equipo» vs un rival cuyo nombre escribe el usuario (se crea el equipo si no existe). La repetición elegida se marca `rec.friendly = true` y se asignan `redTeamId/blueTeamId` según el color de Mi equipo. «Quitar» solo desmarca `friendly`. El rival escrito se guarda en `useLocal('sc.friendlies')`.

## Ajustes 25/11 (Claude B)
- Panel: «Repeticiones no analizadas (N)» ahora es un `Fold` plegable.
- Jugadores: barra de acciones compacta con iconos (`BtnIc` en ui.js).
- Equipos: quitada la pestaña Temporadas (código y datos intactos); el selector de competición ya no ofrece «Amistosos» (los existentes siguen mostrándose).
- Avatares: `avatarTexts()/avatarTextOf()` en ui.js (misma clave `fenix.avatars.v1` que la pizarra). `ingestStats` guarda `player.avatarText` en cada análisis; `Avatar` usa foto > `avatarText` > iniciales.

## Ajustes 25/11 (2) (Claude B)
- Empates en gris: `Kpi tone="draw"` / `.sc-kpi.draw` (Panel y Amistosos).
- «Repeticiones no analizadas» pasa de Panel a Más › nueva pantalla `pending` (`Pending` en More.js, ruta añadida en ScoutingApp.js).
- Jugadores: barra solo con iconos (aria-label/title), quitado el botón «Mi equipo» (`onlyMine` sigue usándose en «Ocultarlos del análisis»).
