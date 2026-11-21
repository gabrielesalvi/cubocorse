// Cubo Corse unito (fase 0): modelli delle auto di Circuit Studio (guida/src/gfx/auto3d.js al 19-11). Le sagome si scelgono con
// spec.forma (falco, vespro, orsa = Astore, Calabrone, Airone), perché gli id delle auto sono cambiati.
// Auto delle tre GT, versione 5 (09-11-2026). Le versioni precedenti sono in guida/archivio/ (auto3d-v4.js = l'ultima prima di questa).
// Forme proprie, solo ispirate alle GT vere: Falco (motore anteriore, cofano lungo), Vespro (motore a sbalzo dietro, parafanghi
// alti sul cofano basso, tetto ad arco), Orsa (motore centrale, bassa, cupola stretta, coda lunga).
//
// Carrozzeria = loft di sezioni trasversali. Ogni sezione ha gli stessi 9 "binari" (punti), dal centro del fondo al centro del tetto:
//   P0 fondo al centro · P1 bordo del fondo · P1b angolo del passaruota · P2 sottoporta (o bordo dell'arco) · P3 spigolo di massima
//   larghezza (labbro del parafango sopra le ruote) · P4 spalla · P5 cintura (o cresta del parafango) · P6 bordo del tetto (o metà
//   cofano) · P7 centro in alto.
// I binari seguono curve di profilo e di pianta interpolate con PCHIP (monotone: niente gobbe fra le chiavi). Sopra le ruote il
// sottoporta sale sull'arco e il fondo rientra: il passaruota è un tunnel scuro vero, con il labbro che segue l'arco.
// Vetri e fasce sono facce della griglia (bordi netti, allineati ai binari); fari, fanali, prese e strisce della livrea sono
// decalcomanie proiettate sulla carrozzeria con un raggio (seguono la superficie in tutti gli stili).
// Stili: lowpoly (poche sezioni, facce piatte), attuale (facce piatte più fitte), realistico (superfici lisce con normali calcolate
// sulla griglia, spigoli voluti, vernice con clearcoat, vetri, cerchi metallici).
// Sistema locale: x avanti (origine nel baricentro: asse anteriore +a, posteriore -b), y in alto, z a destra.
import * as THREE from 'three';

