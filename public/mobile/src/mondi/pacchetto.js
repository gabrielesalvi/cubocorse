// Cubo Corse unito (fase 0, 20-11-2026): il mondo low-poly delle piste dei pacchetti di Circuit Studio (Roncadelle,
// variante Nenni). È la grafica della guida di Circuit Studio (guida/src/main.js al 19-11), con la stessa interfaccia del
// mondo voxel (mondi/voxel.js). I pacchetti e i costruttori 3D vengono da cs/ (tools/importa-cs.py).
import * as THREE from 'three';
import { caricaPacchetto } from '../../cs/viewer/src/dati/pacchetto.js';
import { TIFO, sorgentiTifo } from '../../cs/viewer/src/costruttori/pubblico.js';
import { pistaDaPacchettoAsync } from '../sim/pista.js';
import { VISTA_LEGGERA } from '../gfx/pacchetto/leggera.js';
import { costruisciMondo, Cielo, ORE, METEO } from '../gfx/pacchetto/mondo.js';
import { gommaTraiettoria } from '../gfx/pacchetto/asfalto.js';
import { aggiungiFari } from '../gfx/pacchetto/fari.js';
import { Post } from '../gfx/pacchetto/post.js';
import { Effetti } from '../gfx/pacchetto/effetti.js';   // effetti realistici (le piste voxel tengono quelli a cubetti)
import { creaVisuale } from '../gfx/auto.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const Q = new URLSearchParams(globalThis.location?.search || '');
const BASE = 'cs/pacchetti/';

/** qualità grafica: scala dei pixel (rispetto al massimo del dispositivo, ≤ 2), ombre, persone sugli spalti */
export const QUALITA = {
  basso: { nome: 'Bassa', pr: 0.6, ombre: 0, persone: false },
  telefono: { nome: 'Telefono', pr: 1, ombre: 0, persone: false },   // 22-11 (fase 2c, provvisoria): come Bassa ma alla risoluzione dello schermo
  medio: { nome: 'Media', pr: 1, ombre: 1024, persone: true },
  alto: { nome: 'Alta', pr: 2, ombre: 2048, persone: true },
  ultra: { nome: 'Ultra', pr: 2, ombre: 4096, raggioOmbre: 95, persone: true, post: true },   // + GTAO, bagliore, MSAA 4×
};
const RAGGIO_PERSONE = +(Q.get('persone') || 220);   // m; ?persone=<metri> per provare altri raggi
const GOMME_VICINE = 70;                             // m: pile di gomme dettagliate entro (rev. 17)
const PERSONE_SPECCHIO = [25, 120];                  // m: nello specchietto complete / solo busto e testa (19-11)
// 24-11 (registro dei cali di Gabriele, Ultra: davanti alle tribune il pubblico valeva ~660 k triangoli più 160-420 k di
// ombre): riquadri di persone da 25 m invece di 50 (mondo.js, ?bloccoPersone=), complete entro 50 m invece di 90, ombre
// solo entro 30 m. Inquadrature fisse davanti alle tribune di Roncadelle-Nenni B in Ultra: persone 1,15 → 0,64 M
// triangoli (vista + ombre), differenze 0,00-0,16% dei pixel. ?vicine=90&ombrePersone=90&bloccoPersone=50 = come prima.
const VICINE = +(Q.get('vicine') || 50);             // m: entro, persone complete (braccia); oltre, la versione da lontano
const OMBRE_PERSONE = +(Q.get('ombrePersone') || 30);   // m: entro, le persone (complete) fanno ombra

function gpuNome(r) {
  try { const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch { return ''; }
}
export function gpuTipo(nome) {   // come gpuKind di Cubo Corse
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(nome)) return 'software';
  if (/intel|uhd|iris|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics|mali|adreno|powervr|apple m\d/i.test(nome) && !/arc/i.test(nome)) return 'integrata';
  return '';
}

