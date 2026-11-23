// Auto da lontano (23-11-2026, Gabriele: «vai con le auto»). Sul telefono le 8 auto valevano 85-120 chiamate di disegno
// per fotogramma (tests/sonda-scena.py): ogni auto è fatta di 10-15 pezzi, uno per materiale, più le quattro ruote.
// Qui ogni auto riceve una copia «da lontano» con i pezzi UNITI PER MATERIALE e le ruote ferme, che si disegna oltre
// DIST_LONTANA metri dalla telecamera (anche per lo specchietto e le ombre, che vedono lo stato dell'ultimo disegno).
//  - stessi materiali (anche quelli che cambiano durante la gara: stop, fari di notte, trasparenza del ghost), quindi
//    stessa luce e stessi colori; a quella distanza non si vedono né le ruote che girano né lo sterzo;
//  - i materiali Lambert «semplici» tutti uguali (qualità Telefono e Bassa delle auto a cubetti: opaco, vernice, metallo,
//    vetro, gomma hanno la stessa luce) diventano un pezzo solo;
//  - delle parti che hanno già un loro livello di dettaglio (auto low-poly realistiche) si prende quello da lontano.
// Lo scambio lo fa un nodo «come un LOD» messo per primo dentro body: three lo aggiorna con la telecamera prima di
// guardare i fratelli (WebGLRenderer.projectObject), così vicino e lontano non si vedono mai insieme.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ?lontana=0 = sempre l'auto completa (per i confronti); ?lontana=<metri> = altra distanza
const QL = new URLSearchParams(globalThis.location?.search || '').get('lontana');
export const DIST_LONTANA = QL === '0' ? Infinity : (+QL || 35);   // m

/** materiali equivalenti: i Lambert a colori per vertice senza niente di speciale fanno la stessa luce */
function chiave(m) {
  const semplice = m.type === 'MeshLambertMaterial' && m.vertexColors && !m.map && !m.transparent && !m.polygonOffset
    && !m.onBeforeCompile?.toString().includes('uNight') && (!m.emissive || m.emissive.getHex() === 0)
    && m.color.getHex() === 0xffffff && m.side === THREE.FrontSide && !m.flatShading;
  return semplice ? 'lambert' : m.uuid;
}

/** pezzi da unire: mesh sotto `radice`, saltando abitacolo e copie da lontano; dei LOD solo l'ultimo livello */
function raccogli(o, salta, out) {
  if (salta.has(o)) return;
  if (o.isLOD && o.levels?.length) { raccogli(o.levels[o.levels.length - 1].object, salta, out); return; }
  if (o.isMesh && o.geometry?.attributes?.position) out.push(o);
  for (const c of o.children) raccogli(c, salta, out);
}

/** un pezzo di geometria (vertici da `inizio` per `quanti`, di una geometria già senza indice) nel sistema di body, con
 *  solo gli attributi che servono al materiale */
