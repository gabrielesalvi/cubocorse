// Landmark dettagliati, low-poly a facce piatte: piante e altezze dal DBT (contesto.edifici con landmark = id),
// forma e colori dalla descrizione in circuito.landmark[].modello (sorgenti/<id>/landmark-dettagli.json).
// Elementi: tetti a padiglione, capanna, falda o piani con parapetto; zoccolo, cornicione, finestre (persiane, lunette);
// campanile con cella e orologio; facciata di chiesa a due ordini; torrioni d'angolo; portico; balcone; ingresso con
// pilastri, bandiere e scritta; fossato; fotovoltaico; lucernari. Coordinate del pacchetto: x est, y nord, z quota.
// 09-11-2026 (edifici fedeli senza etichetta): portici continui su strada (soffitti di portico DBT, pilastri o archi,
// vetrine sotto), vetrine, tende da sole, dehors con ombrelloni, insegne accese, neon (tubi e scritte che brillano col
// bagliore della qualità Ultra), muro di cinta con cancello.
import * as THREE from 'three';
import { forma, suddividi } from './geom.js';

const DIR = { nord: [0, 1], sud: [0, -1], est: [1, 0], ovest: [-1, 0] };
const C = (h) => new THREE.Color(h);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// ------------------------------------------------------------------ geometria piana
function area(R) { let a = 0; for (let i = 0; i < R.length; i++) { const p = R[i], q = R[(i + 1) % R.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
function pip(x, y, R) {
  let ins = false;
  for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
    const [xi, yi] = R[i], [xj, yj] = R[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
function distBordo(x, y, R) {
  let m = Infinity;
  for (let i = 0; i < R.length; i++) {
    const [ax, ay] = R[i], [bx, by] = R[(i + 1) % R.length], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    m = Math.min(m, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return m;
}
function inviluppo(P) {
  const p = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cr(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/** rettangolo di area minima: centro c, asse lungo u, asse corto v, lunghezze L ≥ W */
function rettangolo(R) {
  const H = inviluppo(R); let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 1e-6) continue;
    const u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l], v = [-u[1], u[0]];
    let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const p of H) { const s = dot(p, u), t = dot(p, v); s0 = Math.min(s0, s); s1 = Math.max(s1, s); t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
    const A = (s1 - s0) * (t1 - t0);
    if (!best || A < best.A) best = { A, u, v, s0, s1, t0, t1 };
  }
  let { u, v, s0, s1, t0, t1 } = best;
  if (s1 - s0 < t1 - t0) { [u, v] = [v, [-u[0], -u[1]]]; [s0, s1, t0, t1] = [t0, t1, -s1, -s0]; }
  const sc = (s0 + s1) / 2, tc = (t0 + t1) / 2;
  return { c: [u[0] * sc + v[0] * tc, u[1] * sc + v[1] * tc], u, v, L: s1 - s0, W: t1 - t0, A: best.A };
}
/** lato del rettangolo rivolto verso una direzione: normale n, tangente t, centro m, lunghezza */
function latoRett(r, nome) {
  const d = Array.isArray(nome) ? nome : DIR[nome] || DIR.est;                // 09-11: anche un vettore [dx, dy]
  const cand = [[r.u, r.L / 2, r.W], [[-r.u[0], -r.u[1]], r.L / 2, r.W], [r.v, r.W / 2, r.L], [[-r.v[0], -r.v[1]], r.W / 2, r.L]];
  let [n, h, len] = cand.reduce((a, b) => (dot(b[0], d) > dot(a[0], d) ? b : a));
  return { n, t: [-n[1], n[0]], m: [r.c[0] + n[0] * h, r.c[1] + n[1] * h], len, prof: 2 * h };
}

// ------------------------------------------------------------------ accumulatore di triangoli colorati
class Pezzi {
  constructor() { this.p = []; this.c = []; }
  tri(a, b, c, k) { this.p.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) this.c.push(k.r, k.g, k.b); }
  quad(a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); }
  /** scatola orientata: centro (x,y), asse t (largo w), asse n (profondo d), da z0 a z1; kSopra = colore della faccia in alto (se diverso) */
  scatola(cx, cy, t, w, d, z0, z1, k, kSopra = k) {
    const n = [-t[1], t[0]], P = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push([cx + t[0] * a * w / 2 + n[0] * b * d / 2, cy + t[1] * a * w / 2 + n[1] * b * d / 2]);
    for (let i = 0; i < 4; i++) { const p = P[i], q = P[(i + 1) % 4]; this.quad([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], k); }
    this.quad([P[0][0], P[0][1], z1], [P[1][0], P[1][1], z1], [P[2][0], P[2][1], z1], [P[3][0], P[3][1], z1], kSopra);
  }
  /** rettangolo verticale sulla parete: centro lungo il lato (x,y), tangente t, normale n (scostamento off), largo w, da z0 a z1 */
  pannello(x, y, t, n, off, w, z0, z1, k) {
    const ox = x + n[0] * off, oy = y + n[1] * off, a = [ox - t[0] * w / 2, oy - t[1] * w / 2], b = [ox + t[0] * w / 2, oy + t[1] * w / 2];
    this.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], k);
  }
  /** mezzo cerchio verticale (lunetta, arco) sopra z, raggio r */
  arco(x, y, t, n, off, r, z, k, seg = 5) {
    const ox = x + n[0] * off, oy = y + n[1] * off, c = [ox, oy, z];
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
      const p = (a) => [ox - t[0] * Math.cos(a) * r, oy - t[1] * Math.cos(a) * r, z + Math.sin(a) * r];
      this.tri(c, p(a0), p(a1), k);
    }
  }
  /** disco verticale (orologio) */
  disco(x, y, t, n, off, r, z, k, seg = 10) {
    const ox = x + n[0] * off, oy = y + n[1] * off, c = [ox, oy, z];
    for (let i = 0; i < seg; i++) {
      const p = (a) => [ox + t[0] * Math.cos(a) * r, oy + t[1] * Math.cos(a) * r, z + Math.sin(a) * r];
      this.tri(c, p(2 * Math.PI * i / seg), p(2 * Math.PI * (i + 1) / seg), k);
    }
  }
  /** poligono orizzontale (soffitto, pavimento) a quota z */
  piano(R, z, k) {
    const a = new THREE.ShapeGeometry(forma({ anello: R, buchi: [] }, 1e9)).toNonIndexed().attributes.position.array;
    for (let i = 0; i < a.length; i += 9) this.tri([a[i], a[i + 1], z], [a[i + 3], a[i + 4], z], [a[i + 6], a[i + 7], z], k);
  }
  /** tubo a sezione quadrata (lato s) fra due punti 3D (neon, ringhiere) */
  tubo(a, b, s, k) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d) || 1, u = d.map((x) => x / l);
    const r = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let v = [u[1] * r[2] - u[2] * r[1], u[2] * r[0] - u[0] * r[2], u[0] * r[1] - u[1] * r[0]]; const lv = Math.hypot(...v); v = v.map((x) => x / lv * s / 2);
    const w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const Q = (p, sv, sw) => [p[0] + v[0] * sv + w[0] * sw, p[1] + v[1] * sv + w[1] * sw, p[2] + v[2] * sv + w[2] * sw];
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) { const [s0, w0] = c[i], [s1, w1] = c[(i + 1) % 4]; this.quad(Q(a, s0, w0), Q(a, s1, w1), Q(b, s1, w1), Q(b, s0, w0), k); }
  }
  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------ tetti
