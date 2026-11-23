// Edifici generici più dettagliati, nello stile low-poly: non copia ogni casa vera, ma dà il carattere di Roncadelle.
// La tipologia viene dai dati del DBT (uso, tipo, altezza, area, forma) e da dove sta l'edificio:
// - villette e bifamiliari (1-2 piani): tetto a padiglione in coppi, intonaci pastello, persiane, zoccolo grigio;
// - palazzine (3-6 piani): balconi continui, tetto a padiglione o piano, intonaci chiari;
// - case a corte e cascine del nucleo vecchio: tetto a capanna, intonaci caldi o mattone, porticati;
// - capannoni: pannelli prefabbricati grigi, finestre a nastro, portoni, lucernari;
// - negozi e commerciale: piano terra vetrato, fascia dell'insegna (senza scritte);
// - box e accessori: tetto piano o a una falda, porta del garage.
// Vicino alla pista (entro `vicino` m) finestre, persiane e balconi; più lontano solo pareti e tetti.
// Diviso in riquadri da 250 m, così si scarta per inquadratura. Pick: un elemento per edificio.
import * as THREE from 'three';
import { Pezzi, volume, area, pip, rettangolo } from './landmark.js';

// rev. 11 (confronto con gli screen di Street View): a Roncadelle gli intonaci sono più vivi di così (giallo, arancio,
// rosa, rosso) e molte palazzine e case a schiera sono in mattone a vista
const PASTELLI = ['#e9d8b4', '#efe2c6', '#e7c9a8', '#f0e9da', '#e3cfa1', '#ead1c0', '#dcc7a6', '#e8bfa0', '#d9c9b0',
  '#eccf7a', '#e3a86b', '#e8b9a8', '#d9826a', '#f1d9a0', '#e6b483', '#c97a5a'];
const CHIARI = ['#efebe3', '#e6e0d3', '#ede3cf', '#e2d9c8', '#f3efe7', '#dcd4c4', '#e9c9a0', '#dca27a', '#ecd9a6'];
const MATTONI = ['#a95c40', '#b5674a', '#9e5238', '#b97a55'];
const PERSIANE = ['#56704a', '#6b4f3a', '#7b8288', '#4f6650', '#8a5a3c', '#a9a59a'];
const COPPI = ['#b4644a', '#a85d45', '#bd6f52', '#9e5844', '#b76a4e'];
const PANNELLI = ['#c9ccc9', '#b9c0c5', '#d3cfc5', '#c2c6c0', '#aeb6bb'];

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const scegli = (arr, u) => arr[Math.floor(u * arr.length) % arr.length];

