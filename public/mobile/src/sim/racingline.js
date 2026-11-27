// Cubo Corse unito (fase 0): la traiettoria dipende dal profilo dell'IA della pista (profili.js). Le differenze fra
// Cubo Corse e Circuit Studio (limiti, ricucitura, picco della curvatura, tornanti, aderenza) sono parametri del profilo.
// Provati e scartati in Cubo Corse il 07-11 (vedi STATO.md): rifinitura laplaciana (segue le corde, +10 s al giro),
// biarmonico pesato sugli apici e partenza da una linea «corta» (il biarmonico converge sempre alla stessa linea).
import { profiloIA } from './profili.js';
import { finisci, finisciAPezzi } from '../cedi.js';
// Traiettoria ideale (curvatura minima a "elastico") + profilo di velocità.

const G = 9.81;

/**
 * Quanta carreggiata usa la traiettoria (centro dell'auto, metri dal bordo esterno del cordolo), dal profilo:
 * cordolo = quota del cordolo usabile, margine dal bordo; margineInterno all'interno delle curve (Cubo Corse: sul cordolo
 * con le ruote ma senza passarlo con l'auto); mBarriera = mai più vicino di così alla barriera (cittadini).
 * muScale < 1 sul bagnato.
 */
export function buildRacingLine(track, spec, opt = {}) { return finisci(passiTraiettoria(track, spec, opt)); }
/** 27-11: la stessa a pezzi, per il caricamento dietro il menu (la vetrina continua a girare) */
export function buildRacingLineAsync(track, spec, opt = {}) { return finisciAPezzi(passiTraiettoria(track, spec, opt)); }

function* passiTraiettoria(track, spec, { muScale = 1, profilo } = {}) {
  const P = profilo || profiloIA(track);
  const n = track.n, step = track.step;
  const off = new Float64Array(n);
  const limL = new Float64Array(n), limR = new Float64Array(n);
  // lato interno delle curve (curvatura > 1/300 m), allargato di ±20 m lungo la pista (solo con margineInterno)
  const intR = new Uint8Array(n), intL = new Uint8Array(n);
  if (P.margineInterno != null) {
    const R20 = Math.round(20 / step);
    for (let i = 0; i < n; i++) {
      const k = track.kappa[i];
      if (Math.abs(k) < 1 / 300) continue;
      for (let j = -R20; j <= R20; j++) { const q = (i + j + n) % n; if (k > 0) intR[q] = 1; else intL[q] = 1; }
    }
  }
  const mInt = P.margineInterno ?? P.margine;
  for (let i = 0; i < n; i++) {
    const hw = track.w[i] / 2;
    limR[i] = hw + track.R.kerb[i] * P.cordolo - (intR[i] ? mInt : P.margine);
    limL[i] = hw + track.L.kerb[i] * P.cordolo - (intL[i] ? mInt : P.margine);
    // cittadini: mai a meno di mBarriera + mezza larghezza dalla barriera (muro subito dopo il cordolo)
    if (P.mBarriera != null) {
      const mBar = P.mBarriera + (spec.halfW || 1);
      limR[i] = Math.max(0, Math.min(limR[i], track.R.barD[i] - mBar));
      limL[i] = Math.max(0, Math.min(limL[i], track.L.barD[i] - mBar));
    }
  }
  const px = track.px, pz = track.pz, nx = track.nx, nz = track.nz;
  const X = (i) => px[i] + nx[i] * off[i];
  const Z = (i) => pz[i] + nz[i] * off[i];
  // elastico multi-scala
  // 13-11: lo stencil a passo K lega solo i campioni i, i±K, i±2K: i K sottoreticoli si rilassano ognuno per conto suo
  // e, dove la linea tocca i limiti, si separano. Con l'ultimo passo a 7 m (K=4) la traiettoria veniva a dente di sega
  // con periodo 8 m (via Roma, uscita della M240). Dopo ogni scala, una media triangolare di semilarghezza K (che
  // azzera proprio le oscillazioni di periodo K) ricuce i sottoreticoli. Scendere fino a K=1 con l'elastico invece
  // accorciava la linea e la faceva più lenta (1 s di profilo, 3 s per l'IA).
  // (profilo: ricuci)
  const scale = [60, 40, 25, 14, 7];
  const tmp = new Float64Array(n);
  for (const k of scale) {
    const K = Math.max(1, Math.round(k / step));
    const iters = 500;
    for (let it = 0; it < iters; it++) {
      if ((it & 15) === 15) yield;
      for (let i = 0; i < n; i++) {
        // rilassamento biarmonico: minimizza la variazione di direzione (curvatura), non la lunghezza
        const a = (i - K + n) % n, b = (i + K) % n, a2 = (i - 2 * K + n) % n, b2 = (i + 2 * K) % n;
        const mx = (4 * (X(a) + X(b)) - X(a2) - X(b2)) / 6, mz = (4 * (Z(a) + Z(b)) - Z(a2) - Z(b2)) / 6;
        const want = (mx - px[i]) * nx[i] + (mz - pz[i]) * nz[i];
        let d = off[i] + (want - off[i]) * 0.6;
        if (d > limR[i]) d = limR[i];
        if (d < -limL[i]) d = -limL[i];
        off[i] = d;
      }
    }
    if (P.ricuci && K > 1) {
      for (let i = 0; i < n; i++) {
        let m = 0, w = 0;
        for (let j = -K + 1; j < K; j++) { const q = K - Math.abs(j); m += off[(i + j + n) % n] * q; w += q; }
        tmp[i] = Math.max(-limL[i], Math.min(limR[i], m / w));
      }
      off.set(tmp);
    }
  }
  // curvatura della traiettoria (cerchio per 3 punti a ±8 m)
  const kap = new Float64Array(n);
  const K = Math.max(2, Math.round(8 / step));
  for (let i = 0; i < n; i++) {
    const a = (i - K + n) % n, b = (i + K) % n;
    const ax = X(a), az = Z(a), bx = X(i), bz = Z(i), cx = X(b), cz = Z(b);
    const ab = Math.hypot(bx - ax, bz - az), bc = Math.hypot(cx - bx, cz - bz), ca = Math.hypot(ax - cx, az - cz);
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    kap[i] = (2 * cross) / Math.max(1e-6, ab * bc * ca);
  }
  // smussa un poco la curvatura (media su ±6 m)
  const ks = new Float64Array(n);
  const R = Math.max(1, Math.round(6 / step));
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let k = -R; k <= R; k++) m += Math.abs(kap[(i + k + n) % n]);
    ks[i] = m / (2 * R + 1);
  }
  // 13-11: la media su ±6 m abbassava il picco nei tornanti (Gombet: raggio ~11 m su 20 m di curva) e il profilo
  // dava 2-3 km/h di troppo all'apice: l'IA allargava di 3-4 m in uscita. Per la velocità conta il picco: massimo
  // della curvatura media su ±4 m.
  // (profilo: piccoCurvatura; Cubo Corse resta sulla media)
  if (P.piccoCurvatura) {
    const R4 = Math.max(1, Math.round(4 / step)), km = Float64Array.from(ks);
    for (let i = 0; i < n; i++) { let m = 0; for (let k = -R4; k <= R4; k++) m = Math.max(m, km[(i + k + n) % n]); ks[i] = m; }
  }
  // distanza percorsa sulla traiettoria
  const ds = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ds[i] = Math.hypot(X(j) - X(i), Z(j) - Z(i));
  }
  const prof = speedProfile(track, spec, ks, ds, muScale, P);
  // direzione della traiettoria (yaw) e curvatura con segno, smussata
  const yaw = new Float64Array(n), ksig = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    yaw[i] = Math.atan2(Z(b) - Z(a), X(b) - X(a));
    let m = 0;
    for (let k = -R; k <= R; k++) m += kap[(i + k + n) % n];
    ksig[i] = m / (2 * R + 1);
  }
  return { off, kappa: ksig, v: prof, ds, limL, limR, yaw };
}

