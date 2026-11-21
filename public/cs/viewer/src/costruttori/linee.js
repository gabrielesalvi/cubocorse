// Elementi lineari verticali: barriere, parapetti, muretto box, recinzioni, reti paradetriti.
// Punti [x,y] (quota dal terreno) o [x,y,z]. Le barriere da bordo hanno la pista a sinistra del verso della linea.
import * as THREE from 'three';
import { unisci, cercaInfo, mesh } from './geom.js';
import { BARRIERE, RETE, col, materiale } from './stile.js';

const H = (x, y, k = 0) => { const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
const quote = (P, terreno, alza) => P.map(p => (p.length > 2 ? p[2] : terreno.z(p[0], p[1]) + (alza ? alza(p[0], p[1]) : 0)));

export function linee(lista, { terreno, nome, info = () => ({}), spessore = 0.25, alza = null, blocco = 0 }) {
  const parti = [], pile = [];
  for (const l of lista) {
    if (l.tipo === 'guardrail' || l.tipo === 'parapetto') { guardrail(l, parti, terreno, alza, nome, info); continue; }
    if (l.tipo === 'pneumatici') { pile.push(l); continue; }
    const st = BARRIERE[l.tipo] || BARRIERE.barriera, h = l.h || st.h, P = l.punti, sp = st.sp || spessore;
    if (!P || P.length < 2) continue;
    const pos = [], base = quote(P, terreno, alza);
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], z0 = base[i], z1 = base[i + 1];
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d * sp / 2, ny = dx / d * sp / 2;
      const ox = st.fuori ? -nx : 0, oy = st.fuori ? -ny : 0;            // 'fuori': tutto dal lato opposto alla pista
      // due facce laterali + sommità (un parallelepipedo aperto alle estremità: basso costo, si legge bene)
      const A = [x0 + nx + ox, y0 + ny + oy], B = [x1 + nx + ox, y1 + ny + oy], C = [x1 - nx + ox, y1 - ny + oy], D = [x0 - nx + ox, y0 - ny + oy];
      const q = (p, q2, za, zb, zc, zd) => pos.push(p[0], p[1], za, q2[0], q2[1], zb, q2[0], q2[1], zc, p[0], p[1], za, q2[0], q2[1], zc, p[0], p[1], zd);
      q(A, B, z0, z1, z1 + h, z0 + h); q(C, D, z1, z0, z0 + h, z1 + h);
      pos.push(A[0], A[1], z0 + h, B[0], B[1], z1 + h, C[0], C[1], z1 + h, A[0], A[1], z0 + h, C[0], C[1], z1 + h, D[0], D[1], z0 + h);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parti.push({ g, info: { livello: nome, tipo: l.tipo, ...info(l) }, colore: col(st.c) });
  }
  const g = pile.length ? gomme(pile, { terreno, alza, nome, info, blocco }) : null;
  if (!parti.length) return g || new THREE.Group();
  const { geo, tabella } = unisci(parti);
  const m = mesh(geo, materiale({ side: THREE.DoubleSide }), nome, (f) => cercaInfo(tabella, f));
  if (!g) return m;
  g.add(m); return g;
}

