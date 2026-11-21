// Ghost del time trial: il giro migliore (valido) per pista, salvato nel browser e ripercorso da un'auto trasparente in
// sincrono col giro del giocatore. Fornisce anche il distacco in tempo reale.
// 21-11 (Cubo Corse 1.0): la pista porta la sua versione («roncadelle-B@v2», ui/versioni.js). Il ghost di una versione vecchia
// non fa da avversario su quella nuova (potrebbe passare dove ora c'è un muro); quelli di prima della 1.0 valgono per la v1.
// 21-11 sera (Gabriele): un ghost solo per pista, qualunque sia il comando (tastiera e controller competono insieme):
// chiave v4; alla prima lettura vale il più veloce fra quelli salvati prima per tastiera e per controller (v3, v2, v1).
import * as THREE from 'three';
import { creaVisuale } from './auto.js';
import { versionePista } from '../ui/versioni.js';

const KEY = (pista) => `cubo-corse-ghost-v4|${pista}`;
const VECCHIE = (pista) => {
  const k = [`cubo-corse-ghost-v3|${pista}|tastiera`, `cubo-corse-ghost-v3|${pista}|controller`];
  if (pista.endsWith('@v1')) { const b = pista.slice(0, -3); k.push(`cubo-corse-ghost-v2|${b}|tastiera`, `cubo-corse-ghost-v2|${b}|controller`, `cubo-corse-ghost-v1|${b}|arcade`); }
  return k;
};
// canali di un campione: t (s dal via del giro), s (m percorsi nel giro), x, y, z, yaw, beccheggio, rollio, sterzo
const CANALI = 9, DEC = [3, 2, 2, 2, 2, 3, 3, 3, 3];

export function caricaGhost(pista) {
  const ok = (g) => g && Array.isArray(g.dati) && g.dati.length >= CANALI * 10 && Number.isFinite(g.tempo);
  try {
    const g = JSON.parse(localStorage.getItem(KEY(pista)) || 'null');
    if (ok(g)) return g;
    let best = null;
    for (const k of VECCHIE(pista)) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (ok(v) && (!best || v.tempo < best.tempo)) best = v; } catch { /* rovinato */ } }
    return best;
  } catch {
    return null;
  }
}

/** pista@vN a cui appartiene una chiave di ghost (qualunque formato), o null */
function pistaDi(k) {
  let m = k.match(/^cubo-corse-ghost-v4\|(.+)$/); if (m) return m[1];
  m = k.match(/^cubo-corse-ghost-v3\|(.+)\|[a-z]+$/); if (m) return m[1];
  m = k.match(/^cubo-corse-ghost-v[12]\|(.+)\|[a-z]+$/); if (m) return m[1] + '@v1';
  return null;
}
const tempoDi = (k) => { try { const g = JSON.parse(localStorage.getItem(k) || 'null'); return g && Array.isArray(g.dati) && Number.isFinite(g.tempo) ? g.tempo : null; } catch { return null; } };

/**
 * 21-11 sera (Gabriele, punto 4): spazio del browser finito (~5 MB per sito, un ghost di Roncadelle ~300 KB).
 * passo 1: per ogni pista (con la versione) resta un solo ghost, il più veloce, sotto la chiave v4: via le copie per
 *          comando (v3) e quelle di prima della 1.0 (v2, v1) che lo doppiano;
 * passo 2: via i ghost delle versioni superate delle piste (nel gioco non si vedono più; i record restano).
 * Mai il ghost della pista che si sta salvando. Ritorna quante chiavi ha tolto.
 */
export function liberaSpazio(passo, salvo = null) {
  const gruppi = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i), p = pistaDi(k || ''); if (p) (gruppi[p] ||= []).push(k); }
  let tolte = 0;
  for (const [p, chiavi] of Object.entries(gruppi)) {
    if (p === salvo) continue;
    if (passo === 1) {
      const conTempo = chiavi.map((k) => [k, tempoDi(k)]).sort((x, y) => (x[1] ?? Infinity) - (y[1] ?? Infinity));
      const [migliore, tm] = conTempo[0];
      for (const [k] of conTempo.slice(1)) { localStorage.removeItem(k); tolte++; }
      if (tm != null && migliore !== KEY(p)) {     // il migliore passa sotto la chiave v4 (lo spazio delle copie è già libero)
        try { localStorage.setItem(KEY(p), localStorage.getItem(migliore)); localStorage.removeItem(migliore); } catch { /* resta dov'è: si legge lo stesso */ }
      } else if (tm == null) { localStorage.removeItem(migliore); tolte++; }   // rovinato
    } else {
      const m = p.match(/^(.+)@v(\d+)$/);
      if (m && +m[2] < versionePista(m[1])) { for (const k of chiavi) { localStorage.removeItem(k); tolte++; } }
    }
  }
  return tolte;
}

