// rev. 17 (Gabriele 12-11): fari per la modalità notte. Nel sistema dell'auto (x avanti, y in alto, z a destra).
// 21-11 (Gabriele: «si vedono i globi di luce intorno ai fari, bruttissimo»): via i quattro dischi grandi (0,85 m davanti,
// 0,45 m dietro) sempre rivolti alla camera, che sporgevano dalla sagoma e col bagliore Ultra diventavano palle di luce.
// - giocatore: un faro vero (SpotLight, senza ombre) che illumina la strada davanti, con il calo delle piste voxel;
// - avversari: un fascio finto sull'asfalto (piano additivo) — costa quasi niente e si vede da lontano;
// - tutti: davanti un riflesso piccolo che si vede solo guardando l'auto di fronte (specchietto, telecamera TV,
//   doppiati); dietro i fanali del modello accesi (AutoLowPoly.luciPosizione) e un riflesso rosso a terra, più largo in
//   frenata, come sulle piste voxel.
import * as THREE from 'three';

let _bagliore = null, _fascio = null, _rosso = null;
/** riflesso del faro: nucleo stretto e coda corta (niente disco morbido) */
const bagliore = () => {
  if (_bagliore) return _bagliore;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.12, 'rgba(255,255,255,0.85)'); r.addColorStop(0.35, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (_bagliore = new THREE.CanvasTexture(c));
};
/** riflesso rosso dei fanali sull'asfalto (come glowTexture del voxel) */
const rosso = () => {
  if (_rosso) return _rosso;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.4, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (_rosso = new THREE.CanvasTexture(c));
};
const fascio = () => {
  if (_fascio) return _fascio;
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
  for (let y = 0; y < 256; y++) {                                      // y = 0 lontano, 255 vicino all'auto
    const t = y / 255, a = Math.pow(t, 1.6) * 0.9, w = 10 + (1 - t) * 22;
    const lg = g.createLinearGradient(32 - w, 0, 32 + w, 0); lg.addColorStop(0, 'rgba(255,240,215,0)'); lg.addColorStop(0.5, `rgba(255,240,215,${a})`); lg.addColorStop(1, 'rgba(255,240,215,0)');
    g.fillStyle = lg; g.fillRect(0, y, 64, 1);
  }
  return (_fascio = new THREE.CanvasTexture(c));
};

const _p = new THREE.Vector3(), _c = new THREE.Vector3(), _a = new THREE.Vector3();
const OPACITA_FARO = 0.95;
/** il riflesso del faro si accende solo se la camera sta davanti all'auto (asse x del gruppo dei fari) */
function soloDiFronte(renderer, scene, camera) {
  this.getWorldPosition(_p);
  _c.setFromMatrixPosition(camera.matrixWorld).sub(_p);
  const d = _c.length(); if (d < 1e-3) { this.material.opacity = 0; return; }
  _a.setFromMatrixColumn(this.parent.matrixWorld, 0).normalize();
  const k = THREE.MathUtils.smoothstep(_a.dot(_c) / d, 0.25, 0.85);
  this.material.opacity = OPACITA_FARO * k;
}

/** aggiunge i fari al gruppo dell'auto (car = stato fisico, per la frenata); restituisce il gruppo (spento: visible = false) */
export function aggiungiFari(visual, spec, giocatore, car = null) {
  const g = new THREE.Group(); g.name = 'fari'; g.visible = false;
  const L = spec.halfL || 2.3, W = (spec.halfW || 1.0) * 0.72;
  for (const sg of [-1, 1]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bagliore(), color: 0xfff4e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    s.scale.setScalar(0.38); s.position.set(L + 0.03, 0.6, sg * W); s.onBeforeRender = soloDiFronte; g.add(s);
  }
  // riflesso rosso dei fanali sull'asfalto, dietro l'auto
  const rifl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: rosso(), color: 0xff2010, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  rifl.position.set(-L - 0.5, 0.1, 0); rifl.renderOrder = 3;
  if (car) rifl.onBeforeRender = function () { const br = car.brake > 0.1 || car.gear === -1; this.scale.setScalar(br ? 1.4 : 1); this.material.opacity = br ? 0.45 : 0.28; };
  g.add(rifl);
  if (giocatore) {
    // 21-11: calo 1,0 come i fari delle piste voxel (env.js: con 1,3 un'auto a 5 m prendeva molta più luce della strada
    // a 30 m, riflessi forti sull'auto davanti); la strada a 30 m resta illuminata come prima (260/30^1,3 ≈ 95/30)
    const sp = new THREE.SpotLight(0xfff1dc, 95, 120, 0.46, 0.6, 1.0);
    sp.position.set(L - 0.2, 0.75, 0); sp.target.position.set(L + 24, -0.8, 0); sp.castShadow = false;
    g.add(sp, sp.target);
  } else {
    const piano = new THREE.Mesh(new THREE.PlaneGeometry(7, 20).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2),   // lontano verso +x (avanti)
      new THREE.MeshBasicMaterial({ map: fascio(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    piano.position.set(L + 10, 0.12, 0); piano.renderOrder = 3; g.add(piano);
  }
  visual.group.add(g);
  return g;
}