// rev. 13 (Gabriele 11-11: "le gomme devono sembrare pneumatici"): barriera di gomme vera. Pile di 4 pneumatici
// (raggio 30 cm, foro 19 cm, alte 1 m) su due file sfalsate, la prima con il filo davanti sulla linea della barriera
// (la pista sta a sinistra del verso della linea), la seconda dietro. Una InstancedMesh per linea e per fila: si
// scartano da sole fuori dall'inquadratura. Fianchi arrotondati e scanalature fra una gomma e l'altra; dentro il
// foro è più scuro.
let _pile = null;
function geoPila(dettaglio) {
  const pts = [];
  if (dettaglio) for (let k = 0; k < 4; k++) { const b = k * 0.25; pts.push([0.258, b + 0.004], [0.297, b + 0.045], [0.297, b + 0.205], [0.258, b + 0.246]); }
  else pts.push([0.29, 0], [0.29, 1.0]);
  pts.push([0.235, 1.0], [0.19, 0.985], [0.19, 0.86], [0.002, 0.86]);
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), dettaglio ? 12 : 8);
  g.rotateX(Math.PI / 2);                                               // asse del tornio (y) in alto (z)
  const a = g.attributes.position, c = new Float32Array(a.count * 3);
  for (let i = 0; i < a.count; i++) {
    const r = Math.hypot(a.getX(i), a.getY(i)), z = a.getZ(i), dentro = r < 0.2 && z > 0.8;
    const groove = dettaglio && r < 0.262 && !dentro;
    const v = dentro ? 0.45 : groove ? 0.7 : 1.0; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
export function gomme(lista, { terreno, alza = null, nome = 'Barriera', info = () => ({}), passo = 0.6, blocco = 0 }) {
  _pile ||= { geo: [geoPila(true), geoPila(false)], mat: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }) };
  const g = new THREE.Group(); g.name = nome;
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), su = new THREE.Vector3(0, 0, 1), pos = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  for (const l of lista) {
    const P = l.punti; if (!P || P.length < 2) continue;
    const base = quote(P, terreno, alza), file = [[], []];
    let s = 0, prossimo = [passo / 2, passo];                             // seconda fila sfalsata di mezza gomma
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], d = Math.hypot(x1 - x0, y1 - y0); if (d < 1e-3) continue;
      const fx = (y1 - y0) / d, fy = -(x1 - x0) / d;                     // fuori: a destra del verso (lontano dalla pista)
      for (let f = 0; f < 2; f++) while (prossimo[f] <= s + d) {
        const t = (prossimo[f] - s) / d, off = 0.3 + f * 0.52, x = x0 + (x1 - x0) * t + fx * off, y = y0 + (y1 - y0) * t + fy * off;
        file[f].push([x, y, base[i] + (base[i + 1] - base[i]) * t, prossimo[f]]); prossimo[f] += passo;
      }
      s += d;
    }
    // rev. 17: con `blocco` (la guida) la fila davanti si divide a pezzi di `blocco` m lungo la linea, ognuno con il gemello
    // semplice (stesse istanze, geometria della fila dietro): la guida accende quello dettagliato solo vicino alla camera
    const pezzi = [];
    file.forEach((F, f) => {
      if (!F.length) return;
      if (blocco > 0 && f === 0) { const m = new Map(); for (const p of F) { const k = Math.floor(p[3] / blocco); if (!m.has(k)) m.set(k, []); m.get(k).push(p); } for (const c of m.values()) pezzi.push([c, 0]); }
      else pezzi.push([F, f]);
    });
    pezzi.forEach(([F, f]) => {
      const im = new THREE.InstancedMesh(_pile.geo[f], _pile.mat, F.length);
      F.forEach(([x, y, z, sv], k) => {
        const u = H(x, y, 5);
        q.setFromAxisAngle(su, u * 6.28); sc.set(1, 1, 0.97 + 0.06 * H(x, y, 6));
        im.setMatrixAt(k, M.compose(pos.set(x, y, z - 0.02), q, sc));
        const v = 0.085 + 0.05 * u; col.setRGB(v, v, v * 1.04);
        if (Math.round(sv / passo) % 8 === 0 && f === 0 && l.colorate !== false) col.set(H(x, y, 7) < 0.5 ? '#c9302c' : '#e8e8e8');   // qualche pila verniciata
        im.setColorAt(k, col);
      });
      im.name = nome; im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
      im.userData.pick = () => ({ livello: nome, tipo: 'pneumatici', pile: F.length, ...info(l) });
      g.add(im);
      if (blocco > 0 && f === 0) {
        const lo = new THREE.InstancedMesh(_pile.geo[1], _pile.mat, F.length);
        lo.instanceMatrix = im.instanceMatrix; lo.instanceColor = im.instanceColor; lo.boundingSphere = im.boundingSphere.clone();
        lo.name = nome; lo.castShadow = lo.receiveShadow = true; lo.visible = false; lo.userData.pick = im.userData.pick;
        im.userData.lontano = lo; im.userData.lod = 'gomme'; lo.userData.lontana = true; im.userData.noTassella = lo.userData.noTassella = true;
        g.add(lo);
      }
    });
  }
  return g;
}