function funzioneTetto(v, R, r, z0) {
  const T = v.tetto || { forma: 'piano' }, k = T.pendenza ?? 0.34;
  const loc = (x, y) => { const p = [x - r.c[0], y - r.c[1]]; return [dot(p, r.u), dot(p, r.v)]; };
  const quasiRett = Math.abs(area(R)) / r.A > 0.92;
  if (T.forma === 'capanna') return (x, y) => { const [, t] = loc(x, y); return z0 + k * Math.max(0, r.W / 2 - Math.abs(t)); };
  if (T.forma === 'falda') {
    const d = DIR[T.alto] || DIR.nord, su = Math.abs(dot(d, r.u)) > Math.abs(dot(d, r.v));
    const ax = su ? r.u : r.v, sg = dot(d, ax) >= 0 ? 1 : -1, ext = su ? r.L / 2 : r.W / 2;
    return (x, y) => { const [s, t] = loc(x, y); return z0 + k * Math.max(0, (su ? s : t) * sg + ext); };
  }
  if (T.forma === 'padiglione' || T.forma === 'piramide') {
    if (quasiRett) return (x, y) => { const [s, t] = loc(x, y); return z0 + k * Math.max(0, Math.min(r.W / 2 - Math.abs(t), r.L / 2 - Math.abs(s))); };
    return (x, y) => z0 + k * Math.min(distBordo(x, y, R), r.W / 2);
  }
  return () => z0;
}
function tetto(P, v, R, buchi, r, z0, fz) {
  const T = v.tetto || { forma: 'piano' }, k = C(T.colore || '#8f8f8f');
  const quasiRett = Math.abs(area(R)) / r.A > 0.92;
  if ((T.forma === 'padiglione' || T.forma === 'piramide') && quasiRett) {
    // falde esatte sul rettangolo: niente pieghe spurie
    const { c, u, v: w, L, W } = r, h = (T.pendenza ?? 0.34) * W / 2, a = Math.max(0, L / 2 - W / 2);
    const Q = (s, t, z) => [c[0] + u[0] * s + w[0] * t, c[1] + u[1] * s + w[1] * t, z];
    const A = Q(-L / 2, -W / 2, z0), B = Q(L / 2, -W / 2, z0), D = Q(L / 2, W / 2, z0), E = Q(-L / 2, W / 2, z0), r0 = Q(-a, 0, z0 + h), r1 = Q(a, 0, z0 + h);
    P.quad(A, B, r1, r0, k); P.quad(D, E, r0, r1, k); P.tri(B, D, r1, k); P.tri(E, A, r0, k);
    return;
  }
  const g = suddividi(new THREE.ShapeGeometry(forma({ anello: R, buchi }, 1e9)), T.forma === 'piano' ? 1e9 : (T.passo || 0.9));
  const a = g.attributes.position.array;
  for (let i = 0; i < a.length; i += 9) P.tri([a[i], a[i + 1], fz(a[i], a[i + 1]) + 0.01], [a[i + 3], a[i + 4], fz(a[i + 3], a[i + 4]) + 0.01], [a[i + 6], a[i + 7], fz(a[i + 6], a[i + 7]) + 0.01], k);
}

// ------------------------------------------------------------------ un volume
function volume(P, e, v, ctx, extra = {}) {
  const R = e.anello, r = extra.r || rettangolo(R), base = e.base, z0 = base + (extra.h ?? e.h);
  const fz = extra.fz || funzioneTetto(v, R, r, z0);
  const T = v.tetto || { forma: 'piano' }, piano = T.forma === 'piano', par = piano ? (T.parapetto || 0) : 0;
  const kp = C(v.parete || '#ddd'), kz = v.zoccolo ? C(v.zoccolo.colore) : kp, zh = v.zoccolo?.h || 0, kc = v.cornice ? C(v.cornice) : kp;
  const orient = area(R) > 0 ? 1 : -1;
  const lati = [];
  for (const anello of [R, ...(e.buchi || [])]) {
    for (let i = 0; i < anello.length; i++) {
      const p = anello[i], q = anello[(i + 1) % anello.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.05) continue;
      const t = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], n = [t[1] * orient, -t[0] * orient];
      if (anello === R && extra.salta?.(i)) continue;                              // 09-11: lato addossato a un altro volume
      if (anello === R) lati.push({ p, q, len, t, n });
      const pezzi = piano || T.forma === 'padiglione' ? 1 : Math.max(1, Math.ceil(len / 1.0));
      for (let j = 0; j < pezzi; j++) {
        const a = [p[0] + (q[0] - p[0]) * j / pezzi, p[1] + (q[1] - p[1]) * j / pezzi], b = [p[0] + (q[0] - p[0]) * (j + 1) / pezzi, p[1] + (q[1] - p[1]) * (j + 1) / pezzi];
        const fasce = [[base - 0.6, base + zh, kz], [base + zh, z0 - (v.cornice ? 0.4 : 0), kp]];
        if (v.cornice) fasce.push([z0 - 0.4, z0, kc]);
        for (const [za, zb, k] of fasce) if (zb > za) P.quad([a[0], a[1], za], [b[0], b[1], za], [b[0], b[1], zb], [a[0], a[1], zb], k);
        const ta = piano ? z0 + par : Math.max(z0, fz(a[0], a[1])), tb = piano ? z0 + par : Math.max(z0, fz(b[0], b[1]));
        if (ta > z0 + 0.01 || tb > z0 + 0.01) P.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], tb], [a[0], a[1], ta], piano ? kc : kp);
      }
    }
  }
  if (!extra.senzaTetto) tetto(P, v, R, e.buchi, r, z0, fz);
  // finestre
  const F = v.finestre;
  if (F) {
    const kf = C(F.colore || '#333'), ks = F.persiane && C(F.persiane), kcf = F.cornice && C(F.cornice);
    const lf = F.lati ? F.lati.map((x) => DIR[x]) : null;
    for (const L of lati) {
      if (L.len < (F.larghezza || 1) + 1.2) continue;
      if (lf && !lf.some((d) => dot(d, L.n) > 0.6)) continue;
      const passo = F.passo || 3.5, nW = Math.max(1, Math.floor((L.len - 1.2) / passo) + (L.len > passo ? 1 : 0)), s0 = (L.len - (nW - 1) * passo) / 2;
      for (let pi = 0; pi < (F.piani || 1); pi++) {
        const za = base + (F.primo ?? 1) + pi * (F.interpiano || 3.2), zb = za + (F.altezza || 1.5);
        if (zb > z0 - 0.25 && !F.lunetta) continue;
        for (let w = 0; w < nW; w++) {
          const s = s0 + w * passo; if (s < 0.5 || s > L.len - 0.5) continue;
          const x = L.p[0] + L.t[0] * s, y = L.p[1] + L.t[1] * s;
          if (ctx.coperto(x + L.n[0] * 0.5, y + L.n[1] * 0.5, za, e) || ctx.escluso(x, y, za, zb)) continue;
          const lw = F.larghezza || 1.1;
          if (kcf) P.pannello(x, y, L.t, L.n, 0.03, lw + 0.3, za - 0.15, zb + 0.15, kcf);
          if (F.lunetta) { P.pannello(x, y, L.t, L.n, 0.05, lw, za, za + (zb - za) * 0.45, kf); P.arco(x, y, L.t, L.n, 0.05, lw / 2, za + (zb - za) * 0.45, kf); }
          else P.pannello(x, y, L.t, L.n, 0.05, lw, za, zb, kf);
          if (ks) for (const sg of [-1, 1]) P.pannello(x + L.t[0] * sg * lw * 0.78, y + L.t[1] * sg * lw * 0.78, L.t, L.n, 0.06, lw * 0.5, za, zb, ks);
        }
      }
    }
  }
  // balconi (palazzine): solette con parapetto sui lati lunghi, a ogni piano dal primo
  const BL = v.balconi;
  if (BL) {
    const kb = C(BL.colore || '#e8e4dc'), kr = C(BL.parapetto || '#5b5f63');
    for (const L of lati) {
      if (L.len < 6 || Math.abs(dot(L.t, r.u)) < 0.7) continue;                   // solo i lati lunghi
      const w = Math.min(L.len - 2, BL.larghezza || L.len * 0.6), m = [L.p[0] + L.t[0] * L.len / 2, L.p[1] + L.t[1] * L.len / 2];
      if (ctx.coperto(m[0] + L.n[0] * 0.6, m[1] + L.n[1] * 0.6, base + 3, e)) continue;
      for (let k = 1; k < (BL.piani || 2) + 1; k++) {
        const z = base + k * (BL.interpiano || 3.0); if (z > z0 - 1) break;
        const c = [m[0] + L.n[0] * 0.6, m[1] + L.n[1] * 0.6];
        P.scatola(c[0], c[1], L.t, w, 1.2, z - 0.18, z, kb);
        const f = [m[0] + L.n[0] * 1.17, m[1] + L.n[1] * 1.17];
        P.scatola(f[0], f[1], L.t, w, 0.06, z, z + 1.0, kr);
      }
    }
  }
  // porte da garage (box, piano terra delle villette)
  const G = v.garage;
  if (G) for (const L of lati.filter((l) => l.len > 3).slice(0, G.lati || 1)) {
    const m = [L.p[0] + L.t[0] * L.len / 2, L.p[1] + L.t[1] * L.len / 2];
    if (!ctx.coperto(m[0] + L.n[0] * 0.5, m[1] + L.n[1] * 0.5, base + 1, e)) P.pannello(m[0], m[1], L.t, L.n, 0.04, Math.min(2.6, L.len - 0.6), base, base + 2.3, C(G.colore || '#6d7073'));
  }
  return { r, z0, fz, lati };
}

