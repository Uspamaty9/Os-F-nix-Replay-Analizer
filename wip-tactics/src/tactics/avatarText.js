// Avatares de HaxBall: texto de 1–2 caracteres que se dibuja sobre cada jugador en la repetición.
// El motor (parche game2-avatares) los publica en window.__fenixAvatars {nick en minúsculas: texto} mientras se reproduce;
// aquí se guardan en localStorage para que sigan disponibles aunque ya no haya una repetición abierta.
const KEY = 'fenix.avatars.v1';
const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

function readStored() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

export function avatarTexts() {
  const stored = readStored();
  let live = {};
  try { live = window.__fenixAvatars || {}; } catch (e) { live = {}; }
  const merged = { ...stored, ...live };
  try { if (window.__fenixAvatarsDirty) { localStorage.setItem(KEY, JSON.stringify(merged)); window.__fenixAvatarsDirty = false; } } catch (e) { /* sin almacenamiento */ }
  return merged;
}

// Texto de avatar del jugador (por apodo o alias), o null si la repetición nunca lo mostró
export function avatarOf(map, r) {
  const names = [r.nick, ...(r.aliases || [])];
  for (const n of names) { const v = map[norm(n)]; if (v) return v; }
  return null;
}
