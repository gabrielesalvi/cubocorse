// Comandi del telefono (fase 2b, 22-11-2026). Due schemi, scelti nel menu (Comandi → Telefono):
//  - «tasti»: sinistra e destra sotto il pollice sinistro, freno e gas sotto il destro (con la stessa rampa dello sterzo
//    della tastiera e gli stessi aiuti, perché sono tasti);
//  - «inclinazione»: il telefono in orizzontale fa da volante (angolo laterale rispetto alla gravità, quindi funziona sia
//    tenendolo dritto sia quasi piatto), freno a sinistra e gas a destra. Centro tarato da solo in griglia e con il tasto ⊙,
//    angolo pieno regolabile, filtro contro il tremolio della mano.
// Gas automatico e freno automatico (src/sim/pedali.js) si accendono a parte, con tutti e due gli schemi.
// Produce lo stesso pacchetto della tastiera e del controller (Input.sample in main.js), con il tipo 'touch' o
// 'inclinazione' per il simbolo in classifica. I tasti seguono il dito: si può scivolare da ◀ a ▶ senza alzarlo.
import { PedaliAutomatici } from '../sim/pedali.js';
import { MODELLO } from '../sim/car.js';

const $id = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
/** dispositivo col tocco (telefono, tablet); ?tocco=1 / ?tocco=0 per le prove */
export const DISPOSITIVO_TOCCO = Q.get('tocco') ? Q.get('tocco') === '1'
  : (matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0);

export class Telefono {
  constructor(app) {
    this.app = app;
    this.attivo = DISPOSITIVO_TOCCO;
    this.ultimoTocco = this.attivo ? 1 : 0;     // finché non si usa la tastiera, sul telefono guidano i tocchi
    this.tasti = { sx: false, dx: false, gas: false, freno: false, mano: false };
    this.puntatori = new Map();                  // pointerId → tasto
    this.steer = 0; this.thr = 0; this.brk = 0;
    this.incl = { grezzo: 0, filtro: 0, centro: 0, segno: 0, ok: false, tempo: 0 };
    this.ped = null; this._race = null;
    document.body.classList.toggle('tocco', this.attivo);
    if (this.attivo) this._costruisci();
    this.aggiornaSchema();
  }

  get s() { return this.app.settings; }
  get schema() { return this.s.telComandi === 'inclinazione' ? 'inclinazione' : 'tasti'; }
  get tipo() { return this.schema === 'inclinazione' ? 'inclinazione' : 'touch'; }
  /** guidano i tocchi? (sul telefono sì, finché non si preme un tasto della tastiera dopo l'ultimo tocco) */
  inUso() { return this.attivo && this.ultimoTocco >= this.app.input.ultimaTastiera; }