function pezzo(ni, inizio, quanti, mat, matrice) {
  const A = ni.attributes, n = quanti, b = new THREE.BufferGeometry();
  const taglia = (a) => new THREE.BufferAttribute(a.array.slice(inizio * a.itemSize, (inizio + n) * a.itemSize), a.itemSize, a.normalized);
  b.setAttribute('position', taglia(A.position));
  if (A.normal) b.setAttribute('normal', taglia(A.normal)); else b.computeVertexNormals();
  if (mat.vertexColors) b.setAttribute('color', A.color && A.color.itemSize === 3 ? taglia(A.color) : new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  if (mat.map || mat.alphaMap) b.setAttribute('uv', A.uv ? taglia(A.uv) : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  b.applyMatrix4(matrice);
  return b;
}

/** costruisce (o rifà, nello stesso gruppo) la copia da lontano di `vis` (CarVisual o AutoLowPoly). `prima` = alla
 *  creazione: ruote dritte e matrici da aggiornare; dopo (durante un disegno) le matrici sono già quelle del fotogramma */
function costruisci(vis, prima = false) {
  const body = vis.body;
  if (prima) body.updateMatrixWorld(true);
  const inv = body.matrixWorld.clone().invert(), mesh = [];
  raccogli(body, new Set([vis.cockpit, vis._nodoLontana, vis._lontana].filter(Boolean)), mesh);
  const secchi = new Map();   // chiave → { mat, pezzi, ombra }
  for (const m of mesh) {
    const M = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const geo = m.geometry, ni = geo.index ? geo.toNonIndexed() : geo, tutti = ni.attributes.position.count;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const gruppi = Array.isArray(m.material) && geo.groups.length ? geo.groups : [{ start: 0, count: tutti, materialIndex: 0 }];
    for (const g of gruppi) {
      const mat = mats[g.materialIndex], inizio = g.start, quanti = Math.min(g.count, tutti - g.start);
      if (!mat || !mat.visible || quanti <= 0) continue;
      const k = chiave(mat), s = secchi.get(k) || { mat, pezzi: [], ombra: false };
      s.pezzi.push(pezzo(ni, inizio, quanti, s.mat, M)); s.ombra ||= m.castShadow; secchi.set(k, s);
    }
    if (ni !== geo) ni.dispose();
  }
  let L = vis._lontana;
  if (L) { for (const c of [...L.children]) { L.remove(c); c.geometry.dispose(); } }   // stesso gruppo: niente figli di body spostati durante un disegno
  else { L = new THREE.Group(); L.name = 'auto-lontana'; L.visible = false; body.add(L); vis._lontana = L; }
  for (const s of secchi.values()) {
    const geo = mergeGeometries(s.pezzi, false);
    s.pezzi.forEach((p) => p.dispose());
    if (!geo) continue;
    const me = new THREE.Mesh(geo, s.mat);
    me.castShadow = s.ombra; me.receiveShadow = true; me.userData.lontano = true;
    L.add(me);
  }
  vis._daRifare = false;
}

/** nodo che sceglie vicino o lontano a ogni disegno, prima dei fratelli */
class SceltaLontana extends THREE.Object3D {
  constructor(vis) { super(); this.vis = vis; this.isLOD = true; this.autoUpdate = true; this._p = new THREE.Vector3(); this._c = new THREE.Vector3(); this.lontana = false; }
  update(camera) {
    const v = this.vis, d = this._p.setFromMatrixPosition(this.matrixWorld).distanceTo(this._c.setFromMatrixPosition(camera.matrixWorld)) / (camera.zoom || 1);
    const lon = !v.cockpitOn && d > DIST_LONTANA;
    if (lon && v._daRifare) costruisci(v);   // dopo un danno la copia si rifà solo quando serve (un urto avviene da vicino)
    this.lontana = lon;
    if (v._lontana) v._lontana.visible = lon;
    if (v.mesh) v.mesh.visible = !lon && !v.cockpitOn;
    for (const w of v.wheels) w.pivot.visible = !lon && !v.cockpitOn;
  }
}

/**
 * auto vicine: in una mesh a più materiali, i gruppi con materiali equivalenti (chiave()) diventano un gruppo solo, con
 * l'indice riordinato. Stessa immagine (stesso materiale), meno chiamate: alla qualità Telefono la carrozzeria a cubetti
 * passa da 7 a 4 pezzi e ogni ruota da 2 a 1. Ritorna la geometria nuova, o null se non c'è niente da unire.
 */
export function unisciGruppi(geo, mats) {
  if (!geo.index || !Array.isArray(mats) || geo.groups.length < 2) return null;
  const canon = new Map(), primo = mats.map((m, i) => { if (!m) return i; const k = chiave(m); if (!canon.has(k)) canon.set(k, i); return canon.get(k); });
  if (!geo.groups.some((g) => primo[g.materialIndex] !== g.materialIndex)) return null;
  const I = geo.index.array, per = new Map();
  for (const g of geo.groups) { const c = primo[g.materialIndex]; if (!per.has(c)) per.set(c, []); per.get(c).push(g); }
  const out = new (I.constructor)(I.length), gruppi = [];
  let o = 0;
  for (const [c, gs] of per) {
    const s0 = o;
    for (const g of gs) { const n = Math.min(g.count, I.length - g.start); out.set(I.subarray(g.start, g.start + n), o); o += n; }
    gruppi.push([s0, o - s0, c]);
  }
  const nuova = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) nuova.setAttribute(k, a);
  nuova.setIndex(new THREE.BufferAttribute(out.subarray(0, o), 1));
  for (const [st, n, c] of gruppi) nuova.addGroup(st, n, c);
  nuova.boundingSphere = geo.boundingSphere; nuova.boundingBox = geo.boundingBox;
  nuova.userData = { ...geo.userData, gruppiUniti: true };
  return nuova;
}
const RUOTE_UNITE = new WeakMap();   // geometria condivisa delle ruote → copia coi gruppi uniti (per serie di materiali)

/** unisce i gruppi equivalenti della carrozzeria e delle ruote di un'auto a cubetti */
function vicinaLeggera(vis) {
  const m = vis.mesh;
  if (m?.isMesh) { const g = unisciGruppi(m.geometry, m.material); if (g) { m.geometry.dispose(); m.geometry = g; } }
  for (const w of vis.wheels) w.spin.traverse((o) => {
    if (!o.isMesh || !Array.isArray(o.material)) return;
    let perMat = RUOTE_UNITE.get(o.geometry);
    if (!perMat) RUOTE_UNITE.set(o.geometry, (perMat = new Map()));
    const k = o.material.map((x) => x?.uuid).join(',');
    if (!perMat.has(k)) perMat.set(k, unisciGruppi(o.geometry, o.material) || o.geometry);
    o.geometry = perMat.get(k);
  });
}

/** aggiunge a `vis` la copia da lontano e lo scambio; dopo un danno (auto a cubetti) la copia si rifà */
export function conCopiaLontana(vis) {
  if (!vis?.body || !vis.wheels) return vis;
  vicinaLeggera(vis);
  costruisci(vis, true);
  const nodo = new SceltaLontana(vis);
  nodo.parent = vis.body; vis.body.children.unshift(nodo);   // per primo: si aggiorna prima di mesh e ruote
  vis._nodoLontana = nodo;
  if (typeof vis._remesh === 'function') {
    const rifai = vis._remesh.bind(vis);
    vis._remesh = () => { rifai(); vicinaLeggera(vis); vis._daRifare = true; };
  }
  const butta = vis.dispose?.bind(vis);
  vis.dispose = () => { butta?.(); vis._lontana?.traverse((o) => o.geometry?.dispose()); };
  return vis;
}
