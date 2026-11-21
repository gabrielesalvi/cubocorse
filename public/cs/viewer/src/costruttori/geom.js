// Strumenti di geometria: forme da anelli, infittimento dei bordi, unione con tabella "triangolo -> elemento" per il pick.
import * as THREE from 'three';

export function infittisci(anello, passo = 8) {
  const out = [];
  for (let i = 0; i < anello.length; i++) {
    const a = anello[i], b = anello[(i + 1) % anello.length];
    out.push(a);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.floor(d / passo);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

export function forma(p, passo = 8) {
  const v = (r) => infittisci(r, passo).map(([x, y]) => new THREE.Vector2(x, y));
  const s = new THREE.Shape(v(p.anello));
  for (const b of p.buchi || []) s.holes.push(new THREE.Path(v(b)));
  return s;
}

// Unisce geometrie non indicizzate; ricorda per ogni elemento il primo triangolo (per sapere cosa si è cliccato).
export function unisci(parti) {
  const nonIdx = parti.map(x => ({ ...x, g: x.g.index ? x.g.toNonIndexed() : x.g }));
  let nv = 0; for (const { g } of nonIdx) nv += g.attributes.position.count;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
  const tabella = []; let o = 0;
  for (const { g: gg, info, colore } of nonIdx) {
    const p = gg.attributes.position.array, c = gg.attributes.color?.array;
    pos.set(p, o * 3);
    if (c) col.set(c, o * 3);
    else if (colore) { for (let i = 0; i < p.length / 3; i++) { col[(o + i) * 3] = colore.r; col[(o + i) * 3 + 1] = colore.g; col[(o + i) * 3 + 2] = colore.b; } }
    tabella.push([o / 3, info]);
    o += p.length / 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, tabella };
}

export function cercaInfo(tabella, faccia) {
  let lo = 0, hi = tabella.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tabella[m][0] <= faccia) lo = m; else hi = m - 1; }
  return tabella[lo]?.[1];
}

export function mesh(geo, materiale, nome, pick) {
  const m = new THREE.Mesh(geo, materiale); m.name = nome; if (pick) m.userData.pick = pick; return m;
}

// Suddivide i triangoli finché nessun lato supera maxLen (bisezione del lato più lungo):
// così una superficie appoggiata al terreno segue le quote anche dove la triangolazione fa triangoli lunghi.
export function suddividi(geo, maxLen = 6) {
  const g = geo.index ? geo.toNonIndexed() : geo, src = g.attributes.position.array;
  const out = [], pila = [];
  for (let i = 0; i < src.length; i += 9) pila.push([src[i], src[i + 1], src[i + 2], src[i + 3], src[i + 4], src[i + 5], src[i + 6], src[i + 7], src[i + 8]]);
  const m2 = maxLen * maxLen;
  while (pila.length) {
    const t = pila.pop();
    const d01 = (t[0] - t[3]) ** 2 + (t[1] - t[4]) ** 2, d12 = (t[3] - t[6]) ** 2 + (t[4] - t[7]) ** 2, d20 = (t[6] - t[0]) ** 2 + (t[7] - t[1]) ** 2;
    const mx = Math.max(d01, d12, d20);
    if (mx <= m2) { out.push(...t); continue; }
    const P = [[t[0], t[1], t[2]], [t[3], t[4], t[5]], [t[6], t[7], t[8]]];
    const [a, b, c] = mx === d01 ? [0, 1, 2] : mx === d12 ? [1, 2, 0] : [2, 0, 1];
    const M = [(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2, (P[a][2] + P[b][2]) / 2];
    pila.push([...P[a], ...M, ...P[c]], [...M, ...P[b], ...P[c]]);
  }
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.Float32BufferAttribute(out, 3)); return r;
}
