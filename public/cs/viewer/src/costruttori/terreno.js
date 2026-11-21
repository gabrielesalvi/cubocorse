// Mesh del terreno dalla griglia di quote (leggermente sotto le superfici, che ci si appoggiano sopra).
import * as THREE from 'three';
import { SUPERFICI, materiale } from './stile.js';

export function terrenoMesh(t, { abbassa = 0.3, salto = 1 } = {}) {
  const nx = Math.ceil(t.nx / salto), ny = Math.ceil(t.ny / salto);
  const pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), base = new THREE.Color(SUPERFICI.terreno);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = t.x0 + i * salto * t.passo, y = t.y0 + j * salto * t.passo, z = t.z(x, y);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z - abbassa;
    const v = 0.96 + 0.04 * Math.sin(x * 0.05) * Math.cos(y * 0.043);
    col[k * 3] = base.r * v; col[k * 3 + 1] = base.g * v; col[k * 3 + 2] = base.b * v;
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, materiale({ flatShading: false })); m.name = 'terreno';
  m.userData.pick = () => ({ livello: 'Terreno', elemento: 'suolo (quote DBT, griglia 5 m)' });
  return m;
}
