// Controller (Gamepad API del browser): lettura, curve e zone morte, mappatura, vibrazione, navigazione dei menu
// e schermata di configurazione. Nessun driver: Chrome vede DualShock 4 / DualSense / Xbox con la «mappatura standard».

// file condiviso fra Cubo Corse e Circuit Studio (identico): cambia solo la chiave di salvataggio, passata al costruttore

/** azioni assegnabili. tipo: asse (sterzo, levetta intera) · analogico (0..1) · tasto (premuto sì/no) */
export const AZIONI = [
  { k: 'sterzo', nome: 'Sterzo', tipo: 'asse' },
  { k: 'gas', nome: 'Gas', tipo: 'analogico' },
  { k: 'freno', nome: 'Freno', tipo: 'analogico' },
  { k: 'manoFreno', nome: 'Freno a mano', tipo: 'tasto' },
  { k: 'visuale', nome: 'Cambia visuale', tipo: 'tasto', key: 'KeyC' },
  { k: 'rimetti', nome: 'Rimetti in pista', tipo: 'tasto', key: 'KeyR' },
  { k: 'indietro', nome: 'Guarda indietro (tenere)', tipo: 'tasto' },
  { k: 'pausa', nome: 'Pausa', tipo: 'tasto', key: 'Escape' },
  { k: 'foto', nome: 'Modalità foto', tipo: 'tasto', key: 'KeyP' },
  { k: 'hud', nome: 'Mostra/nascondi HUD', tipo: 'tasto', key: 'KeyH' },
  { k: 'linea', nome: 'Traiettoria ideale', tipo: 'tasto', key: 'KeyL' },
  { k: 'ghost', nome: 'Ghost (time trial)', tipo: 'tasto', key: 'KeyG' },
];

// assegnazioni: {t:'b', i} pulsante · {t:'a', i, s:±1, full?} asse (s = verso; full = grilletto a riposo su −1)
export const PREDEFINITI = {
  map: {
    sterzo: { t: 'a', i: 0, s: 1 }, gas: { t: 'b', i: 7 }, freno: { t: 'b', i: 6 }, manoFreno: { t: 'b', i: 0 },
    visuale: { t: 'b', i: 1 }, rimetti: { t: 'b', i: 3 }, indietro: { t: 'b', i: 2 }, pausa: { t: 'b', i: 9 },
    foto: { t: 'b', i: 17 }, hud: { t: 'b', i: 8 }, linea: { t: 'b', i: 4 }, ghost: { t: 'b', i: 5 },
  },
  // zm = zona morta, curva = esponente (1 lineare, >1 più dolce al centro), fine = dove l'uscita arriva al 100%
  sterzo: { zm: 0.06, curva: 1.5, fine: 0.95 },
  gas: { zm: 0.03, curva: 1.0, fine: 0.97 },
  freno: { zm: 0.03, curva: 1.3, fine: 0.95 },
  vibra: 0.8,
  // guadagno dei singoli effetti (0..1,5), moltiplicato per l'intensità generale
  vibraFx: { cordoli: 1, fuori: 1, urti: 1, gomme: 1 },
  aiuti: true,
};

const clone = (o) => JSON.parse(JSON.stringify(o));
function carica(chiave) {
  try {
    const c = JSON.parse(localStorage.getItem(chiave) || 'null');
    if (!c) return clone(PREDEFINITI);
    const d = clone(PREDEFINITI);
    return { ...d, ...c, map: { ...d.map, ...(c.map || {}) }, sterzo: { ...d.sterzo, ...c.sterzo }, gas: { ...d.gas, ...c.gas }, freno: { ...d.freno, ...c.freno }, vibraFx: { ...d.vibraFx, ...c.vibraFx } };
  } catch { return clone(PREDEFINITI); }
}

/** curva di risposta: |x| sotto la zona morta → 0; poi (normalizzato fino a «fine»)^curva, con il segno */
export function risposta(x, p) {
  const a = Math.abs(x);
  if (a <= p.zm) return 0;
  const u = Math.min(1, (a - p.zm) / Math.max(0.05, p.fine - p.zm));
  return Math.sign(x) * Math.pow(u, p.curva);
}