// ------------------------------------------------------------------ elementi speciali
function campanile(P, e, v, ctx) {
  const K = v.campanile, base = e.base, r = rettangolo(e.anello), da = base + K.cella_da, a = da + K.cella_h;
  volume(P, e, { ...v, tetto: { forma: 'piano' } }, ctx, { h: K.cella_da, senzaTetto: true });
  const kp = C(K.pilastri || '#eee'), ka = C(K.archi || '#222'), kk = C(K.cuspide || '#666');
  const Q = (s, t) => [r.c[0] + r.u[0] * s + r.v[0] * t, r.c[1] + r.u[1] * s + r.v[1] * t];
  const L = r.L, W = r.W, pw = Math.min(0.75, W * 0.22);
  // cella: nucleo scuro (le aperture) e pilastri d'angolo, cornice sopra e sotto
  const c0 = Q(0, 0); P.scatola(c0[0], c0[1], r.u, L - 0.5, W - 0.5, da, a, ka);
  for (const [sa, ta] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const c = Q(sa * (L / 2 - pw / 2), ta * (W / 2 - pw / 2)); P.scatola(c[0], c[1], r.u, pw, pw, da, a, kp); }
  P.scatola(c0[0], c0[1], r.u, L + 0.3, W + 0.3, da - 0.25, da, kp);
  P.scatola(c0[0], c0[1], r.u, L + 0.5, W + 0.5, a, a + 0.45, kp);
  // archi: lunette chiare sopra le aperture su ogni lato
  for (const nome of ['nord', 'sud', 'est', 'ovest']) {
    const S = latoRett(r, nome), w = S.len - 2 * pw;
    P.pannello(S.m[0], S.m[1], S.t, S.n, 0.02, w, a - w / 2 - 0.05, a, kp);
    P.arco(S.m[0], S.m[1], S.t, S.n, 0.04, w / 2 - 0.05, a - w / 2 - 0.05, ka);
  }
  // cuspide bassa a piramide e croce
  const top = a + 0.45, h = K.cuspide_h || 1.2, ap = [c0[0], c0[1], top + h];
  const B = [Q(-L / 2 - 0.25, -W / 2 - 0.25), Q(L / 2 + 0.25, -W / 2 - 0.25), Q(L / 2 + 0.25, W / 2 + 0.25), Q(-L / 2 - 0.25, W / 2 + 0.25)].map((p) => [p[0], p[1], top]);
  for (let i = 0; i < 4; i++) P.tri(B[i], B[(i + 1) % 4], ap, kk);
  if (K.croce) croce(P, c0[0], c0[1], r.u, top + h, 1.3, '#d9d6cf');
  // orologi
  if (K.orologio) for (const nome of K.orologio.lati) {
    const S = latoRett(r, nome), z = base + K.orologio.z;
    P.disco(S.m[0], S.m[1], S.t, S.n, 0.06, K.orologio.r, z, C('#f4f2ec'));
    P.pannello(S.m[0], S.m[1], S.t, S.n, 0.09, 0.08, z, z + K.orologio.r * 0.75, C('#222'));
    const ox = S.m[0] + S.t[0] * K.orologio.r * 0.3, oy = S.m[1] + S.t[1] * K.orologio.r * 0.3;
    P.pannello(ox, oy, S.t, S.n, 0.09, K.orologio.r * 0.6, z - 0.04, z + 0.04, C('#222'));
  }
}
function croce(P, x, y, t, z, h, col) {
  const k = C(col);
  P.scatola(x, y, t, 0.12, 0.12, z, z + h, k);
  P.scatola(x, y, t, h * 0.55, 0.12, z + h * 0.62, z + h * 0.74, k);
}
function facciata(P, e, v, info) {
  const F = v.facciata, S = latoRett(info.r, F.lato), base = e.base, t = S.t, n = S.n;
  const kc = C(F.colore), kl = C(F.lesene), sp = 0.6;
  const at = (off, along) => [S.m[0] + n[0] * off + t[0] * along, S.m[1] + n[1] * off + t[1] * along];
  const W1 = F.larghezza1, H1 = base + F.altezza1, W2 = F.larghezza2, H2 = H1 + 0.45 + F.altezza2;
  let c = at(sp / 2, 0); P.scatola(c[0], c[1], t, W1, sp, base - 0.3, H1, kc);
  for (const f of [-0.5, -0.2, 0.2, 0.5]) { c = at(sp + 0.07, f * (W1 - 0.7)); P.scatola(c[0], c[1], t, 0.7, 0.16, base - 0.3, H1, kl); }
  c = at(sp / 2 + 0.15, 0); P.scatola(c[0], c[1], t, W1 + 0.5, sp + 0.3, H1, H1 + 0.45, kl);
  c = at(sp / 2, 0); P.scatola(c[0], c[1], t, W2, sp, H1 + 0.45, H2, kc);
  for (const f of [-0.5, 0.5]) { c = at(sp + 0.07, f * (W2 - 0.6)); P.scatola(c[0], c[1], t, 0.6, 0.16, H1 + 0.45, H2, kl); }
  c = at(sp / 2 + 0.1, 0); P.scatola(c[0], c[1], t, W2 + 0.4, sp + 0.2, H2, H2 + 0.35, kl);
  // timpano: cornice chiara e campo del colore della facciata
  const prisma = (w, h, off, d, z, k) => {
    const L = at(off, -w / 2), Rr = at(off, w / 2), T = at(off, 0), L2 = at(off - d, -w / 2), R2 = at(off - d, w / 2), T2 = at(off - d, 0);
    P.tri([L[0], L[1], z], [Rr[0], Rr[1], z], [T[0], T[1], z + h], k); P.tri([L2[0], L2[1], z], [R2[0], R2[1], z], [T2[0], T2[1], z + h], k);
    P.quad([L[0], L[1], z], [T[0], T[1], z + h], [T2[0], T2[1], z + h], [L2[0], L2[1], z], k);
    P.quad([Rr[0], Rr[1], z], [T[0], T[1], z + h], [T2[0], T2[1], z + h], [R2[0], R2[1], z], k);
  };
  prisma(W2 + 0.7, F.timpano + 0.25, sp + 0.25, sp + 0.25, H2 + 0.35, kl);
  prisma(W2 - 0.4, F.timpano - 0.35, sp + 0.27, 0.05, H2 + 0.5, kc);
  // volute: raccordi chiari fra l'ordine alto e la cornice dell'ordine basso
  if (F.volute) for (const sg of [-1, 1]) {
    const a = at(sp + 0.05, sg * W2 / 2), b = at(sp + 0.05, sg * (W2 / 2 + (W1 - W2) / 2 * 0.75)), a2 = at(0, sg * W2 / 2), b2 = at(0, sg * (W2 / 2 + (W1 - W2) / 2 * 0.75));
    const zt = H1 + 0.45 + F.altezza2 * 0.75, zb = H1 + 0.45;
    P.tri([a[0], a[1], zt], [a[0], a[1], zb], [b[0], b[1], zb], kl); P.tri([a2[0], a2[1], zt], [a2[0], a2[1], zb], [b2[0], b2[1], zb], kl);
    P.quad([a[0], a[1], zt], [b[0], b[1], zb], [b2[0], b2[1], zb], [a2[0], a2[1], zt], kl);
  }
  // portale, affresco, croce
  c = at(sp, 0);
  P.pannello(c[0], c[1], t, n, 0.24, 2.6, base, base + 4.6, kl);
  P.pannello(c[0], c[1], t, n, 0.26, 1.9, base, base + 4.0, C(F.portale));
  P.pannello(c[0], c[1], t, n, 0.24, 4.6, base + 5.0, H1 - 0.35, kl);
  P.pannello(c[0], c[1], t, n, 0.26, 4.2, base + 5.2, H1 - 0.55, C(F.affresco));
  if (F.croce) { const q = at(sp / 2, 0); croce(P, q[0], q[1], t, H2 + 0.35 + F.timpano + 0.25, 1.4, '#d9d6cf'); }
}
function torrioni(volumiExtra, e, v, info) {
  const K = v.torrioni, S = latoRett(info.r, K.lato), w = K.larghezza;
  for (const sg of [-1, 1]) {
    const along = sg * (S.len / 2 - w / 2), ox = S.m[0] + S.t[0] * along, oy = S.m[1] + S.t[1] * along;
    const P4 = [[-w / 2, K.sporgenza], [w / 2, K.sporgenza], [w / 2, K.sporgenza - w], [-w / 2, K.sporgenza - w]].map(([a, b]) => [ox + S.t[0] * a + S.n[0] * b, oy + S.t[1] * a + S.n[1] * b]);
    const { torrioni: _, portico: __, balcone: ___, fossato: ____, ...stile } = v;
    volumiExtra.push({ e: { anello: P4, buchi: [], base: e.base, h: e.h + K.alzata }, v: { ...stile, tetto: { ...v.tetto, forma: 'piramide', pendenza: 0.45 } } });
  }
}
function portico(P, e, v, info, ctx) {
  const K = v.portico, S = latoRett(info.r, K.lato), n = K.luci || 5, luce = Math.min(3.6, (S.len - 4) / n), w = luce * n, base = e.base;
  P.pannello(S.m[0], S.m[1], S.t, S.n, 0.03, w + 0.6, base, base + K.altezza + 0.3, C(K.pilastri));
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + luce * (i + 0.5), x = S.m[0] + S.t[0] * a, y = S.m[1] + S.t[1] * a, rr = luce * 0.36;
    P.pannello(x, y, S.t, S.n, 0.05, luce * 0.72, base, base + K.altezza - rr, C(K.colore));
    P.arco(x, y, S.t, S.n, 0.05, rr, base + K.altezza - rr, C(K.colore));
  }
  ctx.esclusioni.push({ m: S.m, t: S.t, n: S.n, w: w + 1, z1: base + K.altezza + 0.5 });
}
function balcone(P, e, v, info) {
  const K = v.balcone, S = latoRett(info.r, K.lato), z = e.base + K.z, k = C(K.colore);
  const c = [S.m[0] + S.n[0] * 0.6, S.m[1] + S.n[1] * 0.6];
  P.scatola(c[0], c[1], S.t, K.larghezza, 1.2, z - 0.3, z, k);
  const f = [S.m[0] + S.n[0] * 1.15, S.m[1] + S.n[1] * 1.15]; P.scatola(f[0], f[1], S.t, K.larghezza, 0.12, z, z + 0.95, k);
}
function fossato(P, e, v, info, terreno) {
  const K = v.fossato, S = latoRett(info.r, K.lato), k = C(K.colore), lun = S.len + 2 * K.oltre, N = Math.ceil(lun / 4);
  for (let i = 0; i < N; i++) {
    const a0 = -lun / 2 + lun * i / N, a1 = -lun / 2 + lun * (i + 1) / N;
    const Q = (a, d) => { const x = S.m[0] + S.t[0] * a + S.n[0] * d, y = S.m[1] + S.t[1] * a + S.n[1] * d; return [x, y, terreno.z(x, y) + 0.06]; };
    P.quad(Q(a0, K.distanza), Q(a1, K.distanza), Q(a1, K.distanza + K.larghezza), Q(a0, K.distanza + K.larghezza), k);
    // sponde in pietra
    for (const d of [K.distanza - 0.4, K.distanza + K.larghezza]) P.quad(Q(a0, d), Q(a1, d), Q(a1, d + 0.4), Q(a0, d + 0.4), C('#d8d0bf'));
  }
}
function ingresso(P, e, v, info, ctx, extraMesh) {
  const K = v.ingresso, S = latoRett(info.r, K.lato), base = e.base, k = C(K.colore), zt = base + K.altezza;
  const at = (along, off) => [S.m[0] + S.t[0] * along + S.n[0] * off, S.m[1] + S.t[1] * along + S.n[1] * off];
  for (const sg of [-1, 1]) { const c = at(sg * (K.larghezza / 2 - 0.35), K.profondita - 0.35); P.scatola(c[0], c[1], S.t, 0.6, 0.6, base - 0.2, zt, k); }
  let c = at(0, K.profondita / 2); P.scatola(c[0], c[1], S.t, K.larghezza, K.profondita, zt, zt + 0.35, k);
  // porta vetrata con cornice
  c = at(0, 0); P.pannello(c[0], c[1], S.t, S.n, 0.05, 3.4, base, base + 2.9, k); P.pannello(c[0], c[1], S.t, S.n, 0.07, 2.8, base, base + 2.6, C(K.porta));
  if (K.balcone) {
    const kr = C('#2b2b2d'); c = at(0, K.profondita - 0.05); P.scatola(c[0], c[1], S.t, K.larghezza, 0.06, zt + 0.35, zt + 1.35, kr);
    for (const sg of [-1, 1]) { const q = at(sg * (K.larghezza / 2 - 0.03), K.profondita / 2); P.scatola(q[0], q[1], S.n, K.profondita, 0.06, zt + 0.35, zt + 1.35, kr); }
  }
  if (K.bandiere) {
    const strisce = [['#1f8a43', '#f4f4f2', '#cf2b37'], ['#1c3f94', '#1c3f94', '#1c3f94']];
    strisce.forEach((cols, j) => {
      const sg = j ? 1 : -1, p0 = at(sg * 1.2, K.profondita - 0.1), z0 = zt + 1.0, p1 = at(sg * 1.5, K.profondita + 1.6), z1 = z0 + 2.2;
      P.scatola((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, S.n, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 0.05, (z0 + z1) / 2 - 0.03, (z0 + z1) / 2 + 0.03, C('#cfcfcf'));
      cols.forEach((cc, i) => { const a = at(sg * (1.5 + (i - 1) * 0.35), K.profondita + 1.6); P.pannello(a[0], a[1], S.t, S.n, 0, 0.35, z1 - 0.75, z1, C(cc)); });
    });
  }
  if (K.scritta && typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g = cv.getContext('2d'); g.fillStyle = '#5a4a3a'; g.fillRect(0, 0, 512, 96); g.fillStyle = '#f3ead8'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(K.scritta, 256, 52);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.56), new THREE.MeshLambertMaterial({ map: tx }));
    const p = at(0, 0.09); m.position.set(p[0], p[1], base + 3.25);
    m.lookAt(p[0] + S.n[0], p[1] + S.n[1], base + 3.25); m.up.set(0, 0, 1); m.lookAt(p[0] + S.n[0], p[1] + S.n[1], base + 3.25);
    extraMesh.push(m);
  }
  ctx.esclusioni.push({ m: S.m, t: S.t, n: S.n, w: K.larghezza + 0.5, z1: zt + 0.4 });
}
function fotovoltaico(P, e, v, info) {
  const K = v.fotovoltaico, r = info.r, R = e.anello, k = C(K.colore), kb = C('#9aa3ad');
  const d = K.lato ? DIR[K.lato] : null;
  const pr = d ? (x, y) => dot([x - r.c[0], y - r.c[1]], d) : (x, y) => dot([x - r.c[0], y - r.c[1]], r.u);
  let ext = 0; for (const p of R) ext = Math.max(ext, Math.abs(pr(p[0], p[1])));
  const ok = d ? (x, y) => pr(x, y) > ext * (1 - 2 * K.quota) : (x, y) => Math.abs(pr(x, y)) < ext * K.quota;
  const pw = 1.05, pl = 1.75, g = 0.15;
  for (let s = -r.L / 2 + 0.9; s + pl < r.L / 2 - 0.9; s += pl + g) for (let t = -r.W / 2 + 0.9; t + pw < r.W / 2 - 0.9; t += pw + g * 3) {
    const Q = [[s, t], [s + pl, t], [s + pl, t + pw], [s, t + pw]].map(([a, b]) => [r.c[0] + r.u[0] * a + r.v[0] * b, r.c[1] + r.u[1] * a + r.v[1] * b]);
    if (!Q.every(([x, y]) => pip(x, y, R) && distBordo(x, y, R) > 0.7 && ok(x, y))) continue;
    P.quad(...Q.map(([x, y]) => [x, y, info.fz(x, y) + 0.14]), k);
    P.quad(...Q.map(([x, y]) => [x, y, info.fz(x, y) + 0.12]), kb);
  }
}
function lucernari(P, e, v, info) {
  const K = v.lucernari, r = info.r, k = C(K.colore), n = K.strisce || 2;
  for (let i = 0; i < n; i++) {
    const t = -r.W / 2 + r.W * (i + 1) / (n + 1), c = [r.c[0] + r.v[0] * t, r.c[1] + r.v[1] * t];
    P.scatola(c[0], c[1], r.u, r.L - 5, 1.5, info.z0, info.z0 + 0.6, k);
  }
}

