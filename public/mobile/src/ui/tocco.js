// Comandi del telefono (fase 2b, 22-11-2026; fase 2e, 23-11). Sterzo e pedali si scelgono separatamente nel menu e si
// combinano come si vuole (decisione di Gabriele, 23-11):
//  - sterzo «tasti»: sinistra e destra sotto il pollice sinistro, con la stessa rampa della tastiera;
//  - sterzo «leva»: leva analogica che nasce dove appoggi il pollice nella metà sinistra (formule in leve.js);
//  - sterzo «inclinazione»: il telefono in orizzontale fa da volante (angolo laterale rispetto alla gravità, quindi funziona
//    sia tenendolo dritto sia quasi piatto). Centro tarato da solo in griglia e con il tasto ⊙, angolo pieno regolabile,
//    filtro contro il tremolio della mano;
//  - pedali «tasti»: freno e gas a forma di pedale sotto il pollice destro (con l'inclinazione il freno va a sinistra);
//  - pedali «cursore»: barra verticale a destra, sopra la tacca gas e sotto freno, dosabili (posizione assoluta).
// Dopo il via, mentre si tocca lo schermo, i comandi diventano semitrasparenti e le scritte dei pedali spariscono; tornano
// del tutto visibili quando si tolgono le mani (23-11, Gabriele).
// Gas automatico e freno automatico (src/sim/pedali.js) si accendono a parte, con tutte le combinazioni.
// Produce lo stesso pacchetto della tastiera e del controller (Input.sample in main.js), col tipo 'telefono': in classifica
// un solo simbolo per il telefono, qualunque sia il comando (23-11). I tasti seguono il dito: si scivola da ◀ a ▶.
import { PedaliAutomatici } from '../sim/pedali.js';
import { MODELLO } from '../sim/car.js';
import { LEVA, CURSORE, raggioLeva, leggiLeva, leggiCursore, posizioneCursore } from './leve.js';

const $id = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
/** dispositivo col tocco (telefono, tablet); ?tocco=1 / ?tocco=0 per le prove */
export const DISPOSITIVO_TOCCO = Q.get('tocco') ? Q.get('tocco') === '1'
  : (matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0);
const MANI_VIA = 0.4;      // s senza dita sullo schermo prima che i comandi tornino del tutto visibili

// pedali disegnati: il gas come un pedale «a organo» incernierato in basso, il freno come una piastra larga sul braccio
const SVG_GAS = `<svg class="psvg" viewBox="0 0 60 104" aria-hidden="true"><rect class="cern" x="14" y="96" width="32" height="7" rx="3"/><path class="piastra" d="M8 6q0-4 4-4h36q4 0 4 4l-3 84q0 5-5 5H16q-5 0-5-5z"/><path class="righe" d="M15 16h30M15 26h30M15 36h30M15 46h30M15 56h30M15 66h30M15 76h30M15 86h30"/></svg>`;
const SVG_FRENO = `<svg class="psvg" viewBox="0 0 80 96" aria-hidden="true"><path class="braccio" d="M36 0h8v34h-8z"/><rect class="piastra" x="4" y="30" width="72" height="62" rx="12"/><path class="righe" d="M14 42h52M14 50h52M14 58h52M14 66h52M14 74h52M14 82h52"/></svg>`;

export class Telefono {
  constructor(app) {
    this.app = app;
    this.attivo = DISPOSITIVO_TOCCO;
    this.ultimoTocco = this.attivo ? 1 : 0;     // finché non si usa la tastiera, sul telefono guidano i tocchi
    this.tasti = { sx: false, dx: false, gas: false, freno: false, mano: false };
    this.puntatori = new Map();                  // pointerId → tasto
    this.leva = { id: null, ox: 0, oy: 0, x: 0, valore: 0, filtro: 0 };
    this.cursore = { id: null, u: CURSORE.tacca, gas: 0, freno: 0, fg: 0, ff: 0 };
    this.steer = 0; this.thr = 0; this.brk = 0;
    this.incl = { grezzo: 0, filtro: 0, centro: 0, segno: 0, ok: false, tempo: 0 };
    this.ped = null; this._race = null;
    this._senzaMani = 99;                        // s dall'ultima volta che c'era un dito sui comandi
    document.body.classList.toggle('tocco', this.attivo);
    if (this.attivo) this._costruisci();
    this.aggiornaSchema();
  }

