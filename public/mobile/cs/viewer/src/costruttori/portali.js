// Semafori sopraelevati a sbraccio (rev. 10, 10-11-2026), solo da vedere: niente fisica né collisioni.
// Dati: versioni[k].livelli.portali.elementi (pipeline/circuiti/roncadelle/portali.py → sorgenti/roncadelle/portali.json):
// {id, nome, xy (piede del palo), dir (verso di marcia), braccio (dal palo verso la carreggiata), luce_m, h_m, lanterne
// (distanze dal palo), lanterna_palo, lato, colore ('verde'|'rosso'), percorso (facoltativo: id del circuito a cui vale)}.
// Palo zincato con la curva in cima, braccio orizzontale, lanterne a 3 luci appese con pannello nero, rivolte verso chi
// arriva (-dir); una sola luce accesa. Due mesh in tutto: corpi (Lambert a facce piatte) e luci accese (colori oltre 1,
// senza tone mapping: col bagliore della qualità Ultra brillano, come i neon dei landmark).
import * as THREE from 'three';
import { Pezzi } from './landmark.js';

const C = (h) => new THREE.Color(h);
const ZINCO = C('#9aa1a6'), CORPO = C('#1f2622'), PANNELLO = C('#0f1110'), BORDO = C('#e9e7df');
// luci: rosso in alto, giallo, verde in basso; spente = vetro scuro appena tinto
const LUCI = [['rosso', '#ff3020', '#3b1411'], ['giallo', '#ffb21a', '#3a2c0c'], ['verde', '#3dff5a', '#0f2c1f']];
const ACCESA = 2.2;                                     // intensità della luce accesa (oltre 1: bagliore in Ultra; il verde resta verde anche saturato)

/** prisma verticale a 8 lati (palo) */
function palo(P, x, y, r, z0, z1, k, lati = 8) {
  const v = (i) => { const a = (i / lati) * Math.PI * 2 + Math.PI / lati; return [x + Math.cos(a) * r, y + Math.sin(a) * r]; };
  for (let i = 0; i < lati; i++) {
    const a = v(i), b = v(i + 1);
    P.quad([a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1], k);
    P.tri([x, y, z1], [a[0], a[1], z1], [b[0], b[1], z1], k);
  }
}

/** lanterna a 3 luci con centro (x, y, zc), faccia verso n (= -dir), larghezza lungo t */
function lanterna(P, L, x, y, zc, t, n, colore) {
  const w = 0.34, d = 0.26, h = 0.98;
  P.scatola(x, y, t, w, d, zc - h / 2, zc + h / 2, CORPO);
  P.quad([x - t[0] * w / 2, y - t[1] * w / 2, zc - h / 2], [x + t[0] * w / 2, y + t[1] * w / 2, zc - h / 2],       // fondo
    [x + t[0] * w / 2 + n[0] * d, y + t[1] * w / 2 + n[1] * d, zc - h / 2], [x - t[0] * w / 2 + n[0] * d, y - t[1] * w / 2 + n[1] * d, zc - h / 2], CORPO);
  // pannello di contrasto nero con il bordo bianco, dietro le luci
  P.pannello(x, y, t, n, d / 2 + 0.01, 0.62, zc - 0.62, zc + 0.62, BORDO);
  P.pannello(x, y, t, n, d / 2 + 0.015, 0.56, zc - 0.56, zc + 0.56, PANNELLO);
  LUCI.forEach(([nome, acc, spenta], i) => {
    const z = zc + (1 - i) * 0.31, on = nome === colore;
    (on ? L : P).disco(x, y, t, n, d / 2 + 0.03, 0.105, z, on ? C(acc).multiplyScalar(ACCESA) : C(spenta), 8);
    // visiera sopra la luce
    const o = d / 2 + 0.02, s = 0.14, q = (a, b) => [x + t[0] * a + n[0] * b, y + t[1] * a + n[1] * b];
    const A = q(-0.12, o), B = q(0.12, o), Cc = q(0.12, o + s), D = q(-0.12, o + s);
    P.quad([A[0], A[1], z + 0.13], [B[0], B[1], z + 0.13], [Cc[0], Cc[1], z + 0.11], [D[0], D[1], z + 0.11], CORPO);
  });
}

/** gruppo con tutti i semafori; percorso = circuito.id (gli elementi con 'percorso' diverso si saltano) */
export function portali(elementi, { terreno, alza = null, percorso = null, nome = 'Semaforo' }) {
  const P = new Pezzi(), L = new Pezzi(), tabella = [];
  for (const e of elementi || []) {
    if (e.percorso && percorso && e.percorso !== percorso) continue;
    tabella.push([P.p.length / 9, { livello: nome, elemento: e.nome, luce: e.colore === 'rosso' ? 'sempre rossa' : 'sempre verde' }]);
    const [x, y] = e.xy, b = e.braccio, dir = e.dir, n = [-dir[0], -dir[1]];
    const z0 = terreno.z(x, y) + (alza ? alza(x, y) : 0), H = z0 + (e.h_m || 5.9), luce = e.luce_m;
    // palo, curva in cima e braccio
    const zc = H - 0.75;
    palo(P, x, y, 0.09, z0 - 0.3, zc, ZINCO);
    palo(P, x, y, 0.16, z0 - 0.3, z0 + 0.35, ZINCO);                                     // basamento
    const at = (s, z) => [x + b[0] * s, y + b[1] * s, z];
    P.tubo([x, y, zc - 0.05], at(0.22, H - 0.28), 0.13, ZINCO);
    P.tubo(at(0.22, H - 0.28), at(0.7, H - 0.02), 0.12, ZINCO);
    P.tubo(at(0.7, H - 0.02), at(luce, H), 0.11, ZINCO);
    P.tubo(at(luce - 0.02, H), at(luce + 0.06, H), 0.13, ZINCO);                            // tappo in punta
    // lanterne appese al braccio, rivolte verso chi arriva
    for (const s of e.lanterne || [luce - 0.25]) {
      const q = at(s, 0), zt = H - 0.08, zcL = zt - 0.12 - 0.49;
      P.tubo([q[0], q[1], H], [q[0], q[1], zt - 0.1], 0.05, ZINCO);
      lanterna(P, L, q[0] + n[0] * 0.02, q[1] + n[1] * 0.02, zcL, b, n, e.colore);
    }
    // lanterna sul palo, verso chi arriva
    if (e.lanterna_palo) {
      const q = [x + n[0] * 0.24, y + n[1] * 0.24];
      P.tubo([x, y, z0 + 2.85], [q[0], q[1], z0 + 2.85], 0.06, ZINCO);
      lanterna(P, L, q[0], q[1], z0 + 2.85, b, n, e.colore);
    }
  }
  const g = new THREE.Group(); g.name = 'semafori';
  if (!tabella.length) return g;
  const corpi = new THREE.Mesh(P.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  corpi.name = 'Semafori';
  corpi.userData.pick = (f) => { let lo = 0, hi = tabella.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tabella[m][0] <= f) lo = m; else hi = m - 1; } return tabella[lo][1]; };
  const luci = new THREE.Mesh(L.geometria(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }));
  luci.name = 'Semafori-luci'; luci.castShadow = false; luci.userData.pick = () => ({ livello: nome, elemento: 'luce accesa' });
  g.add(corpi, luci);
  return g;
}
