// Cubo Corse unito (fase 0, 20-11-2026): una sola fisica per le piste di Cubo Corse e per quelle di Circuit Studio.
// Base = la guida di Circuit Studio (barriere a corpi solidi, modelli di guida, auto con inerzia e ingombri), più i pezzi
// che c'erano solo in Cubo Corse (tetto allo sterzo da tastiera in realistica). Le righe «pacchetto» vengono da Circuit Studio.
// Fisica arcade di una GT. Modello a bicicletta con carico aerodinamico, cambio automatico,
// cerchio d'attrito sul posteriore, superfici, salti, urti contro le barriere.
// Convenzioni: avanti = (cos yaw, sin yaw) sul piano x-z; destra = (-sin yaw, cos yaw); yaw>0 = svolta a destra.

import { SURF, SURF_PHYS, BAR } from './track.js';

const G = 9.81;
// punti della sagoma dell'auto per gli urti (avanti, destra) in frazioni di mezza lunghezza/larghezza (da Cubo Corse, 13-11)
const SAGOMA = [1, -1, 1, 1, -1, -1, -1, 1, 1, 0, -1, 0, 0, -1, 0, 1];
// barriere: e = rimbalzo (coefficiente di restituzione), mu = attrito di strisciata (Cubo Corse). Il cemento restituisce
// un po' di più, guardrail e reti si deformano, le gomme e il TecPro assorbono quasi tutto e frenano la strisciata.
const BARRIERA = { [BAR.WALL]: { e: 0.15, mu: 0.32 }, [BAR.GUARDRAIL]: { e: 0.1, mu: 0.38 }, [BAR.FENCE]: { e: 0.08, mu: 0.42 }, [BAR.TECPRO]: { e: 0.04, mu: 0.6 }, def: { e: 0.1, mu: 0.4 } };

// Sei auto (fase 0, decisione di Gabriele del 19-11): le tre di Cubo Corse e le tre di Circuit Studio, che cambiano
// nome e id (prima coincidevano: falco, vespro, orsa). La Fast 74 è fuori dal gioco (il modello resta in Circuit Studio).
// a, b = distanza del baricentro dall'asse anteriore e posteriore (m); iz = momento d'inerzia / massa (m²);
// aeroAnt = quota anteriore del carico aerodinamico (0,5 se manca). modello = come si disegna: 'voxel' (carmodel.js,
// Cubo Corse) o 'lowpoly' (auto3d.js, Circuit Studio, con forma = la sagoma di Circuit Studio da usare).
export const CARS = [
  // --- Cubo Corse: «balance of performance» fra tre carrozzerie
  {
    id: 'falco', nome: 'Falco GT', tipo: 'Berlinetta a motore anteriore', modello: 'voxel',
    mass: 1320, power: 420000, mu: 1.68, df: 1.30, cd: 0.49, a: 1.18, b: 1.47, cyl: 8, idleHz: 0.9,
    voce: { base: 0.5, grinta: 0.75 },
  },
  {
    id: 'vespro', nome: 'Vespro R', tipo: 'Centrale, corta e nervosa', modello: 'voxel',
    mass: 1260, power: 405000, mu: 1.72, df: 1.42, cd: 0.51, a: 1.34, b: 1.26, cyl: 6, idleHz: 1.1,
    voce: { base: 0.65, grinta: 0.9 },
  },
  {
    id: 'orsa', nome: 'Orsa CL', tipo: 'Coda lunga, velocissima sul dritto', modello: 'voxel',
    mass: 1300, power: 412000, mu: 1.66, df: 1.24, cd: 0.45, a: 1.30, b: 1.40, cyl: 12, idleHz: 1.2,
    voce: { base: 0.8, grinta: 0.6 },
  },
  // --- Circuit Studio (04-11): ispirate a tre GT vere
  // - equilibrata: motore anteriore centrale e cambio al posteriore (transaxle), pesi quasi 50/50 (Mercedes-AMG GT3);
  // - agile: motore posteriore a sbalzo, passo corto, peso sul posteriore, molta aderenza e poca inerzia (Porsche 911 GT3 R);
  // - veloce sul dritto: motore centrale, coda lunga a bassa resistenza, meno carico, più inerzia (McLaren F1 GTR Longtail).
  // Calabrone e Airone: 40% del carico aerodinamico davanti (decisione del 17-11): con il 50% fisso sopra i 150 km/h
  // sovrasterzavano (posteriore −12,1% e −4,6% di tenuta a 200 km/h, docs/fisica-cc-cs-v2.html §4.4).
  {
    id: 'astore', nome: 'Astore GT8', era: 'Falco GT8', tipo: 'Equilibrata', ispirata: 'Mercedes-AMG GT3', modello: 'lowpoly', forma: 'falco',
    motore: 'V8 6,2 litri aspirato, anteriore centrale, cambio al posteriore', disposizione: 'anteriore centrale',
    mass: 1300, power: 410000, mu: 1.70, df: 1.32, cd: 0.48, a: 1.33, b: 1.30, iz: 1.55, halfL: 2.38, cyl: 8, idleHz: 0.9,
    voce: { base: 0.45, grinta: 0.85 },
  },
  {
    id: 'calabrone', nome: 'Calabrone RS', era: 'Vespro RS', tipo: 'Agile', ispirata: 'Porsche 911 GT3 R', modello: 'lowpoly', forma: 'vespro',
    motore: 'boxer 6 cilindri 4,0 litri aspirato, posteriore a sbalzo', disposizione: 'posteriore',
    mass: 1240, power: 380000, mu: 1.73, df: 1.40, cd: 0.50, a: 1.52, b: 0.94, iz: 1.32, halfL: 2.30, aeroAnt: 0.40, cyl: 6, fam: 'b6', idleHz: 1.1,
    voce: { base: 0.7, grinta: 0.8 },
  },
  {
    id: 'airone', nome: 'Airone LT', era: 'Orsa LT', tipo: 'Veloce sul dritto', ispirata: 'McLaren F1 GTR Longtail', modello: 'lowpoly', forma: 'orsa',
    motore: 'V12 6,0 litri aspirato, centrale', disposizione: 'centrale',
    mass: 1280, power: 425000, mu: 1.66, df: 1.18, cd: 0.425, a: 1.50, b: 1.22, iz: 1.75, halfL: 2.47, aeroAnt: 0.40, cyl: 12, idleHz: 1.2,
    voce: { base: 0.8, grinta: 0.65 },
  },
];
/** indice dell'auto con quell'id (−1 se non c'è) */
export const indiceAuto = (id) => CARS.findIndex((c) => c.id === id);

