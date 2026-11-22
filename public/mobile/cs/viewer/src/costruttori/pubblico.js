// Pubblico (rev. 13): zone per il pubblico parametriche, di due forme, più la fan zone.
// - prato: poligono (anello) con densità in persone/m², fondo (prato o piazzale) e recinto (muretto bianco, transenna
//   o niente) alto h_recinto. Persone = area × densità.
// - gradinata: linea del fronte (verso la pista, anche curva) estrusa all'indietro di `profondita` dal lato `verso`
//   (+1 a sinistra del fronte, -1 a destra). Gradoni con pedata e alzata = pedata · tan(inclinazione), il primo a
//   `rialzo` da terra, fino ad `altezza`; se la profondità avanza, in cima resta una passerella. Posti = per ogni
//   gradone, lunghezza della fila × densità (posti al metro).
// Gli elementi arrivano da versione.livelli.pubblico: `tribune` e `aree` (ipotesi di Circuit Studio, rev. 8, convertite
// qui), `elementi` (disegnati nell'editor) e `tolti` (centri delle zone d'ipotesi tolte o sostituite nell'editor).
// Stesse funzioni per il visualizzatore, la guida e l'anteprima dell'editor: i numeri sono gli stessi ovunque.
import * as THREE from 'three';
import { Pezzi, rettangolo, pip, area } from './landmark.js';
import { superficie } from './superfici.js';

export const DEFAULT = {
  prato: { densita: 1.0, fondo: 'prato', recinto: 'muretto', h_recinto: 0.9 },
  gradinata: { profondita: 8, altezza: 4.5, inclinazione: 28, pedata: 0.8, densita: 2, rialzo: 1.0, verso: 1 },
};
// limiti e passi per l'editor: [min, max, passo, unità, nome]
export const PARAMETRI = {
  prato: { densita: [0.1, 4, 0.1, 'persone/m²', 'Densità'], h_recinto: [0.4, 2.5, 0.1, 'm', 'Altezza recinto'] },
  gradinata: {
    profondita: [1, 60, 0.5, 'm', 'Profondità'], altezza: [0.5, 30, 0.1, 'm', 'Altezza massima'], inclinazione: [5, 40, 1, '°', 'Inclinazione'],
    densita: [0.5, 3, 0.1, 'posti/m', 'Densità'], pedata: [0.6, 1.5, 0.05, 'm', 'Pedata (profondità gradone)'], rialzo: [0, 3, 0.1, 'm', 'Primo gradone da terra'],
  },
};
const C = (h) => new THREE.Color(h);
const SEDILI = ['#2f66c8', '#d22a1e', '#f2c200', '#1f8a5b', '#eeeeea', '#ff6a13'];
const MAGLIE = ['#d22a1e', '#2f66c8', '#f2c200', '#ffffff', '#1f1f1f', '#1f8a5b', '#ff6a13', '#8a4fa0', '#46b4e6', '#c9c1b0'];
const FONDI = { prato: '#6fae4f', piazzale: '#8b8f94' };

const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const generatore = (seme) => { let a = seme || 12345; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };
const lung = (P) => { let l = 0; for (let i = 0; i + 1 < P.length; i++) l += Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); return l; };
export const centro = (P) => { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / P.length, y / P.length]; };

// ------------------------------------------------------------------ elementi del livello
/** le zone d'ipotesi (rev. 8) nel formato nuovo; id = 'ip-' + centro arrotondato (stabile fra le ricostruzioni) */
export function elementiIpotesi(livello) {
  const out = [];
  for (const T of livello?.tribune || []) {
    const F = T.fronte, B = T.dietro, n = Math.min(F.length, B.length); if (n < 2) continue;
    const dx = F[1][0] - F[0][0], dy = F[1][1] - F[0][1], bx = B[0][0] - F[0][0], by = B[0][1] - F[0][1];
    const c = centro(F.concat(B));
    out.push({ id: `ip-${Math.round(c[0])}_${Math.round(c[1])}`, forma: 'gradinata', ipotesi: true, punti: F.slice(0, n),
      profondita: T.profondita, altezza: +(0.9 + (T.file - 1) * 0.42).toFixed(2), inclinazione: 26.3, pedata: 0.85, rialzo: 0.9, densita: 2,
      verso: dx * by - dy * bx > 0 ? 1 : -1, vicino_a: T.vicino_a });
  }
  for (const A of livello?.aree || []) {
    const c = centro(A.anello);
    out.push({ id: `ip-${Math.round(c[0])}_${Math.round(c[1])}`, forma: 'prato', ipotesi: true, punti: A.anello, buchi: A.buchi || [],
      densita: 1.2, fondo: A.tipo === 'prato' ? 'prato' : 'piazzale', recinto: 'muretto', h_recinto: 1.1 });
  }
  return out;
}
/** tutte le zone del livello: ipotesi non tolte + quelle dell'editor */
export function elementiPubblico(livello) {
  const tolti = livello?.tolti || [];
  const via = (e) => { const c = centro(e.punti); return tolti.some((t) => Math.hypot(t[0] - c[0], t[1] - c[1]) < 4); };
  return elementiIpotesi(livello).filter((e) => !via(e)).concat(livello?.elementi || []);
}