const hexStr = (c) => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c);
const COL = {
  vetro: '#151c24', scuro: '#141518', griglia: '#1d1f23', chiaro: '#b9bec4', fondo: '#121315', carbonio: '#1f2024', cornice: '#0d0e10',
  passaruota: '#0c0d0f', rete: '#2a2c31',
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** interpolazione monotona a tratti cubici (Fritsch-Carlson): passa per le chiavi senza oscillare */
function curva(K) {
  const P = [...K].sort((p, q) => p[0] - q[0]), n = P.length, X = P.map((p) => p[0]), Y = P.map((p) => p[1]);
  if (n === 1) return () => Y[0];
  const h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h[i] = X[i + 1] - X[i]; d[i] = (Y[i + 1] - Y[i]) / h[i]; }
  const m = new Array(n); m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= X[0]) return Y[0];
    if (x >= X[n - 1]) return Y[n - 1];
    let i = 0; while (x > X[i + 1]) i++;
    const t = (x - X[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

// ------------------------------------------------------------------ forme 2D per le decalcomanie
const ell = (cu, cv, ru, rv, rot = 0, n = 20) => Array.from({ length: n }, (_, k) => {
  const a = (2 * Math.PI * k) / n, u = Math.cos(a) * ru, v = Math.sin(a) * rv;
  return [cu + u * Math.cos(rot) - v * Math.sin(rot), cv + u * Math.sin(rot) + v * Math.cos(rot)];
});
const rett = (cu, cv, w, h, r = 0, rot = 0) => {
  const P = [], q = Math.min(r, w / 2, h / 2), seg = q > 0 ? 3 : 0;
  for (const [sx, sy, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]]) {
    const cx = sx * (w / 2 - q), cy = sy * (h / 2 - q);
    for (let k = 0; k <= seg; k++) { const a = a0 + (Math.PI / 2) * (seg ? k / seg : 0); P.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  }
  return P.map(([u, v]) => [cu + u * Math.cos(rot) - v * Math.sin(rot), cv + u * Math.sin(rot) + v * Math.cos(rot)]);
};
/** n strisce sottili (feritoie) affiancate lungo u */
const strisce = (n, u0, u1, cv, h, w, rot = 0) => Array.from({ length: n }, (_, k) => rett(u0 + ((u1 - u0) * (k + 0.5)) / n, cv, w, h, 0, rot));
/** striscia lungo u fra due bordi v0(u), v1(u) (per fasce della livrea che cambiano altezza) */
const fascia = (u0, u1, v0, v1, n = 24) => {
  const A = [], B = [];
  for (let k = 0; k <= n; k++) { const u = lerp(u0, u1, k / n); A.push([u, v0(u)]); B.push([u, v1(u)]); }
  return A.concat(B.reverse());
};

// ------------------------------------------------------------------ i tre progetti
// Curve: [x, valore] (m). yc = profilo al centro, ysh = spalla, rb/ib = cintura sopra/dentro la spalla, wm = mezza larghezza
// massima (prima dei parafanghi), wsh = mezza larghezza della spalla, ym = altezza dello spigolo, wr = mezza larghezza del tetto,
// cab = quanto la sezione è abitacolo (0 cofano, 1 tetto), yb = fondo, ysill = sottoporta. flare = parafanghi gonfi sulle ruote.
// vetri: x del parabrezza, dei laterali (fine) e del lunotto; tLat = parte vetrata della fascia cintura→tetto, tSup = montante.
export const MODELLI = {
  // Falco GT8: cofano lunghissimo con la cupola, abitacolo arretrato, fastback corto e coda tronca alta. Muso largo con una
  // bocca unica bassa, fari sottili e affilati agli angoli, feritoie sui parafanghi davanti, scarichi laterali.
  falco: {
    xF: 2.41, xR: -2.35, larghezza: 2.04,
    yc: [[2.41, 0.52], [2.36, 0.60], [2.25, 0.655], [2.0, 0.71], [1.5, 0.77], [1.0, 0.815], [0.56, 0.85], [0.22, 1.04], [-0.10, 1.19],
      [-0.40, 1.225], [-0.75, 1.20], [-1.15, 1.10], [-1.55, 0.995], [-1.85, 0.955], [-2.12, 0.94], [-2.28, 0.91], [-2.35, 0.85]],
    cab: [[0.74, 0], [0.57, 1], [-1.42, 1], [-1.68, 0]],
    wr: [[0.57, 0.78], [0.30, 0.67], [-0.10, 0.61], [-0.75, 0.60], [-1.3, 0.65], [-1.6, 0.74]],
    ysh: [[2.41, 0.48], [2.30, 0.61], [2.0, 0.69], [1.33, 0.72], [0.8, 0.73], [0.3, 0.75], [-0.5, 0.765], [-1.30, 0.80], [-1.9, 0.83], [-2.25, 0.80], [-2.35, 0.74]],
    rb: [[2.41, 0.015], [1.8, 0.04], [1.33, 0.045], [0.8, 0.03], [0.5, 0.035], [-1.5, 0.035], [-2.35, 0.02]],
    ib: [[2.41, 0.08], [1.33, 0.11], [0.6, 0.085], [-1.5, 0.085], [-2.35, 0.08]],
    wm: [[2.41, 0.84], [2.33, 0.91], [2.15, 0.95], [1.8, 0.965], [0, 0.965], [-1.9, 0.975], [-2.20, 0.95], [-2.35, 0.87]],
    wsh: [[2.41, 0.72], [2.30, 0.80], [2.0, 0.84], [1.0, 0.85], [0, 0.85], [-1.3, 0.87], [-2.2, 0.86], [-2.35, 0.79]],
    ym: [[2.41, 0.36], [2.2, 0.43], [1.33, 0.50], [0, 0.52], [-1.3, 0.54], [-2.35, 0.52]],
    yb: [[2.41, 0.11], [2.0, 0.08], [-1.7, 0.08], [-2.35, 0.27]],
    ysill: [[2.41, 0.15], [1.7, 0.165], [-1.7, 0.175], [-2.35, 0.30]],
    flare: { f: 0.035, r: 0.045, l: 0.75 },
    vetri: { parabrezza: [-0.08, 0.555], laterale: -1.22, lunotto: [-1.48, -0.74], tLat: [0.16, 0.9], tSup: 0.13 },
    ruote: { r: 0.352 }, cerchi: '#2a2c30',
    occhio: [-0.62, 1.0, -0.32], cofano: [0.72, 1.06], numero: -0.42, numeroTetto: -0.45,
  },
  // Vespro RS: muso corto fra due parafanghi pronunciati con i fari sul fronte, tetto ad arco che scende fino alla coda,
  // fianchi posteriori larghi con le prese, cofano motore a feritoie, ala alta su due piloni.
  vespro: {
    xF: 2.54, xR: -2.06, larghezza: 2.00,
    yc: [[2.54, 0.50], [2.47, 0.585], [2.35, 0.635], [2.0, 0.69], [1.6, 0.74], [1.25, 0.795], [1.13, 0.815], [0.85, 1.02], [0.55, 1.19],
      [0.20, 1.255], [-0.10, 1.25], [-0.50, 1.19], [-0.95, 1.075], [-1.40, 0.955], [-1.78, 0.885], [-1.97, 0.895], [-2.06, 0.83]],
    cab: [[1.28, 0], [1.14, 1], [-1.0, 1], [-1.30, 0]],
    wr: [[1.14, 0.75], [0.85, 0.65], [0.5, 0.60], [-0.3, 0.585], [-0.8, 0.61], [-1.2, 0.68]],
    ysh: [[2.54, 0.47], [2.42, 0.61], [2.1, 0.68], [1.52, 0.72], [1.0, 0.725], [0.4, 0.755], [-0.3, 0.785], [-0.94, 0.84], [-1.6, 0.84], [-1.95, 0.80], [-2.06, 0.73]],
    rb: [[2.54, 0.02], [2.3, 0.045], [1.6, 0.05], [1.15, 0.04], [0.9, 0.03], [-1.2, 0.03], [-2.06, 0.02]],
    ib: [[2.54, 0.12], [2.2, 0.12], [1.52, 0.11], [1.0, 0.09], [0.9, 0.085], [-2.06, 0.085]],
    wm: [[2.54, 0.84], [2.46, 0.91], [2.25, 0.94], [1.8, 0.95], [0.5, 0.95], [-0.5, 0.955], [-1.3, 0.97], [-1.8, 0.965], [-2.0, 0.93], [-2.06, 0.85]],
    wsh: [[2.54, 0.72], [2.42, 0.80], [2.1, 0.83], [1.0, 0.83], [0, 0.835], [-0.94, 0.87], [-1.8, 0.87], [-2.06, 0.78]],
    ym: [[2.54, 0.36], [2.3, 0.43], [1.5, 0.50], [0, 0.52], [-1.0, 0.56], [-2.06, 0.54]],
    yb: [[2.54, 0.11], [2.2, 0.08], [-1.4, 0.08], [-2.06, 0.26]],
    ysill: [[2.54, 0.15], [1.5, 0.165], [-1.0, 0.175], [-2.06, 0.29]],
    flare: { f: 0.035, r: 0.06, l: 0.72 },
    vetri: { parabrezza: [0.52, 1.125], laterale: -0.62, lunotto: [-1.12, -0.40], tLat: [0.16, 0.9], tSup: 0.13 },
    ruote: { r: 0.352 }, cerchi: '#c9ced3',
    occhio: [0.05, 1.04, -0.32], cofano: [1.30, 0.98], numero: -0.10, numeroTetto: -0.25,
  },
  // Orsa LT: bassa, muso largo e corto con la presa al centro, cupola a goccia con la presa sul tetto, grandi prese dietro
  // le porte, coda lunga e piatta con l'ala in fondo.
  orsa: {
    xF: 2.40, xR: -2.54, larghezza: 1.98,
    yc: [[2.40, 0.43], [2.34, 0.51], [2.2, 0.57], [1.8, 0.645], [1.3, 0.69], [0.95, 0.72], [0.82, 0.735], [0.45, 0.93], [0.12, 1.075],
      [-0.15, 1.115], [-0.45, 1.09], [-0.72, 1.0], [-1.0, 0.925], [-1.5, 0.875], [-2.0, 0.845], [-2.35, 0.815], [-2.48, 0.78], [-2.54, 0.73]],
    cab: [[0.97, 0], [0.83, 1], [-0.62, 1], [-0.92, 0]],
    wr: [[0.83, 0.70], [0.5, 0.59], [0.1, 0.52], [-0.3, 0.51], [-0.62, 0.56]],
    ysh: [[2.40, 0.41], [2.25, 0.53], [1.9, 0.64], [1.5, 0.67], [0.9, 0.655], [0.4, 0.665], [-0.3, 0.705], [-1.22, 0.765], [-1.9, 0.775], [-2.4, 0.74], [-2.54, 0.67]],
    rb: [[2.40, 0.02], [2.0, 0.035], [1.5, 0.04], [1.0, 0.03], [0.8, 0.03], [-0.6, 0.03], [-1.0, 0.025], [-2.54, 0.02]],
    ib: [[2.40, 0.10], [1.5, 0.12], [0.83, 0.11], [-0.4, 0.13], [-0.8, 0.11], [-2.54, 0.10]],
    wm: [[2.40, 0.82], [2.32, 0.89], [2.1, 0.925], [1.6, 0.935], [0.6, 0.93], [-0.2, 0.935], [-1.0, 0.955], [-1.9, 0.96], [-2.35, 0.94], [-2.54, 0.86]],
    wsh: [[2.40, 0.70], [2.25, 0.79], [1.8, 0.81], [0.8, 0.80], [-0.2, 0.80], [-1.2, 0.85], [-2.3, 0.85], [-2.54, 0.78]],
    ym: [[2.40, 0.32], [2.2, 0.39], [1.5, 0.47], [0, 0.48], [-1.2, 0.53], [-2.54, 0.52]],
    yb: [[2.40, 0.10], [2.1, 0.075], [-1.8, 0.075], [-2.54, 0.25]],
    ysill: [[2.40, 0.14], [1.8, 0.15], [-1.8, 0.16], [-2.54, 0.28]],
    flare: { f: 0.035, r: 0.04, l: 0.72 },
    vetri: { parabrezza: [0.10, 0.825], laterale: -0.50, lunotto: null, tLat: [0.16, 0.9], tSup: 0.12 },
    ruote: { r: 0.345 }, cerchi: '#d4d7db',
    occhio: [0.05, 0.97, 0], cofano: [1.20, 0.95], numero: 0.40, numeroTetto: 1.36,
  },
};

// dettagli di ogni auto (decalcomanie e pezzi): funzioni della livrea L e delle misure (S = sezione, h = altezza sul centro)
const DETTAGLI = {
  falco: (L) => ({
    decal: [
      // muso: bocca unica bassa con la rete, due prese laterali, fari affilati che risalgono sui parafanghi
      { p: 'fronte', c: 'cornice', forma: [[-0.66, 0.15], [0.66, 0.15], [0.56, 0.40], [0.42, 0.43], [-0.42, 0.43], [-0.56, 0.40]] },
      { p: 'fronte', c: 'rete', forma: [[-0.60, 0.18], [0.60, 0.18], [0.52, 0.38], [0.40, 0.405], [-0.40, 0.405], [-0.52, 0.38]], alto: 0.002 },
      ...[0.23, 0.28, 0.33].map((y) => ({ p: 'fronte', c: 'cornice', forma: rett(0, y, 1.10 - (y - 0.2) * 0.5, 0.012), alto: 0.004 })),
      { p: 'fronte', c: 'cornice', forma: rett(0.76, 0.26, 0.10, 0.16, 0.03, -0.25), sp: 1 },
      { p: 'fronte', c: 'cornice', forma: [[0.44, 0.52], [0.80, 0.50], [0.86, 0.56], [0.50, 0.585]], sp: 1 },
      { p: 'fronte', c: 'faro', forma: [[0.47, 0.528], [0.79, 0.51], [0.83, 0.552], [0.51, 0.572]], sp: 1, alto: 0.004 },
      ...strisce(4, 1.55, 1.90, 0.62, 0.20, 0.035, 0.0).map((f) => ({ p: 'sopra', c: 'scuro', forma: f, sp: 1 })),
      ...strisce(3, 0.70, 0.92, 0.42, 0.16, 0.03, 0.45).map((f) => ({ p: 'lato', c: 'scuro', forma: f })),
      // coda: fanali a barra sottile, pannello scuro in basso
      { p: 'retro', c: 'cornice', forma: [[0.24, 0.775], [0.86, 0.755], [0.88, 0.69], [0.70, 0.70], [0.28, 0.745]], sp: 1 },
      { p: 'retro', c: 'stop', forma: [[0.27, 0.765], [0.85, 0.746], [0.865, 0.70], [0.70, 0.71], [0.30, 0.752]], sp: 1, alto: 0.003 },
      { p: 'retro', c: 'cornice', forma: [[-0.80, 0.27], [0.80, 0.27], [0.66, 0.50], [-0.66, 0.50]] },
      { p: 'retro', c: 'stop', forma: rett(0, 0.43, 0.10, 0.03, 0.01), alto: 0.004 },
      // livrea: due strisce sul centro, dal muso alla coda (interrotte dai vetri), fascia di colore terzo sul sottoporta
      ...[[0.56, 2.42], [-0.07, -1.47], [-1.47, -2.36]].flatMap(([a, b]) => [0.13, -0.13].map((z) => ({ p: 'sopra', c: L.sec, forma: rett((a + b) / 2, z, Math.abs(a - b), 0.09) }))),
      { p: 'lato', c: L.sec, forma: fascia(-1.9, 1.9, () => 0.29, (x) => 0.33 + 0.02 * Math.cos(x)) },
    ],
    pezzi: [
      ['ala', -1.95, 1.21, 0.34, 1.84, -0.10, L.ter], ['deriva', -1.95, 1.20, 0.92, 0.36, 0.20, L.ter],
      ['collo', -1.70, 0.30, -1.90, 1.19],
      ['splitter', 2.42, 0.085, 0.30, 0.88], ['canard', 2.30, 0.40, 0.86, 0.16, 0.10], ['diffusore', -2.36, 0.27, 0.45, 0.80, 5],
      ['specchio', 0.40, 0.92], ['scarico', -0.95, 0.20, 2], ['tergi', 0.48, 0.12],
    ],
  }),
  vespro: (L) => ({
    decal: [
      // muso: tre bocche nel paraurti, fari a goccia sulle punte dei parafanghi
      { p: 'fronte', c: 'cornice', forma: rett(0, 0.27, 0.62, 0.17, 0.06) },
      { p: 'fronte', c: 'rete', forma: rett(0, 0.27, 0.54, 0.11, 0.04), alto: 0.003 },
      { p: 'fronte', c: 'cornice', forma: rett(0.58, 0.28, 0.30, 0.16, 0.06, 0.1), sp: 1 },
      { p: 'fronte', c: 'rete', forma: rett(0.58, 0.28, 0.24, 0.10, 0.04, 0.1), sp: 1, alto: 0.003 },
      { p: 'fronte', c: 'cornice', forma: [[0.44, 0.505], [0.80, 0.535], [0.83, 0.595], [0.50, 0.575]], sp: 1, prof: 0.45 },
      { p: 'fronte', c: 'faro', forma: [[0.47, 0.515], [0.79, 0.542], [0.81, 0.584], [0.51, 0.566]], sp: 1, alto: 0.003, prof: 0.45 },
      { p: 'fronte', c: 'faro', forma: rett(0.58, 0.40, 0.20, 0.016, 0.008, 0.08), sp: 1, alto: 0.003 },
      // fianchi: presa davanti alla ruota posteriore
      { p: 'lato', c: 'cornice', forma: [[-0.36, 0.56], [-0.62, 0.70], [-0.68, 0.62], [-0.44, 0.50]] },
      // coda: fanale a barra che attraversa tutta la coda, feritoie sul cofano motore, pannello scuro
      { p: 'retro', c: 'cornice', forma: rett(0, 0.69, 1.46, 0.07, 0.03) },
      { p: 'retro', c: 'stop', forma: rett(0, 0.69, 1.42, 0.035, 0.015), alto: 0.004 },
      { p: 'retro', c: 'cornice', forma: rett(0, 0.34, 1.50, 0.18, 0.05) },
      ...strisce(8, -1.70, -1.18, 0, 0.62, 0.026).map((f) => ({ p: 'sopra', c: 'scuro', forma: f })),
      // livrea: fascia larga sul fianco che sale verso la coda, cofano anteriore in colore secondo
      { p: 'lato', c: L.sec, forma: fascia(-1.85, 2.4, (x) => 0.36 + 0.07 * clamp01((0.5 - x) / 2.5), (x) => 0.47 + 0.12 * clamp01((0.5 - x) / 2.5)) },
    ],
    pezzi: [
      ['ala', -1.78, 1.36, 0.40, 1.86, -0.12, L.ter], ['deriva', -1.78, 1.35, 0.93, 0.38, 0.20, L.ter],
      ['pilone', -1.70, 0.30, 0.20, 1.36],
      ['splitter', 2.55, 0.085, 0.26, 0.86], ['canard', 2.42, 0.38, 0.84, 0.14, 0.09], ['diffusore', -2.07, 0.26, 0.38, 0.76, 4],
      ['specchio', 1.00, 0.94], ['scarico', -2.06, 0.30, 0], ['tergi', 1.06, 0.12],
    ],
  }),
  orsa: (L) => ({
    decal: [
      // muso: presa centrale bassa, fari doppi in una conca scura per lato, apertura sul cofano
      { p: 'fronte', c: 'cornice', forma: rett(0, 0.235, 0.56, 0.11, 0.04) },
      { p: 'fronte', c: 'rete', forma: rett(0, 0.235, 0.50, 0.065, 0.03), alto: 0.003 },
      { p: 'fronte', c: 'cornice', forma: rett(0.58, 0.215, 0.26, 0.08, 0.03), sp: 1 },
      { p: 'fronte', c: 'cornice', forma: [[0.44, 0.405], [0.82, 0.425], [0.85, 0.48], [0.48, 0.47]], sp: 1, prof: 0.45 },
      ...[0.57, 0.74].map((z) => ({ p: 'fronte', c: 'faro', forma: rett(z, 0.442 + (z - 0.57) * 0.06, 0.13, 0.028, 0.01, 0.06), sp: 1, alto: 0.003, prof: 0.45 })),
      { p: 'sopra', c: 'scuro', forma: rett(1.72, 0, 0.30, 0.46, 0.08) },
      ...strisce(4, 1.25, 1.60, 0.56, 0.18, 0.03).map((f) => ({ p: 'sopra', c: 'scuro', forma: f, sp: 1 })),
      // fianchi: grande presa dietro la porta
      { p: 'lato', c: 'cornice', forma: [[-0.42, 0.70], [-0.98, 0.66], [-0.98, 0.47], [-0.56, 0.47]] },
      { p: 'lato', c: 'rete', forma: [[-0.47, 0.67], [-0.94, 0.635], [-0.94, 0.50], [-0.60, 0.50]], alto: 0.003 },
      // coda: due fanali tondi per lato in una fascia scura, griglia del motore sulla coda lunga
      { p: 'retro', c: 'cornice', forma: rett(0, 0.62, 1.46, 0.15, 0.06) },
      ...[0.44, 0.62].map((z) => ({ p: 'retro', c: 'stop', forma: ell(z, 0.62, 0.06, 0.06), sp: 1, alto: 0.004 })),
      { p: 'retro', c: 'cornice', forma: rett(0, 0.33, 1.40, 0.18, 0.05) },
      ...strisce(6, -2.05, -1.10, 0, 0.66, 0.035).map((f) => ({ p: 'sopra', c: 'scuro', forma: f })),
      // livrea: muso e coda in colore secondo, separati dal colore base con un taglio obliquo sul fianco
      { p: 'sopra', c: L.sec, forma: rett(0, 0, 5.2, 0.42) },
      ...[0.255, -0.255].map((z) => ({ p: 'sopra', c: L.ter, forma: rett(0, z, 5.2, 0.035) })),
      { p: 'lato', c: L.sec, forma: fascia(-2.45, 2.3, (x) => 0.36 + 0.03 * clamp01((0.3 - x) / 2.5), (x) => 0.43 + 0.05 * clamp01((0.3 - x) / 2.5)) },
    ],
    pezzi: [
      ['ala', -2.36, 1.00, 0.40, 1.84, -0.08, L.ter], ['deriva', -2.36, 0.99, 0.93, 0.38, 0.19, L.ter], ['pilone', -2.30, 0.42, 0.22, 1.00],
      ['presa', -0.05, 0.24, 0.62, L.sec],
      ['splitter', 2.41, 0.075, 0.24, 0.84], ['diffusore', -2.55, 0.25, 0.50, 0.78, 6],
      ['specchio', 0.70, 0.84], ['scarico', -2.54, 0.36, 2], ['tergi', 0.76, 0.10],
    ],
  }),
};

/** stili: passo delle sezioni, suddivisioni delle bande fra i binari, spline o no, ruote, ombreggiatura */
export const STILI = {
  lowpoly: { nome: 'Low poly', passo: 0.26, passoEstremi: 0.13, arco: 6, bande: [1, 1, 1, 1, 2, 1, 1, 2], ruota: 10, liscio: false, spline: false },
  attuale: { nome: 'Facce piatte', passo: 0.09, passoEstremi: 0.05, arco: 10, bande: [1, 1, 1, 2, 4, 2, 3, 4], ruota: 18, liscio: false, spline: true },
  realistico: { nome: 'Realistico', passo: 0.04, passoEstremi: 0.022, arco: 16, bande: [2, 1, 2, 3, 7, 3, 5, 8], ruota: 40, liscio: true, spline: true },
  // versione leggera del realistico per le auto lontane (LOD): stesse forme e materiali, meno sezioni; non compare nei menu
  realisticoLontano: { nome: 'Realistico (lontano)', interno: true, passo: 0.10, passoEstremi: 0.05, arco: 10, bande: [1, 1, 1, 2, 4, 2, 3, 4], ruota: 16, liscio: true, spline: true },
};
// spigoli voluti (binari dove la superficie piega netta): bordo del fondo, passaruota, sottoporta, labbro
const PIEGA = [false, true, true, true, true, false, false, false, false];

// ------------------------------------------------------------------ sezioni
function prepara(MD, spec) {
  if (MD._c && MD._spec === spec) return MD;
  MD._spec = spec;
  MD._c = Object.fromEntries(['yc', 'cab', 'wr', 'ysh', 'rb', 'ib', 'wm', 'wsh', 'ym', 'yb', 'ysill'].map((k) => [k, curva(MD[k])]));
  MD._kz = 1; let mx = 0;
  for (let x = MD.xR; x <= MD.xF; x += 0.01) mx = Math.max(mx, sezione(MD, spec, x).P[4][0]);
  MD._kz = MD.larghezza / 2 / mx;
  const R = MD.ruote.r;
  MD.ruote.zf = sezione(MD, spec, spec.a).P[4][0] - 0.166; MD.ruote.zr = sezione(MD, spec, -spec.b).P[4][0] - 0.166;
  MD.ruote.Ra = R + GIOCO_ARCO;
  return MD;
}
/** spazio fra gomma e arco del passaruota (m): poco, le ruote devono riempire il parafango */
const GIOCO_ARCO = 0.026;
/** arrotondamento delle estremità: [lunghezza (m), rientro massimo (m)] davanti e dietro */
const ARROT = { f: [0.16, 0.05], r: [0.24, 0.085] };
const gonfia = (MD, spec, x) => {
  let f = 0;
  for (const [xw, a] of [[spec.a, MD.flare.f], [-spec.b, MD.flare.r]]) { const d = Math.abs(x - xw) / MD.flare.l; if (d < 1) f += a * Math.cos((d * Math.PI) / 2) ** 2; }
  return f;
};
/** sezione a x: 9 binari [z, y] (metà destra), più se è dentro un arco */
export function sezione(MD, spec, x) {
  const c = MD._c, R = MD.ruote.r, Ra = R + GIOCO_ARCO, labbro = 0.022;
  const fl = gonfia(MD, spec, x);
  let wm = c.wm(x) + fl, wsh = c.wsh(x) + fl * 0.6, ym = c.ym(x), ysh = c.ysh(x) + fl * 0.3, yc = c.yc(x);
  let arco = 0, larco = 0, dentro = false;
  for (const xw of [spec.a, -spec.b]) {
    const d = x - xw;
    if (Math.abs(d) < Ra) { dentro = true; arco = Math.max(arco, R + Math.sqrt(Ra * Ra - d * d)); }
    if (Math.abs(d) < Ra + labbro) larco = Math.max(larco, R + Math.sqrt((Ra + labbro) ** 2 - d * d));
  }
  // estremità arrotondate: negli ultimi centimetri la sezione rientra (in pianta e in alto), così muso e coda non sono un blocco
  const dR = (x - MD.xR) / ARROT.r[0], dF = (MD.xF - x) / ARROT.f[0];
  const rientro = (dR < 1 ? ARROT.r[1] * (1 - dR) ** 2 : 0) + (dF < 1 ? ARROT.f[1] * (1 - dF) ** 2 : 0);
  wm -= rientro; wsh -= rientro * 1.1; ysh -= rientro * 0.9; yc -= rientro * 0.8; ym -= rientro * 0.3;
  ym = Math.max(ym, larco); ysh = Math.max(ysh, ym + 0.025);
  const yb5 = ysh + c.rb(x), wb = wsh - c.ib(x) - rientro * 0.2;
  const k = clamp01(c.cab(x));
  const zH = wb * 0.55, yH = yb5 + (yc - yb5) * 0.78;
  const zR = c.wr(x), yR = Math.max(yc - 0.03, yb5 + 0.002);
  const yb = c.yb(x) + rientro * 0.5, ysill = c.ysill(x) + rientro * 0.5;
  const P = [];
  P[0] = [0, yb];
  P[1] = [dentro ? wm - 0.43 : wm - 0.13, yb];
  P[3] = [dentro ? wm - 0.012 : wm - 0.065, dentro ? arco : ysill];
  P[2] = dentro ? [wm - 0.43, arco] : [lerp(P[1][0], P[3][0], 0.5), lerp(P[1][1], P[3][1], 0.5)];
  P[4] = [wm, ym];
  P[5] = [wsh, ysh];
  P[6] = [wb, yb5];
  P[7] = [lerp(zH, zR, k), lerp(yH, yR, k)];
  P[8] = [0, Math.max(yc, P[7][1] - 0.2)];
  const kz = MD._kz || 1;
  for (const p of P) p[0] *= kz;
  return { P, dentro, k };
}

/** campioni di una banda: t in (0, 1] */
function campioniBanda(st, b, V) {
  const n = st.bande[b];
  const lin = (a, z, m) => Array.from({ length: m }, (_, i) => lerp(a, z, (i + 1) / m));
  if (b === 6) { const [t0, t1] = V.tLat; return [t0, ...lin(t0, t1, Math.max(1, n - 2)), 1]; }
  if (b === 7) return [V.tSup, ...lin(V.tSup, 1, Math.max(1, n - 1))];
  return lin(0, 1, n);
}

/** anello completo (destra dal fondo al centro, poi sinistra) con, per ogni punto, banda e t, e i punti di piega */
function anello(MD, spec, x, st) {
  const { P, dentro, k } = sezione(MD, spec, x), V = MD.vetri;
  const destra = [{ p: P[0], b: -1, t: 0, piega: false }];
  for (let b = 0; b < 8; b++) {
    const A = P[b], B = P[b + 1];
    // tangenti (Hermite): corda della banda vicino agli spigoli, direzione dei vicini altrove; al centro orizzontale
    const prev = b > 0 ? P[b - 1] : [-P[1][0], P[1][1]], next = b + 2 <= 8 ? P[b + 2] : [-P[7][0], P[7][1]];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-6, unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
    const corda = unit([B[0] - A[0], B[1] - A[1]]);
    const mA = PIEGA[b] || b === 0 ? corda : unit([B[0] - prev[0], B[1] - prev[1]]);
    const mB = PIEGA[b + 1] ? corda : unit([next[0] - A[0], next[1] - A[1]]);
    for (const t of campioniBanda(st, b, V)) {
      let q;
      if (!st.spline) q = [lerp(A[0], B[0], t), lerp(A[1], B[1], t)];
      else {
        const t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
        q = [0, 1].map((i) => h00 * A[i] + h10 * L * mA[i] + h01 * B[i] + h11 * L * mB[i]);
      }
      destra.push({ p: q, b, t, piega: t === 1 && PIEGA[b + 1] });
    }
  }
  const n = destra.length;
  const pts = destra.map((d) => [x, d.p[1], d.p[0]]).concat(destra.slice(0, -1).reverse().map((d) => [x, d.p[1], -d.p[0]]));
  const info = destra.concat(destra.slice(0, -1).reverse());
  return { x, pts, info, n, dentro, k, P };
}

/** sezioni lungo x per lo stile: passo regolare, più fitte agli estremi, attorno agli archi e sui bordi dei vetri */
function sezioniX(MD, spec, st) {
  const x0 = MD.xR, x1 = MD.xF, Ra = MD.ruote.r + GIOCO_ARCO;
  let xs = [];
  for (let x = x0; x < x1 - 1e-6;) { xs.push(x); x += x < x0 + 0.35 || x > x1 - 0.35 ? st.passoEstremi : st.passo; }
  xs.push(x1);
  for (const xw of [spec.a, -spec.b]) {
    xs = xs.filter((x) => Math.abs(x - xw) > Ra + 0.02 || Math.abs(x - xw) < Ra - 0.02);
    for (let i = 1; i < st.arco; i++) xs.push(xw + Ra * Math.cos((Math.PI * i) / st.arco));
    xs.push(xw - Ra - 0.0008, xw - Ra + 0.0008, xw + Ra - 0.0008, xw + Ra + 0.0008);
  }
  const V = MD.vetri, bordi = [...V.parabrezza, V.laterale, ...(V.lunotto || [])];
  if (!st.liscio) bordi.push(...MD.cab.map((k) => k[0]), ...MD.yc.map((k) => k[0]).filter((x) => x > x0 + 0.1 && x < x1 - 0.1));
  for (const b of bordi) { xs = xs.filter((x) => Math.abs(x - b) > st.passoEstremi * 0.45 || [x0, x1].includes(x)); xs.push(b); }
  return [...new Set(xs.map((x) => +x.toFixed(5)))].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
}

// tipi di faccia: 0 fondo, 1 passaruota, 2 sottoporta, 3 fianco basso, 4 vernice, 5 vetro, 6 cornice scura
function tipoFaccia(MD, A, B, j) {
  // banda della faccia e intervallo di t: a destra il punto più in alto è j+1, a sinistra è j
  const destra = j < A.n - 1, hi = A.info[destra ? j + 1 : j], lo = A.info[destra ? j : j + 1], b = hi.b;
  const tm = ((lo.b === b ? lo.t : 0) + hi.t) / 2, xm = (A.x + B.x) / 2, V = MD.vetri;
  if (b <= 0) return 0;
  if (b <= 2) return A.dentro && B.dentro ? 1 : 2;
  if (b === 3) return A.dentro && B.dentro ? 1 : 3;
  if (b === 6) {
    const alta = Math.min(A.P[7][1] - A.P[6][1], B.P[7][1] - B.P[6][1]);
    if (xm > V.laterale && xm < V.parabrezza[1] && tm > V.tLat[0] && tm < V.tLat[1] && alta > 0.02) return 5;
    return 4;
  }
  if (b === 7 && tm > V.tSup) {
    if (xm > V.parabrezza[0] && xm < V.parabrezza[1]) return 5;
    if (V.lunotto && xm > V.lunotto[0] && xm < V.lunotto[1]) return 5;
  }
  return 4;
}

/** geometria della carrozzeria per auto e stile (uguale per tutte le livree): posizioni, normali, tipo di ogni faccia */
const _forme = new Map();
function forma(MD, spec, stile) {
  const chiave = (spec.forma || spec.id) + '|' + stile, st = STILI[stile];
  if (_forme.has(chiave)) return _forme.get(chiave);
  prepara(MD, spec);
  const anelli = sezioniX(MD, spec, st).map((x) => anello(MD, spec, x, st));
  const nA = anelli.length, M = anelli[0].pts.length;
  const pos = [], nor = [], tipo = [];
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const gemello = (i, d) => { const k = i + d; return k < 0 || k >= nA || Math.abs(anelli[k].x - anelli[i].x) < 0.004; };
  // normale liscia al vertice (i, j) vista dalla faccia che sta dal lato si (x) e sj (anello): agli spigoli si usa un lato solo
  const normale = (i, j, si, sj) => {
    const R = anelli[i].pts, piega = anelli[i].info[j].piega || j === 0 || j === M - 1;
    const jp = Math.min(M - 1, j + 1), jm = Math.max(0, j - 1);
    const tu = piega ? (sj > 0 ? sub(R[jp], R[j]) : sub(R[j], R[jm])) : sub(R[jp], R[jm]);
    let tv;
    const avanti = !gemello(i, 1), dietro = !gemello(i, -1);
    if (si > 0 && avanti) tv = dietro ? sub(anelli[i + 1].pts[j], anelli[i - 1].pts[j]) : sub(anelli[i + 1].pts[j], R[j]);
    else if (si < 0 && dietro) tv = avanti ? sub(anelli[i + 1].pts[j], anelli[i - 1].pts[j]) : sub(R[j], anelli[i - 1].pts[j]);
    else tv = si > 0 ? sub(anelli[Math.min(nA - 1, i + 1)].pts[j], R[j]) : sub(R[j], anelli[Math.max(0, i - 1)].pts[j]);
    if (Math.hypot(...tv) < 1e-7) tv = [1, 0, 0];
    return norm(cross(tv, tu));
  };
  const lisce = st.liscio;
  for (let i = 0; i + 1 < nA; i++) {
    const A = anelli[i], B = anelli[i + 1];
    for (let j = 0; j < M - 1; j++) {
      const a0 = A.pts[j], b0 = B.pts[j], b1 = B.pts[j + 1], a1 = A.pts[j + 1];
      const t = tipoFaccia(MD, A, B, j);
      // due triangoli per quadrilatero; quelli degeneri (area nulla, per esempio dove due binari coincidono) si saltano
      const na0 = lisce && normale(i, j, 1, 1), nb0 = lisce && normale(i + 1, j, -1, 1), nb1 = lisce && normale(i + 1, j + 1, -1, -1), na1 = lisce && normale(i, j + 1, 1, -1);
      for (const [p, q, r, np, nq, nr] of [[a0, b0, b1, na0, nb0, nb1], [a0, b1, a1, na0, nb1, na1]]) {
        if (Math.hypot(...cross(sub(q, p), sub(r, p))) < 1e-9) continue;
        pos.push(...p, ...q, ...r); tipo.push(t);
        if (lisce) nor.push(...np, ...nq, ...nr);
      }
    }
  }
  // chiusure davanti e dietro: poligono piano dell'ultima sezione
  for (const [A, dir] of [[anelli[0], -1], [anelli[nA - 1], 1]]) {
    const cont = A.pts.slice(0, M - 1).map(([, y, z]) => new THREE.Vector2(z, y));
    const tri = THREE.ShapeUtils.triangulateShape(cont, []);
    for (const [p, q, r] of tri) {
      const T = [p, q, r].map((k) => [A.x, cont[k].y, cont[k].x]);
      const nx = cross(sub(T[1], T[0]), sub(T[2], T[0]))[0];
      if (Math.sign(nx) !== dir) T.reverse();
      if (Math.hypot(...cross(sub(T[1], T[0]), sub(T[2], T[0]))) < 1e-9) continue;
      pos.push(...T[0], ...T[1], ...T[2]); tipo.push(4);
      if (lisce) for (let k = 0; k < 3; k++) nor.push(dir, 0, 0);
    }
  }
  const F = { pos: new Float32Array(pos), nor: lisce ? new Float32Array(nor) : null, tipo, anelli };
  F.proietta = proiettore(F); F.candidati = F.proietta.candidati; F.normaleFaccia = F.proietta.nf;
  F.dec = decalcomanie(MD, spec, F, st);
  _forme.set(chiave, F);
  return F;
}

// ------------------------------------------------------------------ proiezione sulla carrozzeria (raggi lungo gli assi)
// piani: fronte (da +x, coordinate z,y), retro (da -x), sopra (da +y, coordinate x,z), lato (da +z o -z, coordinate x,y)
const ASSI = { fronte: [0, [2, 1], 1], retro: [0, [2, 1], -1], sopra: [1, [0, 2], 1], latoD: [2, [0, 1], 1], latoS: [2, [0, 1], -1] };
function proiettore(F) {
  const P = F.pos, N = F.nor, nT = P.length / 9, cache = {}, CELLA = 0.06;
  // normali piatte se lo stile non ha normali lisce
  const nf = (t) => { const i = t * 9, u = [P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]], v = [P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return [n[0] / l, n[1] / l, n[2] / l]; };
  const griglia = (asse) => {
    if (cache[asse]) return cache[asse];
    const [, [iu, iv]] = ASSI[asse], G = new Map();
    for (let t = 0; t < nT; t++) {
      const i = t * 9, us = [P[i + iu], P[i + 3 + iu], P[i + 6 + iu]], vs = [P[i + iv], P[i + 3 + iv], P[i + 6 + iv]];
      const a = Math.floor(Math.min(...us) / CELLA), b = Math.floor(Math.max(...us) / CELLA), c = Math.floor(Math.min(...vs) / CELLA), d = Math.floor(Math.max(...vs) / CELLA);
      for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) { const k = x * 4096 + y; let l = G.get(k); if (!l) G.set(k, (l = [])); l.push(t); }
    }
    return (cache[asse] = G);
  };
  /** punto (u, v) del piano proiettato sulla carrozzeria: [x, y, z] e normale, o null */
  const proietta = (asse, u, v) => {
    const [ia, [iu, iv], dir] = ASSI[asse], G = griglia(asse);
    const l = G.get(Math.floor(u / CELLA) * 4096 + Math.floor(v / CELLA)); if (!l) return null;
    let best = null, bd = -Infinity;
    for (const t of l) {
      const i = t * 9, u0 = P[i + iu], v0 = P[i + iv], u1 = P[i + 3 + iu], v1 = P[i + 3 + iv], u2 = P[i + 6 + iu], v2 = P[i + 6 + iv];
      const den = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2); if (Math.abs(den) < 1e-10) continue;
      const w0 = ((v1 - v2) * (u - u2) + (u2 - u1) * (v - v2)) / den, w1 = ((v2 - v0) * (u - u2) + (u0 - u2) * (v - v2)) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const a = w0 * P[i + ia] + w1 * P[i + 3 + ia] + w2 * P[i + 6 + ia];
      if (a * dir > bd) { bd = a * dir; best = [t, w0, w1, w2]; }
    }
    if (!best) return null;
    const [t, w0, w1, w2] = best, i = t * 9, p = [0, 1, 2].map((k) => w0 * P[i + k] + w1 * P[i + 3 + k] + w2 * P[i + 6 + k]);
    let n = N ? [0, 1, 2].map((k) => w0 * N[i + k] + w1 * N[i + 3 + k] + w2 * N[i + 6 + k]) : nf(t);
    const ln = Math.hypot(...n) || 1; n = n.map((q) => q / ln);
    return { p, n, t };
  };
  /** triangoli le cui proiezioni cadono nel rettangolo [u0, u1] × [v0, v1] */
  proietta.nf = nf;
  proietta.candidati = (asse, u0, u1, v0, v1) => {
    const G = griglia(asse), S = new Set();
    for (let x = Math.floor(u0 / CELLA); x <= Math.floor(u1 / CELLA); x++) for (let y = Math.floor(v0 / CELLA); y <= Math.floor(v1 / CELLA); y++) { const l = G.get(x * 4096 + y); if (l) for (const t of l) S.add(t); }
    return S;
  };
  return proietta;
}

