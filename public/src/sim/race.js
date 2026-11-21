// Cubo Corse unito (fase 0, 20-11-2026): regole di gara uniche. Base = Circuit Studio (righe «pacchetto»: danni attenuati
// fra IA, profilo dell'IA sul bagnato, piazzole di griglia, IA distrutta o ritirata, limitatore in corsia box, stima dei
// tempi), più le regole che c'erano solo in Cubo Corse (time trial lanciato, danni spenti nel time trial, auto del
// giocatore guidata dall'IA dopo il traguardo, motore KO e auto ferma → distrutta). Auto distrutta tolta dopo 3 s.
// Gara secca: griglia, semaforo, giri, classifica, arrivo.
import { Car, CARS, MODELLI_GUIDA } from './car.js';
import { AIDriver } from './ai.js';
import { profiloIA } from './profili.js';
import { buildRacingLine } from './racingline.js';
import { collideCars } from './collide.js';
import { SURF } from './track.js';
import { nuoviDanni } from './car.js';

/** pacchetto: quota dei danni meccanici negli urti senza il giocatore (fra IA, IA contro muro) */
export const DANNI_IA = { auto: 0.35, muro: 0.6 };

/** uscite (4 ruote oltre il cordolo, all'esterno) tollerate con solo un avviso, poi +5 s a ogni uscita */
export const AVVISI_LIMITI = 5;

export const PILOTI = [
  { nome: 'Nico Ballarin', num: 7 }, { nome: 'Sara Lucchesi', num: 11 }, { nome: 'Dario Velluti', num: 23 },
  { nome: 'Mia Castagna', num: 4 }, { nome: 'Ugo Pradella', num: 31 }, { nome: 'Elsa Viganò', num: 16 },
  { nome: 'Kai Morandi', num: 88 }, { nome: 'Greta Fumagalli', num: 52 }, { nome: 'Rocco Zanetti', num: 9 },
  { nome: 'Ivo Sartori', num: 66 },
];

export const LIVREE = [
  { nome: 'Rosso corsa', base: 0xc8102e, sec: 0xf4f1ea, ter: 0x111111 },
  { nome: 'Blu notte', base: 0x0b2a6f, sec: 0xf2b705, ter: 0xffffff },
  { nome: 'Verde bosco', base: 0x0f5132, sec: 0xe8d9a8, ter: 0x101010 },
  { nome: 'Giallo sole', base: 0xf2c200, sec: 0x111111, ter: 0x1f6fd1 },
  { nome: 'Bianco ghiaccio', base: 0xeeeeea, sec: 0xd2232a, ter: 0x0b5fa5 },
  { nome: 'Arancio', base: 0xff6a13, sec: 0x1a1a1a, ter: 0xffffff },
  { nome: 'Azzurro', base: 0x46b4e6, sec: 0xffffff, ter: 0x0d2b52 },
  { nome: 'Nero opaco', base: 0x141416, sec: 0x9bff3a, ter: 0x666666 },
  { nome: 'Viola', base: 0x5b2a86, sec: 0xff9ec7, ter: 0xffffff },
  { nome: 'Argento', base: 0xa9adb3, sec: 0x0c7c59, ter: 0x111111 },
];

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rlCache = new WeakMap();
function racingLineFor(track, spec, wet = 0) {
  let m = rlCache.get(track);
  if (!m) rlCache.set(track, (m = {}));
  // pacchetto: sul bagnato l'IA frena prima (profilo di velocità con l'aderenza della pista bagnata, come in car.step)
  const k = `${spec.id}|${wet}`;
  if (!m[k]) m[k] = buildRacingLine(track, spec, { muScale: 1 - 0.24 * wet });
  return m[k];
}