const GEARS = [3.05, 2.32, 1.86, 1.53, 1.29, 1.11];
const FINAL = 3.22;
const RW = 0.34;
const IDLE = 1300, REDLINE = 8300, UP = 7850, DOWN = 4700;

function powerAt(rpm) {
  // curva di potenza normalizzata (picco ~7300 giri)
  const x = rpm / 7300;
  if (x < 1) return 0.28 + 0.72 * Math.sin((x * Math.PI) / 2) ** 1.3;
  return Math.max(0.6, 1 - (x - 1) * 0.55);
}

/**
 * Danni meccanici (modalità «Danni: meccanici»): 0 = integro, 1 = distrutto.
 * muso = ala anteriore e radiatore, alettone, motore, cambio, ruote = sospensioni/ruote [ant sx, ant dx, post sx, post dx].
 */
export function nuoviDanni() {
  return { muso: 0, alettone: 0, motore: 0, cambio: 0, ruote: [0, 0, 0, 0] };
}

/** aiuti della modalità arcade (vedi step) */
// STEER_MARGIN = «sterzo da tastiera» nel menu: dolce 0,06 (Cubo Corse) o pronto 0,16 (Circuit Studio, dal 04-11: con 0,06
// il giro arcade a Roncadelle era 9,6 s più lento dell'IA a parità di comandi). Il valore predefinito dipende dalla pista
// (MARGINI_STERZO); lo imposta main.js con setArcadeTuning. STEER_MARGIN_SIM = tetto allo sterzo da tastiera in realistica.
export const MARGINI_STERZO = { dolce: 0.06, pronto: 0.16 };
export let STEER_MARGIN = 0.06, LAT_DAMP = 0.6, STEER_MARGIN_SIM = 0.06;
export function setSimMargin(v) { STEER_MARGIN_SIM = v; }
/** interruttori degli aiuti arcade (solo per le prove: tests/steer-step.mjs) */
export const AIUTI = { controsterzo: true, limitatore: true, esc: true };
export function setArcadeTuning(m, l) { STEER_MARGIN = m; LAT_DAMP = l; }
/**
 * Modello di guida (08-11): «precedente» = quello della guida prima del riallineamento del 07-11;
 * «cubo» = quello di Cubo Corse del 07-11. Cambiano solo due cose: l'ESC (in entrambe le direzioni o solo contro il
 * sovrasterzo; vale anche per l'IA) e la rampa dello sterzo da tastiera (Input.sample in main.js). «misto» = ESC precedente
 * sotto 130 km/h e di Cubo Corse sopra, con la rampa di Cubo Corse. Predefinito: «misto» (08-11). Gli altri con ?guida=precedente|cubo nell'URL.
 * Danni, pedali assistiti e il resto delle impostazioni sono indipendenti dal modello.
 */
// Nel gioco unito (fase 0): menu «Guida» = «Agile» (misto) o «Composta» (cubo); «precedente» solo da indirizzo (?guida=precedente).
export const MODELLI_GUIDA = {
  precedente: { nome: 'Guida (prima del 07-11)', escSoloSovrasterzo: false, sterzo: { su: 3.4, v0: 45, inverti: 7 } },
  cubo: { nome: 'Composta', escSoloSovrasterzo: true, sterzo: { su: 5, v0: 60, inverti: 8 } },
  // 08-11, dai confronti di tests/modelli.mjs: ESC «precedente» sotto i 130 km/h (aiuta a far girare l'auto nelle
  // curve lente), solo contro il sovrasterzo sopra (niente pendolo), rampa dello sterzo di Cubo Corse
  misto: { nome: 'Agile', escSoloSovrasterzo: true, escSoglia: 130 / 3.6, sterzo: { su: 5, v0: 60, inverti: 8 } },
};
// predefinito della fisica = «cubo» (Cubo Corse, così i test di Cubo Corse restano quelli); il gioco lo sceglie dal menu
export const MODELLO = { k: 'cubo', ...MODELLI_GUIDA.cubo };
export function setModelloGuida(k) {
  if (!MODELLI_GUIDA[k]) k = 'cubo';
  for (const c of Object.keys(MODELLO)) delete MODELLO[c];   // niente campi rimasti dal modello di prima (es. escSoglia)
  Object.assign(MODELLO, { k }, MODELLI_GUIDA[k]);
}