// nomi dei comandi per la mappatura standard
const NOMI_PS = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', 'Croce ↑', 'Croce ↓', 'Croce ←', 'Croce →', 'PS', 'Touchpad'];
const NOMI_XB = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'Croce ↑', 'Croce ↓', 'Croce ←', 'Croce →', 'Xbox', 'Share'];
const ASSI = ['Levetta sx ↔', 'Levetta sx ↕', 'Levetta dx ↔', 'Levetta dx ↕'];
const isPS = (id) => /054c|playstation|dualshock|dualsense|wireless controller/i.test(id || '');
export function nomeComando(b, id) {
  if (!b) return '—';
  if (b.t === 'b') { const n = isPS(id) ? NOMI_PS : NOMI_XB; return n[b.i] || `Pulsante ${b.i}`; }
  const base = ASSI[b.i] || `Asse ${b.i}`;
  if (b.full) return base.replace(/ [↔↕]$/, '') + ' (grilletto)';
  return base;
}
export function nomeController(id) {
  if (!id) return '';
  if (/dualsense/i.test(id) || /0ce6/i.test(id)) return 'DualSense (PS5)';
  if (/054c/i.test(id) || /dualshock|wireless controller/i.test(id)) return 'DualShock 4 (PS4)';
  if (/xbox|045e/i.test(id)) return 'Controller Xbox';
  return id.replace(/\s*\(.*\)\s*$/, '') || 'Controller';
}

export class Pad {
  constructor({ chiave = 'cubo-corse-controller' } = {}) {
    this.chiave = chiave;
    this.cfg = carica(chiave);
    this.gp = null;          // ultimo stato letto
    this.id = '';
    this.collegato = false;
    this.ultimoUso = -1;     // performance.now() dell'ultimo movimento del controller
    this.val = { steer: 0, throttle: 0, brake: 0, rawSteer: 0, rawGas: 0, rawFreno: 0 };
    this.giu = {};           // azione → premuta adesso
    this.premuto = {};       // azione → appena premuta (fronte di salita, solo per questo fotogramma)
    this._prevGiu = {};
    this._prevB = [];
    this._prevA = [];
    this._nav = { dir: null, t: 0, rip: 0 };
    this._rumbleT = 0;
    this._rumbleOn = false;
    this._colpo = { forte: 0, t: 0 };
    this.cattura = null;
    this.onCollega = null;    // (nome) => …
    this.onScollega = null;   // () => …
    addEventListener('gamepadconnected', (e) => {
      this.collegato = true; this.id = e.gamepad.id; this.ultimoUso = performance.now();
      this.onCollega && this.onCollega(nomeController(e.gamepad.id));
    });
    addEventListener('gamepaddisconnected', () => {
      const ancora = this._trova();
      if (!ancora) { this.collegato = false; this.gp = null; this.onScollega && this.onScollega(); }
    });
  }

  salva() { try { localStorage.setItem(this.chiave, JSON.stringify(this.cfg)); } catch { /* niente */ } }
  ripristina() { this.cfg = clone(PREDEFINITI); this.salva(); }
  nomeAzione(k) { return nomeComando(this.cfg.map[k], this.id); }
  /** il controller è il comando in uso (mosso dopo l'ultimo tasto della tastiera) */
  inUso(ultimaTastiera) { return this.collegato && !!this.gp && this.ultimoUso > ultimaTastiera; }

  _trova() {
    const l = navigator.getGamepads ? navigator.getGamepads() : [];
    let g = null;
    for (const x of l) if (x && x.connected) { if (x.id === this.id) return x; g = g || x; }
    return g;
  }

  _asse(b, gp) {
    const v = gp.axes[b.i] ?? 0;
    return b.full ? Math.max(0, Math.min(1, (v * b.s + 1) / 2)) : v * b.s;
  }
  /** valore analogico 0..1 di un'assegnazione */
  _analog(b, gp) {
    if (!b) return 0;
    if (b.t === 'b') { const x = gp.buttons[b.i]; return x ? (typeof x.value === 'number' && x.value > 0 ? x.value : x.pressed ? 1 : 0) : 0; }
    return Math.max(0, this._asse(b, gp));
  }
  _digit(b, gp) { return b ? this._analog(b, gp) > 0.5 : false; }