  get s() { return this.app.settings; }
  /** sterzo: 'tasti' | 'leva' | 'inclinazione' (telComandi = nome di prima del 23-11, per chi aveva già scelto) */
  get sterzo() { const v = this.s.telSterzo || (this.s.telComandi === 'inclinazione' ? 'inclinazione' : 'tasti'); return ['tasti', 'leva', 'inclinazione'].includes(v) ? v : 'tasti'; }
  /** pedali: 'tasti' | 'cursore' */
  get pedali() { return this.s.telPedali === 'cursore' ? 'cursore' : 'tasti'; }
  get schema() { return this.sterzo; }          // compatibilità (prove e misura)
  get tipo() { return 'telefono'; }
  /** guidano i tocchi? (sul telefono sì, finché non si preme un tasto della tastiera dopo l'ultimo tocco) */
  inUso() { return this.attivo && this.ultimoTocco >= this.app.input.ultimaTastiera; }
  /** quante dita stanno sui comandi di guida */
  get dita() { return this.puntatori.size + (this.leva.id !== null ? 1 : 0) + (this.cursore.id !== null ? 1 : 0); }

  // ------------------------------------------------------------------ schermo
  _costruisci() {
    const hud = $id('hud');
    const el = document.createElement('div');
    el.id = 'tocco';
    el.innerHTML = `
      <div class="tz tsx" data-zona="sx">
        <button class="tt sterzo" data-k="sx" aria-label="Sinistra">◀</button><button class="tt sterzo" data-k="dx" aria-label="Destra">▶</button>
        <button class="tt pedale freno freno-sx" data-k="freno" aria-label="Freno">${SVG_FRENO}<span class="etichetta">FRENO</span></button>
      </div>
      <div class="zleva" aria-label="Leva dello sterzo"></div>
      <div class="leva riposo" aria-hidden="true"><div class="lbase"><i class="lfreccia">◀</i><i class="lfreccia">▶</i></div><div class="lpomo"></div></div>
      <div class="tz tdx" data-zona="dx">
        <button class="tt mano" data-k="mano" aria-label="Freno a mano">FRENO<br>A MANO</button>
        <button class="tt pedale freno freno-dx" data-k="freno" aria-label="Freno">${SVG_FRENO}<span class="etichetta">FRENO</span></button>
        <button class="tt pedale gas" data-k="gas" aria-label="Gas">${SVG_GAS}<span class="etichetta">GAS</span></button>
      </div>
      <div class="zcursore" aria-label="Gas e freno">
        <div class="cbarra"><div class="cgas"></div><div class="cfreno"></div><div class="ctacca"></div><div class="cpomo"></div>
          <span class="etichetta csu">GAS</span><span class="etichetta cgiu">FRENO</span></div>
      </div>
      <div class="tbar">
        <button class="tb" data-azione="pausa" aria-label="Pausa">❚❚</button>
        <button class="tb" data-azione="visuale" aria-label="Cambia visuale">◉</button>
        <button class="tb" data-azione="recupera" aria-label="Rimetti in pista">↺</button>
        <button class="tb solo-incl" data-azione="centra" aria-label="Centra lo sterzo">⊙</button>
      </div>`;
    hud.appendChild(el);
    this.el = el;
    const segna = () => { this.ultimoTocco = performance.now(); };
    // tasti: ogni dito resta legato al tasto sotto di lui, anche scivolando dentro la stessa zona
    for (const z of el.querySelectorAll('.tz')) {
      const trova = (x, y) => {
        let best = null, bd = Infinity;
        for (const b of z.querySelectorAll('.tt')) {
          if (!b.offsetParent) continue;          // nascosto dallo schema
          const r = b.getBoundingClientRect();
          const dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = b; }
        }
        return bd < 60 * 60 ? best : null;       // fino a 60 px fuori dal tasto conta ancora
      };
      const metti = (e) => {
        const b = trova(e.clientX, e.clientY);
        if (b) this.puntatori.set(e.pointerId, b.dataset.k); else this.puntatori.delete(e.pointerId);
        this._ricalcola();
      };
      z.addEventListener('pointerdown', (e) => { e.preventDefault(); segna(); try { z.setPointerCapture(e.pointerId); } catch { /* niente */ } metti(e); });
      z.addEventListener('pointermove', (e) => { if (this.puntatori.has(e.pointerId) || e.buttons) metti(e); });
      const via = (e) => { this.puntatori.delete(e.pointerId); this._ricalcola(); };
      z.addEventListener('pointerup', via); z.addEventListener('pointercancel', via); z.addEventListener('lostpointercapture', via);
    }
    // leva: nasce sotto il pollice, un dito solo
    const zl = el.querySelector('.zleva'), L = this.leva;
    zl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); segna();
      if (L.id !== null) return;
      try { zl.setPointerCapture(e.pointerId); } catch { /* niente */ }
      Object.assign(L, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, valore: 0 });
      this._muoviLeva(e.clientX);
    });
    zl.addEventListener('pointermove', (e) => { if (e.pointerId === L.id) this._muoviLeva(e.clientX); });
    const viaLeva = (e) => { if (e.pointerId !== L.id) return; L.id = null; L.valore = 0; this._disegnaLeva(); };
    zl.addEventListener('pointerup', viaLeva); zl.addEventListener('pointercancel', viaLeva); zl.addEventListener('lostpointercapture', viaLeva);
    // cursore: conta l'altezza del dito lungo la barra, ovunque si tocchi nella zona
    const zc = el.querySelector('.zcursore'), C = this.cursore;
    const muoviC = (e) => {
      const r = el.querySelector('.cbarra').getBoundingClientRect();
      C.u = posizioneCursore(e.clientY, r.top, r.bottom);
      const v = leggiCursore(C.u), zona = v.gas > 0 ? 1 : v.freno > 0 ? -1 : 0;
      if (C.zona !== undefined && zona !== C.zona) this.vibra(8);   // passata la tacca: un colpetto (Android)
      C.zona = zona; C.gas = v.gas; C.freno = v.freno;
      this._disegnaCursore();
    };
    zc.addEventListener('pointerdown', (e) => {
      e.preventDefault(); segna();
      if (C.id !== null) return;
      try { zc.setPointerCapture(e.pointerId); } catch { /* niente */ }
      C.id = e.pointerId; C.zona = undefined; muoviC(e);
    });
    zc.addEventListener('pointermove', (e) => { if (e.pointerId === C.id) muoviC(e); });
    const viaC = (e) => { if (e.pointerId !== C.id) return; C.id = null; C.gas = 0; C.freno = 0; C.u = CURSORE.tacca; this._disegnaCursore(); };
    zc.addEventListener('pointerup', viaC); zc.addEventListener('pointercancel', viaC); zc.addEventListener('lostpointercapture', viaC);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const b of el.querySelectorAll('.tb')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); segna(); this._azione(b.dataset.azione); });
    }
    addEventListener('resize', () => this._disegnaLeva());
    // inclinazione: gravità vista dal telefono
    addEventListener('devicemotion', (e) => this._moto(e));
    // il permesso ai sensori su iPhone va chiesto dentro un tocco: lo chiede il pulsante VIA
    $id('go')?.addEventListener('click', () => this.chiediPermesso(), true);
    this._disegnaLeva(); this._disegnaCursore();
  }

  get raggio() { return raggioLeva(innerHeight, this.s.telLeva || 'media'); }

  _muoviLeva(x) {
    const L = this.leva, r = leggiLeva(L.ox, x, this.raggio);
    const prima = L.valore;
    L.ox = r.ox; L.x = x; L.valore = r.valore;
    if (navigator.vibrate && prima !== 0 && Math.sign(r.valore) !== Math.sign(prima)) this.vibra(6);   // ripassata dal centro
    this._disegnaLeva();
  }

  /** leva: a riposo un cerchio tenue in basso a sinistra; col pollice giù base e pomello sotto il dito */
  _disegnaLeva() {
    const el = this.el?.querySelector('.leva');
    if (!el) return;
    const L = this.leva, R = this.raggio, att = L.id !== null;
    const cx = att ? L.ox : Math.max(R + 24, innerWidth * 0.16), cy = att ? L.oy : innerHeight - Math.max(R + 30, innerHeight * 0.3);
    el.classList.toggle('riposo', !att);
    el.style.cssText = `--r:${R}px;left:${cx}px;top:${cy}px`;
    const dx = att ? Math.max(-R, Math.min(R, L.x - L.ox)) : 0;
    el.querySelector('.lpomo').style.transform = `translate(calc(-50% + ${dx}px), -50%)`;
  }

  _disegnaCursore() {
    const el = this.el?.querySelector('.cbarra');
    if (!el) return;
    const C = this.cursore;
    el.style.setProperty('--g', C.gas.toFixed(3));
    el.style.setProperty('--f', C.freno.toFixed(3));
    el.style.setProperty('--u', C.u.toFixed(3));
    el.classList.toggle('attivo', C.id !== null);
  }

  _ricalcola() {
    const t = { sx: false, dx: false, gas: false, freno: false, mano: false };
    for (const k of this.puntatori.values()) t[k] = true;
    this.tasti = t;
    if (this.el) for (const b of this.el.querySelectorAll('.tt')) b.classList.toggle('giu', !!t[b.dataset.k]);
  }

  _azione(a) {
    const app = this.app, I = app.input;
    if (a === 'pausa') { if (app.mode === 'race') app.setPause(!app.paused); }
    else if (a === 'visuale') I.handlers.KeyC?.();
    else if (a === 'recupera') I.handlers.KeyR?.();
    else if (a === 'centra') { this.centra(); app.hud.message('STERZO CENTRATO', 900); }
  }

  /** schema e opzioni dal menu: cosa si vede sullo schermo */
  aggiornaSchema() {
    const B = document.body.classList, st = this.sterzo, pe = this.pedali;
    for (const k of ['tasti', 'leva', 'inclinazione']) B.toggle(`ster-${k}`, st === k);
    for (const k of ['tasti', 'cursore']) B.toggle(`ped-${k}`, pe === k);
    B.toggle('tel-incl', st === 'inclinazione');                 // righe del menu solo per l'inclinazione
    B.toggle('tel-gas-auto', !!this.s.telGas);
    B.toggle('tel-freno-auto', !!this.s.telFreno);
    this._disegnaLeva();
  }

  // ------------------------------------------------------------------ inclinazione
  async chiediPermesso() {
    if (!this.attivo || this.sterzo !== 'inclinazione') return;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') this.app.hud?.message?.('INCLINAZIONE NON PERMESSA: USA LEVA O TASTI', 2600);
      }
    } catch { /* niente */ }
  }

  _moto(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    // gravità nelle coordinate dello schermo (x a destra, y in alto, z verso chi guarda), secondo come è girato
    const ang = ((screen.orientation && screen.orientation.angle) ?? (typeof window.orientation === 'number' ? window.orientation : 0)) * Math.PI / 180;
    const c = Math.cos(ang), s = Math.sin(ang);
    const sx = g.x * c - g.y * s, sy = g.x * s + g.y * c, sz = g.z || 0;
    const n = Math.hypot(sx, sy, sz);
    if (n < 4) return;
    // la specifica dà la reazione alla gravità (verso l'alto); qualche browser la dà al contrario. Tenendo il telefono
    // normalmente (schermo verso chi guarda o verso l'alto) la reazione ha y e z positivi: da lì si capisce il verso
    if (!this.incl.segno && Math.abs(sy + sz) > 3) this.incl.segno = Math.sign(sy + sz);
    const k = this.incl.segno || 1;
    const giuX = -k * sx / n;                               // componente laterale del «giù»: >0 = inclinato a destra
    this.incl.grezzo = Math.asin(Math.max(-1, Math.min(1, giuX)));
    this.incl.ok = true;
  }

  centra() { this.incl.centro = this.incl.filtro; }

  _sterzoIncl(dt) {
    const I = this.incl;
    I.filtro += (I.grezzo - I.filtro) * Math.min(1, dt / 0.06);           // filtro: ~60 ms
    const pieno = ((this.s.telSens || 22) * Math.PI) / 180, morto = 1.5 * Math.PI / 180;
    let a = I.filtro - I.centro;
    a = Math.sign(a) * Math.max(0, Math.abs(a) - morto);
    const x = Math.max(-1, Math.min(1, a / (pieno - morto)));
    return Math.sign(x) * Math.pow(Math.abs(x), 1.2);
  }

  // ------------------------------------------------------------------ pacchetto per la fisica
  leggi(dt, speed) {
    const app = this.app, race = app.race, car = app.player, T = this.tasti, L = this.leva, C = this.cursore;
    if (race !== this._race) { this._race = race; this.ped = race && car ? new PedaliAutomatici(car, race.lineaPer(car)) : null; if (race && !race.started) this.centra(); }
    if (race && !race.started && this.sterzo === 'inclinazione') this.centra();      // in griglia il centro segue il telefono
    let steer;
    if (this.sterzo === 'inclinazione' && this.incl.ok) steer = this._sterzoIncl(dt);
    else if (this.sterzo === 'leva') {
      // leva: valore analogico con un filtro corto; dito alzato → al centro in ~0,1 s
      if (L.id !== null) L.filtro += (L.valore - L.filtro) * Math.min(1, dt / LEVA.filtro);
      else L.filtro -= Math.sign(L.filtro) * Math.min(Math.abs(L.filtro), LEVA.ritorno * dt);
      steer = L.filtro;
    } else {
      // tasti: stessa rampa della tastiera (Input.sample in main.js)
      const target = (T.dx ? 1 : 0) - (T.sx ? 1 : 0), S = MODELLO.sterzo;
      const rate = target === 0 ? 6.5 : (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? S.inverti : S.su / (1 + speed / S.v0));
      const d = target - this.steer;
      steer = this.steer + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    this.steer = steer;
    let throttle, brake, gasDito, frenoDito;
    if (this.pedali === 'cursore') {
      // cursore: dosato dal dito, con un filtro corto; dito alzato → niente
      const k = Math.min(1, dt / CURSORE.filtro);
      C.fg = C.gas > 0 ? C.fg + (C.gas - C.fg) * k : 0;       // uscendo dalla zona del gas il gas si taglia subito
      C.ff = C.freno > 0 ? C.ff + (C.freno - C.ff) * k : 0;     // (e così il freno)
      throttle = this.thr = C.fg; brake = this.brk = C.ff;
      gasDito = C.fg > 0.02; frenoDito = C.ff > 0.02;
    } else {
      // pedali a schermo: digitali con la stessa morbidezza della tastiera
      this.thr += ((T.gas ? 1 : 0) - this.thr) * Math.min(1, dt * (T.gas ? 7 : 12));
      this.brk += ((T.freno ? 1 : 0) - this.brk) * Math.min(1, dt * (T.freno ? 9 : 14));
      throttle = this.thr; brake = this.brk; gasDito = T.gas; frenoDito = T.freno;
    }
    if (this.ped && race?.started && (this.s.telGas || this.s.telFreno)) {
      const p = this.ped.calcola(!!this.s.telGas, !!this.s.telFreno, gasDito ? throttle : 0, frenoDito ? brake : 0);
      throttle = p.throttle; brake = p.brake;
    }
    return { steer, throttle, brake, handbrake: T.mano };
  }

  /** comandi semitrasparenti e scritte nascoste dopo il via mentre si tocca; tutto visibile a mani ferme (23-11) */
  _vista(dt) {
    if (!this.el) return;
    const race = this.app.race, via = !!(race && race.started && this.app.mode === 'race');
    this._senzaMani = this.dita ? 0 : this._senzaMani + dt;
    const mani = via && this._senzaMani < MANI_VIA;
    if (mani !== this._mani) { this._mani = mani; this.el.classList.toggle('mani', mani); }
  }

  /** a ogni fotogramma: vista dei comandi; brevi impulsi sui cordoli e fuori pista (Android) */
  frame(dt, car, guida) {
    this._vista(dt);
    if (!guida || !car || !this.inUso() || !navigator.vibrate) return;
    this._vt = (this._vt || 0) - dt;
    if (this._vt > 0) return;
    if (car.onKerb && car.speed > 8) { this.vibra(14); this._vt = 0.11; }
    else if (car.offroad >= 2 && car.speed > 5) { this.vibra(10); this._vt = 0.2; }
  }

  /** vibrazione leggera (Android; iPhone non la permette) */
  vibra(ms) { if (this.attivo && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* niente */ } }
}


