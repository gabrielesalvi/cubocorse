// Dal pacchetto circuito/1 alla pista della fisica (Track di Cubo Corse).
// Niente three.js: gira anche in Node per i test.
//
// Coordinate. Pacchetto: x = est, y = nord, z = quota. Fisica (come Cubo Corse): x = est, z = sud, y = quota.
// Quindi fisica (x, y, z) = pacchetto (x, z, -y). Il lato destro resta destro (d > 0).
//
// La Track della fisica vuole una linea centrale con larghezza simmetrica: la si ricava dall'asse del pacchetto
// spostandolo a metà fra i due bordi (bordi_pista), poi si ricampiona a passo costante (2 m).
// Per campione e per lato: cordolo (dai poligoni dei cordoli), superficie oltre il bordo (vie di fuga in erba,
// ghiaia, asfalto, marciapiedi), distanza e tipo della barriera (bordi_barriera e linee delle barriere).
// La quota è quella della superficie disegnata: terreno del pacchetto (già raccordato al profilo di progetto)
// più il rialzo in curva; sul cavalcavia e sulle rampe, la quota dell'impalcato.

import { Track, SURF, BAR } from './track.js';

const PASSO = 2;

// ---------------------------------------------------------------- poligoni con indice a celle
class IndicePoligoni {
  constructor(poligoni, cella = 25) {
    this.c = cella; this.m = new Map(); this.p = [];
    for (const p of poligoni || []) {
      const A = p.anello; if (!A || A.length < 3) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of A) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const k = this.p.push({ A, B: p.buchi || [], box: [x0, y0, x1, y1], dati: p }) - 1;
      for (let i = Math.floor(x0 / cella); i <= Math.floor(x1 / cella); i++)
        for (let j = Math.floor(y0 / cella); j <= Math.floor(y1 / cella); j++) {
          const key = i * 100003 + j; if (!this.m.has(key)) this.m.set(key, []); this.m.get(key).push(k);
        }
    }
  }
  dentro(x, y) {
    const l = this.m.get(Math.floor(x / this.c) * 100003 + Math.floor(y / this.c)); if (!l) return null;
    for (const k of l) {
      const P = this.p[k], b = P.box;
      if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
      if (pip(x, y, P.A) && !P.B.some((h) => pip(x, y, h))) return P.dati;
    }
    return null;
  }
}
function pip(x, y, R) {
  let ins = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const [xi, yi] = R[i], [xj, yj] = R[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}

// tipi di barriera del pacchetto → tipi della fisica (rimbalzo: muro 0,08, guardrail 0,04, TecPro 0)
const TIPO_BAR = { barriera: BAR.WALL, parapetto: BAR.WALL, varco: BAR.WALL, muretto_box: BAR.WALL, transenna: BAR.GUARDRAIL, guardrail: BAR.GUARDRAIL,
  assorbitore: BAR.TECPRO, pneumatici: BAR.TECPRO, recinzione: BAR.FENCE };

/**
 * dati = { circuito, versioni, terreno } come li carica viewer/src/dati/pacchetto.js
 * v = 'A' | 'B'
 * Ritorna { track, mappa } dove mappa.s(sAsse) converte una s del pacchetto nella s della pista della fisica.
 */
/**
 * Profilo dell'IA per versione (fase 0, decisione del 17-11): sulle B il profilo «cittadino veloce», sulle A (strade vere,
 * strette) quello di Circuit Studio di oggi. Un pacchetto può dichiararlo per versione (versioni.<v>.profilo_ia).
 */
export const PROFILO_VERSIONE = { A: 'cittadino', B: 'cittadinoVeloce' };

export function pistaDaPacchetto(dati, v = 'B', { profiloIA } = {}) {
  const { circuito, terreno } = dati, V = dati.versioni[v], lv = V.livelli;
  const P = circuito.asse.punti, n = P.length, passoA = circuito.asse.passo_m;
  const bp = V.bordi_pista;
  // normali destre dell'asse (pacchetto)
  const NX = new Float64Array(n), NY = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    NX[i] = ty / l; NY[i] = -tx / l;
  }
  // barriera: B dai bordi della barriera; A (strade reali) dallo spazio libero della B (edifici, muri), al massimo 6 m oltre il bordo
  const VB = dati.versioni.B;
  const barSx = new Float64Array(n), barDx = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (V.bordi_barriera) { barSx[i] = V.bordi_barriera.sinistra[i]; barDx[i] = V.bordi_barriera.destra[i]; }
    else {
      const sp = VB?.bordi_spazio;
      barSx[i] = Math.min(sp ? sp.sinistra[i] : 99, bp.sinistra[i] + 6);
      barDx[i] = Math.min(sp ? sp.destra[i] : 99, bp.destra[i] + 6);
    }
    barSx[i] = Math.max(barSx[i], bp.sinistra[i] + 0.4); barDx[i] = Math.max(barDx[i], bp.destra[i] + 0.4);
  }
  // cordoli: nel pacchetto stanno dentro il bordo della pista (dal bordo a ~1 m verso l'interno). Per la fisica
  // l'asfalto finisce dove comincia il cordolo, e il cordolo va da lì al bordo (conta come pista per i limiti).
  const kSx = new Float64Array(n), kDx = new Float64Array(n);
  for (const p of lv.cordoli?.poligoni || []) {
    if (p.s == null) continue;
    const i = Math.round(p.s / passoA) % n, dx = p.lato === 'dx';
    let dmin = Infinity, a0 = Infinity, a1 = -Infinity;
    const tx = -NY[i], ty = NX[i];                                         // tangente
    for (const [x, y] of p.anello) {
      const ex = x - P[i][0], ey = y - P[i][1];
      const lat = (ex * NX[i] + ey * NY[i]) * (dx ? 1 : -1), al = ex * tx + ey * ty;
      dmin = Math.min(dmin, lat); a0 = Math.min(a0, al); a1 = Math.max(a1, al);
    }
    for (let k = Math.floor(a0 / passoA); k <= Math.ceil(a1 / passoA); k++) {
      const j = (((i + k) % n) + n) % n, edge = dx ? bp.destra[j] : bp.sinistra[j], w = edge - dmin;
      if (w > 0.15) { const K = dx ? kDx : kSx; K[j] = Math.max(K[j], Math.min(1.5, w)); }
    }
  }
  // superficie oltre il cordolo
  const IG = new IndicePoligoni(lv.fuga_ghiaia?.poligoni), IE = new IndicePoligoni(lv.fuga_erba?.poligoni),
    IF = new IndicePoligoni(lv.fuga_asfalto?.poligoni), IM = new IndicePoligoni(lv.marciapiedi?.poligoni);
  const runAt = (x, y) => (IG.dentro(x, y) ? SURF.GRAVEL : IE.dentro(x, y) ? SURF.GRASS : IF.dentro(x, y) ? SURF.RUNOFF : IM.dentro(x, y) ? SURF.SIDEWALK : SURF.RUNOFF);
  const rSx = new Uint8Array(n), rDx = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    for (const [lato, R, ed, kk, bb] of [[-1, rSx, bp.sinistra, kSx, barSx], [1, rDx, bp.destra, kDx, barDx]]) {
      // due punti nella fascia fra cordolo e barriera: vince il più "lento" (erba o ghiaia)
      const e = ed[i], b = bb[i], t1 = Math.min(b - 0.3, e + 0.8), t2 = Math.min(b - 0.3, e + 2.5);
      let r = SURF.RUNOFF;
      for (const t of [t1, t2]) {
        if (t <= e) continue;
        const q = runAt(P[i][0] + NX[i] * t * lato, P[i][1] + NY[i] * t * lato);
        if (q === SURF.GRAVEL || (q === SURF.GRASS && r !== SURF.GRAVEL) || (q === SURF.SIDEWALK && r === SURF.RUNOFF)) r = q;
      }
      R[i] = r;
    }
  }
  // tipo di barriera: il vertice di linea più vicino alla posizione della barriera
  const celle = new Map(), C = 6;
  for (const l of lv.barriere?.linee || []) {
    const t = TIPO_BAR[l.tipo] ?? BAR.WALL;
    for (const p of l.punti) {
      const key = Math.floor(p[0] / C) * 100003 + Math.floor(p[1] / C);
      if (!celle.has(key)) celle.set(key, []); celle.get(key).push([p[0], p[1], t]);
    }
  }
  const tipoBar = (x, y) => {
    let best = BAR.WALL, bd = 2.5 * 2.5;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const q of celle.get((Math.floor(x / C) + a) * 100003 + Math.floor(y / C) + b) || []) {
        const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < bd) { bd = d; best = q[2]; }
      }
    }
    return best;
  };
  const tSx = new Uint8Array(n), tDx = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    tSx[i] = v === 'B' ? tipoBar(P[i][0] - NX[i] * barSx[i], P[i][1] - NY[i] * barSx[i]) : BAR.WALL;
    tDx[i] = v === 'B' ? tipoBar(P[i][0] + NX[i] * barDx[i], P[i][1] + NY[i] * barDx[i]) : BAR.WALL;
  }
  // corsia box (pacchetto: poligono corsia_box e linee muretto_box della versione). Per campione dell'asse, sul lato
  // del pit: corsia da l0 a l1 (raggio lungo la normale), muretto a m. La barriera di quel lato va al bordo esterno
  // della corsia, il muretto diventa un'isola solida (Track: isl0/isl1), la corsia è asfalto (RUNOFF).
  const pitLato = /^sinistra/.test(circuito.pit?.lato || '') ? -1 : 1;
  const pitC = new Float64Array(n), isl0 = new Float64Array(n), isl1 = new Float64Array(n);
  const IC = new IndicePoligoni(lv.corsia_box?.poligoni, 10);
  const segM = [];
  for (const l of lv.muretto_box?.linee || []) for (let k = 0; k + 1 < l.punti.length; k++) segM.push([l.punti[k], l.punti[k + 1]]);
  const taglio = (ox, oy, dx, dy, a, b) => {           // distanza lungo il raggio (o + d·t) dell'incrocio col segmento ab, o null
    const ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) return null;
    const t = ((a[0] - ox) * ey - (a[1] - oy) * ex) / den, u = ((a[0] - ox) * dy - (a[1] - oy) * dx) / den;
    return t >= 0 && u >= 0 && u <= 1 ? t : null;
  };
  if (IC.p.length) for (let i = 0; i < n; i++) {
    const nx = NX[i] * pitLato, ny = NY[i] * pitLato, ed = pitLato > 0 ? bp.destra[i] : bp.sinistra[i];
    let l0 = -1, l1 = -1;
    for (let d = Math.max(0, ed - 0.6); d < 40; d += 0.2) {
      const ins = !!IC.dentro(P[i][0] + nx * d, P[i][1] + ny * d);
      if (ins && l0 < 0) l0 = d;
      if (!ins && l0 >= 0) { l1 = d - 0.1; break; }
    }
    if (l0 < 0 || l1 - l0 < 1.5) continue;
    let m = null;
    for (const [a, b] of segM) { const t = taglio(P[i][0], P[i][1], nx, ny, a, b); if (t != null && t > ed - 1.5 && t < l0 + 1 && (m == null || t < m)) m = t; }
    pitC[i] = (l0 + l1) / 2;
    if (m != null) { isl0[i] = m - 0.2; isl1[i] = m + 0.2; }
    const B = pitLato > 0 ? barDx : barSx; B[i] = Math.max(B[i], l1 - 0.15);
    (pitLato > 0 ? rDx : rSx)[i] = SURF.RUNOFF;
  }
  // quota: impalcato del cavalcavia (nastro 3D, s del pacchetto a passo 1 m) oppure terreno + rialzo
  const ponte = lv.ponte && lv.ponte.s?.length ? lv.ponte : null;
  const zPonte = (s) => {
    if (!ponte) return null;
    const S = ponte.s; if (s < S[0] || s > S[S.length - 1]) return null;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const u = S[hi] > S[lo] ? (s - S[lo]) / (S[hi] - S[lo]) : 0;
    const z = (k) => (ponte.sinistra[k][2] + ponte.destra[k][2]) / 2;
    return z(lo) + (z(hi) - z(lo)) * u;
  };
  // campioni centrali (pacchetto)
  const cOff = new Float64Array(n), cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n), hw = new Float64Array(n), bank = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const sx = bp.sinistra[i] - kSx[i], dx = bp.destra[i] - kDx[i], c = (dx - sx) / 2;
    cx[i] = P[i][0] + NX[i] * c; cy[i] = P[i][1] + NY[i] * c; hw[i] = (sx + dx) / 2; cOff[i] = c;
    const rs = bp.rialzo_sx ? bp.rialzo_sx[i] : 0, rd = bp.rialzo_dx ? bp.rialzo_dx[i] : 0;
    const zp = zPonte(i * passoA);
    cz[i] = zp != null ? zp : terreno.z(cx[i], cy[i]) + 0.08 + (rs + rd) / 2;
    bank[i] = zp != null ? 0 : Math.atan((rd - rs) / (bp.sinistra[i] + bp.destra[i]));
  }
  // ascissa lungo la linea centrale e ricampionamento a passo costante
  const sc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; sc[i + 1] = sc[i] + Math.hypot(cx[j] - cx[i], cy[j] - cy[i]); }
  const Lc = sc[n], m = Math.round(Lc / PASSO);
  const samples = [], L = { kerb: [], run: [], bar: [], barD: [] }, R = { kerb: [], run: [], bar: [], barD: [] };
  const LP = pitLato > 0 ? R : L, sgP = pitLato > 0 ? -1 : 1;           // distanze dal centro: lato destro d - c, sinistro d + c
  if (IC.p.length) { LP.pitC = []; LP.isl0 = []; LP.isl1 = []; }
  let i = 0;
  for (let k = 0; k < m; k++) {
    const s = (k * Lc) / m;
    while (i < n - 1 && sc[i + 1] < s) i++;
    const j = (i + 1) % n, u = (s - sc[i]) / Math.max(1e-9, sc[i + 1] - sc[i]);
    const I = (a) => a[i] + (a[j] - a[i]) * u, near = u < 0.5 ? i : j;
    const x = I(cx), y = I(cy), c = I(cOff);
    samples.push({ x, y: I(cz), z: -y, w: 2 * I(hw), bank: I(bank) });
    // distanze dalla linea centrale (spostata di c verso destra rispetto all'asse)
    L.kerb.push(I(kSx)); R.kerb.push(I(kDx));
    L.run.push(rSx[near]); R.run.push(rDx[near]);
    L.bar.push(tSx[near]); R.bar.push(tDx[near]);
    L.barD.push(I(barSx) + c); R.barD.push(I(barDx) - c);
    if (LP.pitC) {
      const q = pitC[i] && pitC[j] ? near : -1;        // dentro la corsia solo se i due campioni lo sono (niente mezzi valori ai bordi)
      LP.pitC.push(q >= 0 ? pitC[q] + sgP * c : 0);
      LP.isl0.push(q >= 0 && isl0[q] ? isl0[q] + sgP * c : 0); LP.isl1.push(q >= 0 && isl1[q] ? isl1[q] + sgP * c : 0);
    }
  }
  // s del pacchetto → s della pista della fisica
  const mappaS = (sA) => {
    const f = ((((sA / passoA) % n) + n) % n), a = Math.floor(f), b = (a + 1) % n, u = f - a;
    const s1 = b === 0 ? Lc : sc[b];
    return (sc[a] + (s1 - sc[a]) * u) % Lc;
  };
  // griglia: le piazzole dipinte (staffe) davanti a ogni posizione; l'auto sta 2,4 m dietro la staffa
  const griglia = [];
  const segni = lv.traguardo?.poligoni || [];
  for (const g of circuito.partenza?.griglia || []) {
    const i0 = Math.round(g.s / passoA) % n, tx = -NY[i0], ty = NX[i0];
    let best = null;
    for (const p of segni) {
      if (p.elemento) continue;
      let mx = 0, my = 0; for (const q of p.anello) { mx += q[0]; my += q[1]; } mx /= p.anello.length; my /= p.anello.length;
      const ex = mx - P[i0][0], ey = my - P[i0][1], al = ex * tx + ey * ty, lat = ex * NX[i0] + ey * NY[i0];
      if (Math.abs(al) < 4 && Math.sign(lat) === (g.lato === 'destra' ? 1 : -1) && (!best || Math.abs(al) < Math.abs(best.al))) best = { al, lat };
    }
    const c = cOff[i0];
    const al = best ? best.al : 0, lat = best ? best.lat : (g.lato === 'destra' ? 2.5 : -2.5);
    griglia.push({ s: mappaS(g.s + al - 2.4), d: lat - c, pos: g.pos });
  }
  griglia.sort((a, b) => a.pos - b.pos);
  const def = {
    id: `${circuito.id}-${v}`, nome: `${circuito.nome} · ${v}`, stile: 'citta', samples, esatto: true, lati: { L, R },
    solidi: globalThis.process?.env?.SOLIDI === '0' ? null : [...solidiDaPacchetto(lv, terreno), ...ostacoliCitta(dati, v)],   // SOLIDI=0: vecchia fisica (solo per i confronti nei test)
    startS: 0, curve: (circuito.curve || []).map((c) => ({ name: `${c.numero} ${c.nome}`, s: mappaS((c.da + c.a) / 2) })),
    profiloIA: profiloIA || circuito.versioni?.[v]?.profilo_ia || PROFILO_VERSIONE[v] || 'cittadino',
  };
  const track = new Track(def);
  if (track.pit) track.pit.limite = (circuito.pit?.limite_kmh || 60) / 3.6;
  return { track, mappa: { s: mappaS }, griglia, lunghezzaAsse: n * passoA };
}