export function speedProfile(track, spec, kap, ds, muScale = 1, P = profiloIA(track)) {
  const n = track.n, m = spec.mass;
  const mu = spec.mu * P.aderenza * muScale, df = spec.df;
  const v = new Float64Array(n);
  // curvatura verticale (dossi <0, compressioni >0) su ±10 m
  const kv = new Float64Array(n);
  const KV = Math.max(2, Math.round(10 / track.step));
  for (let i = 0; i < n; i++) {
    const a = (i - KV + n) % n, b = (i + KV) % n, h = KV * track.step;
    kv[i] = (track.py[a] - 2 * track.py[i] + track.py[b]) / (h * h);
  }
  for (let i = 0; i < n; i++) {
    let kvm = 0;
    for (let k = -KV; k <= KV; k++) kvm = Math.min(kvm, kv[(i + k + n) % n]);
    const k = Math.abs(kap[i]);
    // pacchetto 13-11: nei tornanti sotto ~30 m di raggio l'auto arriva a fine sterzo e sottosterza prima del μ pieno
    // (Gombet della A: 4,4 m di strada, raggio 11 m): aderenza utile ridotta fino a P.stretto sotto i 17 m
    const STRETTO = P.stretto;
    const muK = mu * (1 - (1 - STRETTO) * Math.max(0, Math.min(1, (k - 1 / 30) / (1 / 17 - 1 / 30))));
    const den = m * k - muK * df - muK * m * kvm;
    let vm = den <= 0 ? 95 : Math.sqrt((muK * m * G) / den);
    // sui dossi non si decolla troppo: g efficace ≥ 0.45 g
    // (profilo con salti: true = niente limite, l'IA passa sulle creste a tutta e salta come il giocatore; Gabriele 21-11)
    if (kvm < 0 && !P.salti) vm = Math.min(vm, Math.sqrt((0.55 * G) / -kvm));
    // inclinazione trasversale aiuta un poco
    vm *= 1 + Math.abs(track.bank[i]) * 0.8;
    v[i] = Math.min(95, vm);
  }
  // indietro: frenata
  for (let pass = 0; pass < 2; pass++)
    for (let ii = n - 1; ii >= 0; ii--) {
      const i = ii, j = (i + 1) % n;
      const vj = v[j];
      const dec = mu * (G + (df * vj * vj) / m) * P.decel + (spec.cd * vj * vj) / m;
      const lim = Math.sqrt(vj * vj + 2 * dec * ds[i]);
      if (v[i] > lim) v[i] = lim;
    }
  // avanti: accelerazione
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const vi = Math.max(v[i], 5);
      const acc = Math.min(mu * G * P.accG, (spec.power * P.accP) / (m * vi)) - (spec.cd * vi * vi) / m - track.slope[i] * G;
      const lim = Math.sqrt(Math.max(0, vi * vi + 2 * Math.max(0.3, acc) * ds[i]));
      if (v[j] > lim) v[j] = lim;
    }
  return v;
}
