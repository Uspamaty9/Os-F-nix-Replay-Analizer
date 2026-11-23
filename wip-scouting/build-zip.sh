#!/usr/bin/env bash
# Arma el zip v4 desde el v3 (intacto) + módulos nuevos + parches. Uso: bash wip-scouting/build-zip.sh   (desde la raíz del repo)
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"; V3="$R/Os-Fenix-Replay-Analyzer-Motor-Reproduccion-v3.zip"; OUT="$R/Os-Fenix-Replay-Analyzer-Motor-Reproduccion-v4-Scouting.zip"
T="$(mktemp -d)"; cd "$T"; unzip -q "$V3"; PRJ="$T/haxball-replay-analyzer.github.io-react"; P="$PRJ/src"
cp -r "$R/wip-scouting/src/scouting" "$P/"                       # centro de análisis
cp "$R/wip-scouting/src/extras.js" "$R/wip-scouting/src/settings.js" "$P/"
cp "$R/wip-scouting/src/components/"*.js "$R/wip-scouting/src/components/"*.scss "$P/components/"   # Home, Ajustes, pantalla Analizando…
rm -f "$P/components/ThemeEditor.js"                              # temas quitados
cp "$R/wip-scouting/brand/app.png" "$P/../public/brand/app.png"   # icono de la app
cp -r "$R/wip-tactics/src/tactics" "$P/"; mv "$P/tactics/scoutingProvider.js.optional" "$P/tactics/scoutingProvider.js"
python3 "$R/wip-tactics/integrate.py" "$P/index.js"               # pizarra sobre la repetición (2 líneas)
( cd "$PRJ" && patch -p1 < "$R/wip-scouting/patches/game2-sin-espera.patch" )   # entrar directo a la repetición
( cd "$PRJ" && patch -p1 < "$R/wip-scouting/patches/game2-cartel-gol.patch" )   # el motor avisa cuándo dibuja el cartel de gol (para las sombras)
( cd "$PRJ" && patch -p1 < "$R/wip-scouting/patches/game2-capa-pizarra.patch" )   # capa de la pizarra bajo jugadores y aviso al salir de la repetición
( cd "$PRJ" && patch -p1 < "$R/wip-scouting/patches/fluidez.patch" )   # cámara cine con velocidad real del balón y grabación de video con cadencia pareja
( cd "$PRJ" && patch -p1 < "$R/wip-scouting/patches/game2-fin-repeticion.patch" )   # aviso al llegar al final de la repetición (partidos unidos seguidos)
rm -f "$OUT"; zip -qr "$OUT" haxball-replay-analyzer.github.io-react; echo "OK $OUT"; echo "$T" > /tmp/build-zip-last