/** angolo di sterzo massimo (rad) in funzione della velocità */
export function maxSteer(v) {
  return 0.6 / (1 + v / 28);
}

function tire(alpha, peak, floor = 0.8) {
  const x = Math.abs(alpha) / peak;
  const y = x < 1 ? 2 * x - x * x : Math.max(floor, 1 - 0.22 * (x - 1));
  return Math.sign(alpha) * y;
}

export class Car {
  constructor(spec, track, id = 0) {
    this.spec = spec;
    this.track = track;
    this.id = id;
    this.L = spec.a + spec.b;
    this.Iz = spec.mass * (spec.iz || 1.55);
    this.halfW = spec.halfW || 1.0;   // pacchetto: larghezza per auto (Fast 74 più larga)
    this.halfL = spec.halfL || 2.3;
    this.aeroAnt = spec.aeroAnt ?? 0.5;   // fase 0: quota anteriore del carico aerodinamico (era 50/50 fisso)
    this.reset(0, 0);
    this.impacts = [];
    this.damage = 0; // 0..1 (perdita di velocità di punta piccola)
  }

  /** posiziona l'auto a (s, d) ferma */
  reset(s, d) {
    const p = this.track.pointAt(s, d);
    this.x = p.x; this.z = p.z; this.y = p.y;
    this.yaw = p.yaw;
    this.vLong = 0; this.vLat = 0; this.r = 0; this.vy = 0;
    this.gear = 1; this.rpm = IDLE; this.shiftT = 0;
    this.steer = 0; this.delta = 0;
    this.throttle = 0; this.brake = 0; this.handbrake = false;
    this.ax = 0; this.ay = 0;
    this.air = 0;
    this.proj = this.track.project(this.x, this.z, p.i, {});
    this.hint = this.proj.i;
    this.wheelSpin = 0;
    this.slipF = 0; this.slipR = 0; this.skid = 0;
    this.surfaces = [SURF.ROAD, SURF.ROAD, SURF.ROAD, SURF.ROAD];
    this.onKerb = 0; this.offroad = 0;
    this.pitch = 0; this.roll = 0;
    this.ghost = 0; // secondi di "fantasma" dopo un reset (niente urti fra auto)
    // i danni meccanici NON si azzerano con la rimessa in pista (R): solo una nuova auto riparte integra
    if (!this.dmg) this.dmg = nuoviDanni();
  }

  get speed() {
    return Math.hypot(this.vLong, this.vLat);
  }
  get vx() {
    return this.vLong * Math.cos(this.yaw) - this.vLat * Math.sin(this.yaw);
  }
  get vz() {
    return this.vLong * Math.sin(this.yaw) + this.vLat * Math.cos(this.yaw);
  }
  setWorldVel(vx, vz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.vLong = vx * c + vz * s;
    this.vLat = -vx * s + vz * c;
  }

