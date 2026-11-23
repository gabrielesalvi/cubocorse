// Asfalto della guida (rev. 9, richiesta di Gabriele del 09-11: "l'asfalto sembra finto, voglio una texture come Cubo Corse
// con i riflessi corretti"). Come Cubo Corse: texture procedurale (grana, inerti chiari e scuri, rattoppi), mappa di
// ruvidità (G = ruvidità asciutta, B = pozzanghere), MeshStandardMaterial che riflette l'ambiente del cielo
// (scene.environment, vedi Cielo in mondo.js), bagnato che abbassa la ruvidità. Il colore di ogni superficie resta quello
// dei colori per vertice (pista, strade, corsia box, fuga): la texture è un "dettaglio" moltiplicativo attorno a 1.
// Le UV sono le coordinate del pacchetto in metri (x est, y nord) diviso PASSO_TEX: la grana non dipende dai poligoni.
import * as THREE from 'three';

const PASSO_TEX = 7;              // metri coperti da una ripetizione della texture
const ASFALTO = new Set(['Pista', 'Strade', 'Corsia box', 'Fuga asfalto', 'Cavalcavia', 'Parcheggi']);
const VERNICE = new Set(['Linee', 'Traguardo', 'Cordoli', 'Griglia', 'Segnaletica stradale', 'Sagrato']);   // rev. 10: anche la pietra del sagrato

function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return [c, c.getContext('2d', { willReadFrequently: true })]; }
function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
}

/** bagnato condiviso da tutti i materiali d'asfalto (lo imposta Cielo.imposta) */
export const BAGNATO = { value: 0 };
/** gommatura della pista: maschera in coordinate del pacchetto (gommaTraiettoria), letta dallo shader della 'Pista' */
export const GOMMA = { tex: { value: null }, box: { value: new THREE.Vector4(0, 0, 1, 1) }, on: { value: 0 } };

let CACHE = null;
/** texture condivise: dettaglio (lineare, media ~1), ruvidità + pozzanghere */
export function textureAsfalto() {
  if (CACHE) return CACHE;
  const N = 512, r = rnd(7);
  const [c, g] = canvas(N);
  // base neutra (≈ 0,86 in sRGB → ~0,72 lineare, poi riportata attorno a 1 dal colore del materiale)
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, N, N);
  // rattoppi e zone più consumate, larghi e tenui
  for (let k = 0; k < 18; k++) {
    g.fillStyle = r() < 0.5 ? `rgba(40,40,44,${0.05 + r() * 0.08})` : `rgba(255,255,255,${0.04 + r() * 0.06})`;
    const x = r() * N, y = r() * N, w = 40 + r() * 160, h = 20 + r() * 90;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI); g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  }
  const img = g.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < N * N; i++) {
    // grana fine + inerti: puntini chiari (pietrisco) e scuri (bitume)
    let n = (r() - 0.5) * 34;
    const q = r();
    if (q < 0.035) n += 38 + r() * 30; else if (q < 0.06) n -= 30 + r() * 20;
    d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + n));
    d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + n));
    d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + n + 1));
  }
  g.putImageData(img, 0, 0);
  // crepe sottili
  g.strokeStyle = 'rgba(30,30,32,0.35)'; g.lineWidth = 1;
  for (let k = 0; k < 10; k++) {
    let x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 8; j++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  const dettaglio = tex(c, true);
  // ruvidità (G) e pozzanghere (B): blob morbidi, ripetibili
  const M = 256, [c2, g2] = canvas(M), im = g2.createImageData(M, M), r2 = rnd(11), blob = [];
  for (let k = 0; k < 10; k++) blob.push([r2() * M, r2() * M, 10 + r2() * 30]);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const i = (y * M + x) * 4; let p = 0;
    for (const [bx, by, br] of blob) {
      const dx = Math.min(Math.abs(x - bx), M - Math.abs(x - bx)), dy = Math.min(Math.abs(y - by), M - Math.abs(y - by));
      p = Math.max(p, 1 - Math.hypot(dx, dy * 1.6) / br);
    }
    im.data[i] = 255; im.data[i + 1] = 196 + r2() * 59; im.data[i + 2] = Math.max(0, Math.min(255, p * 400)); im.data[i + 3] = 255;
  }
  g2.putImageData(im, 0, 0);
  CACHE = { dettaglio, ruvidita: tex(c2, false) };
  return CACHE;
}

function uvDaPosizione(geo) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / PASSO_TEX; uv[i * 2 + 1] = p.getY(i) / PASSO_TEX; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** normali nulle (triangoli degeneri della triangolazione) → in su (+z locale = alto nel pacchetto). Con i materiali PBR
 *  normalize(0) dà NaN e il pixel esce nero; con antialias e bagliore diventano quadrati neri (segnalato da Gabriele il 10-11). */
function sanaNormali(geo) {
  const n = geo.attributes.normal; if (!n) { geo.computeVertexNormals(); return sanaNormali(geo); }
  const A = n.array; let k = 0;
  for (let i = 0; i < A.length; i += 3) {
    const l = A[i] * A[i] + A[i + 1] * A[i + 1] + A[i + 2] * A[i + 2];
    if (!(l > 1e-6) || !isFinite(l)) { A[i] = 0; A[i + 1] = 0; A[i + 2] = 1; k++; }
  }
  if (k) n.needsUpdate = true;
  return k;
}