// rev. 11 ter (Gabriele 10-11, "metti guardrail sulla M240"): guardrail stradale a nastro (lama a doppia onda su paletti
// ogni 2 m). Sul cavalcavia ('parapetto') sta sopra un cordolo di cemento, come negli screen 12-13.
function guardrail(l, parti, terreno, alza, nome, info) {
  const P = l.punti; if (!P || P.length < 2) return;
  const base = quote(P, terreno, alza), ponte = l.tipo === 'parapetto', zc = ponte ? 0.3 : 0;
  const pos = { cemento: [], lama: [], pali: [] };
  const scat = (arr, a, b, za, zb, h0, h1, sp) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, nx = -dy / d * sp / 2, ny = dx / d * sp / 2;
    const A = [a[0] + nx, a[1] + ny], B = [b[0] + nx, b[1] + ny], C = [b[0] - nx, b[1] - ny], D = [a[0] - nx, a[1] - ny];
    const q = (p, q2, z1, z2, z3, z4) => arr.push(p[0], p[1], z1, q2[0], q2[1], z2, q2[0], q2[1], z3, p[0], p[1], z1, q2[0], q2[1], z3, p[0], p[1], z4);
    q(A, B, za + h0, zb + h0, zb + h1, za + h1); q(C, D, zb + h0, za + h0, za + h1, zb + h1);
    arr.push(A[0], A[1], za + h1, B[0], B[1], zb + h1, C[0], C[1], zb + h1, A[0], A[1], za + h1, C[0], C[1], zb + h1, D[0], D[1], za + h1);
  };
  let prossimo = 0, s = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], za = base[i], zb = base[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (ponte) scat(pos.cemento, a, b, za, zb, 0, zc, 0.45);
    scat(pos.lama, a, b, za, zb, zc + 0.45, zc + 0.78, 0.07);
    while (prossimo <= s + d) {
      const t = d ? (prossimo - s) / d : 0, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = za + (zb - za) * t;
      const ux = d ? (b[0] - a[0]) / d * 0.05 : 0.05, uy = d ? (b[1] - a[1]) / d * 0.05 : 0;
      scat(pos.pali, [x - ux, y - uy], [x + ux, y + uy], z, z, zc, zc + 0.75, 0.1);
      prossimo += 2;
    }
    s += d;
  }
  for (const [k, c] of [['cemento', '#bdbab3'], ['lama', '#b3b8bc'], ['pali', '#8b9095']]) {
    if (!pos[k].length) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos[k], 3));
    parti.push({ g, info: { livello: nome, tipo: l.tipo === 'parapetto' ? 'guardrail sul cordolo del cavalcavia' : 'guardrail', ...info(l) }, colore: col(c) });
  }
}