/** stile (stessa forma dei dettagli dei landmark) per un edificio generico */
export function stileEdificio(e, { dettaglio = true, vecchio = false } = {}) {
  const a = Math.abs(area(e.anello)), r = rettangolo(e.anello), rett = a / r.A, h = e.h;
  const u = hash(String(e.id || e.anello[0])), u2 = hash('b' + (e.id || '')), u3 = hash('c' + (e.id || ''));
  const tetto = (forma, colore, pend = 0.34) => {
    if (forma === 'padiglione' && !(rett > 0.92 || a < 350)) forma = rett > 0.8 && r.L / r.W > 1.4 ? 'capanna' : 'piano';
    if (forma === 'capanna' && rett < 0.8) forma = a < 350 ? 'padiglione' : 'piano';
    return forma === 'piano' ? { forma, parapetto: 0.5, colore: '#8e8d88' } : { forma, pendenza: pend, colore, passo: 4 };   // 23-11: tetti a 4 m (erano 1,8: falde piane, stessa immagine, come a Brescia)
  };
  const fin = (o) => (dettaglio ? o : undefined);
  const uso = e.uso, tipo = e.tipo;
  // accessori e box
  if (h < 3.6 && a < 70) return { parete: scegli(PASTELLI, u), tetto: u2 < 0.6 ? { forma: 'piano', parapetto: 0.2, colore: '#9a9893' } : tetto('falda', scegli(COPPI, u3), 0.2), garage: fin({ colore: '#707377' }) };
  // commerciale grande e alto (palazzo Demenego, screen 17): facciate vetrate a nastro
  if ((uso === 'commerciale' || uso === 'centro commerciale') && h >= 9) {
    return { parete: '#dfe3e6', zoccolo: { h: 3.6, colore: '#3f6f8e' }, cornice: '#f2f4f5', tetto: { forma: 'piano', parapetto: 0.8, colore: '#8a8984' },
      finestre: fin({ piani: Math.max(1, Math.round(h / 3.4) - 1), interpiano: 3.4, primo: 4.4, larghezza: 3.0, altezza: 2.2, passo: 3.2, colore: '#5d8fb0' }) };
  }
  // capannoni e industriale
  if (uso === 'industriale' || tipo === 'capannone' || (a > 1200 && h < 14 && uso !== 'residenziale')) {
    return { parete: scegli(PANNELLI, u), zoccolo: { h: 1.2, colore: '#9c9f9e' }, cornice: '#8a9196', tetto: { forma: 'piano', parapetto: 0.7, colore: '#7f8285' },
      finestre: fin({ piani: 1, primo: Math.max(2.5, h - 2.6), larghezza: 3.8, altezza: 1.1, passo: 4.4, colore: '#5d7385' }),
      portoni: fin({ colore: '#6b7176' }), lucernari: a > 900 && dettaglio ? { strisce: Math.min(5, Math.floor(r.W / 9)), colore: '#9db0bd' } : undefined };
  }
  // commerciale
  if (uso === 'commerciale' || uso === 'centro commerciale' || uso === 'supermercato' || uso === 'banca') {
    return { parete: scegli(CHIARI, u), zoccolo: { h: 3.4, colore: '#5b7486' }, cornice: scegli(['#c0392b', '#2e6da4', '#3c8d5a', '#d08a2e', '#5d5d66'], u2),
      tetto: { forma: 'piano', parapetto: 0.8, colore: '#8a8984' }, finestre: fin({ piani: Math.max(0, Math.round(h / 3.2) - 1), interpiano: 3.2, primo: 4.2, larghezza: 1.6, altezza: 1.5, passo: 3.2, colore: '#3c4a56' }) };
  }
  // cascine e rustici
  if (uso === 'agricolo' || tipo === 'rurale') {
    const mattone = u2 < 0.4;
    return { parete: mattone ? '#b9744f' : scegli(['#d8c29a', '#cdb68c', '#e0cba3'], u), zoccolo: { h: 0.8, colore: '#a99b85' }, tetto: tetto('capanna', scegli(COPPI, u3), 0.38),
      finestre: fin({ piani: Math.max(1, Math.round(h / 3.3)), interpiano: 3.2, primo: 1.1, larghezza: 0.9, altezza: 1.2, passo: 4.0, colore: '#3a3630', persiane: '#6b4f3a' }),
      porticato: fin(r.L > 14 && h < 9 ? { luci: Math.max(2, Math.floor(r.L / 4.5)) } : undefined) };
  }
  // residenziale (e "altro" di dimensioni da casa)
  const piani = Math.max(1, Math.round(h / 3.0));
  if (piani <= 2 && a < 300) {
    // villetta o bifamiliare
    return { parete: u3 > 0.85 && !vecchio ? scegli(MATTONI, u) : scegli(PASTELLI, u), zoccolo: { h: 0.6, colore: '#a9a69e' }, cornice: u3 < 0.5 ? '#f1ece2' : undefined,
      tetto: tetto(vecchio ? 'capanna' : u2 < 0.75 ? 'padiglione' : 'capanna', scegli(COPPI, u3), 0.34),
      finestre: fin({ piani, interpiano: 2.9, primo: 1.0, larghezza: 1.0, altezza: 1.35, passo: 3.1, colore: '#33383d', persiane: scegli(PERSIANE, u2) }),
      garage: fin(u < 0.35 ? { colore: '#7b7e80' } : undefined) };
  }
  // palazzina
  const tettoPal = vecchio || u2 < 0.7 ? tetto('padiglione', scegli(COPPI, u3), 0.3) : { forma: 'piano', parapetto: 0.9, colore: '#8e8d88' };
  const mattone = !vecchio && u3 > 0.72;
  return { parete: mattone ? scegli(MATTONI, u) : scegli(vecchio ? PASTELLI : CHIARI, u), zoccolo: { h: 0.9, colore: '#9f9b92' }, cornice: '#e9e4d8', tetto: tettoPal,
    finestre: fin({ piani, interpiano: 3.0, primo: 1.0, larghezza: 1.2, altezza: 1.45, passo: 3.3, colore: '#2f353b', persiane: u < 0.5 ? scegli(PERSIANE, u3) : undefined }),
    balconi: fin(!vecchio && piani >= 3 && u3 < 0.75 ? { piani: piani - 1, interpiano: 3.0, colore: '#ebe6dc', parapetto: u < 0.5 ? '#4e5357' : '#d9d3c7' } : undefined) };
}