// ------------------------------------------------------------------ calcoli
function offsetVettori(F, verso) {
  const seg = [];
  for (let i = 0; i + 1 < F.length; i++) { const dx = F[i + 1][0] - F[i][0], dy = F[i + 1][1] - F[i][1], l = Math.hypot(dx, dy) || 1; seg.push([-dy / l * verso, dx / l * verso]); }
  return F.map((_, i) => {
    const a = seg[Math.max(0, i - 1)], b = seg[Math.min(seg.length - 1, i)];
    let x = a[0] + b[0], y = a[1] + b[1]; const l = Math.hypot(x, y) || 1; x /= l; y /= l;
    const k = 1 / Math.max(0.4, x * a[0] + y * a[1]);                   // spigolo vivo (miter), limitato
    return [x * k, y * k];
  });
}
const linea = (F, O, t) => F.map((p, i) => [p[0] + O[i][0] * t, p[1] + O[i][1] * t]);

/** geometria logica della gradinata: file, alzata, posti per fila */
export function gradinata(el) {
  const g = { ...DEFAULT.gradinata, ...el }, F = el.punti;
  if (!F || F.length < 2) return null;
  const O = offsetVettori(F, g.verso >= 0 ? 1 : -1);
  const alzata = g.pedata * Math.tan(g.inclinazione * Math.PI / 180);
  const nP = Math.max(1, Math.floor(g.profondita / g.pedata + 1e-6));
  const nH = Math.max(1, Math.floor(Math.max(0, g.altezza - g.rialzo) / alzata + 1e-6) + 1);
  const N = Math.min(nP, nH), righe = [];
  for (let r = 0; r < N; r++) {
    const t0 = r * g.pedata, t1 = r === N - 1 ? Math.max(g.profondita, t0 + g.pedata) : t0 + g.pedata;
    const fila = linea(F, O, t0 + 0.45 * g.pedata), L = lung(fila);
    righe.push({ t0, t1, z: g.rialzo + r * alzata, fila, L, posti: Math.floor(L * g.densita + 1e-6) });
  }
  return { g, F, O, alzata, N, righe, posti: righe.reduce((a, r) => a + r.posti, 0), hTop: g.rialzo + (N - 1) * alzata,
    lunghezza: lung(F), passerella: Math.max(0, g.profondita - N * g.pedata), limitata: nH < nP ? 'altezza' : 'profondita' };
}
export function areaPrato(el) {
  let a = Math.abs(area(el.punti));
  for (const h of el.buchi || []) a -= Math.abs(area(h));
  return Math.max(0, a);
}
/** persone ospitate (posti a sedere per le gradinate, in piedi per i prati) */
export function capienza(el) {
  if (!el?.punti) return 0;
  if (el.forma === 'gradinata') return gradinata(el)?.posti || 0;
  if (el.punti.length < 3) return 0;
  return Math.floor(areaPrato(el) * (el.densita ?? DEFAULT.prato.densita) + 1e-6);
}
/** base della gradinata (fronte + retro) come anello, per i controlli */
export function baseGradinata(el) {
  const G = gradinata(el); if (!G) return null;
  return G.F.concat(linea(G.F, G.O, G.g.profondita).reverse());
}

