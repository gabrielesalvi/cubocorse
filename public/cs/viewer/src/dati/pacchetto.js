// Caricamento di un pacchetto circuito (formato circuito/1, vedi formato/CIRCUITO-v1.md).
import { Terreno } from './terreno.js';

export async function caricaPacchetto(base, avanzamento = () => {}) {
  const json = async (f) => { const r = await fetch(base + f, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); };
  avanzamento('circuito');
  const circuito = await json('circuito.json');
  if (!String(circuito.formato || '').startsWith('circuito/1')) throw new Error('formato non riconosciuto: ' + circuito.formato);
  avanzamento('terreno');
  const tb = await fetch(base + circuito.terreno.file, { cache: 'no-cache' }).then(r => r.arrayBuffer());
  const terreno = new Terreno(circuito.terreno, tb);
  avanzamento('versioni e contesto');
  const [contesto, comune, riferimenti, ...vers] = await Promise.all([
    json(circuito.contesto.file), json(circuito.comune.file), json(circuito.riferimenti.file),
    ...Object.values(circuito.versioni).map(v => json(v.file)),
  ]);
  const versioni = {};
  Object.keys(circuito.versioni).forEach((k, i) => { versioni[k] = vers[i]; });
  return { circuito, terreno, contesto, comune, riferimenti, versioni, asse: new Asse(circuito.asse) };
}

// Linea centrale: posizione s, distanza laterale, punto più vicino. Coordinate: x est, y nord, z quota.
export class Asse {
  constructor(a) {
    this.p = a.punti; this.passo = a.passo_m; this.n = this.p.length; this.L = this.n * this.passo;
  }
  punto(s) { const i = Math.round(((s % this.L) + this.L) % this.L / this.passo) % this.n; return this.p[i]; }
  // proiezione di (x,y): restituisce { s, lat (>0 = destra), dist }
  proietta(x, y, zPreferita = null) {
    let best = null;
    for (let i = 0; i < this.n; i++) {
      const [px, py, pz] = this.p[i]; let d = (px - x) ** 2 + (py - y) ** 2;
      if (zPreferita != null) d += ((pz - zPreferita) * 3) ** 2;   // vicino al ponte sceglie il piano giusto
      if (!best || d < best.d) best = { i, d };
    }
    const i = best.i, a = this.p[i], b = this.p[(i + 1) % this.n];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    const lat = ((x - a[0]) * ty - (y - a[1]) * tx) / l;
    return { s: i * this.passo, lat, dist: Math.hypot(a[0] - x, a[1] - y) };
  }
}
