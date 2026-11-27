// Cubo Corse unito (fase 0, 20-11-2026): una sola pista per le due famiglie di circuiti. Base = Circuit Studio (righe
// «pacchetto»: campioni esatti, bordi per campione, corpi solidi); dalle piste di Cubo Corse (Porto, Colline, Monza) le
// barriere come linee a una faccia restano per il disegno e da quelle si ricavano i corpi solidi (_solidiDaBarriere).
// Pista come "nastro": centro campionato a passo costante + profilo dei bordi per lato.
// Tutta la fisica ragiona nel riferimento della pista (s lungo, d laterale; d>0 = destra).
// Nessuna dipendenza da three.js: gira anche in Node per i test.

import { catmullRomClosed, resampleClosed, smoothClosed } from './spline.js';

export const SURF = { ROAD: 0, KERB: 1, GRASS: 2, GRAVEL: 3, RUNOFF: 4, SIDEWALK: 5 };
export const BAR = { GUARDRAIL: 0, WALL: 1, TECPRO: 2, FENCE: 3 };
export const SURF_NAMES = ['asfalto', 'cordolo', 'erba', 'ghiaia', 'via di fuga', 'marciapiede'];

// aderenza (moltiplicatore di μ) e freno della superficie (m/s² + coeff·v)
export const SURF_PHYS = [
  { mu: 1.0, drag: 0.0, dragV: 0.0 },     // asfalto
  { mu: 0.96, drag: 0.15, dragV: 0.0 },   // cordolo
  { mu: 0.58, drag: 1.4, dragV: 0.025 },  // erba
  { mu: 0.5, drag: 4.5, dragV: 0.06 },    // ghiaia
  { mu: 0.97, drag: 0.1, dragV: 0.0 },    // via di fuga asfaltata
  { mu: 0.9, drag: 0.4, dragV: 0.0 },     // marciapiede
];

const TAU = Math.PI * 2;

