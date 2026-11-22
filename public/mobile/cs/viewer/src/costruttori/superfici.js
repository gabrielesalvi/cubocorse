// Superfici piane appoggiate al terreno (asfalto, erba, segnaletica) e superfici in rilievo (marciapiedi).
import * as THREE from 'three';
import { forma, unisci, cercaInfo, mesh, suddividi } from './geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { col, materiale } from './stile.js';

// poligoni: [{anello, buchi, ...props}] ; colore: stringa o funzione(props) ; quota: terreno + scarto
// alza (facoltativo): funzione (x, y) -> metri in più (pendenza trasversale di progetto)
export function superficie(poligoni, { terreno, colore, scarto = 0.05, nome, info = () => ({}), passo = 6, lato = 6, alza = null }) {
  const parti = [];
  for (const p of poligoni) {
    const g0 = new THREE.ShapeGeometry(forma(p, passo)), g = lato ? suddividi(g0, lato) : g0;
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) { const x = a.getX(i), y = a.getY(i); a.setZ(i, terreno.z(x, y) + scarto + (alza ? alza(x, y) : 0)); }
    parti.push({ g, info: { livello: nome, ...info(p) }, colore: col(typeof colore === 'function' ? colore(p) : colore) });
  }
  if (!parti.length) return new THREE.Group();
  const { geo, tabella } = unisci(parti);
  const mat = materiale({ polygonOffset: true, polygonOffsetFactor: -scarto * 20, polygonOffsetUnits: -scarto * 20 });
  return mesh(geo, mat, nome, (f) => cercaInfo(tabella, f));
}

export function rilievo(poligoni, { terreno, colore, altezza = 0.15, scarto = 0.04, nome, info = () => ({}) }) {
  const parti = [];
  for (const p of poligoni) {
    const g = new THREE.ExtrudeGeometry(forma(p, 4), { depth: altezza, bevelEnabled: false });
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) a.setZ(i, terreno.z(a.getX(i), a.getY(i)) + scarto + a.getZ(i));
    parti.push({ g, info: { livello: nome, ...info(p) }, colore: col(colore) });
  }
  if (!parti.length) return new THREE.Group();
  const { geo, tabella } = unisci(parti);
  return mesh(geo, materiale(), nome, (f) => cercaInfo(tabella, f));
}

// rev. 10: pavimentazione disegnata (sagrato): poligoni colorati appoggiati a terreno + rilievo. Un piano per colore,
// ognuno 5 mm sopra il precedente nell'ordine di `strati` (fondo prima, decori dopo): se i pezzi si sovrappongono non
// "sfarfallano". Le mesh si chiamano tutte `nome` (la guida ci riconosce il materiale).
export function pavimento(livello, { terreno, colori, nome = 'Pavimento', strati = ['cotto', 'pietra', 'pietra_chiara', 'cordolo_pietra', 'bianco'], info = (p) => ({ elemento: p.colore }) }) {
  const g = new THREE.Group(); g.name = nome;
  const base = (livello.rilievo ?? 0.15) + 0.08,   // sopra il marciapiede (scarto 0,04 + altezza), con margine per la pendenza
    ordine = (c) => { const i = strati.indexOf(c); return i < 0 ? strati.length : i; };
  const gruppi = new Map();
  for (const p of livello.poligoni || []) { const k = ordine(p.colore); if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(p); }
  for (const [k, pol] of [...gruppi.entries()].sort((a, b) => a[0] - b[0]))
    g.add(superficie(pol, { terreno, colore: (p) => colori[p.colore] || colori.pietra, scarto: base + 0.005 * k, nome, passo: 3, lato: 3, info }));
  return g;
}