export class Race {
  /**
   * opt: {track, laps, difficulty, grid: 'ultimo'|'caso'|'pole', playerCar (indice CARS) | null (solo IA),
   *       playerLivery, wet, seed, autoIA?: [indici di CARS], griglia?: [{s, d}], lancioTT?: metri}
   */
  constructor(opt) {
    this.opt = opt;
    this.track = opt.track;
    this.laps = opt.laps || 3;
    this.wet = opt.wet || 0;
    this.rand = mulberry32(opt.seed ?? 12345);
    this.cars = [];
    this.drivers = [];
    this.impacts = [];
    this.time = 0;          // dal verde
    this.phase = 'griglia'; // griglia → luci → gara → finita
    this.lights = 0;
    this.lightT = 0;
    this.goDelay = 0.6 + this.rand() * 1.6;
    this.started = false;
    this.events = [];
    // penalità (interruttori del menu): limiti della pista e contatti
    this.penLimiti = !!opt.penLimiti;
    this.penContatti = !!opt.penContatti;
    this.danniReali = !!opt.danniReali && !opt.timeTrial; // danni meccanici (prestazioni, distruzione); mai nel time trial
    this._pairT = new Map();
    const tr = this.track;
    // time trial: solo il giocatore, giri illimitati, nessun semaforo, partenza da fermo 200 m prima dell'ultima curva
    // (giro di lancio: si passa il traguardo già lanciati); opt.lancioTT (metri prima del traguardo) la sostituisce
    this.timeTrial = !!opt.timeTrial;
    if (this.timeTrial) { this.laps = Infinity; this.penLimiti = false; this.penContatti = false; }
    const n = this.timeTrial ? 1 : Math.max(1, Math.min(10, Math.round(opt.nAuto || 10)));
    const hasPlayer = opt.playerCar !== null && opt.playerCar !== undefined;
    let pslot = -1;
    if (hasPlayer) {
      pslot = opt.grid === 'pole' ? 0 : opt.grid === 'caso' ? Math.floor(this.rand() * n) : n - 1;
      if (typeof opt.grid === 'number') pslot = Math.max(0, Math.min(n - 1, opt.grid));
    }
    // piloti IA: abilità decrescente dalla pole
    const profiles = PILOTI.slice(0, n).map((p, k) => ({ ...p, skill: 1.0 - k * 0.0045 - this.rand() * 0.006, aggr: this.rand() }));
    let ai = 0;
    const liveries = LIVREE.map((_, k) => k).filter((k) => k !== (opt.playerLivery ?? -1));
    for (let slot = 0; slot < n; slot++) {
      const isP = slot === pslot;
      // auto dell'IA: opt.autoIA = indici di CARS fra cui scegliere (predefinito: tutte e sei)
      const pool = opt.autoIA && opt.autoIA.length ? opt.autoIA : CARS.map((_, k) => k);
      const specIdx = isP ? opt.playerCar : pool[(slot * 7 + 1) % pool.length];
      const car = new Car(CARS[specIdx], tr, slot);
      // griglia: piazzole del circuito (opt.griglia = [{s, d}], s assoluto sulla pista) o schema generico
      const G = !this.timeTrial && opt.griglia && opt.griglia[slot];
      let dist = this.timeTrial ? (opt.lancioTT ? -opt.lancioTT : this._partenzaLanciata()) : -(7 + slot * 8.5);
      let d = this.timeTrial ? 0 : (slot % 2 ? 1 : -1) * tr.w[0] * 0.22;
      if (G) {
        dist = tr.wrapS(G.s - tr.startS);
        if (dist > tr.length / 2) dist -= tr.length;
        d = G.d;
      }
      car.reset(tr.startS + dist, d);
      car.dist = dist;
      car.lap = 0;
      car.lapStart = 0;
      car.lapTimes = [];
      car.best = Infinity;
      car.finished = false;
      car.finishTime = 0;
      car.slot = slot;
      if (isP) {
        car.isPlayer = true;
        car.nome = 'Tu';
        car.num = 1;
        car.livery = opt.playerLivery ?? 0;
        this.player = car;
        this.drivers.push(null);
      } else {
        const prof = profiles[ai];
        car.nome = prof.nome;
        car.num = prof.num;
        car.livery = liveries[ai % liveries.length];
        ai++;
        const drv = new AIDriver(car, racingLineFor(tr, car.spec, this.wet), prof, opt.difficulty, this.rand);
        this.drivers.push(drv);
        // fase 0: l'IA guida col modello del profilo della pista (tempi invariati qualunque guida scelga il giocatore)
        car.modelloGuida = MODELLI_GUIDA[profiloIA(tr).guidaIA] || null;
      }
      car.specIdx = specIdx;
      car.pen = 0; car.avvisi = 0; car._ex = null;
      car.dannoOn = this.danniReali; car.dmg = nuoviDanni(); car.distrutta = false; car.ritirato = false;
      this.cars.push(car);
    }
    if (this.timeTrial) { this.phase = 'gara'; this.started = true; this._rec = []; this._recK = 0; }
  }

