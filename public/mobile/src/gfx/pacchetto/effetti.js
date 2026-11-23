// Effetti realistici per le piste di Circuit Studio (Gabriele 20-11-2026: gli effetti «cubici» solo sulle piste voxel).
// - scintille: strisce luminose lunghe quanto la strada fatta in un istante, dal bianco al giallo all'arancio al rosso
//   scuro, con la gravità e un rimbalzo sull'asfalto; un lampo all'urto;
// - fumo delle gomme, polvere di erba e ghiaia, spruzzi sul bagnato, polvere degli urti forti: nuvole morbide
//   (quadrati sempre girati verso la camera, con una texture a sbuffi), che crescono, ruotano piano e svaniscono.
// Stessa interfaccia degli effetti di prima (scintille, auto, update). Funziona con la profondità logaritmica (logdepthbuf)
// e con la nebbia della scena.
import * as THREE from 'three';

const NS = 900;     // scintille
const NN = 1400;    // particelle di nuvole (fumo, polvere, spruzzi, scarico)
const NL = 24;      // lampi

/** texture a sbuffi: più cerchi sfumati sovrapposti, bordo morbido (canvas 128 px) */
function texSbuffo() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d', { willReadFrequently: true });   // 23-11: tela in memoria normale, getImageData senza rilettura dalla scheda video
  let seme = 7; const rnd = () => ((seme = (seme * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 30, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d, r = 18 + rnd() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${0.09 + rnd() * 0.09})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  // bordo: niente quadrato visibile
  const im = g.getImageData(0, 0, 128, 128), D = im.data;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const r = Math.hypot(x - 63.5, y - 63.5) / 64, k = Math.max(0, 1 - r * r) ** 1.5, i = (y * 128 + x) * 4;
    D[i] = D[i + 1] = D[i + 2] = 255; D[i + 3] = Math.min(255, D[i + 3] * 1.15 * k);
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
/** texture di un bagliore: centro pieno, alone che sfuma */
function texBagliore() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** colore con una piccola variazione (±5%), perché le nuvole non sembrino tutte uguali */
const tinta = (c) => { const k = 0.95 + Math.random() * 0.1; return [c[0] * k, c[1] * k, c[2] * k]; };

/** texture di un sassolino: disco pieno dal bordo morbido */
function texSasso() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** quadrati istanziati girati verso la camera: posizione, misura, opacità, rotazione e colore per particella */
class Nuvola {
  constructor(scene, n, { tex, additiva = false, luce = null }) {
    this.n = n;
    const base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(n * 3); this.dati = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    const att = (a, k) => { const b = new THREE.InstancedBufferAttribute(a, k); b.setUsage(THREE.DynamicDrawUsage); return b; };
    g.setAttribute('iPos', att(this.pos, 3)); g.setAttribute('iDati', att(this.dati, 3)); g.setAttribute('iCol', att(this.col, 3));
    g.instanceCount = n;
    this.uLuce = luce || { value: 1 };
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex }, uLuce: { value: 1 } }]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 iPos; attribute vec3 iDati; attribute vec3 iCol;
        varying vec2 vUv; varying float vA; varying vec3 vC;
        void main() {
          vUv = uv; vA = iDati.y; vC = iCol;
          vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iDati.z), s = sin(iDati.z);
          vec2 p = position.xy * iDati.x;
          mvPosition.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
          gl_Position = projectionMatrix * mvPosition;
          #include <logdepthbuf_vertex>
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        #include <logdepthbuf_pars_fragment>
        uniform sampler2D map; uniform float uLuce;
        varying vec2 vUv; varying float vA; varying vec3 vC;
        void main() {
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(map, vUv);
          float a = t.a * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vC * t.rgb * uLuce, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true, depthWrite: false, fog: !additiva,
      blending: additiva ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    m.uniforms.uLuce = this.uLuce;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
    scene.add(this.mesh);
    // stato di ogni particella
    this.t = new Float32Array(n).fill(1); this.vita = new Float32Array(n).fill(1);
    this.v = new Float32Array(n * 3); this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.rot = new Float32Array(n); this.spin = new Float32Array(n); this.sale = new Float32Array(n); this.attrito = new Float32Array(n);
    this.k = 0;
  }
  /** nuova particella: o = { x, y, z, vx, vy, vz, s0, s1, a0, vita, col: [r, g, b], sale, attrito } */
  emetti(o) {
    const k = (this.k = (this.k + 1) % this.n);
    this.pos[k * 3] = o.x; this.pos[k * 3 + 1] = o.y; this.pos[k * 3 + 2] = o.z;
    this.v[k * 3] = o.vx; this.v[k * 3 + 1] = o.vy; this.v[k * 3 + 2] = o.vz;
    this.col[k * 3] = o.col[0]; this.col[k * 3 + 1] = o.col[1]; this.col[k * 3 + 2] = o.col[2];
    this.s0[k] = o.s0; this.s1[k] = o.s1; this.a0[k] = o.a0; this.vita[k] = o.vita; this.t[k] = 0;
    this.rot[k] = Math.random() * 6.283; this.spin[k] = (Math.random() - 0.5) * 0.8;
    this.sale[k] = o.sale ?? 0.3; this.attrito[k] = o.attrito ?? 1.6;
  }
  update(dt) {
    const P = this.pos, D = this.dati, V = this.v;
    for (let k = 0; k < this.n; k++) {
      if (this.t[k] >= 1) { if (D[k * 3 + 1] !== 0) { D[k * 3] = 0; D[k * 3 + 1] = 0; } continue; }
      const t = (this.t[k] = Math.min(1, this.t[k] + dt / this.vita[k]));
      const fr = Math.exp(-this.attrito[k] * dt);
      V[k * 3] *= fr; V[k * 3 + 2] *= fr; V[k * 3 + 1] = V[k * 3 + 1] * fr + this.sale[k] * dt;
      P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
      this.rot[k] += this.spin[k] * dt;
      // cresce in fretta all'inizio, poi piano; entra in 10% della vita, svanisce dolcemente
      const cresce = 1 - (1 - t) * (1 - t);
      D[k * 3] = this.s0[k] + (this.s1[k] - this.s0[k]) * cresce;
      D[k * 3 + 1] = this.a0[k] * Math.min(1, t / 0.1) * (1 - t) ** 1.3;
      D[k * 3 + 2] = this.rot[k];
    }
    const g = this.mesh.geometry;
    g.attributes.iPos.needsUpdate = true; g.attributes.iDati.needsUpdate = true; g.attributes.iCol.needsUpdate = true;
  }
}

