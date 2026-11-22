// Tassellatura del mondo per le prestazioni (11-11-2026, «lag sotto i 30 fps con la grafica realistica»).
// I costruttori del visualizzatore uniscono ogni livello in UNA mesh grande quanto la città (terreno, pista, strade,
// marciapiedi…) e gli alberi o le gomme in InstancedMesh con una sfera di ingombro di chilometri: three.js non può
// scartarle fuori dall'inquadratura, quindi ogni passata (scena, ombre, GTAO, retrovisore) disegnava TUTTO il mondo,
// anche quello alle spalle della camera. Qui, dopo la costruzione, le mesh grandi vengono divise in riquadri di
// `lato` metri: stessi materiali, stessi attributi (condivisi, caricati una volta sola sulla scheda), solo un indice
// per riquadro. L'aspetto non cambia; i riquadri fuori dall'inquadratura o dal riquadro delle ombre non si disegnano.
// Misure scelte provando 150/250/400/500 m: riquadri piccoli tolgono più triangoli ma moltiplicano le chiamate di disegno;
// 400 m (300 per le istanze) e solo mesh da 60.000 triangoli in su = circa -35% triangoli con +50% chiamate.
import * as THREE from 'three';

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _b = new THREE.Box3();

/** copia le proprietà di disegno di una mesh su un'altra */
function copiaProprieta(da, a) {
  a.name = da.name; a.castShadow = da.castShadow; a.receiveShadow = da.receiveShadow; a.renderOrder = da.renderOrder;
  a.frustumCulled = da.frustumCulled; a.visible = da.visible; a.layers.mask = da.layers.mask; a.userData = da.userData;
  a.onBeforeRender = da.onBeforeRender; a.onAfterRender = da.onAfterRender;
  a.position.copy(da.position); a.quaternion.copy(da.quaternion); a.scale.copy(da.scale);
  if (!da.matrixAutoUpdate) { a.matrixAutoUpdate = false; a.matrix.copy(da.matrix); }
}

/** mesh normale (indicizzata o no) → un gruppo di mesh, una per riquadro, che condividono gli attributi */
function dividiMesh(m, lato) {
  const g = m.geometry, pos = g.attributes.position, idx = g.index;
  const nTri = (idx ? idx.count : pos.count) / 3;
  const W = m.matrixWorld, celle = new Map();
  const vert = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  for (let t = 0; t < nTri; t++) {
    let x = 0, z = 0;
    for (let k = 0; k < 3; k++) { _v.fromBufferAttribute(pos, vert(t, k)).applyMatrix4(W); x += _v.x; z += _v.z; }
    const key = `${Math.floor(x / 3 / lato)},${Math.floor(z / 3 / lato)}`;
    let c = celle.get(key); if (!c) celle.set(key, (c = []));
    c.push(t);
  }
  if (celle.size < 2) return null;
  const grande = pos.count > 65535;
  const gruppo = new THREE.Group(); gruppo.name = m.name;
  for (const tri of celle.values()) {
    const ind = grande ? new Uint32Array(tri.length * 3) : new Uint16Array(tri.length * 3);
    _b.makeEmpty();
    for (let i = 0; i < tri.length; i++) for (let k = 0; k < 3; k++) { const v = vert(tri[i], k); ind[i * 3 + k] = v; _b.expandByPoint(_v.fromBufferAttribute(pos, v)); }
    const ng = new THREE.BufferGeometry();
    for (const [nome, a] of Object.entries(g.attributes)) ng.setAttribute(nome, a);   // stessi BufferAttribute: un solo caricamento
    ng.setIndex(new THREE.BufferAttribute(ind, 1));
    ng.boundingBox = _b.clone(); ng.boundingSphere = _b.getBoundingSphere(new THREE.Sphere());   // computeBoundingSphere ignorerebbe l'indice
    const nm = new THREE.Mesh(ng, m.material);
    copiaProprieta(m, nm); nm.position.set(0, 0, 0); nm.quaternion.identity(); nm.scale.set(1, 1, 1); nm.matrixAutoUpdate = true;
    gruppo.add(nm);
  }
  gruppo.position.copy(m.position); gruppo.quaternion.copy(m.quaternion); gruppo.scale.copy(m.scale);
  if (!m.matrixAutoUpdate) { gruppo.matrixAutoUpdate = false; gruppo.matrix.copy(m.matrix); }
  gruppo.visible = m.visible;
  return gruppo;
}