  progress(car) {
    return car.dist;
  }

  /** passo fisso */
  /**
   * time trial: distanza (negativa, dal traguardo) del punto 200 m prima dell'ingresso dell'ultima curva.
   * L'ingresso è dove, risalendo dal centro della curva, la curvatura scende sotto 1/600 m⁻¹.
   */
  _partenzaLanciata() {
    const tr = this.track, L = tr.length;
    if (!tr.curve || !tr.curve.length) return -180;
    const prima = (s) => (((tr.startS - s) % L) + L) % L; // metri dal punto s al traguardo
    const ultima = tr.curve.reduce((a, c) => (prima(c.s) < prima(a.s) ? c : a));
    let s = ultima.s, k = 0;
    while (k < 300 && Math.abs(tr.kappa[Math.floor(tr.wrapS(s) / tr.step) % tr.n]) > 1 / 600) { s -= tr.step; k++; }
    this.curvaLancio = ultima.name;
    return -(prima(s) + 200);
  }

  step(dt, playerInput) {
    const tr = this.track;
    const nUrti = this.impacts.length;
    // semaforo
    if (this.phase === 'griglia') {
      this.lightT += dt;
      if (this.lightT > 1.5) { this.phase = 'luci'; this.lightT = 0; this.lights = 1; this.events.push({ t: 'luce', n: 1 }); }
    } else if (this.phase === 'luci') {
      this.lightT += dt;
      if (this.lights < 5 && this.lightT >= 1) {
        this.lights++; this.lightT = 0; this.events.push({ t: 'luce', n: this.lights });
      } else if (this.lights === 5 && this.lightT >= this.goDelay) {
        this.lights = 0; this.phase = 'gara'; this.started = true; this.events.push({ t: 'via' });
      }
    }
    if (this.started) this.time += dt;

    const env = { wet: this.wet };
    if (this.started) this._scia(dt);
    for (let k = 0; k < this.cars.length; k++) {
      const car = this.cars[k];
      let inp;
      const drv = this.drivers[k];
      if (drv && car.distrutta) inp = { throttle: 0, brake: 1, steer: 0 };   // pacchetto: distrutta, l'IA non guida più
      else if (drv) {
        const stuck = drv.update(dt, this.cars, this);
        inp = drv.inp;
        // pacchetto: ferma per un guasto (motore a pezzi o due ruote rotte) non si rimette in pista: si ritira
        if (stuck && this.danniReali && car.dmg && (car.dmg.motore >= 1 || car.dmg.ruote.filter((r) => r >= 1).length >= 2)) {
          car.distrutta = true; car.ritirato = true; car.tDistrutta = this.time;
          this.events.push({ t: 'distrutta', car, zona: 'guasto' });
        } else if (stuck) this.resetCar(car, drv.rl);
        if (car.finished && this.time - car.finishTime > 3) inp = { ...inp, throttle: Math.min(inp.throttle, 0.3) };
      } else inp = playerInput || { throttle: 0, brake: 0, steer: 0 };
      if (!this.started) {
        inp = { ...inp, brake: 1, handbrake: false, rev: inp.throttle };
        car.rpmRev = inp.rev;
      }
      // pacchetto: limitatore in corsia box (fra i due muretti, dove c'è l'isola), solo per il giocatore
      car.limitatore = false;
      if (car === this.player && tr.pit && tr.pit.limite && tr.inPit(car.proj)) {
        const E = tr.pit.E, i = car.proj.i;
        if (E.isl0[i] > 0 || E.isl0[(i + 6) % tr.n] > 0 || E.isl0[(i - 6 + tr.n) % tr.n] > 0) {
          car.limitatore = true;
          // oltre il limite: gas tagliato e freno automatico (in arcade come nei giochi, fino al limite)
          if (car.speed > tr.pit.limite + 0.3) inp = { ...inp, throttle: 0, brake: Math.max(inp.brake, Math.min(1, (car.speed - tr.pit.limite) * 0.25)) };
          else if (car.speed > tr.pit.limite) inp = { ...inp, throttle: 0 };
          else if (car.speed > tr.pit.limite - 1.5) inp = { ...inp, throttle: Math.min(inp.throttle, 0.35) };
        }
      }
      const sPrev = car.proj.s;
      car.step(dt, inp, env);
      if (!this.started) { car.vLong = 0; car.vLat = 0; car.r = 0; if (car.gear === -1) car.gear = 1; }  // pacchetto: in griglia il freno non innesta la retro
      if (this.started && !car.finished && car === this.player) this._limiti(car, dt);
      if (this.timeTrial && car === this.player && car.lap > 0 && (this._recK++ % 4 === 0)) {
        const L = tr.length;
        this._rec.push([this.time - car.lapStart, car.dist - (car.lap - 1) * L, car.x, car.y, car.z, car.yaw, car.pitch, car.roll + (car.bankRoll || 0), car.delta || 0]);
      }
      // distanza (svolta)
      let ds = car.proj.s - sPrev;
      if (ds > tr.length / 2) ds -= tr.length;
      if (ds < -tr.length / 2) ds += tr.length;
      car.dist += ds;
      if (this.started && !car.finished) {
        const lapsDone = Math.floor(car.dist / tr.length);
        if (car.dist >= 0 && lapsDone + 1 > car.lap) {
          // nuovo giro
          if (car.lap > 0) {
            const lt = this.time - car.lapStart;
            car.lapTimes.push(lt);
            car.best = Math.min(car.best, lt);
            const valido = car.lapPulito !== false;
            if (valido) car.bestValido = Math.min(car.bestValido ?? Infinity, lt);
            if (car === this.player) (this._validi || (this._validi = [])).push(valido);
            const ev = { t: 'giro', car, tempo: lt, best: lt <= car.best, valido };
            if (this.timeTrial && car === this.player) { ev.campioni = this._rec; this._rec = []; this._recK = 0; }
            this.events.push(ev);
          }
          car.lap = lapsDone + 1;
          car.lapStart = this.time;
          car.lapPulito = true;
          if (lapsDone >= this.laps) {
            car.finished = true;
            car.finishTime = this.time;
            car.lap = this.laps;
            this.events.push({ t: 'arrivo', car });
            if (car === this.player) {
              this.phase = 'finita'; this.endTime = this.time;
              // giro di rientro: l'auto del giocatore la guida l'IA (prudente), invece di restare senza pilota (Cubo Corse)
              if (!car.distrutta) this.drivers[k] = new AIDriver(car, racingLineFor(tr, car.spec, this.wet), { nome: car.nome, skill: 0.97, aggr: 0.1 }, 'normale', this.rand);
            }
          }
        }
      }
      for (const im of car.impacts) this.impacts.push(im);
      car.impacts.length = 0;
    }
    const nImp = this.impacts.length;
    collideCars(this.cars, this.impacts);
    if (this.started && this.penContatti) for (let k = nImp; k < this.impacts.length; k++) this._contatto(this.impacts[k]);
    if (this.danniReali) {
      for (let k = nUrti; k < this.impacts.length; k++) this._dannoMeccanico(this.impacts[k]);
      // un'auto distrutta resta un ostacolo per 3 s, poi viene tolta (niente più urti, l'IA la ignora)
      // auto distrutta tolta di mezzo dopo 3 s (decisione del 17-11, come Cubo Corse; Circuit Studio aveva 1,5 s)
      for (const c of this.cars) if (c.distrutta && !c.rimossa && this.time - c.tDistrutta > 3) { c.rimossa = true; c.ghost = 1e9; }
      // motore KO e auto ferma: non può più ripartire, quindi è distrutta (ma non dopo aver tagliato il traguardo) (Cubo Corse)
      if (this.started) for (const c of this.cars) {
        if (c.distrutta || c.finished || !c.dmg || c.dmg.motore < 1) { c._ferma = 0; continue; }
        c._ferma = c.speed < 0.5 ? (c._ferma || 0) + dt : 0;
        if (c._ferma > 1) {
          c.distrutta = true; c.ritirato = true; c.tDistrutta = this.time;
          this.events.push({ t: 'distrutta', car: c, zona: 'motore' });
        }
      }
    }
    if (!this.player && this.cars.every((c) => c.finished || c.ritirato)) this.phase = 'finita';
  }

