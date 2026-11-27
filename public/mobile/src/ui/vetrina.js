// Vetrina del menu (21-11-2026): l'auto scelta su un piatto che gira, con luce da studio, nella livrea e nello stile
// scelti. Ha un suo renderer e un suo canvas, così il menu non dipende dalla pista caricata dietro.
// Trascinando col mouse (o col dito) si gira l'auto; lasciata, riprende a ruotare piano.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { creaVisuale } from '../gfx/auto.js';

export class Vetrina {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.toneMapping = THREE.AgXToneMapping; this.r.toneMappingExposure = 1.05;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(this.r);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.75;
    pm.dispose();
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 3); key.castShadow = true;
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
    key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.radius = 4;
    this.scene.add(key, new THREE.HemisphereLight(0xdfe8ff, 0x302820, 0.6));
    // piatto: disco scuro con un bordo chiaro, e l'ombra dell'auto
    const piatto = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.5, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.55, metalness: 0.3 }));
    piatto.position.y = -0.06; piatto.receiveShadow = true;
    const bordo = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.025, 6, 96), new THREE.MeshBasicMaterial({ color: 0xff3b2f }));
    bordo.rotation.x = Math.PI / 2; bordo.position.y = 0.005;
    this.scene.add(piatto, bordo);
    this.perno = new THREE.Group();
    this.scene.add(this.perno);
    this.camera = new THREE.PerspectiveCamera(26, 2, 0.1, 100);
    this.camera.position.set(7.4, 2.7, 7.4); this.camera.lookAt(0, 0.55, 0);
    this.ang = -0.6; this.vel = 0.35; this._trascina = null;
    // 27-11: col dito il browser si prendeva il gesto (touch-action, ora in style.css) e mandava pointercancel dopo pochi
    // pixel → solo uno scatto. Ora segue il dito e, lasciata, continua per inerzia e torna piano alla rotazione lenta.
    this.spin = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (this._trascina) return;
      this._trascina = { id: e.pointerId, x: e.clientX, t: performance.now() }; this.spin = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* niente */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      const T = this._trascina;
      if (!T || e.pointerId !== T.id) return;
      const now = performance.now(), da = (e.clientX - T.x) * (6 / Math.max(320, canvas.clientWidth)), dt = Math.max(1, now - T.t) / 1000;
      this.ang += da;
      this.spin = this.spin * 0.6 + (da / dt) * 0.4;          // velocità del dito, smussata
      T.x = e.clientX; T.t = now;
    });
    const su = (e) => {
      const T = this._trascina;
      if (!T || e.pointerId !== T.id) return;
      if (performance.now() - T.t > 120) this.spin = 0;          // dito fermo prima di alzarlo: niente lancio
      this.spin = Math.max(-12, Math.min(12, this.spin));
      this._trascina = null;
    };
    canvas.addEventListener('pointerup', su); canvas.addEventListener('pointercancel', su);
    this.chiave = '';
  }

  /** mostra l'auto (spec, livrea, stile delle auto low-poly); non rifà niente se è già quella */
  mostra(spec, livrea, stile) {
    const k = `${spec.id}|${livrea.nome}|${stile}`;
    if (k === this.chiave) return;
    this.chiave = k;
    if (this.vis) { this.perno.remove(this.vis.group); this.vis.dispose(); }
    this.vis = creaVisuale(spec, livrea, 1, { stile, pbr: true, lontana: false });
    this.vis.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // posa ferma: ruote dritte, al centro del piatto (l'auto ha l'origine nel baricentro, a metà fra gli assi)
    const finta = { x: (spec.b - spec.a) / 2, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, bankRoll: 0, wheelSpin: 0, delta: 0.18, brake: 0, gear: 1, speed: 0, rpm: 1000, damage: 0 };
    this.vis.update(finta, 0, 0);
    this.perno.add(this.vis.group);
  }

  /** a ogni fotogramma, solo quando il menu è visibile */
  disegna(dt) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.round(w * this.r.getPixelRatio()) || this.canvas.height !== Math.round(h * this.r.getPixelRatio())) {
      this.r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    }
    dt = Math.min(dt, 1 / 30);                                   // dopo un fotogramma lungo non salta avanti di colpo
    if (!this._trascina) { this.ang += (this.vel + this.spin) * dt; this.spin *= Math.exp(-2.2 * dt); }
    this.perno.rotation.y = this.ang;
    this.r.render(this.scene, this.camera);
  }
}