export class Effetti {
  constructor(scene) {
    this.scene = scene;
    this.luce = { value: 1 };   // colore delle nuvole: 1 di giorno, meno al tramonto e di notte (le nuvole non sono illuminate)
    // ---- scintille: segmenti (testa e coda), colore che cambia con l'età
    this.sp = new Float32Array(NS * 3); this.sv = new Float32Array(NS * 3); this.svita = new Float32Array(NS); this.st = new Float32Array(NS).fill(1);
    this.sfondo = new Float32Array(NS); this.sk = 0;
    this.lp = new Float32Array(NS * 6); this.lc = new Float32Array(NS * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.lp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.lc, 3).setUsage(THREE.DynamicDrawUsage));
    this.linee = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.linee.frustumCulled = false; this.linee.renderOrder = 5;
    scene.add(this.linee);
    // ---- nuvole e lampi
    this.nuvole = new Nuvola(scene, NN, { tex: texSbuffo(), luce: this.luce });
    this.lampi = new Nuvola(scene, NL, { tex: texBagliore(), additiva: true });
    this.sassi = new Nuvola(scene, 300, { tex: texSasso(), luce: this.luce });
  }

  /** luce dell'ambiente per fumo e polvere (0 notte … 1 giorno pieno) */
  impostaLuce(v) { this.luce.value = v; }

  /** una scintilla: posizione, velocità, vita, quota dell'asfalto */
  _scintilla(x, y, z, vx, vy, vz, vita, fondo) {
    const k = (this.sk = (this.sk + 1) % NS);
    this.sp[k * 3] = x; this.sp[k * 3 + 1] = y; this.sp[k * 3 + 2] = z;
    this.sv[k * 3] = vx; this.sv[k * 3 + 1] = vy; this.sv[k * 3 + 2] = vz;
    this.svita[k] = vita; this.st[k] = 0; this.sfondo[k] = fondo;
  }

  /** urto o strisciata in (x, y, z) con forza in m/s; (nx, nz) = normale verso dove rimbalza l'auto */
  scintille(x, y, z, forza, nx = 0, nz = 0) {
    const n = Math.min(70, Math.floor(forza * 5));
    const fondo = y - 0.45;                                   // asfalto: l'urto è a mezza altezza dell'auto
    for (let i = 0; i < n; i++) {
      // ventaglio lungo la barriera, un po' verso l'alto, qualcuna verso l'auto
      const sp = 3 + Math.random() * (4 + forza * 0.9), a = Math.random() * 6.283;
      const tx = -nz, tz = nx, lungo = (Math.random() - 0.5) * 2;
      this._scintilla(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.25, z + (Math.random() - 0.5) * 0.3,
        (tx * lungo + Math.cos(a) * 0.4 + nx * Math.random() * 0.7) * sp, (0.15 + Math.random() * 0.6) * sp * 0.7,
        (tz * lungo + Math.sin(a) * 0.4 + nz * Math.random() * 0.7) * sp, 0.25 + Math.random() * 0.55, fondo);
    }
    if (forza > 1.5) {
      // lampo all'impatto
      this.lampi.emetti({ x, y, z, vx: 0, vy: 0, vz: 0, s0: 0.4 + forza * 0.03, s1: 0.9 + forza * 0.07, a0: Math.min(0.8, 0.3 + forza * 0.03), vita: 0.09 + Math.min(0.08, forza * 0.004), col: [1, 0.72, 0.38], sale: 0, attrito: 0 });
    }
    if (forza > 5) {
      // polvere dell'urto (vernice, cemento, gomma), grigia
      for (let i = 0; i < Math.min(8, forza * 0.4); i++) this.nuvole.emetti({
        x: x + (Math.random() - 0.5) * 0.6, y: y - 0.1, z: z + (Math.random() - 0.5) * 0.6,
        vx: nx * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2, vy: 0.4 + Math.random(), vz: nz * (1 + Math.random() * 2) + (Math.random() - 0.5) * 2,
        s0: 0.7, s1: 2.6 + Math.random() * 1.4, a0: 0.24, vita: 1.3 + Math.random() * 0.8, col: tinta([0.72, 0.71, 0.69]), sale: 0.25, attrito: 1.8,
      });
    }
  }

  /**
   * Per ogni auto (dt del fotogramma): fumo delle gomme che slittano, polvere e sassolini da erba e ghiaia, spruzzi sul
   * bagnato, scintille dal diffusore quando il fondo tocca (car.fondo, dalla fisica), fumo di scarico col motore
   * danneggiato (solo con i danni meccanici: bianco, poi grigio, poi nero). 21-11: fumo e polvere più fitti e più densi.
   */
  auto(dt, c, wet = 0) {
    if (c.rimossa) return;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), hl = c.halfL || 2.3;
    const ruota = (lato, dietro = 1.4) => [c.x - cy * dietro - sy * lato, c.z - sy * dietro + cy * lato];
    const p = (r) => Math.random() < r;                       // probabilità per fotogramma (r = frequenza · dt)
    // scarico col motore danneggiato (anche da fermi e a bassa velocità)
    const mot = c.dannoOn && c.dmg ? c.dmg.motore : 0;
    if (mot > 0.25 || (c.dannoOn && c.distrutta)) {
      const m = c.distrutta ? 1 : mot, gas = c.distrutta ? 0.6 : 0.35 + 0.65 * (c.throttle || 0);
      const fr = (10 + 55 * m) * gas;
      for (let q = 0; q < 2; q++) if (p(fr * dt * 0.5)) {
        const col = m < 0.5 ? [0.95, 0.95, 0.95] : m < 0.8 ? [0.52, 0.52, 0.53] : [0.07, 0.07, 0.07];
        const lato = (Math.random() < 0.5 ? -1 : 1) * 0.35;
        this.nuvole.emetti({
          x: c.x - cy * (hl - 0.05) - sy * lato, y: c.y + 0.35, z: c.z - sy * (hl - 0.05) + cy * lato,
          vx: c.vx * 0.25 - cy * 2.5 + (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.5, vz: c.vz * 0.25 - sy * 2.5 + (Math.random() - 0.5) * 0.6,
          s0: 0.35, s1: 2.6 + Math.random() * 1.6 + m, a0: m < 0.5 ? 0.2 : m < 0.8 ? 0.3 : 0.5, vita: 1.6 + Math.random() * 1.2 + m,
          col: tinta(col), sale: 0.55, attrito: 1.5,
        });
      }
    }
    // scintille dal diffusore: dalla coda, verso il basso e indietro rispetto all'auto (strisce lunghe in velocità)
    if (c.fondo > 0.15 && c.speed > 10) {
      const n = Math.round((4 + 22 * c.fondo) * Math.min(2, dt * 60));
      for (let q = 0; q < n; q++) {
        const lato = (Math.random() - 0.5) * 1.3, dietro = hl * (0.55 + Math.random() * 0.35), f = 0.55 + Math.random() * 0.35;
        this._scintilla(c.x - cy * dietro - sy * lato, c.y + 0.06, c.z - sy * dietro + cy * lato,
          c.vx * f + (Math.random() - 0.5) * 3, 0.4 + Math.random() * 2.2, c.vz * f + (Math.random() - 0.5) * 3,
          0.18 + Math.random() * 0.4, c.y - 0.02);
      }
    }
    if (c.speed < 4) return;
    const terra = c.offroad > 0, slitta = c.skid > 0.2;
    // fumo delle gomme: bianco-grigio, denso, resta nell'aria
    if (slitta && !terra) for (let q = 0; q < 2; q++) if (p(dt * 40 * Math.min(1, c.skid * 1.4))) {
      const [x, z] = ruota(Math.random() < 0.5 ? -0.8 : 0.8);
      this.nuvole.emetti({
        x, y: c.y + 0.2, z, vx: c.vx * 0.12 + (Math.random() - 0.5) * 0.9, vy: 0.25 + Math.random() * 0.45, vz: c.vz * 0.12 + (Math.random() - 0.5) * 0.9,
        s0: 0.9, s1: 4.5 + Math.random() * 2.5, a0: 0.22 + 0.2 * Math.min(1, c.skid), vita: 2 + Math.random() * 1.6, col: tinta([0.9, 0.9, 0.9]), sale: 0.18, attrito: 1.2,
      });
    }
    // polvere da erba (verde-marrone) e ghiaia (beige, tanta), più sassolini e zolle lanciati dietro le ruote
    if (terra) {
      const ghiaia = (c.surfaces || []).includes(3), forza = Math.min(1, c.speed / 18);
      for (let q = 0; q < 2; q++) if (p(dt * 45 * forza)) {
        const [x, z] = ruota(Math.random() < 0.5 ? -0.85 : 0.85, 1.6);
        this.nuvole.emetti({
          x, y: c.y + 0.15, z, vx: c.vx * 0.25 + (Math.random() - 0.5) * 1.6, vy: 0.7 + Math.random() * 1.0, vz: c.vz * 0.25 + (Math.random() - 0.5) * 1.6,
          s0: 0.8, s1: (ghiaia ? 4.2 : 2.8) + Math.random() * 1.6, a0: ghiaia ? 0.5 : 0.32, vita: (ghiaia ? 1.9 : 1.3) + Math.random() * 0.8,
          col: tinta(ghiaia ? [0.74, 0.66, 0.52] : [0.52, 0.5, 0.36]), sale: 0.1, attrito: 1.5,
        });
      }
      for (let q = 0; q < 3; q++) if (p(dt * 30 * forza)) {
        const [x, z] = ruota(Math.random() < 0.5 ? -0.85 : 0.85, 1.5), up = 2 + Math.random() * 4;
        this.sassi.emetti({
          x, y: c.y + 0.1, z, vx: c.vx * (0.3 + Math.random() * 0.3) + (Math.random() - 0.5) * 4, vy: up, vz: c.vz * (0.3 + Math.random() * 0.3) + (Math.random() - 0.5) * 4,
          s0: ghiaia ? 0.07 : 0.11, s1: ghiaia ? 0.07 : 0.1, a0: 1, vita: 0.45 + Math.random() * 0.35,
          col: ghiaia ? tinta([0.45, 0.4, 0.33]) : tinta([0.25, 0.3, 0.14]), sale: -9.8, attrito: 0.3,
        });
      }
    }
    // spruzzi sul bagnato: nebbiolina chiara dietro le ruote, più fitta con la velocità
    if (wet > 0.3 && c.speed > 12) for (let q = 0; q < 2; q++) if (p(dt * 34 * Math.min(1, (c.speed - 12) / 40))) {
      const [x, z] = ruota(Math.random() < 0.5 ? -0.85 : 0.85, 1.9);
      this.nuvole.emetti({
        x, y: c.y + 0.35, z, vx: c.vx * 0.55, vy: 0.8 + Math.random() * 0.6, vz: c.vz * 0.55,
        s0: 1.0, s1: 3.6 + Math.random() * 1.6, a0: 0.2 * wet, vita: 0.6 + Math.random() * 0.4, col: [0.86, 0.89, 0.93], sale: -0.5, attrito: 2.2,
      });
    }
  }

  update(dt) {
    if (dt > 0) {
      const P = this.sp, V = this.sv, L = this.lp, C = this.lc;
      for (let k = 0; k < NS; k++) {
        if (this.st[k] >= 1) { if (L[k * 6 + 1] !== -1e4) { L[k * 6 + 1] = L[k * 6 + 4] = -1e4; } continue; }
        const t = (this.st[k] = Math.min(1, this.st[k] + dt / this.svita[k]));
        V[k * 3 + 1] -= 9.8 * dt;
        const fr = Math.exp(-0.6 * dt); V[k * 3] *= fr; V[k * 3 + 2] *= fr;
        P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
        if (P[k * 3 + 1] < this.sfondo[k] && V[k * 3 + 1] < 0) {     // rimbalzo sull'asfalto
          P[k * 3 + 1] = this.sfondo[k]; V[k * 3 + 1] *= -0.32; V[k * 3] *= 0.6; V[k * 3 + 2] *= 0.6;
        }
        // striscia: dalla posizione a dove era 1/40 di secondo fa
        const lun = 0.028;
        L[k * 6] = P[k * 3]; L[k * 6 + 1] = P[k * 3 + 1]; L[k * 6 + 2] = P[k * 3 + 2];
        L[k * 6 + 3] = P[k * 3] - V[k * 3] * lun; L[k * 6 + 4] = P[k * 3 + 1] - V[k * 3 + 1] * lun; L[k * 6 + 5] = P[k * 3 + 2] - V[k * 3 + 2] * lun;
        // colore: bianco-giallo → arancio → rosso scuro, la coda più scura
        const f = 1 - t, r = Math.min(1, 1.6 * f + 0.25), g2 = Math.min(1, 1.5 * f * f + 0.05), b = Math.max(0, 1.4 * f - 0.6);
        C[k * 6] = r; C[k * 6 + 1] = g2; C[k * 6 + 2] = b;
        C[k * 6 + 3] = r * 0.35; C[k * 6 + 4] = g2 * 0.25; C[k * 6 + 5] = b * 0.2;
      }
      this.linee.geometry.attributes.position.needsUpdate = true;
      this.linee.geometry.attributes.color.needsUpdate = true;
    }
    this.nuvole.update(dt);
    this.lampi.update(dt);
    this.sassi.update(dt);
  }
}