  // ------------------------------------------------------------------ schermo
  _costruisci() {
    const hud = $id('hud');
    const el = document.createElement('div');
    el.id = 'tocco';
    el.innerHTML = `
      <div class="tz tsx" data-zona="sx">
        <button class="tt sterzo" data-k="sx" aria-label="Sinistra">◀</button><button class="tt sterzo" data-k="dx" aria-label="Destra">▶</button>
        <button class="tt pedale freno solo-incl" data-k="freno" aria-label="Freno">FRENO</button>
      </div>
      <div class="tz tdx" data-zona="dx">
        <button class="tt mano" data-k="mano" aria-label="Freno a mano">FRENO<br>A MANO</button>
        <button class="tt pedale freno solo-tasti" data-k="freno" aria-label="Freno">FRENO</button>
        <button class="tt pedale gas" data-k="gas" aria-label="Gas">GAS</button>
      </div>
      <div class="tbar">
        <button class="tb" data-azione="pausa" aria-label="Pausa">❚❚</button>
        <button class="tb" data-azione="visuale" aria-label="Cambia visuale">◉</button>
        <button class="tb" data-azione="recupera" aria-label="Rimetti in pista">↺</button>
        <button class="tb solo-incl" data-azione="centra" aria-label="Centra lo sterzo">⊙</button>
      </div>`;
    hud.appendChild(el);
    this.el = el;
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
      z.addEventListener('pointerdown', (e) => { e.preventDefault(); this.ultimoTocco = performance.now(); try { z.setPointerCapture(e.pointerId); } catch { /* niente */ } metti(e); });
      z.addEventListener('pointermove', (e) => { if (this.puntatori.has(e.pointerId) || e.buttons) metti(e); });
      const via = (e) => { this.puntatori.delete(e.pointerId); this._ricalcola(); };
      z.addEventListener('pointerup', via); z.addEventListener('pointercancel', via); z.addEventListener('lostpointercapture', via);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const b of el.querySelectorAll('.tb')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.ultimoTocco = performance.now(); this._azione(b.dataset.azione); });
    }
    // inclinazione: gravità vista dal telefono
    addEventListener('devicemotion', (e) => this._moto(e));
    // il permesso ai sensori su iPhone va chiesto dentro un tocco: lo chiede il pulsante VIA
    $id('go')?.addEventListener('click', () => this.chiediPermesso(), true);
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
    document.body.classList.toggle('tel-incl', this.schema === 'inclinazione');
    document.body.classList.toggle('tel-gas-auto', !!this.s.telGas);
    document.body.classList.toggle('tel-freno-auto', !!this.s.telFreno);
  }

  // ------------------------------------------------------------------ inclinazione
  async chiediPermesso() {
    if (!this.attivo || this.schema !== 'inclinazione') return;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission();
        if (r !== 'granted') this.app.hud?.message?.('INCLINAZIONE NON PERMESSA: USO I TASTI', 2600);
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
    const app = this.app, race = app.race, car = app.player, T = this.tasti;
    if (race !== this._race) { this._race = race; this.ped = race && car ? new PedaliAutomatici(car, race.lineaPer(car)) : null; if (race && !race.started) this.centra(); }
    if (race && !race.started && this.schema === 'inclinazione') this.centra();      // in griglia il centro segue il telefono
    let steer;
    if (this.schema === 'inclinazione' && this.incl.ok) steer = this._sterzoIncl(dt);
    else {
      // tasti: stessa rampa della tastiera (Input.sample in main.js)
      const target = (T.dx ? 1 : 0) - (T.sx ? 1 : 0), S = MODELLO.sterzo;
      const rate = target === 0 ? 6.5 : (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? S.inverti : S.su / (1 + speed / S.v0));
      const d = target - this.steer;
      steer = this.steer + Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    }
    this.steer = steer;
    // pedali a schermo: digitali con la stessa morbidezza della tastiera
    this.thr += ((T.gas ? 1 : 0) - this.thr) * Math.min(1, dt * (T.gas ? 7 : 12));
    this.brk += ((T.freno ? 1 : 0) - this.brk) * Math.min(1, dt * (T.freno ? 9 : 14));
    let throttle = this.thr, brake = this.brk;
    if (this.ped && race?.started && (this.s.telGas || this.s.telFreno)) {
      const p = this.ped.calcola(!!this.s.telGas, !!this.s.telFreno, T.gas ? throttle : 0, T.freno ? brake : 0);
      throttle = p.throttle; brake = p.brake;
    }
    return { steer, throttle, brake, handbrake: T.mano };
  }

  /** a ogni fotogramma: brevi impulsi sui cordoli e fuori pista (Android) */
  frame(dt, car, guida) {
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
const IPHONE = /iPhone|iPod/.test(navigator.userAgent);
const COME_APP = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
const CHIAVE_AVVISO_HOME = 'cubo-corse-avviso-home';

/**
 * service worker (il telefono tiene i file del gioco, versione nel nome della cache), pulsante «Installa» su Android,
 * istruzioni per la schermata Home su iPhone (una volta, si chiudono con ✕)
 */
export function preparaApp(versione) {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(versione)}`).catch((e) => console.warn('service worker', e));
  document.body.classList.toggle('come-app', COME_APP);
  const header = document.querySelector('#menu header');
  if (!header || COME_APP) return;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    let b = document.getElementById('binstalla');
    if (!b) {
      b = document.createElement('button'); b.id = 'binstalla'; b.className = 'link minstalla'; b.textContent = 'Installa l\'app';
      b.title = 'Cubo Corse sulla schermata Home: si apre a schermo intero e funziona anche senza rete';
      header.insertBefore(b, header.querySelector('.mnovita'));
    }
    b.onclick = async () => { try { e.prompt(); await e.userChoice; } catch { /* niente */ } b.remove(); };
  });
  let visto = false;
  try { visto = localStorage.getItem(CHIAVE_AVVISO_HOME) === '1'; } catch { /* niente */ }
  if (IPHONE && !visto) {
    const d = document.createElement('div'); d.id = 'avvisohome';
    d.innerHTML = `<span>Per giocare a <b>schermo intero</b>: tocca <b>Condividi</b> <svg viewBox="0 0 20 24" width="14" height="17" aria-hidden="true"><path d="M10 2v13M5 7l5-5 5 5M3 11v10h14V11" fill="none" stroke="currentColor" stroke-width="2"/></svg> e poi <b>Aggiungi alla schermata Home</b>.</span><button aria-label="Chiudi">✕</button>`;
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
