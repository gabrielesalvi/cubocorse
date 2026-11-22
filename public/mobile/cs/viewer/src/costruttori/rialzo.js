// Pendenza trasversale di progetto (sopraelevazione in curva, FIA 7.5): rialzo della superficie rispetto al terreno.
// bordi: bordi_pista della versione, con rialzo_sx / rialzo_dx (m) per campione dell'asse. Fra i due bordi il rialzo è
// lineare; oltre il bordo (vie di fuga, barriere) torna a zero in 4 m. Restituisce null se la versione non lo prevede.
export function rialzo(circuito, bordi, terreno) {
  if (!bordi?.rialzo_sx) return null;
  const P = circuito.asse.punti, n = P.length, C = 10, celle = new Map();
  const chiave = (cx, cy) => cx * 100003 + cy;
  for (let i = 0; i < n; i++) {
    if (P[i][2] - terreno.z(P[i][0], P[i][1]) > 1.0) continue;          // cavalcavia: non conta per la pista sotto
    const k = chiave(Math.floor(P[i][0] / C), Math.floor(P[i][1] / C));
    if (!celle.has(k)) celle.set(k, []); celle.get(k).push(i);
  }
  const { sinistra: SX, destra: DX, rialzo_sx: RS, rialzo_dx: RD } = bordi;
  return (x, y) => {
    const cx = Math.floor(x / C), cy = Math.floor(y / C); let best = -1, bd = 40 * 40;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = celle.get(chiave(cx + a, cy + b)); if (!l) continue;
      for (const i of l) { const d = (P[i][0] - x) ** 2 + (P[i][1] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    if (best < 0) return 0;
    const i = best, ra = RS[i], rb = RD[i];
    if (!(ra > 0 || rb > 0)) return 0;
    const q = P[(i + 1) % n], r = P[(i - 1 + n) % n], tx = q[0] - r[0], ty = q[1] - r[1], l = Math.hypot(tx, ty) || 1;
    const d = (x - P[i][0]) * ty / l - (y - P[i][1]) * tx / l;          // + = a destra
    const s = SX[i], e = DX[i];
    if (d > e) return rb * Math.max(0, 1 - (d - e) / 4);
    if (d < -s) return ra * Math.max(0, 1 - (-s - d) / 4);
    return ra + (rb - ra) * (d + s) / (s + e);
  };
}