/** scritta su un pannello (texture da canvas): testo, colore, sfondo, larghezza (m), altezza (m), luci (bordo chiaro) */
export function cartello(testo, { colore = '#f3ead8', sfondo = '#5a4a3a', larghezza = 3, altezza = 0.56, font = 'bold 64px Georgia, serif', bordo = null, luce = 0 } = {}) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'), W = 1024, H = Math.max(64, Math.round(W * altezza / larghezza)); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = sfondo; g.fillRect(0, 0, W, H);
  if (bordo) { g.strokeStyle = bordo; g.lineWidth = H * 0.08; g.strokeRect(H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12); }
  g.fillStyle = colore; let px = Math.round(H * 0.62); g.font = font.replace(/\d+px/, px + 'px');
  while (g.measureText(testo).width > W * 0.92 && px > 8) { px -= 2; g.font = font.replace(/\d+px/, px + 'px'); }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(testo, W / 2, H * 0.54);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  // luce > 0: insegna retroilluminata (non risente del sole; oltre 1 brilla col bagliore della qualità Ultra)
  const mat = luce ? new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide, toneMapped: false, color: new THREE.Color(1, 1, 1).multiplyScalar(luce) })
    : new THREE.MeshLambertMaterial({ map: tx, side: THREE.DoubleSide });
  return new THREE.Mesh(new THREE.PlaneGeometry(larghezza, altezza), mat);
}
/** mette un oggetto (piano) davanti al lato S, rivolto verso fuori */
function sulLato(m, S, along, off, z) {
  const p = [S.m[0] + S.t[0] * along + S.n[0] * off, S.m[1] + S.t[1] * along + S.n[1] * off];
  m.position.set(p[0], p[1], z); m.up.set(0, 0, 1); m.lookAt(p[0] + S.n[0], p[1] + S.n[1], z);
  return m;
}
function insegna(e, v, info, extraMesh) {
  for (const K of [].concat(v.insegna)) {
    const S = latoRett(info.r, K.lato), w = K.larghezza || Math.min(S.len * 0.7, K.testo.length * 0.55);
    const m = cartello(K.testo, { colore: K.colore, sfondo: K.sfondo, larghezza: w, altezza: K.altezza || 0.7, font: K.font || 'bold 64px Georgia, serif', bordo: K.bordo, luce: K.luce });
    if (m) extraMesh.push(sulLato(m, S, K.spostamento || 0, 0.12 + (K.sporgenza || 0), e.base + K.z));
  }
}
function pensilina(P, e, v, info, ctx, extraMesh) {
  const K = v.pensilina, S = latoRett(info.r, K.lato), base = e.base, z = base + K.z;
  const at = (a, o) => [S.m[0] + S.t[0] * a + S.n[0] * o, S.m[1] + S.t[1] * a + S.n[1] * o];
  let c = at(0, K.profondita / 2); P.scatola(c[0], c[1], S.t, K.larghezza, K.profondita, z, z + 0.3, C(K.colore || '#3b3b3b'));
  c = at(0, 0); P.pannello(c[0], c[1], S.t, S.n, 0.05, K.larghezza * 0.55, base, base + 2.7, C(K.porte || '#2f3b45'));
  // locandine ai lati dell'ingresso (cornici chiare con manifesti colorati)
  const colori = ['#d24b3a', '#2f6db3', '#e8b63c', '#5c9a4a', '#8a4fa0', '#e07a2e'];
  const n = K.locandine || 0;
  for (let i = 0; i < n; i++) {
    const sg = i % 2 ? 1 : -1, k = Math.floor(i / 2), a = sg * (K.larghezza * 0.32 + 1.0 + k * 1.4), q = at(a, 0);
    P.pannello(q[0], q[1], S.t, S.n, 0.05, 1.1, base + 0.7, base + 2.4, C('#d9d2c2'));
    P.pannello(q[0], q[1], S.t, S.n, 0.07, 0.9, base + 0.85, base + 2.25, C(colori[i % colori.length]));
  }
  ctx.esclusioni.push({ m: S.m, t: S.t, n: S.n, w: K.larghezza + 2 * (1 + 1.4 * Math.ceil(n / 2)), z1: z + 0.5 });
}

