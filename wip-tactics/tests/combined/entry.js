import * as db from '../../../wip-scouting/src/scouting/db.js';
import * as ingest from '../../../wip-scouting/src/scouting/ingest.js';
import { scoutingPlayers } from '../../src/tactics/scoutingProvider.js.optional';
import '../../../wip-scouting/tests/browser/gen.js';
window.__db = db; window.__ingest = ingest; window.__prov = scoutingPlayers;