/** poligono 2D ritagliato da un triangolo (Sutherland-Hodgman; il triangolo è convesso) */
function ritaglia(poly, T) {
  let out = poly;
  for (let e = 0; e < 3 && out.length; e++) {
    const A = T[e], B = T[(e + 1) % 3], inp = out, lato = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const P = inp[i], Q = inp[(i + 1) % inp.length], sp = lato(P), sq = lato(Q);
      if (sp >= 0) out.push(P);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
    }
  }
  return out;
}
/** decalcomanie: la forma 2D si ritaglia su ogni triangolo visibile della carrozzeria (nella proiezione), così sta esattamente
 * sulle facce (anche nel low poly) e ha bordi netti; solo la superficie più esterna lungo il raggio la riceve */
function decalcomanie(MD, spec, F, st) {
  const out = [], D = DETTAGLI[spec.forma || spec.id] || DETTAGLI.falco, lista = D({ base: '#000', sec: '#livrea-sec', ter: '#livrea-ter' }).decal;
  const P = F.pos, N = F.nor, xF = MD.xF, xR = MD.xR;
  for (const d of lista) {
    const lati = d.p === 'lato' || d.sp ? [1, -1] : [1];
    for (const sg of lati) {
      const asse = d.p === 'lato' ? (sg > 0 ? 'latoD' : 'latoS') : d.p, [ia, [iu, iv], dir] = ASSI[asse];
      let forma2 = d.forma.map(([u, v]) => (d.p === 'sopra' ? [u, v * sg] : d.p === 'lato' ? [u, v] : [u * sg, v]));
      let area = 0; for (let i = 0; i < forma2.length; i++) { const p = forma2[i], q = forma2[(i + 1) % forma2.length]; area += p[0] * q[1] - q[0] * p[1]; }
      if (area < 0) forma2 = forma2.reverse();
      const livrea = typeof d.c === 'string' && d.c.startsWith('#livrea');
      const off = (livrea ? 0.0015 : 0.003) + (d.alto || 0), prof = d.prof ?? 0.6;
      const us = forma2.map((p) => p[0]), vs = forma2.map((p) => p[1]);
      const cand = F.candidati(asse, Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs));
      const p = [], n = [];
      const pieni = [];
      for (const t of cand) {
        const i = t * 9;
        if (F.tipo[t] <= 1 || F.tipo[t] === 5) continue;
        // faccia rivolta verso il raggio
        const ax = [P[i + 3] - P[i], P[i + 4] - P[i + 1], P[i + 5] - P[i + 2]], bx = [P[i + 6] - P[i], P[i + 7] - P[i + 1], P[i + 8] - P[i + 2]];
        const fn = [ax[1] * bx[2] - ax[2] * bx[1], ax[2] * bx[0] - ax[0] * bx[2], ax[0] * bx[1] - ax[1] * bx[0]], lf = Math.hypot(...fn) || 1;
        if ((fn[ia] / lf) * dir < 0.06) continue;
        if (d.p === 'fronte' && Math.min(P[i], P[i + 3], P[i + 6]) < xF - prof) continue;
        if (d.p === 'retro' && Math.max(P[i], P[i + 3], P[i + 6]) > xR + prof) continue;
        let T = [[P[i + iu], P[i + iv]], [P[i + 3 + iu], P[i + 3 + iv]], [P[i + 6 + iu], P[i + 6 + iv]]], ord = [0, 1, 2];
        const a2 = (T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[2][0] - T[0][0]) * (T[1][1] - T[0][1]);
        if (Math.abs(a2) < 1e-9) continue;
        if (a2 < 0) { T = [T[0], T[2], T[1]]; ord = [0, 2, 1]; }
        const C = ritaglia(forma2, T); if (C.length < 3) continue;
        // solo se questo triangolo è la superficie più esterna in quel punto
        const cu = C.reduce((s, q) => s + q[0], 0) / C.length, cv = C.reduce((s, q) => s + q[1], 0) / C.length, h = F.proietta(asse, cu, cv);
        const prof0 = (P[i + ia] + P[i + 3 + ia] + P[i + 6 + ia]) / 3;
        if (!h || (h.t !== t && Math.abs(h.p[ia] - prof0) > 0.012)) continue;
        // faccia coperta tutta: si colora la faccia stessa (meno triangoli, nessun bordo)
        if (C.length >= 3) {
          let ac = 0; for (let k = 0; k < C.length; k++) { const p0 = C[k], p1 = C[(k + 1) % C.length]; ac += p0[0] * p1[1] - p1[0] * p0[1]; }
          if (Math.abs(ac) / Math.abs(a2) > 0.9995) { pieni.push(t); continue; }
        }
        // da 2D a 3D con le coordinate baricentriche del triangolo
        const [u0, v0] = T[0], [u1, v1] = T[1], [u2, v2] = T[2], den = (v1 - v2) * (u0 - u2) + (u2 - u1) * (v0 - v2);
        const V = C.map(([u, v]) => {
          const w0 = ((v1 - v2) * (u - u2) + (u2 - u1) * (v - v2)) / den, w1 = ((v2 - v0) * (u - u2) + (u0 - u2) * (v - v2)) / den, w = [w0, w1, 1 - w0 - w1];
          const W = [0, 0, 0]; for (let k = 0; k < 3; k++) W[ord[k]] = w[k];
          const q = [0, 1, 2].map((c) => W[0] * P[i + c] + W[1] * P[i + 3 + c] + W[2] * P[i + 6 + c]);
          let nn = N ? [0, 1, 2].map((c) => W[0] * N[i + c] + W[1] * N[i + 3 + c] + W[2] * N[i + 6 + c]) : fn;
          const l = Math.hypot(...nn) || 1; nn = nn.map((c) => c / l);
          return { q: q.map((c, k) => c + nn[k] * off), n: nn };
        });
        // ventaglio (il ritaglio di una forma convessa da un triangolo è convesso), avvolto come la faccia
        for (let k = 1; k + 1 < V.length; k++) {
          const tri = [V[0], V[k], V[k + 1]];
          const e1 = tri[1].q.map((c, j) => c - tri[0].q[j]), e2 = tri[2].q.map((c, j) => c - tri[0].q[j]);
          const tn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (tn[0] * fn[0] + tn[1] * fn[1] + tn[2] * fn[2] < 0) tri.reverse();
          if (Math.hypot(...tn) < 1e-9) continue;          // ventaglio con punti allineati: niente triangoli degeneri
          for (const v of tri) { p.push(...v.q); n.push(...v.n); }
        }
      }
      out.push({ c: d.c, p, n, pieni, ordine: livrea ? -0.01 : d.alto || 0 });
    }
  }
  return out;
}