  /**
   * Scia: chi segue un'altra auto entro 45 m, quasi in linea e nella stessa direzione, ha meno resistenza dell'aria
   * (fino al 40% in meno da vicinissimo, sommando più auto al massimo 45%); entro 15 m perde anche un po' di carico
   * (aria sporca, fino al 15%). Solo sopra i 70 km/h.
   */
  _scia(dt) {
    const cars = this.cars;
    for (const A of cars) {
      let libera = 1, sporca = 0;
      if (A.speed > 20 && A.air === 0) {
        for (const B of cars) {
          if (B === A || B.speed < 15 || Math.abs(A.y - B.y) > 3) continue;
          const cb = Math.cos(B.yaw), sb = Math.sin(B.yaw);
          const dx = A.x - B.x, dz = A.z - B.z;
          const dietro = -(dx * cb + dz * sb);                 // quanto A sta dietro B lungo la direzione di B
          if (dietro < 3 || dietro > 45) continue;
          const lat = Math.abs(-dx * sb + dz * cb);
          if (lat > 3.2) continue;
          if (Math.cos(A.yaw - B.yaw) < 0.9) continue;
          const kLat = 1 - (lat / 3.2) ** 2;
          const k = 0.4 * Math.pow(1 - dietro / 45, 0.8) * kLat;
          libera *= 1 - k;
          if (dietro < 15) sporca = Math.max(sporca, 0.15 * (1 - dietro / 15) * kLat);
        }
      }
      const target = Math.min(0.45, 1 - libera);
      A.draft = (A.draft || 0) + (target - (A.draft || 0)) * Math.min(1, dt * 4);
      A.dirty = (A.dirty || 0) + (sporca - (A.dirty || 0)) * Math.min(1, dt * 4);
    }
  }

