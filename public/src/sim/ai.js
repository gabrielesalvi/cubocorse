// Cubo Corse unito (fase 0): la guida dell'IA dipende dal profilo della pista (profili.js). Le righe «pacchetto» sono le
// modifiche di Circuit Studio per le strade strette; ognuna si accende con un parametro del profilo.
import { maxSteer } from './car.js';
import { profiloIA } from './profili.js';
// Pilota IA: segue la traiettoria ideale con un inseguitore "pure pursuit",
// regola gas/freno sul profilo di velocità, sorpassa, evita e ogni tanto sbaglia.

export const DIFFICOLTA = {
  facile: { pace: 0.88, err: 1.6, elastico: true },
  normale: { pace: 0.95, err: 1.0, elastico: false },
  difficile: { pace: 0.98, err: 0.55, elastico: false },
};

export class AIDriver {
  constructor(car, rl, profile, difficulty, rand = Math.random) {
    this.car = car;
    this.rl = rl;
    this.p = profile; // {skill 0.95..1.02, aggr 0..1, nome}
    this.diff = DIFFICOLTA[difficulty] || DIFFICOLTA.normale;
    this.rand = rand;
    this.offset = 0;
    this.offTarget = 0;
    this.mistake = 0;
    this.mistakeKind = 0;
    this.nextMistake = 25 + rand() * 60;
    this.stuck = 0;
    this.inp = { throttle: 0, brake: 0, steer: 0, handbrake: false, assist: false };
    this.rubber = 1;
    this.kE = 2.5;
    this.kR = 0;
    this.kH = 0.7;
    this.mode = 'pp';
    this.ppA = 9;
    this.ppB = 0.5;
    this.P = profiloIA(car.track);
    this.kP = this.P.kP;   // pacchetto 13-11: guadagno sull'errore laterale (pure pursuit)
  }

  _rl(arr, s) {
    const tr = this.car.track;
    const f = tr.wrapS(s) / tr.step;
    const i = Math.floor(f) % tr.n, j = (i + 1) % tr.n, t = f - Math.floor(f);
    return arr[i] + (arr[j] - arr[i]) * t;
  }
  _rl2yaw(s) {
    const tr = this.car.track;
    const f = tr.wrapS(s) / tr.step;
    const i = Math.floor(f) % tr.n, j = (i + 1) % tr.n, t = f - Math.floor(f);
    const a = this.rl.yaw[i];
    let d = this.rl.yaw[j] - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return a + d * t;
  }
  /**
   * pacchetto 13-11: traiettoria + spostamento (sorpasso, affiancati, errori) nel punto s, tenuto dentro i limiti di
   * QUEL punto. Prima lo spostamento si limitava nel punto dove sta l'auto e valeva uguale fino al punto di mira 10-40 m
   * avanti: se lì la traiettoria si spostava di lato (Cono Ottico), l'auto andava a cercare il muro.
   */
  _dOk(s) {
    const d = this._rl(this.rl.off, s) + this.offset;
    if (!this.P.dOk) return d;                                // Cubo Corse: spostamento non limitato
    const lo = -this._rl(this.rl.limL, s) + 0.3, hi = this._rl(this.rl.limR, s) - 0.3;
    if (this.mistake > 0 && this.mistakeKind === 2) {          // l'errore «largo» può uscire dai limiti, non oltre la barriera
      const tr = this.car.track, f = tr.wrapS(s) / tr.step, i = Math.floor(f) % tr.n;
      return Math.min(d, tr.R.barD[i] - this.car.halfW - 0.5);
    }
    return d < lo ? lo : d > hi ? hi : d;
  }

  _minV(s0, s1) {
    const tr = this.car.track;
    let m = Infinity;
    for (let s = s0; s <= s1; s += tr.step * 2) m = Math.min(m, this._rl(this.rl.v, s));
    return m;
  }