  /**
   * da chiamare a ogni fotogramma. guida = true durante la gara (azioni di guida), false nei menu (navigazione).
   * Ritorna l'elenco delle azioni «tasto» appena premute che vanno girate ai gestori della tastiera.
   */
  poll(dt, guida) {
    const gp = this._trova();
    this.premuto = {};
    if (!gp) { this.gp = null; return []; }
    this.gp = gp; this.id = gp.id; this.collegato = true;
    // attività: un pulsante o una levetta che si muove
    const now = performance.now();
    let mosso = false;
    gp.buttons.forEach((b, i) => { const v = b.value || (b.pressed ? 1 : 0); if (Math.abs(v - (this._prevB[i] ?? 0)) > 0.15 && v > 0.15) mosso = true; this._prevB[i] = v; });
    gp.axes.forEach((a, i) => { if (Math.abs(a - (this._prevA[i] ?? a)) > 0.2 && Math.abs(a) > 0.3) mosso = true; this._prevA[i] = a; });
    if (mosso) this.ultimoUso = now;

    if (this.cattura) { this._catturaPoll(gp); return []; }

    const C = this.cfg, M = C.map;
    // analogici con le curve
    const rs = M.sterzo ? this._asse(M.sterzo, gp) : 0;
    const rg = this._analog(M.gas, gp), rf = this._analog(M.freno, gp);
    const st = risposta(Math.max(-1, Math.min(1, rs)), C.sterzo);
    // filtro leggerissimo (≈25 ms) contro il tremolio della levetta
    this.val.steer += (st - this.val.steer) * Math.min(1, dt / 0.025);
    this.val.throttle = Math.max(0, risposta(rg, C.gas));
    this.val.brake = Math.max(0, risposta(rf, C.freno));
    this.val.rawSteer = rs; this.val.rawGas = rg; this.val.rawFreno = rf;
    // tasti: fronti di salita
    const scatti = [];
    for (const a of AZIONI) {
      if (a.tipo !== 'tasto') continue;
      const g = this._digit(M[a.k], gp);
      this.giu[a.k] = g;
      if (g && !this._prevGiu[a.k]) { this.premuto[a.k] = true; if (a.key) scatti.push(a); }
      this._prevGiu[a.k] = g;
    }
    if (guida) return scatti;
    // nei menu: solo pausa e foto (✕ e ○ servono alla navigazione)
    const libero = (a) => { const b = M[a.k]; return !(b && b.t === 'b' && (b.i === 0 || b.i === 1)); };
    this._naviga(dt, gp);
    return scatti.filter((a) => (a.k === 'pausa' || a.k === 'foto') && libero(a));
  }

  // ------------------------------------------------------------------ navigazione dei menu
  _naviga(dt, gp) {
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    let dir = b(12) || ay < -0.6 ? 'su' : b(13) || ay > 0.6 ? 'giu' : b(14) || ax < -0.6 ? 'sx' : b(15) || ax > 0.6 ? 'dx' : null;
    const N = this._nav;
    if (dir !== N.dir) { N.dir = dir; N.t = 0; N.rip = 0; if (dir) spostaFuoco(dir); }
    else if (dir) {
      N.t += dt;
      if (N.t > (N.rip ? 0.11 : 0.38)) { N.t = 0; N.rip++; spostaFuoco(dir); }
    }
    const x = b(0), o = b(1);
    if (x && !N.x) { const el = fuocoCorrente(); if (el) attiva(el); else spostaFuoco('giu'); }
    if (o && !N.o) this.onIndietro && this.onIndietro();
    N.x = x; N.o = o;
  }

