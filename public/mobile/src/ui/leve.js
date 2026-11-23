// Leva analogica dello sterzo e cursore verticale di gas e freno (fase 2e, 23-11-2026, decisioni di Gabriele: sterzo a
// tasti, leva o inclinazione e pedali a tasti o cursore, tutti combinabili; il cursore deve dosare gas e freno).
// Qui solo le formule, senza pagina né three: le usano tocco.js e i test in Node (tests/leve.mjs).
//  - leva: nasce dove appoggi il pollice (come in Ciapa la 6: tecnica imparata, codice non copiato); conta lo spostamento
//    orizzontale diviso il raggio, con la stessa curva della levetta del controller (pad.js PREDEFINITI.sterzo); oltre
//    INSEGUE raggi il centro segue il pollice, così tornando indietro il centro non si perde;
//  - cursore: posizione ASSOLUTA lungo la barra (0 = in fondo, 1 = in cima); sopra la tacca gas, sotto freno, tutti e due
//    dosabili; fascia alta di gas pieno e fascia bassa di freno pieno, per non dover essere precisi quando serve tutto.

/** valori da ritoccare dopo le prove sul telefono */
export const LEVA = {
  raggio: { pronta: 0.09, media: 0.12, dolce: 0.16 },   // frazione dell'altezza dello schermo (raggio pieno = sterzo pieno)
  raggioMin: 40,                                        // px CSS
  insegue: 1.5,                                         // oltre 1,5 raggi il centro segue il pollice
  curva: { zm: 0.06, curva: 1.5, fine: 0.95 },          // come la levetta del controller
  filtro: 0.03,                                         // s: contro il tremolio del pollice
  ritorno: 10,                                          // 1/s: dito alzato → sterzo al centro in ~0,1 s
};
export const CURSORE = {
  tacca: 0.5,          // dove sta la zona neutra (frazione dell'altezza della barra, dal basso)
  neutro: 0.04,        // mezza zona neutra (8% in tutto)
  gasPieno: 0.8,       // da qui in su gas al 100%
  frenoPieno: 0.15,    // da qui in giù freno al 100%
  curvaGas: 1.0,       // come il grilletto del gas del controller
  curvaFreno: 1.3,     // come il freno del controller: più facile frenare poco
  filtro: 0.04,        // s
};

/** curva di risposta (la stessa formula di pad.js risposta: pad.js non si importa in Node, ha ascoltatori sulla pagina) */
export function risposta(x, p) {
  const a = Math.abs(x);
  if (a <= p.zm) return 0;
  const u = Math.min(1, (a - p.zm) / Math.max(0.05, p.fine - p.zm));
  return Math.sign(x) * Math.pow(u, p.curva);
}

/** raggio della leva in px per uno schermo alto `altezza` px e la sensibilità scelta */
export function raggioLeva(altezza, sens = 'media') {
  return Math.max(LEVA.raggioMin, altezza * (LEVA.raggio[sens] || LEVA.raggio.media));
}

/**
 * leva: dal centro (ox) e dal pollice (x) allo sterzo −1..1. Ritorna { ox, valore, grezzo }: ox è il centro, spostato se il
 * pollice è andato oltre INSEGUE raggi.
 */
export function leggiLeva(ox, x, raggio) {
  let dx = x - ox;
  const max = raggio * LEVA.insegue;
  if (Math.abs(dx) > max) { ox += dx - Math.sign(dx) * max; dx = x - ox; }
  const grezzo = Math.max(-1, Math.min(1, dx / raggio));
  return { ox, grezzo, valore: risposta(grezzo, LEVA.curva) };
}

/** cursore: posizione 0..1 (dal basso) → { gas, freno } dosati */
export function leggiCursore(u) {
  const C = CURSORE, su = C.tacca + C.neutro, giu = C.tacca - C.neutro;
  u = Math.max(0, Math.min(1, u));
  if (u >= su) return { gas: Math.pow(Math.min(1, (u - su) / Math.max(0.01, C.gasPieno - su)), C.curvaGas), freno: 0 };
  if (u <= giu) return { gas: 0, freno: Math.pow(Math.min(1, (giu - u) / Math.max(0.01, giu - C.frenoPieno)), C.curvaFreno) };
  return { gas: 0, freno: 0 };
}

/** posizione sul cursore (0..1 dal basso) dell'altezza y in px, data la barra (top, bottom in px) */
export function posizioneCursore(y, top, bottom) {
  return Math.max(0, Math.min(1, (bottom - y) / Math.max(1, bottom - top)));
}