// ------------------------------------------------------------------ 09-11: portici continui, botteghe, neon
const accesa = (col, k) => new THREE.Color(col).multiplyScalar(k);           // colore oltre 1: col bagliore (Ultra) brilla
function cen2(R) { let x = 0, y = 0; for (const p of R) { x += p[0]; y += p[1]; } return [x / R.length, y / R.length]; }
function distSegmenti(x, y, segs) {
  let m = Infinity;
  for (const { p, q } of segs) {
    const dx = q[0] - p[0], dy = q[1] - p[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / l2));
    m = Math.min(m, Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t));
  }
  return m;
}
/** finestre di un volume rifatte per un corpo che parte più in alto (stessa quota assoluta dei piani) */
function finestreDa(F, dz, hh) {
  if (!F) return undefined;
  const inter = F.interpiano || 3.2; let j = 0;
  while (j < (F.piani || 1) && (F.primo ?? 1) + j * inter < dz + 0.3) j++;
  if (j >= (F.piani || 1)) return undefined;
  let pr = (F.primo ?? 1) + j * inter - dz, alt = F.altezza || 1.5;
  if ((F.piani || 1) - j === 1 && pr + alt > hh - 0.3) {                      // corpo basso sopra il portico: la finestra ci deve stare
    pr = Math.max(0.3, hh - 0.3 - alt); alt = Math.min(alt, hh - 0.3 - pr);
    if (alt < 0.7) return undefined;
  }
  return { ...F, primo: pr, altezza: alt, piani: (F.piani || 1) - j };
}
/** arco (o spicchio d'ellisse) fra due pilastri: faccia esterna, interna e intradosso; c = centro all'imposta */
function arcata(P, c, t, n, rx, ry, zs, zTop, sp, k, seg = 8) {
  const E = (a) => [Math.cos(a) * rx, Math.sin(a) * ry];
  const B = (a) => { const [ex, ey] = E(a), c4 = Math.PI / 4; if (a <= c4 + 1e-6) return [rx, ry * Math.tan(a)]; if (a >= 3 * c4 - 1e-6) return [-rx, ry * Math.tan(Math.PI - a)]; return [rx / Math.tan(a), ry]; };
  const W = ([s, h], off) => [c[0] + t[0] * s + n[0] * off, c[1] + t[1] * s + n[1] * off, zs + h];
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * i / seg, a1 = Math.PI * (i + 1) / seg;
    for (const off of [0, -sp]) P.quad(W(E(a0), off), W(B(a0), off), W(B(a1), off), W(E(a1), off), k);
    P.quad(W(E(a0), 0), W(E(a1), 0), W(E(a1), -sp), W(E(a0), -sp), k);
  }
  if (zTop > zs + ry + 0.01) for (const off of [0, -sp]) P.quad(W([-rx, ry], off), W([rx, ry], off), [...W([rx, ry], off).slice(0, 2), zTop], [...W([-rx, ry], off).slice(0, 2), zTop], k);
}
/**
 * Portici continui (soffitti di portico DBT, circuito.landmark[].portici): al piano terra pilastri (o archi) sui lati
 * aperti e vetrine sul lato addossato al volume dietro; sopra, il corpo dei piani alti con le finestre del volume dietro.
 * Stile in modello.porticato (varianti per altezza DBT in modello.porticato_h): altezza (intradosso), passo, pilastro,
 * archi, pilastri, soffitto, pavimento, vetrine {colore, telaio, porta, passo}, gronda (m da terra; di base quella del
 * volume dietro), pensilina (solo una soletta sopra il portico), sopra {parete, finestre, tetto...}, insegne [...].
 */
