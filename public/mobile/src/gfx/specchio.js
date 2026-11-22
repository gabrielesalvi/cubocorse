// Retrovisore (da Cubo Corse) per le visuali cofano e abitacolo: la scena vista da dietro l'auto viene disegnata in una piccola
// immagine fuori schermo e poi incollata, specchiata come in uno specchio vero, in alto al centro con una cornice.
import * as THREE from 'three';

const SPECCHIO_FAR = +(new URLSearchParams(globalThis.location?.search || '').get('specchio') || 400);   // m (?specchio=1400 = com'era)

export class Specchio {
  constructor(leggero = false) {
    this.leggero = leggero; // grafica bassa: risoluzione minore, aggiornato a fotogrammi alterni
    const w = leggero ? 384 : 640, h = leggero ? 96 : 160;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: leggero ? 0 : 2 });
    // 19-11 (banco di prova): fino a 1.400 m lo specchietto ridisegnava quasi tutta la scena (+2,6 M triangoli, +500 chiamate
    // nella visuale cofano). In 160 pixel d'altezza oltre 400 m un edificio è largo pochi pixel: lì basta il colore dell'orizzonte.
    this.cam = new THREE.PerspectiveCamera(32, w / h, 0.3, SPECCHIO_FAR);
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.rt.texture, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    quad.scale.x = -1; // specchiato
    this.quadScene.add(quad);
    this.cornice = document.getElementById('specchio');
    this._p = new THREE.Vector3(); this._d = new THREE.Vector3(); this._u = new THREE.Vector3();
    this._k = 0;
    this.attivo = false;
  }

  /** rettangolo sullo schermo (pixel CSS, origine in alto a sinistra) */
  rect() {
    const w = Math.round(Math.min(440, innerWidth * 0.3)), h = Math.round(w * 0.25);
    return { x: Math.round((innerWidth - w) / 2), y: 10, w, h };
  }

  mostra(on) {
    if (on === this.attivo) return;
    this.attivo = on;
    this.cornice.classList.toggle('hidden', !on);
    document.body.classList.toggle('con-specchio', on);
    if (on) {
      const r = this.rect();
      Object.assign(this.cornice.style, { left: `${r.x - 4}px`, top: `${r.y - 4}px`, width: `${r.w}px`, height: `${r.h}px` });
      document.documentElement.style.setProperty('--specchio-h', `${r.h + 18}px`);
    }
  }

  /** disegna lo specchio sopra l'immagine già sullo schermo; visual = auto del giocatore (AutoLowPoly o AutoGLB) */
  render(renderer, scene, visual) {
    if (!this.attivo) return;
    const r = renderer;
    const ridisegna = !this.leggero || (this._k++ % 2 === 0);
    if (ridisegna) {
      this._dimensiona(r);
      visual.group.updateMatrixWorld(true);
      const M = visual.body.matrixWorld;
      // dietro l'alettone, all'altezza del tetto, guarda indietro e appena in basso
      this._p.set(-2.75, 1.12, 0).applyMatrix4(M);
      this._d.set(-1, -0.035, 0).transformDirection(M);
      this._u.set(0, 1, 0).transformDirection(M);
      this.cam.position.copy(this._p);
      this.cam.up.copy(this._u);
      this.cam.lookAt(this._p.x + this._d.x, this._p.y + this._d.y, this._p.z + this._d.z);
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, this.cam);
      r.setRenderTarget(null);
    }
    const q = this.rect(), H = innerHeight;
    const autoClear = r.autoClear;
    r.autoClear = false;
    r.setScissorTest(true);
    r.setViewport(q.x, H - q.y - q.h, q.w, q.h);
    r.setScissor(q.x, H - q.y - q.h, q.w, q.h);
    r.render(this.quadScene, this.quadCam);
    r.setScissorTest(false);
    r.setViewport(0, 0, innerWidth, innerHeight);
    r.autoClear = autoClear;
  }

  /** 11-11 (prestazioni): l'immagine fuori schermo grande quanto lo specchio sullo schermo (prima 640×160 fisso anche se
   *  a schermo ne servono 440×110: il doppio dei pixel). Mai più grande di prima; in grafica bassa il 60%. */
  _dimensiona(r) {
    const q = this.rect(), pr = Math.min(r.getPixelRatio(), 2) * (this.leggero ? 0.6 : 1);
    const w = Math.max(64, Math.min(640, Math.round(q.w * pr))), h = Math.max(16, Math.min(160, Math.round(q.h * pr)));
    const ms = this.leggero ? 0 : 2;
    if (this.rt.samples !== ms) { this.rt.dispose(); this.rt.samples = ms; }      // la qualità può cambiare dal menu
    if (w === this.rt.width && h === this.rt.height) return;
    this.rt.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  dispose() {
    this.rt.dispose();
    this.mostra(false);
  }
}