// ------------------------------------------------------------------ app sulla schermata Home (fase 2d)
const UA = navigator.userAgent;
const IPHONE = /iPhone|iPod/.test(UA);
// 25-11 (Gabriele): anche iPad (Safari su iPad si presenta come un Mac: lo si riconosce dallo schermo touch)
const IPAD = /iPad/.test(UA) || (/Macintosh/.test(UA) && (navigator.maxTouchPoints || 0) > 1);
// browser dentro le app (link aperti da Instagram, Facebook, Messenger, LinkedIn, TikTok, Snapchat, Line, app Google):
// lì «Aggiungi alla schermata Home» non c'è, prima bisogna aprire la pagina in Safari. WhatsApp e Telegram usano la
// vista di Safari, che non si distingue da Safari: per loro vale la riga «se non lo vedi» dell'avviso.
const DENTRO_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|musical_ly|BytedanceWebview|Snapchat|Line\/|GSA\//.test(UA);
const COME_APP = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const CHIAVE_AVVISO_HOME = 'cubo-corse-avviso-home';

/**
 * service worker (il telefono tiene i file del gioco, versione nel nome della cache), pulsante «Installa» su Android,
 * istruzioni per la schermata Home su iPhone e iPad (una volta, si chiudono con ✕; dai browser dentro le app ogni volta,
 * con «apri in Safari»)
 */