// ------------------------------------------------------------------ geometria
let _mat = null;
const materiali = () => (_mat ||= {
  pezzi: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }),
  persone: animaPersone(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })),
});

// rev. 15 (Gabriele 11-11): tifo come in Cubo Corse. Le persone saltano e alzano le braccia quando l'auto del giocatore
// passa vicino (entro ~90 m) e tutte insieme quando uCheer sale (ultimo giro, arrivo). Tutto nello shader: niente costo
// in JavaScript. Chi usa il pubblico aggiorna TIFO (la guida a ogni fotogramma); nel visualizzatore uTime resta 0 e le
// persone stanno ferme. Coordinate dei dati (z in alto): uPlayer = posizione del giocatore nel sistema del pacchetto.
export const TIFO = { uTime: { value: 0 }, uPlayer: { value: new THREE.Vector3(1e7, 1e7, 0) }, uCheer: { value: 0 } };
function animaPersone(mat) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, TIFO);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float braccio; uniform float uTime; uniform vec3 uPlayer; uniform float uCheer;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = fract(sin(dot(ip.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float ex = clamp(1.0 - (distance(ip.xy, uPlayer.xy) - 15.0) / 75.0, 0.0, 1.0);
          float e = max(ex, uCheer * (0.55 + 0.45 * ph));
          float hop = max(0.0, sin(uTime * (8.0 + ph * 3.0) + ph * 6.2831));
          transformed.z += e * hop * 0.28 + sin(uTime * 1.2 + ph * 6.2831) * 0.012 * step(0.001, uTime);
          transformed.z += braccio * (e * 0.55 + e * 0.06 * sin(uTime * 14.0 + ph * 30.0));
        #endif`);
  };
  return mat;
}
let _persona = null;
function personaGeo() {
  if (_persona) return _persona;
  const parti = [];
  const corpo = new THREE.BoxGeometry(0.42, 0.28, 0.75).toNonIndexed(); corpo.translate(0, 0, 0.85);
  const gambe = new THREE.BoxGeometry(0.34, 0.24, 0.5).toNonIndexed(); gambe.translate(0, 0, 0.25);
  const testa = new THREE.BoxGeometry(0.22, 0.22, 0.24).toNonIndexed(); testa.translate(0, 0, 1.38);
  const colora = (g, k) => { const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  // rev. 15: braccia lungo i fianchi (colore della maglia); col tifo salgono sopra la testa (attributo braccio = 1)
  const bsx = new THREE.BoxGeometry(0.1, 0.12, 0.55).toNonIndexed(); bsx.translate(-0.27, 0, 0.9);
  const bdx = new THREE.BoxGeometry(0.1, 0.12, 0.55).toNonIndexed(); bdx.translate(0.27, 0, 0.9);
  parti.push(colora(corpo, C('#ffffff')), colora(gambe, C('#3b4252')), colora(testa, C('#e2b896')), colora(bsx, C('#ffffff')), colora(bdx, C('#ffffff')));
  // niente facce di sotto (non si vedono mai): 50 triangoli invece di 60
  for (let k = 0; k < parti.length; k++) {
    const g = parti[k], P = g.attributes.position, C = g.attributes.color, tieni = [];
    for (let t = 0; t < P.count; t += 3) { const za = P.getZ(t), zb = P.getZ(t + 1), zc = P.getZ(t + 2); if (!(za === zb && zb === zc && za <= Math.min(...Array.from({ length: P.count }, (_, i) => P.getZ(i))) + 1e-6)) tieni.push(t); }
    const q = new THREE.BufferGeometry(), pp = new Float32Array(tieni.length * 9), cc = new Float32Array(tieni.length * 9);
    tieni.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) { pp[i * 9 + v * 3 + a] = P.array[(t + v) * 3 + a]; cc[i * 9 + v * 3 + a] = C.array[(t + v) * 3 + a]; } });
    q.setAttribute('position', new THREE.BufferAttribute(pp, 3)); q.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parti[k] = q;
  }
  let n = 0; for (const g of parti) n += g.attributes.position.count;
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3), br = new Float32Array(n); let o = 0;
  parti.forEach((g, k) => { p.set(g.attributes.position.array, o * 3); c.set(g.attributes.color.array, o * 3); if (k >= 3) br.fill(1, o, o + g.attributes.position.count); o += g.attributes.position.count; });
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(p, 3)); r.setAttribute('color', new THREE.BufferAttribute(c, 3)); r.setAttribute('braccio', new THREE.BufferAttribute(br, 1)); r.computeVertexNormals();
  return (_persona = r);
}
/** rev. 15 ter: con `blocco` (metri, la guida) le persone si dividono in un InstancedMesh per riquadro, dentro un gruppo:
 *  la guida accende solo i riquadri vicini alla camera. Senza, un InstancedMesh solo (visualizzatore, editor). */
