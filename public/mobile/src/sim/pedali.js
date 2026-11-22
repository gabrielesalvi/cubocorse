// Gas e freno automatici (fase 2, 22-11-2026, decisione di Gabriele: due opzioni separate, con i tasti a schermo e con
// l'inclinazione). Usano il profilo di velocità che la traiettoria dell'IA già calcola per ogni pista e auto (racingline.js:
// rl.v, con frenate e accelerazioni già messe dentro), un po' più prudente perché chi guida non sta sempre sulla traiettoria:
//  - velocità obiettivo = minimo del profilo nei prossimi ANTICIPO s di strada × PRUDENZA; fuori traiettoria si rallenta
//    come se si fosse dalla parte stretta della curva (raggio R − spostamento, come l'IA nei sorpassi);
//  - gas automatico: accelera fino all'obiettivo e alza il piede prima delle curve;
//  - freno automatico: frena quando si va oltre l'obiettivo, anche se il gas è premuto (il gas si taglia mentre frena:
//    altrimenti con il freno automatico da solo, che si usa tenendo il gas, non frenerebbe mai);
//  - il freno di chi guida vince sempre; il gas di chi guida dà gas pieno quando il freno automatico non sta frenando.
// La fisica è quella di sempre: cambiano solo i valori di gas e freno che arrivano all'auto.

export const PEDALI = { anticipo: 0.55, minimo: 8, prudenza: 0.93, sogliaFreno: 0.8, frenoK: 0.28, gasK: 0.45 };

export class PedaliAutomatici {
  constructor(car, rl) { this.car = car; this.rl = rl; this.ultimo = { vt: 0, frena: false }; }

  _rl(arr, s) {
    const tr = this.car.track;
    const f = tr.wrapS(s) / tr.step;
    const i = Math.floor(f) % tr.n, j = (i + 1) % tr.n, t = f - Math.floor(f);
    return arr[i] + (arr[j] - arr[i]) * t;
  }

  /** velocità obiettivo qui e ora (m/s) */
  obiettivo() {
    const car = this.car, tr = car.track, s = car.proj.s, v = car.speed, P = PEDALI;
    const look = Math.max(P.minimo, v * P.anticipo);
    let m = Infinity, kk = 0;
    for (let q = s; q <= s + look; q += tr.step * 2) {
      m = Math.min(m, this._rl(this.rl.v, q));
      kk = Math.max(kk, Math.abs(this._rl(this.rl.kappa, q)));
    }
    let vt = m * P.prudenza;
    const off = Math.abs(car.proj.d - this._rl(this.rl.off, s));
    if (off > 0.4) vt *= Math.sqrt(Math.max(0.6, 1 - off * kk));
    if (car.offroad >= 3) vt = Math.min(vt, Math.max(8, v - 1.5));       // fuori pista: rallenta
    return vt;
  }

  /**
   * gas e freno finali. gasAuto, frenoAuto = opzioni accese; gasUtente, frenoUtente = 0..1 dei pedali a schermo.
   * Ritorna { throttle, brake }.
   */
  calcola(gasAuto, frenoAuto, gasUtente = 0, frenoUtente = 0) {
    let throttle = gasUtente, brake = frenoUtente;
    if (!gasAuto && !frenoAuto) return { throttle, brake };
    const P = PEDALI, v = this.car.speed, vt = this.obiettivo(), e = vt - v;
    const frenaAuto = frenoAuto && e < -P.sogliaFreno && this.car.gear !== -1;
    this.ultimo = { vt, frena: frenaAuto };
    if (frenoUtente > 0.05) return { throttle: 0, brake };      // il freno tuo vince sempre
    if (frenaAuto) return { throttle: 0, brake: Math.min(1, 0.15 + (-e - P.sogliaFreno) * P.frenoK) };
    if (gasUtente > 0.05) return { throttle: gasUtente, brake: 0 };
    if (gasAuto) {
      // sotto l'obiettivo gas in proporzione; poco sopra un filo di gas (niente freno motore brusco); più sopra niente
      throttle = e > 0 ? Math.min(1, 0.3 + e * P.gasK) : e > -P.sogliaFreno ? 0.2 * (1 + e / P.sogliaFreno) : 0;
      return { throttle, brake: 0 };
    }
    return { throttle: 0, brake: 0 };
  }
}