  // ------------------------------------------------------------------ vibrazione
  /** colpo breve (urto): forza 0..1 */
  colpo(forza) { if (forza > this._colpo.forte * Math.max(0, 1 - this._colpo.t / 0.25)) this._colpo = { forte: Math.min(1, forza), t: 0 }; }
  /** a ogni fotogramma: cordoli, erba/ghiaia, gomme oltre il limite, urti (in gara), oppure la prova di un effetto (menu) */
  vibra(dt, car, attiva) {
    const gp = this.gp, act = gp && gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    const I = this.cfg.vibra, G = this.cfg.vibraFx;
    // prova di un singolo effetto dalla schermata del controller: un'auto finta per un secondo e mezzo
    if (this._prova) {
      this._prova.t -= dt;
      if (this._prova.t <= 0) this._prova = null;
      else {
        const k = this._prova.k;
        car = { speed: 30, onKerb: k === 'cordoli' ? 2 : 0, offroad: k === 'fuori' ? 2 : 0, surfaces: k === 'fuori' ? (this._prova.t > 0.75 ? [2, 2, 2, 2] : [3, 3, 3, 3]) : [0, 0, 0, 0], slipF: k === 'gomme' ? 0.22 : 0, slipR: 0, rpm: 5000 };
        attiva = true;
      }
    }
    let forte = 0, debole = 0;
    const metti = (f, d, g) => { forte = Math.max(forte, f * g); debole = Math.max(debole, d * g); };
    if (attiva && I > 0 && car) {
      const v = car.speed || 0;
      if (car.onKerb > 0 && v > 3) {
        // cordolo: impulsi netti (pieno / spento) col passo dei blocchi bianchi e rossi, più fitti con la velocità ma al massimo
        // 7 al secondo: il browser aggiorna la vibrazione ogni ~60 ms, impulsi più fitti si impasterebbero in un ronzio.
        // A ogni cambio di fase l'effetto parte subito. Una ruota sul cordolo: 60%; due o più: pieno
        this._fase = ((this._fase || 0) + dt * Math.min(7, 3.5 + v * 0.12)) % 1;
        const su = this._fase < 0.5, n = car.onKerb >= 2 ? 1 : 0.6;
        if (su !== this._suPrima) { this._suPrima = su; this._rumbleT = 0; }
        if (su) metti(0.4, 0.9, n * G.cordoli);
      }
      if (car.offroad > 0 && v > 1) {
        // fuori pista: già forte con una ruota (70%), pieno con due; piena forza da circa 30 km/h.
        // Ghiaia più ruvida e irregolare dell'erba (valori nuovi a ogni impulso, cioè ogni 60 ms)
        const ghiaia = car.surfaces && car.surfaces.includes(3);
        const n = car.offroad >= 2 ? 1 : 0.7, vk = Math.min(1, 0.3 + 0.7 * v / 8.3);
        const [r1, r2] = this._rnd || [0.5, 0.5];
        if (ghiaia) metti(0.6 + 0.2 * r1, 0.25 + 0.35 * r2, n * vk * G.fuori);
        else metti(0.5 + 0.1 * r1, 0.12 + 0.08 * r2, n * vk * G.fuori);
      }
      const sl = Math.max(car.slipF || 0, car.slipR || 0);
      if (sl > 0.11 && v > 6) metti(0, Math.min(0.35, (sl - 0.11) * 2.5), G.gomme);
      if (car.rpm > 8100) metti(0, 0.08, 1);
      this._colpo.t += dt;
      const k = this._colpo.forte * Math.max(0, 1 - this._colpo.t / 0.25);
      metti(k, k * 0.6, G.urti);
      // soglia: sotto il 15-20% i motori del DualShock quasi non girano, quindi ogni vibrazione accesa parte dal 20%
      const soglia = (x) => (x > 0.02 ? Math.min(1, 0.2 + 0.8 * Math.min(1, x * I)) : 0);
      forte = soglia(forte); debole = soglia(debole);
    } else { forte = 0; debole = 0; }
    this._rumbleT -= dt;
    if (forte < 0.02 && debole < 0.02) {
      if (this._rumbleOn) { this._rumbleOn = false; try { act.reset ? act.reset() : act.playEffect('dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 }); } catch { /* niente */ } }
      return;
    }
    if (this._rumbleT > 0) return;
    this._rumbleT = 0.06;
    this._rumbleOn = true;
    this._rnd = [Math.random(), Math.random()]; // irregolarità di erba e ghiaia per l'impulso successivo
    try { act.playEffect('dual-rumble', { startDelay: 0, duration: 120, strongMagnitude: forte, weakMagnitude: debole }).catch(() => {}); } catch { /* niente */ }
  }
  /** prova di un effetto (cordoli, fuori, urti, gomme) o di tutto (senza argomento) */
  prova(k) {
    const act = this.gp && this.gp.vibrationActuator;
    if (!act || !act.playEffect) return false;
    if (!k) {
      const I = this.cfg.vibra;
      act.playEffect('dual-rumble', { duration: 450, strongMagnitude: Math.min(1, 0.9 * I), weakMagnitude: Math.min(1, 0.6 * I) }).catch(() => {});
      return true;
    }
    if (k === 'urti') { this._prova = { k, t: 0.4 }; this._colpo = { forte: 1, t: 0 }; }
    else this._prova = { k, t: 1.5 };
    return true;
  }

  // ------------------------------------------------------------------ cattura di un comando (mappatura)
  avviaCattura(k, fine) {
    const gp = this._trova();
    this.cattura = { k, fine, pronto: false, base: gp ? [...gp.axes] : [], t: 0 };
  }
  annullaCattura() { if (this.cattura) { const f = this.cattura.fine; this.cattura = null; f && f(false); } }
  _catturaPoll(gp) {
    const C = this.cattura, az = AZIONI.find((a) => a.k === C.k);
    // aspetta che tutto sia rilasciato (il clic su «Cambia» col ✕ lo terrebbe premuto)
    const qualcosa = gp.buttons.some((b) => b.pressed || b.value > 0.3) || gp.axes.some((a, i) => Math.abs(a - (C.base[i] ?? 0)) > 0.3);
    if (!C.pronto) { if (!qualcosa) { C.pronto = true; C.base = [...gp.axes]; } return; }
    let nuovo = null;
    if (az.tipo !== 'asse') {
      const i = gp.buttons.findIndex((b) => b.pressed || b.value > 0.5);
      if (i >= 0) nuovo = { t: 'b', i };
    }
    if (!nuovo) {
      for (let i = 0; i < gp.axes.length; i++) {
        const d = gp.axes[i] - (C.base[i] ?? 0);
        if (Math.abs(d) > 0.6) {
          const full = C.base[i] < -0.7 || C.base[i] > 0.7; // grilletto letto come asse: a riposo su ±1
          nuovo = full ? { t: 'a', i, s: C.base[i] < 0 ? 1 : -1, full: true } : { t: 'a', i, s: Math.sign(d) };
          break;
        }
      }
    }
    if (!nuovo) return;
    const M = this.cfg.map, vecchio = M[C.k];
    // stesso comando già usato da un'altra azione: le due si scambiano i comandi (se compatibili), altrimenti lì resta vuoto
    const compatibile = (tipo, b) => !b || (tipo === 'asse' ? b.t === 'a' && !b.full : true);
    for (const a of AZIONI) {
      const b = M[a.k];
      if (a.k !== C.k && b && b.t === nuovo.t && b.i === nuovo.i && (b.t === 'b' || b.s === nuovo.s || b.full || nuovo.full || a.tipo === 'asse' || az.tipo === 'asse')) {
        M[a.k] = compatibile(a.tipo, vecchio) ? vecchio : null;
      }
    }
    M[C.k] = nuovo;
    this.salva();
    const f = C.fine;
    this.cattura = null;
    this._prevGiu = {}; for (const a of AZIONI) this._prevGiu[a.k] = true; // niente scatti al rilascio
    f && f(true);
  }
}

// ------------------------------------------------------------------ fuoco «spaziale» per i menu col controller
const SEL = 'button, .card, .carc, .sw, summary, input[type=range], select';
function schermoAttivo() {
  for (const id of ['padcfg', 'storico', 'results', 'pause', 'menu']) {
    const el = document.getElementById(id);
    if (el && el.classList.contains('show')) return el;
  }
  const ph = document.getElementById('photo');
  if (ph && !ph.classList.contains('hidden')) return ph;
  return null;
}
function visibile(el) {
  if (el.disabled) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  // dentro una tendina chiusa (tranne il suo titolo)
  const d = el.closest('details');
  if (d && !d.open && el.tagName !== 'SUMMARY') return false;
  return el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
}
export function fuocoCorrente() {
  const s = schermoAttivo(), a = document.activeElement;
  return s && a && s.contains(a) && a.matches(SEL) ? a : null;
}
function metti(el) {
  document.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus'));
  if (!el) return;
  if (!el.hasAttribute('tabindex') && !el.matches('button, summary, input, select')) el.setAttribute('tabindex', '-1');
  el.classList.add('padfocus');
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function spostaFuoco(dir) {
  const s = schermoAttivo();
  if (!s) return;
  const cur = fuocoCorrente();
  // levetta/croce a destra e sinistra su un cursore o un elenco: cambia il valore
  if (cur && (dir === 'sx' || dir === 'dx')) {
    if (cur.matches('input[type=range]')) {
      const st = +cur.step || 1, d = (dir === 'dx' ? 1 : -1) * st * Math.max(1, Math.round((+cur.max - +cur.min) / st / 40));
      cur.value = Math.max(+cur.min, Math.min(+cur.max, +cur.value + d));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (cur.matches('select')) {
      cur.selectedIndex = Math.max(0, Math.min(cur.options.length - 1, cur.selectedIndex + (dir === 'dx' ? 1 : -1)));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
  }
  const tutti = [...s.querySelectorAll(SEL)].filter(visibile);
  if (!tutti.length) return;
  if (!cur) {
    // primo spostamento: la scelta già fatta (circuito selezionato) o il pulsante principale
    const pref = [s.querySelector('.card.sel'), s.querySelector('.go:not(.hidden)')].find((e) => e && visibile(e));
    metti(pref || tutti[0]);
    return;
  }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const [vx, vy] = { su: [0, -1], giu: [0, 1], sx: [-1, 0], dx: [1, 0] }[dir];
  let best = null, bs = Infinity;
  for (const el of tutti) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect();
    // distanza fra i bordi più vicini lungo la direzione, e scarto di lato
    const qx = Math.max(q.left, Math.min(cx, q.right)), qy = Math.max(q.top, Math.min(cy, q.bottom));
    const dx = qx - cx, dy = qy - cy;
    const lungo = dx * vx + dy * vy;
    const centroLungo = (q.left + q.width / 2 - cx) * vx + (q.top + q.height / 2 - cy) * vy;
    if (lungo <= 0 && centroLungo <= 4) continue;
    const lato = Math.abs(dx * vy) + Math.abs(dy * vx);
    const sc = Math.max(0, lungo) + lato * 2.2;
    if (sc < bs) { bs = sc; best = el; }
  }
  if (best) metti(best);
}
function attiva(el) {
  if (el.matches('input[type=range], select')) return;
  el.click();
  // il clic può aver ricostruito il contenuto: ritrova un elemento vicino se quello è sparito
  requestAnimationFrame(() => { if (!document.body.contains(el)) metti(null); else metti(el); });
}
addEventListener('pointerdown', () => document.querySelectorAll('.padfocus').forEach((x) => x.classList.remove('padfocus')), true);

// ------------------------------------------------------------------ schermata di configurazione
const fmtPct = (v) => `${Math.round(v * 100)}%`;
const fmtNum = (v) => v.toFixed(2).replace('.', ',');

export class PadSchermata {
  constructor(pad, el, cb) {
    this.pad = pad; this.el = el; this.cb = cb;
    this.aperta = false;
  }
  apri() {
    this.costruisci();
    this.el.classList.add('show');
    this.aperta = true;
  }
  chiudi() {
    this.pad.annullaCattura();
    this.el.classList.remove('show');
    this.aperta = false;
  }
  costruisci() {
    const P = this.pad, C = P.cfg;
    const blocco = (k, tit, nota) => `
      <section class="pblk" data-k="${k}">
        <h4>${tit}</h4>
        <canvas width="260" height="100" data-graf="${k}"></canvas>
        <div class="pval" data-val="${k}"></div>
        <label>Zona morta <b data-l="${k}.zm">${fmtPct(C[k].zm)}</b><input type="range" min="0" max="0.3" step="0.01" value="${C[k].zm}" data-p="${k}.zm"></label>
        <label>Curva <b data-l="${k}.curva">${fmtNum(C[k].curva)}</b><input type="range" min="0.5" max="3" step="0.05" value="${C[k].curva}" data-p="${k}.curva"></label>
        <label>Fine corsa <b data-l="${k}.fine">${fmtPct(C[k].fine)}</b><input type="range" min="0.6" max="1" step="0.01" value="${C[k].fine}" data-p="${k}.fine"></label>
        <p class="pnota">${nota}</p>
      </section>`;
    this.el.querySelector('.panel').innerHTML = `
      <h2>Controller</h2>
      <div class="pstato" id="pstato"></div>
      <div class="pgrid">
        ${blocco('sterzo', 'Sterzo', 'Curva sopra 1: più dolce al centro, più precisa sul dritto. Fine corsa sotto il 100%: sterzo pieno prima del bordo della levetta.')}
        ${blocco('gas', 'Gas', 'Zona morta: quanto premi prima che succeda qualcosa. Curva sopra 1: più dosabile all\'inizio della corsa.')}
        ${blocco('freno', 'Freno', 'Con la curva sopra 1 è più facile frenare forte senza arrivare subito a fondo.')}
        <section class="pblk">
          <h4>Vibrazione</h4>
          <label>Intensità generale <b data-l="vibra">${fmtPct(C.vibra)}</b><input type="range" min="0" max="1" step="0.05" value="${C.vibra}" data-p="vibra"></label>
          ${[['cordoli', 'Cordoli'], ['fuori', 'Fuori pista'], ['urti', 'Urti'], ['gomme', 'Gomme al limite']].map(([k, n]) => `
          <div class="pfx"><label>${n} <b data-l="vibraFx.${k}">${fmtPct(C.vibraFx[k])}</b><input type="range" min="0" max="1.5" step="0.05" value="${C.vibraFx[k]}" data-p="vibraFx.${k}"></label><button data-prova="${k}" title="Prova">▶</button></div>`).join('')}
          <p class="pnota">▶ fa sentire l'effetto da solo. Sopra il 100% l'effetto è più forte del normale.</p>
          <h4>Aiuti allo sterzo</h4>
          <div class="seg" id="paiuti"><button data-aiuti="1" class="${C.aiuti ? 'sel' : ''}">Sì</button><button data-aiuti="0" class="${C.aiuti ? '' : 'sel'}">No</button></div>
          <p class="pnota">Sì: come la tastiera, in velocità le ruote non girano oltre quello che le gomme reggono, più il controsterzo automatico in arcade. No: lo sterzo è tutto tuo.</p>
        </section>
      </div>
      <h4 class="ptit">Mappatura <small>clic su un comando, poi premi il pulsante o muovi la levetta da assegnare</small></h4>
      <div class="pmap" id="pmap"></div>
      <p class="pnota">Nei menu: croce direzionale o levetta sinistra per spostarsi, ✕ per scegliere, ○ per tornare indietro.</p>
      <div class="btns"><button data-pad="reset">Ripristina i valori predefiniti</button><button data-pad="chiudi" class="go">Fatto</button></div>`;
    this.mappa();
    this.el.querySelectorAll('input[data-p]').forEach((inp) => {
      inp.oninput = () => {
        const [a, b] = inp.dataset.p.split('.');
        const v = +inp.value;
        if (b) C[a][b] = v; else C[a] = v;
        const l = this.el.querySelector(`[data-l="${inp.dataset.p}"]`);
        if (l) l.textContent = b === 'curva' ? fmtNum(v) : fmtPct(v);
        P.salva();
      };
    });
    this.el.querySelectorAll('[data-aiuti]').forEach((b) => {
      b.onclick = () => {
        C.aiuti = b.dataset.aiuti === '1';
        this.el.querySelectorAll('[data-aiuti]').forEach((x) => x.classList.toggle('sel', x === b));
        P.salva();
      };
    });
    this.el.querySelectorAll('[data-pad]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.pad;
        if (a === 'chiudi') this.cb.chiudi();
        if (a === 'reset') { P.ripristina(); this.costruisci(); this.cb.toast('Valori predefiniti ripristinati'); }
        if (a === 'prova' && !P.prova()) this.cb.toast('Questo controller (o browser) non permette la vibrazione');
      };
    });
    this.el.querySelectorAll('[data-prova]').forEach((b) => {
      b.onclick = () => { if (!P.prova(b.dataset.prova)) this.cb.toast('Questo controller (o browser) non permette la vibrazione'); };
    });
  }
  mappa() {
    const P = this.pad, el = this.el.querySelector('#pmap');
    el.innerHTML = AZIONI.map((a) => `<div class="prow"><span>${a.nome}</span><button data-cmd="${a.k}" class="${P.cfg.map[a.k] ? '' : 'vuoto'}">${P.nomeAzione(a.k)}</button></div>`).join('');
    el.querySelectorAll('[data-cmd]').forEach((b) => {
      b.onclick = () => {
        if (P.cattura) { P.annullaCattura(); return; }
        if (!P.gp) { this.cb.toast('Nessun controller: collegalo e premi un pulsante'); return; }
        const a = AZIONI.find((x) => x.k === b.dataset.cmd);
        b.classList.add('attesa');
        b.textContent = a.tipo === 'asse' ? 'Muovi la levetta a DESTRA…' : 'Premi un pulsante…';
        P.avviaCattura(a.k, (ok) => { this.mappa(); if (ok) this.cb.toast(`${a.nome}: ${P.nomeAzione(a.k)}`); });
      };
    });
  }
  /** a ogni fotogramma mentre è aperta: stato, grafici e valori dal vivo */
  aggiorna() {
    if (!this.aperta) return;
    const P = this.pad, C = P.cfg, V = P.val;
    const st = this.el.querySelector('#pstato');
    const txt = P.gp ? `<b>${nomeController(P.gp.id)}</b> collegato${P.gp.vibrationActuator ? ' · vibrazione disponibile' : ' · senza vibrazione'}${P.gp.mapping === 'standard' ? '' : ' · mappatura non standard: controlla i comandi'}`
      : 'Nessun controller: collegalo (cavo o Bluetooth) e <b>premi un pulsante</b>: il browser lo mostra solo dopo il primo tasto.';
    if (st.innerHTML !== txt) st.innerHTML = txt;
    if (P.cattura) {
      // Esc annulla (il ○ potrebbe essere proprio il comando da assegnare)
      return;
    }
    const dati = { sterzo: [V.rawSteer, V.steer], gas: [V.rawGas, V.throttle], freno: [V.rawFreno, V.brake] };
    for (const k of ['sterzo', 'gas', 'freno']) {
      const cv = this.el.querySelector(`[data-graf="${k}"]`);
      if (!cv) continue;
      this.grafico(cv, C[k], Math.abs(dati[k][0]), k === 'sterzo');
      const v = this.el.querySelector(`[data-val="${k}"]`);
      const t = k === 'sterzo'
        ? `levetta ${dati[k][0] >= 0 ? '+' : '−'}${fmtPct(Math.abs(dati[k][0]))} → sterzo ${dati[k][1] >= 0 ? '+' : '−'}${fmtPct(Math.abs(dati[k][1]))}`
        : `pedale ${fmtPct(dati[k][0])} → ${fmtPct(dati[k][1])}`;
      if (v.textContent !== t) v.textContent = t;
    }
  }
  grafico(cv, p, x, sterzo) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, m = 8;
    g.clearRect(0, 0, W, H);
    const X = (u) => m + u * (W - 2 * m), Y = (u) => H - m - u * (H - 2 * m);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(m, m, W - 2 * m, H - 2 * m);
    // zona morta e oltre il fine corsa
    g.fillStyle = 'rgba(255,59,47,.18)'; g.fillRect(X(0), m, X(p.zm) - X(0), H - 2 * m);
    g.fillStyle = 'rgba(255,210,63,.10)'; g.fillRect(X(p.fine), m, X(1) - X(p.fine), H - 2 * m);
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(1), Y(1)); g.stroke();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 100; i++) { const u = i / 100, y = risposta(u, p); i ? g.lineTo(X(u), Y(y)) : g.moveTo(X(u), Y(y)); }
    g.stroke();
    const y = risposta(Math.min(1, x), p);
    g.fillStyle = '#ff3b2f'; g.strokeStyle = '#fff'; g.lineWidth = 2;
    g.beginPath(); g.arc(X(Math.min(1, x)), Y(y), 5.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '11px Inter, sans-serif';
    g.fillText(sterzo ? 'levetta →' : 'pedale →', W - m - 58, H - m - 4);
    g.fillText('uscita', m + 4, m + 12);
  }
}