let _lontana = null;
/** persona da lontano (oltre ~90 m): busto con le gambe in una scatola sola e la testa, senza facce di sotto (20 triangoli) */
function personaLontanaGeo() {
  if (_lontana) return _lontana;
  const parti = [[0.42, 0.28, 1.22, 0.61, '#ffffff'], [0.22, 0.22, 0.24, 1.36, '#e2b896']], pos = [], col = [];
  for (const [w, d, h, z, k] of parti) {
    const b = new THREE.BoxGeometry(w, d, h).toNonIndexed(); b.translate(0, 0, z); const P = b.attributes.position, c = C(k);
    for (let t = 0; t < P.count; t += 3) {
      if (P.getZ(t) === P.getZ(t + 1) && P.getZ(t + 1) === P.getZ(t + 2) && P.getZ(t) < z - h / 2 + 1e-6) continue;   // faccia di sotto
      for (let v = 0; v < 3; v++) { pos.push(P.getX(t + v), P.getY(t + v), P.getZ(t + v)); col.push(c.r, c.g, c.b); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('braccio', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3), 1)); g.computeVertexNormals();
  return (_lontana = g);
}
function istanzePersone(persone, rnd, nome, blocco = 0) {
  if (blocco > 0) {
    const celle = new Map();
    for (const p of persone) { const k = `${Math.floor(p[0] / blocco)},${Math.floor(p[1] / blocco)}`; let c = celle.get(k); if (!c) celle.set(k, (c = [])); c.push(p); }
    const g = new THREE.Group(); g.name = nome;
    for (const c0 of celle.values()) {
      // rev. 17: le persone «dietro» (p[4], prati oltre i primi 4 m) solo con la geometria semplice
      const dietro = c0.filter((p) => p[4]), c = c0.filter((p) => !p[4]);
      if (dietro.length) {
        const sem = new THREE.InstancedMesh(personaLontanaGeo(), materiali().persone, dietro.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), asse = new THREE.Vector3(0, 0, 1), col = new THREE.Color();
        dietro.forEach(([x, y, z, a], k) => { q.setFromAxisAngle(asse, a - Math.PI / 2); sc.setScalar(0.9 + rnd() * 0.2); sem.setMatrixAt(k, M.compose(pos.set(x, y, z), q, sc)); sem.setColorAt(k, col.set(MAGLIE[Math.floor(rnd() * MAGLIE.length)])); });
        sem.name = nome; sem.computeBoundingSphere(); sem.boundingSphere.radius += 1.2; sem.castShadow = false; sem.userData.semplice = true;
        g.add(sem);
      }
      if (!c.length) continue;
      // ogni riquadro ha anche la versione da lontano (busto e testa): stesse istanze, la guida sceglie quale accendere
      const im = istanzePersone(c, rnd, nome), lim = new THREE.InstancedMesh(personaLontanaGeo(), materiali().persone, c.length);
      lim.instanceMatrix = im.instanceMatrix; lim.instanceColor = im.instanceColor; lim.boundingSphere = im.boundingSphere.clone();
      lim.name = nome; lim.castShadow = false; lim.visible = false; im.userData.lontano = lim; lim.userData.lontana = true;
      g.add(im, lim);
    }
    return g;
  }
  const im = new THREE.InstancedMesh(personaGeo(), materiali().persone, persone.length);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), asse = new THREE.Vector3(0, 0, 1), col = new THREE.Color();
  persone.forEach(([x, y, z, a], k) => {
    q.setFromAxisAngle(asse, a - Math.PI / 2); sc.setScalar(0.9 + rnd() * 0.2);
    im.setMatrixAt(k, M.compose(pos.set(x, y, z), q, sc));
    im.setColorAt(k, col.set(MAGLIE[Math.floor(rnd() * MAGLIE.length)]));
  });
  im.name = nome; im.computeBoundingSphere(); im.boundingSphere.radius += 1.2; im.castShadow = true;   // + salti e braccia (nello shader)
  return im;
}