/**
 * Barriere solide (13-11-2026): le linee del pacchetto, le stesse che si vedono, come corpi per la fisica.
 * Per tipo, dove sta il corpo rispetto alla linea: [da, a] metri verso destra del verso della linea (la pista, per le
 * barriere da bordo, sta a sinistra). Come le disegna viewer/src/costruttori/linee.js: muri e varchi centrati (0,25 m),
 * TecPro da 1 m tutto dietro la linea, gomme su due file (diametro 0,6 m) con il filo davanti sulla linea, guardrail
 * a lama sui paletti, parapetto del cavalcavia sul cordolo di cemento. Per la fisica la linea diventa l'asse del corpo
 * (spostata a metà fra da e a) con raggio r = metà spessore; si urta da entrambi i lati.
 */
const CORPO = {
  barriera: [-0.125, 0.125], varco: [-0.125, 0.125], muretto_box: [-0.15, 0.15], transenna: [-0.1, 0.1],
  guardrail: [-0.05, 0.25], parapetto: [-0.1, 0.3], assorbitore: [0, 1.0], pneumatici: [0, 1.1], recinzione: [-0.1, 0.1],
};
export function solidiDaPacchetto(lv, terreno) {
  const out = [];
  const linee = [...(lv.barriere?.linee || []), ...(lv.muretto_box?.linee || []).map((l) => ({ ...l, tipo: 'muretto_box' }))];
  for (const l of linee) {
    const P = l.punti; if (!P || P.length < 2) continue;
    const [a, b] = CORPO[l.tipo] || CORPO.barriera, off = (a + b) / 2, r = (b - a) / 2;
    const m = P.length, pts = [];
    for (let k = 0; k < m; k++) {
      // normale destra media dei due segmenti (pacchetto: x est, y nord), allungata negli angoli (al più ×2)
      let nx = 0, ny = 0;
      for (const [p, q] of [[P[k - 1], P[k]], [P[k], P[k + 1]]]) {
        if (!p || !q) continue;
        const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
        nx += dy / d; ny += -dx / d;
      }
      const ln = Math.hypot(nx, ny) || 1, cnt = (k > 0) + (k < m - 1);
      const sc = (cnt === 2 ? Math.min(2, 2 / ln) : 1) / ln;     // ln = 2·cos(mezzo angolo) per due segmenti: spigolo vivo
      const x = P[k][0] + nx * sc * off, y = P[k][1] + ny * sc * off;
      const z = P[k].length > 2 ? P[k][2] : terreno.z(P[k][0], P[k][1]);
      pts.push([x, -y, z]);                                        // fisica: x, z = -y, quota
    }
    out.push({ punti: pts, tipo: TIPO_BAR[l.tipo] ?? BAR.WALL, r, nome: l.tipo });
  }
  return out;
}