function porticati(P, lm, M, vol, stili, ctx, terreno, extraMesh) {
  for (const pc of lm.portici || []) {
    const R = pc.anello, hk = pc.h.toFixed(2), S = { ...M.porticato, ...(M.porticato_h?.[hk] || {}) };
    for (const [d, dv] of Object.entries(DIR)) {                                // variante "4.20@ovest": il più a ovest fra i portici alti uguali
      const sp = M.porticato_h?.[`${hk}@${d}`]; if (!sp) continue;
      const top = lm.portici.filter((o) => o.h.toFixed(2) === hk).reduce((a, b) => (dot(cen2(b.anello), dv) > dot(cen2(a.anello), dv) ? b : a));
      if (top === pc) Object.assign(S, sp);
    }
    if (S.salta) continue;
    const orient = area(R) > 0 ? 1 : -1, lati = [], peso = new Map();
    for (let i = 0; i < R.length; i++) {
      const p = R[i], q = R[(i + 1) % R.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]); if (len < 0.05) { lati.push(null); continue; }
      const t = [(q[0] - p[0]) / len, (q[1] - p[1]) / len], n = [t[1] * orient, -t[0] * orient];
      let dietro = null;
      for (const f of [0.2, 0.5, 0.8]) { const x = p[0] + (q[0] - p[0]) * f + n[0] * 0.5, y = p[1] + (q[1] - p[1]) * f + n[1] * 0.5; dietro ||= vol.find((o) => pip(x, y, o.anello)); }
      const L = { i, p, q, len, t, n, m: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], dietro };
      lati.push(L); if (dietro) peso.set(dietro, (peso.get(dietro) || 0) + len);
    }
    const adj = [...peso.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null, sAdj = adj ? stili[vol.indexOf(adj)] || {} : {};
    const c = cen2(R), zb = adj ? adj.base : terreno.z(c[0], c[1]), zi = zb + (S.altezza ?? 3.0);
    const zt = S.pensilina ? zi + (S.spessore ?? 0.45) : S.gronda != null ? zb + S.gronda : adj ? adj.base + adj.h : zi + pc.h;
    const aperti = lati.filter((l) => l && !l.dietro), addossati = lati.filter((l) => l && l.dietro);
    // corpo sopra il portico (base all'intradosso: i muri scendono 0,6 m sotto e fanno da architrave)
    const pianoAdj = S.pensilina || (sAdj.tetto?.forma || 'piano') === 'piano';
    const Tadj = sAdj.tetto || {};
    const sopra = {
      parete: sAdj.parete || '#ddd3c4', cornice: S.pensilina ? undefined : sAdj.cornice,
      finestre: S.pensilina ? undefined : finestreDa(sAdj.finestre, zi - zb, zt - zi),
      tetto: pianoAdj ? { forma: 'piano', parapetto: S.pensilina ? 0.25 : (Tadj.parapetto || 0), colore: Tadj.colore || '#a7a196' }
        : { forma: 'portico', colore: Tadj.colore || '#a85d45', pendenza: Tadj.pendenza ?? 0.34, passo: 0.8 },
      ...(S.sopra || {}),
    };
    const k = sopra.tetto.pendenza ?? 0.34, piano = sopra.tetto.forma === 'piano';
    const fz = piano ? undefined : (x, y) => zt + k * Math.min(distSegmenti(x, y, aperti), 6);
    if (zt > zi + 0.05) volume(P, { anello: R, buchi: [], base: zi, h: zt - zi }, sopra, ctx, { fz, salta: (i) => !!lati[i]?.dietro });
    P.piano(R, zi - 0.005, C(S.soffitto || '#e6dfd2'));
    P.piano(R, zb + 0.04, C(S.pavimento || '#bdb6aa'));
    // pilastri e archi sui lati aperti
    const pw = S.pilastro || 0.45, kp = C(S.pilastri || '#ece6da'), passo = S.passo || 3.4, fatti = [];
    const zArch = zi - 0.6;
    for (const L of aperti) {
      if (L.len < 0.6) continue;
      const nb = Math.max(1, Math.round(L.len / passo)), pos = [];
      for (let j = 0; j <= nb; j++) pos.push(Math.min(L.len - pw / 2, Math.max(pw / 2, L.len * j / nb)));
      for (const s of pos) {
        const x = L.p[0] + L.t[0] * s - L.n[0] * pw / 2, y = L.p[1] + L.t[1] * s - L.n[1] * pw / 2;
        if (fatti.some((f) => Math.hypot(f[0] - x, f[1] - y) < 0.7)) continue;
        fatti.push([x, y]); P.scatola(x, y, L.t, pw, pw, zb - 0.2, zArch, kp);
      }
      if (S.archi) for (let j = 0; j < nb; j++) {
        const s0 = pos[j] + pw / 2, s1 = pos[j + 1] - pw / 2, rx = (s1 - s0) / 2; if (rx < 0.4) continue;
        const ry = Math.max(0.3, Math.min(rx, zArch - zb - (S.luce_libera ?? 1.9))), cc = [L.p[0] + L.t[0] * (s0 + rx), L.p[1] + L.t[1] * (s0 + rx)];
        arcata(P, cc, L.t, L.n, rx, ry, zArch - ry, zArch, pw, kp);
      }
    }
    // vetrine e porte sul lato addossato (rivolte verso il portico); niente finestre del volume dietro sotto il portico
    const V = S.vetrine || {}, kv = C(V.colore || '#33404a'), kt = C(V.telaio || '#4a4038'), kd = C(V.porta || '#2c2f33');
    for (const L of addossati) {
      ctx.esclusioni.push({ m: L.m, t: L.t, n: L.n, w: L.len + 0.4, z1: zi + 0.2 });
      if (L.len < 1.6) continue;
      const pv = V.passo || 3.2, nv = Math.max(1, Math.floor(L.len / pv)), s0 = (L.len - nv * pv) / 2, nn = [-L.n[0], -L.n[1]];
      for (let j = 0; j < nv; j++) {
        const s = s0 + pv * (j + 0.5), x = L.p[0] + L.t[0] * s, y = L.p[1] + L.t[1] * s, w = pv * 0.78, porta = j % 3 === 1;
        P.pannello(x, y, L.t, nn, 0.03, w + 0.16, zb, zi - 0.7, kt);
        P.pannello(x, y, L.t, nn, 0.05, porta ? 1.3 : w, porta ? zb + 0.02 : zb + 0.45, zi - 0.85, porta ? kd : kv);
      }
    }
    // insegne sull'architrave del lato aperto più lungo (pos 0..1 lungo il lato)
    const F = aperti.reduce((a, b) => (!a || b.len > a.len ? b : a), null);
    if (F) for (const I of S.insegne || []) {
      const m = cartello(I.testo, { colore: I.colore, sfondo: I.sfondo, larghezza: I.larghezza || 2.2, altezza: I.altezza || 0.46, font: I.font || 'bold 64px Arial, sans-serif', bordo: I.bordo, luce: I.luce });
      if (m) extraMesh.push(sulLato(m, { m: F.m, t: F.t, n: F.n }, ((I.pos ?? 0.5) - 0.5) * F.len, 0.04, zi - 0.3));
    }
  }
}
/** vetrine al piano terra su un lato: [{lato, spostamento, larghezza, n, z0, z1, colore, telaio, porta (indice)}] */
function vetrine(P, e, v, info, ctx) {
  for (const K of [].concat(v.vetrine)) {
    const S = latoRett(info.r, K.lato), n = K.n || 1, W = K.larghezza || Math.min(S.len - 1, 3 * n), w = W / n, base = e.base;
    const z0 = base + (K.z0 ?? 0.3), z1 = base + (K.z1 ?? 2.6), kv = C(K.colore || '#2f3a44'), kt = C(K.telaio || '#3a3a3a');
    for (let i = 0; i < n; i++) {
      const a = (K.spostamento || 0) - W / 2 + w * (i + 0.5), x = S.m[0] + S.t[0] * a, y = S.m[1] + S.t[1] * a, porta = i === K.porta;
      P.pannello(x, y, S.t, S.n, 0.04, w - 0.05, base, z1 + 0.12, kt);
      P.pannello(x, y, S.t, S.n, 0.06, porta ? Math.min(1.2, w - 0.3) : w - 0.3, porta ? base + 0.02 : z0, z1, porta ? C(K.porta_colore || '#262a2e') : kv);
    }
    ctx.esclusioni.push({ m: [S.m[0] + S.t[0] * (K.spostamento || 0), S.m[1] + S.t[1] * (K.spostamento || 0)], t: S.t, n: S.n, w: W + 0.6, z1: z1 + 0.3 });
  }
}
/** tende da sole a falda con mantovana, anche a strisce: [{lato, spostamento, larghezza, n, z, sporgenza, calo, colore, strisce}] */
function tende(P, e, v, info) {
  for (const K of [].concat(v.tende)) {
    const S = latoRett(info.r, K.lato), n = K.n || 1, W = K.larghezza || 3 * n, w = W / n - 0.15, zt = e.base + (K.z ?? 3.0);
    const sp = K.sporgenza ?? 1.4, zb = zt - (K.calo ?? 0.7), cols = [C(K.colore || '#7a2430'), C(K.strisce || K.colore || '#7a2430')];
    const at = (a, o, z) => [S.m[0] + S.t[0] * a + S.n[0] * o, S.m[1] + S.t[1] * a + S.n[1] * o, z];
    for (let i = 0; i < n; i++) {
      const a0 = (K.spostamento || 0) - W / 2 + (W / n) * i + 0.075, ns = Math.max(1, Math.round(w / 0.45));
      for (let j = 0; j < ns; j++) {
        const s0 = a0 + w * j / ns, s1 = a0 + w * (j + 1) / ns, k = cols[j % 2];
        P.quad(at(s0, 0.08, zt), at(s1, 0.08, zt), at(s1, sp, zb), at(s0, sp, zb), k);
        P.quad(at(s0, sp, zb), at(s1, sp, zb), at(s1, sp, zb - 0.25), at(s0, sp, zb - 0.25), k);     // mantovana
      }
      for (const s of [a0, a0 + w]) P.tri(at(s, 0.08, zt), at(s, sp, zb), at(s, 0.08, zb), cols[0]);
    }
  }
}
/** dehors: tavolini con ombrelloni quadrati davanti a un lato: {lato, distanza, n, passo, spostamento, ombrelloni, tavoli} */
function dehors(P, e, v, info, terreno) {
  const K = v.dehors, S = latoRett(info.r, K.lato), n = K.n || 3, passo = K.passo || 3, ko = C(K.ombrelloni || '#efe9dc'), kt = C(K.tavoli || '#d8d8d4'), kf = C('#5b5f63');
  for (let i = 0; i < n; i++) {
    const a = (K.spostamento || 0) + (i - (n - 1) / 2) * passo, x = S.m[0] + S.t[0] * a + S.n[0] * (K.distanza || 2.5), y = S.m[1] + S.t[1] * a + S.n[1] * (K.distanza || 2.5);
    const z = terreno ? terreno.z(x, y) : e.base, h = 2.3, l = (K.lato_ombrellone || 2.4) / 2;
    P.scatola(x, y, S.t, 0.06, 0.06, z, z + h + 0.25, kf);
    const A = [x, y, z + h + 0.35], B = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => [x + S.t[0] * u * l + S.n[0] * w * l, y + S.t[1] * u * l + S.n[1] * w * l, z + h]);
    for (let j = 0; j < 4; j++) P.tri(B[j], B[(j + 1) % 4], A, ko);
    P.scatola(x, y, S.t, 0.75, 0.75, z + 0.72, z + 0.76, kt); P.scatola(x, y, S.t, 0.08, 0.08, z, z + 0.72, kf);
    for (const sg of [-1, 1]) { const q = [x + S.t[0] * sg * 0.75, y + S.t[1] * sg * 0.75]; P.scatola(q[0], q[1], S.t, 0.42, 0.42, z, z + 0.45, kf); }
  }
}
/** pavimentazione (corte, piazzetta): {anelli: [[[x, y], ...]], colore} appoggiata al terreno */
function pavimento(P, v, terreno) {
  const K = v.pavimento, k = C(K.colore || '#c9c1b2');
  for (const R of K.anelli) {
    const g = suddividi(new THREE.ShapeGeometry(forma({ anello: R, buchi: [] }, 1e9)), 2.0), a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 9) P.tri(...[0, 3, 6].map((j) => [a[i + j], a[i + j + 1], terreno.z(a[i + j], a[i + j + 1]) + 0.08]), k);
  }
}
/** muro di cinta con pilastri e cancello: {tratti: [{da: [x,y], a: [x,y], cancello: bool}], h, colore, cancello, pilastri} */
function recinto(P, v, terreno) {
  const K = v.recinto, h = K.h || 1.5, km = C(K.colore || '#e8e1d3'), kc = C(K.cancello || '#2b2d2f'), kp = C(K.pilastri || K.colore || '#e8e1d3');
  for (const T of K.tratti) {
    const dx = T.a[0] - T.da[0], dy = T.a[1] - T.da[1], len = Math.hypot(dx, dy), t = [dx / len, dy / len], ns = Math.max(1, Math.ceil(len / 2.5));
    for (let j = 0; j < ns; j++) {
      const x = T.da[0] + dx * (j + 0.5) / ns, y = T.da[1] + dy * (j + 0.5) / ns, z = terreno.z(x, y);
      if (T.cancello) {                                                          // sbarre verticali
        const nb = Math.round(len / ns / 0.14);
        for (let b = 0; b < nb; b++) { const s = (b + 0.5) / nb - 0.5, q = [x + t[0] * s * len / ns, y + t[1] * s * len / ns]; P.scatola(q[0], q[1], t, 0.04, 0.04, z, z + h + 0.2, kc); }
        P.scatola(x, y, t, len / ns, 0.05, z + h + 0.1, z + h + 0.18, kc); P.scatola(x, y, t, len / ns, 0.05, z + 0.12, z + 0.2, kc);
      } else { P.scatola(x, y, t, len / ns + 0.02, 0.28, z - 0.3, z + h, km); P.scatola(x, y, t, len / ns + 0.04, 0.36, z + h, z + h + 0.08, kp); }
    }
    for (const q of [T.da, T.a]) { const z = terreno.z(q[0], q[1]); P.scatola(q[0], q[1], t, 0.5, 0.5, z - 0.3, z + h + 0.45, kp); }
  }
}
/** scritta al neon: testo luminoso su fondo trasparente (alone disegnato sulla texture) */
export function scrittaNeon(testo, { colore = '#b84dff', larghezza = 3, altezza = 0.8, font = 'italic bold 64px "Brush Script MT", "Segoe Script", cursive', intensita = 2.6 } = {}) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'), W = 1024, H = Math.max(64, Math.round(W * altezza / larghezza)); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); let px = Math.round(H * 0.7); g.font = font.replace(/\d+px/, px + 'px');
  while (g.measureText(testo).width > W * 0.86 && px > 8) { px -= 2; g.font = font.replace(/\d+px/, px + 'px'); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = colore; g.fillStyle = colore;
  for (const b of [H * 0.22, H * 0.12, H * 0.05]) { g.shadowBlur = b; g.fillText(testo, W / 2, H * 0.54); }
  g.shadowBlur = H * 0.02; g.fillStyle = new THREE.Color(colore).lerp(new THREE.Color('#ffffff'), 0.6).getStyle(); g.fillText(testo, W / 2, H * 0.54);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1).multiplyScalar(intensita) });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(larghezza, altezza), mat); m.renderOrder = 2;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tx, alphaTest: 0.6 });   // ombra solo dalle lettere
  return m;
}
/**
 * neon sui lati: [{tipo: 'scritta'|'cornice'|'fascia', lato, colore, intensita, ...}]
 * scritta: testo, z, larghezza, altezza, spostamento, font; cornice: spostamento, larghezza, z0, z1 (rettangolo di tubi
 * attorno a una vetrina); fascia: z, larghezza, spostamento (tubo orizzontale). Tubi in `luci` (materiale acceso).
 */
