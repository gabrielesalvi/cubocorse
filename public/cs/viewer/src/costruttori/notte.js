// rev. 17 (Gabriele 12-11): modalità notte, per il visualizzatore (anche nell'editor) e per la guida.
// Nella B la luce viene solo dai fari delle auto (guida) e dalle «lucette» del circuito: semafori, maxischermi, box,
// pensiline dei distributori. Nella A in più i lampioni.
// Tutto nel sistema dei dati (z in alto): il gruppo va dentro il gruppo del mondo.
// - ogni sorgente ha un alone a terra (InstancedMesh additivo) e un punto luminoso (Points additivo): costano due chiamate;
// - poche luci vere (PointLight, numero fisso per non ricompilare gli shader) si spostano sulle sorgenti più vicine al
//   punto che si guarda: illuminano davvero asfalto, muri e auto attorno.
import * as THREE from 'three';

const CALDA = '#ffcf8a', FREDDA = '#dfe9ff';

/** sorgenti di luce della versione v: [{ p: [x, y, z], colore, raggio, forza }] */
export function luciNotte(dati, v, { lampioni = null } = {}) {
  const { circuito, comune, contesto, versioni, terreno } = dati, lv = versioni[v].livelli, out = [];
  const z = (x, y) => terreno.z(x, y);
  // lampioni (solo A: nella B non ci sono)
  if (v === 'A') for (const q of lampioni?.userData?.luci || []) out.push({ p: q, colore: CALDA, raggio: 16, forza: 1, tipo: 'lampione' });
  // semafori sopraelevati: lanterne
  for (const e of lv.portali?.elementi || []) if (e.xy) out.push({ p: [e.xy[0], e.xy[1], z(e.xy[0], e.xy[1]) + (e.h_m || 5.5)], colore: '#ffd9a8', raggio: 7, forza: 0.5, tipo: 'semaforo' });
  // maxischermi: luce davanti allo schermo
  for (const e of lv.arredi?.elementi || []) {
    if (e.classe !== 'maxischermo' || !e.punti?.length) continue;
    const a = THREE.MathUtils.degToRad(e.rot || 0), [x, y] = e.punti[0], w = e.larghezza || 6, q = e.quota ?? 3;
    out.push({ p: [x + Math.cos(a) * 3, y + Math.sin(a) * 3, z(x, y) + q + w * 0.28], colore: '#cfe0ff', raggio: 18, forza: 1.2, tipo: 'maxischermo' });
  }
  // box: neon dentro ogni box
  for (const b of comune?.livelli?.box?.volumi || []) {
    const R = b.anello; let cx = 0, cy = 0; for (const p of R) { cx += p[0] / R.length; cy += p[1] / R.length; }
    out.push({ p: [cx, cy, (b.base ?? z(cx, cy)) + 3.6], colore: FREDDA, raggio: 14, forza: 1.4, tipo: 'box' });
  }
  // pensiline dei distributori
  for (const D of circuito.distributori || []) {
    const pens = (contesto.pensiline || []).find((p) => p.id === D.pensilina); if (!pens) continue;
    let cx = 0, cy = 0; for (const p of pens.anello) { cx += p[0] / pens.anello.length; cy += p[1] / pens.anello.length; }
    out.push({ p: [cx, cy, (pens.base ?? z(cx, cy) + 5) - 0.3], colore: FREDDA, raggio: 20, forza: 1.4, tipo: 'distributore' });
  }
  return out;
}

let _tex = null;
function texAlone() {
  if (_tex) return _tex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  _tex = new THREE.CanvasTexture(c); return _tex;
}

export class Notte {
  /** sorgenti = luciNotte(); terreno per appoggiare gli aloni; nLuci = luci vere che si spostano */
  constructor(sorgenti, terreno, { nLuci = 8 } = {}) {
    this.S = sorgenti; this.g = new THREE.Group(); this.g.name = 'notte'; this.g.visible = false;
    const n = sorgenti.length;
    if (n) {
      // aloni a terra
      const geo = new THREE.PlaneGeometry(1, 1), mat = new THREE.MeshBasicMaterial({ map: texAlone(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, vertexColors: false });
      const im = new THREE.InstancedMesh(geo, mat, n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
      sorgenti.forEach((L, i) => {
        const r = L.raggio * 1.6;
        m.compose(p.set(L.p[0], L.p[1], terreno.z(L.p[0], L.p[1]) + 0.2), q, s.set(r, r, 1)); im.setMatrixAt(i, m);
        im.setColorAt(i, c.set(L.colore).multiplyScalar(0.55 * L.forza));
      });
      im.computeBoundingSphere(); im.name = 'Aloni'; im.renderOrder = 3; this.g.add(im);
      // punti luminosi (lampade)
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      sorgenti.forEach((L, i) => { pos.set(L.p, i * 3); c.set(L.colore); col.set([c.r, c.g, c.b], i * 3); });
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.6, map: texAlone(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
      pts.name = 'Lampade'; pts.renderOrder = 4; this.g.add(pts);
    }
    // luci vere, numero fisso
    this.luci = [];
    for (let i = 0; i < nLuci; i++) { const l = new THREE.PointLight(0xffffff, 0, 20, 1.6); l.visible = true; this.luci.push(l); this.g.add(l); }
    this._t = 1;
  }
  accendi(on) { this.g.visible = on; for (const l of this.luci) l.intensity = on ? l.intensity : 0; }
  /** sposta le luci vere sulle sorgenti più vicine al punto (x, y) dei dati */
  aggiorna(x, y, dt = 1) {
    if (!this.g.visible) return;
    this._t += dt; if (this._t < 0.3) return; this._t = 0;
    const ord = this.S.map((L, i) => [Math.hypot(L.p[0] - x, L.p[1] - y), i]).sort((a, b) => a[0] - b[0]);
    this.luci.forEach((l, k) => {
      const e = ord[k]; if (!e || e[0] > 260) { l.intensity = 0; return; }
      const L = this.S[e[1]]; l.position.set(L.p[0], L.p[1], L.p[2] - 0.4); l.color.set(L.colore);
      l.distance = L.raggio * 2.4; l.intensity = 45 * L.forza;
    });
  }
}