  /**
   * inp: {throttle 0..1, brake 0..1, steer -1..1 (già filtrato), handbrake bool, assist bool, sterzoLibero bool}
   * env: {wet: 0..1}
   */
  step(dt, inp, env) {
    const sp = this.spec, m = sp.mass, tr = this.track;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const v = Math.hypot(this.vLong, this.vLat);
    if (this.ghost > 0) this.ghost -= dt;

    // ---- pista sotto l'auto
    const p = tr.project(this.x, this.z, this.hint, this.proj);
    this.hint = p.i;
    const tnx = tr.nx[p.i], tnz = tr.nz[p.i];
    // ruote: ant sx, ant dx, post sx, post dx
    const wx = [sp.a, sp.a, -sp.b, -sp.b], wy = [-0.82, 0.82, -0.82, 0.82];
    let muF = 0, muR = 0, drag = 0, dragV = 0, kerb = 0, off = 0;
    const wet = env.wet || 0;
    for (let k = 0; k < 4; k++) {
      const ox = c * wx[k] - s * wy[k], oz = s * wx[k] + c * wy[k];
      const dw = p.d + ox * tnx + oz * tnz;
      const ad = Math.abs(dw), hw = p.w / 2;
      const E = dw >= 0 ? tr.R : tr.L;
      // libero (17-11-2026): giro libero su una mappa, la superficie si legge sotto la ruota (MappaLibera)
      let type = tr.libero ? tr.superficieIn(this.x + ox, this.z + oz) : ad <= hw ? SURF.ROAD : ad <= hw + E.kerb[p.i] ? SURF.KERB : E.run[p.i];
      this.surfaces[k] = type;
      const ph = SURF_PHYS[type];
      let mu = ph.mu;
      if (wet) mu *= type === SURF.ROAD || type === SURF.RUNOFF ? 1 - 0.24 * wet : type === SURF.KERB ? 1 - 0.4 * wet : 1 - 0.15 * wet;
      // ruota/sospensione danneggiata: meno aderenza; rotta: quasi niente, e struscia
      const rd = this.dannoOn ? this.dmg.ruote[k] : 0;
      if (rd > 0) mu *= rd >= 1 ? 0.15 : 1 - 0.55 * rd;
      if (k < 2) muF += mu / 2; else muR += mu / 2;
      drag += ph.drag / 4 + (rd >= 1 ? 1.6 : rd * 0.25); dragV += ph.dragV / 4;
      if (type === SURF.KERB) kerb++;
      if (type === SURF.GRASS || type === SURF.GRAVEL) off++;
    }
    this.onKerb = kerb; this.offroad = off;

    // ---- quota / salti
    const gy = tr.groundY(p);
    const along = c * tr.tx[p.i] + s * tr.tz[p.i];
    let slopeH = tr.slope[p.i] * along, latoH = 0;
    if (tr.libero) { const g = tr.pendenzaIn(this.x, this.z, this._pend || (this._pend = {})); slopeH = g.x * c + g.z * s; latoH = -g.x * s + g.z * c; }   // libero: pendenza del terreno
    const vyTrack = slopeH * this.vLong;
    this.landing = 0;
    let fondo = 0;
    if (this.air === 0) {
      // il terreno "scende" più in fretta della gravità → decollo (dossi, Cavatappi)
      if (vyTrack - this.vy < -G * dt * 1.2 && v > 22) {
        this.air = dt;
        this.y += this.vy * dt;
      } else {
        // 21-11: compressione (il terreno spinge l'auto in su più di 1,8 g in velocità): il fondo tocca l'asfalto
        const su = (vyTrack - this.vy) / dt;
        if (v > 25 && su > 1.8 * G) fondo = Math.min(1, (su / G - 1.8) / 1.5 + 0.25);
        this.y = gy;
        this.vy = vyTrack;
      }
    } else {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      this.air += dt;
      if (this.y <= gy) {
        this.landing = Math.max(0, vyTrack - this.vy);
        if (this.landing > 1.6) fondo = Math.min(1, (this.landing - 1.6) / 2 + 0.3);   // atterraggio pesante: il fondo striscia
        this.y = gy;
        this.vy = vyTrack;
        this.air = 0;
      }
    }
    // fondo che tocca (0-1): scintille dal diffusore (gfx) e strisciata; si spegne in ~0,15 s
    this.fondo = Math.max(fondo, (this.fondo || 0) - dt * 6);
    const inAir = this.air > 0;

    // ---- comandi
    this.throttle = inp.throttle; this.brake = inp.brake; this.handbrake = !!inp.handbrake;
    let thr = inp.throttle, brk = inp.brake;
    if (this.gear === -1) {
      // retromarcia: il freno spinge indietro, il gas frena
      [thr, brk] = [inp.brake, inp.throttle];
      if (inp.throttle > 0.1 && v < 1.0) this.gear = 1;
    } else if (inp.brake > 0.5 && inp.throttle < 0.05 && v < 0.8) {
      this._revT = (this._revT || 0) + dt;
      if (this._revT > 0.35) { this.gear = -1; this._revT = 0; }
    } else this._revT = 0;

    // modalità: arcade (tastiera con aiuti), realistica (giocatore senza aiuti), IA (né l'una né l'altra).
    // libero = arcade senza aiuti allo sterzo (controller con «Aiuti allo sterzo: No», 22-11): la fisica resta quella
    // arcade del giocatore (ESC del modello di guida, sbandata smorzata), ma niente tetto allo sterzo, niente controsterzo
    // automatico e niente limitatore di deriva. Prima «No» mandava assist: false e la fisica girava in modalità IA.
    const arcade = !!inp.assist && !inp.sim, sim = !!inp.sim, libero = arcade && !!inp.sterzoLibero;
    let dmax = maxSteer(v);
    if ((arcade && !libero && v > 12) || (sim && inp.assist && !inp.sterzoLibero && v > 8)) {
      // in velocità il tasto gira le ruote quanto le gomme possono reggere (più un margine per sentire il limite),
      // non di più: altrimenti ogni colpo di sterzo diventa una sbandata e al rilascio l'auto fa il pendolo.
      // In realistica (solo tastiera, da Cubo Corse) si ferma poco oltre l'angolo di massima aderenza: con un tasto non si
      // può dosare, e a fondo le gomme anteriori andavano oltre il limite (1,05 g invece di 1,5 a 60 km/h)
      const aMax = sp.mu * (G + (sp.df * v * v) / m);
      dmax = Math.min(dmax, (this.L * aMax) / (v * v) + (sim ? STEER_MARGIN_SIM : STEER_MARGIN));
    }
    let delta = inp.steer * dmax;
    if (this.dannoOn) {
      // anteriore piegata: l'auto tira dalla parte della ruota più danneggiata
      delta += (this.dmg.ruote[1] - this.dmg.ruote[0]) * 0.035;
      if (this.distrutta) delta = 0;
    }
    const vls = Math.max(Math.abs(this.vLong), 2.5);
    const beta = Math.atan2(this.vLat, vls);
    if (arcade && !libero && AIUTI.controsterzo && v > 6 && Math.abs(beta) > 0.07) {
      // controsterzo automatico (solo tastiera)
      delta += Math.max(-0.25, Math.min(0.25, (beta - Math.sign(beta) * 0.07) * 0.8));
    }
    // limitatore di deriva: le ruote anteriori non superano il picco di aderenza (non in modalità realistica)
    if (!sim && !libero && (AIUTI.limitatore || !arcade) && v > 8 && this.air === 0) {
      const aKin = Math.atan2(this.vLat + this.r * sp.a, vls) * (this.vLong >= 0 ? 1 : -1);
      const lim = 0.135;
      delta = Math.max(aKin - lim, Math.min(aKin + lim, delta));
    }
    this.delta = delta;

    // ---- carichi
    const dfk = sp.df * (1 - this.damage * 0.25);
    // aria sporca: da molto vicino a un'altra auto si perde un po' di carico (vedi Race._scia)
    const down = inAir ? 0 : dfk * v * v * (1 - (this.dirty || 0));
    const Lw = this.L;
    const transfer = (m * this.ax * (sim ? 0.42 : 0.18)) / Lw;
    const kMuso = this.dannoOn ? 1 - 0.6 * this.dmg.muso : 1, kAla = this.dannoOn ? 1 - 0.7 * this.dmg.alettone : 1;
    const FzF = inAir ? 0 : Math.max(200, (m * G * sp.b) / Lw + down * this.aeroAnt * kMuso - transfer);
    const FzR = inAir ? 0 : Math.max(200, (m * G * sp.a) / Lw + down * (1 - this.aeroAnt) * kAla + transfer);
    const mu = sp.mu;

    // ---- motore e cambio
    const dir = this.gear === -1 ? -1 : 1;
    const ratio = this.gear === -1 ? 3.0 : GEARS[this.gear - 1];
    const wheelRpm = (Math.abs(this.vLong) / RW) * 60 / (2 * Math.PI);
    let rpm = wheelRpm * ratio * FINAL;
    if (rpm < 2600 && thr > 0.05) rpm = Math.max(rpm, 2600 + thr * 2600 * Math.max(0, 1 - v / 12)); // frizione
    rpm = Math.max(IDLE + thr * 400, rpm);
    if (this.shiftT > 0) this.shiftT -= dt;
    if (this.gear > 0 && this.shiftT <= 0) {
      // cambio danneggiato: cambiate più lente e, oltre metà danno, niente marce alte
      const maxGear = this.dannoOn ? 6 - Math.floor(Math.max(0, this.dmg.cambio - 0.4) * 6.7) : 6;
      const tCambio = this.dannoOn ? 1 + 2.5 * this.dmg.cambio : 1;
      if (rpm > UP && this.gear < maxGear) { this.gear++; this.shiftT = 0.09 * tCambio; this.onShift && this.onShift(1); }
      else if (this.gear > 1) {
        const lower = wheelRpm * GEARS[this.gear - 2] * FINAL;
        if ((rpm < DOWN && lower < UP - 600) || (brk > 0.3 && lower < UP - 900 && rpm < 6500)) {
          this.gear--; this.shiftT = 0.07; this.onShift && this.onShift(-1);
        }
      }
    }
    this.rpm += (Math.min(rpm, REDLINE + 150) - this.rpm) * Math.min(1, dt * 18);
    let Fdrive = 0;
    if (this.shiftT <= 0 && thr > 0) {
      let P = sp.power * powerAt(this.rpm) * (1 - this.damage * 0.06);
      if (this.dannoOn) P *= this.dmg.motore >= 1 || this.distrutta ? 0 : 1 - 0.65 * this.dmg.motore;
      const omega = (this.rpm * 2 * Math.PI) / 60;
      const torque = P / Math.max(omega, 100);
      Fdrive = (torque * ratio * FINAL * 0.92) / RW * thr;
      // limitatore morbido: la spinta cala negli ultimi 100 giri invece di accendersi e spegnersi a ogni passo
      if (this.rpm > REDLINE - 100) Fdrive *= Math.max(0.1, (REDLINE - this.rpm) / 100);
      if (this.gear === -1 && Math.abs(this.vLong) > 7) Fdrive = 0;
    }

    // ---- gomme
    const peak = 0.11;
    const signV = this.vLong >= 0 ? 1 : -1;
    const aF = Math.atan2(this.vLat + this.r * sp.a, vls) - delta * signV;
    const aR = Math.atan2(this.vLat - this.r * sp.b, vls);
    let capF = mu * muF * FzF, capR = mu * muR * FzR;
    if (this.handbrake) capR *= 0.42;
    const floor = sim ? 0.68 : 0.8; // realistica: oltre il limite la gomma molla di più
    let FyF = -tire(aF, peak, floor) * capF;
    let FyR = -tire(aR, peak, floor) * capR;
    // freni (con ABS) e trazione nel cerchio d'attrito
    const Fbmax = mu * (muF * FzF + muR * FzR) * 0.98;
    let Fb = (this.distrutta ? Math.max(brk, 0.55) : brk) * Fbmax;
    if (this.handbrake) Fb += 0.35 * capR;
    let Fx = Fdrive * dir;
    // controllo di trazione morbido
    const fxCap = Math.sqrt(Math.max(0, capR * capR - FyR * FyR * 0.6));
    if (sim) {
      // niente controllo di trazione: oltre il cerchio d'attrito le ruote pattinano (spinta ridotta, posteriore che scappa)
      if (Math.abs(Fx) > fxCap) { Fx = Math.sign(Fx) * fxCap * 0.85; this.spin = 1; } else this.spin = 0;
    } else if (Math.abs(Fx) > fxCap) Fx = Math.sign(Fx) * (fxCap + (Math.abs(Fx) - fxCap) * 0.15);
    // il posteriore perde laterale quando spinge forte (sovrasterzo di potenza)
    const useR = Math.min(1, Math.abs(Fx) / Math.max(capR, 1) + (sim && this.spin ? 0.25 : 0));
    FyR *= Math.sqrt(Math.max(0.25, 1 - useR * useR * 0.85));
    const useB = Math.min(1, Fb / Math.max(Fbmax, 1));
    FyF *= 1 - useB * 0.18; FyR *= 1 - useB * 0.22;
    this.slipF = Math.abs(aF); this.slipR = Math.abs(aR);
    this.skid = Math.max(0, Math.max(Math.abs(aF), Math.abs(aR)) - peak * 0.9) * v * 0.15 + (useB > 0.95 && v > 5 ? 0.3 : 0) + (useR > 0.98 && thr > 0.8 && v < 14 ? 0.25 : 0);
    if (inAir) { FyF = 0; FyR = 0; Fx = 0; Fb = 0; }

    // ---- forze sul corpo
    // scia: dietro un'altra auto la resistenza dell'aria cala (this.draft 0..0,45, vedi Race._scia)
    const aero = sp.cd * (1 - (this.draft || 0)) * (this.dannoOn ? 1 + 0.18 * this.dmg.muso + 0.1 * this.dmg.alettone : 1);
    const slopeForce = -m * G * slopeH;
    let FxB = Fx - FyF * Math.sin(delta) - aero * this.vLong * v - 4 * this.vLong + slopeForce;
    let FyB = FyF * Math.cos(delta) + FyR - aero * 0.5 * this.vLat * v;
    // freni e freno della superficie si oppongono al moto
    const surfDecel = (drag + dragV * v) * m * (inAir ? 0 : 1);
    const decel = Fb + surfDecel;
    if (Math.abs(this.vLong) > 0.05) FxB -= Math.sign(this.vLong) * decel;
    else if (Math.abs(Fx) < decel) { FxB = 0; this.vLong = 0; }
    const torque = sp.a * FyF * Math.cos(delta) - sp.b * FyR;

    this.ax = FxB / m;
    this.ay = FyB / m;
    this.vLong += (this.ax + this.r * this.vLat) * dt;
    this.vLat += (this.ay - this.r * this.vLong) * dt;
    this.r += (torque / this.Iz) * dt;
    // smorzamento d'imbardata e modello cinematico a bassa velocità
    this.r *= 1 - Math.min(0.5, dt * ((sim ? 0.35 : 0.8) + (inAir ? 2 : 0)));
    // controllo di stabilità (arcade): frena l'imbardata in eccesso rispetto a quella "di guida"
    if (!inAir && v > 8) {
      const rk = (this.vLong * Math.tan(delta)) / Lw;
      const ex = this.r - rk;
      const tol = 0.12 + (this.handbrake ? 1.5 : 0) + (inp.esc === false || sim || (arcade && !AIUTI.esc) ? 9 : 0);
      // modello «precedente»: corregge in entrambe le direzioni (anche nel sottosterzo aggiunge rotazione);
      // modello «cubo»: solo contro il sovrasterzo (l'auto gira più di quanto chiede lo sterzo)
      // fase 0: il modello è dell'auto (l'IA usa quello del profilo della pista, il giocatore quello del menu)
      const MG = this.modelloGuida || MODELLO;
      if (Math.abs(ex) > tol && (!MG.escSoloSovrasterzo || v < (MG.escSoglia || 0) || Math.sign(ex) === Math.sign(this.r))) this.r -= (ex - Math.sign(ex) * tol) * Math.min(1, dt * 6);
    }
    // arcade: la sbandata laterale si smorza un po' (auto più composta, niente pendolo)
    if (arcade && !inAir && !this.handbrake && v > 10) this.vLat *= 1 - Math.min(0.05, dt * LAT_DAMP);
    if (v < 4 && !inAir) {
      const k = 1 - v / 4;
      const rk = (this.vLong * Math.tan(delta)) / Lw;
      this.r += (rk - this.r) * k * Math.min(1, dt * 12);
      this.vLat *= 1 - k * Math.min(1, dt * 8);
    }
    if (Math.abs(this.vLong) < 0.3 && thr < 0.05 && brk > 0.05) this.vLong *= 0.9;

    // ---- integrazione posizione (posa di prima per gli urti con le barriere vere: lato da cui si arriva)
    this._x0 = this.x; this._z0 = this.z; this._yaw0 = this.yaw;
    const vx = this.vLong * c - this.vLat * s;
    const vz = this.vLong * s + this.vLat * c;
    this.x += vx * dt;
    this.z += vz * dt;
    this.yaw += this.r * dt;
    if (this.yaw > Math.PI) this.yaw -= 2 * Math.PI;
    if (this.yaw < -Math.PI) this.yaw += 2 * Math.PI;
    this.wheelSpin += (this.vLong / RW) * dt;

    // ---- barriere
    this._barriers(dt);

    // ---- assetto visivo (beccheggio/rollio)
    const tgtPitch = Math.atan(slopeH) + Math.max(-0.05, Math.min(0.04, this.ax * 0.0028));
    const tgtRoll = Math.max(-0.07, Math.min(0.07, this.ay * 0.0045));
    this.pitch += (tgtPitch - this.pitch) * Math.min(1, dt * 10);
    this.roll += (tgtRoll - this.roll) * Math.min(1, dt * 8);
    // inclinazione trasversale della strada vista dall'auto (rad, >0 = lato destro più alto)
    this.bankRoll = tr.libero ? Math.atan(latoH) : Math.abs(p.d) < p.w / 2 ? Math.atan(Math.tan(p.bank)) * along : 0;
    this.slopeH = slopeH;
  }

