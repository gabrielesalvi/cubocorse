// Corsia box più realistica e semaforo di partenza sopraelevato sul traguardo.
// Box: apertura con interno scuro, serranda alzata, fascia col colore della squadra e numero, gomme impilate, piazzola
// dipinta davanti; postazioni delle squadre sul muretto (tettoia, banco, monitor); rete sul muretto lato pista; linea
// tratteggiata fra corsia veloce e corsia di lavoro; cartelli dei 60 km/h; semaforo rosso/verde all'uscita.
// Portale: due piloni oltre le barriere, trave reticolare, pannello con 5 colonne di 2 luci rosse rivolte alla griglia.
import * as THREE from 'three';
import { Pezzi, rettangolo, cartello, pip } from './landmark.js';

const C = (h) => new THREE.Color(h);
const SQUADRE = ['#c8102e', '#0b2a6f', '#0f5132', '#f2c200', '#eeeeea', '#ff6a13', '#46b4e6', '#141416', '#5b2a86', '#a9adb3'];
const cen = (R) => { let x = 0, y = 0; for (const p of R) { x += p[0]; y += p[1]; } return [x / R.length, y / R.length]; };

function cartelloLimite(n) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill(); g.strokeStyle = '#d22a1e'; g.lineWidth = 14; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 60px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
}
const guarda = (m, p, z, dir) => { m.position.set(p[0], p[1], z); m.up.set(0, 0, 1); m.lookAt(p[0] + dir[0], p[1] + dir[1], z); return m; };