function pezziGradinata(el, terreno, P, nVis, rnd) {
  const G = gradinata(el); if (!G) return [];
  const { g, F, O, righe, alzata } = G;
  const retro = linea(F, O, g.profondita);
  const z0 = Math.min(...F.concat(retro).map((p) => terreno.z(p[0], p[1]))) + 0.03;
  const kS = C(SEDILI[hash(el.id) % SEDILI.length]), kS2 = kS.clone().multiplyScalar(0.82), kR = C('#9ea4aa'), kT = C('#c7ccd0'), kM = C('#b5bbc1');
  const n = F.length;
  righe.forEach((R, r) => {
    const A = linea(F, O, R.t0), B = linea(F, O, R.t1), z = z0 + R.z, zp = r ? z - alzata : z0;
    for (let i = 0; i + 1 < n; i++) {
      P.quad([A[i][0], A[i][1], zp], [A[i + 1][0], A[i + 1][1], zp], [A[i + 1][0], A[i + 1][1], z], [A[i][0], A[i][1], z], kR);          // alzata
      P.quad([A[i][0], A[i][1], z], [A[i + 1][0], A[i + 1][1], z], [B[i + 1][0], B[i + 1][1], z], [B[i][0], B[i][1], z], r % 2 ? kS : kS2);   // gradone
    }
  });
  // retro: parete fino alla cima, poi parapetto (telo colorato) di 1,1 m; fianchi a gradini
  const zt = z0 + G.hTop;
  for (let i = 0; i + 1 < n; i++) {
    const a = retro[i], b = retro[i + 1];
    P.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], zt], [a[0], a[1], zt], kT);
    P.quad([a[0], a[1], zt], [b[0], b[1], zt], [b[0], b[1], zt + 1.1], [a[0], a[1], zt + 1.1], kS);
  }
  for (const i of [0, n - 1]) {
    const prof = [new THREE.Vector2(0, 0)];
    righe.forEach((R) => { prof.push(new THREE.Vector2(R.t0, R.z)); prof.push(new THREE.Vector2(R.t1, R.z)); });
    prof.push(new THREE.Vector2(g.profondita, 0));
    const tri = THREE.ShapeUtils.triangulateShape(prof, []), p0 = F[i], o = O[i];
    const v = (q) => [p0[0] + o[0] * q.x, p0[1] + o[1] * q.x, z0 + q.y];
    for (const [a, b, c] of tri) P.tri(v(prof[a]), v(prof[b]), v(prof[c]), kM);
    // parapetto del fianco sulla cima
    const t = righe.at(-1);
    P.quad([p0[0] + o[0] * t.t0, p0[1] + o[1] * t.t0, zt], [p0[0] + o[0] * g.profondita, p0[1] + o[1] * g.profondita, zt],
      [p0[0] + o[0] * g.profondita, p0[1] + o[1] * g.profondita, zt + 1.1], [p0[0] + o[0] * t.t0, p0[1] + o[1] * t.t0, zt + 1.1], kT);
  }
  // persone: una per posto lungo le file, ne mostro nVis distribuite in modo uniforme
  // rev. 15 bis: posti occupati scelti a caso (frazione nVis/posti), come una tribuna piena in parte; prima erano a passo
  // fisso e con poche persone sembravano file rade e distanziate
  const persone = [], tot = G.posti, f = Math.min(1, nVis / Math.max(1, tot));
  for (const R of righe) {
    const L = R.L, z = z0 + R.z;
    for (let j = 0; j < R.posti; j++) {
      if (f < 1 && rnd() >= f) continue;
      const d = (j + 0.5) / R.posti * L; let acc = 0;
      for (let i = 0; i + 1 < R.fila.length; i++) {
        const a = R.fila[i], b = R.fila[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + l >= d || i + 2 === R.fila.length) {
          const u = l ? Math.min(1, (d - acc) / l) : 0, o = O[i];
          persone.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, z, Math.atan2(-o[1], -o[0]) + (rnd() - 0.5) * 0.3]); break;
        }
        acc += l;
      }
    }
  }
  return persone;
}

