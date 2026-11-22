// Lampioni lungo il circuito (rev. 11: negli screen di Street View ce ne sono dappertutto, nel modello nessuno).
// Palo grigio da 8,5 m con lo sbraccio verso la strada e la lampada, ogni ~30 m, su un lato solo per tratti di ~400 m
// (a Roncadelle è così quasi ovunque). Stanno dove c'è il marciapiede della strada vera: bordo della A + 0,8 m.
// Nella B, dove la pista è allargata oltre la strada vera, il lampione andrebbe nella via di fuga e si salta.
// Mai dentro un edificio. Solo da vedere: la fisica della guida non li conosce.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pip } from './landmark.js';

const PASSO = 30, H = 8.5;

function modello() {
  const palo = new THREE.CylinderGeometry(0.07, 0.11, H, 6); palo.rotateX(Math.PI / 2); palo.translate(0, 0, H / 2);
  const braccio = new THREE.BoxGeometry(1.5, 0.08, 0.08); braccio.translate(0.75, 0, H - 0.15);
  const testa = new THREE.BoxGeometry(0.7, 0.28, 0.14); testa.translate(1.45, 0, H - 0.25);
  const vetro = new THREE.BoxGeometry(0.5, 0.2, 0.03); vetro.translate(1.45, 0, H - 0.33);
  const tinta = (g, c) => { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.toArray(a, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  return mergeGeometries([tinta(palo, '#8f959b'), tinta(braccio, '#8f959b'), tinta(testa, '#5d6268'), tinta(vetro, '#f3efe0')]);
}

/** circuito: per l'asse; bordiA/bordi: bordi_pista della A e della versione da disegnare; edifici: contesto.edifici */
export function lampioni(circuito, { terreno, bordiA, bordi, edifici = [], nome = 'Lampioni' }) {
  const P = circuito.asse.punti, ps = circuito.asse.passo_m, n = P.length;
  // edifici in celle da 40 m
  const CE = 40, cel = new Map();
  for (const e of edifici) {
    const c = e.anello[0], k = Math.floor(c[0] / CE) * 100003 + Math.floor(c[1] / CE);
    if (!cel.has(k)) cel.set(k, []); cel.get(k).push(e);
  }
  const dentroEdificio = (x, y) => {
    const cx = Math.floor(x / CE), cy = Math.floor(y / CE);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const e of cel.get((cx + a) * 100003 + cy + b) || []) if (pip(x, y, e.anello)) return true;
    return false;
  };
  const pos = [];
  const L = n * ps;
  for (let s = 10; s < L - 5; s += PASSO) {
    const i = Math.round(s / ps) % n, k = Math.round(s / 2) % bordiA.s.length;
    const blocco = Math.floor(s / 400), lato = Math.sin(blocco * 91.7 + 3.1) > 0 ? 1 : -1;   // 1 = destra
    const eA = lato > 0 ? bordiA.destra[k] : bordiA.sinistra[k], eV = lato > 0 ? bordi.destra[k] : bordi.sinistra[k];
    if (eV > eA + 0.5) continue;                                     // pista allargata: qui sarebbe in via di fuga
    const a = P[(i - 2 + n) % n], b = P[(i + 2) % n], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    const nx = dy / d * lato, ny = -dx / d * lato;                   // normale verso il lato scelto (destra = (dy, -dx))
    const off = Math.max(eA, eV) + 0.8, x = P[i][0] + nx * off, y = P[i][1] + ny * off;
    if (dentroEdificio(x, y)) continue;
    const zt = terreno.z(x, y), z = P[i][2] - zt > 1.5 ? P[i][2] : zt;   // sul cavalcavia: alla quota dell'impalcato
    pos.push([x, y, z, Math.atan2(-ny, -nx)]);                       // lo sbraccio guarda la strada
  }
  const g = new THREE.Group(); g.name = nome;
  if (!pos.length) return g;
  const im = new THREE.InstancedMesh(modello(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), pos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Z = new THREE.Vector3(0, 0, 1), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  pos.forEach(([x, y, z, ang], j) => { q.setFromAxisAngle(Z, ang); m.compose(p.set(x, y, z), q, one); im.setMatrixAt(j, m); });
  im.name = nome; im.userData.pick = () => ({ livello: nome, elemento: 'lampione (posizione indicativa)', h: H });
  g.add(im);
  g.userData.luci = pos.map(([x, y, z, ang]) => [x + Math.cos(ang) * 1.45, y + Math.sin(ang) * 1.45, z + H - 0.4]);   // rev. 17: lampade per la notte (notte.js)
  return g;
}