/** ora, meteo e qualità del mondo dei pacchetti, per il menu (niente filtri foto) */
export const INFO_PACCHETTO = { ORE, METEO, QUALITA, FILTRI: null, oraPredefinita: 'giorno' };

/** 27-11: la qualità che «Auto» darà su questo dispositivo, senza un mondo costruito (main.js: città leggera o no) */
let _autoCS = null;
export function qualitaAutoCS() {
  if (document.body.classList.contains('tocco')) return 'telefono';
  if (!_autoCS) {
    let nome = '';
    try { const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info'); nome = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* niente */ }
    const k = gpuTipo(nome); _autoCS = k === 'software' ? 'basso' : k === 'integrata' ? 'medio' : 'alto';
  }
  return _autoCS;
}

export class MondoPacchetto {
  constructor(canvas, settings) {
    this.tipo = 'pacchetto';
    this.canvas = canvas;
    this.ORE = ORE; this.METEO = METEO; this.QUALITA = QUALITA; this.FILTRI = null;
    this.oraPredefinita = 'giorno';
    // ?logdepth=0 (prova, 11-11): profondità normale al posto di quella logaritmica (che spegne lo scarto anticipato dei
    // pixel nascosti); a distanza le superfici sovrapposte possono sfarfallare
    const logZ = Q.get('logdepth') !== '0';
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: logZ, powerPreference: 'high-performance' });
    this.gpu = gpuNome(this.r);
    this.qk = settings.qual === 'auto' ? this.qualitaAuto() : settings.qual;
    if (!QUALITA[this.qk]) this.qk = 'alto';
    this.leggero = this.qk === 'basso' || this.qk === 'telefono';
    this.r.setPixelRatio(this.basePR());
    this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.r.setSize(innerWidth, innerHeight);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, logZ ? 0.1 : 0.5, 12000);
    this._resize = () => { this.r.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.post?.resize(); };
    addEventListener('resize', this._resize);
    // ombre calcolate una volta per fotogramma: GTAO e retrovisore ridisegnano la scena e le riusano
    this.r.shadowMap.autoUpdate = false;
    this.scene = new THREE.Scene();
    this.cielo = new Cielo(this.scene, this.r);
    this.fx = new Effetti(this.scene);
    this.pubblicoOn = settings.pubblico !== false;
  }

  /** chiude il mondo: geometrie, post-produzione, renderer, contesto WebGL e canvas */
  distruggi() {
    removeEventListener('resize', this._resize);
    try { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } catch (e) { console.warn(e); }
    try { this.post?.dispose(); } catch (e) { console.warn(e); }
    try { this.r.dispose(); this.r.forceContextLoss(); } catch (e) { console.warn(e); }
    this.canvas.remove();
  }

  qualitaAuto() { if (document.body.classList.contains('tocco')) return 'telefono'; const k = gpuTipo(this.gpu); return k === 'software' ? 'basso' : k === 'integrata' ? 'medio' : 'alto'; }
  // 27-11: su telefoni e tablet al massimo 1,5× (Alta sul S24 a 2× = 1664×768, limite della scheda video: 48 fps)
  basePR() { return Math.min(devicePixelRatio, document.body.classList.contains('tocco') ? 1.5 : 2, (QUALITA[this.qk] || QUALITA.alto).pr); }
  serveRicarica() { return false; }
  qualitaAttuale() { return this.qk; }
  impostaQualita(qk) { this.qk = QUALITA[qk] ? qk : 'alto'; this.leggero = this.qk === 'basso' || this.qk === 'telefono'; this.applicaGrafica(); }

  /** percorsi importati da Circuit Studio, con il contorno dall'asse (senza caricare tutto il pacchetto) */
  async preparaPiste() {
    return elencoPacchetti();
  }

  /** carica il pacchetto id e costruisce la versione v (settings.versione); ritorna { track, rl, griglia } */
  async carica(id, settings, avanza, rlFn) {
    if (this.pacchettoId !== id) {
      avanza(0.03, 'Carico il pacchetto del circuito…');
      // i pacchetti già letti restano in memoria (main.js passa la stessa cache a ogni mondo)
      this.dati = this.cacheDati?.[id] || await caricaPacchetto(`${BASE}${id}/`, (t) => avanza(0.05, `Carico ${t}…`));
      if (this.cacheDati) this.cacheDati[id] = this.dati;
      this.pacchettoId = id;
    }
    const C = this.dati.circuito;
    const v = C.versioni[settings.versione] ? settings.versione : Object.keys(C.versioni).at(-1);
    this.versione = v;
    this.pistaId = `${id}-${v}`;
    this.nomePista = `${C.nome} ${v}`;
    avanza(0.1, `Preparo la pista ${v} per la fisica…`); await nextFrame();
    const { track, griglia } = await pistaDaPacchettoAsync(this.dati, v);
    this.track = track; this.griglia = griglia;
    avanza(0.18, 'Calcolo la traiettoria ideale…'); await nextFrame();
    const rl = await rlFn(track);
    if (this.mondo) { this.scene.remove(this.mondo); this.mondo.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.leggera = !!settings.leggera;          // 27-11: città leggera (Telefono e Bassa), decisa da main.js con la chiave della pista
    this.mondo = await costruisciMondo(this.dati, v, (p, t) => avanza(0.25 + p * 0.7, `Costruisco il modello: ${t}…`), { leggera: this.leggera });
    this.scene.add(this.mondo);
    gommaTraiettoria(this.mondo, track, rl);           // rev. 9: gomma sulla traiettoria (asfalto.js)
    this.mostraPubblico();
    const lp = this.dati.versioni[v].livelli.pubblico; this._sorgenti = lp ? sorgentiTifo(lp) : [];   // rev. 15: da dove viene il tifo
    // rev. 15 ter: riquadri di persone (centro e raggio nel mondo) per accendere solo quelli vicini alla camera
    this._persone = []; const PP = this.mondo.userData.pubblico;
    // rev. 17: gomme delle barriere: dettagliate vicino, semplici oltre GOMME_VICINE (stessa logica delle persone)
    this._gomme = []; this.mondo.updateMatrixWorld(true);
    this.mondo.traverse((o) => { if (o.isInstancedMesh && o.userData.lod === 'gomme') this._gomme.push({ o, lo: o.userData.lontano, c: o.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r: o.boundingSphere.radius }); });
    if (PP) { PP.updateMatrixWorld(true); PP.traverse((o) => { if (!o.isInstancedMesh || o.userData.lontana) return; if (!o.boundingSphere) o.computeBoundingSphere(); this._persone.push({ o, lo: o.userData.lontano, c: o.boundingSphere.center.clone().applyMatrix4(o.matrixWorld), r: o.boundingSphere.radius }); }); }
    this.ora = settings.ora; this.meteo = settings.meteo;
    this.applicaGrafica();
    return { track, rl, griglia };
  }

  /** la qualità scelta; 24-11: ?ombre=<px> e ?raggioOmbre=<m> sostituiscono quelli della qualità (prove col registro dei
   *  cali, ?ombre=0 = senza ombre) */
  qualita() {
    const Q0 = QUALITA[this.qk] || QUALITA.alto;
    return { ...Q0, ...(Q.has('ombre') && Q0.ombre ? { ombre: +Q.get('ombre') || 0 } : {}), ...(Q.has('raggioOmbre') ? { raggioOmbre: +Q.get('raggioOmbre') } : {}) };
  }

  /** ombre, risoluzione, Ultra, persone secondo la qualità; ora e meteo */
  applicaGrafica() {
    const Qk = this.qualita(), sole = this.cielo.sole;
    sole.castShadow = Qk.ombre > 0;
    if (Qk.ombre && sole.shadow.mapSize.x !== Qk.ombre) { sole.shadow.mapSize.set(Qk.ombre, Qk.ombre); sole.shadow.map?.dispose(); sole.shadow.map = null; }
    const raggio = Qk.raggioOmbre || 70;
    if (sole.shadow.camera.right !== raggio) { Object.assign(sole.shadow.camera, { left: -raggio, right: raggio, top: raggio, bottom: -raggio }); sole.shadow.camera.updateProjectionMatrix(); }
    this.r.setPixelRatio(this.basePR());
    if (this.specchio) this.specchio.leggero = this.qk === 'basso' || this.qk === 'telefono';
    // Ultra: catena di post-produzione (creata solo quando serve, distrutta tornando a una qualità più bassa)
    if (Qk.post && !this.post) {
      try { this.post = new Post(this.r, this.scene, this.camera); } catch (e) { console.error(e); this.avviso?.('Effetti Ultra non disponibili: ' + e.message); }
    } else if (!Qk.post && this.post) { this.post.dispose(); this.post = null; }
    this.post?.resize();
    this._personeOn = !!Qk.persone; this.cullPersone(0, true);
    const ora = ORE[this.ora] ? this.ora : this.oraPredefinita, meteo = METEO[this.meteo] ? this.meteo : 'sereno';
    this.cielo.imposta(ora, meteo);
    // 27-11: città leggera: si disegna fino a 1,6 km, la nebbia chiude prima e il cielo segue la camera (dentro la vista)
    const vista = this.leggera ? VISTA_LEGGERA : 12000, F = this.scene.fog;
    if (this.camera.far !== vista) { this.camera.far = vista; this.camera.updateProjectionMatrix(); }
    if (this.leggera) { F.far = Math.min(F.far, vista - 150); F.near = Math.min(F.near, F.far * 0.4); }
    this.cielo.vicino(this.leggera ? (vista - 100) / 6000 : 0);
    // fumo e polvere non sono illuminati: il loro colore segue la luce dell'ora (notte scura, tramonto più caldo e basso)
    this.fx.impostaLuce((ORE[ora].notte ? 0.16 : ora === 'tramonto' ? 0.78 : ora === 'mattina' ? 0.92 : 1) * (meteo === 'sereno' ? 1 : 0.88));
    this.accendiNotte();
  }

  atmosfera(s) { this.ora = s.ora; this.meteo = s.meteo; if (this.mondo) this.applicaGrafica(); }
  get wet() { return this.cielo.wet; }
  get notte() { return !!ORE[this.ora]?.notte; }
  get esposizione() { return 1; }

  /** rev. 17: notte (ora «notte»): luci del circuito, fari delle auto, niente ombre del sole */
  accendiNotte() {
    const on = this.notte, Qk = this.qualita();
    this.mondo?.userData.notte?.accendi(on);
    for (const f of this._fari || []) f.visible = on;
    for (const v of this._visuali || []) v.luciPosizione?.(on);   // 21-11: fanali posteriori accesi di notte
    this.post?.notte(on);
    this.cielo.sole.castShadow = Qk.ombre > 0 && !on;
    if (on) { const N = this.mondo?.userData.notte; if (N) { N._t = 1; N.aggiorna(this.camera.position.x, -this.camera.position.z, 0); } }
  }
  mostraPubblico() { const P = this.mondo?.userData.pubblico; if (P) P.visible = !!this.pubblicoOn; }
  impostaPubblico(on) { this.pubblicoOn = on; this.mostraPubblico(); }

  creaAuto(spec, livery, num, s) { return creaVisuale(spec, livery, num, { stile: s.stileAuto }); }
  accendiFari(race, visuali) {
    this._fari = visuali.map((v, i) => aggiungiFari(v, race.cars[i].spec, race.cars[i] === race.player, race.cars[i]));   // rev. 17
    this._visuali = visuali;
    for (const f of this._fari) f.visible = this.notte;
    for (const v of visuali) v.luciPosizione?.(this.notte);
  }
  spegniFari() { this._fari = []; this._visuali = []; }
  nuovaGara() {}

  quota(x, z) { return this.dati.terreno.z(x, -z); }
  semaforo(n) { this.mondo.userData.semaforo?.setLuci(n < 0 ? 0 : n); }
  get tvLato() { return 1.5; }

  /**
   * rev. 15 (Circuit Studio 11-11): tifo. Ogni 0,25 s conta le persone attorno alla camera (zone del pubblico,
   * sorgentiTifo: peso (1 - d/160 m)^1,5) → crowd 0-1 per l'audio, più le 6 zone che pesano di più per trombette e cori.
   * finale = 1 nell'ultimo giro del giocatore; cheer = boato all'arrivo che si spegne piano, più l'entusiasmo quando
   * passi forte davanti a tanta gente. Le persone saltano nello shader (TIFO di pubblico.js). Senza pubblico niente tifo.
   */
  tifo(dt, rp, { camera, race, player, clock, mode, track }) {
    const T = (this._tifoStato ||= { t: 1, crowd: 0, fonti: [], cheer: 0 }), on = !!this.pubblicoOn && !!this._sorgenti?.length;
    T.t += dt;
    if (on && T.t > 0.25) {
      T.t = 0;
      const c = camera.position, x0 = c.x, y0 = -c.z, R = 160, L = [];
      let N = 0;
      for (const [x, y, n] of this._sorgenti) { const d = Math.hypot(x - x0, y - y0); if (d < R) { const w = n * (1 - d / R) ** 1.5; N += w; L.push([x, y, w]); } }
      T.crowd = 1 - Math.exp(-N / 2500);
      L.sort((a, b) => b[2] - a[2]);
      T.fonti = L.slice(0, 6).map(([x, y, w]) => [x, this.dati.terreno.z(x, y) + 2, -y, w]);
    }
    T.cheer = Math.max(0, T.cheer - dt * 0.08);
    const p = player;
    const finale = on && mode === 'race' && race?.started && race.laps > 0 && p.lap >= race.laps && !p.finished ? 1 : 0;
    const passa = T.crowd > 0.3 ? T.crowd * 0.5 * Math.min(1, (p?.speed || 0) / 50) : 0;
    // rev. 16: picco = ultimo settore dell'ultimo giro (il pubblico è scatenato: lì e solo lì le trombe)
    const S = this.dati.circuito.settori, Lc = this.dati.circuito.lunghezza_m;
    const fr = S?.length > 1 && Lc ? S[S.length - 1].da / Lc : 0.67;
    const picco = finale && track && (p.dist - (p.lap - 1) * track.length) / track.length >= fr ? 1 : 0;
    if (picco && !T.piccoPrima) T.cheer = Math.max(T.cheer, 0.7);        // rev. 17: ondata entrando nell'ultimo settore
    T.piccoPrima = picco;
    TIFO.uTime.value = clock;
    if (rp) TIFO.uPlayer.value.set(rp.x, -rp.z, rp.y);
    TIFO.uCheer.value = on ? Math.max(T.cheer, finale * 0.3, picco * 0.6) : 0;
    return on ? { crowd: T.crowd, cheer: Math.max(T.cheer, finale * 0.2, passa), finale, picco, fonti: T.fonti } : { crowd: 0, cheer: 0, finale: 0, picco: 0, fonti: null };
  }
  /** boato: arrivo (1), ultimo giro (0,85) */
  boato(v) { if (this._tifoStato) this._tifoStato.cheer = Math.max(this._tifoStato.cheer, v); }

  /** rev. 15 ter: le persone si disegnano solo nei riquadri di 50 m entro RAGGIO_PERSONE dalla camera; oltre VICINE con la
   *  geometria da lontano (busto e testa). Ogni 0,2 s; anche il retrovisore e le ombre vedono solo quelle. */
  cullPersone(dt = 0, forza = false) {
    const C = (this._cull ||= { t: 1 }); C.t += dt;
    if (!forza && C.t < 0.2) return; C.t = 0;
    const cam = this.camera.position;
    for (const q of this._gomme || []) { const d = Math.hypot(q.c.x - cam.x, q.c.z - cam.z) - q.r; q.o.visible = d < GOMME_VICINE; q.lo.visible = d >= GOMME_VICINE; }
    const L = this._persone; if (!L) return;
    const on = this._personeOn !== false, R = RAGGIO_PERSONE, VIC = this.vicinePersone ?? VICINE, OMB = this.ombrePersone ?? OMBRE_PERSONE;
    for (const q of L) {
      const d = on ? Math.hypot(q.c.x - cam.x, q.c.z - cam.z) - q.r : Infinity;
      if (q.lo) { q.o.visible = d < VIC; q.lo.visible = d >= VIC && d < R; } else q.o.visible = d < R;
      if (q.ombra === undefined) q.ombra = q.o.castShadow;
      q.o.castShadow = q.ombra && d < OMB;
    }
  }

  aggiorna(dt, t, { camera, rp, ...ctx }) {
    this.cielo.segui(rp.x + Math.cos(rp.yaw) * 25, rp.y, rp.z + Math.sin(rp.yaw) * 25);
    this.cielo.update(dt, camera);
    this._tf = this.tifo(dt, rp, { camera, ...ctx });
    this.cullPersone(dt);
    this.mondo?.userData.notte?.aggiorna(camera.position.x, -camera.position.z, dt);   // rev. 17: luci vere vicino alla camera
  }
  aggiornaEffetti(dtSim) { this.fx.update(dtSim); }
  audioAmbiente() {
    const T = this._tf || {};
    return { crowd: T.crowd || 0, cheer: T.cheer || 0, finale: T.finale || 0, picco: T.picco || 0, fonti: T.fonti, rain: this.cielo.wet, tunnel: 0 };
  }

  urto(im, cars, { interna, mia }) { if (!(interna && mia)) this.fx.scintille(im.x, im.y, im.z, im.speed, im.nx, im.nz); }
  strisciata(c, tr, interna) {
    if (Math.random() >= 0.5 || interna) return;
    const p = c.proj, side = p.d >= 0 ? 1 : -1;
    this.fx.scintille(c.x + tr.nx[p.i] * side, c.y + 0.3, c.z + tr.nz[p.i] * side, 2, tr.nx[p.i] * side, tr.nz[p.i] * side);
  }
  fxAuto(dt, c) { this.fx.auto(dt, c, this.cielo.wet); }
  fuoco() {}
  get fuochiArrivo() { return false; }

  /** disegna la scena: diretta, o con la post-produzione in qualità Ultra */
  disegna() {
    this.r.shadowMap.needsUpdate = true;
    if (this.post) this.post.render(); else this.r.render(this.scene, this.camera);
  }
  compila() { this.r.compile(this.scene, this.camera); }
  /** 27-11: shader compilati in parallelo prima di mostrare il mondo (prima il primo fotogramma si fermava ad aspettarli) */
  compilaAsync() { return this.r.compileAsync ? this.r.compileAsync(this.scene, this.camera) : Promise.resolve(); }
  /** 19-11 (banco di prova di Circuit Studio): nello specchietto le persone entro 25 m complete, fino a 120 m solo busto e
   *  testa, oltre niente (prima ~250.000 triangoli in più per fotogramma). */
  conSpecchio(pVis, disegna) {
    const L = this._persone;
    if (!L?.length || !pVis) return disegna();
    const c = pVis.group.position, [VIC, MAX] = PERSONE_SPECCHIO, prima = [];
    for (const q of L) {
      prima.push(q.o.visible, q.lo ? q.lo.visible : false);
      if (!q.o.visible && !q.lo?.visible) continue;
      const d = Math.hypot(q.c.x - c.x, q.c.z - c.z) - q.r;
      if (q.lo) { q.o.visible = d < VIC; q.lo.visible = d >= VIC && d < MAX; } else q.o.visible = d < MAX;
    }
    try { disegna(); } finally { L.forEach((q, k) => { q.o.visible = prima[2 * k]; if (q.lo) q.lo.visible = prima[2 * k + 1]; }); }
  }

  // ---- modalità foto: obiettivo ed esposizione (niente sfocatura né filtri: si disegna senza post-produzione)
  get fotoCompleta() { return false; }
  foto({ esposizione }) { this.r.toneMapping = THREE.LinearToneMapping; this.r.toneMappingExposure = esposizione / 100; }
  fineFoto() { this.r.toneMapping = THREE.NoToneMapping; this.r.toneMappingExposure = 1; }
  salvaFoto(nome) {
    this.disegna();
    const a = document.createElement('a'); a.download = nome; a.href = this.canvas.toDataURL('image/png'); a.click();
  }
  distruzione(on) { this.canvas.style.filter = on ? 'grayscale(1) contrast(1.1)' : ''; }

  get pixelRatio() { return this.r.getPixelRatio(); }
  get pixelRatioBase() { return this.basePR(); }
  impostaPixelRatio(pr) { this.r.setPixelRatio(pr); }
  infoPrestazioni() {
    const info = this.r.info, c = this.r.domElement;
    return `GPU: ${this.gpu.replace(/^ANGLE \(/, '').replace(/\)$/, '').slice(0, 64)}\nqualità ${(QUALITA[this.qk] || {}).nome}   ${c.width}×${c.height} px   ${info.render.calls} chiamate   ${(info.render.triangles / 1e6).toFixed(2)} M triangoli (tutte le passate)`;
  }
  get tipoGpu() { return gpuTipo(this.gpu); }
  /** contatori di three per tutto il fotogramma (ombre, GTAO, bagliore, retrovisore), non solo per l'ultima passata */
  inizioFotogramma() { this.r.info.autoReset = false; this.r.info.reset(); }
}