/**
 * 10-11: facciata vera della pianta verso una direzione. Il lato del rettangolo minimo (latoRett) sta sulla parete solo se
 * la pianta è quasi rettangolare; nel Vizietto (pianta a trapezio ruotata) il lato «est» del rettangolo cadeva 3-7 m fuori
 * dall'edificio, sopra via Redipuglia, e la fascia al neon ci correva sopra. Se il lato del rettangolo non sta sulla
 * pianta, si prende la catena di lati della pianta rivolti verso la direzione (entro 45°): S = il lato più lungo
 * (per scritte e cornici), tratti = tutti i lati della catena (per le fasce, che girano gli angoli).
 */
function facciataVera(R, r, nome) {
  const S = latoRett(r, nome), d = Array.isArray(nome) ? nome : DIR[nome] || DIR.est;
  const sulla = (a) => distBordo(S.m[0] + S.t[0] * a, S.m[1] + S.t[1] * a, R) < 0.5;
  if (sulla(0) && sulla(-S.len * 0.4) && sulla(S.len * 0.4)) return { ...S, tratti: null };
  const orient = area(R) > 0 ? 1 : -1, N = R.length, lati = [];
  for (let i = 0; i < N; i++) {
    const p = R[i], q = R[(i + 1) % N], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const t = len > 1e-6 ? [(q[0] - p[0]) / len, (q[1] - p[1]) / len] : [1, 0], n = [t[1] * orient, -t[0] * orient];
    lati.push({ p, q, t, n, len, ok: len > 0.05 && dot(n, d) > Math.SQRT1_2 });
  }
  // catene di lati consecutivi rivolti verso d; si tiene quella che "guarda" di più (lunghezza x coseno)
  let best = null;
  for (let i = 0; i < N; i++) {
    if (!lati[i].ok || lati[(i - 1 + N) % N].ok && lati.some((l) => !l.ok)) continue;    // parte da un inizio di catena
    const cat = []; for (let j = 0; j < N && lati[(i + j) % N].ok; j++) cat.push(lati[(i + j) % N]);
    const peso = cat.reduce((s, l) => s + l.len * dot(l.n, d), 0);
    if (!best || peso > best.peso) best = { cat, peso };
  }
  if (!best) return { ...S, tratti: null };
  const L = best.cat.reduce((a, b) => (b.len > a.len ? b : a));
  return { n: L.n, t: [-L.n[1], L.n[0]], m: [(L.p[0] + L.q[0]) / 2, (L.p[1] + L.q[1]) / 2], len: L.len, prof: S.prof, tratti: best.cat };
}

