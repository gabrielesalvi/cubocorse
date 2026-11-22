// Nomi in classifica (fase 1, 22-11-2026, decisioni di Gabriele):
// - filtro per parolacce e nomi offensivi: lista in data/nomi-vietati.json (la correggi tu), stesso controllo nel gioco e,
//   con la classifica mondiale, sul server (lì decide il server);
// - nome già usato da un altro giocatore: SOLO un avviso, non blocca. Predisposto: finché non c'è il server la risposta è
//   sempre «libero» (CLASSIFICA = null); con la fase 3 verificaNome chiederà al server.
// Il confronto usa il nome normalizzato (normalizza): minuscole, senza accenti, k→c, j→i, y→i, w→v, ph→f, lettere ripetute
// ridotte a una. Così CAAAZZO, Kazzo e cazzo sono la stessa parola.

/** indirizzo del server della classifica mondiale (fase 3); null = non c'è ancora */
export const CLASSIFICA = null;
/** solo per le prove (tests/nome-browser.py): nomi «già usati» finti (chiaveNome), al posto del server */
export const PROVA = { usati: null };

export function normalizza(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f').replace(/k/g, 'c').replace(/j/g, 'i').replace(/y/g, 'i').replace(/w/g, 'v')
    .replace(/(.)\1+/g, '$1');
}

/** chiave per «nome già usato»: ignora solo maiuscole e accenti (Rossi = ROSSI = Rossì, ma Rosi ≠ Rossi). La userà anche il server */
export const chiaveNome = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/** prepara la lista (già normalizzata) dal JSON */
export function preparaLista(j) {
  const n = (a) => [...new Set((a || []).map(normalizza).filter(Boolean))];
  // «ovunque» e «inizio» solo con parole di almeno 3 lettere normalizzate: una parola di 1-2 lettere bloccherebbe mezzo vocabolario
  return { ovunque: n(j.ovunque).filter((w) => w.length >= 3), inizio: n(j.inizio).filter((w) => w.length >= 3), intero: n(j.intero), eccezioni: new Set(n(j.eccezioni)) };
}

/** il nome tocca la lista? Ritorna la regola e la parola (per i test), oppure null */
export function controllaNome(nome, L) {
  const x = normalizza(nome);
  if (!x || !L || L.eccezioni.has(x)) return null;
  for (const w of L.intero) if (x === w) return { regola: 'intero', parola: w };
  for (const w of L.inizio) if (x.startsWith(w)) return { regola: 'inizio', parola: w };
  for (const w of L.ovunque) if (x.includes(w)) return { regola: 'ovunque', parola: w };
  // nome tagliato a 8 lettere (il massimo): MUSSOLINI diventa MUSSOLIN, RICCHIONE diventa RICCHION. Se il nome lungo 8 è
  // l'inizio di una parola «ovunque» più lunga, conta come quella parola
  const pieno = String(nome).replace(/[^\p{L}]/gu, '').length >= 8;
  if (pieno && x.length >= 5) for (const w of L.ovunque) if (w.length > x.length && w.startsWith(x)) return { regola: 'tagliato', parola: w };
  return null;
}

let LISTA = null, caricamento = null;
/** carica la lista dal sito (una volta); se non si carica, il filtro lascia passare (meglio che bloccare tutti) */
export function caricaLista() {
  if (LISTA) return Promise.resolve(LISTA);
  if (!caricamento) caricamento = fetch('data/nomi-vietati.json', { cache: 'no-cache' }).then((r) => r.json()).then((j) => (LISTA = preparaLista(j)))
    .catch((e) => { console.warn('lista dei nomi vietati', e); caricamento = null; return null; });
  return caricamento;
}

/** controllo immediato con la lista già caricata (uscita dai risultati senza OK: non si può aspettare) */
export const vietatoSubito = (nome) => !!controllaNome(nome, LISTA);

/**
 * Controllo di un nome prima di salvarlo: { vietato, usato }.
 * vietato = tocca la lista (il nome non si può usare); usato = un ALTRO giocatore ha già questo nome nella classifica
 * mondiale (solo avviso: il gioco lo mostra sotto la casella mentre scrivi, e OK salva al primo clic). Senza server
 * usato è sempre false.
 */
export async function verificaNome(nome) {
  const L = await caricaLista();
  const vietato = !!controllaNome(nome, L);
  let usato = false;
  if (!vietato && PROVA.usati) usato = PROVA.usati.has(chiaveNome(nome));
  else if (!vietato && CLASSIFICA) {
    // fase 3: GET {CLASSIFICA}/nome?n=…&g=<identificativo> → { usato: bool } (il server non dice chi è l'altro giocatore)
    try { usato = !!(await (await fetch(`${CLASSIFICA}/nome?n=${encodeURIComponent(nome)}`)).json()).usato; } catch { usato = false; }
  }
  return { vietato, usato };
}