// ------------------------------------------------------------------ geometrie
function geo(p, n, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p instanceof Float32Array ? p : new Float32Array(p), 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col instanceof Float32Array ? col : new Float32Array(col), 3));
  if (n) g.setAttribute('normal', new THREE.BufferAttribute(n instanceof Float32Array ? n : new Float32Array(n), 3)); else g.computeVertexNormals();
  return g;
}
/** carrozzeria colorata con la livrea: corpo (vernice + parti scure), vetri, decalcomanie, fari, stop */
function carrozzeria(L, MD, spec, stile) {
  const st = STILI[stile], F = forma(MD, spec, stile), reale = st.liscio;
  const kT = [COL.fondo, COL.passaruota, L.ter, L.base, L.base, COL.vetro, COL.cornice].map((h) => new THREE.Color(h));
  const colore = (c) => (c === '#livrea-sec' ? L.sec : c === '#livrea-ter' ? L.ter : COL[c] || c);
  const ricolora = new Map();          // facce coperte tutte da una decalcomania (le ultime vincono)
  for (const d of [...F.dec].sort((a, b) => a.ordine - b.ordine)) if (d.c !== 'faro' && d.c !== 'stop') for (const t of d.pieni) ricolora.set(t, new THREE.Color(colore(d.c)));
  const luciPiene = { faro: [], stop: [] };
  for (const d of F.dec) if (d.c === 'faro' || d.c === 'stop') luciPiene[d.c].push(...d.pieni);
  const corpo = { p: [], n: [], c: [] }, vetro = { p: [], n: [] };
  for (let f = 0; f < F.tipo.length; f++) {
    const t = F.tipo[f], i = f * 9;
    const dove = reale && t === 5 ? vetro : corpo;
    for (let k = 0; k < 9; k++) { dove.p.push(F.pos[i + k]); if (F.nor) dove.n.push(F.nor[i + k]); }
    if (dove === corpo) { const c = ricolora.get(f) || kT[t]; for (let v = 0; v < 3; v++) corpo.c.push(c.r, c.g, c.b); }
  }
  const dec = { p: [], n: [], c: [] }, fari = { p: [], n: [] }, stop = { p: [], n: [] };
  // luci che coprono facce intere: copia della faccia, appena sollevata
  for (const k of ['faro', 'stop']) for (const f of luciPiene[k]) {
    const i = f * 9, g = k === 'faro' ? fari : stop, nf = F.normaleFaccia(f);
    for (let v = 0; v < 3; v++) { const n = F.nor ? [F.nor[i + v * 3], F.nor[i + v * 3 + 1], F.nor[i + v * 3 + 2]] : nf; g.p.push(...[0, 1, 2].map((c) => F.pos[i + v * 3 + c] + n[c] * 0.004)); g.n.push(...n); }
  }
  // prima le strisce della livrea, poi le parti scure, poi luci (così i pezzi sovrapposti restano sopra: offset crescente)
  for (const d of [...F.dec].sort((a, b) => a.ordine - b.ordine)) {
    if (d.c === 'faro' || d.c === 'stop') { const g = d.c === 'faro' ? fari : stop; g.p.push(...d.p); g.n.push(...d.n); continue; }
    const k = new THREE.Color(colore(d.c));
    dec.p.push(...d.p); dec.n.push(...d.n); for (let i = 0; i < d.p.length / 3; i++) dec.c.push(k.r, k.g, k.b);
  }
  // decalcomanie e luci hanno sempre le normali della superficie sotto (anche negli stili a facce piatte)
  const N = (g) => (reale ? g.n : null);
  return { corpo: geo(corpo.p, N(corpo), corpo.c), vetro: vetro.p.length ? geo(vetro.p, vetro.n) : null, dec: geo(dec.p, dec.n, dec.c), fari: geo(fari.p, fari.n), stop: geo(stop.p, stop.n) };
}