/** salva il giro (campioni [[t,s,x,y,z,yaw,pitch,roll,delta], …]); ritorna l'oggetto salvato, o null se lo spazio non basta
 *  nemmeno dopo aver liberato le copie (liberaSpazio) */
export function salvaGhost(pista, tempo, campioni, info) {
  const dati = [];
  for (const c of campioni) for (let k = 0; k < CANALI; k++) dati.push(+c[k].toFixed(DEC[k]));
  const g = { tempo, data: new Date().toISOString(), ...info, dati }, testo = JSON.stringify(g);
  const prova = () => {
    localStorage.setItem(KEY(pista), testo);
    // le copie vecchie della stessa pista ora sono superate (il nuovo è più veloce di tutte: main.js confronta con caricaGhost)
    for (const k of VECCHIE(pista)) localStorage.removeItem(k);
    return g;
  };
  for (const passo of [0, 1, 2]) {
    try {
      if (passo) { for (const k of VECCHIE(pista)) localStorage.removeItem(k); const n = liberaSpazio(passo, pista); console.info(`ghost: memoria piena, tolte ${n} copie (passo ${passo})`); }
      return prova();
    } catch (e) {
      if (passo === 2) { console.warn('ghost non salvato:', e); return null; }
    }
  }
  return null;
}

export class Ghost {
  constructor(scene, spec, livery, num, stile, pbr = false) {
    this.scene = scene;
    this.vis = creaVisuale(spec, livery, num, { numeri: false, stile, pbr });
    // materiali propri, trasparenti (quelli delle auto sono condivisi)
    this.vis.group.traverse((o) => {
      if (!o.isMesh) return;
      const conv = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.32; c.depthWrite = false; return c; };
      o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
      o.castShadow = false;
      o.renderOrder = 3;
    });
    this.vis._remesh = () => {}; // il fantasma non si ammacca
    this.vis.group.visible = false;
    scene.add(this.vis.group);
    this.dati = null;
    this.on = true;
    this._st = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, bankRoll: 0, wheelSpin: 0, delta: 0, brake: 0, gear: 3 };
    this._i = 0;
  }
  set(g) {
    this.g = g;
    this.dati = g ? g.dati : null;
    this.n = this.dati ? this.dati.length / CANALI : 0;
    this.durata = this.n ? this.dati[(this.n - 1) * CANALI] : 0;
  }
  _v(i, k) { return this.dati[i * CANALI + k]; }

  /** indice del campione con il valore del canale k appena sotto v (ricerca binaria; t e s crescono nel giro) */
  _cerca(k, v) {
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (this._v(m, k) <= v) lo = m; else hi = m;
    }
    return lo;
  }

  /** posiziona il fantasma al tempo t del giro (secondi dal traguardo) */
  update(t, dt, now) {
    const G = this.vis.group;
    if (!this.dati || !this.on || t < 0 || t > this.durata) { G.visible = false; return; }
    const i = this._cerca(0, t), j = Math.min(this.n - 1, i + 1);
    const t0 = this._v(i, 0), t1 = this._v(j, 0), a = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    const L = (k) => this._v(i, k) + (this._v(j, k) - this._v(i, k)) * a;
    const st = this._st;
    st.x = L(2); st.y = L(3); st.z = L(4);
    let dy = this._v(j, 5) - this._v(i, 5);
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    st.yaw = this._v(i, 5) + dy * a;
    st.pitch = L(6); st.roll = L(7); st.delta = L(8);
    // ruote: girano con la velocità (dalla distanza fra due campioni)
    const ds = this._v(j, 1) - this._v(i, 1), dtc = Math.max(1e-3, t1 - t0);
    st.wheelSpin += (ds / dtc / 0.34) * dt;
    G.visible = true;
    this.vis.update(st, dt, now);
  }

  /** distacco in secondi rispetto al fantasma a parità di metri percorsi nel giro (>0 = sei più lento) */
  delta(tGiro, sGiro) {
    if (!this.dati || sGiro <= 0) return null;
    if (sGiro > this._v(this.n - 1, 1)) return null;
    const i = this._cerca(1, sGiro), j = Math.min(this.n - 1, i + 1);
    const s0 = this._v(i, 1), s1 = this._v(j, 1), a = s1 > s0 ? (sGiro - s0) / (s1 - s0) : 0;
    const tg = this._v(i, 0) + (this._v(j, 0) - this._v(i, 0)) * a;
    return tGiro - tg;
  }

  dispose() {
    this.scene.remove(this.vis.group);
    this.vis.group.traverse((o) => { if (o.isMesh) [].concat(o.material).forEach((m) => m.dispose()); });
  }
}
