// Cubo Corse unito (fase 0, 20-11-2026): il mondo voxel delle piste di Cubo Corse (Porto, Colline, Monza).
// È la grafica di Cubo Corse di prima, tolta da main.js e messa dietro la stessa interfaccia del mondo dei pacchetti
// (mondi/pacchetto.js): main.js non sa quale dei due sta disegnando.
import * as THREE from 'three';
import { Track } from '../sim/track.js';
import { PORTO, COLLINE, monzaDef } from '../sim/tracks.js';
import { materialiLeggeri, usaMaterialiLeggeri } from '../gfx/voxel.js';
import { Renderer, QUALITA, FILTRI_NOMI, gpuName, gpuKind } from '../gfx/renderer.js';
import { Environment, Headlights, ORE, METEO } from '../gfx/env.js';
import { TrackWorld } from '../gfx/trackmesh.js';
import { Effects } from '../gfx/fx.js';
import { buildScenery } from '../gfx/scenery.js';
import { creaVisuale } from '../gfx/auto.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const PISTE_VOXEL = ['porto', 'colline', 'monza'];

function autoQuality() {
  try {
    const kind = gpuKind(gpuName(document.createElement('canvas').getContext('webgl2')));
    return kind === 'software' ? 'basso' : kind === 'integrata' ? 'medio' : 'alto';
  } catch { return 'medio'; }
}

/** le tre piste di Cubo Corse (anche per il menu del mondo dei pacchetti): { lista, defs, tracks } */
export async function elencoVoxel() {
  const json = await (await fetch('data/monza.json')).json();
  const defs = { porto: PORTO, colline: COLLINE, monza: monzaDef(json) }, tracks = {};
  const lista = PISTE_VOXEL.map((id) => {
    const t = (tracks[id] = new Track(defs[id])), outline = [];
    for (let i = 0; i < t.n; i += 6) outline.push([t.px[i], t.pz[i]]);
    return { id, mondo: 'voxel', nome: t.nome, sottotitolo: t.def.sottotitolo, lunghezza: t.length, outline };
  });
  return { lista, defs, tracks };
}

/** ora, meteo, qualità e filtri del mondo voxel, per il menu */
export const INFO_VOXEL = { ORE, METEO, QUALITA, FILTRI: FILTRI_NOMI, oraPredefinita: 'oro' };

