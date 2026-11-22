// rev. 14: arredi messi nell'editor (livello 'arredi' della B): maxischermi per il pubblico e pannelli pubblicitari su pareti.
// elemento = { id, classe: 'maxischermo' | 'pannello', punti: [[x, y]], rot (gradi, verso cui guarda: 0 = +x, antiorario),
//              larghezza, altezza (m), quota (m da terra: bordo basso dello schermo / centro del pannello), grafica, testo }
// - maxischermo: punti[0] = centro a terra; due tralicci, schermo LED 16:9 con l'immagine della diretta;
// - pannello: punti[0] = punto della parete cliccato; il pannello sta 4 cm davanti alla parete, rivolto come la sua normale.
// Le grafiche sono inventate (nessun marchio vero), disegnate su canvas.
import * as THREE from 'three';

export const FORMATI = {
  'orizzontale-grande': { nome: 'Orizzontale 6 × 3 m', larghezza: 6, altezza: 3 },
  'orizzontale-piccolo': { nome: 'Orizzontale 3 × 2 m', larghezza: 3, altezza: 2 },
  'verticale-grande': { nome: 'Verticale 2 × 3 m', larghezza: 2, altezza: 3 },
  'verticale-piccolo': { nome: 'Verticale 1,4 × 2 m', larghezza: 1.4, altezza: 2 },
};
export const SCHERMI = { piccolo: { nome: 'Piccolo 6 × 3,4 m', larghezza: 6 }, grande: { nome: 'Grande 9 × 5 m', larghezza: 9 } };
export const GRAFICHE = [
  { nome: 'Gran Premio di Roncadelle', fondo: '#c8102e', testo: '#ffffff', righe: ['GRAN PREMIO', 'DI RONCADELLE'], segno: 'scacchi' },
  { nome: 'Pneumatici Falco', fondo: '#ffd100', testo: '#111111', righe: ['PNEUMATICI', 'FALCO'], segno: 'gomma' },
  { nome: 'Caffè Castello', fondo: '#3b2417', testo: '#f3e2c4', righe: ['CAFFÈ', 'CASTELLO'], segno: 'tazza' },
  { nome: 'Officina Moro', fondo: '#0b4ea2', testo: '#ffffff', righe: ['OFFICINA', 'MORO'], segno: 'strisce' },
  { nome: 'Radio Pianura 101', fondo: '#5b2a86', testo: '#ffffff', righe: ['RADIO', 'PIANURA 101'], segno: 'onde' },
  { nome: 'Acqua del Mella', fondo: '#e8f4fb', testo: '#0a5c8a', righe: ['ACQUA', 'DEL MELLA'], segno: 'goccia' },
  { nome: 'Testo libero', fondo: '#1d1d1d', testo: '#ffffff', righe: null, segno: null },
];

