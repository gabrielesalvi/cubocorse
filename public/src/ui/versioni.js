// Versioni delle piste nel gioco (21-11-2026, Cubo Corse 1.0): registro data/versioni-piste.json, scritto da
// tools/versioni-piste.mjs (la versione nuova la decide Gabriele: nell'editor di Circuit Studio o quando l'impronta di una
// pista cambia). I record e i ghost si salvano con la chiave «pista@vN»: una classifica per versione, l'attuale in vista.
let REG = null;

export async function caricaVersioni() {
  try { REG = await (await fetch('data/versioni-piste.json', { cache: 'no-cache' })).json(); } catch (e) { console.warn('versioni delle piste', e); REG = null; }
}
/** storia della pista (dalla prima alla più recente): [{ v, dal, gioco, nota }] */
export function storiaPista(id) { return REG?.piste?.[id] || [{ v: 1, dal: null, gioco: null, nota: '' }]; }
/** versione attuale della pista */
export function versionePista(id) { return storiaPista(id).at(-1).v; }
/** chiave dei record e dei ghost */
export const chiaveRecord = (id, v) => `${id}@v${v}`;