/** edifici generici; asse = punti dell'asse [[x,y,z]...] per sapere chi è vicino alla pista */
/** nucleo storico approssimato: inviluppo dei landmark del centro, allargato di `margine` m */
export function nucleoStorico(circuito, ids = ['castello', 'san_bernardino', 'municipio', 'aurora', 'oratorio', 'biblioteca'], margine = 70) {
  const P = (circuito.landmark || []).filter((l) => ids.includes(l.id)).map((l) => l.xy);
  if (P.length < 3) return null;
  const c = [P.reduce((a, p) => a + p[0], 0) / P.length, P.reduce((a, p) => a + p[1], 0) / P.length];
  const out = [];
  for (let k = 0; k < 24; k++) {
    const ang = 2 * Math.PI * k / 24, d = [Math.cos(ang), Math.sin(ang)];
    let m = 0; for (const p of P) m = Math.max(m, (p[0] - c[0]) * d[0] + (p[1] - c[1]) * d[1]);
    out.push([c[0] + d[0] * (m + margine), c[1] + d[1] * (m + margine)]);
  }
  return out;
}

export function edificiCitta(edifici, { asse, vicino = 170, lato = 250, nucleo = null } = {}) {
  // distanza dalla pista: celle da 20 m con i punti dell'asse
  const CA = 20, celle = new Map();
  for (const p of asse) { const k = Math.floor(p[0] / CA) * 100003 + Math.floor(p[1] / CA); if (!celle.has(k)) celle.set(k, []); celle.get(k).push(p); }
  const dist = (x, y) => {
    let m = Infinity; const R = Math.ceil(vicino / CA) + 1, cx = Math.floor(x / CA), cy = Math.floor(y / CA);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const p of celle.get((cx + a) * 100003 + cy + b) || []) m = Math.min(m, Math.hypot(p[0] - x, p[1] - y));
    return m;
  };
  // vicini per edificio (finestre nascoste dove le case sono attaccate)
  const CE = 30, indice = new Map(), cen = (e) => { let x = 0, y = 0; for (const p of e.anello) { x += p[0]; y += p[1]; } return [x / e.anello.length, y / e.anello.length]; };
  for (const e of edifici) { const c = cen(e), k = Math.floor(c[0] / CE) * 100003 + Math.floor(c[1] / CE); if (!indice.has(k)) indice.set(k, []); indice.get(k).push(e); }
  const vicini = (x, y) => { const out = [], cx = Math.floor(x / CE), cy = Math.floor(y / CE); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const e of indice.get((cx + a) * 100003 + cy + b) || []) out.push(e); return out; };
  const ctx = {
    esclusioni: [],
    coperto: (x, y, z, self) => vicini(x, y).some((o) => o !== self && o.base + o.h > z + 0.3 && pip(x, y, o.anello)),
    escluso: () => false,
  };
  const riquadri = new Map();
  for (const e of edifici) {
    if (!(e.h > 0.3) || e.anello.length < 3) continue;
    const c = cen(e), d = dist(c[0], c[1]);
    const k = Math.floor(c[0] / lato) * 100003 + Math.floor(c[1] / lato);
    if (!riquadri.has(k)) riquadri.set(k, { P: new Pezzi(), tab: [] });
    const Rq = riquadri.get(k);
    const vecchio = nucleo ? pip(c[0], c[1], nucleo) : false;
    const v = stileEdificio(e, { dettaglio: d < vicino, vecchio });
    Rq.tab.push([Rq.P.p.length / 9, { livello: 'Edificio', uso: e.uso, tipo: e.tipo, h: e.h, base: e.base, id: e.id, fonte: e.fonte }]);
    try {
      const inf = volume(Rq.P, e, v, ctx);
      if (v.portoni) portoni(Rq.P, e, inf, v.portoni);
      if (v.lucernari) for (let i = 0; i < v.lucernari.strisce; i++) {
        const r = inf.r, t = -r.W / 2 + r.W * (i + 1) / (v.lucernari.strisce + 1);
        Rq.P.scatola(r.c[0] + r.v[0] * t, r.c[1] + r.v[1] * t, r.u, r.L - 6, 1.6, inf.z0, inf.z0 + 0.55, new THREE.Color(v.lucernari.colore));
      }
      if (v.porticato) porticato(Rq.P, e, inf, v.porticato);
    } catch { /* forma strana: resta senza dettagli */ }
  }
  const g = new THREE.Group(); g.name = 'edifici';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  for (const { P, tab } of riquadri.values()) {
    if (!P.p.length) continue;
    const m = new THREE.Mesh(P.geometria(), mat);
    m.name = 'edifici-riquadro';
    m.userData.pick = (f) => { let lo = 0, hi = tab.length - 1; while (lo < hi) { const md = (lo + hi + 1) >> 1; if (tab[md][0] <= f) lo = md; else hi = md - 1; } return tab[lo]?.[1]; };
    g.add(m);
  }
  return g;
}

