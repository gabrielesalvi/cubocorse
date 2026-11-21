// Nastri 3D con quota propria (cavalcavia, rampa, ricciolo): impalcato, spessore, spalle piene o pile.
import * as THREE from 'three';
import { unisci, cercaInfo, mesh } from './geom.js';
import { SUPERFICI, col, materiale } from './stile.js';

export function nastro3d(n, { terreno, nome, colore = SUPERFICI.asfalto_pista, spessore = 1.2, passoPile = 14 }) {
  const S = n.sinistra, D = n.destra, pos = [], lat = [], pile = [];
  for (let i = 0; i < S.length - 1; i++) {
    const a = S[i], b = S[i + 1], c = D[i + 1], d = D[i];
    pos.push(...a, ...d, ...c, ...a, ...c, ...b);
    // fianchi: dove l'impalcato è basso diventano muri pieni fino a terra (rampa), altrove spessore della soletta
    for (const [p, q] of [[a, b], [c, d]]) {
      const gp = terreno.z(p[0], p[1]), gq = terreno.z(q[0], q[1]);
      const bp = p[2] - gp > 3 ? p[2] - spessore : gp - 0.3, bq = q[2] - gq > 3 ? q[2] - spessore : gq - 0.3;
      lat.push(p[0], p[1], p[2], q[0], q[1], q[2], q[0], q[1], bq, p[0], p[1], p[2], q[0], q[1], bq, p[0], p[1], bp);
    }
  }
  // pile: dove l'impalcato è alto più di 3 m
  let ultima = -1e9;
  for (let i = 0; i < S.length; i++) {
    const s = n.s[i]; if (s - ultima < passoPile) continue;
    const cx = (S[i][0] + D[i][0]) / 2, cy = (S[i][1] + D[i][1]) / 2, z = (S[i][2] + D[i][2]) / 2, g = terreno.z(cx, cy);
    if (z - g > 3 && (!n.pila_ok || n.pila_ok[i])) { pile.push([cx, cy, g, z - spessore]); ultima = s; }
  }
  const gs = new THREE.BufferGeometry(); gs.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const gl = new THREE.BufferGeometry(); gl.setAttribute('position', new THREE.Float32BufferAttribute(lat, 3));
  const parti = [{ g: gs, info: { livello: nome, elemento: 'impalcato' }, colore: col(colore) },
                 { g: gl, info: { livello: nome, elemento: 'fianchi' }, colore: col('#b8b2a6') }];
  for (const [x, y, z0, z1] of pile) {
    const b = new THREE.BoxGeometry(1.4, 1.4, z1 - z0).toNonIndexed(); b.translate(x, y, (z0 + z1) / 2);
    parti.push({ g: b, info: { livello: nome, elemento: 'pila' }, colore: col('#a9a399') });
  }
  const { geo, tabella } = unisci(parti);
  return mesh(geo, materiale({ side: THREE.DoubleSide }), nome, (f) => cercaInfo(tabella, f));
}