const TEX = new Map();
/** texture della grafica k per un pannello largo w e alto h (m) */
export function texturePannello(k, w, h, testo = '') {
  const G = GRAFICHE[k] || GRAFICHE[0], asp = Math.max(0.3, Math.min(4, w / h)), chiave = `${k}|${asp.toFixed(2)}|${G.righe ? '' : testo}`;
  if (TEX.has(chiave)) return TEX.get(chiave);
  const W = asp >= 1 ? 1024 : Math.round(1024 * asp), H = asp >= 1 ? Math.round(1024 / asp) : 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  c.fillStyle = G.fondo; c.fillRect(0, 0, W, H);
  const righe = G.righe || (testo || 'Il tuo testo').toUpperCase().split(/\s*\|\s*|\n/).slice(0, 3);
  const vert = H > W, m = Math.min(W, H);
  // segno grafico: a sinistra (orizzontale) o in alto (verticale)
  const sx = vert ? W / 2 : H * 0.55, sy = vert ? H * 0.27 : H / 2, sr = m * (vert ? 0.3 : 0.32);
  c.save(); c.translate(sx, sy); disegnaSegno(c, G, sr, W, H, vert); c.restore();
  // testo
  c.fillStyle = G.testo; c.textAlign = 'center'; c.textBaseline = 'middle';
  const x0 = G.segno ? (vert ? 0 : H * 1.05) : 0, ww = W - x0, cy = vert && G.segno ? H * 0.68 : H / 2, hh = vert && G.segno ? H * 0.5 : H;
  let fs = Math.min(hh / (righe.length * 1.25), 400);
  c.font = `900 ${fs}px "Arial Black", Arial, sans-serif`;
  const larga = Math.max(...righe.map((r) => c.measureText(r).width));
  if (larga > ww * 0.86) { fs *= (ww * 0.86) / larga; c.font = `900 ${fs}px "Arial Black", Arial, sans-serif`; }
  righe.forEach((r, i) => c.fillText(r, x0 + ww / 2, cy + (i - (righe.length - 1) / 2) * fs * 1.12));
  // cornice sottile
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = m * 0.015; c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, W - c.lineWidth, H - c.lineWidth);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  TEX.set(chiave, t); return t;
}
function disegnaSegno(c, G, r, W, H, vert) {
  c.fillStyle = G.testo; c.strokeStyle = G.testo;
  switch (G.segno) {
    case 'scacchi': { const n = 6, l = (2 * r) / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? G.testo : '#111'; c.fillRect(-r + i * l, -r + j * l, l, l); } break; }
    case 'gomma': c.fillStyle = '#111'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.fillStyle = '#9a9a9a'; c.beginPath(); c.arc(0, 0, r * 0.55, 0, 7); c.fill(); c.fillStyle = '#111';
      for (let k = 0; k < 5; k++) { c.save(); c.rotate(k * 1.2566); c.fillRect(-r * 0.06, -r * 0.5, r * 0.12, r * 0.45); c.restore(); } break;
    case 'tazza': c.lineWidth = r * 0.12; c.beginPath(); c.moveTo(-r * 0.6, -r * 0.2); c.lineTo(-r * 0.45, r * 0.6); c.lineTo(r * 0.45, r * 0.6); c.lineTo(r * 0.6, -r * 0.2); c.closePath(); c.fill();
      c.beginPath(); c.arc(r * 0.68, r * 0.15, r * 0.22, -1.4, 1.4); c.stroke();
      for (const dx of [-0.25, 0.05, 0.35]) { c.beginPath(); c.moveTo(r * dx, -r * 0.35); c.bezierCurveTo(r * (dx + 0.15), -r * 0.55, r * (dx - 0.15), -r * 0.7, r * dx, -r * 0.9); c.stroke(); } break;
    case 'strisce': c.fillStyle = '#ffffff'; for (let k = 0; k < 3; k++) { c.save(); c.translate(-r * 0.5 + k * r * 0.5, 0); c.transform(1, 0, -0.5, 1, 0, 0); c.fillRect(-r * 0.12, -r, r * 0.24, 2 * r); c.restore(); }
      c.fillStyle = '#e30613'; c.save(); c.translate(r, 0); c.transform(1, 0, -0.5, 1, 0, 0); c.fillRect(-r * 0.12, -r, r * 0.24, 2 * r); c.restore(); break;
    case 'onde': c.lineWidth = r * 0.12; c.fillStyle = G.testo; c.beginPath(); c.arc(-r * 0.6, r * 0.2, r * 0.18, 0, 7); c.fill();
      for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(-r * 0.6, r * 0.2, r * 0.25 + k * r * 0.33, -0.9, 0.9); c.stroke(); } break;
    case 'goccia': c.fillStyle = '#2a9fd8'; c.beginPath(); c.moveTo(0, -r); c.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.75, r * 0.85, 0, r * 0.85); c.bezierCurveTo(-r * 0.75, r * 0.85, -r * 0.9, -r * 0.1, 0, -r); c.fill(); break;
    default: break;
  }
}

/** immagine della diretta sul maxischermo: tracciato, LIVE, classifica (nomi inventati) */
let TEX_DIRETTA = null;
function textureDiretta(asse) {
  if (TEX_DIRETTA) return TEX_DIRETTA;
  const W = 1024, H = 576, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d');
  const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0e1a2b'); gr.addColorStop(1, '#05080e'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
  if (asse?.length > 10) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of asse) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const k = Math.min(560 / (x1 - x0), 470 / (y1 - y0)), ox = 330 - ((x0 + x1) / 2) * k, oy = 300 + ((y0 + y1) / 2) * k;
    c.lineJoin = 'round'; c.beginPath(); asse.forEach(([x, y], i) => (i ? c.lineTo(ox + x * k, oy - y * k) : c.moveTo(ox + x * k, oy - y * k))); c.closePath();
    c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.stroke(); c.strokeStyle = '#e10600'; c.lineWidth = 4; c.stroke();
    for (const [f, col] of [[0.12, '#ffd100'], [0.37, '#00a0e9'], [0.61, '#ffffff']]) { const [x, y] = asse[Math.floor(f * asse.length)]; c.fillStyle = col; c.beginPath(); c.arc(ox + x * k, oy - y * k, 9, 0, 7); c.fill(); }
  }
  c.fillStyle = '#e10600'; c.fillRect(24, 24, 120, 48); c.fillStyle = '#fff'; c.font = '900 34px Arial'; c.textBaseline = 'middle'; c.fillText('LIVE', 44, 49);
  c.font = '700 26px Arial'; c.fillText('RONCACIRCUIT · GIRO 7/20', 164, 49);
  const nomi = ['ROSSI', 'BIANCHI', 'FERRARI', 'COLOMBO', 'RICCI', 'MARINO', 'GRECO', 'BRUNO'];
  c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(W - 300, 24, 276, 40 * nomi.length + 16);
  nomi.forEach((n, i) => { c.fillStyle = i < 3 ? '#ffd100' : '#ffffff'; c.font = '700 26px Arial'; c.fillText(`${i + 1}`, W - 284, 52 + i * 40); c.fillText(n, W - 244, 52 + i * 40); c.fillStyle = '#9fb3c8'; c.font = '500 22px Arial'; c.fillText(i ? `+${(i * 1.37).toFixed(1)}` : 'LEADER', W - 120, 52 + i * 40); });
  TEX_DIRETTA = new THREE.CanvasTexture(cv); TEX_DIRETTA.colorSpace = THREE.SRGBColorSpace; TEX_DIRETTA.anisotropy = 4;
  return TEX_DIRETTA;
}