function pezziPrato(el, terreno, P, nVis, rnd, asse = null) {
  const R = el.punti, g = { ...DEFAULT.prato, ...el };
  if (g.recinto !== 'nessuno') {
    const h = g.h_recinto, muro = C('#ecebe6'), ferro = C('#c3c8cd');
    for (let i = 0; i < R.length; i++) {
      const p = R[i], q = R[(i + 1) % R.length], zp = terreno.z(p[0], p[1]), zq = terreno.z(q[0], q[1]);
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); if (l < 0.05) continue;
      if (g.recinto === 'muretto') {                                    // muretto bianco da 20 cm (come nei parchi)
        const nx = -dy / l * 0.1, ny = dx / l * 0.1;
        for (const s of [1, -1]) P.quad([p[0] + nx * s, p[1] + ny * s, zp], [q[0] + nx * s, q[1] + ny * s, zq], [q[0] + nx * s, q[1] + ny * s, zq + h], [p[0] + nx * s, p[1] + ny * s, zp + h], muro);
        P.quad([p[0] + nx, p[1] + ny, zp + h], [q[0] + nx, q[1] + ny, zq + h], [q[0] - nx, q[1] - ny, zq + h], [p[0] - nx, p[1] - ny, zp + h], muro);
      } else {                                                          // transenna da concerto: due correnti e i montanti
        for (const t of [0.25, h]) P.tubo([p[0], p[1], zp + t], [q[0], q[1], zq + t], 0.045, ferro);
        for (let s = 0; s < l; s += 2.2) { const u = s / l, x = p[0] + dx * u, y = p[1] + dy * u, z = zp + (zq - zp) * u; P.tubo([x, y, z], [x, y, z + h], 0.04, ferro); }
      }
    }
  }
  const r = rettangolo(R), persone = [], nP = Math.min(nVis, capienza(el));
  for (let k = 0, prove = 0; k < nP && prove < nP * 6 + 50; prove++) {
    const s = (rnd() - 0.5) * r.L, t = (rnd() - 0.5) * r.W, x = r.c[0] + r.u[0] * s + r.v[0] * t, y = r.c[1] + r.u[1] * s + r.v[1] * t;
    if (!pip(x, y, R) || (el.buchi || []).some((h) => pip(x, y, h))) continue;
    persone.push([x, y, terreno.z(x, y) + 0.06, rnd() * 6.28]); k++;
  }
  // rev. 17 (Gabriele): con l'asse (la guida) solo le persone nei primi 4 m dal bordo della zona verso la pista restano
  // complete; le altre (p[4] = true) usano sempre la versione semplice, anche da vicino
  if (asse?.length && persone.length) {
    const c = centro(R); let best = null, bd = Infinity;
    for (let i = 0; i < asse.length; i += 2) { const d = Math.hypot(asse[i][0] - c[0], asse[i][1] - c[1]); if (d < bd) { bd = d; best = asse[i]; } }
    const n = [best[0] - c[0], best[1] - c[1]], l = Math.hypot(n[0], n[1]) || 1; n[0] /= l; n[1] /= l;     // verso la pista
    const fmax = Math.max(...R.map((q) => q[0] * n[0] + q[1] * n[1]));
    for (const p of persone) p[4] = fmax - (p[0] * n[0] + p[1] * n[1]) > 4;
  }
  return persone;
}

