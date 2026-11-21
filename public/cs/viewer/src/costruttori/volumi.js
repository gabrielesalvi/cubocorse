// Volumi estrusi (edifici del DBT, box): pareti e copertura con colori distinti, facce piatte.
import * as THREE from 'three';
import { forma, unisci, cercaInfo, mesh } from './geom.js';
import { EDIFICI, LANDMARK, col, materiale } from './stile.js';

export function volumi(lista, { nome, info = () => ({}), colori = (v) => (v.landmark ? LANDMARK : EDIFICI[v.uso] || EDIFICI.altro) }) {
  const parti = [];
  for (const v of lista) {
    if (!(v.h > 0.3)) continue;
    let g;
    try { g = new THREE.ExtrudeGeometry(forma(v, 1e9), { depth: v.h, bevelEnabled: false }); } catch { continue; }
    const a = g.attributes.position, n = a.count;
    const [cm, ct] = colori(v).map(col);
    const c = new Float32Array(n * 3);
    // gruppo 0 = basi (sotto e sopra), gruppo 1 = pareti
    const gr = g.groups;
    for (const { start, count, materialIndex } of gr) {
      for (let i = start; i < start + count; i++) {
        const cc = materialIndex === 0 ? ct : cm;
        c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b;
      }
    }
    for (let i = 0; i < n; i++) a.setZ(i, v.base + a.getZ(i));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.clearGroups();
    parti.push({ g, info: { livello: nome, ...info(v) } });
  }
  if (!parti.length) return new THREE.Group();
  const { geo, tabella } = unisci(parti);
  return mesh(geo, materiale(), nome, (f) => cercaInfo(tabella, f));
}
