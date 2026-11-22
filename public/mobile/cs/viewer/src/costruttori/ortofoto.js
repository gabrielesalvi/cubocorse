// Foto aerea drappeggiata sul terreno, sopra le superfici (con opacità regolabile) per confrontare modello e realtà.
// La texture si scarica solo la prima volta che il livello diventa visibile.
import * as THREE from 'three';

export function ortofoto(foto, terreno, base, opz = {}) {
  if (foto.riquadri) return ortofotoRiquadri(foto, terreno, base, opz);
  return ortofotoUna(foto, terreno, base, opz);
}

/**
 * rev. 18 (Gabriele 13-11): mosaico ad alta definizione a riquadri (foto.riquadri = [{file, box}], foto.panoramica,
 * foto.dir). Da lontano si vede la panoramica (una texture sola, ~0,4 m/px); i riquadri da 2048 px (0,1 m/px) si caricano
 * solo entro RAGGIO metri dalla camera e si liberano quando ci si allontana, così la memoria della scheda video resta
 * bassa (tutti insieme sarebbero ~650 MB). La gestione sta nell'onBeforeRender della panoramica, che si disegna sempre
 * quando il livello è acceso.
 */
const RAGGIO = 320;
function ortofotoRiquadri(foto, terreno, base, opz) {
  const g = new THREE.Group(); g.name = 'foto-riquadri-' + foto.id;
  const dir = base + (foto.dir || '');
  const pan = ortofotoUna({ ...foto, ...foto.panoramica, id: foto.id + '-panoramica' }, terreno, dir, { ...opz, alza: 0.4 });
  g.add(pan);
  const tiles = foto.riquadri.map((r, n) => {
    const m = ortofotoUna({ ...foto, file: r.file, box: r.box, id: `${foto.id}-${n}` }, terreno, dir, { ...opz, alza: 0.5, passo: 4, pigra: true });
    m.renderOrder = 6; m.visible = false; g.add(m);
    return { m, cx: (r.box[0] + r.box[2]) / 2, cy: (r.box[1] + r.box[3]) / 2, mezzo: Math.hypot(r.box[2] - r.box[0], r.box[3] - r.box[1]) / 2 };
  });
  const sporca = () => g.userData.sporca && g.userData.sporca();
  pan.userData.sporca = sporca;
  const prima = pan.onBeforeRender;
  pan.onBeforeRender = (renderer, scene, camera) => {
    prima(renderer, scene, camera);
    const p = camera.position;
    for (const t of tiles) {
      const vicino = Math.hypot(p.x - t.cx, p.y - t.cy) - t.mezzo < RAGGIO;
      if (vicino && !t.m.visible) { t.m.visible = true; t.m.userData.carica(sporca); }
      else if (!vicino && t.m.visible) { t.m.visible = false; t.m.userData.libera(); }
    }
  };
  g.userData.pick = pan.userData.pick;
  return g;
}

function ortofotoUna(foto, terreno, base, { alza = 0.45, passo = 5, pigra = false } = {}) {
  const [x0, y0, x1, y1] = foto.box;
  const nx = Math.ceil((x1 - x0) / passo) + 1, ny = Math.ceil((y1 - y0) / passo) + 1;
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = Math.min(x1, x0 + i * passo), y = Math.min(y1, y0 + j * passo);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = terreno.z(x, y) + alza;
    uv[k * 2] = (x - x0) / (x1 - x0); uv[k * 2 + 1] = (y - y0) / (y1 - y0);
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0x222222 });
  if (pigra) mat.visible = false;                        // riquadro HD: si vede solo a texture caricata (sotto c'è la panoramica)
  const m = new THREE.Mesh(g, mat); m.name = 'ortofoto-' + foto.id; m.renderOrder = 5;
  m.userData.pick = () => ({ livello: 'Foto aerea', elemento: `${foto.fonte}, ${foto.data}`, risoluzione: foto.risoluzione_m + ' m' });
  let caricata = false, gen = 0;
  m.userData.carica = (dopo) => {
    if (caricata) return; caricata = true; const mia = ++gen;
    new THREE.TextureLoader().load(base + foto.file, (t) => {
      if (mia !== gen) { t.dispose(); return; }            // liberata nel frattempo
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.map = t; mat.color.set(0xffffff); mat.visible = true; mat.needsUpdate = true; dopo && dopo();
    });
  };
  // rev. 18: i riquadri del mosaico HD si liberano quando la camera si allontana
  m.userData.libera = () => {
    gen++; caricata = false;
    if (mat.map) { mat.map.dispose(); mat.map = null; mat.color.set(0x222222); mat.needsUpdate = true; }
    if (pigra) mat.visible = false;
  };
  if (foto.locale) m.userData.pick = () => ({ livello: 'Foto aerea', elemento: foto.fonte, risoluzione: foto.risoluzione_m + ' m' });
  if (!pigra) m.onBeforeRender = () => m.userData.carica(m.userData.sporca);
  return m;
}
