// Alberi e arbusti low-poly istanziati, per specie. escludi(flags) toglie quelli che cadono sulla pista di una versione.
// contesto.alberi[i] = [x, y, h, flags, specie?, ampiezza?]
//   flags: bit0/bit1 = sulla pista A/B, bit2 = arbusto, bit3 = pino a ombrello (rev. 11, dalla foto);
//   specie (rev. 14, facoltativa): scelta nell'editor; se manca si ricava da flags e posizione (sempre la stessa);
//   ampiezza (rev. 14, facoltativa): larghezza della chioma rispetto alla forma tipica della specie (1 = normale).
// rev. 14: le specie riprendono quelle viste negli screen di Street View di Roncadelle: pini domestici (via Di Vittorio),
// tigli e aceri giovani lungo le strade (via Amendola, via Castello), platani grandi, pioppi cipressini (via Berlinguer),
// pruni a foglia rossa (via Vezzoli, via Amendola), conifere coniche nei giardini (via Nenni); arbusti e siepi di
// lauroceraso, fotinia (punte rosse) e bosso.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** specie: nome, classe (albero/arbusto), forma della chioma, proporzioni (frazione di h), colori, altezza tipica [min, max] */
export const SPECIE = {
  tiglio: { nome: 'Tiglio', classe: 'albero', forma: 'ovale', chioma: 0.62, raggio: 0.3, tronco: '#6a5240', verdi: ['#5f9440', '#6aa04a', '#578a3a', '#73a852'], h: [5, 14] },
  acero: { nome: 'Acero', classe: 'albero', forma: 'tonda', chioma: 0.58, raggio: 0.36, tronco: '#6d5137', verdi: ['#4f8a3c', '#5e9a45', '#467d36', '#6aa34d'], h: [4, 12] },
  platano: { nome: 'Platano', classe: 'albero', forma: 'nuvola', chioma: 0.62, raggio: 0.42, tronco: '#b3a68c', verdi: ['#5c8a3a', '#668f3f', '#527f34'], h: [9, 22] },
  pino: { nome: 'Pino domestico', classe: 'albero', forma: 'ombrello', chioma: 0.2, raggio: 0.46, tronco: '#7a5a3e', verdi: ['#2f5a2a', '#36652f', '#2b5126'], h: [8, 16] },
  pioppo: { nome: 'Pioppo cipressino', classe: 'albero', forma: 'colonna', chioma: 0.86, raggio: 0.11, tronco: '#6f6455', verdi: ['#4d8238', '#578c3e', '#46783a'], h: [10, 24] },
  pruno: { nome: 'Pruno rosso', classe: 'albero', forma: 'tonda', chioma: 0.6, raggio: 0.4, tronco: '#4e3a30', verdi: ['#6b2f3a', '#7a3542', '#5c2a35', '#82404a'], h: [3, 7] },
  conifera: { nome: 'Cedro / abete', classe: 'albero', forma: 'cono', chioma: 0.88, raggio: 0.28, tronco: '#5a4330', verdi: ['#2e4f2c', '#345a33', '#2a4a30'], h: [6, 18] },
  lauro: { nome: 'Lauroceraso', classe: 'arbusto', forma: 'cespuglio', chioma: 1, raggio: 0.7, verdi: ['#2f5e2a', '#386a30', '#2c5628'], h: [1, 4] },
  fotinia: { nome: 'Fotinia', classe: 'arbusto', forma: 'cespuglio', chioma: 1, raggio: 0.65, verdi: ['#4d6e34', '#7a3b2c', '#5a7a3a', '#8c3f2e'], h: [1, 3.5] },
  bosso: { nome: 'Bosso', classe: 'arbusto', forma: 'palla', chioma: 1, raggio: 0.55, verdi: ['#3a6230', '#41692f', '#355a2c'], h: [0.5, 2] },
};
export const SPECIE_ALBERI = Object.keys(SPECIE).filter((k) => SPECIE[k].classe === 'albero');
export const SPECIE_ARBUSTI = Object.keys(SPECIE).filter((k) => SPECIE[k].classe === 'arbusto');