// ------------------------------------------------------------------ pezzi aggiunti
function colora(g, h) {
  const k = new THREE.Color(h), n = g.attributes.position.count, c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function unisci(geos, lisce = false) {
  geos = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), nn = new Float32Array(n * 3); let o = 0;
  for (const g of geos) {
    if (!g.attributes.normal) g.computeVertexNormals();
    p.set(g.attributes.position.array, o * 3); c.set(g.attributes.color.array, o * 3); nn.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(p, 3)); r.setAttribute('color', new THREE.BufferAttribute(c, 3));
  if (lisce) r.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); else r.computeVertexNormals();
  return r;
}
const scatola = (x, y, z, lx, ly, lz, c, rz = 0, ry = 0) => { const b = new THREE.BoxGeometry(lx, ly, lz); b.rotateZ(rz); b.rotateY(ry); b.translate(x, y, z); return colora(b, c); };
/** profilo alare (corda lungo x, bordo d'attacco davanti), estruso lungo z */
function profiloAla(corda, sp = 0.11) {
  const P = [[0.5, 0], [0.42, 0.45], [0.2, 0.85], [-0.1, 1], [-0.35, 0.7], [-0.5, 0.12], [-0.5, -0.05], [-0.2, -0.25], [0.2, -0.3], [0.42, -0.22]];
  return new THREE.Shape(P.map(([a, b]) => new THREE.Vector2(a * corda, b * corda * sp)));
}
function ala(x, y, corda, apertura, rz, c, seg) {
  const g = new THREE.ExtrudeGeometry(profiloAla(corda), { depth: apertura, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -apertura / 2); g.rotateZ(rz); g.translate(x, y, 0); void seg; return colora(g, c);
}
/** paratia laterale dell'ala: lastra sagomata (trapezio con angoli smussati) */
function deriva(x, y, z, lx, ly, c) {
  const s = new THREE.Shape([[lx * 0.5, -ly * 0.55], [lx * 0.45, ly * 0.2], [lx * 0.3, ly * 0.4], [-lx * 0.5, ly * 0.45], [-lx * 0.5, -ly * 0.55], [-lx * 0.1, -ly * 0.7]].map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false }); g.translate(x, y, z - 0.007); return colora(g, c);
}
function pezzi(MD, spec, L, st) {
  const D = (DETTAGLI[spec.forma || spec.id] || DETTAGLI.falco)(L), F = forma(MD, spec, st === STILI.realistico ? 'realistico' : st === STILI.lowpoly ? 'lowpoly' : 'attuale');
  const sopra = (x, z) => F.proietta('sopra', x, z), G = [], R = MD.ruote.r, seg = st.ruota >= 40 ? 24 : st.ruota >= 18 ? 12 : 6;
  const CARB = COL.carbonio;
  for (const e of D.pezzi) {
    const [tipo] = e;
    if (tipo === 'ala') { const [, x, y, corda, ap, rz, c] = e; G.push(ala(x, y, corda, ap, rz, c, seg)); }
    else if (tipo === 'deriva') { const [, x, y, z, lx, ly] = e; for (const s of [1, -1]) G.push(deriva(x, y, s * z, lx, ly, CARB)); }
    else if (tipo === 'collo') {
      // colli di cigno: dal cofano posteriore salgono, si piegano all'indietro e reggono l'ala da sopra
      const [, x0, z, x1, y1] = e;
      for (const s of [1, -1]) {
        const h = sopra(x0, s * z); const y0 = h ? h.p[1] : 0.95;
        const pts = [[x0, y0 - 0.02], [x0 - 0.02, y0 + 0.12], [x0 - 0.06, y1 + 0.10], [x1 + 0.10, y1 + 0.12], [x1, y1 + 0.03]];
        for (let k = 0; k + 1 < pts.length; k++) {
          const [a, b] = pts[k], [c2, d] = pts[k + 1], l = Math.hypot(c2 - a, d - b);
          G.push(scatola((a + c2) / 2, (b + d) / 2, s * z, l + 0.025, 0.035, 0.03, CARB, Math.atan2(d - b, c2 - a)));
        }
      }
    } else if (tipo === 'pilone') {
      // due piloni verticali sagomati dal cofano motore all'ala
      const [, x, z, w, yA] = e;
      for (const s of [1, -1]) {
        const h = sopra(x, s * z), y0 = h ? h.p[1] : 0.9;
        const sh = new THREE.Shape([[w * 0.5, 0], [w * 0.15, yA - y0], [-w * 0.35, yA - y0], [-w * 0.5, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }); g.translate(x, y0 - 0.02, s * z - 0.0125); G.push(colora(g, CARB));
      }
    } else if (tipo === 'splitter') {
      // lama sotto il muso: segue la pianta del paraurti e sporge un poco
      const [, x, y, prof, w] = e, kz = MD._kz, sh = new THREE.Shape();
      const pts = []; for (let k = 0; k <= 10; k++) { const z = -w + (2 * w * k) / 10; pts.push([x + 0.03 - 0.06 * (z / w) ** 4, z * kz]); }
      sh.moveTo(x - prof, -w * kz); for (const [a, b] of pts) sh.lineTo(a, b); sh.lineTo(x - prof, w * kz);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.022, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.translate(0, y + 0.011, 0);
      G.push(colora(g, CARB));
      for (const s of [1, -1]) G.push(scatola(x - prof * 0.45, y + 0.05, s * w * kz * 0.98, prof * 0.9, 0.09, 0.015, CARB));
    } else if (tipo === 'canard') {
      const [, x, y, z, lx, ly] = e;
      for (const s of [1, -1]) {
        const h = F.proietta(s > 0 ? 'latoD' : 'latoS', x - lx * 0.4, y); const zz = h ? Math.abs(h.p[2]) : z;
        G.push(scatola(x - lx * 0.4, y, s * (zz + 0.03), lx, 0.012, 0.07, CARB, 0.18, s * 0.25));
      }
    } else if (tipo === 'diffusore') {
      // pinne verticali sotto la coda
      const [, x, y, prof, w, n] = e;
      for (let k = 0; k < n; k++) {
        const z = -w + (2 * w * k) / (n - 1);
        const sh = new THREE.Shape([[0, 0], [0, y - 0.09], [prof, 0.01], [prof, 0]].map(([a, b]) => new THREE.Vector2(a, b)));
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }); g.translate(x + 0.01, 0.09, z - 0.006); G.push(colora(g, CARB));
      }
    } else if (tipo === 'specchio') {
      // specchietto a goccia su un braccio sottile, alla base del montante
      const [, x, y] = e;
      for (const s of [1, -1]) {
        const S = sezione(MD, spec, x).P, zb = S[6][0] - 0.01, yb = S[6][1], ym = Math.max(y, yb + 0.08);
        const g = new THREE.SphereGeometry(0.075, seg + 2, Math.max(4, seg / 2 + 2)); g.scale(1.1, 0.62, 1.15);
        const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getX(i) < 0) p.setX(i, p.getX(i) * 0.35);
        g.translate(x - 0.02, ym, s * (zb + 0.15)); G.push(colora(g, L.base));
        const v = new THREE.CircleGeometry(0.055, seg + 2); v.scale(1, 0.62, 1); v.rotateY(-Math.PI / 2); v.translate(x - 0.053, ym, s * (zb + 0.15)); G.push(colora(v, '#5d6670'));
        const lb = Math.hypot(0.11, ym - yb);
        G.push(scatola(x, (yb + ym) / 2, s * (zb + 0.05), 0.05, 0.02, lb, CARB, 0, 0));
        G[G.length - 1].rotateX(0); { const q = G[G.length - 1]; q.translate(-x, -(yb + ym) / 2, -s * (zb + 0.05)); q.rotateX(-s * Math.atan2(ym - yb, 0.11)); q.translate(x, (yb + ym) / 2, s * (zb + 0.06)); }
      }
    } else if (tipo === 'presa') {
      // presa d'aria sul tetto: bocca davanti, dorso che scende verso la coda
      const [, x, w, l, c] = e;
      const h0 = sopra(x, 0), y0 = h0 ? h0.p[1] : 1.1;
      const sh = new THREE.Shape([[0, -0.01], [0, 0.10], [-0.10, 0.11], [-l * 0.6, 0.07], [-l, -0.02]].map(([a, b]) => new THREE.Vector2(a, b)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: st.liscio ? 2 : 1 });
      g.translate(x, y0 - 0.015, -w / 2); G.push(colora(g, c));
      G.push(scatola(x + 0.006, y0 + 0.048, 0, 0.012, 0.085, w * 0.86, COL.cornice));
    } else if (tipo === 'scarico') {
      const [, x, y, n] = e, r2 = 0.045;
      if (n === 2 && x > MD.xR + 0.1) {           // uscite laterali davanti alle ruote posteriori
        for (const s of [1, -1]) { const zb = sezione(MD, spec, x).P[3][0]; const t = new THREE.CylinderGeometry(r2, r2, 0.10, seg + 4, 1, true); t.rotateX(Math.PI / 2); t.translate(x, y, s * (zb + 0.0)); G.push(colora(t, '#8c8f94')); }
      } else {
        const zs = n === 0 ? [0] : [-0.22, 0.22];
        for (const z of zs) { const t = new THREE.CylinderGeometry(r2 * 1.2, r2 * 1.2, 0.12, seg + 4, 1, true); t.rotateZ(Math.PI / 2); t.translate(x - 0.02, y, z); G.push(colora(t, '#8c8f94')); }
      }
    } else if (tipo === 'tergi') {
      const [, x, ] = e, h = sopra(x, 0.05), y = h ? h.p[1] : 0.9;
      G.push(scatola(x - 0.04, y + 0.012, 0.05, 0.02, 0.012, 0.95, '#151618', 0, 0.12));
    }
  }
  void R;
  return unisci(G, st.liscio);
}