/** una zona come gruppo a sé (userData.spalto = id): così l'editor la ricostruisce o la nasconde da sola */
export function elementoPubblico(el, terreno, { fattore = 1, blocco = 0, asse = null } = {}) {
  const g = new THREE.Group(); g.name = 'spalto'; g.userData.spalto = el.id; g.userData.el = el;
  if (!el?.punti || el.punti.length < (el.forma === 'gradinata' ? 2 : 3)) return g;
  const rnd = generatore(hash(el.id)), P = new Pezzi(), cap = capienza(el), nVis = Math.round(cap * fattore);
  const info = () => {
    const base = { livello: 'Pubblico', elemento: el.forma === 'gradinata' ? 'gradinata' : el.fondo === 'piazzale' ? 'piazzale (in piedi)' : 'prato (in piedi)',
      [el.forma === 'gradinata' ? 'posti' : 'persone']: cap.toLocaleString('it-IT'), origine: el.ipotesi ? 'ipotesi di Circuit Studio' : 'disegnata nell\'editor' };
    if (el.forma === 'gradinata') { const G = gradinata(el); Object.assign(base, { file: G.N, 'altezza in cima': G.hTop.toFixed(1) + ' m', inclinazione: el.inclinazione + '°' }); }
    else base.area = Math.round(areaPrato(el)) + ' m²';
    return base;
  };
  const persone = el.forma === 'gradinata' ? pezziGradinata(el, terreno, P, nVis, rnd) : pezziPrato(el, terreno, P, nVis, rnd, blocco ? asse : null);
  if (el.forma !== 'gradinata') {
    const s = superficie([{ anello: el.punti, buchi: el.buchi || [] }], { terreno, colore: FONDI[el.fondo] || FONDI.prato, scarto: 0.065, nome: 'Pubblico', passo: 4, lato: 4 });
    s.userData.pick = info; s.userData.spalto = el.id; s.receiveShadow = true; g.add(s);
  }
  if (P.p.length) {
    const m = new THREE.Mesh(P.geometria(), materiali().pezzi); m.name = 'Pubblico'; m.castShadow = m.receiveShadow = true;
    m.userData.pick = info; m.userData.spalto = el.id; g.add(m);
  }
  if (persone.length) { const im = istanzePersone(persone, rnd, 'Pubblico (persone)', blocco); im.traverse((o) => { o.userData.pick = info; o.userData.spalto = el.id; }); g.add(im); }
  return g;
}