function neon(L, e, v, info, extraMesh) {
  for (const K of [].concat(v.neon)) {
    const S = facciataVera(e.anello, info.r, K.lato), col = K.colore || '#b84dff', kk = accesa(col, K.intensita || 2.6), off = 0.14 + (K.sporgenza || 0), base = e.base, sp = K.spostamento || 0;
    const at = (a, z) => [S.m[0] + S.t[0] * a + S.n[0] * off, S.m[1] + S.t[1] * a + S.n[1] * off, z];
    if (K.tipo === 'fascia' && S.tratti && !K.larghezza) {
      // fascia lungo tutta la facciata vera: un tubo per lato, raccordati agli angoli (0,2 m di margine alle estremità)
      const z = base + (K.z ?? 3.0), T = S.tratti, pts = [];
      const sp0 = (l, s) => [l.p[0] + l.t[0] * s + l.n[0] * off, l.p[1] + l.t[1] * s + l.n[1] * off];
      pts.push(sp0(T[0], Math.min(0.2, T[0].len / 2)));
      for (let j = 1; j < T.length; j++) {                                      // angolo: incontro delle due rette scostate
        const a = T[j - 1].n, b = T[j].n, k = 1 + dot(a, b), c = T[j].p;
        pts.push([c[0] + (a[0] + b[0]) / k * off, c[1] + (a[1] + b[1]) / k * off]);
      }
      const U = T[T.length - 1]; pts.push(sp0(U, U.len - Math.min(0.2, U.len / 2)));
      for (let j = 0; j < pts.length - 1; j++) L.tubo([...pts[j], z], [...pts[j + 1], z], K.spessore || 0.07, kk);
      continue;
    }
    if (K.tipo === 'scritta') {
      const m = scrittaNeon(K.testo, { colore: col, larghezza: K.larghezza || 3, altezza: K.altezza || 0.8, font: K.font, intensita: K.intensita || 2.6 });
      if (m) extraMesh.push(sulLato(m, S, sp, off + 0.03, base + K.z));
    } else if (K.tipo === 'cornice') {
      const w = (K.larghezza || 2) / 2, z0 = base + (K.z0 ?? 0.3), z1 = base + (K.z1 ?? 2.6), s = K.spessore || 0.07;
      const A = at(sp - w, z0), B = at(sp + w, z0), D = at(sp + w, z1), E = at(sp - w, z1);
      L.tubo(A, B, s, kk); L.tubo(B, D, s, kk); L.tubo(D, E, s, kk); L.tubo(E, A, s, kk);
    } else {
      const w = (K.larghezza || S.len - 0.4) / 2, z = base + (K.z ?? 3.0);
      L.tubo(at(sp - w, z), at(sp + w, z), K.spessore || 0.07, kk);
    }
  }
}

// ------------------------------------------------------------------ insieme
/** gruppo con i landmark descritti; ids = landmark modellati (da togliere dagli edifici generici) */
export function landmarkDettagliati(circuito, contesto, terreno) {
  const g = new THREE.Group(); g.name = 'landmark';
  const ids = new Set(), extraMesh = [];
  for (const lm of circuito.landmark || []) {
    const M = lm.modello; if (!M?.volumi) continue;
    const vol = contesto.edifici.filter((e) => e.landmark === lm.id);
    if (!vol.length) continue;
    ids.add(lm.id);
    const P = new Pezzi();
    const ctx = {
      esclusioni: [],
      // un punto (fuori parete) sta dentro un altro volume dello stesso landmark più alto di z?
      coperto: (x, y, z, self) => vol.some((o) => o !== self && o.base + o.h > z + 0.5 && pip(x, y, o.anello)),
      escluso: (x, y, za) => ctx.esclusioni.some((q) => { const d = [x - q.m[0], y - q.m[1]]; return Math.abs(dot(d, q.n)) < 0.6 && Math.abs(dot(d, q.t)) < q.w / 2 && za < q.z1; }),
    };
    const stili = vol.map((e) => {
      const k = e.h.toFixed(2); let v = M.volumi[k] || M.volumi['*']; if (!v) return null;
      if (M.volumi['*principale'] && e === vol.reduce((a, b) => (Math.abs(area(b.anello)) > Math.abs(area(a.anello)) ? b : a))) v = { ...v, ...M.volumi['*principale'] };
      // varianti per il volume più a est/ovest/nord/sud fra quelli con la stessa altezza ("11.62@est")
      for (const [d, dv] of Object.entries(DIR)) {
        const sp = M.volumi[`${k}@${d}`]; if (!sp) continue;
        const pari = vol.filter((o) => o.h.toFixed(2) === k), cen = (o) => { let x = 0, y = 0; for (const p of o.anello) { x += p[0]; y += p[1]; } return [x / o.anello.length, y / o.anello.length]; };
        const top = pari.reduce((a, b) => (dot(cen(b), dv) > dot(cen(a), dv) ? b : a));
        if (top === e) v = { ...v, ...sp };
      }
      return v;
    });
    const extra = [], luci = new Pezzi();
    // prima gli ingombri (portici, ingressi, vetrine) che tolgono le finestre, poi i volumi
    const info = vol.map((e, i) => (stili[i] ? { r: rettangolo(e.anello) } : null));
    if (M.porticato) porticati(P, lm, M, vol, stili, ctx, terreno, extraMesh);
    vol.forEach((e, i) => {
      const v = stili[i]; if (v?.portico) portico(P, e, v, info[i], ctx); if (v?.ingresso) ingresso(P, e, v, info[i], ctx, extraMesh); if (v?.pensilina) pensilina(P, e, v, info[i], ctx, extraMesh);
      if (v?.vetrine) vetrine(P, e, v, info[i], ctx);
    });
    vol.forEach((e, i) => {
      const v = stili[i];
      if (!v) { volume(P, e, { parete: '#ddd3c4', tetto: { forma: 'piano', colore: '#a7735e' } }, ctx); return; }
      if (v.campanile) { campanile(P, e, v, ctx); return; }
      const inf = volume(P, e, v, ctx, { r: info[i].r });
      if (v.facciata) facciata(P, e, v, inf);
      if (v.torrioni) torrioni(extra, e, v, inf);
      if (v.balcone) balcone(P, e, v, inf);
      if (v.fossato) fossato(P, e, v, inf, terreno);
      if (v.fotovoltaico) fotovoltaico(P, e, v, inf);
      if (v.lucernari) lucernari(P, e, v, inf);
      if (v.insegna) insegna(e, v, inf, extraMesh);
      if (v.tende) tende(P, e, v, inf);
      if (v.dehors) dehors(P, e, v, inf, terreno);
      if (v.neon) neon(luci, e, v, inf, extraMesh);
    });
    for (const { e, v } of extra) volume(P, e, v, { ...ctx, coperto: () => false });
    if (M.recinto && terreno) recinto(P, M, terreno);
    if (M.pavimento && terreno) pavimento(P, M, terreno);
    const m = new THREE.Mesh(P.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    m.name = 'landmark-' + lm.id;
    const livello = lm.etichetta === false || M.etichetta === false ? 'Edificio (dettagliato)' : 'Landmark';    // 09-11: fuori da etichette ed elenchi
    m.userData.pick = () => ({ livello, elemento: lm.nome, fonte: M.fonte });
    g.add(m);
    if (luci.p.length) {                                                       // neon: colori oltre 1, senza luci né tone mapping
      const ml = new THREE.Mesh(luci.geometria(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
      ml.name = 'neon-' + lm.id; ml.castShadow = false; ml.userData.pick = () => ({ livello, elemento: lm.nome + ' · neon' }); g.add(ml);
    }
  }
  for (const m of extraMesh) { m.userData.pick ||= () => ({ livello: 'Landmark', elemento: 'scritta' }); g.add(m); }
  return { gruppo: g, ids };
}
export { rettangolo, latoRett, Pezzi, volume, area, pip, distBordo, DIR };   // usati da citta.js e dai test