  /**
   * Danno meccanico da un urto: zona colpita (muso, coda, fianco) in coordinate dell'auto, entità dalla velocità
   * d'impatto (perpendicolare per i muri, relativa fra auto): a = ((v − 3) / 22)^1,6 → ~0,16 a 36 km/h, 1 a 90 km/h.
   * Un frontale o un tamponamento pieno (a ≥ 0,95) o danni accumulati oltre il limite distruggono l'auto.
   */
  _dannoMeccanico(im) {
    const lista = im.type === 'auto' ? [im.a, im.b] : [im.car];
    for (const car of lista) {
      if (!car || car.distrutta || !car.dmg) continue;
      let a = Math.pow(Math.max(0, im.speed - 3) / 22, 1.6) * (im.type === 'auto' ? 0.75 : 1);
      // pacchetto: nel cittadino le IA si toccano spesso (tornanti, muri vicini): fra sole IA danni attenuati,
      // il giocatore li subisce pieni (sia quelli che fa sia quelli che riceve)
      const conGiocatore = lista.includes(this.player) || (im.type === 'auto' && (im.a === this.player || im.b === this.player));
      if (!conGiocatore) a *= im.type === 'auto' ? DANNI_IA.auto : DANNI_IA.muro;
      if (a < 0.01) continue;
      a = Math.min(a, 1.4);
      const D = car.dmg, cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
      const dx = im.x - car.x, dz = im.z - car.z;
      const lx = dx * cy + dz * sy, lz = -dx * sy + dz * cy; // avanti, destra
      let zona;
      if (lx > 1.1) {
        zona = 'muso';
        D.muso += a * 1.2; D.motore += a * 0.8;
        D.ruote[0] += a * (lz < 0 ? 0.7 : 0.35); D.ruote[1] += a * (lz > 0 ? 0.7 : 0.35);
      } else if (lx < -1.1) {
        zona = 'coda';
        D.alettone += a * 1.2; D.cambio += a * 0.7;
        D.ruote[2] += a * (lz < 0 ? 0.7 : 0.35); D.ruote[3] += a * (lz > 0 ? 0.7 : 0.35);
      } else {
        zona = lz > 0 ? 'fianco destro' : 'fianco sinistro';
        const ant = lz > 0 ? 1 : 0, post = lz > 0 ? 3 : 2;
        D.ruote[lx > 0 ? ant : post] += a; D.ruote[lx > 0 ? post : ant] += a * 0.45;
        D.motore += a * 0.15;
      }
      for (const k of ['muso', 'alettone', 'motore', 'cambio']) D[k] = Math.min(1, D[k]);
      for (let k = 0; k < 4; k++) D.ruote[k] = Math.min(1, D.ruote[k]);
      const somma = D.muso + D.alettone + D.motore + D.cambio + D.ruote.reduce((x, y) => x + y, 0);
      const rotte = D.ruote.filter((r) => r >= 1).length;
      const distrutta = (a >= 0.95 && zona !== 'fianco destro' && zona !== 'fianco sinistro') || somma > 5 || (D.motore >= 1 && rotte >= 2) || rotte >= 3;
      this.events.push({ t: 'danno', car, a, zona, tipo: im.type });
      if (distrutta) {
        car.distrutta = true; car.ritirato = true; car.tDistrutta = this.time;
        this.events.push({ t: 'distrutta', car, zona });
      }
    }
  }