  update(dt, cars, race) {
    const car = this.car, tr = car.track, p = car.proj;
    const v = car.speed;
    const s = p.s;

    // ---- errori occasionali
    this.nextMistake -= dt;
    if (this.nextMistake <= 0 && v > 25) {
      this.mistake = 1.2 + this.rand() * 1.5;
      this.mistakeKind = this.rand() < 0.5 ? 1 : 2; // 1 = frenata lunga, 2 = largo
      this.nextMistake = (40 + this.rand() * 80) / this.diff.err / Math.max(0.5, this.p.skill - 0.9) / 10;
    }
    if (this.mistake > 0) this.mistake -= dt;

    // ---- traffico: sorpasso / difesa / evitare contatti
    let want = 0, follow = Infinity, followV = 0;
    const myD = p.d;
    const rlD = this._rl(this.rl.off, s);
    for (const o of cars) {
      if (o.rimossa) continue; // auto distrutta e tolta dalla pista
      if (o === car || o.ghost > 0) continue;
      let ds = o.proj.s - s;
      if (ds > tr.length / 2) ds -= tr.length;
      if (ds < -tr.length / 2) ds += tr.length;
      const dd = o.proj.d - myD;
      const ov = o.speed;
      if (ds > 0 && ds < 32 + v * 0.4) {
        // davanti
        if (Math.abs(dd) < 2.6) {
          if (v > ov + 0.5) {
            // sorpasso: scegli il lato con più spazio
            const room = (side) => (side > 0 ? this.rl.limR : this.rl.limL)[p.i] - side * o.proj.d;
            const side = room(1) > room(-1) ? 1 : -1;
            const targetD = o.proj.d + side * 3.0;
            want = targetD - rlD;
            if (room(side) < 2.4) {
              follow = Math.min(follow, ds);
              followV = ov;
            }
          }
          if (ds < 14) { follow = Math.min(follow, ds); followV = ov; }
        }
      } else if (Math.abs(ds) <= 5.5 && Math.abs(dd) < 2.7) {
        // affiancati: allarga
        want += -Math.sign(dd || 1) * (2.7 - Math.abs(dd)) * 1.2;
      }
    }
    // profilo con anticipoTraffico: c'è un'auto davanti, quasi in linea? (allora si torna all'anticipo lungo)
    const AT = this.P.anticipoTraffico;
    this._davanti = false;
    if (AT) for (const o of cars) {
      if (o === car || o.rimossa || o.ghost > 0) continue;
      let q = o.proj.s - s; if (q > tr.length / 2) q -= tr.length; if (q < -tr.length / 2) q += tr.length;
      if (q > 0 && q < AT.dist + v * AT.perV && Math.abs(o.proj.d - myD) < AT.lato) { this._davanti = true; break; }
    }
    const lim = 0.3;
    this.offTarget = Math.max(-this.rl.limL[p.i] - rlD + lim, Math.min(this.rl.limR[p.i] - rlD - lim, want));
    if (this.mistake > 0 && this.mistakeKind === 2) {
      this.offTarget += 1.6;
    }
    if (this.mistake > 0 && this.mistakeKind === 2 && this.P.erroreLargoLimitato) {
      // pacchetto 13-11: l'errore «largo» porta fuori traiettoria, non dentro il muro: con le barriere vere (A: strade da
      // 6-7 m, transenne sul bordo) +1,6 m senza limite finiva sulla testa della transenna. Fiancata ad almeno 0,5 m.
      let bMin = Infinity;                                   // la barriera più vicina nel tratto davanti (~1,2 s)
      for (let k = 0, m = Math.ceil(Math.max(15, v * 1.2) / tr.step); k <= m; k++) {
        const j = (p.i + k) % tr.n; bMin = Math.min(bMin, tr.R.barD[j] - this.rl.off[j] + rlD);
      }
      const fuori = bMin - car.halfW - 0.5 - rlD;
      if (this.offTarget > fuori) this.offTarget = Math.max(this.offTarget - 1.6, fuori);
    }
    this.offset += (this.offTarget - this.offset) * Math.min(1, dt * 1.4);

    // ---- sterzo: anticipo sulla curvatura + errore di direzione + errore laterale
    const sa = s + v * 0.12 + 1;
    const kff = this._rl(this.rl.kappa, sa);
    const wantD = this._dOk(s + v * 0.25 + 2);
    let lineYaw = this._rl2yaw(s + v * 0.1 + 1);
    let he = lineYaw - car.yaw;
    while (he > Math.PI) he -= 2 * Math.PI;
    while (he < -Math.PI) he += 2 * Math.PI;
    const ec = wantD - p.d;
    let delta;
    if (this.mode === 'pp') {
      // inseguitore "pure pursuit" sulla traiettoria (più morbido ad alta velocità)
      let look = this.ppA + v * this.ppB;
      // pacchetto: nei tornanti stretti (cittadini) un punto di mira lontano fa tagliare l'interno fino al muro
      const kk = Math.max(Math.abs(this._rl(this.rl.kappa, s + 3)), Math.abs(this._rl(this.rl.kappa, s + look * 0.6)));
      if (kk > 1e-4 && this.P.miraCorta) look = Math.min(look, Math.max(4, 0.35 / kk));
      const sl = s + look;
      const tp = tr.pointAt(sl, this._dOk(sl));
      const cy = Math.cos(car.yaw), sy = Math.sin(car.yaw);
      // posizione prevista fra un attimo (compensa l'inerzia)
      const px = car.x + car.vx * 0.08, pz = car.z + car.vz * 0.08;
      const dx = tp.x - px, dz = tp.z - pz;
      const lx = dx * cy + dz * sy, ly = -dx * sy + dz * cy;
      const curv = (2 * ly) / Math.max(1, lx * lx + ly * ly);
      delta = Math.atan(curv * car.L) + (v * curv - car.r) * this.kR;
      // pacchetto 13-11: correzione sull'errore laterale qui e ora. Lo sterzo «geometrico» del pure pursuit non sa che
      // l'auto sottosterza: in curva veloce restava 1-1,5 m fuori traiettoria, e nei cittadini stretti (A: strade da
      // 6-7 m con le transenne sul bordo) ora che le barriere sono quelle vere vuol dire urtarle
      if (this.kP) {
        const e0 = this._dOk(s) - p.d;
        delta += (car.L * this.kP * e0) / (v * v + 25);   // accelerazione laterale ∝ errore (kP in 1/s²)
      }
    } else {
      delta = Math.atan(car.L * kff) + he * this.kH + Math.atan((this.kE * ec) / (v + 3));
      delta += (v * kff - car.r) * this.kR; // smorzamento d'imbardata
    }
    // guardia dei limiti (Cubo Corse, profilo guardiaLimiti): dove all'interno della curva c'è un muro a ridosso del
    // cordolo (città), se l'auto fra un attimo sarà oltre il margine della traiettoria correggi verso il centro.
    // L'inseguitore taglia un po' le curve in ingresso: con una via di fuga è innocuo, contro un muro diventa un urto.
    const kp = tr.kappa[p.i];
    if (this.P.guardiaLimiti && v > 8 && Math.abs(kp) > 1 / 400) {
      const vd = car.vx * tr.nx[p.i] + car.vz * tr.nz[p.i];
      const dPrev = p.d + vd * 0.35, lato = Math.sign(dPrev);
      const E = lato > 0 ? tr.R : tr.L;
      const muro = E.barD[p.i] - tr.w[p.i] / 2 - E.kerb[p.i] < 2.6;
      if (muro && lato === Math.sign(kp)) {
        const oltre = Math.abs(dPrev) - ((lato < 0 ? this.rl.limL[p.i] : this.rl.limR[p.i]) + 0.9);
        if (oltre > 0) delta -= lato * Math.min(0.12, oltre * 0.05);
      }
    }
    const dmax = maxSteer(v);
    this.inp.steer = Math.max(-1, Math.min(1, delta / dmax));

    // ---- velocità
    let pace = this.diff.pace * this.p.skill;
    if (this.diff.elastico && race && race.player) {
      let gap = race.progress(car) - race.progress(race.player);
      if (gap > 120) pace *= 0.95;
      else if (gap < -150) pace *= 1.03;
    }
    // anticipo: la velocità obiettivo è il minimo del profilo nei prossimi anticipo·v metri (profilo)
    const lookV = AT && this._davanti ? Math.max(AT.min, v * AT.anticipo) : Math.max(this.P.anticipoMin, v * this.P.anticipo);
    let vt = this._minV(s, s + lookV) * pace;
    // pacchetto 13-11: fuori traiettoria (sorpasso, affiancati) la curva ha un raggio diverso da quello del profilo:
    // dentro la curva, raggio R - |spostamento|. Si rallenta come se fosse sempre dalla parte stretta.
    if (this.P.rallentaFuori && Math.abs(this.offset) > 0.3) {
      let kk = 0;
      for (let q = s; q <= s + lookV + 20; q += tr.step * 2) kk = Math.max(kk, Math.abs(this._rl(this.rl.kappa, q)));
      vt *= Math.sqrt(Math.max(0.6, 1 - Math.abs(this.offset) * kk));
    }
    if (this.mistake > 0 && this.mistakeKind === 1) vt *= 1.06;
    if (follow < Infinity) {
      const gapWanted = 6 + v * 0.18;
      if (follow < gapWanted) vt = Math.min(vt, followV - (gapWanted - follow) * 0.5);
    }
    // fuori pista: rallenta e torna dentro
    if (car.offroad >= 3) vt = Math.min(vt, v - 1.5);
    const e = vt - v;
    if (e > 0) {
      this.inp.throttle = Math.min(1, this.P.gas0 + e * this.P.gasK);
      this.inp.brake = 0;
    } else {
      // pacchetto 13-11: soglia del freno da 1,2 a DB m/s: con 1,2 l'auto entrava nei tornanti 3-4 km/h sopra il
      // profilo con il gas a 0,25 e allargava di 3 m in uscita (Gombet), ora che le barriere sono quelle vere
      // (Cubo Corse: soglia 1,2 m/s, gas 0,25 fisso sotto la soglia, freno 0,22 · eccesso)
      const DB = this.P.freno;
      this.inp.throttle = e > -DB ? (this.P.gasGraduato ? 0.25 * (1 + e / DB) : 0.25) : 0;
      this.inp.brake = e < -DB ? Math.min(1, -e * this.P.frenoK) : 0;
    }
    // troppo intraversata: alza il piede
    if (car.slipR > 0.16 && v > 10) this.inp.throttle *= 0.4;

    // pacchetto 13-11: guardia contro le barriere vere. Posizione prevista lungo l'arco che l'auto sta facendo (velocità
    // e imbardata attuali) fra 0,3 e 0,6 s: se lì la fiancata sarebbe a meno di 0,6 m dal corpo di una barriera o di un
    // muro, via il gas, freno e sterzo verso il lato libero, in proporzione. Sulla traiettoria non scatta (la traiettoria
    // tiene la fiancata a 1,1 m dalle barriere): serve dopo un sorpasso, un contatto, un errore.
    this.guardia = 0;
    if (this.P.guardiaSolidi && v > 8 && tr.solSeg) {
      const yv = Math.atan2(car.vz, car.vx);
      let peggio = null;
      for (const T of [0.3, 0.6]) {
        const a = yv + car.r * T / 2, px = car.x + Math.cos(a) * v * T, pz = car.z + Math.sin(a) * v * T;
        const c = tr.distanzaSolidi(px, pz, car.y, this._ds || (this._ds = {}));
        if (!c) continue;
        const gap = c.dist - car.halfW;
        if (gap < 0.6 && (!peggio || gap < peggio.gap)) peggio = { gap, nx: c.nx, nz: c.nz };
      }
      // in traiettoria (entro 0,6 m) la previsione ad arco sbaglia nei tornanti, dove l'imbardata cresce ancora:
      // lì si interviene solo se manca davvero spazio
      const inLinea = Math.abs(this._dOk(s) - p.d) < 0.6;
      if (peggio && (!inLinea || peggio.gap < 0.15)) {
        const u = Math.min(1, (0.6 - peggio.gap) / 1.2);
        const destra = -Math.sin(car.yaw) * peggio.nx + Math.cos(car.yaw) * peggio.nz;   // >0: il lato libero è a destra
        this.inp.steer = Math.max(-1, Math.min(1, this.inp.steer + Math.sign(destra) * u * 0.5));
        this.inp.throttle *= 1 - u;
        this.inp.brake = Math.max(this.inp.brake, u * 0.7);
        this.guardia = u;
      }
    }

    // ---- bloccata?
    if (race && race.started && v < 2) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    // contromano / girata
    const along = Math.cos(car.yaw) * tr.tx[p.i] + Math.sin(car.yaw) * tr.tz[p.i];
    if (race && race.started && along < -0.2 && v < 8) this.stuck += dt;
    return this.stuck > 3;
  }
}