// Reti paradetriti (FIA 3502): rete dal bordo della barriera fino a h, poi 0,5 m inclinati di 45° verso la pista;
// pali ogni 5 m dal lato opposto alla pista. l.pista = 'sinistra' | 'destra' rispetto al verso della linea.
export function reti(lista, { terreno, nome = 'Rete paradetriti', alza = null, da = 1.0 }) {
  const rete = [], pali = [];
  for (const l of lista) {
    const P = l.punti, h = l.h || 4.0, da_ = l.da ?? da; if (!P || P.length < 2) continue;
    const base = quote(P, terreno, alza), sg = l.pista === 'destra' ? -1 : 1, k = 0.35;
    let prossimo = 0, s = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], z0 = base[i], z1 = base[i + 1];
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d * sg, ny = dx / d * sg;   // verso la pista
      const top0 = z0 + h - k, top1 = z1 + h - k;
      rete.push(x0, y0, z0 + da_, x1, y1, z1 + da_, x1, y1, top1, x0, y0, z0 + da_, x1, y1, top1, x0, y0, top0);
      const a = [x0 + nx * k, y0 + ny * k], b = [x1 + nx * k, y1 + ny * k];
      rete.push(x0, y0, top0, x1, y1, top1, b[0], b[1], top1 + k, x0, y0, top0, b[0], b[1], top1 + k, a[0], a[1], top0 + k);
      while (prossimo <= s + d) {                                        // palo: 10 cm, dietro la rete
        const t = (prossimo - s) / d, px = x0 + dx * t - nx * 0.12, py = y0 + dy * t - ny * 0.12, z = z0 + (z1 - z0) * t;
        const u = 0.05, ux = dx / d * u, uy = dy / d * u, vx = -nx * u, vy = -ny * u;
        const Q = [[px - ux - vx, py - uy - vy], [px + ux - vx, py + uy - vy], [px + ux + vx, py + uy + vy], [px - ux + vx, py - uy + vy]];
        for (let j = 0; j < 4; j++) { const A = Q[j], B = Q[(j + 1) % 4]; pali.push(A[0], A[1], z, B[0], B[1], z, B[0], B[1], z + h, A[0], A[1], z, B[0], B[1], z + h, A[0], A[1], z + h); }
        prossimo += 5;
      }
      s += d;
    }
  }
  const g = new THREE.Group(); g.name = nome;
  if (!rete.length) return g;
  const gr = new THREE.BufferGeometry(); gr.setAttribute('position', new THREE.Float32BufferAttribute(rete, 3)); gr.computeVertexNormals();
  const mr = new THREE.Mesh(gr, new THREE.MeshLambertMaterial({ color: RETE.c, transparent: true, opacity: RETE.opacita, side: THREE.DoubleSide, depthWrite: false }));
  mr.name = nome; mr.userData.pick = () => ({ livello: nome, tipo: 'rete paradetriti (parte alta inclinata di 45° verso la pista)' });
  const gp = new THREE.BufferGeometry(); gp.setAttribute('position', new THREE.Float32BufferAttribute(pali, 3)); gp.computeVertexNormals();
  const mp = new THREE.Mesh(gp, new THREE.MeshLambertMaterial({ color: RETE.palo, flatShading: true }));
  mp.name = nome + ' (pali)'; mp.userData.pick = mr.userData.pick;
  g.add(mp, mr); return g;
}

// rev. 11 (confronto con gli screen di Street View): muri e recinzioni dei giardini come sono a Roncadelle, invece di
// lastre piene verde scuro:
// - recinzione e cancellata: muretto basso (45 cm) con ringhiera (pannello scuro semitrasparente fino a 1,5 m);
// - rete: zoccolo basso e rete verde trasparente;
// - siepe: siepe alta e piena, cima un po' irregolare;
// - muretto: intonaco chiaro.
// Dietro molte recinzioni (2 su 3) e muretti (1 su 2) c'è una siepe, dal lato del giardino: il lato opposto alla
// strada più vicina fra quelle dell'asse (strada = punti [x, y] dell'asse del circuito).
const SIEPI = ['#3f6b2f', '#47763a', '#3a6330', '#507f3c', '#5a3f2f'];   // l'ultima: fotinia rossa (screen 6, 47, 58)
const MURI = ['#d8d0c0', '#cfc6b4', '#e2dccf', '#c4bcad', '#d6c7ae'];