  _penalita(car, sec, motivo) {
    car.pen += sec;
    this.events.push({ t: 'penalita', car, sec, motivo, tot: car.pen });
  }

  /** limiti della pista: uscita con tutte e quattro le ruote oltre il cordolo */
  _limiti(car, dt) {
    const tr = this.track;
    // in corsia box non si è fuori pista
    const fuori = car.air === 0 && !tr.inPit(car.proj) && car.surfaces.every((t) => t !== SURF.ROAD && t !== SURF.KERB);
    if (fuori && car.speed > 10) {
      if (!car._ex) {
        const i = car.proj.i, d = car.proj.d;
        // interno della curva = dal lato verso cui gira la pista
        const k = tr.kappa[i];
        const interno = Math.abs(k) > 1 / 450 && Math.sign(k) === Math.sign(d);
        car._ex = { t: 0, interno, fatto: false };
      }
      car._ex.t += dt;
      // dentro una curva con tutte le ruote fuori per più di un quarto di secondo = taglio
      if (!car._ex.fatto && car._ex.t > 0.25) {
        car._ex.fatto = true;
        // il giro non vale per i record, con o senza penalità
        if (car.lapPulito) { car.lapPulito = false; this.events.push({ t: 'giroNonValido', car }); }
        if (!this.penLimiti) return;
        if (car._ex.interno) this._penalita(car, 5, 'taglio');
        else {
          // come nel GT: 5 uscite con solo avviso, dalla sesta +5 s ciascuna
          car.avvisi++;
          if (car.avvisi > AVVISI_LIMITI) this._penalita(car, 5, 'limiti');
          else this.events.push({ t: 'avviso', car, n: car.avvisi, max: AVVISI_LIMITI });
        }
      }
      car._back = 0;
    } else if (car._ex) {
      car._back = (car._back || 0) + dt;
      if (car._back > 0.6) car._ex = null; // di nuovo in pista: la prossima uscita conta da capo
    }
  }

