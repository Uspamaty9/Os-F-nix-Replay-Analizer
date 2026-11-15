export async function getMeta(id) { return { id, name: 'Replay ' + id, signature: 'r|1|' + (window.__lm && window.__lm[id] || Date.now()), addedAt: Date.now() }; }
export async function listReplays() { return [{ id: 'old1', name: 'partida-antigua.hbr2', addedAt: Date.now() - 864e5 * 3, info: { red: 'Rojo', blue: 'Azul' } }]; }