// ------------------------------------------------------------------ ruote
const _ruote = new Map();
/** ruota low poly / facce piatte: gomma poligonale con spalla smussata, cerchio a 5 razze */
function ruotaPiatta(r, cerchio, seg) {
  const key = 'p' + r + cerchio + seg; if (_ruote.has(key)) return _ruote.get(key);
  const pr = [[r * 0.66, -0.15], [r * 0.9, -0.155], [r, -0.12], [r, 0.12], [r * 0.9, 0.155], [r * 0.66, 0.15]].map(([a, b]) => new THREE.Vector2(a, b));
  const gomma = new THREE.LatheGeometry(pr, seg); gomma.rotateX(Math.PI / 2);
  const parti = [colora(gomma, '#1c1c1f')];
  const fondo = new THREE.CircleGeometry(r * 0.66, seg); fondo.translate(0, 0, 0.10); parti.push(colora(fondo, '#101113'));
  const bordo = new THREE.RingGeometry(r * 0.56, r * 0.66, seg); bordo.translate(0, 0, 0.148); parti.push(colora(bordo, cerchio));
  for (let k = 0; k < 5; k++) {
    const s = new THREE.Shape([[r * 0.08, -0.035], [r * 0.58, -0.055], [r * 0.58, 0.055], [r * 0.08, 0.035]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, 0.115); g.rotateZ((k * 2 * Math.PI) / 5); parti.push(colora(g, cerchio));
  }
  const mozzo = new THREE.CylinderGeometry(r * 0.15, r * 0.17, 0.05, 6); mozzo.rotateX(Math.PI / 2); mozzo.translate(0, 0, 0.13); parti.push(colora(mozzo, cerchio));
  const g = unisci(parti); _ruote.set(key, g); return g;
}
/** ruota realistica: gomma (spalla e battistrada), cerchio a 10 razze con canale, dado centrale; disco e pinza (fermi) */
function ruotaReale(r, cerchio, seg) {
  const key = 'r' + r + cerchio + seg; if (_ruote.has(key)) return _ruote.get(key);
  const pr = [[r * 0.70, -0.15], [r * 0.80, -0.153], [r * 0.92, -0.15], [r * 0.975, -0.135], [r, -0.11], [r, 0.11], [r * 0.975, 0.135], [r * 0.92, 0.15], [r * 0.80, 0.153], [r * 0.70, 0.15]].map(([a, b]) => new THREE.Vector2(a, b));
  const gomma = new THREE.LatheGeometry(pr, seg); gomma.rotateX(Math.PI / 2); colora(gomma, '#1a1a1c');
  const parti = [];
  const canale = new THREE.CylinderGeometry(r * 0.70, r * 0.70, 0.27, seg, 1, true); canale.rotateX(Math.PI / 2); parti.push(colora(canale, cerchio));
  const fondo = new THREE.CircleGeometry(r * 0.69, seg); fondo.translate(0, 0, 0.02); parti.push(colora(fondo, '#2a2c30'));
  const labbro = new THREE.TorusGeometry(r * 0.695, 0.016, 6, seg); labbro.translate(0, 0, 0.135); parti.push(colora(labbro, cerchio));
  for (let k = 0; k < 10; k++) {
    const s = new THREE.Shape([[r * 0.13, -0.022], [r * 0.68, -0.016], [r * 0.68, 0.016], [r * 0.13, 0.022]].map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }); g.translate(0, 0, 0.10);
    g.rotateZ((Math.floor(k / 2) * 2 * Math.PI) / 5 + (k % 2 ? 0.16 : -0.16)); parti.push(colora(g, cerchio));
  }
  const mozzo = new THREE.CylinderGeometry(0.07, 0.085, 0.05, 16); mozzo.rotateX(Math.PI / 2); mozzo.translate(0, 0, 0.115); parti.push(colora(mozzo, cerchio));
  const dado = new THREE.CylinderGeometry(0.038, 0.038, 0.05, 6); dado.rotateX(Math.PI / 2); dado.translate(0, 0, 0.145); parti.push(colora(dado, '#c62828'));
  const disco = new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.032, 28); disco.rotateX(Math.PI / 2); disco.translate(0, 0, 0.0); colora(disco, '#6f7174');
  const pinza = new THREE.BoxGeometry(0.11, 0.22, 0.06); pinza.translate(-r * 0.52, r * 0.18, 0.05); colora(pinza, '#c8102e');
  const R = { gomma, cerchio: unisci(parti, true), freno: unisci([disco, pinza], true) }; _ruote.set(key, R); return R;
}