/** dati = pacchetto; v = versione. Ritorna {gruppo, semaforo: {setLuci(n)}} */
export function paddock(dati, v) {
  const { circuito, terreno, comune, versioni } = dati, V = versioni[v], lv = V.livelli;
  const g = new THREE.Group(); g.name = 'paddock';
  const P = new Pezzi(), PR = new Pezzi(), extra = [];
  const muri = (lv.muretto_box?.linee || []).map((l) => l.punti).filter((p) => p.length > 1);
  const box = comune.livelli.box?.volumi || [];
  // punto del muretto più vicino a (x,y), con la direzione della linea
  const sulMuro = (x, y) => {
    let best = null;
    for (const M of muri) for (let i = 0; i + 1 < M.length; i++) {
      const a = M[i], b = M[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)), px = a[0] + dx * t, py = a[1] + dy * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.d) { const l = Math.sqrt(l2); best = { d, p: [px, py], t: [dx / l, dy / l] }; }
    }
    return best;
  };
  // ---- box
  box.forEach((b, k) => {
    const R = b.anello, r = rettangolo(R), c = cen(R), z0 = b.base, h = b.h, col = C(SQUADRE[k % SQUADRE.length]);
    const m = sulMuro(c[0], c[1]); if (!m) return;
    // fronte = lato del rettangolo rivolto verso il muretto
    const vx = m.p[0] - c[0], vy = m.p[1] - c[1];
    const cand = [[r.u, r.L / 2, r.W], [[-r.u[0], -r.u[1]], r.L / 2, r.W], [r.v, r.W / 2, r.L], [[-r.v[0], -r.v[1]], r.W / 2, r.L]];
    const [n, hd, larg] = cand.reduce((a, q) => (q[0][0] * vx + q[0][1] * vy > a[0][0] * vx + a[0][1] * vy ? q : a));
    const t = [-n[1], n[0]], f = [r.c[0] + n[0] * hd, r.c[1] + n[1] * hd];
    // pareti e tetto con pensilina sul fronte
    P.scatola(r.c[0], r.c[1], r.u, r.L, r.W, z0 - 0.3, z0 + h, C('#eceff1'));
    const fp = [f[0] + n[0] * 0.6, f[1] + n[1] * 0.6];
    P.scatola(fp[0], fp[1], t, larg + 0.4, 1.2 + 0.01, z0 + h - 0.05, z0 + h + 0.25, C('#3a3d42'));
    P.pannello(f[0], f[1], t, n, 0.62, larg + 0.4, z0 + h - 0.05, z0 + h + 0.25, col);
    // apertura, interno, serranda, fascia
    P.pannello(f[0], f[1], t, n, 0.03, larg - 1.2, z0, z0 + 3.6, C('#1d1f22'));
    P.pannello(f[0], f[1], t, n, 0.05, larg - 1.2, z0 + 3.0, z0 + 3.6, C('#c9ccce'));
    P.pannello(f[0], f[1], t, n, 0.03, larg - 0.2, z0 + 3.7, z0 + h - 0.15, col);
    const dentro = [f[0] - n[0] * (hd * 2 - 0.4), f[1] - n[1] * (hd * 2 - 0.4)];
    P.pannello(dentro[0], dentro[1], t, n, 0, larg - 1.4, z0, z0 + 3.4, col.clone().multiplyScalar(0.55));            // parete di fondo
    for (const sg of [-1, 1]) for (let j = 0; j < 4; j++) {                                                            // gomme impilate
      const q = [f[0] - n[0] * 1.2 + t[0] * sg * (larg / 2 - 1.3), f[1] - n[1] * 1.2 + t[1] * sg * (larg / 2 - 1.3)];
      P.scatola(q[0], q[1], t, 0.66, 0.66, z0 + j * 0.27, z0 + j * 0.27 + 0.25, C('#1a1a1a'));
    }
    // piazzola dipinta davanti al box (contorno col colore della squadra)
    const zt = terreno.z(f[0] + n[0] * 4, f[1] + n[1] * 4) + 0.105, A = 5.6, B = larg - 2.5;
    const Qp = (a, b) => [f[0] + n[0] * a + t[0] * b, f[1] + n[1] * a + t[1] * b, zt];
    for (const [a0, b0, a1, b1] of [[0.5, -B / 2, A, -B / 2], [A, -B / 2, A, B / 2], [A, B / 2, 0.5, B / 2]]) {
      const da = a1 - a0, db = b1 - b0, l = Math.hypot(da, db), na = -db / l * 0.1, nb = da / l * 0.1;
      P.quad(Qp(a0 + na, b0 + nb), Qp(a1 + na, b1 + nb), Qp(a1 - na, b1 - nb), Qp(a0 - na, b0 - nb), col);
    }
    // numero del box sulla fascia
    const cart = cartello(`${b.numero}`, { colore: '#ffffff', sfondo: '#1d1f22', larghezza: 1.0, altezza: 0.6, font: 'bold 64px Arial, sans-serif' });
    if (cart) extra.push(guarda(cart, [f[0] + n[0] * 0.08 + t[0] * (larg / 2 - 1.0), f[1] + n[1] * 0.08 + t[1] * (larg / 2 - 1.0)], z0 + 4.05, n));
    // postazione della squadra sul muretto (lato corsia)
    const sm = sulMuro(f[0] + n[0] * 8, f[1] + n[1] * 8);
    // rev. 17: niente postazione se davanti al box il muretto è già finito (prima finiva nella corsia d'uscita)
    const aCapo = sm && muri.some((M) => [M[0], M[M.length - 1]].some((e) => Math.hypot(e[0] - sm.p[0], e[1] - sm.p[1]) < 2.5));
    if (sm && sm.d < 20 && !aCapo) {
      const vb = [f[0] - sm.p[0], f[1] - sm.p[1]], vl = Math.hypot(...vb) || 1, nb = [vb[0] / vl, vb[1] / vl];
      const q = [sm.p[0] + nb[0] * 1.1, sm.p[1] + nb[1] * 1.1], zq = terreno.z(q[0], q[1]);
      P.scatola(q[0], q[1], sm.t, 3.0, 1.4, zq + 2.9, zq + 3.1, col);                                        // tettoia
      for (const sg of [-1, 1]) { const l = [q[0] + sm.t[0] * sg * 1.4 + nb[0] * 0.6, q[1] + sm.t[1] * sg * 1.4 + nb[1] * 0.6]; P.scatola(l[0], l[1], sm.t, 0.08, 0.08, zq, zq + 2.9, C('#3a3d42')); }
      P.scatola(q[0], q[1], sm.t, 2.8, 0.6, zq + 0.9, zq + 1.0, C('#2b2d31'));                                // banco
      for (const k2 of [-0.8, 0, 0.8]) { const mo = [q[0] + sm.t[0] * k2 - nb[0] * 0.2, q[1] + sm.t[1] * k2 - nb[1] * 0.2]; P.scatola(mo[0], mo[1], sm.t, 0.6, 0.05, zq + 1.6, zq + 2.0, C('#15181c')); }
      for (const k2 of [-0.7, 0.7]) { const sg = [q[0] + sm.t[0] * k2 + nb[0] * 0.5, q[1] + sm.t[1] * k2 + nb[1] * 0.5]; P.scatola(sg[0], sg[1], sm.t, 0.45, 0.45, zq, zq + 0.75, col); }   // sgabelli
    }
  });
  // ---- rete sul muretto (lato pista), linea tratteggiata della corsia veloce, cartelli e semaforo d'uscita
  const assePt = circuito.asse.punti;
  const lontanoDaAsse = (p, q) => {               // verso (dal muretto) che si allontana dall'asse = verso i box
    let best = null; for (const a of assePt) { const d = (a[0] - p[0]) ** 2 + (a[1] - p[1]) ** 2; if (!best || d < best.d) best = { d, a }; }
    const nx = -q[1], ny = q[0]; return (best.a[0] - p[0]) * nx + (best.a[1] - p[1]) * ny > 0 ? [-nx, -ny] : [nx, ny];
  };
  for (const M of muri) {
    for (let i = 0; i + 1 < M.length; i++) {
      const a = M[i], b = M[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, t = [dx / l, dy / l];
      const nb = lontanoDaAsse(a, t), za = terreno.z(a[0], a[1]), zb = terreno.z(b[0], b[1]);
      const o = 0.15;                                                                                    // rete: sopra il muretto, lato pista
      const A = [a[0] - nb[0] * o, a[1] - nb[1] * o], B = [b[0] - nb[0] * o, b[1] - nb[1] * o];
      PR.quad([A[0], A[1], za + 1.1], [B[0], B[1], zb + 1.1], [B[0], B[1], zb + 3.6], [A[0], A[1], za + 3.6], C('#3a4046'));
      if (i % 3 === 0) P.scatola(A[0], A[1], t, 0.08, 0.08, za + 1.0, za + 3.7, C('#6b737a'));
      if (i % 2 === 0) {                                                                                 // tratteggio a 4,5 m dal muretto
        const D0 = [a[0] + nb[0] * 4.5, a[1] + nb[1] * 4.5], D1 = [a[0] + nb[0] * 4.5 + t[0] * Math.min(1.5, l), a[1] + nb[1] * 4.5 + t[1] * Math.min(1.5, l)], z = terreno.z(D0[0], D0[1]) + 0.1;
        P.quad([D0[0] - nb[0] * 0.07, D0[1] - nb[1] * 0.07, z], [D1[0] - nb[0] * 0.07, D1[1] - nb[1] * 0.07, z], [D1[0] + nb[0] * 0.07, D1[1] + nb[1] * 0.07, z], [D0[0] + nb[0] * 0.07, D0[1] + nb[1] * 0.07, z], C('#f4f4f2'));
      }
    }
    // cartelli 60 all'inizio e alla fine del muretto, semaforo all'uscita (fine della linea nel verso di marcia)
    for (const [k, fine] of [[0, false], [M.length - 1, true]]) {
      const p = M[k], q = M[fine ? k - 1 : k + 1], t = [(fine ? p[0] - q[0] : q[0] - p[0]), (fine ? p[1] - q[1] : q[1] - p[1])], l = Math.hypot(...t) || 1, tt = [t[0] / l, t[1] / l];
      const nb = lontanoDaAsse(p, tt), s = [p[0] + nb[0] * 0.15, p[1] + nb[1] * 0.15], z = terreno.z(s[0], s[1]);   // rev. 17: sul muretto, non nella corsia
      P.scatola(s[0], s[1], tt, 0.08, 0.08, z, z + 2.4, C('#8a9096'));
      const cl = cartelloLimite(circuito.pit?.limite_kmh || 60);
      if (cl) extra.push(guarda(cl, s, z + 2.2, fine ? tt : [-tt[0], -tt[1]]));
      if (fine) {                                                                                       // semaforo d'uscita
        // rev. 17 (Gabriele: «non deve essere d'ostacolo»): prima stava 1,5 m dentro la corsia, dove passano le auto. Ora fuori
        // dal bordo esterno della corsia box (1,2 m oltre), alla stessa altezza del muretto, rivolto alle auto che escono
        const corsia = (lv.corsia_box?.poligoni || []).map((q) => q.anello);
        let k2 = 1.5; while (k2 < 30 && corsia.some((A) => pip(p[0] + nb[0] * k2, p[1] + nb[1] * k2, A))) k2 += 0.25;
        const e2 = [p[0] + nb[0] * (k2 + 1.2), p[1] + nb[1] * (k2 + 1.2)], ze = terreno.z(e2[0], e2[1]);
        P.scatola(e2[0], e2[1], tt, 0.12, 0.12, ze, ze + 2.6, C('#3a3d42'));
        P.scatola(e2[0], e2[1], tt, 0.35, 0.5, ze + 2.4, ze + 3.4, C('#1b1c1f'));
        P.pannello(e2[0], e2[1], [-nb[1], nb[0]], [-tt[0], -tt[1]], 0.18, 0.22, ze + 3.0, ze + 3.25, C('#4a0d0d'));
        P.pannello(e2[0], e2[1], [-nb[1], nb[0]], [-tt[0], -tt[1]], 0.18, 0.22, ze + 2.6, ze + 2.85, C('#2bff6a'));
      }
    }
  }
  // ---- portale del semaforo sul traguardo
  const A = circuito.asse.punti, n0 = A.length, i0 = 0, a = A[(i0 - 1 + n0) % n0], b = A[(i0 + 1) % n0];
  const tl = Math.hypot(b[0] - a[0], b[1] - a[1]), T = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl], N = [T[1], -T[0]];   // N = destra
  const bb = V.bordi_barriera || null, bp = V.bordi_pista;
  const sx = (bb ? bb.sinistra[0] : bp.sinistra[0] + 1.5) + 1.3, dx = (bb ? bb.destra[0] : bp.destra[0] + 1.5) + 1.3;
  const O = A[i0], zg = terreno.z(O[0], O[1]), H = 6.6, kT = C('#9aa1a8'), kS = C('#2a2d31');
  const at = (lat, lon = 0) => [O[0] + N[0] * lat + T[0] * lon, O[1] + N[1] * lat + T[1] * lon];
  for (const lat of [-sx, dx]) { const q = at(lat); const zq = terreno.z(q[0], q[1]); P.scatola(q[0], q[1], T, 0.8, 0.8, zq - 0.2, zg + H + 1.3, kT); P.scatola(q[0], q[1], T, 1.2, 1.2, zq - 0.2, zq + 0.6, C('#c9ccce')); }
  const span = sx + dx, mid = at((dx - sx) / 2);
  for (const dz of [0, 1.1]) for (const lon of [-0.35, 0.35]) { const q = at((dx - sx) / 2, lon); P.scatola(q[0], q[1], N, span, 0.18, zg + H + dz, zg + H + dz + 0.18, kT); }
  for (let k = 0; k <= Math.floor(span / 1.6); k++) {                                                   // montanti della trave reticolare
    const lat = -sx + k * 1.6; for (const lon of [-0.35, 0.35]) { const q = at(lat, lon); P.scatola(q[0], q[1], N, 0.08, 0.08, zg + H, zg + H + 1.28, kT); }
  }
  // pannello delle luci, rivolto alla griglia (verso -T), sotto la trave
  const pannello = at((dx - sx) / 2, -0.55);
  P.scatola(pannello[0], pannello[1], N, 5.2, 0.35, zg + H - 1.5, zg + H, kS);
  const luci = [];
  if (typeof document !== 'undefined') {
    const geo = new THREE.CircleGeometry(0.2, 12);
    for (let c = 0; c < 5; c++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x3a0a0a }); luci.push(mat);
      for (const zr of [-0.45, -1.05]) {
        const q = at((dx - sx) / 2 + (c - 2) * 0.95, -0.74);
        extra.push(guarda(new THREE.Mesh(geo, mat), q, zg + H + zr, [-T[0], -T[1]]));
      }
    }
    const sc = cartello('CIRCUITO CITTADINO DI RONCADELLE', { colore: '#ffffff', sfondo: '#1d1f22', larghezza: Math.min(span - 2, 14), altezza: 0.9, font: 'bold 64px Arial, sans-serif' });
    if (sc) { const q = at((dx - sx) / 2, -0.47); extra.push(guarda(sc, q, zg + H + 0.65, [-T[0], -T[1]])); }
    const sc2 = sc && sc.clone(); if (sc2) { const q = at((dx - sx) / 2, 0.47); extra.push(guarda(sc2, q, zg + H + 0.65, T)); }
  }
  void mid;
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const m1 = new THREE.Mesh(P.geometria(), mat); m1.name = 'paddock'; m1.castShadow = true;
  m1.userData.pick = () => ({ livello: 'Corsia box e partenza', elemento: 'box, muretto, portale del semaforo' });
  const m2 = new THREE.Mesh(PR.geometria(), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  m2.name = 'rete-muretto';
  g.add(m1, m2, ...extra);
  const semaforo = {
    /** n = 1..5 colonne rosse accese; 0 o negativo = spente (via) */
    setLuci(n) { luci.forEach((m, c) => m.color.set(n > 0 && c < n ? 0xff2a1a : 0x3a0a0a)); },
  };
  return { gruppo: g, semaforo };
}
