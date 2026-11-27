// Lavori lunghi a pezzi (27-11-2026, Gabriele: «la rotazione della macchina nella home è laggante mentre la pista viene
// caricata»). La pista si costruisce sullo stesso filo che disegna il menu: ogni calcolo di più fotogrammi fermava la
// vetrina. Chi fa un lavoro lungo chiama `await cediSeServe()` spesso: se dall'ultima pausa è passato più del budget
// aspetta che il browser disegni un fotogramma (requestAnimationFrame, poi un compito nuovo dopo il disegno), altrimenti
// non costa niente. Con la scheda nascosta requestAnimationFrame non arriva: dopo 50 ms si va avanti lo stesso.
// 24 ms di lavoro per pezzo (la vetrina gira a 25-30 fps durante il caricamento); se il fotogramma costa di più (telefono
// lento, browser senza scheda video) il pezzo si allunga quanto l'attesa: mai più di metà del tempo passato ad aspettare
let budget = 24, ultimo = performance.now();

export function cedi() {
  const t0 = performance.now();
  return new Promise((r) => {
    let fatto = false;
    const via = () => {
      if (fatto) return;
      fatto = true; ultimo = performance.now();
      budget = Math.min(200, Math.max(24, ultimo - t0));
      r();
    };
    requestAnimationFrame(() => setTimeout(via, 0));
    setTimeout(via, 50);
  });
}
export const serveCedere = () => performance.now() - ultimo > budget;
/** null se non serve (await null costa niente), altrimenti la promessa del prossimo fotogramma */
export const cediSeServe = () => (serveCedere() ? cedi() : null);

/** esegue un generatore di calcolo: sincrono (test, node) o a pezzi (browser) */
export function finisci(gen) { let r; while (!(r = gen.next()).done); return r.value; }
export async function finisciAPezzi(gen) { let r; while (!(r = gen.next()).done) await cediSeServe(); return r.value; }