// ------------------------------------------------------------------ materiali (condivisi fra tutte le auto)
let _mat = null, _matR = null, _matRL = null;
/** distanza (m) oltre la quale le auto realistiche passano alla versione leggera */
export const DIST_LOD = 38;
function materialeRuotaLontana() {
  return (_matRL ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.35 }));
}
function materiali() {
  if (!_mat) _mat = {
    corpo: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    dec: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    fari: new THREE.MeshBasicMaterial({ color: 0xfff1c4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  return _mat;
}
// fase 0: nel mondo voxel (Cubo Corse) la luce d'ambiente arriva dalla mappa d'ambiente del cielo, che il Lambert non
// usa: lì le auto «a facce piatte» escono quasi nere. Stesse facce e colori, materiale PBR opaco.
let _matP = null;
function materialiPbr() {
  if (!_matP) _matP = {
    corpo: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05 }),
    dec: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    fari: new THREE.MeshBasicMaterial({ color: 0xfff1c4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
  };
  return _matP;
}
function materialiRealistici() {
  if (_matR) return _matR;
  _matR = {
    vernice: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1 }),
    dec: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    pezzi: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }),
    vetro: new THREE.MeshPhysicalMaterial({ color: 0x0b1015, roughness: 0.08, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.08, reflectivity: 0.9 }),
    fari: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1c4, emissiveIntensity: 1.4, roughness: 0.1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 }),
    gomma: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }),
    cerchio: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }),
    freno: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4 }),
    numero: null,
  };
  return _matR;
}
const _numeri = new Map();
function numeroTex(num) {
  if (_numeri.has(num)) return _numeri.get(num);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.font = 'bold 76px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(num), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; _numeri.set(num, t); return t;
}

