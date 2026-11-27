// Città leggera (27-11-2026) per le qualità Telefono e Bassa delle piste di Circuit Studio. Sul Samsung S24 Roncadelle a
// Telefono aveva 3,2 M triangoli e ~900 chiamate (cali a 28-50 fps), perché la città era la stessa del PC.
// Qui, senza toccare i costruttori di Circuit Studio (cs/ è una copia):
//  - chiome e tronchi degli alberi con forme più semplici (stesse matrici e colori: stessi alberi, meno facce);
//  - (in mondo.js) palazzi con i dettagli solo vicino alla pista, terreno e superfici a maglia più larga, riquadri più
//    piccoli; (in pacchetto.js) vista che finisce a 1,6 km nella nebbia.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPECIE, specieDi } from '../../../cs/viewer/src/costruttori/alberi.js';

export const VISTA_LEGGERA = 1600;          // m: fin dove si disegna (la nebbia chiude prima)

let G = null;
// stesse convenzioni di alberi.js: base a z = 0, cima a z = 1, raggio 1
function geometrie() {
  const su = (g) => { g.computeBoundingBox(); const b = g.boundingBox; g.translate(0, 0, -b.min.z); g.scale(1, 1, 1 / (b.max.z - b.min.z)); return g; };
  const ico = () => su(new THREE.IcosahedronGeometry(1, 0));                                  // 20 facce (prima 80)
  const lat = (pts, n) => { const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), n); g.rotateX(Math.PI / 2); return su(g); };
  const cono = new THREE.ConeGeometry(1, 1, 6); cono.rotateX(Math.PI / 2); su(cono);          // un cono (prima tre da 8)
  const ombrello = new THREE.CylinderGeometry(1, 0.75, 1, 6); ombrello.rotateX(Math.PI / 2); su(ombrello);
  const nuvola = su(mergeGeometries([new THREE.IcosahedronGeometry(1, 0), new THREE.IcosahedronGeometry(0.75, 0).translate(0.55, 0.25, 0.45)]));
  nuvola.scale(1 / 1.3, 1 / 1.3, 1);
  const tronco = new THREE.CylinderGeometry(0.15, 0.22, 1, 4, 1, true); tronco.rotateX(Math.PI / 2); tronco.translate(0, 0, 0.5);   // senza tappi
  return { ovale: ico(), tonda: ico(), nuvola, colonna: lat([[0.001, 0], [0.8, 0.15], [0.9, 0.55], [0.001, 1]], 5), cono, ombrello, cespuglio: ico(), palla: ico(), tronco };
}

/** sostituisce le forme degli alberi nel gruppo costruito da alberi() */
export function alberiLeggeri(gruppo) {
  G ||= geometrie();
  let prima = 0, dopo = 0;
  gruppo.traverse((o) => {
    if (!o.isInstancedMesh || !o.userData.alberi?.length) return;
    const P = o.geometry.parameters, tronco = o.geometry.type === 'CylinderGeometry' && P?.radiusTop === 0.15;   // il tronco di alberi.js
    const forma = tronco ? 'tronco' : SPECIE[specieDi(o.userData.alberi[0])]?.forma;
    const g = G[forma]; if (!g) return;
    const tri = (x) => (x.index ? x.index.count : x.attributes.position.count) / 3;
    prima += tri(o.geometry) * o.count; dopo += tri(g) * o.count;
    o.geometry = g;                     // (le geometrie di alberi.js sono condivise fra le costruzioni: niente dispose)
  });
  return { prima, dopo };
}
