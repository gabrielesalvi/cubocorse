// Griglia di quote del terreno (uint16 little-endian, centimetri sopra z0). Interpolazione bilineare.
export class Terreno {
  constructor(meta, buffer) {
    Object.assign(this, meta);
    this.q = new Uint16Array(buffer);
    if (this.q.length !== this.nx * this.ny) throw new Error('terreno: dimensioni non coerenti');
  }
  zCella(i, j) {
    i = Math.max(0, Math.min(this.nx - 1, i)); j = Math.max(0, Math.min(this.ny - 1, j));
    return this.z0 + this.q[j * this.nx + i] * this.scala;
  }
  z(x, y) {
    const fx = (x - this.x0) / this.passo, fy = (y - this.y0) / this.passo;
    const i = Math.floor(fx), j = Math.floor(fy), ax = fx - i, ay = fy - j;
    return this.zCella(i, j) * (1 - ax) * (1 - ay) + this.zCella(i + 1, j) * ax * (1 - ay) +
           this.zCella(i, j + 1) * (1 - ax) * ay + this.zCella(i + 1, j + 1) * ax * ay;
  }
  get estensione() { return { x0: this.x0, y0: this.y0, x1: this.x0 + (this.nx - 1) * this.passo, y1: this.y0 + (this.ny - 1) * this.passo }; }
}