export class MondoVoxel {
  constructor(canvas, settings) {
    this.tipo = 'voxel';
    this.canvas = canvas;
    this.ORE = ORE; this.METEO = METEO; this.QUALITA = QUALITA; this.FILTRI = FILTRI_NOMI;
    this.oraPredefinita = 'oro';
    const qk = settings.qual === 'auto' ? autoQuality() : settings.qual;
    this.renderer = new Renderer(canvas, qk);
    // grafica bassa: materiali semplici per auto e scenario (decisi prima di costruire il mondo)
    materialiLeggeri(!!this.renderer.q.diretto);
    this.r = this.renderer.r;
    this.leggero = !!this.renderer.q.diretto;
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 9000);
    this._resize = () => this.renderer.resize();
    addEventListener('resize', this._resize);
    this.gpu = this.renderer.gpu;
  }

  /** dati delle piste già pronti (main.js li prepara una volta per il menu): niente da ricostruire */
  usaDati(E) { this.defs = E.defs; this.tracks = E.tracks; }

  /** chiude il mondo: geometrie, renderer, contesto WebGL e canvas (21-11: caricamento in sottofondo, un mondo per pista) */
  distruggi() {
    removeEventListener('resize', this._resize);
    try { if (this.scene) this.dispose(); } catch (e) { console.warn(e); }
    try { this.renderer.r.dispose(); this.renderer.r.forceContextLoss(); } catch (e) { console.warn(e); }
    this.canvas.remove();
  }

  /** dati di Monza (OpenStreetMap) e le tre piste, per il menu */
  async preparaPiste() {
    const E = await elencoVoxel();
    this.usaDati(E);
    return E.lista;
  }
  trackFor(id) {
    if (!this.tracks[id]) this.tracks[id] = new Track(this.defs[id]);
    return this.tracks[id];
  }

  /** la qualità scelta richiede di ricaricare la pagina (materiali condivisi diversi fra Bassa e le altre)? */
  serveRicarica(qk) { return !!QUALITA[qk]?.diretto !== usaMaterialiLeggeri(); }
  qualitaAttuale() { return this.renderer.qKey; }
  qualitaAuto() { return this.renderer.qKey; }
  impostaQualita(qk) { this.renderer.setQualityKey(qk); }

  /** costruisce la pista id; ritorna { track, rl } */
  async carica(id, settings, avanza, rlFn) {
    avanza(0.1, 'Traccio la pista…'); await nextFrame();
    if (this.scene) this.dispose();
    const q = this.renderer.q;
    const track = (this.track = this.trackFor(id));
    this.pistaId = id;
    this.nomePista = track.nome;
    this.scene = new THREE.Scene();
    avanza(0.2, 'Calcolo la traiettoria ideale…'); await nextFrame();
    const rl = rlFn(track);
    avanza(0.3, 'Stendo asfalto, cordoli e vie di fuga…'); await nextFrame();
    const tW = performance.now();
    this.world = new TrackWorld(track, rl, { terrainRange: q.terrainRange, cell: q.cell });
    this.scene.add(this.world.group);
    this.loadTimes = { pista: Math.round(performance.now() - tW) };
    avanza(0.55, 'Costruisco lo scenario…'); await nextFrame();
    const tS = performance.now();
    this.scenery = await buildScenery(track, this.world, q, (p, m) => avanza(0.55 + p * 0.35, m));
    this.scene.add(this.scenery.group);
    this.loadTimes.scenario = Math.round(performance.now() - tS);
    this.loadTimes.scartati = this.world.clear.rejected;
    avanza(0.92, 'Accendo le luci…'); await nextFrame();
    this.env = new Environment(this.renderer.r, this.scene, q);
    this.env.coverAt = this.scenery.coverAt;
    const b = track.bounds;
    this.center = new THREE.Vector3((b.minx + b.maxx) / 2, 0, (b.minz + b.maxz) / 2);
    this.env.setLamps(this.scenery.lamps);
    this.atmosfera(settings);
    this.fx = new Effects(this.scene, q);
    this.renderer.setup(this.scene, this.camera);
    return { track, rl };
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => x && x.dispose && !x.userData.shared && x.dispose());
    });
    this.luci = null;
  }

  /** ora e meteo */
  atmosfera(s) {
    const ora = ORE[s.ora] ? s.ora : this.oraPredefinita, meteo = METEO[s.meteo] ? s.meteo : 'sereno';
    this.env.set(ora, meteo, this.center);
    this.renderer.setBloom(this.env.night > 0.5, this.env.wet);
    this.world.wetU.value = this.env.wet;
    if (this.luci) this.luci.update([], null, 0);
  }
  get wet() { return this.env.wet; }
  get notte() { return this.env.night > 0.5; }
  get esposizione() { return this.env.O.exposure; }

  creaAuto(spec, livery, num, s) { return creaVisuale(spec, livery, num, { stile: s.stileAuto, pbr: true }); }
  /** fari di tutte le auto (dopo aver creato le auto di una gara) */
  accendiFari(race) {
    this.spegniFari();
    this.luci = new Headlights(this.scene, this.renderer.q, race.cars);
  }
  spegniFari() {
    if (!this.luci) return;
    for (const m of [...this.luci.beams, ...this.luci.tails]) this.scene.remove(m);
    for (const sp of this.luci.spots) { this.scene.remove(sp); this.scene.remove(sp.target); sp.dispose && sp.dispose(); }
    this.luci = null;
  }
  nuovaGara() { if (this.fx) this.fx.fireworksOn = false; }

  quota(x, z) { return this.world.heightAt(x, z); }
  superficieY(x, z) {
    const f = this.world.info(x, z);
    if (f.i >= 0) {
      const E = f.side > 0 ? this.track.R : this.track.L;
      if (f.dist <= E.barD[f.i]) return this.track.py[f.i] + 0.02;
    }
    return this.world.heightAt(x, z);
  }
  /** luci del semaforo sul portale (n = 1..5, −1 = verde, 0 = spente) */
  semaforo(n) { this.scenery.gantry && this.scenery.gantry.setLuci(n); }
  /** distanza laterale dell'inquadratura TV dal bordo pista */
  get tvLato() { return 6; }

  /** a ogni fotogramma: ambiente, gallerie, scenario, pubblico */
  aggiorna(dt, t, { camera, player, race, rs, rp, cheer }) {
    this.luci && this.luci.update(rs, rp, this.env.night);
    const cp = camera.position;
    this.env.update(dt, cp, player, t);
    const inT = this.scenery.inTunnel ? this.scenery.inTunnel(cp.x, cp.y, cp.z) : 0;
    this.tunnelK = (this.tunnelK || 0) + (inT - (this.tunnelK || 0)) * Math.min(1, dt * 2.5);
    this.env.shade(this.tunnelK);
    this.world.update(dt, t);
    this.scenery.update && this.scenery.update(dt, t, player, cheer, race);
    this.fx.night = this.env.night > 0.5;
  }
  /** effetti che si muovono col tempo del gioco (dtSim = 0 in pausa) */
  aggiornaEffetti(dtSim) { this.fx.update(dtSim, (x, z) => this.superficieY(x, z)); }
  /** pubblico e ambiente per l'audio */
  audioAmbiente(camera, cheer) {
    const c = camera.position;
    const crowd = this.scenery.crowdNear ? this.scenery.crowdNear(c.x, c.z) : 0;
    return {
      crowd, cheer: Math.max(cheer, crowd > 0.3 ? Math.max(0, 1 - this.scenery.crowdDist / 80) * 0.6 : 0),
      rain: this.env.M.rain || 0, tunnel: this.scenery.inTunnel ? this.scenery.inTunnel(c.x, c.y, c.z) : 0,
    };
  }

  // ---- effetti degli urti (auto voxel: i cubetti si staccano)
  urto(im, cars, { interna, mia, timeTrial, visuali, race, player }) {
    this.fx.impact(im.x, im.y, im.z, interna && mia ? im.speed * 0.3 : im.speed, im.nx, im.nz);
    for (const c of cars) {
      if (!c) continue;
      const vis = visuali[race.cars.indexOf(c)];
      const n = Math.min(40, Math.floor((im.speed - 2) * 1.6));
      // time trial: danni sempre spenti, anche quelli estetici (niente cubetti staccati)
      if (n > 0 && vis && vis.damage && !timeTrial) {
        const dx = im.x - c.x, dz = im.z - c.z, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
        const lost = vis.damage(dx * cy + dz * sy, 0.5, -dx * sy + dz * cy, n);
        if (!(interna && c === player)) this.fx.debrisFrom(lost, c);
        c.damage = Math.min(1, c.damage + lost.length * 0.0012);
      }
    }
  }
  strisciata(c, tr) {
    const p = c.proj, side = p.d >= 0 ? 1 : -1;
    this.fx.scrape(c.x + tr.nx[p.i] * side, c.y, c.z + tr.nz[p.i] * side, c.vx, c.vz);
  }
  fxAuto(dt, c) { this.fx.carFx(2 / 120, c, this.env.wet, this.env.night); }   // come Cubo Corse: due passi di fisica
  fuoco(x, y, z) { this.fx.firework(x, y, z); }
  get fuochiArrivo() { return true; }

  disegna(t) { this.renderer.render(t); }
  compila() { this.renderer.r.compile(this.scene, this.camera); }

  // ---- modalità foto: obiettivo, messa a fuoco, sfocatura, esposizione, filtri
  get fotoCompleta() { return true; }
  foto({ fov, fuoco, apertura, esposizione, filtro }) {
    const ap = apertura / 100;
    this.renderer.setDOF(ap > 0.01, fuoco, ap * ap * 0.012);
    this.renderer.r.toneMappingExposure = this.env.O.exposure * (esposizione / 100);
    this.renderer.setFilter(filtro);
  }
  fineFoto() {
    this.renderer.setDOF(false);
    this.renderer.setFilter('nessuno');
    this.renderer.r.toneMappingExposure = this.env.O.exposure;
  }
  salvaFoto(nome) { this.renderer.screenshot(nome); }
  /** auto distrutta: bianco e nero con vignettatura */
  distruzione(on) {
    this.renderer.setFilter(on ? 'bianco e nero' : 'nessuno');
    this.renderer.filter.uniforms.uVignette.value = on ? 0.7 : 0.25;
  }

  // ---- risoluzione dinamica e pannello prestazioni
  get pixelRatio() { return this.renderer.r.getPixelRatio(); }
  get pixelRatioBase() { return this.renderer.basePR || this.pixelRatio; }
  impostaPixelRatio(pr, scende) { if (scende && this.renderer.gtao) this.renderer.gtao.enabled = false; this.renderer.setPixelRatio(pr); }
  infoPrestazioni() {
    const R = this.renderer, info = R.r.info, c = R.r.domElement, kind = gpuKind(R.gpu);
    return `GPU: ${(R.gpu || 'sconosciuta').replace(/^ANGLE \(/, '').replace(/\)$/, '').slice(0, 64)}${kind === 'software' ? '   ⚠ SENZA SCHEDA VIDEO' : kind === 'integrata' ? '   ⚠ grafica integrata' : ''}\n` +
      `qualità ${R.q.nome}   ${c.width}×${c.height} px (scala ${R.r.getPixelRatio().toFixed(2)})   ${info.render.calls} chiamate   ${(info.render.triangles / 1e6).toFixed(2)} M triangoli`;
  }
  get tipoGpu() { return gpuKind(this.renderer.gpu); }
}
