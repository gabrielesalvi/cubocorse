// Stile low-poly a facce piatte: colori per superficie e per uso degli edifici. Un solo posto per cambiarli.
import * as THREE from 'three';

export const SUPERFICI = {
  asfalto_pista: '#34373c', asfalto_strada: '#5d6168', asfalto_fuga: '#7a7268', asfalto_box: '#5a5450',
  erba_fuga: '#5c9a45', ghiaia_fuga: '#c8b48c', verde: '#86b56c', parcheggio: '#787c83', campo: '#5fa65a', marciapiede: '#a7a9a8', terreno: '#a9b28c',   // rev. 11: marciapiedi grigi, terreno da giardino (screen di Street View)
};
export const SEGNI = { bianco: '#f4f4f2', nero: '#151515', rosso: '#d22a1e', giallo: '#e8bf2a', tombino: '#2b2a28', caditoia: '#1f1f1e',
  // rev. 10: pavimentazione disegnata del sagrato di San Bernardino (livello 'sagrato')
  cotto: '#a8644a', pietra: '#c9bfae', pietra_chiara: '#ddd6c8', cordolo_pietra: '#bdb5a6' };
// colori del sagrato: quelli di SEGNI, ma il bianco è pietra bianca (un po' più calda della vernice delle strisce)
export const SAGRATO = { ...SEGNI, bianco: '#ecebe6' };
export const BARRIERE = { barriera: { c: '#dedede', h: 1.0 }, transenna: { c: '#f0f0f0', h: 1.1 }, parapetto: { c: '#c4c4c4', h: 1.1 },
  muretto_box: { c: '#ffffff', h: 1.1 }, recinzione: { c: '#5f6e60', h: 1.6 }, cancellata: { c: '#4b524b', h: 1.6 }, rete: { c: '#7d8a7d', h: 1.6 },
  siepe: { c: '#4f7d3f', h: 1.6 }, muretto: { c: '#a29a8c', h: 1.2 }, pneumatici: { c: '#2a2a2a', h: 1.0 },
  // assorbitori (FIA 3501, tipo Tecpro): blocchi da 1 m davanti al muro, cioè dal lato opposto alla pista rispetto alla linea
  assorbitore: { c: '#2f66c8', h: 1.2, sp: 1.0, fuori: true }, varco: { c: '#e7b21c', h: 1.0 } };
export const RETE = { c: '#30363c', opacita: 0.32, palo: '#5b636b' };
export const EDIFICI = {
  residenziale: ['#e6d8c4', '#b9644a'], industriale: ['#cdd0d5', '#9aa1aa'], commerciale: ['#dccdb6', '#8f8f8f'], culto: ['#efe5cf', '#a5513b'],
  sport: ['#d5dde5', '#8d98a3'], municipio: ['#f0dcb4', '#b9644a'], scuola: ['#e8d4b0', '#b9644a'], cultura: ['#ecd7b4', '#b9644a'],
  cinema: ['#ecd7b4', '#b9644a'], biblioteca: ['#ecd7b4', '#b9644a'], agricolo: ['#d8c9a8', '#9c6b4d'], box: ['#f1f1f1', '#ff5a36'],
  distributore: ['#1f5fbf', '#f2f2f2'], pompa: ['#e6e6e6', '#1f5fbf'], tettoia: ['#b9b9b9', '#9a9a9a'], altro: ['#ddd3c4', '#a7735e'],
};
export const LANDMARK = ['#f3c15b', '#c4553b'];
export const SETTORI = ['#ff5050', '#4fc3ff', '#ffd23c'];

export const col = (h) => new THREE.Color(h);
export const materiale = (opz = {}) => new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, ...opz });