function portoni(P, e, inf, K) {
  const L = inf.lati.filter((l) => l.len > 10).sort((a, b) => b.len - a.len)[0]; if (!L) return;
  const n = Math.max(1, Math.floor(L.len / 15)), k = new THREE.Color(K.colore);
  for (let i = 0; i < n; i++) {
    const s = L.len * (i + 0.5) / n, x = L.p[0] + L.t[0] * s, y = L.p[1] + L.t[1] * s;
    P.pannello(x, y, L.t, L.n, 0.05, 4.2, e.base, e.base + Math.min(5, e.h - 1), k);
  }
}
function porticato(P, e, inf, K) {
  const L = inf.lati.filter((l) => l.len > 10).sort((a, b) => b.len - a.len)[0]; if (!L) return;
  const n = K.luci, luce = (L.len - 2) / n, scuro = new THREE.Color('#2e2a26'), hA = Math.min(3.6, e.h - 0.8);
  for (let i = 0; i < n; i++) {
    const s = 1 + luce * (i + 0.5), x = L.p[0] + L.t[0] * s, y = L.p[1] + L.t[1] * s, rr = luce * 0.36;
    P.pannello(x, y, L.t, L.n, 0.05, luce * 0.72, e.base, e.base + hA - rr, scuro);
    P.arco(x, y, L.t, L.n, 0.05, rr, e.base + hA - rr, scuro);
  }
}

/** dettagli dei campi sportivi: righe bianche, porte o canestri, rete di recinzione */
export function campiSportivi(campi, terreno) {
  const P = new Pezzi(), PR = new Pezzi(), bianco = new THREE.Color('#f2f2ee'), ferro = new THREE.Color('#d8dadc'), rete = new THREE.Color('#5f6a62');
  for (const c of campi || []) {
    const R = c.anello; if (!R || R.length < 3) continue;
    const r = rettangolo(R), a = Math.abs(area(R)); if (a < 120 || a > 9000) continue;
    const z = terreno.z(r.c[0], r.c[1]) + 0.05;
    const Q = (s, t, dz = 0) => [r.c[0] + r.u[0] * s + r.v[0] * t, r.c[1] + r.u[1] * s + r.v[1] * t, z + dz];
    const L = r.L / 2 - 1.2, W = r.W / 2 - 1.2; if (L < 4 || W < 3) continue;
    const linea = (s0, t0, s1, t1) => { const dx = s1 - s0, dt = t1 - t0, l = Math.hypot(dx, dt) || 1, ns = -dt / l * 0.06, nt = dx / l * 0.06; P.quad(Q(s0 + ns, t0 + nt, 0.04), Q(s1 + ns, t1 + nt, 0.04), Q(s1 - ns, t1 - nt, 0.04), Q(s0 - ns, t0 - nt, 0.04), bianco); };
    linea(-L, -W, L, -W); linea(L, -W, L, W); linea(L, W, -L, W); linea(-L, W, -L, -W); linea(0, -W, 0, W);
    const calcio = r.L > 30;
    for (const sg of [-1, 1]) {
      if (calcio) {                                   // porta: due pali e traversa
        const w = Math.min(3.66, W * 0.6) / 2, hp = r.L > 60 ? 2.44 : 2.0;
        for (const t of [-w, w]) { const p = Q(sg * L, t); P.scatola(p[0], p[1], r.u, 0.12, 0.12, z, z + hp, ferro); }
        const p = Q(sg * L, 0); P.scatola(p[0], p[1], r.v, 2 * w + 0.12, 0.12, z + hp - 0.12, z + hp, ferro);
      } else {                                        // canestro: palo, tabellone, ferro
        const p = Q(sg * (L + 0.6), 0); P.scatola(p[0], p[1], r.u, 0.15, 0.15, z, z + 3.3, ferro);
        const b = Q(sg * (L - 0.1), 0); P.scatola(b[0], b[1], r.v, 1.8, 0.06, z + 2.9, z + 3.95, bianco);
      }
    }
    // recinzione a rete attorno ai campi piccoli (calcetto, basket, volley)
    if (r.L < 50) {
      const H = 3.0, E = [[-r.L / 2, -r.W / 2], [r.L / 2, -r.W / 2], [r.L / 2, r.W / 2], [-r.L / 2, r.W / 2]];
      for (let i = 0; i < 4; i++) { const p = Q(...E[i]), q = Q(...E[(i + 1) % 4]); PR.quad(p, q, [q[0], q[1], z + H], [p[0], p[1], z + H], rete); P.scatola(p[0], p[1], r.u, 0.08, 0.08, z, z + H, ferro); }
    }
  }
  const g = new THREE.Group(); g.name = 'campi-dettagli';
  if (P.p.length) g.add(new THREE.Mesh(P.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
  if (PR.p.length) g.add(new THREE.Mesh(PR.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false })));
  g.children.forEach((m) => { m.userData.pick = () => ({ livello: 'Campi sportivi', elemento: 'righe, porte, canestri, rete' }); });
  return g;
}
