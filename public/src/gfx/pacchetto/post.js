// Post-produzione per la qualità Ultra (come Cubo Corse): occlusione ambientale GTAO, leggero bagliore, antialias MSAA 4×.
// La guida usa la profondità logaritmica (città grande, camera vicina all'abitacolo): GTAO di three la legge come
// profondità prospettica, quindi qui le funzioni dello shader che ricostruiscono la posizione vengono sostituite.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// pulizia dei pixel (10-11): un riflesso del sole su una superficie molto liscia (clearcoat, pozzanghere) può superare il
// massimo dei float a 16 bit (65504) e diventare Inf/NaN; il bagliore lo allarga a quadrati neri. Qui NaN/Inf → 0 e tetto a 32.
const PULIZIA = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
      gl_FragColor = vec4(clamp(c.rgb, 0.0, 32.0), clamp(c.a, 0.0, 1.0));
    }`,
};

/** risoluzione della GTAO rispetto allo schermo (?ao=1 per la risoluzione piena) */
const SCALA_AO = +(new URLSearchParams(globalThis.location?.search || '').get('ao') || 0.5);
const AO_LONTANO = 250, AO_PERSONE = 60;   // m: oltre, niente occlusione ambientale (vedi overrideVisibility)

const FIRMA = 'vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {';
// profondità logaritmica di three: d = log2(1 + w) / log2(far + 1), con w = -viewZ
const LOGDEPTH = `
uniform float uLogFar;
float logViewZ(const in float d) { return 1.0 - exp2(d * uLogFar); }
vec3 getViewPosition(const in vec2 screenPosition, const in float depth) {
  vec4 p = cameraProjectionMatrixInverse * vec4(screenPosition * 2.0 - 1.0, 1.0, 1.0);
  vec3 r = p.xyz / p.w;
  return r * (logViewZ(depth) / r.z);
}
vec3 getViewPositionPerspettiva(const in vec2 screenPosition, const in float depth) {`;

export function profonditaLog(mat, camera) {
  if (!mat.fragmentShader.includes(FIRMA)) throw new Error('GTAO: shader diverso da quello atteso');
  mat.fragmentShader = mat.fragmentShader.replace(FIRMA, LOGDEPTH)
    .replace('return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);', 'return logViewZ(depth);');
  mat.uniforms.uLogFar = { value: Math.log2(camera.far + 1) };
  mat.needsUpdate = true;
}

export class Post {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.camera = camera;
    const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    const C = (this.composer = new EffectComposer(renderer, rt));
    C.setPixelRatio(pr); C.setSize(w, h);
    C.addPass(new RenderPass(scene, camera));
    C.addPass(new ShaderPass(PULIZIA));
    this.gtao = new GTAOPass(scene, camera, w, h);
    // Giro libero (scene.userData.normaliPiatte, 18-11): le mesh unite delle mappe a tasselli sono a doppia faccia e alcune
    // pareti hanno i vertici nel verso opposto, e i tasselli preparati non salvano le normali dei materiali a facce piatte
    // (alberi uniti, ecc.): la GTAO le vedeva male e quegli edifici e alberi diventavano neri. Lì la passata delle normali
    // disegna anche il retro delle facce (three gira la normale verso la camera) e ricava le normali dallo shader, faccia
    // per faccia. In gara resta com'era (solo la faccia davanti, normali della mesh): vedi normaliPiatte().
    this.normaliPiatte(!!scene.userData.normaliPiatte);
    // 18-11 sera (Gabriele: «con la grafica ultra la racing line è diventata nera»): gli oggetti che non scrivono la
    // profondità (racing line, fasci dei fari, fumo, auto fantasma, aloni) non sono superfici: restano fuori dalla
    // passata delle normali, come già linee e punti. Prima la racing line, a doppia faccia e senza normali, ci entrava
    // col DoubleSide globale e la GTAO la faceva nera.
    const senzaProfondita = (m) => (Array.isArray(m) ? m.length > 0 && m.every(senzaProfondita) : !!m && m.depthWrite === false);
    // 18-11 notte (Gabriele: «in gara oltre 5 M di triangoli, sotto i 40 fps»): la passata delle normali ridisegnava tutta
    // la scena fino all'orizzonte (1,8 M triangoli, quanto l'immagine). L'occlusione ha un raggio di 1,2 m: oltre AO_LONTANO
    // metri è più piccola di un pixel e si perde nel filtro, così lì gli oggetti restano fuori; le persone (decine di migliaia
    // di istanze, alte 1,7 m) solo entro AO_PERSONE. Si decide sulla sfera che contiene l'oggetto (i riquadri di tassella.js).
    const sfera = new THREE.Sphere(), cam = camera;
    const lontano = (o) => {
      const bs = o.boundingSphere || o.geometry?.boundingSphere;
      if (!bs) return false;
      sfera.copy(bs).applyMatrix4(o.matrixWorld);
      const lim = o.isInstancedMesh && /^Pubblico/.test(o.name) ? AO_PERSONE : AO_LONTANO;
      return sfera.center.distanceTo(cam.position) - sfera.radius > lim;
    };
    this.gtao.overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        cache.set(o, o.visible);
        if (o.isPoints || o.isLine || o.isSprite || (o.isMesh && (senzaProfondita(o.material) || (o.visible && lontano(o))))) o.visible = false;
      });
    };
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 1.0;
    this.gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 2.0, scale: 1.0, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    if (renderer.capabilities.logarithmicDepthBuffer) {     // senza (?logdepth=0) lo shader originale va già bene
      profonditaLog(this.gtao.gtaoMaterial, camera);
      profonditaLog(this.gtao.pdMaterial, camera);
    }
    // 11-11 (prestazioni): normali, occlusione e filtro a metà risoluzione (un quarto dei pixel). L'occlusione è morbida
    // per natura e il filtro la sfuma comunque: a schermo la differenza è minima, il costo della passata si divide per ~4
    // (la geometria della passata delle normali resta, ma con i riquadri di tassella.js è già meno della metà).
    const ss = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => ss(Math.max(1, Math.round(w * SCALA_AO)), Math.max(1, Math.round(h * SCALA_AO)));
    C.addPass(this.gtao);
    // senza tone mapping la scena sta sotto 1: brillano solo stop, fari e riflessi del sole
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.25, 0.4, 1.0);
    C.addPass(this.bloom);
    C.addPass(new OutputPass());
  }
  normaliPiatte(si) {
    const m = this.gtao.normalMaterial;
    m.flatShading = si; m.side = si ? THREE.DoubleSide : THREE.FrontSide; m.needsUpdate = true;
  }
  resize() { this.composer.setPixelRatio(this.r.getPixelRatio()); this.composer.setSize(innerWidth, innerHeight); }
  render() { this.composer.render(); }
  dispose() { this.composer.renderTarget1.dispose(); this.composer.renderTarget2.dispose(); this.gtao.dispose(); this.bloom.dispose(); }
}