export class AutoLowPoly {
  constructor(spec, livery, number, { numeri = true, stile = 'attuale', pbr = false } = {}) {
    this.spec = spec; this.stile = STILI[stile] ? stile : 'attuale';
    const st = STILI[this.stile], reale = st.liscio;
    const MD = (this.modello = prepara(MODELLI[spec.forma || spec.id] || MODELLI.falco, spec));
    const L = { base: hexStr(livery.base), sec: hexStr(livery.sec), ter: hexStr(livery.ter) };
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const M = pbr ? materialiPbr() : materiali(), MR = reale ? materialiRealistici() : null;
    this.mesh = new THREE.Group();
    const C = carrozzeria(L, MD, spec, this.stile);
    const corpo = new THREE.Mesh(C.corpo, reale ? MR.vernice : M.corpo); corpo.castShadow = true; corpo.receiveShadow = true;
    const dec = new THREE.Mesh(C.dec, reale ? MR.dec : M.dec); dec.receiveShadow = true;
    const extra = new THREE.Mesh(pezzi(MD, spec, L, st), reale ? MR.pezzi : M.corpo); extra.castShadow = true;
    this.stopMat = reale ? new THREE.MeshStandardMaterial({ color: 0x4a0808, emissive: 0xff2a1a, emissiveIntensity: 0.15, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
      : new THREE.MeshBasicMaterial({ color: 0x5a0a0a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const fari = new THREE.Mesh(C.fari, reale ? MR.fari : M.fari);
    const stop = new THREE.Mesh(C.stop, this.stopMat);
    this.corpo = corpo;
    const vicino = reale ? new THREE.Group() : this.mesh;
    vicino.add(corpo, dec, extra, fari, stop);
    if (C.vetro) vicino.add(new THREE.Mesh(C.vetro, MR.vetro));
    const num = numeri && typeof document !== 'undefined' ? this._numeri(MD, spec, number, reale) : null;
    if (num) vicino.add(num);
    if (reale) {
      // auto lontane: carrozzeria più leggera con gli stessi materiali (pezzi e numeri condivisi); cambio a DIST_LOD metri
      const C2 = carrozzeria(L, MD, spec, 'realisticoLontano'), lontano = new THREE.Group();
      const c2 = new THREE.Mesh(C2.corpo, MR.vernice); c2.castShadow = true; c2.receiveShadow = true;
      lontano.add(c2, new THREE.Mesh(C2.dec, MR.dec), new THREE.Mesh(extra.geometry, MR.pezzi), new THREE.Mesh(C2.fari, MR.fari), new THREE.Mesh(C2.stop, this.stopMat));
      if (C2.vetro) lontano.add(new THREE.Mesh(C2.vetro, MR.vetro));
      if (num) lontano.add(new THREE.Mesh(num.geometry, num.material));
      lontano.children[2].castShadow = true;
      lontano.traverse((o) => { o.userData.lontano = true; });
      const lod = new THREE.LOD(); lod.addLevel(vicino, 0); lod.addLevel(lontano, DIST_LOD);
      this.mesh.add(lod);
    }
    this.body.add(this.mesh);
    // ruote
    this.wheels = [];
    const RR = reale ? ruotaReale(MD.ruote.r, MD.cerchi, st.ruota) : null, rg = reale ? null : ruotaPiatta(MD.ruote.r, MD.cerchi, st.ruota);
    for (const [x, z, front] of [[spec.a, -MD.ruote.zf, true], [spec.a, MD.ruote.zf, true], [-spec.b, -MD.ruote.zr, false], [-spec.b, MD.ruote.zr, false]]) {
      const pivot = new THREE.Group(); pivot.position.set(x, MD.ruote.r, z);
      const spin = new THREE.Group();
      let w;
      if (reale) {
        const vic = new THREE.Group(); vic.add(new THREE.Mesh(RR.gomma, MR.gomma), new THREE.Mesh(RR.cerchio, MR.cerchio));
        vic.children[0].castShadow = true;
        const lon = new THREE.Mesh(ruotaPiatta(MD.ruote.r, MD.cerchi, 16), materialeRuotaLontana()); lon.castShadow = true; lon.userData.lontano = true;
        w = new THREE.LOD(); w.addLevel(vic, 0); w.addLevel(lon, DIST_LOD);
        const freno = new THREE.LOD(), disco = new THREE.Mesh(RR.freno, MR.freno);     // fermo: non gira con la ruota
        freno.addLevel(disco, 0); freno.addLevel(new THREE.Object3D(), DIST_LOD);
        if (z < 0) freno.rotation.y = Math.PI;
        pivot.add(freno);
      } else { w = new THREE.Mesh(rg, M.corpo); w.castShadow = true; }
      if (z < 0) w.rotation.y = Math.PI;
      spin.add(w); pivot.add(spin); this.body.add(pivot);
      this.wheels.push({ pivot, spin, front, x, z });
    }
    // camere e abitacolo (semplificato)
    const [ex, ey, ez] = MD.occhio;
    this.eye = new THREE.Vector3(ex, ey, ez);
    this.bonnet = new THREE.Vector3(MD.cofano[0], MD.cofano[1], 0);
    this.cockpit = new THREE.Group();
    const cm = new THREE.MeshLambertMaterial({ color: 0x1b1d21, flatShading: true });
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, ez === 0 ? 1.2 : 1.6), cm); dash.position.set(ex + 0.9, ey - 0.26, 0);
    this.volante = new THREE.Group(); this.volante.position.set(ex + 0.57, ey - 0.24, ez);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.018, 4, 12), cm); ring.rotation.y = Math.PI / 2;
    const razza = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.28), cm);
    this.volante.add(ring, razza);
    const montante = (z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.5, 0.035), cm); m.position.set(ex + 1.0, ey - 0.02, z); m.rotation.z = 0.95; return m; };
    const luci = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.012, 0.1), new THREE.MeshBasicMaterial({ color: 0x3bd16f })); luci.position.set(ex + 0.56, ey - 0.08, ez);
    this.cockpit.add(dash, this.volante, montante(0.8), montante(-0.8), luci);
    this.cockpit.visible = false;
    this.body.add(this.cockpit);
  }

  /** numeri di gara sulle porte e sul tetto: dischi appoggiati alla superficie (un solo mesh) */
  _numeri(MD, spec, number, reale) {
    const F = forma(MD, spec, this.stile), G = [];
    const disco = (h, r) => {
      const g = new THREE.CircleGeometry(r, 20), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...h.n));
      g.applyQuaternion(q); g.translate(h.p[0] + h.n[0] * 0.008, h.p[1] + h.n[1] * 0.008, h.p[2] + h.n[2] * 0.008); return g;
    };
    const S = sezione(MD, spec, MD.numero).P, yn = (S[4][1] + S[5][1]) / 2;
    for (const a of ['latoD', 'latoS']) { const h = F.proietta(a, MD.numero, yn); if (h) G.push(disco(h, 0.17)); }
    const xr = MD.numeroTetto ?? MD.occhio[0] + 0.12, ht = F.proietta('sopra', xr, 0); if (ht) G.push(disco(ht, 0.19));
    // sul tetto il numero si legge dal lato: ruota attorno alla normale
    const g = G.length ? (() => {
      for (const x of G) x.deleteAttribute('uv');
      const m = new THREE.BufferGeometry(); let n = 0; G.forEach((x) => { n += (x.index ? x.index.count : x.attributes.position.count); });
      const p = [], nn = [], uv = [];
      for (const x of G) {
        const ni = x.toNonIndexed(), pp = ni.attributes.position, nr = ni.attributes.normal;
        for (let i = 0; i < pp.count; i++) { p.push(pp.getX(i), pp.getY(i), pp.getZ(i)); nn.push(nr.getX(i), nr.getY(i), nr.getZ(i)); }
      }
      m.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
      // uv: ogni disco ha il centro nel suo baricentro; si calcolano nel piano del disco con "su" = y del mondo (o x sul tetto)
      for (let d = 0, o = 0; d < G.length; d++) {
        const cnt = G[d].toNonIndexed().attributes.position.count, c = [0, 0, 0];
        for (let i = 0; i < cnt; i++) for (let k = 0; k < 3; k++) c[k] += p[(o + i) * 3 + k] / cnt;
        const nrm = new THREE.Vector3(nn[o * 3], nn[o * 3 + 1], nn[o * 3 + 2]).normalize();
        const su = Math.abs(nrm.y) > 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const dx = new THREE.Vector3().crossVectors(su, nrm).normalize(), dy = new THREE.Vector3().crossVectors(nrm, dx);
        const r = d < 2 ? 0.17 : 0.19;
        for (let i = 0; i < cnt; i++) {
          const v = new THREE.Vector3(p[(o + i) * 3] - c[0], p[(o + i) * 3 + 1] - c[1], p[(o + i) * 3 + 2] - c[2]);
          uv.push(0.5 + v.dot(dx) / (2 * r) * 0.94, 0.5 + v.dot(dy) / (2 * r) * 0.94);
        }
        o += cnt;
      }
      m.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return m;
    })() : new THREE.BufferGeometry();
    const mat = reale ? new THREE.MeshStandardMaterial({ map: numeroTex(number), transparent: true, alphaTest: 0.5, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 })
      : new THREE.MeshLambertMaterial({ map: numeroTex(number), transparent: true, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this._matNumero = mat;
    return new THREE.Mesh(g, mat);
  }

  /** controlli di validità: ingombri, gioco fra gomme e carrozzeria, decalcomanie, triangoli */
  verifica() {
    const corpo = this.corpo, box = new THREE.Box3().setFromObject(corpo), R = this.modello.ruote.r;
    const pos = corpo.geometry.attributes.position, gioco = [];
    for (const w of this.wheels) {
      let min = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (Math.sign(z) !== Math.sign(w.z) || Math.abs(Math.abs(z) - Math.abs(w.z)) > 0.15 || y < 0.02) continue;
        min = Math.min(min, Math.hypot(x - w.x, y - R) - R);
      }
      gioco.push(+min.toFixed(3));
    }
    const F = forma(this.modello, this.spec, this.stile);
    const conta = (g) => { let t = 0; g.traverse((o) => { if (o.isMesh && !o.userData.lontano && o.geometry?.attributes?.position) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; };
    const ruote = this.wheels.reduce((a, w) => a + conta(w.pivot), 0), carr = conta(this.mesh);
    return { lunghezza: +(box.max.x - box.min.x).toFixed(3), larghezza: +(box.max.z - box.min.z).toFixed(3), altezza: +box.max.y.toFixed(3), scala: 1, gioco_gomme_m: gioco,
      decalcomanie: F.dec.length, decalcomanie_vuote: F.dec.filter((d) => !d.p.length).length, triangoli: Math.round(carr + ruote), triangoli_carrozzeria: Math.round(carr), triangoli_ruote: Math.round(ruote) };
  }

  update(car, dt) {
    this.group.position.set(car.x, car.y, car.z);
    this.group.rotation.set(0, -car.yaw, 0);
    this.body.rotation.set(-(car.roll + (car.bankRoll || 0)), 0, car.pitch, 'XYZ');
    for (const w of this.wheels) {
      w.spin.rotation.z = -car.wheelSpin;
      w.pivot.rotation.y = w.front ? -(car.delta || 0) * 1.2 : 0;
    }
    if (this.volante) this.volante.rotation.x = (car.delta || 0) * 6;
    this.freni(car.brake > 0.1 || car.gear === -1);
  }

  /** luci dei freni accese o spente */
  freni(on) {
    if (on === this._br) return; this._br = on;
    if (this.stopMat.emissive) { this.stopMat.emissiveIntensity = on ? 2.6 : 0.15; this.stopMat.color.set(on ? 0xff3a2a : 0x4a0808); }
    else this.stopMat.color.set(on ? 0xff2a1a : 0x5a0a0a);
  }

  setCockpit(on) {
    this.cockpitOn = on;
    this.cockpit.visible = on;
    this.mesh.visible = !on;
    for (const w of this.wheels) w.pivot.visible = !on;
  }

  trasparente(op = 0.32) {
    this.group.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone(); m.transparent = true; m.opacity = op; m.depthWrite = false;
      o.material = m; o.castShadow = false; o.renderOrder = 3;
    });
  }

  dispose() {
    const condivise = new Set([..._ruote.values()].flatMap((r) => (r.isBufferGeometry ? [r] : Object.values(r))));
    this.group.traverse((o) => { if (o.isMesh && !condivise.has(o.geometry)) o.geometry.dispose(); });
    this.stopMat.dispose(); this._matNumero?.dispose();
  }
}
export const _forma = (M, spec, stile) => forma(prepara(M, spec), spec, stile);   // per i test
