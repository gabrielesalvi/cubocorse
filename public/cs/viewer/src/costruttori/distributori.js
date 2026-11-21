// Distributori di carburante (pensiline OSM del contesto) con dettagli realistici e marchi inventati, niente loghi veri:
// pensilina con fascia a due colori e luci sotto, pilastri rivestiti, isole delle pompe con erogatori (display e pistole),
// totem dei prezzi verso la strada, insegna del negozio, colonnina aria/acqua, cestini. Dati: circuito.distributori.
import * as THREE from 'three';
import { Pezzi, rettangolo, pip, latoRett, cartello } from './landmark.js';

const C = (h) => new THREE.Color(h);
const cen = (R) => { let x = 0, y = 0; for (const p of R) { x += p[0]; y += p[1]; } return [x / R.length, y / R.length]; };

function totemTex(nome, prezzi, colore) {
  const cv = document.createElement('canvas'), W = 256, H = 64 * (prezzi.length + 1) + 16; cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = colore; g.fillRect(0, 0, W, 70); g.fillStyle = '#ffffff'; g.font = 'bold 26px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(nome, W / 2, 36);
  prezzi.forEach(([tipo, euro], i) => {
    const y = 78 + i * 64; g.fillStyle = '#111'; g.fillRect(8, y, W - 16, 56);
    g.fillStyle = '#e8e8e8'; g.font = 'bold 18px Arial, sans-serif'; g.textAlign = 'left'; g.fillText(tipo, 16, y + 28);
    g.fillStyle = i === prezzi.length - 1 && tipo === 'GPL' ? '#7dff7a' : '#ffb21e'; g.font = 'bold 34px "Courier New", monospace'; g.textAlign = 'right'; g.fillText(euro, W - 14, y + 30);
  });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return { t, aspetto: W / H };
}