const M = {};
const mat = (k, f) => (M[k] ||= f());
const BOX = new THREE.BoxGeometry(1, 1, 1);
/** piano w × h rivolto verso +y locale, con l'alto dell'immagine verso +z */
const faccia = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(Math.PI / 2).rotateZ(Math.PI);

/** misure di un elemento con i valori predefiniti */
export function misure(e) {
  if (e.classe === 'maxischermo') { const w = e.larghezza || 6; return { w, h: e.altezza || +(w * 9 / 16).toFixed(2), quota: e.quota ?? 3 }; }
  const F = FORMATI[e.formato] || FORMATI['orizzontale-grande'];
  return { w: e.larghezza || F.larghezza, h: e.altezza || F.altezza, quota: e.quota ?? 2.5 };
}

export function arredo(e, terreno, { asse = null } = {}) {
  const g = new THREE.Group(), [x, y] = e.punti[0], z = terreno.z(x, y), a = THREE.MathUtils.degToRad(e.rot || 0), { w, h, quota } = misure(e);
  g.position.set(x, y, z); g.rotation.z = a - Math.PI / 2;      // locale: x lungo la faccia, y verso cui guarda
  g.userData.arredo = e.id; g.name = e.classe === 'maxischermo' ? 'Maxischermo' : 'Pannello pubblicitario';
  const pezzo = (geo, m, sx, sy, sz, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx, sy, sz); o.position.set(px, py, pz); o.name = g.name; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const pick = () => ({ livello: 'Arredi', elemento: g.name, misure: `${w} × ${h} m`, quota_m: quota, ...(e.classe === 'pannello' ? { grafica: (GRAFICHE[e.grafica] || GRAFICHE[0]).nome } : {}) });
  if (e.classe === 'maxischermo') {
    const grigio = mat('traliccio', () => new THREE.MeshLambertMaterial({ color: '#8d9399' })), nero = mat('nero', () => new THREE.MeshLambertMaterial({ color: '#1b1d20' }));
    const cemento = mat('zavorra', () => new THREE.MeshLambertMaterial({ color: '#a9a7a0' }));
    const schermo = new THREE.MeshBasicMaterial({ map: textureDiretta(asse), toneMapped: false });
    const top = quota + h + 0.4;
    for (const s of [-1, 1]) {
      const lx = s * (w / 2 - 0.25);
      for (const [dx, dy] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) pezzo(BOX, grigio, 0.06, 0.06, top, lx + dx, -0.6 + dy, top / 2);   // traliccio: 4 montanti
      for (let hz = 0.6; hz < top; hz += 1.2) { pezzo(BOX, grigio, 0.46, 0.04, 0.04, lx, -0.8, hz); pezzo(BOX, grigio, 0.46, 0.04, 0.04, lx, -0.4, hz); pezzo(BOX, grigio, 0.04, 0.46, 0.04, lx - 0.2, -0.6, hz); pezzo(BOX, grigio, 0.04, 0.46, 0.04, lx + 0.2, -0.6, hz); }
      pezzo(BOX, cemento, 1.2, 2.2, 0.6, lx, -0.6, 0.3);                                                         // zavorra
    }
    pezzo(BOX, grigio, w, 0.08, 0.08, 0, -0.6, top);                                                              // trave in cima
    pezzo(BOX, nero, w + 0.3, 0.45, h + 0.3, 0, -0.1, quota + h / 2);                                             // cassa dello schermo
    const s = new THREE.Mesh(faccia(w, h), schermo); s.position.set(0, 0.13, quota + h / 2); s.name = g.name; g.add(s);
    g.children.forEach((o) => (o.userData.pick = pick));
  } else {
    const telaio = mat('telaio', () => new THREE.MeshLambertMaterial({ color: '#d9dadc' }));
    const zc = quota;        // centro del pannello sopra il terreno nel punto cliccato
    pezzo(BOX, telaio, w + 0.1, 0.06, h + 0.1, 0, 0.04, zc);
    const t = texturePannello(e.grafica ?? 0, w, h, e.testo);
    const fronte = new THREE.Mesh(faccia(w, h), new THREE.MeshLambertMaterial({ map: t }));
    fronte.position.set(0, 0.075, zc); fronte.name = g.name; fronte.receiveShadow = true; g.add(fronte);
    g.children.forEach((o) => (o.userData.pick = pick));
  }
  return g;
}

export function arredi(elementi, terreno, opz = {}) {
  const g = new THREE.Group(); g.name = 'Arredi';
  for (const e of elementi || []) if (e.punti?.length) g.add(arredo(e, terreno, opz));
  return g;
}