/**
 * Maschera a celle da 1 m dei poligoni (riempimento a righe pari/dispari, buchi compresi): (x, y) → dentro?
 * Molto più veloce del punto-in-poligono sul poligono della pista, che è uno solo e grande quanto il circuito.
 */
function rasterPoligoni(poligoni, C = 1) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poligoni) for (const [x, y] of p.anello || []) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (!isFinite(x0)) return () => false;
  const W = Math.ceil((x1 - x0) / C) + 2, H = Math.ceil((y1 - y0) / C) + 2, M = new Uint8Array(W * H);
  for (const p of poligoni) {
    const righe = new Map();
    for (const R of [p.anello, ...(p.buchi || [])]) {
      if (!R || R.length < 3) continue;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        const [xa, ya] = R[j], [xb, yb] = R[i];
        if (ya === yb) continue;
        const r0 = Math.ceil((Math.min(ya, yb) - y0) / C - 0.5), r1 = Math.floor((Math.max(ya, yb) - y0) / C - 0.5);
        for (let r = r0; r <= r1; r++) {
          const yc = y0 + (r + 0.5) * C;
          if (yc < Math.min(ya, yb) || yc >= Math.max(ya, yb)) continue;
          const x = xa + ((yc - ya) * (xb - xa)) / (yb - ya);
          if (!righe.has(r)) righe.set(r, []); righe.get(r).push(x);
        }
      }
    }
    for (const [r, xs] of righe) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - x0) / C - 0.5)), c1 = Math.min(W - 1, Math.floor((xs[k + 1] - x0) / C - 0.5));
        for (let c = c0; c <= c1; c++) M[r * W + c] = 1;
      }
    }
  }
  return (x, y) => {
    const c = Math.floor((x - x0) / C), r = Math.floor((y - y0) / C);
    return c >= 0 && r >= 0 && c < W && r < H && M[r * W + c] === 1;
  };
}