export function recinzioni(lista, { terreno, nome, strada = null }) {
  // indice dei punti dell'asse per sapere da che parte sta la strada
  const CA = 25, celle = new Map();
  for (const p of strada || []) { const k = Math.floor(p[0] / CA) * 100003 + Math.floor(p[1] / CA); if (!celle.has(k)) celle.set(k, []); celle.get(k).push(p); }
  const versoStrada = (x, y) => {
    let best = null, bd = 80; const cx = Math.floor(x / CA), cy = Math.floor(y / CA);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (const p of celle.get((cx + a) * 100003 + cy + b) || []) {
      const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; }
    }
    return best ? [(best[0] - x) / (bd || 1), (best[1] - y) / (bd || 1)] : null;
  };
  const P3 = [], C3 = [], T3 = [], TC = [];
  const col = new THREE.Color();
  // parallelepipedo lungo il segmento a-b, spostato di off lungo la normale n, fra z+za e z+zb
  const scatola = (OUT, CO, a, b, za0, za1, h0, h1, sp, off, n, colore) => {
    const nx = n[0], ny = n[1], o1 = off - sp / 2, o2 = off + sp / 2;
    const A = [a[0] + nx * o1, a[1] + ny * o1], B = [b[0] + nx * o1, b[1] + ny * o1], C = [b[0] + nx * o2, b[1] + ny * o2], D = [a[0] + nx * o2, a[1] + ny * o2];
    const quad = (p, q, r, s) => { OUT.push(...p, ...q, ...r, ...p, ...r, ...s); for (let i = 0; i < 6; i++) CO.push(colore.r, colore.g, colore.b); };
    quad([A[0], A[1], za0 + h0], [B[0], B[1], za1 + h0], [B[0], B[1], za1 + h1], [A[0], A[1], za0 + h1]);
    quad([C[0], C[1], za1 + h0], [D[0], D[1], za0 + h0], [D[0], D[1], za0 + h1], [C[0], C[1], za1 + h1]);
    quad([A[0], A[1], za0 + h1], [B[0], B[1], za1 + h1], [C[0], C[1], za1 + h1], [D[0], D[1], za0 + h1]);
  };
  for (const l of lista) {
    const P = l.punti; if (!P || P.length < 2) continue;
    const z = P.map(p => (p.length > 2 ? p[2] : terreno.z(p[0], p[1])));
    const t = l.tipo, u = H(P[0][0], P[0][1]), u2 = H(P[0][0], P[0][1], 1);
    const conSiepe = t === 'siepe' ? false : (t === 'recinzione' || t === 'cancellata') ? u < 0.65 : t === 'muretto' ? u < 0.5 : false;
    // lato del giardino: opposto alla strada, deciso sul punto medio della linea
    const m = P[Math.floor(P.length / 2)], v = versoStrada(m[0], m[1]);
    const cSiepe = col.clone().set(SIEPI[Math.floor(u2 * (SIEPI.length - 0.6)) % SIEPI.length]);
    const cMuro = col.clone().set(MURI[Math.floor(u2 * MURI.length) % MURI.length]);
    const hS = 1.7 + 0.6 * H(m[0], m[1], 2);
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy); if (d < 0.05) continue;
      const n = [-dy / d, dx / d], lato = v ? (n[0] * v[0] + n[1] * v[1] > 0 ? -1 : 1) : 1;   // +n o -n verso il giardino
      const za = z[i], zb = z[i + 1];
      if (t === 'siepe') {
        const hh = (l.h || 1.8) + 0.25 * (H(a[0], a[1], 3) - 0.5);
        scatola(P3, C3, a, b, za, zb, 0, hh, 0.9, 0, n, cSiepe);
      } else if (t === 'recinzione' || t === 'cancellata') {
        scatola(P3, C3, a, b, za, zb, 0, 0.45, 0.25, 0, n, col.set('#c9c3b6'));
        scatola(T3, TC, a, b, za, zb, 0.45, 1.5, 0.04, 0, n, col.set('#2c3136'));
      } else if (t === 'rete') {
        scatola(P3, C3, a, b, za, zb, 0, 0.2, 0.2, 0, n, col.set('#bdb7aa'));
        scatola(T3, TC, a, b, za, zb, 0.2, Math.max(1.2, l.h || 1.6), 0.03, 0, n, col.set('#4d6b4d'));
      } else {                                          // muretto e altro
        scatola(P3, C3, a, b, za, zb, 0, Math.min(2.2, l.h || 1.2), 0.25, 0, n, cMuro);
      }
      if (conSiepe) scatola(P3, C3, a, b, za, zb, 0, hS, 0.8, 0.65 * lato, n, cSiepe);
    }
  }
  const g = new THREE.Group(); g.name = nome;
  const fai = (pos, co, mat) => {
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(co, 3));
    geo.computeVertexNormals();
    const me = new THREE.Mesh(geo, mat); me.name = nome; me.userData.pick = () => ({ livello: nome, elemento: 'muri, recinzioni e siepi (DBT e OSM)' }); g.add(me);
  };
  fai(P3, C3, materiale({ side: THREE.DoubleSide }));
  fai(T3, TC, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
  return g;
}