function fanZone(A, terreno, blocco = 0) {
  const g = new THREE.Group(); g.name = 'fan zone';
  const P = new Pezzi(), rnd = generatore(hash('fan' + A.anello[0])), R = A.anello, persone = [];
  const transenna = C('#d7dadd');
  for (let i = 0; i < R.length; i++) {
    const p = R[i], q = R[(i + 1) % R.length], zp = terreno.z(p[0], p[1]), zq = terreno.z(q[0], q[1]);
    P.quad([p[0], p[1], zp], [q[0], q[1], zq], [q[0], q[1], zq + 1.1], [p[0], p[1], zp + 1.1], transenna);
  }
  const r = rettangolo(R), z = terreno.z(r.c[0], r.c[1]), a = Math.abs(area(R)), nP = Math.min(1500, Math.floor(a / 9));
  for (let k = 0, prove = 0; k < nP && prove < nP * 4; prove++) {
    const s = (rnd() - 0.5) * r.L, t = (rnd() - 0.5) * r.W, x = r.c[0] + r.u[0] * s + r.v[0] * t, y = r.c[1] + r.u[1] * s + r.v[1] * t;
    if (!pip(x, y, R)) continue; persone.push([x, y, terreno.z(x, y) + 0.05, rnd() * 6.28]); k++;
  }
  for (let s = -r.L / 2 + 4; s < r.L / 2 - 4; s += 6) {                // gazebo bianchi in fila lungo il lato lungo
    const c = [r.c[0] + r.u[0] * s + r.v[0] * (r.W / 2 - 3.5), r.c[1] + r.u[1] * s + r.v[1] * (r.W / 2 - 3.5)];
    if (!pip(c[0], c[1], R)) continue;
    for (const [a1, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const q = [c[0] + r.u[0] * a1 * 1.9 + r.v[0] * b * 1.9, c[1] + r.u[1] * a1 * 1.9 + r.v[1] * b * 1.9]; P.scatola(q[0], q[1], r.u, 0.08, 0.08, z, z + 2.3, C('#bfc4c8')); }
    const Q = (a1, b, h) => [c[0] + r.u[0] * a1 + r.v[0] * b, c[1] + r.u[1] * a1 + r.v[1] * b, z + h];
    const top = Q(0, 0, 3.4), E = [Q(-2, -2, 2.3), Q(2, -2, 2.3), Q(2, 2, 2.3), Q(-2, 2, 2.3)];
    for (let i = 0; i < 4; i++) P.tri(E[i], E[(i + 1) % 4], top, C(i % 2 ? '#f4f4f2' : '#e3e6e8'));
  }
  const m = [r.c[0] - r.u[0] * (r.L / 2 - 2), r.c[1] - r.u[1] * (r.L / 2 - 2)];   // maxischermo
  for (const b of [-2.2, 2.2]) { const q = [m[0] + r.v[0] * b, m[1] + r.v[1] * b]; P.scatola(q[0], q[1], r.u, 0.3, 0.3, z, z + 3.0, C('#3a3d42')); }
  P.scatola(m[0], m[1], r.v, 6.4, 0.35, z + 3.0, z + 6.6, C('#1a1c20'));
  P.pannello(m[0], m[1], r.v, r.u, 0.19, 6.0, z + 3.2, z + 6.4, C('#3d7fd6'));
  const info = () => ({ livello: 'Pubblico', elemento: 'fan zone', area: Math.round(a) + ' m²' });
  const me = new THREE.Mesh(P.geometria(), materiali().pezzi); me.name = 'Pubblico'; me.castShadow = true; me.userData.pick = info; g.add(me);
  if (persone.length) { const im = istanzePersone(persone, rnd, 'Pubblico (persone)', blocco); im.traverse((o) => { o.userData.pick = info; }); g.add(im); }
  return g;
}

/** rev. 15: punti da cui viene il tifo, per l'audio della guida: [x, y, persone] ogni ~15 m lungo il fronte delle
 *  gradinate e su una griglia di 18 m nei prati (le persone della zona divise fra i suoi punti); fan zone comprese. */
export function sorgentiTifo(livello) {
  const out = [];
  for (const e of elementiPubblico(livello)) {
    const cap = capienza(e); if (!cap || !e.punti?.length) continue;
    const P = [];
    if (e.forma === 'gradinata') {
      const G = gradinata(e); if (!G) continue;
      const M = linea(G.F, G.O, G.g.profondita / 2);
      for (let i = 0; i + 1 < M.length; i++) { const a = M[i], b = M[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(l / 15)); for (let j = 0; j < k; j++) P.push([a[0] + (b[0] - a[0]) * (j + 0.5) / k, a[1] + (b[1] - a[1]) * (j + 0.5) / k]); }
    } else {
      const X = e.punti.map((q) => q[0]), Y = e.punti.map((q) => q[1]);
      for (let x = Math.min(...X) + 9; x < Math.max(...X); x += 18) for (let y = Math.min(...Y) + 9; y < Math.max(...Y); y += 18) if (pip(x, y, e.punti)) P.push([x, y]);
      if (!P.length) P.push(centro(e.punti));
    }
    for (const q of P) out.push([+q[0].toFixed(1), +q[1].toFixed(1), cap / P.length]);
  }
  for (const A of livello?.fan_zone || []) { const c = centro(A.anello); out.push([c[0], c[1], Math.min(1500, Math.floor(Math.abs(area(A.anello)) / 9))]); }
  return out;
}

/** livello = versione.livelli.pubblico; un gruppo con una zona per figlio (spento o acceso da chi lo usa).
 *  maxPersone: quante persone disegnare al massimo (le altre si contano ma non si vedono): fino all'80% alle gradinate,
 *  il resto ai prati. */
export function pubblico(livello, terreno, { maxPersone = 16000, blocco = 0, asse = null } = {}) {
  const g = new THREE.Group(); g.name = 'pubblico';
  if (!livello) return g;
  const els = elementiPubblico(livello), tot = { gradinata: 0, prato: 0 };
  for (const e of els) tot[e.forma === 'gradinata' ? 'gradinata' : 'prato'] += capienza(e);
  // rev. 15 bis: prima le gradinate (fino all'80% del totale disegnabile, al massimo tutti i posti), il resto ai prati
  const budG = Math.min(tot.gradinata, maxPersone * 0.8), budP = maxPersone - budG;
  const fattori = { gradinata: budG / Math.max(1, tot.gradinata), prato: Math.min(1, budP / Math.max(1, tot.prato)) };
  g.userData.fattori = fattori; g.userData.persone = tot.gradinata + tot.prato;
  for (const e of els) g.add(elementoPubblico(e, terreno, { fattore: fattori[e.forma === 'gradinata' ? 'gradinata' : 'prato'], blocco, asse }));
  for (const A of livello.fan_zone || []) g.add(fanZone(A, terreno, blocco));
  return g;
}