/** sostituisce i materiali piatti delle superfici d'asfalto e della vernice con materiali PBR; wetU = { value } (0 asciutto, 1 bagnato) */
export function applicaAsfalto(mondo, wetU = BAGNATO) {
  const { dettaglio, ruvidita } = textureAsfalto();
  mondo.traverse((m) => {
    if (!m.isMesh) return;
    const vecchio = m.material, po = { polygonOffset: vecchio.polygonOffset, polygonOffsetFactor: vecchio.polygonOffsetFactor, polygonOffsetUnits: vecchio.polygonOffsetUnits, side: vecchio.side };
    if (ASFALTO.has(m.name) || VERNICE.has(m.name) || m.name === 'Tombini') sanaNormali(m.geometry);
    if (ASFALTO.has(m.name)) {
      uvDaPosizione(m.geometry);
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: dettaglio, roughnessMap: ruvidita, roughness: 1, metalness: 0, ...po });
      mat.color.setScalar(1.35);       // la texture media ~0,72 lineare: il colore per vertice resta quello della superficie
      const pista = m.name === 'Pista';
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uWet = wetU;
        if (pista) Object.assign(sh.uniforms, { uGomma: GOMMA.tex, uGommaBox: GOMMA.box, uGommaOn: GOMMA.on });
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uWet;' + (pista ? '\nuniform sampler2D uGomma; uniform vec4 uGommaBox; uniform float uGommaOn;' : ''))
          .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
            vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
            float puddle = smoothstep(0.25, 0.7, texelRoughness.b) * uWet;
            roughnessFactor *= mix(texelRoughness.g, 0.32, uWet * 0.75);
            roughnessFactor = mix(roughnessFactor, 0.1, puddle);`)
          .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 - uWet * 0.35;' + (pista
            ? `\n if (uGommaOn > 0.5) { vec2 tg = (vMapUv * ${PASSO_TEX.toFixed(1)} - uGommaBox.xy) / uGommaBox.zw; diffuseColor.rgb *= 1.0 - texture2D(uGomma, tg).r; }` : ''));
      };
      if (pista) mat.customProgramCacheKey = () => 'asfalto-pista';
      m.material = mat; vecchio.dispose();
    } else if (m.name === 'Tombini') {
      // ghisa: scura, un po' metallica e liscia (luccica col sole basso e sul bagnato)
      m.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.55, ...po }); vecchio.dispose();
    } else if (VERNICE.has(m.name)) {
      // vernice stradale e cordoli: un po' lucidi, sul bagnato di più
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, ...po });
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uWet = wetU;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet;')
          .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(roughness, 0.22, uWet);');
      };
      m.material = mat; vecchio.dispose();
    }
  });
}

/** ambiente da riflettere: la cupola del cielo (gradiente) più il disco del sole, filtrato PMREM */
export function ambienteCielo(renderer, top, oriz, dirSole, colSole, kSole) {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(100, 32, 16), n = geo.attributes.position.count, c = new Float32Array(n * 3), k = new THREE.Color();
  const terra = new THREE.Color('#4d4a44');
  for (let i = 0; i < n; i++) {
    const y = geo.attributes.position.getY(i) / 100;
    if (y >= 0) k.copy(oriz).lerp(top, Math.pow(y, 0.55)); else k.copy(oriz).lerp(terra, Math.min(1, -y * 4));
    c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sole = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(colSole).multiplyScalar(6 * kSole) }));
  sole.position.copy(dirSole).normalize().multiplyScalar(90); s.add(sole);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.02);
  pm.dispose(); geo.dispose();
  return rt;
}

/** gommatura (come Cubo Corse): l'asfalto della pista si scurisce lungo la traiettoria ideale, di più nelle frenate.
 *  Prima (09-11) scuriva i colori per vertice di una pista suddivisa a 1,6 m: 2,6 milioni di triangoli, fps dimezzati
 *  (Gabriele, 10-11). Ora è una maschera 0,5 m/pixel in coordinate del pacchetto (= fisica x, -z), letta dallo shader. */
export function gommaTraiettoria(mondo, track, rl) {
  if (!rl?.off) return;
  const n = track.n, X = new Float32Array(n), Y = new Float32Array(n), F = new Float32Array(n);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    X[i] = track.px[i] + track.nx[i] * rl.off[i]; Y[i] = -(track.pz[i] + track.nz[i] * rl.off[i]);
    F[i] = Math.max(0, Math.min(1, (rl.v[i] - rl.v[(i + 15) % n]) / 8));
    x0 = Math.min(x0, X[i]); y0 = Math.min(y0, Y[i]); x1 = Math.max(x1, X[i]); y1 = Math.max(y1, Y[i]);
  }
  const PX = 0.5, M = 6; x0 -= M; y0 -= M; x1 += M; y1 += M;
  const W = Math.ceil((x1 - x0) / PX), H = Math.ceil((y1 - y0) / PX), dati = new Uint8Array(W * H), R = Math.ceil(4.5 / PX);
  for (let i = 0; i < n; i++) {
    const cx = (X[i] - x0) / PX, cy = (Y[i] - y0) / PX, k = 0.2 + F[i] * 0.2;
    for (let b = -R; b <= R; b++) {
      const py = Math.round(cy) + b; if (py < 0 || py >= H) continue;
      for (let a = -R; a <= R; a++) {
        const px = Math.round(cx) + a; if (px < 0 || px >= W) continue;
        const d2 = ((px - cx) ** 2 + (py - cy) ** 2) * PX * PX, v = Math.round(255 * k * Math.exp(-d2 / (1.5 * 1.5)));
        const j = py * W + px; if (v > dati[j]) dati[j] = v;
      }
    }
  }
  GOMMA.tex.value?.dispose();
  const t = new THREE.DataTexture(dati, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  // il pixel j copre [x0 + j*PX, ...]: il centro del primo pixel è a mezzo pixel
  GOMMA.tex.value = t; GOMMA.box.value.set(x0 - PX / 2, y0 - PX / 2, W * PX, H * PX); GOMMA.on.value = 1;
}