/** InstancedMesh → una InstancedMesh per riquadro (stessa geometria e materiale; attributi per istanza ritagliati) */
function dividiIstanze(m, lato) {
  const n = m.count, W = m.matrixWorld, celle = new Map();
  for (let i = 0; i < n; i++) {
    m.getMatrixAt(i, _m); _v.setFromMatrixPosition(_m).applyMatrix4(W);
    const key = `${Math.floor(_v.x / lato)},${Math.floor(_v.z / lato)}`;
    let c = celle.get(key); if (!c) celle.set(key, (c = []));
    c.push(i);
  }
  if (celle.size < 2) return null;
  const istGeo = Object.entries(m.geometry.attributes).filter(([, a]) => a.isInstancedBufferAttribute);
  const gruppo = new THREE.Group(); gruppo.name = m.name;
  for (const ids of celle.values()) {
    let geo = m.geometry;
    if (istGeo.length) {        // attributi per istanza nella geometria: copia superficiale con gli attributi ritagliati
      geo = new THREE.BufferGeometry(); geo.index = m.geometry.index;
      for (const [nome, a] of Object.entries(m.geometry.attributes)) {
        if (!a.isInstancedBufferAttribute) { geo.setAttribute(nome, a); continue; }
        const s = a.itemSize, arr = new a.array.constructor(ids.length * s);
        ids.forEach((id, k) => { for (let j = 0; j < s; j++) arr[k * s + j] = a.array[id * s + j]; });
        geo.setAttribute(nome, new THREE.InstancedBufferAttribute(arr, s, a.normalized, a.meshPerAttribute));
      }
      geo.boundingBox = m.geometry.boundingBox; geo.boundingSphere = m.geometry.boundingSphere;
    }
    const im = new THREE.InstancedMesh(geo, m.material, ids.length);
    ids.forEach((id, k) => { m.getMatrixAt(id, _m); im.setMatrixAt(k, _m); });
    if (m.instanceColor) {
      const c = new THREE.Color();
      ids.forEach((id, k) => { m.getColorAt(id, c); im.setColorAt(k, c); });
    }
    copiaProprieta(m, im);
    im.computeBoundingSphere(); im.computeBoundingBox();
    gruppo.add(im);
  }
  return gruppo;
}

/**
 * divide le mesh grandi del mondo in riquadri. Si applica solo dove conviene: mesh con almeno `minTri` triangoli (o
 * InstancedMesh con almeno `minIstanze` istanze) e un ingombro più largo di un riquadro. Restituisce un riassunto.
 */
export function tassella(mondo, { lato = 400, latoIstanze = 300, minTri = 60000, minIstanze = 60 } = {}) {
  mondo.updateMatrixWorld(true);
  const da = [];
  mondo.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.geometry.groups?.length > 1) return;
    if (o.morphTargetInfluences || o.geometry.morphAttributes?.position) return;
    const g = o.geometry; if (!g.attributes.position) return;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (o.userData.noTassella) return;                                   // rev. 17: pezzi con il loro LOD (gomme)
    if (o.isInstancedMesh) {
      if (o.count < minIstanze || o.morphTexture) return;
      if (!o.boundingSphere) o.computeBoundingSphere();
      if (o.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > latoIstanze * 0.75) da.push(o);
    } else {
      const nTri = (g.index ? g.index.count : g.attributes.position.count) / 3;
      if (nTri >= minTri && g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis() > lato * 0.75) da.push(o);
    }
  });
  const ris = { mesh: 0, riquadri: 0 };
  for (const o of da) {
    const nuovo = o.isInstancedMesh ? dividiIstanze(o, latoIstanze) : dividiMesh(o, lato);
    if (!nuovo) continue;
    const p = o.parent, i = p.children.indexOf(o);
    p.children[i] = nuovo; nuovo.parent = p; o.parent = null;      // stesso posto fra i figli (ordine di disegno invariato)
    if (o.isInstancedMesh) o.dispose();
    ris.mesh++; ris.riquadri += nuovo.children.length;
  }
  mondo.updateMatrixWorld(true);
  return ris;
}