  /**
   * Barriere vere (pacchetto, 13-11-2026), come in Cubo Corse: otto punti della sagoma (spigoli e metà dei lati) contro
   * i corpi delle barriere, più gli spigoli delle barriere (estremi e angoli) contro il rettangolo dell'auto. Ogni
   * contatto dà un impulso nel punto toccato (rimbalzo e attrito secondo il tipo), quindi un urto di spigolo fa girare
   * l'auto, un frontale la ferma, una strisciata la rallenta. Dopo, la vecchia distanza dal centro resta solo come rete
   * di sicurezza (30 m oltre il bordo, Track.barrier).
   */
  _barriereVere(dt = 1 / 120) {
    const tr = this.track, hl = this.halfL, hw = this.halfW;
    let sJ = 0, sLx = 0, sLz = 0;   // strisciata (22-11): spinta del muro in questo passo e dove tocca, per i danni
    if (this._x0 === undefined || Math.hypot(this.x - this._x0, this.z - this._z0) > 3) { this._x0 = this.x; this._z0 = this.z; this._yaw0 = this.yaw; }   // primo passo o auto rimessa in pista
    const c0 = Math.cos(this._yaw0), s0 = Math.sin(this._yaw0);
    let forte = null, tocco = false;
    for (let iter = 0; iter < 3; iter++) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const lx = SAGOMA[k * 2] * hl, lz = SAGOMA[k * 2 + 1] * hw;
        const px = this.x + lx * cy - lz * sy, pz = this.z + lx * sy + lz * cy;
        const ox = this._x0 + lx * c0 - lz * s0, oz = this._z0 + lx * s0 + lz * c0;
        const c = tr.contattoSolido(px, pz, ox, oz, this._x0, this._z0, this.y, this._bc || (this._bc = {}));
        if (!c) continue;
        n++;
        const vn = this._urto(px, pz, c.nx, c.nz, c.depth, c.type);
        if (vn > 0) { sJ += this._jn; sLx += this._jn * lx; sLz += this._jn * lz; }
        if (vn > 0 && (!forte || vn > forte.speed)) forte = { speed: vn, x: px, z: pz, nx: -c.nx, nz: -c.nz };
      }
      for (const k of tr.spigoliSolidi(this.x, this.z)) {
        const sp = tr.solSpigoli[k];
        if (Math.abs(sp.y - this.y) > 3) continue;
        const dx = sp.x - this.x, dz = sp.z - this.z;
        const lx = dx * cy + dz * sy, lz = -dx * sy + dz * cy;
        const ex = hl + sp.r - Math.abs(lx), ez = hw + sp.r - Math.abs(lz);
        if (ex <= 0 || ez <= 0) continue;
        n++;
        // l'auto si sposta lungo la faccia meno penetrata, lontano dallo spigolo
        let nx, nz, dep;
        if (ez < ex) { const g = -Math.sign(lz || 1); nx = -sy * g; nz = cy * g; dep = ez; } else { const g = -Math.sign(lx || 1); nx = cy * g; nz = sy * g; dep = ex; }
        const vn = this._urto(sp.x, sp.z, nx, nz, dep, sp.type);
        if (vn > 0) { sJ += this._jn; sLx += this._jn * lx; sLz += this._jn * lz; }
        if (vn > 0 && (!forte || vn > forte.speed)) forte = { speed: vn, x: sp.x, z: sp.z, nx: -nx, nz: -nz };
      }
      if (!n) break;
      tocco = true;
    }
    if (forte && forte.speed > 1.2) this.impacts.push({ type: 'muro', car: this, speed: forte.speed, x: forte.x, z: forte.z, y: this.y + 0.5, nx: forte.nx, nz: forte.nz, scrape: forte.speed < 4 });
    if (tocco && this.speed > 5) this.scraping = 0.15;
    // strisciata (22-11, M240): spinta media del muro in g e punto medio del contatto (avanti, destra) in coordinate
    // dell'auto. La legge Race._dannoStrisciata: una strisciata lunga a muro consuma ruote e sospensioni di quel lato
    this.strisciata = sJ > 0 ? { g: sJ / this.spec.mass / dt / G, lx: sLx / sJ, lz: sLz / sJ } : null;
  }

  /**
   * Impulso di contatto nel punto (px, pz) con normale (nx, nz) verso dove spingere e compenetrazione dep (Cubo Corse).
   * Ritorna la velocità d'avvicinamento del punto (m/s, 0 se si stava già staccando).
   */
  _urto(px, pz, nx, nz, dep, type) {
    this.x += nx * dep; this.z += nz * dep;
    const rx = px - this.x, rz = pz - this.z;
    const vx = this.vx, vz = this.vz, w = this.r;
    const vpx = vx - w * rz, vpz = vz + w * rx; // velocità del punto: v + ω × r
    const vn = vpx * nx + vpz * nz;
    if (vn >= 0) return 0;
    const B = BARRIERA[type] || BARRIERA.def;
    const m = this.spec.mass, I = Math.max(this.Iz, m * 2.4); // inerzia vera di una GT (~2,4 m²·massa)
    const rn = rx * nz - rz * nx;
    const jn = (-(1 + B.e) * vn) / (1 / m + (rn * rn) / I);
    const tx = -nz, tz = nx, vt = vpx * tx + vpz * tz, rt = rx * tz - rz * tx;
    let jt = -vt / (1 / m + (rt * rt) / I);
    const jm = B.mu * jn;
    jt = jt > jm ? jm : jt < -jm ? -jm : jt;
    const Jx = jn * nx + jt * tx, Jz = jn * nz + jt * tz;
    this._jn = jn;
    this.setWorldVel(vx + Jx / m, vz + Jz / m);
    this.r = w + (rx * Jz - rz * Jx) / I;
    if (this.r > 5) this.r = 5; else if (this.r < -5) this.r = -5;
    return -vn;
  }

  _barriers(dt = 1 / 120) {
    if (this.track.solSeg) this._barriereVere(dt);
    const tr = this.track, p = this.track.project(this.x, this.z, this.hint, this.proj);
    const rel = this.yaw - Math.atan2(tr.tz[p.i], tr.tx[p.i]);
    const half = this.halfW * Math.abs(Math.cos(rel)) + this.halfL * Math.abs(Math.sin(rel));
    for (const side of [1, -1]) {
      const bd = tr.barrier(p, side);
      const pen = side * p.d + half - bd;
      if (pen > 0) {
        const nx = tr.nx[p.i] * side, nz = tr.nz[p.i] * side; // normale verso la barriera
        this.x -= nx * pen;
        this.z -= nz * pen;
        const vx = this.vx, vz = this.vz;
        const vn = vx * nx + vz * nz;
        if (vn > 0) {
          // rimbalzo per tipo di barriera: il muro restituisce poco, guardrail e reti si deformano, il TecPro assorbe
          const bt = (side > 0 ? tr.R : tr.L).bar[p.i];
          const e = bt === BAR.WALL ? 0.08 : bt === BAR.TECPRO ? 0 : 0.04;
          let nvx = vx - (1 + e) * vn * nx, nvz = vz - (1 + e) * vn * nz;
          // attrito lungo il muro
          const fr = Math.max(0.55, 1 - vn * 0.04);
          const tvx = nvx - (nvx * nx + nvz * nz) * nx, tvz = nvz - (nvx * nx + nvz * nz) * nz;
          nvx = tvx * fr + (nvx - tvx); nvz = tvz * fr + (nvz - tvz);
          this.setWorldVel(nvx, nvz);
          // ruota l'auto verso il parallelo al muro
          const tx = tr.tx[p.i], tz = tr.tz[p.i];
          const fwdT = Math.cos(this.yaw) * tx + Math.sin(this.yaw) * tz;
          const relN = Math.cos(this.yaw) * nx + Math.sin(this.yaw) * nz;
          this.r -= Math.sign(fwdT || 1) * relN * Math.min(1.0, vn * 0.04);
          // il contatto col muro assorbe anche parte della rotazione già presente
          this.r *= 1 - Math.min(0.25, vn * 0.02);
          if (vn > 1.2) {
            const hx = this.x + nx * half, hz = this.z + nz * half;
            this.impacts.push({ type: 'muro', car: this, speed: vn, x: hx, z: hz, y: this.y + 0.5, nx, nz, scrape: vn < 4 });
          }
        }
        // strisciata
        if (this.speed > 5) this.scraping = 0.15;
      }
    }
    // muretto della corsia box: isola solida fra pista e corsia (si urta da entrambi i lati). Con le barriere vere il
    // muretto è già fra i corpi solidi (linee muretto_box del pacchetto)
    const E = p.d >= 0 ? tr.R : tr.L;
    if (!tr.solSeg && E.isl0 && E.isl0[p.i] > 0) {
      const side = p.d >= 0 ? 1 : -1, ad = Math.abs(p.d), a = E.isl0[p.i], b = E.isl1[p.i];
      if (ad + half > a && ad - half < b) {
        const versoPista = ad < (a + b) / 2;           // da che parte del muretto sta l'auto
        const target = versoPista ? a - half : b + half;
        const push = (target - ad) * side;              // spostamento lungo la normale della pista
        const nx = tr.nx[p.i], nz = tr.nz[p.i];
        this.x += nx * push; this.z += nz * push;
        const sgn = Math.sign(push);                    // la normale del muretto punta da dove arriva l'auto
        const vn = -(this.vx * nx + this.vz * nz) * sgn; // velocità verso il muretto
        if (vn > 0) {
          const e = 0.08;
          this.setWorldVel(this.vx + (1 + e) * vn * nx * sgn, this.vz + (1 + e) * vn * nz * sgn);
          this.r *= 1 - Math.min(0.25, vn * 0.02);
          if (vn > 1.2) this.impacts.push({ type: 'muro', car: this, speed: vn, x: this.x - nx * sgn * half, z: this.z - nz * sgn * half, y: this.y + 0.5, nx: -nx * sgn, nz: -nz * sgn, scrape: vn < 4 });
        }
        if (this.speed > 5) this.scraping = 0.15;
      }
    }
    if (this.scraping > 0) this.scraping -= 1 / 120;
  }
}

export { GEARS, IDLE, REDLINE };