// rev. 11 ter (Gabriele 10-11, screen 40-42): pavimenti di via Roma e della piazza del castello come texture del terreno.
// Autobloccanti grigi a correre con masselli rossi, cotto e scuri sparsi; ciclabile in asfalto rosso. Ogni poligono ha
// 'quota': 'marciapiede' (sopra il marciapiede rialzato) o 'terra' (vie di fuga e terreno accanto alla pista della B).
let _texPav = null;
function texturePavimenti() {
  if (_texPav) return _texPav;
  const T = 4, N = 512, k = N / T;                          // 4 m per piastrella di texture
  const mk = (disegna) => { const c = document.createElement('canvas'); c.width = c.height = N; disegna(c.getContext('2d')); const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  let seme = 7; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  const grigi = ['#bdb5a9', '#c6beb2', '#b3aca1', '#cfc8bc', '#c1b9ae'];
  const auto = mk((g) => {
    g.fillStyle = '#8f877c'; g.fillRect(0, 0, N, N);
    const L = 0.4 * k, H = 0.2 * k, gap = 2;
    for (let r = 0; r * H < N; r++) for (let c = -1; c * L < N; c++) {
      const x = c * L + (r % 2 ? L / 2 : 0), y = r * H, u = rnd();
      g.fillStyle = u < 0.8 ? grigi[Math.floor(rnd() * grigi.length)] : u < 0.9 ? '#8f4535' : u < 0.97 ? '#ad6249' : '#6f5a4f';
      g.fillRect(x + gap / 2, y + gap / 2, L - gap, H - gap);
    }
  });
  const rossa = mk((g) => {
    g.fillStyle = '#a5473a'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'; g.fillRect(rnd() * N, rnd() * N, 2, 2); }
  });
  return (_texPav = { autobloccanti: auto, ciclabile_rossa: rossa });
}
export function pavimentoTexture(livello, { terreno, alza = null, nome = 'Pavimenti di via Roma' }) {
  const tex = texturePavimenti(), g = new THREE.Group(); g.name = nome;
  const gruppi = new Map();
  for (const p of livello.poligoni || []) { const k = p.tipo + '|' + p.quota; if (!gruppi.has(k)) gruppi.set(k, []); gruppi.get(k).push(p); }
  for (const [k, pol] of gruppi) {
    const [tipo, quota] = k.split('|'), sopra = quota === 'marciapiede' ? 0.205 : 0.078;
    const geos = [];
    for (const p of pol) {
      const g0 = suddividi(new THREE.ShapeGeometry(forma(p, 3)), 3), a = g0.attributes.position, uv = new Float32Array(a.count * 2);
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i);
        a.setZ(i, terreno.z(x, y) + sopra + (quota === 'terra' && alza ? alza(x, y) : 0));
        uv[i * 2] = y / 4; uv[i * 2 + 1] = x / 4;              // file di masselli lungo via Roma (nord-sud)
      }
      g0.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g0.deleteAttribute('normal'); geos.push(g0);
    }
    const geo = mergeGeometries(geos.map((q) => q.index ? q.toNonIndexed() : q)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex[tipo] || tex.autobloccanti, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.name = nome; m.userData.pick = () => ({ livello: nome, elemento: tipo === 'ciclabile_rossa' ? 'ciclabile in asfalto rosso' : 'autobloccanti grigi e rossi' });
    g.add(m);
  }
  return g;
}

// rev. 11 ter: cordoli verdi della ciclabile di via Martiri (screen 20-29), rialzati, verdi con i bordi gialli. Solo A.
export function cordoliCiclabile(livello, { terreno, nome = 'Cordoli della ciclabile' }) {
  const g = new THREE.Group(), h = livello.rilievo ?? 0.12; g.name = nome;
  const verdi = livello.poligoni.filter((p) => p.colore !== 'giallo'), gialli = livello.poligoni.filter((p) => p.colore === 'giallo');
  if (verdi.length) g.add(rilievo(verdi, { terreno, colore: '#5db896', altezza: h, nome }));
  if (gialli.length) g.add(rilievo(gialli, { terreno, colore: '#e3b23c', altezza: h + 0.006, nome }));
  return g;
}