const hsh = (x, y, k = 0) => { const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

/** la specie di un albero del pacchetto: quella scritta, o una scelta stabile (gruppi di 35 m con la stessa specie, come i filari) */
export function specieDi(a) {
  if (a[4] && SPECIE[a[4]]) return a[4];
  const [x, y, h, f] = a;
  if (f & 8) return 'pino';
  if (f & 4) { const u = hsh(x, y, 4); return u < 0.5 ? 'lauro' : u < 0.8 ? 'fotinia' : 'bosso'; }
  const u = hsh(x, y, 9) < 0.75 ? hsh(Math.floor(x / 35), Math.floor(y / 35), 5) : hsh(x, y, 6);
  if (h >= 9 && u < 0.2) return 'platano';
  if (u < 0.44) return 'tiglio';
  if (u < 0.62) return 'acero';
  if (u < 0.72) return h < 8 ? 'pruno' : 'acero';
  if (u < 0.82) return 'conifera';
  if (u < 0.88 && h >= 6) return 'pioppo';
  return 'tiglio';
}
/** altezza da disegnare: i pioppi cipressini del pacchetto (altezza dalla chioma vista dall'alto) sono più alti */
export const altezzaDi = (a, sp) => (a[4] ? a[2] : sp === 'pioppo' ? Math.min(22, a[2] * 1.7) : sp === 'platano' ? a[2] * 1.15 : a[2]);

/** applica le modifiche dell'editor (tipo 'prop', classe albero/arbusto): origine = albero del pacchetto da togliere o spostare */
export function conModifiche(lista, mods) {
  if (!mods?.length) return lista;
  const ids = new Set(mods.map((m) => m.id).filter(Boolean));
  const out = lista.filter((a) => !(a[6] && ids.has(a[6]))), via = new Set();   // versione già applicata di una modifica cambiata
  for (const m of mods) {
    if (m.origine) {
      let best = -1, bd = 1.5;
      out.forEach((a, i) => { if (via.has(i)) return; const d = Math.hypot(a[0] - m.origine[0], a[1] - m.origine[1]); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) via.add(best);
    }
    if (m.azione !== 'togli' && m.punti?.length) {
      const [x, y] = m.punti[0];
      out.push([x, y, m.h, (m.flags || 0) | (SPECIE[m.specie]?.classe === 'arbusto' ? 4 : 0), m.specie, m.ampiezza ?? 1, m.id]);
    }
  }
  return out.filter((_, i) => !via.has(i));
}

// geometrie unitarie delle chiome: base a z = 0, cima a z = 1, raggio 1
function geometrie() {
  const su = (g) => { g.computeBoundingBox(); const b = g.boundingBox; g.translate(0, 0, -b.min.z); g.scale(1, 1, 1 / (b.max.z - b.min.z)); return g; };
  const icosa = (d) => new THREE.IcosahedronGeometry(1, d);
  const ovale = su(icosa(1));
  const tonda = su(icosa(0));
  const nuvola = su(mergeGeometries([icosa(0).translate(0, 0, 0), icosa(0).scale(0.75, 0.75, 0.8).translate(0.55, 0.25, 0.45), icosa(0).scale(0.7, 0.7, 0.75).translate(-0.5, -0.3, 0.35)]));
  nuvola.scale(1 / 1.45, 1 / 1.45, 1);
  const lat = (pts, n) => { const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), n); g.rotateX(Math.PI / 2); return su(g); };
  const colonna = lat([[0.001, 0], [0.7, 0.08], [1, 0.3], [0.85, 0.65], [0.45, 0.9], [0.001, 1]], 7);
  const cono = su(mergeGeometries([0, 1, 2].map((k) => { const g = new THREE.ConeGeometry(1 - k * 0.25, 0.5, 8); g.rotateX(Math.PI / 2); return g.translate(0, 0, 0.25 + k * 0.27); })));
  const ombrello = new THREE.CylinderGeometry(1, 0.75, 1, 9); ombrello.rotateX(Math.PI / 2); su(ombrello);
  const cespuglio = su(icosa(1)); cespuglio.scale(1, 1, 1);
  const palla = su(icosa(1));
  const tronco = new THREE.CylinderGeometry(0.15, 0.22, 1, 5); tronco.rotateX(Math.PI / 2); tronco.translate(0, 0, 0.5);
  return { ovale, tonda, nuvola, colonna, cono, ombrello, cespuglio, palla, tronco };
}
let G = null;
const MAT = {};
const mat = (k, c) => (MAT[k] ||= new THREE.MeshLambertMaterial({ flatShading: true, ...(c ? { color: c } : {}) }));

