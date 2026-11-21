// rev. 17 (Gabriele 12-11): fari per la modalità notte. Nel sistema dell'auto (x avanti, y in alto, z a destra).
// - giocatore: un faro vero (SpotLight, senza ombre) che illumina la strada davanti;
// - avversari: un fascio finto sull'asfalto (piano additivo) — costa quasi niente e si vede da lontano;
// - tutti: le lampade davanti (bianche) e i fanali dietro (rossi) come sprite luminosi.
import * as THREE from 'three';

let _alone = null, _fascio = null;
const alone = () => {
  if (_alone) return _alone;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return (_alone = new THREE.CanvasTexture(c));
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

/** aggiunge i fari al gruppo dell'auto; restituisce il gruppo dei fari (spento: visible = false) */
export function aggiungiFari(visual, spec, giocatore) {
  const g = new THREE.Group(); g.name = 'fari'; g.visible = false;
  const L = spec.halfL || 2.3, W = (spec.halfW || 1.0) * 0.72;
  const sprite = (col, sz, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: alone(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(sz, sz, sz); s.position.set(x, y, z); g.add(s);
  };
  for (const sg of [-1, 1]) { sprite(0xfff4e0, 0.85, L - 0.1, 0.62, sg * W); sprite(0xff2a1a, 0.45, -L + 0.08, 0.72, sg * W); }
  if (giocatore) {
    const sp = new THREE.SpotLight(0xfff1dc, 260, 120, 0.46, 0.6, 1.3);
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