export function preparaApp(versione) {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(versione + '-7260c06')}`).catch((e) => console.warn('service worker', e));
  document.body.classList.toggle('come-app', COME_APP);
  const header = document.querySelector('#menu header');
  if (!header || COME_APP) return;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    let b = document.getElementById('binstalla');
    if (!b) {
      b = document.createElement('button'); b.id = 'binstalla'; b.className = 'link minstalla'; b.textContent = 'Installa l\'app';
      b.title = 'Cubo Corse sulla schermata Home: si apre a schermo intero e funziona anche senza rete';
      const rif = header.querySelector('.mnovita'); (rif ? rif.parentNode : header).insertBefore(b, rif);   // 26-11: i pulsanti stanno in .mtop
    }
    b.onclick = async () => { try { e.prompt(); await e.userChoice; } catch { /* niente */ } b.remove(); };
  });
  let visto = false;
  try { visto = localStorage.getItem(CHIAVE_AVVISO_HOME) === '1'; } catch { /* niente */ }
  if ((IPHONE || IPAD) && (DENTRO_APP || !visto)) {
    const d = document.createElement('div'); d.id = 'avvisohome';
    const condividi = '<svg viewBox="0 0 20 24" width="14" height="17" aria-hidden="true"><path d="M10 2v13M5 7l5-5 5 5M3 11v10h14V11" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    d.innerHTML = DENTRO_APP
      ? `<span>Per giocare a <b>schermo intero</b>: apri questa pagina <b>in Safari</b> (menu <b>···</b> → <b>Apri in Safari</b> o <b>Apri nel browser</b>), poi tocca <b>Condividi</b> ${condividi} e <b>Aggiungi alla schermata Home</b>.</span><button aria-label="Chiudi">✕</button>`
      : `<span>Per giocare a <b>schermo intero</b>: tocca <b>Condividi</b> ${condividi} e poi <b>Aggiungi alla schermata Home</b>. Se non lo vedi, apri prima la pagina in Safari.</span><button aria-label="Chiudi">✕</button>`;
    d.querySelector('button').onclick = () => { d.remove(); try { localStorage.setItem(CHIAVE_AVVISO_HOME, '1'); } catch { /* niente */ } };
    header.after(d);
  }
}

/** Android nel browser: al VIA schermo intero e blocco in orizzontale (su iPhone Safari non si può: serve l'app sulla Home) */
export function schermoIntero() {
  if (!DISPOSITIVO_TOCCO || COME_APP || IPHONE || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
    .catch(() => {});
}