/** collocazione di un albero: matrici di chioma e tronco (null se arbusto) */
function colloca(a, sp, terreno, m, mt) {
  const S = SPECIE[sp], [x, y] = a, h = altezzaDi(a, sp), amp = a[5] ?? 1, z = terreno.z(x, y);
  const u = hsh(x, y), u2 = hsh(x, y, 1), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), u * 6.28);
  const p = new THREE.Vector3(), s = new THREE.Vector3();
  if (S.classe === 'arbusto') {
    const r = Math.max(0.35, h * S.raggio * (0.85 + 0.3 * u2)) * amp;
    m.compose(p.set(x, y, z - 0.05), q, s.set(r, r * (0.8 + 0.4 * u), h)); return false;
  }
  const hc = h * S.chioma * (0.92 + 0.16 * u), r = h * S.raggio * (0.85 + 0.3 * u2) * amp;
  m.compose(p.set(x, y, z + h - hc), q, s.set(r, r * (0.85 + 0.3 * u), hc));
  const ht = h - hc * (S.forma === 'ombrello' ? 0.4 : S.forma === 'cono' ? 0.9 : 0.75), kt = sp === 'platano' ? 1.6 : sp === 'pino' ? 1.3 : sp === 'pioppo' ? 1.2 : 0.8 + h / 20;
  let qt = q;
  if (sp === 'pino') qt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(u * 6.28), Math.sin(u * 6.28), 0), 0.08 + 0.1 * u).multiply(q);
  mt.compose(p.set(x, y, z), qt, s.set(kt, kt, Math.max(0.5, ht)));
  return true;
}

export function alberi(lista, { terreno, nome, escludi = () => false }) {
  const g = new THREE.Group(); g.name = nome;
  const scelti = lista.filter((a) => !escludi(a[3]));
  if (!scelti.length) return g;
  G ||= geometrie();
  const perSpecie = {};
  for (const a of scelti) (perSpecie[specieDi(a)] ||= []).push(a);
  const m = new THREE.Matrix4(), mt = new THREE.Matrix4(), c = new THREE.Color();
  const conTronco = scelti.filter((a) => SPECIE[specieDi(a)].classe === 'albero');
  const it = new THREE.InstancedMesh(G.tronco, mat('tronco'), Math.max(1, conTronco.length)); it.count = 0;
  it.name = nome; it.userData.alberi = [];
  for (const [sp, A] of Object.entries(perSpecie)) {
    const S = SPECIE[sp], ic = new THREE.InstancedMesh(G[S.forma], mat('chioma'), A.length);
    ic.name = nome; ic.userData.alberi = A;
    A.forEach((a, i) => {
      const tr = colloca(a, sp, terreno, m, mt);
      ic.setMatrixAt(i, m); ic.setColorAt(i, c.set(S.verdi[Math.floor(hsh(a[0], a[1], 2) * S.verdi.length) % S.verdi.length]));
      if (tr) { it.setMatrixAt(it.count, mt); it.setColorAt(it.count, c.set(S.tronco)); it.userData.alberi.push(a); it.count++; }
    });
    ic.computeBoundingSphere();
    ic.userData.pick = (f, id) => info(A[id], nome);
    g.add(ic);
  }
  if (it.count) { it.computeBoundingSphere(); it.userData.pick = (f, id) => info(it.userData.alberi[id], nome); g.add(it); }
  return g;
}
function info(a, nome) {
  if (!a) return { livello: nome };
  const sp = specieDi(a);
  return { livello: nome, specie: SPECIE[sp].nome, altezza_m: +altezzaDi(a, sp).toFixed(1), origine: a[6] ? 'aggiunto o spostato nell\'editor' : a[4] ? 'scelto nell\'editor' : 'DBT, misurato sulla foto 2024 (specie stimata)' };
}