/** nome del circuito nel gioco per chiave di percorsi.json (26-11, Gabriele: «il circuito è uno solo: Roncacircuit») */
const NOMI_CIRCUITI = { roncadelle: 'Roncacircuit' };

/** elenco dei pacchetti importati (cs/pacchetti/percorsi.json) con nome, lunghezza, curve, versioni e contorno */
export async function elencoPacchetti() {
  let perc = {};
  try { perc = await (await fetch(BASE + 'percorsi.json', { cache: 'no-cache' })).json(); } catch (e) { console.warn('percorsi', e); return []; }
  // 26-11 (Roncacircuit): i percorsi dello stesso circuito sono VARIANTI di un circuito solo (chiave di percorsi.json)
  const voci = Object.entries(perc).filter(([, v]) => Array.isArray(v)).flatMap(([circuito, v]) => v.map((p) => ({ ...p, circuito })));
  const out = [];
  for (const p of voci) {
    try {
      const C = await (await fetch(`${BASE}${p.id}/circuito.json`, { cache: 'no-cache' })).json();
      const P = C.asse.punti, outline = [];
      for (let i = 0; i < P.length; i += 3) outline.push([P[i][0], -P[i][1]]);
      // nome per il menu: «Roncacircuit · Nenni» = circuito · variante (il tracciato senza variante è il «Classico»)
      const circuitoNome = NOMI_CIRCUITI[p.circuito] || C.nome.replace(/^Circuito cittadino di /, '').replace(/ · .*$/, '');
      const v0 = (C.variante?.nome || 'Classico').replace(/^Variante /i, ''), variante = v0[0].toUpperCase() + v0.slice(1);
      out.push({
        id: p.id, mondo: 'pacchetto', nome: `${circuitoNome} · ${variante}`, nomeLungo: `${circuitoNome} · ${variante}`,
        circuito: p.circuito, circuitoNome, variante, curve: C.curve.length,
        sottotitolo: `Cittadino · ${C.curve.length} curve · Circuit Studio`,
        lunghezza: P.length * C.asse.passo_m, outline,
        versioni: Object.entries(C.versioni).map(([k, v]) => ({ k, nome: v.nome, descrizione: v.descrizione })),
      });
    } catch (e) { console.warn('pacchetto', p.id, e); }
  }
  return out;
}