  /** contatto fra auto: penalità a chi colpisce col muso, se la responsabilità è chiara */
  _contatto(im) {
    if (im.type !== 'auto' || im.speed < 3.5) return;
    const A = im.a, B = im.b;
    if (A !== this.player && B !== this.player) return; // solo i contatti in cui c'è il giocatore
    if (A.finished || B.finished) return;
    const key = Math.min(A.slot, B.slot) * 100 + Math.max(A.slot, B.slot);
    if (this.time - (this._pairT.get(key) ?? -9) < 3) return; // un urto = una penalità
    this._pairT.set(key, this.time);
    // velocità con cui ciascuno va verso l'altro (normale da A verso B) e punto colpito (muso = offset > 0)
    const vA = A.vx * im.nx + A.vz * im.nz, vB = -(B.vx * im.nx + B.vz * im.nz);
    let colpevole = null;
    if (vA - vB > 1.5 && im.oa > 0) colpevole = A;
    else if (vB - vA > 1.5 && im.ob > 0) colpevole = B;
    if (colpevole) this._penalita(colpevole, 5, 'contatto');
  }

  resetCar(car, rl) {
    if (car.distrutta) return;   // pacchetto: un'auto distrutta resta dov'è (prima l'IA la "rimetteva in pista" a ogni passo)
    const tr = this.track;
    const s = car.proj.s;
    let d = 0;
    if (rl) {
      const i = Math.floor(tr.wrapS(s) / tr.step) % tr.n;
      d = rl.off[i];
    }
    const keep = { dist: car.dist };
    car.reset(s, d);
    car.dist = keep.dist;
    car.ghost = 2.5;
    car.lapPulito = false;
    const drv = this.drivers[this.cars.indexOf(car)];
    if (drv) drv.stuck = 0;
    this.events.push({ t: 'reset', car });
  }

  standings() {
    return [...this.cars].sort((a, b) => {
      if (a.ritirato !== b.ritirato) return a.ritirato ? 1 : -1;
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
  }

  /** risultati finali: per chi non è arrivato stima il tempo dalla media */
  results() {
    const L = this.track.length, tot = L * this.laps;
    return this.cars
      .map((c) => {
        let t = c.finishTime, stimato = false;
        if (!c.finished) {
          // pacchetto: la media dal via (partenza da fermo, gara interrotta presto) sottostima molto: si usa il giro
          // migliore dell'auto o, se non ne ha, ~125 km/h di media (un giro da 2:24 a Roncadelle)
          const media = c.dist / Math.max(1, this.time), rif = isFinite(c.best) && c.best > 0 ? L / c.best : 34.7;
          const avg = Math.max(10, media, rif * 0.97);
          t = this.time + (tot - c.dist) / avg;
          stimato = true;
        }
        if (c.ritirato) return { car: c, tempo: Infinity, pen: c.pen || 0, stimato: false, best: c.best, rit: true, giri: Math.max(0, c.lap - 1) };
        return { car: c, tempo: t + (c.pen || 0), pen: c.pen || 0, stimato, best: c.best };
      })
      .sort((a, b) => (a.rit !== b.rit ? (a.rit ? 1 : -1) : a.rit ? b.giri - a.giri : a.tempo - b.tempo));
  }
}