/**
 * La città vera come ostacolo (13-11-2026, secondo passo delle barriere solide): dove non c'è barriera (tolta, incroci
 * aperti, quasi tutta la A) si urtano i muri degli edifici e le recinzioni, muretti e siepi che si vedono nel gioco.
 * Solo entro 45 m dall'asse. I pezzi che cadrebbero sulla superficie guidabile (pista, vie di fuga, corsia box) si
 * scartano: lì un ostacolo sarebbe un errore dei dati, non un muro da urtare. Ritorna anche il conteggio degli scarti.
 */
const CORPO_CITTA = { muretto: [-0.125, 0.125, BAR.WALL], recinzione: [-0.125, 0.125, BAR.FENCE], cancellata: [-0.125, 0.125, BAR.FENCE],
  rete: [-0.1, 0.1, BAR.FENCE], siepe: [-0.45, 0.45, BAR.FENCE] };
export function ostacoliCitta(dati, v) {
  const { circuito, terreno, contesto } = dati, lv = dati.versioni[v].livelli, P = circuito.asse.punti;
  const CA = 15, celle = new Map(), R = 45;
  for (const p of P) { const k = Math.floor(p[0] / CA) * 100003 + Math.floor(p[1] / CA); if (!celle.has(k)) celle.set(k, []); celle.get(k).push(p); }
  const vicino = (x, y) => {                                         // entro R dall'asse?
    const cx = Math.floor(x / CA), cy = Math.floor(y / CA);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++)
      for (const p of celle.get((cx + a) * 100003 + cy + b) || []) if ((p[0] - x) ** 2 + (p[1] - y) ** 2 < R * R) return true;
    return false;
  };
  const libero = rasterPoligoni([lv.pista, lv.fuga_asfalto, lv.fuga_erba, lv.fuga_ghiaia, lv.corsia_box].flatMap((L) => L?.poligoni || []));
  const out = [];
  let scartati = 0;
  // una polilinea (pacchetto) → pezzi senza i segmenti sulla superficie guidabile e lontani dalla pista
  const aggiungi = (pts, r, off, tipo, nome) => {
    let cur = [];
    const chiudi = () => { if (cur.length >= 2) out.push({ punti: cur.map(([x, y]) => [x, -y, terreno.z(x, y)]), tipo, r, nome }); cur = []; };
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (!vicino(mx, my) && !vicino(a[0], a[1]) && !vicino(b[0], b[1])) { chiudi(); continue; }
      const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = dy / d * off, ny = -dx / d * off;
      const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny];
      let bad = false;
      for (let u = 0; u <= 1.0001 && !bad; u += Math.min(1, 1.5 / d)) bad = libero(A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u);
      if (bad) { scartati++; chiudi(); continue; }
      if (!cur.length) cur.push(A);
      cur.push(B);
    }
    chiudi();
  };
  for (const l of lv.recinzioni?.linee || []) {
    const [a, b, tipo] = CORPO_CITTA[l.tipo] || CORPO_CITTA.muretto;
    if (l.punti?.length >= 2) aggiungi(l.punti, (b - a) / 2, (a + b) / 2, tipo, l.tipo);
  }
  for (const e of contesto?.edifici || []) {
    if (!(e.h > 0.3) || !e.anello || e.anello.length < 3) continue;
    const A = e.anello, chiuso = A[0][0] === A[A.length - 1][0] && A[0][1] === A[A.length - 1][1] ? A : [...A, A[0]];
    aggiungi(chiuso, 0.15, 0, BAR.WALL, 'edificio');
  }
  out.scartati = scartati;
  return out;
}

/** da coordinate della fisica a quelle del pacchetto, e viceversa */
export const versoPacchetto = (x, y, z) => [x, -z, y];
export const versoFisica = (x, y, z) => [x, z, -y];