/** ritorna {gruppo, usate} con le pensiline/pilastri/pompe disegnate qui (da togliere dai volumi semplici) */
/** versioni (facoltativo): rev. 17, il totem dei prezzi non può stare su pista o vie di fuga di nessuna versione */
export function distributori(circuito, contesto, terreno, versioni = null) {
  const vietati = [];
  for (const V of Object.values(versioni || {})) for (const k of ['pista', 'fuga_asfalto', 'fuga_erba', 'fuga_ghiaia']) for (const p of V.livelli?.[k]?.poligoni || []) vietati.push(p.anello);
  const vietato = (x, y) => vietati.some((A) => pip(x, y, A));
  const g = new THREE.Group(); g.name = 'distributori';
  const usate = new Set();
  for (const D of circuito.distributori || []) {
    const pens = (contesto.pensiline || []).find((p) => p.id === D.pensilina); if (!pens) continue;
    const R = pens.anello, r = rettangolo(R), c0 = cen(R), K = D.colori;
    const vicino = (p) => { const c = cen(p.anello); return Math.hypot(c[0] - c0[0], c[1] - c0[1]) < Math.max(r.L, r.W) / 2 + 3; };
    const parti = (contesto.pensiline || []).filter((p) => p === pens || (p.uso !== 'tettoia' && vicino(p)));
    parti.forEach((p) => usate.add(p));
    const P = new Pezzi(), terra = terreno.z(c0[0], c0[1]), zt = pens.base, spess = 0.9;
    // pensilina: fascia (due bande), tetto chiaro, pannelli luminosi sotto
    const Q = (s, t, z) => [r.c[0] + r.u[0] * s + r.v[0] * t, r.c[1] + r.u[1] * s + r.v[1] * t, z];
    const E = [[-r.L / 2, -r.W / 2], [r.L / 2, -r.W / 2], [r.L / 2, r.W / 2], [-r.L / 2, r.W / 2]];
    for (let i = 0; i < 4; i++) {
      const a = E[i], b = E[(i + 1) % 4];
      P.quad(Q(a[0], a[1], zt), Q(b[0], b[1], zt), Q(b[0], b[1], zt + spess * 0.62), Q(a[0], a[1], zt + spess * 0.62), C(K.fascia));
      P.quad(Q(a[0], a[1], zt + spess * 0.62), Q(b[0], b[1], zt + spess * 0.62), Q(b[0], b[1], zt + spess), Q(a[0], a[1], zt + spess), C(K.fascia2));
    }
    P.quad(Q(-r.L / 2, -r.W / 2, zt + spess), Q(r.L / 2, -r.W / 2, zt + spess), Q(r.L / 2, r.W / 2, zt + spess), Q(-r.L / 2, r.W / 2, zt + spess), C('#d9dadb'));
    P.quad(Q(-r.L / 2, -r.W / 2, zt), Q(r.L / 2, -r.W / 2, zt), Q(r.L / 2, r.W / 2, zt), Q(-r.L / 2, r.W / 2, zt), C('#c9cbcc'));
    const luce = C('#fffbe8');
    for (let s = -r.L / 2 + 1.5; s < r.L / 2 - 1; s += 2.6) for (let t = -r.W / 2 + 1.5; t < r.W / 2 - 1; t += 2.6)
      P.quad(Q(s, t, zt - 0.02), Q(s + 1.2, t, zt - 0.02), Q(s + 1.2, t + 0.5, zt - 0.02), Q(s, t + 0.5, zt - 0.02), luce);
    // pilastri rivestiti con la fascia in basso
    for (const p of parti.filter((p) => p.elemento === 'pilastro')) {
      const c = cen(p.anello), z0 = p.base;
      P.scatola(c[0], c[1], r.u, 0.55, 0.55, z0 - 0.2, zt, C(K.pilastri));
      P.scatola(c[0], c[1], r.u, 0.58, 0.58, z0 + 0.6, z0 + 1.1, C(K.fascia));
      P.scatola(c[0] + r.v[0] * 0.33, c[1] + r.v[1] * 0.33, r.u, 0.22, 0.12, z0 + 0.4, z0 + 0.9, C('#c62828'));   // estintore
    }
    // isole e pompe
    const pompe = parti.filter((p) => p.uso === 'pompa');
    for (const p of pompe) {
      const c = cen(p.anello), z0 = p.base;
      P.scatola(c[0], c[1], r.u, 4.2, 1.2, z0 - 0.1, z0 + 0.16, C('#bdbdb8'));
      for (const sg of [-1, 1]) { const q = [c[0] + r.u[0] * sg * 2.15, c[1] + r.u[1] * sg * 2.15]; P.scatola(q[0], q[1], r.u, 0.25, 1.22, z0 - 0.1, z0 + 0.18, C('#f2c200')); }
      for (const sg of [-1, 1]) {
        const q = [c[0] + r.u[0] * sg * 1.0, c[1] + r.u[1] * sg * 1.0], zb = z0 + 0.16;
        P.scatola(q[0], q[1], r.u, 0.95, 0.55, zb, zb + 1.85, C(K.pompe));
        P.scatola(q[0], q[1], r.u, 0.97, 0.57, zb + 1.55, zb + 1.85, C(K.fascia));
        for (const lato of [-1, 1]) {
          const f = [q[0] + r.v[0] * lato * 0.285, q[1] + r.v[1] * lato * 0.285];
          P.pannello(f[0], f[1], r.u, [r.v[0] * lato, r.v[1] * lato], 0.01, 0.6, zb + 1.05, zb + 1.45, C('#1b2a22'));   // display
          P.pannello(f[0], f[1], r.u, [r.v[0] * lato, r.v[1] * lato], 0.015, 0.45, zb + 1.18, zb + 1.36, C('#6fe08a'));
          for (const k of [-0.3, 0, 0.3]) { const h = [f[0] + r.u[0] * k, f[1] + r.u[1] * k]; P.pannello(h[0], h[1], r.u, [r.v[0] * lato, r.v[1] * lato], 0.03, 0.12, zb + 0.6, zb + 0.95, C(['#1d1d1d', '#2e7d32', '#f2c200'][(k + 0.3) * 10 / 3 | 0])); }
        }
      }
    }
    // colonnina aria/acqua e cestino all'angolo della pensilina
    const ang = Q(r.L / 2 + 1.2, r.W / 2 - 0.5, 0);
    P.scatola(ang[0], ang[1], r.u, 0.4, 0.3, terra - 0.1, terra + 1.3, C('#2f6fb7'));
    P.scatola(ang[0] + r.u[0] * 0.9, ang[1] + r.u[1] * 0.9, r.u, 0.4, 0.4, terra - 0.1, terra + 0.9, C('#5b6b5f'));
    // totem dei prezzi: all'angolo verso la strada (lato della pensilina più vicino al centro della carreggiata = asse)
    const asse = circuito.asse.punti;
    let best = null; for (const p of asse) { const d = Math.hypot(p[0] - c0[0], p[1] - c0[1]); if (!best || d < best.d) best = { d, p }; }
    const dir = [best.p[0] - c0[0], best.p[1] - c0[1]], dl = Math.hypot(...dir) || 1;
    let tp = [c0[0] + dir[0] / dl * (Math.max(r.L, r.W) / 2 + 2.5) + r.u[0] * (r.L / 2), c0[1] + dir[1] / dl * (Math.max(r.L, r.W) / 2 + 2.5) + r.u[1] * (r.L / 2)];
    // rev. 17 (Gabriele): su via Martiri il totem finiva in pista: si arretra verso la pensilina finché è fuori (con 1 m di margine)
    const fuori = (q) => ![[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => vietato(q[0] + a, q[1] + b));
    for (let k = 0; k < 40 && !fuori(tp); k++) tp = [tp[0] - dir[0] / dl * 0.5, tp[1] - dir[1] / dl * 0.5];
    const zp = terreno.z(tp[0], tp[1]), hT = 6.0;
    P.scatola(tp[0], tp[1], r.u, 0.3, 0.3, zp - 0.1, zp + hT - 2.2, C('#6c7075'));
    P.scatola(tp[0], tp[1], [-dir[1] / dl, dir[0] / dl], 1.7, 0.35, zp + hT - 2.6, zp + hT, C(K.fascia2));
    if (typeof document !== 'undefined') {
      const { t, aspetto } = totemTex(D.nome, D.prezzi, K.fascia), h = 2.4, w = h * aspetto;
      const mat = new THREE.MeshLambertMaterial({ map: t, emissive: 0x222222, side: THREE.DoubleSide });
      for (const sg of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), o = [tp[0] + dir[0] / dl * 0.18 * sg, tp[1] + dir[1] / dl * 0.18 * sg];
        m.position.set(o[0], o[1], zp + hT - 1.3); m.up.set(0, 0, 1); m.lookAt(o[0] + dir[0] * sg, o[1] + dir[1] * sg, zp + hT - 1.3); g.add(m);
      }
      // nome sulla fascia, sui due lati lunghi
      for (const nome of ['nord', 'sud', 'est', 'ovest']) {
        const S = latoRett(r, nome); if (S.len < r.L - 0.1) continue;
        const m = cartello(D.nome, { colore: '#ffffff', sfondo: K.fascia, larghezza: Math.min(S.len * 0.6, 6), altezza: spess * 0.5, font: 'bold 64px Arial, sans-serif' });
        if (m) { const o = [S.m[0] + S.n[0] * 0.02, S.m[1] + S.n[1] * 0.02]; m.position.set(o[0], o[1], zt + spess * 0.32); m.up.set(0, 0, 1); m.lookAt(o[0] + S.n[0], o[1] + S.n[1], zt + spess * 0.32); g.add(m); }
      }
      // negozio: vetrina e insegna sul lato verso la pensilina
      const neg = D.negozio && contesto.edifici.find((e) => e.id === D.negozio);
      if (neg) {
        const rn = rettangolo(neg.anello), cn = cen(neg.anello), v = [c0[0] - cn[0], c0[1] - cn[1]];
        const nome = Object.entries({ est: [1, 0], ovest: [-1, 0], nord: [0, 1], sud: [0, -1] }).sort((a, b) => (b[1][0] * v[0] + b[1][1] * v[1]) - (a[1][0] * v[0] + a[1][1] * v[1]))[0][0];
        const S = latoRett(rn, nome);
        P.pannello(S.m[0], S.m[1], S.t, S.n, 0.05, Math.min(6, S.len - 1), neg.base, neg.base + 2.6, C('#4f6b7d'));
        const m = cartello(D.testo_negozio || 'SHOP', { colore: '#ffffff', sfondo: K.fascia, larghezza: Math.min(4.5, S.len - 1), altezza: 0.6, font: 'bold 64px Arial, sans-serif' });
        if (m) { const o = [S.m[0] + S.n[0] * 0.08, S.m[1] + S.n[1] * 0.08]; m.position.set(o[0], o[1], neg.base + 3.1); m.up.set(0, 0, 1); m.lookAt(o[0] + S.n[0], o[1] + S.n[1], neg.base + 3.1); g.add(m); }
      }
    }
    const mesh = new THREE.Mesh(P.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
    mesh.name = 'distributore-' + D.pensilina; mesh.userData.pick = () => ({ livello: 'Distributore', elemento: D.nome + ' (marchio inventato)' });
    g.add(mesh);
    void pip;
  }
  return { gruppo: g, usate };
}
