// Elementi informativi della pista: linea dei settori, tacche di distanza, etichette di curve, landmark, partenza.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SETTORI, col, materiale } from './stile.js';
import { unisci, cercaInfo, mesh } from './geom.js';

// fascia colorata lungo l'asse, divisa per settori (larga 0,8 m, poco sopra la pista)
// bordi (facoltativo): {sinistra, destra} per campione -> la linea sta al centro della pista di quella versione
export function settori(circuito, terreno, bordi = null, alza = null) {
  const A = circuito.asse.punti, passo = circuito.asse.passo_m, parti = [];
  const P = A.map((p, i) => {
    if (!bordi) return p;
    const q = A[(i + 1) % A.length], r = A[(i - 1 + A.length) % A.length], tx = q[0] - r[0], ty = q[1] - r[1], l = Math.hypot(tx, ty) || 1;
    const m = (bordi.destra[i] - bordi.sinistra[i]) / 2;           // + = verso destra
    return [p[0] + ty / l * m, p[1] - tx / l * m, p[2]];
  });
  for (const st of circuito.settori) {
    const pos = [];
    const i0 = Math.round(st.da / passo), i1 = Math.min(P.length, Math.round(st.a / passo));
    for (let i = i0; i < i1; i++) {
      const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d * 0.15, ny = dx / d * 0.15;
      const ta = terreno.z(a[0], a[1]), tb = terreno.z(b[0], b[1]);
      const za = Math.max(a[2], ta) + 0.14 + (alza && a[2] - ta < 1 ? alza(a[0], a[1]) : 0), zb = Math.max(b[2], tb) + 0.14 + (alza && b[2] - tb < 1 ? alza(b[0], b[1]) : 0);
      pos.push(a[0] + nx, a[1] + ny, za, a[0] - nx, a[1] - ny, za, b[0] - nx, b[1] - ny, zb, a[0] + nx, a[1] + ny, za, b[0] - nx, b[1] - ny, zb, b[0] + nx, b[1] + ny, zb);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parti.push({ g, info: { livello: 'Settori', settore: st.n, da: st.da + ' m', a: Math.round(st.a) + ' m' }, colore: col(SETTORI[(st.n - 1) % 3]) });
  }
  const { geo, tabella } = unisci(parti);
  return mesh(geo, materiale({ side: THREE.DoubleSide }), 'settori', (f) => cercaInfo(tabella, f));
}

function etichetta(html, classe, x, y, z, suClic) {
  const el = document.createElement('div'); el.className = classe; el.innerHTML = html;
  if (suClic) { el.style.pointerEvents = 'auto'; el.addEventListener('click', (e) => { e.stopPropagation(); suClic(); }); }
  const o = new CSS2DObject(el); o.position.set(x, y, z); return o;
}

export function etichetteCurve(circuito, suClic) {
  const g = new THREE.Group(); g.name = 'etichette-curve';
  for (const c of circuito.curve) g.add(etichetta(`<span class="num">${c.numero}</span>${c.nome}`, 'etc-curva', c.xy[0], c.xy[1], c.z + 7, () => suClic(c)));
  const p = circuito.asse.punti[0];
  const sp = circuito.partenza?.linea_partenza_s;
  if (sp == null || Math.abs(sp % circuito.lunghezza_m) < 1) g.add(etichetta('START / FINISH', 'etc-partenza', p[0], p[1], p[2] + 9));
  else {                                                            // linea di partenza separata dal traguardo
    const q = circuito.asse.punti[Math.round(sp / circuito.asse.passo_m) % circuito.asse.punti.length];
    g.add(etichetta('FINISH', 'etc-partenza', p[0], p[1], p[2] + 9), etichetta('START', 'etc-partenza', q[0], q[1], q[2] + 12));
  }
  return g;
}

export function etichetteLandmark(circuito, terreno) {
  const g = new THREE.Group(); g.name = 'etichette-landmark';
  for (const l of circuito.landmark) {
    if (l.etichetta === false || l.modello?.etichetta === false) continue;                            // 09-11: edifici fedeli ma non segnati sulla mappa
    const z = terreno.z(l.xy[0], l.xy[1]) + Math.max(8, l.altezza_max + 4);
    g.add(etichetta('★ ' + l.nome.split(' (')[0], 'etc-lm', l.xy[0], l.xy[1], z));
  }
  return g;
}

export function tacche(circuito, ogni = 250) {
  const g = new THREE.Group(); g.name = 'tacche';
  const P = circuito.asse.punti, passo = circuito.asse.passo_m;
  for (let s = ogni; s < circuito.lunghezza_m; s += ogni) {
    const p = P[Math.round(s / passo) % P.length];
    g.add(etichetta(`${(s / 1000).toFixed(2)} km`, 'etc-s', p[0], p[1], p[2] + 2.5));
  }
  return g;
}

// riferimento: la linea disegnata sullo screenshot (punti)
export function puntiRiferimento(punti, terreno, colore = '#ff8a00') {
  const pos = new Float32Array(punti.length * 3);
  punti.forEach(([x, y], i) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = terreno.z(x, y) + 0.6; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: colore, size: 3, sizeAttenuation: false }));
  m.name = 'linea-disegnata'; return m;
}