export class Track {
  /**
   * def: {
   *   id, nome, stile: 'permanente'|'citta'|'monza',
   *   ctrl?: [{x,y,z,w,bank}]   punti di controllo (piste inventate)
   *   samples?: [{x,y,z,w}]     campioni già pronti (Monza)
   *   override?: [{da, a, lato:'L'|'R'|'B', kerb?, run?, runW?, bar?}]  (metri)
   *   startS?: metri del traguardo, curve?: [{name,s}]
   * }
   */
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.nome = def.nome;
    this.stile = def.stile;
    let pts;
    if (def.samples && def.esatto) pts = def.samples;          // campioni già a passo costante (circuiti dal pacchetto)
    else if (def.samples) {
      const r = resampleClosed(def.samples, 2);
      pts = r.pts;
    } else {
      const dense = catmullRomClosed(def.ctrl, 32);
      pts = resampleClosed(dense, 2).pts;
    }
    const n = (this.n = pts.length);
    this.px = new Float64Array(n); this.py = new Float64Array(n); this.pz = new Float64Array(n);
    this.w = new Float64Array(n); this.bank = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i].x; this.py[i] = pts[i].y; this.pz[i] = pts[i].z;
      this.w[i] = pts[i].w || 12; this.bank[i] = pts[i].bank || 0;
    }
    // quota e larghezza morbide (non per i circuiti dal pacchetto: bordi e quote sono già di progetto)
    if (!def.esatto) {
      this.py = smoothClosed(this.py, 4);
      this.w = smoothClosed(this.w, 6);
    }
    // ascisse
    this.s = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.s[i + 1] = this.s[i] + Math.hypot(this.px[j] - this.px[i], this.pz[j] - this.pz[i]);
    }
    this.length = this.s[n];
    this.step = this.length / n;
    // tangenti (orizzontali) e normali destre
    this.tx = new Float64Array(n); this.tz = new Float64Array(n);
    this.nx = new Float64Array(n); this.nz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      this.tx[i] = dx; this.tz[i] = dz;
      this.nx[i] = -dz; this.nz[i] = dx;
    }
    // pendenza longitudinale
    this.slope = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n, b = (i + 2) % n;
      this.slope[i] = (this.py[b] - this.py[a]) / (4 * this.step);
    }
    // curvatura con segno (>0 = curva a destra)
    const k = new Float64Array(n);
    const K = Math.max(2, Math.round(6 / this.step));
    for (let i = 0; i < n; i++) {
      const a = (i - K + n) % n, b = (i + K) % n;
      let h1 = Math.atan2(this.tz[a], this.tx[a]);
      let h2 = Math.atan2(this.tz[b], this.tx[b]);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= TAU;
      while (dh < -Math.PI) dh += TAU;
      k[i] = dh / (2 * K * this.step);
    }
    this.kappa = smoothClosed(k, 3);
    this.startS = def.startS || 0;
    this.settori = def.settori || null;   // 27-11: confini dei settori (s assoluto), dai pacchetti di Circuit Studio
    this._buildGrid();
    this.curve = (def.curve || []).map((c, k) => ({
      name: c.name,
      s: def.curvaAt ? this.nearest(def.curvaAt[k][0], def.curvaAt[k][1]).i * this.step : c.s,
    }));
    // override espressi in coordinate → intervalli di s
    this.overrides = [...(def.override || [])];
    for (const o of def.overrideXZ || []) {
      if (o.at) {
        const s = this.nearest(o.at[0], o.at[1]).i * this.step;
        this.overrides.push({ ...o, da: this.wrapS(s - o.r), a: this.wrapS(s + o.r) });
      } else if (o.seg) {
        const a = this.nearest(o.seg[0][0], o.seg[0][1]).i * this.step;
        const b = this.nearest(o.seg[1][0], o.seg[1][1]).i * this.step;
        this.overrides.push({ ...o, da: a, a: b });
      }
    }
    if (def.lati) this._edgesFrom(def.lati); else this._buildEdges();
    this._buildPit();
    if (def.solidi) { this._buildSolidi(def.solidi); this._distanzeVere(); }
    else { this._buildBarrierLines(); this._solidiDaBarriere(); }
    // profilo dell'IA (fase 0): come guida l'IA su questa pista e quale traiettoria calcola (ai.js PROFILI_IA)
    this.profiloIA = def.profiloIA || 'permanente';
  }

  /** dopo aver cambiato E.barD a mano (banchi di prova): linee delle barriere e corpi solidi da capo */
  rifaiBarriere() { this._buildBarrierLines(); this._solidiDaBarriere(); }

  /**
   * Fase 0: corpi solidi dalle barriere di Cubo Corse. Ogni linea a una faccia (E.bx/E.bz, cappi già tagliati) diventa
   * un corpo di mezzo spessore R_CC con la faccia interna esattamente dov'era la linea (asse spostato di R_CC verso
   * l'esterno); il muretto della corsia box (E.isl0–isl1, largo 0,8 m) diventa un corpo con l'asse al centro. Così le
   * piste di Cubo Corse usano lo stesso modello d'urto di quelle di Circuit Studio: su un muro dritto i numeri sono gli
   * stessi del vecchio modello di Cubo Corse (docs/fisica-cc-cs-v2.html §3.3). E.barD resta quello di prima (traiettoria
   * dell'IA); E.netD = rete di sicurezza 30 m oltre il bordo, come per le piste di Circuit Studio.
   */
  _solidiDaBarriere() {
    const n = this.n, R = 0.3, solidi = [];
    for (const [E, sg] of [[this.R, 1], [this.L, -1]]) {
      // linea chiusa: un corpo solo che fa tutto il giro (punto finale = primo), spostato verso l'esterno
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const k = i % n;
        pts.push([E.bx[k] + this.nx[k] * sg * R, E.bz[k] + this.nz[k] * sg * R, E.by[k]]);
      }
      // tipo per tratti (il corpo ha un tipo solo): si spezza dove cambia il tipo di barriera
      let a = 0;
      for (let i = 1; i <= n; i++) {
        if (i < n && E.bar[i] === E.bar[a]) continue;
        solidi.push({ punti: pts.slice(a, i + 1), tipo: E.bar[a], r: R, capi: [false, false] });
        a = i;
      }
      // muretto della corsia box: tratti consecutivi con l'isola
      if (E.isl0) {
        let run = [];
        const chiudi = () => { if (run.length > 1) solidi.push({ punti: run, tipo: BAR.WALL, r: 0.4, muretto: true }); run = []; };
        for (let i = 0; i < n; i++) {
          if (E.isl0[i] > 0) {
            const dm = sg * (E.isl0[i] + E.isl1[i]) / 2;
            run.push([this.px[i] + this.nx[i] * dm, this.pz[i] + this.nz[i] * dm, this.py[i]]);
          } else chiudi();
        }
        chiudi();
      }
    }
    this._buildSolidi(solidi);
    for (const E of [this.R, this.L]) {
      E.netD = new Float64Array(n);
      for (let i = 0; i < n; i++) E.netD[i] = this.w[i] / 2 + E.kerb[i] + 30;
    }
  }

  // ---------- barriere vere (pacchetto, 13-11-2026) ----------
  /**
   * solidi: [{ punti: [[x, z, y], …], tipo: BAR.*, r }] = linee del pacchetto (barriere, varchi, gomme, TecPro, muretto
   * box…) già spostate sull'asse del corpo solido, r = mezzo spessore. Valgono da entrambi i lati: si urta il corpo
   * vero, ovunque stia (anche la U di gomme libera); quelle tolte nell'editor non ci sono. Segmenti in una griglia da
   * 8 m; spigoli = estremi delle linee e vertici che piegano più di ~14°, provati contro il rettangolo dell'auto.
   */
  _buildSolidi(solidi) {
    const segs = [], spigoli = [];
    let rMax = 0;
    for (const L of solidi) {
      const P = L.punti; if (!P || P.length < 2) continue;
      const first = segs.length;
      for (let k = 0; k + 1 < P.length; k++) {
        const [ax, az, ay] = P[k], [bx, bz, by] = P[k + 1];
        const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez);
        if (len < 0.02) continue;
        const ux = ex / len, uz = ez / len;
        segs.push({ ax, az, bx, bz, ay, by, y: (ay + by) / 2, len, ux, uz, nx: -uz, nz: ux, type: L.tipo, r: L.r, prev: -1, next: -1 });
      }
      const last = segs.length;
      if (last === first) continue;
      for (let k = first; k < last; k++) { if (k > first) segs[k].prev = k - 1; if (k < last - 1) segs[k].next = k + 1; }
      const S0 = segs[first], S1 = segs[last - 1];
      // capi della linea = spigoli veri, salvo dove la linea continua in un'altra (fase 0: barriere di Cubo Corse divise per tipo)
      const capi = L.capi || [true, true];
      if (capi[0]) spigoli.push({ x: S0.ax, z: S0.az, y: S0.ay, type: L.tipo, r: L.r });
      if (capi[1]) spigoli.push({ x: S1.bx, z: S1.bz, y: S1.by, type: L.tipo, r: L.r });
      for (let k = first + 1; k < last; k++) {
        const A = segs[k - 1], B = segs[k];
        if (Math.abs(A.ux * B.uz - A.uz * B.ux) > 0.25 || A.ux * B.ux + A.uz * B.uz < 0) spigoli.push({ x: B.ax, z: B.az, y: B.ay, type: L.tipo, r: L.r });
      }
      rMax = Math.max(rMax, L.r);
    }
    this.solSeg = segs; this.solSpigoli = spigoli;
    const C = (this._solC = 8), g = new Map(), gs = new Map(), M = 3 + rMax;
    const put = (map, x0, z0, x1, z1, k) => {
      for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++)
        for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) {
          const key = gz * 100003 + gx; let a = map.get(key); if (!a) map.set(key, (a = [])); a.push(k);
        }
    };
    segs.forEach((s, k) => put(g, Math.min(s.ax, s.bx) - M, Math.min(s.az, s.bz) - M, Math.max(s.ax, s.bx) + M, Math.max(s.az, s.bz) + M, k));
    spigoli.forEach((s, k) => put(gs, s.x - 3 - s.r, s.z - 3 - s.r, s.x + 3 + s.r, s.z + 3 + s.r, k));
    this._solGrid = g; this._solSpGrid = gs;
  }

  /** spigoli di barriera vicini a (x, z) */
  spigoliSolidi(x, z) {
    return this._solSpGrid.get(Math.floor(z / this._solC) * 100003 + Math.floor(x / this._solC)) || [];
  }

  /**
   * Contatto di un punto della sagoma con le barriere vere. (px, pz) = posizione ora, (ox, oz) = la stessa al passo
   * prima, (cx, cz) = centro dell'auto al passo prima, y = quota dell'auto. Il lato «giusto» di una barriera è quello
   * da cui l'auto arriva: il lato del centro se il centro le sta di fianco, altrimenti quello del punto al passo prima.
   * Così una linea sottile non si attraversa nemmeno a 300 km/h (si controlla anche il salto fra un passo e l'altro).
   * Ritorna null oppure out = { nx, nz (verso dove spingere), depth, type }.
   */
  contattoSolido(px, pz, ox, oz, cx, cz, y, out = {}) {
    const list = this._solGrid.get(Math.floor(pz / this._solC) * 100003 + Math.floor(px / this._solC));
    if (!list) return null;
    const S = this.solSeg;
    let best = 0;
    for (const k of list) {
      const s = S[k];
      if (Math.abs(s.y - y) > 3) continue;                   // ponte sopra o strada sotto
      const tq = ((px - s.ax) * s.ux + (pz - s.az) * s.uz) / s.len;
      const t = tq < 0 ? 0 : tq > 1 ? 1 : tq;
      const qx = s.ax + (s.bx - s.ax) * t, qz = s.az + (s.bz - s.az) * t;
      const dist = Math.hypot(px - qx, pz - qz);
      const sdN = (px - s.ax) * s.nx + (pz - s.az) * s.nz, sdO = (ox - s.ax) * s.nx + (oz - s.az) * s.nz;
      // attraversata fra un passo e l'altro? (il moto o→p taglia l'asse del corpo)
      let crossed = false;
      if ((sdO > 0) !== (sdN > 0) && sdO !== sdN) {
        const u = sdO / (sdO - sdN), ix = ox + (px - ox) * u, iz = oz + (pz - oz) * u;
        const ti = ((ix - s.ax) * s.ux + (iz - s.az) * s.uz) / s.len;
        crossed = ti >= 0 && ti <= 1;
      }
      if (dist >= s.r && !crossed) continue;
      const tc = ((cx - s.ax) * s.ux + (cz - s.az) * s.uz) / s.len, sdC = (cx - s.ax) * s.nx + (cz - s.az) * s.nz;
      // il centro conta anche se sta fino a 3 m prima o dopo il segmento (linee in fila: la fiancata che striscia sulla
      // prima arriva sulla seconda con il centro ancora indietro)
      const ext = 3 / s.len;
      const side = tc > -ext && tc < 1 + ext && Math.abs(sdC) > s.r + 0.3 ? Math.sign(sdC) : Math.sign(sdO || sdN || 1);
      let nx, nz, depth;
      if (crossed || (tq > 0 && tq < 1)) { nx = s.nx * side; nz = s.nz * side; depth = s.r - side * sdN; }
      else if (dist > 1e-6) {                                          // testa della linea
        nx = (px - qx) / dist; nz = (pz - qz) / dist; depth = s.r - dist;
        // due linee una in fila all'altra (transenne): l'auto che striscia sulla prima arriva sulla testa della seconda
        // con la fiancata proprio lì, e la spinta radiale la mandava dall'altra parte. Se il centro sta chiaramente da
        // un lato, si spinge verso quel lato.
        const sC = Math.sign(sdC);
        if (Math.abs(sdC) > s.r + 0.3 && (nx * s.nx + nz * s.nz) * sC < 0) { nx = s.nx * sC; nz = s.nz * sC; depth = s.r - sC * sdN; }
      }
      else { nx = s.nx * side; nz = s.nz * side; depth = s.r; }
      if (depth > best) { best = depth; out.nx = nx; out.nz = nz; out.depth = depth; out.type = s.type; }
    }
    return best > 0 ? out : null;
  }

  /**
   * Distanza di (x, z) dalla superficie del corpo solido più vicino (entro ~3 m), alla quota y, con la direzione per
   * allontanarsene (nx, nz). null se non c'è niente vicino. Per la guardia dell'IA.
   */
  distanzaSolidi(x, z, y, out = {}) {
    const list = this._solGrid.get(Math.floor(z / this._solC) * 100003 + Math.floor(x / this._solC));
    if (!list) return null;
    const S = this.solSeg;
    let best = Infinity;
    for (const k of list) {
      const s = S[k];
      if (Math.abs(s.y - y) > 3) continue;
      let t = ((x - s.ax) * s.ux + (z - s.az) * s.uz) / s.len;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + (s.bx - s.ax) * t, qz = s.az + (s.bz - s.az) * t, d = Math.hypot(x - qx, z - qz);
      if (d - s.r < best) { best = d - s.r; out.nx = d > 1e-6 ? (x - qx) / d : s.nx; out.nz = d > 1e-6 ? (z - qz) / d : s.nz; }
    }
    if (!isFinite(best)) return null;
    out.dist = best;
    return out;
  }

  /**
   * Per campione e per lato: distanza vera della barriera lungo la normale (prima linea incontrata entro 40 m, alla
   * quota della pista) → E.barD (traiettoria dell'IA) e E.bar (tipo). Dove non c'è niente (barriera tolta, incrocio
   * aperto) resta la distanza del pacchetto per l'IA, segnata in E.aperto. E.netD = rete di sicurezza della fisica,
   * 30 m oltre il bordo pista: serve solo se un'auto passa da un varco senza barriera.
   */
  _distanzeVere() {
    const n = this.n, S = this.solSeg, G = this._solGrid, C = this._solC, MAX = 40;
    this.aperti = 0;
    for (const [E, sg] of [[this.R, 1], [this.L, -1]]) {
      E.netD = new Float64Array(n); E.aperto = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const ox = this.px[i], oz = this.pz[i], dx = this.nx[i] * sg, dz = this.nz[i] * sg, y = this.py[i];
        const visti = new Set();
        let tBest = Infinity, tipo = -1;
        for (let d = 0; d <= MAX + C; d += C / 2) {
          const l = G.get(Math.floor((oz + dz * d) / C) * 100003 + Math.floor((ox + dx * d) / C));
          if (!l) continue;
          for (const k of l) {
            if (visti.has(k)) continue; visti.add(k);
            const s = S[k];
            if (Math.abs(s.y - y) > 3) continue;
            // raggio o + d·t contro il segmento a + e·u
            const ex = s.bx - s.ax, ez = s.bz - s.az, den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((s.ax - ox) * ez - (s.az - oz) * ex) / den, u = ((s.ax - ox) * dz - (s.az - oz) * dx) / den;
            if (u < 0 || u > 1 || t <= 0.5) continue;
            const cos = Math.abs(dx * s.nx + dz * s.nz) || 1;
            const tf = t - s.r / Math.max(0.3, cos);              // faccia del corpo, non il suo asse
            if (tf < tBest) { tBest = tf; tipo = s.type; }
          }
          if (tBest < d - C) break;
        }
        const edge = this.w[i] / 2 + E.kerb[i];
        if (tBest <= MAX) { E.barD[i] = Math.max(edge + 0.2, tBest); E.bar[i] = tipo; }
        else { E.aperto[i] = 1; this.aperti++; }
        E.netD[i] = edge + 30;
      }
    }
    // Il raggio perpendicolare non vede le teste di barriera che arrivano di sbieco fino al bordo (Gombet, 13-11):
    // ogni punto dei corpi (ogni 0,5 m) si proietta sul campione più vicino e, se è più vicino di quanto trovato,
    // accorcia la distanza su quel campione e su quelli a ±3 m (lunghezza dell'auto).
    const R3 = Math.max(1, Math.round(3 / this.step));
    const corto = (i, sg, dd) => {
      const E = sg > 0 ? this.R : this.L;
      for (let k = -R3; k <= R3; k++) {
        const j = (i + k + n) % n, lim = Math.max(this.w[j] / 2 + E.kerb[j] + 0.2, dd);
        if (lim < E.barD[j]) { E.barD[j] = lim; if (E.aperto[j]) { E.aperto[j] = 0; this.aperti--; } }
      }
    };
    for (const s of S) {
      const m = Math.max(1, Math.ceil(s.len / 0.5));
      for (let k = 0; k <= m; k++) {
        const x = s.ax + (s.bx - s.ax) * (k / m), z = s.az + (s.bz - s.az) * (k / m), y = s.ay + (s.by - s.ay) * (k / m);
        let best = -1, bd = 14 * 14;
        for (const i of this.near(x, z, 14)) {
          if (Math.abs(this.py[i] - y) > 3) continue;
          const d2 = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
          if (d2 < bd) { bd = d2; best = i; }
        }
        if (best < 0) continue;
        const lat = (x - this.px[best]) * this.nx[best] + (z - this.pz[best]) * this.nz[best];
        corto(best, lat >= 0 ? 1 : -1, Math.abs(lat) - s.r);
      }
    }
    for (const E of [this.R, this.L]) for (let i = 0; i < n; i++) E.runW[i] = Math.max(0, E.barD[i] - 0.6 - this.w[i] / 2 - E.kerb[i]);
  }

  // ---------- indice spaziale ----------
  _buildGrid() {
    const C = (this.cell = 25);
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minx = Math.min(minx, this.px[i]); maxx = Math.max(maxx, this.px[i]);
      minz = Math.min(minz, this.pz[i]); maxz = Math.max(maxz, this.pz[i]);
    }
    this.bounds = { minx, minz, maxx, maxz };
    this.gx0 = minx - 200; this.gz0 = minz - 200;
    this.gw = Math.ceil((maxx - minx + 400) / C); this.gh = Math.ceil((maxz - minz + 400) / C);
    this.grid = new Map();
    for (let i = 0; i < this.n; i++) {
      const key = this._key(this.px[i], this.pz[i]);
      let a = this.grid.get(key);
      if (!a) this.grid.set(key, (a = []));
      a.push(i);
    }
  }
  _key(x, z) {
    const gx = Math.floor((x - this.gx0) / this.cell), gz = Math.floor((z - this.gz0) / this.cell);
    return gz * 100000 + gx;
  }
  /** campioni entro `r` metri da (x,z) */
  near(x, z, r) {
    const out = [];
    const c = this.cell, R = Math.ceil(r / c);
    const gx = Math.floor((x - this.gx0) / c), gz = Math.floor((z - this.gz0) / c);
    for (let j = -R; j <= R; j++)
      for (let i = -R; i <= R; i++) {
        const a = this.grid.get((gz + j) * 100000 + gx + i);
        if (a) for (const k of a) out.push(k);
      }
    return out;
  }
  /** campione più vicino (ricerca globale) */
  nearest(x, z, rmax = 400) {
    let best = -1, bd = Infinity;
    for (let r = 50; r <= rmax && best < 0; r *= 2) {
      for (const i of this.near(x, z, r)) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) {
      for (let i = 0; i < this.n; i++) {
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return { i: best, dist: Math.sqrt(bd) };
  }

  // ---------- profilo dei bordi ----------
  _buildEdges() {
    const n = this.n, st = this.stile;
    const mk = () => ({
      kerb: new Float64Array(n), run: new Uint8Array(n), runW: new Float64Array(n),
      bar: new Uint8Array(n), barD: new Float64Array(n),
    });
    this.L = mk(); this.R = mk();
    const kerbK = st === 'citta' ? 1 / 70 : 1 / 320;
    const kerbW = st === 'citta' ? 0.7 : 1.3;
    const k1 = new Float64Array(n), k2 = new Float64Array(n);
    // kerb e larghezze di base
    for (const [side, E, sign] of [['L', this.L, -1], ['R', this.R, 1]]) {
      const runW = new Float64Array(n), gravel = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const kap = this.kappa[i];
        const c = Math.abs(kap);
        const outside = Math.sign(kap) === -sign; // curva a destra → esterno a sinistra
        E.kerb[i] = c > kerbK ? kerbW : 0;
        if (st === 'citta') {
          runW[i] = 1.6;
          E.run[i] = SURF.SIDEWALK;
          E.bar[i] = BAR.WALL;
        } else {
          const vc = Math.sqrt((1.6 * 9.81) / Math.max(c, 1e-4));
          if (outside && c > 1 / 190) {
            gravel[i] = Math.min(st === 'monza' ? 26 : 30, Math.max(10, vc * 0.45));
          }
          runW[i] = st === 'monza' ? 7 : 11;
          E.run[i] = SURF.GRASS;
          E.bar[i] = BAR.GUARDRAIL;
        }
      }
      // dilata le zone di ghiaia e i cordoli lungo la pista
      const dil = (arr, R) => {
        const o = new Float64Array(n);
        for (let i = 0; i < n; i++) {
          let m = 0;
          for (let k = -R; k <= R; k++) m = Math.max(m, arr[(i + k + n) % n]);
          o[i] = m;
        }
        return o;
      };
      const gD = smoothClosed(dil(gravel, Math.round(40 / this.step)), 6);
      const kD = dil(E.kerb, Math.round(10 / this.step));
      for (let i = 0; i < n; i++) {
        E.kerb[i] = kD[i] > 0.3 ? kerbW : 0;
        if (gD[i] > 6) {
          E.run[i] = SURF.GRAVEL;
          runW[i] = gD[i];
          E.bar[i] = BAR.TECPRO;
        }
        E.runW[i] = runW[i];
      }
    }
    // override manuali per tratti (metri)
    for (const o of this.overrides) {
      const sides = o.lato === 'B' || !o.lato ? [this.L, this.R] : [o.lato === 'L' ? this.L : this.R];
      for (let i = 0; i < n; i++) {
        const s = i * this.step;
        const inside = o.da <= o.a ? s >= o.da && s <= o.a : s >= o.da || s <= o.a;
        if (!inside) continue;
        for (const E of sides) {
          if (o.kerb !== undefined) E.kerb[i] = o.kerb;
          if (o.run !== undefined) E.run[i] = o.run;
          if (Array.isArray(o.runW)) {
            // rampa lineare da runW[0] (inizio del tratto) a runW[1] (fine): barriere che si raccordano senza gradini
            const len = o.da <= o.a ? o.a - o.da : this.length - o.da + o.a;
            const t = Math.max(0, Math.min(1, (((s - o.da) % this.length) + this.length) % this.length / Math.max(1, len)));
            E.runW[i] = o.runW[0] + (o.runW[1] - o.runW[0]) * t;
          } else if (o.runW !== undefined) E.runW[i] = o.runW;
          if (o.bar !== undefined) E.bar[i] = o.bar;
        }
      }
    }
    // distanza della barriera e limite dovuto ad altri tratti vicini della pista
    for (const [E, sign] of [[this.L, -1], [this.R, 1]]) {
      for (let i = 0; i < n; i++) {
        E.barD[i] = this.w[i] / 2 + E.kerb[i] + E.runW[i] + 0.6;
      }
      for (let i = 0; i < n; i++) {
        let lim = E.barD[i];
        for (const j of this.near(this.px[i], this.pz[i], lim + 30)) {
          let ds = Math.abs(j - i);
          ds = Math.min(ds, n - ds) * this.step;
          if (ds < 120) continue;
          const vx = this.px[j] - this.px[i], vz = this.pz[j] - this.pz[i];
          const along = vx * this.tx[i] + vz * this.tz[i];
          if (Math.abs(along) > 14) continue;
          const lat = (vx * this.nx[i] + vz * this.nz[i]) * sign;
          if (lat <= 0) continue;
          const mine = this.w[i] / 2, other = lat - this.w[j] / 2;
          lim = Math.min(lim, Math.max(mine + 0.8, (mine + other) / 2));
        }
        E.barD[i] = lim;
      }
      // morbido (solo verso il basso) per evitare gradini nella barriera
      const sm = smoothClosed(E.barD, 3);
      for (let i = 0; i < n; i++) {
        E.barD[i] = Math.min(E.barD[i], sm[i] + 0.3);
        const free = E.barD[i] - 0.6 - this.w[i] / 2;
        if (E.kerb[i] > free) E.kerb[i] = Math.max(0, free);
        E.runW[i] = Math.max(0, Math.min(E.runW[i], free - E.kerb[i]));
      }
    }
  }

  /**
   * Barriere come polilinee nel mondo (faccia interna), una per lato, usate sia per le collisioni sia per il disegno.
   * Dove la distanza dal centro cambia in fretta o supera il raggio della curva, la linea parallela al centro pista
   * si ripiega su sé stessa: il cappio lasciava un varco (la prima variante di Monza si tagliava da lì). I cappi si
   * tagliano al punto d'incrocio. E.bx/E.bz/E.by restano allineati ai campioni (i punti dei cappi collassano
   * sull'incrocio); this.barSeg è l'elenco compatto dei segmenti con la normale verso la pista, in una griglia.
   */
  _buildBarrierLines() {
    const n = this.n;
    const segs = [], spigoli = [];
    const inter = (ax, az, bx, bz, cx, cz, dx, dz) => {
      const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) return null;
      const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
      if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
      return [ax + rx * t, az + rz * t];
    };
    for (const [E, sg] of [[this.R, 1], [this.L, -1]]) {
      const X = new Float64Array(n), Z = new Float64Array(n), Y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const d = E.barD[i];
        X[i] = this.px[i] + this.nx[i] * sg * d;
        Z[i] = this.pz[i] + this.nz[i] * sg * d;
        Y[i] = this.py[i] + sg * Math.min(d, this.w[i] / 2) * Math.tan(this.bank[i]);
      }
      const M = Math.round(90 / this.step); // un cappio è lungo al più ~90 m di pista
      for (let pass = 0; pass < 4; pass++) {
        let tagli = 0;
        for (let i = 0; i < n; i++) {
          const i1 = (i + 1) % n;
          if (Math.hypot(X[i1] - X[i], Z[i1] - Z[i]) < 1e-4) continue;
          let kHit = -1, hit = null;
          for (let k = 2; k <= M; k++) {
            const a = (i + k) % n, b = (a + 1) % n;
            const h = inter(X[i], Z[i], X[i1], Z[i1], X[a], Z[a], X[b], Z[b]);
            if (h) { kHit = k; hit = h; }
          }
          if (kHit > 0) {
            for (let k = 1; k <= kHit; k++) { const q = (i + k) % n; X[q] = hit[0]; Z[q] = hit[1]; }
            tagli++;
            i += kHit - 1;
          }
        }
        if (!tagli) break;
      }
      E.bx = X; E.bz = Z; E.by = Y;
      // segmenti compatti (senza quelli di lunghezza nulla)
      const first = segs.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = X[j] - X[i], ez = Z[j] - Z[i], len = Math.hypot(ex, ez);
        if (len < 0.02) continue;
        const ux = ex / len, uz = ez / len;
        segs.push({ ax: X[i], az: Z[i], bx: X[j], bz: Z[j], y: (Y[i] + Y[j]) / 2, len, ux, uz,
          nx: sg * uz, nz: -sg * ux, type: E.bar[i], side: sg, i, prev: -1, next: -1 });
      }
      const last = segs.length;
      for (let k = first; k < last; k++) {
        segs[k].prev = k > first ? k - 1 : last - 1;
        segs[k].next = k < last - 1 ? k + 1 : first;
      }
      // spigoli rivolti verso la pista (incroci dei cappi, apici interni stretti): li prova anche la sagoma dell'auto
      for (let k = first; k < last; k++) {
        const A = segs[segs[k].prev], B = segs[k];
        const cross = A.ux * B.uz - A.uz * B.ux; // >0 = svolta a destra
        const verso = cross * sg; // il lato destro gira verso la pista quando svolta a destra
        if (verso > Math.sin(0.25)) spigoli.push({ x: B.ax, z: B.az, y: B.y, type: B.type });
      }
    }
    this.barSeg = segs;
    this.barSpigoli = spigoli;
    // griglia (celle da 8 m, segmenti allargati di 3 m)
    const C = 8, g = new Map(), gs = new Map();
    const put = (map, x0, z0, x1, z1, k) => {
      for (let gz = Math.floor(z0 / C); gz <= Math.floor(z1 / C); gz++)
        for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) {
          const key = gz * 100003 + gx;
          let a = map.get(key);
          if (!a) map.set(key, (a = []));
          a.push(k);
        }
    };
    segs.forEach((s, k) => put(g, Math.min(s.ax, s.bx) - 3, Math.min(s.az, s.bz) - 3, Math.max(s.ax, s.bx) + 3, Math.max(s.az, s.bz) + 3, k));
    spigoli.forEach((s, k) => put(gs, s.x - 3, s.z - 3, s.x + 3, s.z + 3, k));
    this._barGrid = g; this._spGrid = gs; this._barC = C;   // (fase 0: per il disegno e per tests/barriere.mjs)
  }

  /** spigoli di barriera entro 3 m da (x, z) */
  spigoliVicini(x, z) {
    return this._spGrid.get(Math.floor(z / this._barC) * 100003 + Math.floor(x / this._barC)) || [];
  }

  /**
   * Il punto (x, z) all'altezza y è oltre una barriera? Ritorna null (dentro) oppure, in out, la direzione per
   * rientrare (nx, nz, verso la pista), la profondità e il tipo di barriera. Cerca la barriera più vicina entro 3 m.
   */
  barrierContact(x, z, y, out = {}) {
    const list = this._barGrid.get(Math.floor(z / this._barC) * 100003 + Math.floor(x / this._barC));
    if (!list) return null;
    const S = this.barSeg;
    let best = -1, bd = 9, bt = 0, qx = 0, qz = 0;
    for (const k of list) {
      const s = S[k];
      if (Math.abs(s.y - y) > 3) continue; // altro tratto sopra o sotto (ponti)
      let t = ((x - s.ax) * s.ux + (z - s.az) * s.uz) / s.len;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = s.ax + (s.bx - s.ax) * t, cz = s.az + (s.bz - s.az) * t;
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 < bd) { bd = d2; best = k; bt = t; qx = cx; qz = cz; }
    }
    if (best < 0) return null;
    const s = S[best];
    let nx = s.nx, nz = s.nz;
    if (bt <= 0 || bt >= 1) { // vertice: pseudo-normale (media dei due segmenti)
      const o = S[bt <= 0 ? s.prev : s.next];
      nx += o.nx; nz += o.nz;
      const l = Math.hypot(nx, nz) || 1;
      nx /= l; nz /= l;
    }
    const dx = x - qx, dz = z - qz;
    if (dx * nx + dz * nz >= 0) return null; // dal lato della pista
    const dist = Math.sqrt(bd);
    if (dist > 1e-6) { out.nx = -dx / dist; out.nz = -dz / dist; } else { out.nx = nx; out.nz = nz; }
    out.depth = dist;
    out.type = s.type;
    return out;
  }

  /** bordi già calcolati per campione (circuiti dal pacchetto): {L, R} con kerb, run, runW, bar, barD */
  _edgesFrom(lati) {
    const n = this.n;
    for (const k of ['L', 'R']) {
      const S = lati[k];
      const E = { kerb: new Float64Array(n), run: new Uint8Array(n), runW: new Float64Array(n), bar: new Uint8Array(n), barD: new Float64Array(n) };
      for (let i = 0; i < n; i++) {
        E.kerb[i] = S.kerb[i]; E.run[i] = S.run[i]; E.bar[i] = S.bar[i]; E.barD[i] = S.barD[i];
        E.runW[i] = Math.max(0, S.barD[i] - 0.6 - this.w[i] / 2 - S.kerb[i]);
      }
      // corsia box dal pacchetto: centro corsia e muretto (isola) per campione
      if (S.pitC) { E.pitC = Float64Array.from(S.pitC); E.isl0 = Float64Array.from(S.isl0); E.isl1 = Float64Array.from(S.isl1); this.pit = { E }; }
      this[k] = E;
    }
  }

  /**
   * Corsia box (def.pit = {lato, da, a, d, w, rIn, rOut}): asfalto fino al muro esterno dietro la corsia e
   * un muretto box (isola solida) fra pista e corsia. Profilo del centro corsia: dal bordo pista a d in rIn metri,
   * costante, poi di nuovo al bordo in rOut metri.
   */
  _buildPit() {
    const P = this.def.pit;
    if (!P) { if (!this.pit) this.pit = null; return; }
    const n = this.n, E = P.lato === 'L' ? this.L : this.R;
    const len = P.da <= P.a ? P.a - P.da : this.length - P.da + P.a;
    E.pitC = new Float64Array(n); E.isl0 = new Float64Array(n); E.isl1 = new Float64Array(n);
    const sm = (x) => x * x * (3 - 2 * x);
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      const u = (((s - P.da) % this.length) + this.length) % this.length; // metri dall'inizio della corsia
      if (u > len) continue;
      const hw = this.w[i] / 2;
      const k = u < P.rIn ? sm(u / P.rIn) : u > len - P.rOut ? sm((len - u) / P.rOut) : 1;
      const c = hw + (P.d - hw) * k;            // centro corsia (distanza dal centro pista)
      E.pitC[i] = c;
      const outer = c + P.w / 2 + 1.0;
      if (outer > E.barD[i]) E.barD[i] = outer;
      E.run[i] = SURF.RUNOFF;
      E.bar[i] = BAR.WALL;
      E.runW[i] = Math.max(0, E.barD[i] - 0.6 - hw - E.kerb[i]);
      // muretto: da 1,2 m oltre il cordolo, largo 0,8 m, dove la corsia se n'è staccata abbastanza
      const a = hw + E.kerb[i] + 1.2, b = a + 0.8;
      if (c - P.w / 2 > b + 0.4) { E.isl0[i] = a; E.isl1[i] = b; }
    }
    this.pit = { ...P, E, len };
  }

  /** la proiezione p cade nella corsia box (oltre il muretto o nei raccordi)? */
  inPit(p) {
    if (!this.pit) return false;
    const E = this.pit.E;
    if ((p.d >= 0 ? this.R : this.L) !== E || !E.pitC[p.i]) return false;
    return Math.abs(p.d) > this.w[p.i] / 2 + E.kerb[p.i] + 0.5;
  }

  // ---------- interrogazioni ----------
  wrapS(s) {
    s %= this.length;
    return s < 0 ? s + this.length : s;
  }
  idx(i) {
    return ((i % this.n) + this.n) % this.n;
  }
  /**
   * Proietta (x,z) sulla pista. hint = indice del frame precedente (o -1).
   * Ritorna un oggetto riusabile {i, t, s, d, cy, w}.
   */
  project(x, z, hint = -1, out = {}) {
    const n = this.n;
    let best = -1, bd = Infinity;
    if (hint < 0) best = this.nearest(x, z).i;
    else {
      for (let k = -25; k <= 25; k++) {
        const i = (hint + k + n) % n;
        const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
    }
    // segmento giusto: best o best-1
    let i = best;
    let vx = x - this.px[i], vz = z - this.pz[i];
    let along = vx * this.tx[i] + vz * this.tz[i];
    if (along < 0) {
      i = (i - 1 + n) % n;
      vx = x - this.px[i]; vz = z - this.pz[i];
      along = vx * this.tx[i] + vz * this.tz[i];
    }
    const j = (i + 1) % n;
    const t = Math.max(0, Math.min(1, along / this.step));
    const nx = this.nx[i] + (this.nx[j] - this.nx[i]) * t;
    const nz = this.nz[i] + (this.nz[j] - this.nz[i]) * t;
    const cx = this.px[i] + (this.px[j] - this.px[i]) * t;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * t;
    out.i = i; out.t = t;
    out.s = (i + t) * this.step;
    out.d = (x - cx) * nx + (z - cz) * nz;
    out.cy = this.py[i] + (this.py[j] - this.py[i]) * t;
    out.w = this.w[i] + (this.w[j] - this.w[i]) * t;
    out.bank = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    return out;
  }
  /** quota del terreno/strada a distanza laterale d dal centro (proiezione già calcolata) */
  groundY(p) {
    const hw = p.w / 2;
    const dd = Math.max(-hw, Math.min(hw, p.d));
    let y = p.cy + dd * Math.tan(p.bank);
    const E = p.d >= 0 ? this.R : this.L;
    const ad = Math.abs(p.d);
    if (ad > hw) {
      const kw = E.kerb[p.i];
      if (ad <= hw + kw) y += 0.05 * Math.min(1, (ad - hw) / 0.3); // cordolo rialzato
      else y -= 0.04;
    }
    return y;
  }
  /** tipo di superficie e distanza della barriera dal lato in cui si trova d */
  surface(p) {
    const E = p.d >= 0 ? this.R : this.L;
    const i = p.i;
    const ad = Math.abs(p.d), hw = p.w / 2;
    let type;
    if (ad <= hw) type = SURF.ROAD;
    else if (ad <= hw + E.kerb[i]) type = SURF.KERB;
    else type = E.run[i];
    return type;
  }
  /** distanza della faccia della barriera dal centro, nel punto proiettato p (fase 0: per la grafica e le prove; la
   *  fisica usa i corpi solidi e, come rete, barrier()) */
  barrieraVera(p, side) {
    const E = side > 0 ? this.R : this.L, j = (p.i + 1) % this.n;
    return E.barD[p.i] + (E.barD[j] - E.barD[p.i]) * p.t;
  }
  barrier(p, side) {
    const E = side > 0 ? this.R : this.L;
    if (E.netD) return E.netD[p.i] + (E.netD[(p.i + 1) % this.n] - E.netD[p.i]) * p.t;   // barriere vere: qui solo la rete di sicurezza
    const j = (p.i + 1) % this.n;
    return E.barD[p.i] + (E.barD[j] - E.barD[p.i]) * p.t;
  }
  /** punto in coordinate mondo a (s, d) */
  pointAt(s, d = 0, out = {}) {
    s = this.wrapS(s);
    const f = s / this.step;
    const i = Math.floor(f) % this.n, j = (i + 1) % this.n, t = f - Math.floor(f);
    const nx = this.nx[i] + (this.nx[j] - this.nx[i]) * t;
    const nz = this.nz[i] + (this.nz[j] - this.nz[i]) * t;
    const tx = this.tx[i] + (this.tx[j] - this.tx[i]) * t;
    const tz = this.tz[i] + (this.tz[j] - this.tz[i]) * t;
    out.x = this.px[i] + (this.px[j] - this.px[i]) * t + nx * d;
    out.z = this.pz[i] + (this.pz[j] - this.pz[i]) * t + nz * d;
    const w = this.w[i] + (this.w[j] - this.w[i]) * t;
    const bank = this.bank[i] + (this.bank[j] - this.bank[i]) * t;
    out.y = this.py[i] + (this.py[j] - this.py[i]) * t + Math.max(-w / 2, Math.min(w / 2, d)) * Math.tan(bank);
    out.yaw = Math.atan2(tz, tx);
    out.i = i;
    return out;
  }
  /** nome della curva più vicina a s (per HUD) */
  cornerAt(s) {
    let best = null, bd = 220;
    for (const c of this.curve) {
      let d = Math.abs(this.wrapS(s - c.s));
      d = Math.min(d, this.length - d);
      if (d < bd) { bd = d; best = c.name; }
    }
    return best;
  }
}
