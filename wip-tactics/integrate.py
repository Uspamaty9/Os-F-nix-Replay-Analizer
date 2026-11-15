#!/usr/bin/env python3
"""Aplica la integración de la Pizarra táctica a un Home.js del analizador (v3 o el ya integrado con scouting).
Uso: python3 integrate.py RUTA/Home.js [--with-scouting]
Idempotente: si ya está aplicada no cambia nada. No toca game2.js ni slices."""
import sys, re
p = sys.argv[1]; scout = '--with-scouting' in sys.argv
s = open(p, encoding='utf-8').read()
if 'TacticsBoard' in s:
    print('ya integrado'); sys.exit(0)
def rep(a, b, count=1):
    global s
    assert a in s, 'no se encontró: ' + a[:70]
    s = s.replace(a, b, count)
# 1) import
rep("import ReplayFav from './ReplayFav';", "import ReplayFav from './ReplayFav';\nimport TacticsBoard from '../tactics/TacticsBoard';" + ("\nimport { scoutingPlayers } from '../tactics/scoutingProvider';" if scout else ''))
# 2) estado: junto a mainMode
rep("  const mainMode = useSelector((state) => state.mainMode.value);", "  const mainMode = useSelector((state) => state.mainMode.value);\n  const [showTactics, setShowTactics] = useState(false);")
# 3) atajos de Home no deben actuar con la pizarra abierta
rep(".fh-hbr-overlay, .fenix-exit-overlay')) return;", ".fh-hbr-overlay, .fenix-exit-overlay, .tx-root')) return;")
# 4) botón bajo «Importar repetición»
rep("""              <input id='replayfile' type='file' accept='.hbr2,application/octet-stream' multiple data-hook='replayfile' onClick={(e) => { e.target.value = null; }} onChange={handleChange} />
            </div>""", """              <input id='replayfile' type='file' accept='.hbr2,application/octet-stream' multiple data-hook='replayfile' onClick={(e) => { e.target.value = null; }} onChange={handleChange} />
            </div>
            <button type='button' className='fh-tactics' onClick={() => setShowTactics(true)}>
              <svg width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'><rect x='3' y='5' width='18' height='14' rx='2' /><path d='M12 5v14' /><circle cx='12' cy='12' r='2.6' /></svg>
              <span>Pizarra táctica</span>
            </button>""")
# 5) render
rep("      {mainMode === 'replays' && <ReplaysList />}", "      {mainMode === 'replays' && <ReplaysList />}\n      {showTactics && <TacticsBoard onClose={() => setShowTactics(false)}" + (" playerProvider={scoutingPlayers}" if scout else '') + " />}")
open(p, 'w', encoding='utf-8').write(s)
print('integrado' + (' (con scouting)' if scout else ''))
