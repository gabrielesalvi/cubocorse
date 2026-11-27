// Cubo Corse — avvio, stati (menu/gara/pausa/foto/risultati), ciclo a passo fisso.
// Fase 0 (20-11-2026): un solo gioco per le piste di Cubo Corse (mondo voxel) e per i circuiti di Circuit Studio (mondo
// dei pacchetti, low-poly). La fisica, le regole, i comandi, il menu e i record sono gli stessi; la grafica la dà il mondo
// della pista scelta (src/mondi/voxel.js o src/mondi/pacchetto.js), con la stessa interfaccia. Passare da un mondo
// all'altro ricarica la pagina (renderer diversi: quello dei pacchetti usa la profondità logaritmica).
import * as THREE from 'three';
import { CARS, MODELLO, setModelloGuida, setArcadeTuning, MARGINI_STERZO } from './sim/car.js';
import { Race, LIVREE, preparaLinee } from './sim/race.js';
import { buildRacingLineAsync } from './sim/racingline.js';
import { cedi } from './cedi.js';
import { racingLineMesh } from './gfx/linea.js';
import * as REC from './ui/record.js';
import { Specchio } from './gfx/specchio.js';
import { Ghost, caricaGhost, salvaGhost } from './gfx/ghost.js';
import { CameraRig, VISUALI_NOMI } from './gfx/cameras.js';
import { AudioEngine } from './audio/audio.js';
import * as UI from './ui/ui.js';
import { Pad, PadSchermata, nomeController } from './ui/pad.js';
import { MondoVoxel, PISTE_VOXEL, elencoVoxel, INFO_VOXEL } from './mondi/voxel.js';
import { MondoPacchetto, elencoPacchetti, INFO_PACCHETTO, qualitaAutoCS } from './mondi/pacchetto.js';
import { Vetrina } from './ui/vetrina.js';
import { caricaVersioni, versionePista, storiaPista, chiaveRecord } from './ui/versioni.js';   // 21-11: versioni delle piste
import { mostraNovita, novitaDaMostrare } from './ui/novita.js';
import { VERSIONE } from './versione.js';
import { avviaMisura } from './ui/misura.js';
import { RegistroCali } from './ui/cali.js';   // 24-11: ?fps=1, registro dei cali di fotogrammi (tasto K)   // 22-11 fase 2a: ?misura=1, prestazioni sul telefono
import { Telefono, preparaApp, schermoIntero, DISPOSITIVO_TOCCO } from './ui/tocco.js';
import { leggiProve, preparaProve } from './ui/prove.js';       // 22-11 fase 2b-2d: comandi del telefono, app sulla Home

const STEP = 1 / 120;
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const $id = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
// 25-11: strumenti di prova accesi da dentro il gioco (ui/prove.js, 5 tocchi sul logo): valgono come nell'indirizzo, che
// nell'app sulla schermata Home non si può cambiare. L'indirizzo vince.
for (const [k, v] of Object.entries(leggiProve())) if (!Q.has(k)) Q.set(k, v);
// visibile solo da Tailscale (rete di casa): link «Apri nello Studio» per i circuiti di Circuit Studio
const STUDIO = /^100\.\d+\.\d+\.\d+$|\.ts\.net$/.test(location.hostname) ? `http://${location.hostname.endsWith('.ts.net') ? location.hostname : '100.64.65.118'}:8112/viewer/` : null;

// ------------------------------------------------------------------ comandi
/** tasti che guidano l'auto (frecce, WASD, freno a mano): solo questi fanno contare la tastiera come comando in uso */
const TASTI_GUIDA = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space']);
class Input {
  constructor() {
    this.k = new Set();
    this.steer = 0; this.thr = 0; this.brk = 0;
    this.handlers = {};
    this.ultimaTastiera = 0; // performance.now() dell'ultimo tasto: decide se guida la tastiera o il controller
    this.pad = null;
    this.comando = 'tastiera';
    this.telefono = null;   // comandi del telefono (fase 2)
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      const c = e.code;
      // 21-11 sera (Gabriele): solo i tasti di guida fanno passare alla tastiera. Prima qualunque tasto (C per la visuale,
      // Esc per la pausa, L, G…) toglieva la guida al controller finché non si muoveva una levetta, e il giro risultava
      // fatto da tastiera (simbolo sbagliato nei record).
      if (TASTI_GUIDA.has(c)) this.ultimaTastiera = performance.now();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
      if (!e.repeat && this.handlers[c]) this.handlers[c](e);
      this.k.add(c);
    });
    addEventListener('keyup', (e) => this.k.delete(e.code));
    addEventListener('blur', () => this.k.clear());
  }
  on(code, fn) { this.handlers[code] = fn; }
  has(...c) { return c.some((x) => this.k.has(x)); }
  /** comandi filtrati per la fisica (tastiera digitale → analogico morbido); this.comando = chi sta guidando */
  sample(dt, speed) {
    const P = this.pad, T = this.telefono;
    if (P && P.inUso(Math.max(this.ultimaTastiera, T?.ultimoTocco || 0))) {
      // controller: valori analogici già passati per zone morte e curve (src/ui/pad.js), niente rampa da tastiera
      const v = P.val;
      this.comando = 'controller';
      this.steer = v.steer; this.thr = v.throttle; this.brk = v.brake;
      return { throttle: v.throttle, brake: v.brake, steer: v.steer, handbrake: !!P.giu.manoFreno || this.has('Space'), assist: true, sterzoLibero: !P.cfg.aiuti, sim: !!this.sim };
    }
    // telefono (fase 2b): tasti a schermo o inclinazione. this.telefono.leggi() dà già sterzo, gas, freno e freno a mano
    // filtrati (e gas/freno automatici se accesi), col tipo 'telefono' per il simbolo in classifica (uno solo dal 23-11)
    if (T && T.inUso()) {
      const v = T.leggi(dt, speed);
      this.comando = T.tipo;
      this.steer = v.steer; this.thr = v.throttle; this.brk = v.brake;
      return { throttle: v.throttle, brake: v.brake, steer: v.steer, handbrake: !!v.handbrake, assist: true, sim: !!this.sim };
    }
    this.comando = 'tastiera';
    let up = this.has('ArrowUp', 'KeyW');
    const dn = this.has('ArrowDown', 'KeyS');
    const L = this.has('ArrowLeft', 'KeyA'), R = this.has('ArrowRight', 'KeyD');
    // pedali assistiti: «gas» = accelera da solo se non freni; «freno» = frena da solo appena lasci il gas
    if (this.pedali === 'gas' && !dn) up = true;
    let brkT = dn ? 1 : 0;
    if (this.pedali === 'freno' && !up && !dn && speed > 2) brkT = 0.7; // dolce: non blocca di colpo, si ferma sotto i 7 km/h
    this.thr += ((up ? 1 : 0) - this.thr) * Math.min(1, dt * (up ? 7 : 12));
    this.brk += (brkT - this.brk) * Math.min(1, dt * (brkT > this.brk ? (dn ? 9 : 4) : 14));
    const target = (R ? 1 : 0) - (L ? 1 : 0);
    // rampa dello sterzo da tastiera secondo il modello di guida (Agile e Composta: 5/60, inversione 8; «precedente» 3,4/45, 7)
    const S = MODELLO.sterzo;
    const rate = target === 0 ? 6.5 : (Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? S.inverti : S.su / (1 + speed / S.v0));
    const d = target - this.steer;
    this.steer += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    return { throttle: this.thr, brake: this.brk, steer: this.steer, handbrake: this.has('Space'), assist: true, sim: !!this.sim };
  }
}

/**
 * 23-11 (sonda del caricamento): dai tempi dei messaggi di avanzamento a una lista di fasi in secondi, la più lunga prima.
 * Ogni messaggio dura fino al successivo; «installa» si divide in preparazione della gara e compilazione degli shader.
 */
function tempiCarico(id, tempi, inst = {}) {
  const fasi = new Map();
  for (let i = 0; i + 1 < tempi.length; i++) {
    const nome = tempi[i][1];
    if (nome === 'installa') continue;
    fasi.set(nome, (fasi.get(nome) || 0) + (tempi[i + 1][0] - tempi[i][0]) / 1000);
  }
  if (inst.gara != null) fasi.set('gara (auto, IA)', inst.gara / 1000);
  if (inst.shader != null) fasi.set('shader', inst.shader / 1000);
  const totale = (tempi.at(-1)[0] - tempi[0][0]) / 1000 + ((inst.gara || 0) + (inst.shader || 0)) / 1000;
  return { id, totale: +totale.toFixed(2), fasi: [...fasi].map(([n, v]) => [n, +v.toFixed(2)]).sort((a, b) => b[1] - a[1]) };
}

// ------------------------------------------------------------------ applicazione
class App {
  async start() {
    this.settings = UI.loadSettings();
    const s = this.settings;
    if (Q.get('pista')) s.track = Q.get('pista');
    if (Q.get('v')) s.versione = Q.get('v');
    if (!CARS[s.car]) s.car = 0;
    // guida realistica tolta dal menu (decisione del 17-11): il codice resta, si prova solo con ?fisica=realistica
    s.fisica = Q.get('fisica') === 'realistica' ? 'realistica' : 'arcade';
    s.sterzoPista = s.sterzoPista || {};
    $id('gl')?.remove();              // i canvas li crea ogni mondo (21-11: un mondo per pista, caricato dietro il menu)
    UI.setLoading(0.2, 'Preparo le piste…');
    // elenco delle piste: per il menu basta poco (contorni e dati); la pista vera si costruisce dietro il menu
    this.pacchetti = await elencoPacchetti();
    this.datiVoxel = await elencoVoxel();
    await caricaVersioni();
    this.cachePacchetti = {};
    if (!PISTE_VOXEL.includes(s.track) && !this.pacchetti.some((p) => p.id === s.track)) s.track = 'monza';
    this.piste = [...this.datiVoxel.lista, ...this.pacchetti];
    this.nomiPiste = {};
    for (const t of this.piste) {
      if (t.mondo === 'voxel') this.nomiPiste[t.id] = t.nome;
      else for (const v of t.versioni) this.nomiPiste[`${t.id}-${v.k}`] = `${t.nome} ${v.k}`;
    }
    this.specchio = new Specchio(false);
    this.audio = new AudioEngine();
    this.input = new Input();
    this.pad = new Pad();
    this.input.pad = this.pad;
    this.telefono = new Telefono(this);
    this.input.telefono = this.telefono;
    this.padUI = new PadSchermata(this.pad, $id('padcfg'), { chiudi: () => this.padUI.chiudi(), toast: (m) => UI.toast(m, 2400) });
    this.pad.onIndietro = () => this.indietroPad();
    this.pad.onCollega = (nome) => UI.toast(`Controller collegato: ${nome}`, 2400);
    this.pad.onScollega = () => {
      UI.toast('Controller scollegato', 3000);
      if (this.mode === 'race' && !this.paused && !this.photo) this.setPause(true);
    };
    this.hud = new UI.HUD();
    this.clock = 0;
    this.acc = 0;
    try { this.vetrina = new Vetrina($id('vetrina')); } catch (e) { console.warn('vetrina', e); }
    UI.buildMenu(s, this.piste, { change: (k) => this.onSetting(k), go: () => this.go() }, { voxel: INFO_VOXEL, pacchetto: INFO_PACCHETTO });
    $id('menu').addEventListener('pista-scelta', () => this.prepara());
    this.bindKeys();
    this.bindPanels();
    this.bindFoto();
    UI.showScreen('loading', false);
    UI.showScreen('menu', true);
    this.mode = 'menu';
    this.aggiornaVetrina();
    this.recordMenu();
    this.linkStudio();
    // 21-11: versione del gioco in alto nel menu; le novità si aprono da sole una volta dopo ogni aggiornamento
    const bv = $id('bnovita'); if (bv) bv.textContent = `Novità · v${VERSIONE.replace(/-pre$/, ' (in arrivo)')}`;
    const bv2 = $id('bnovita2'); if (bv2) bv2.textContent = `Novità · versione ${VERSIONE.replace(/-pre$/, ' (in arrivo)')}`;
    if (novitaDaMostrare() && !Q.get('misura')) this.apriNovita();
    preparaApp(VERSIONE);
    preparaProve({ cali: (on) => { this.cali = on ? new RegistroCali(this) : null; } });
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.prepara();                   // la pista scelta si costruisce dietro il menu
    if (Q.get('via')) this.go();
    if (Q.get('misura')) avviaMisura(this, /^(basso|medio|alto|ultra|telefono)$/.test(Q.get('misura')) ? Q.get('misura') : (document.body.classList.contains('tocco') ? 'telefono' : 'basso'));
  }

  // rimandi al mondo per i test e la console (prima stavano in App)
  get renderer() { return this.mondo && (this.mondo.renderer || { r: this.mondo.r, scene: this.mondo.scene }); }
  get scene() { return this.mondo?.scene; }
  get fx() { return this.mondo?.fx; }
  get env() { return this.mondo?.env; }
  get world() { return this.mondo?.world; }
  get scenery() { return this.mondo?.scenery; }

  pista() { return this.piste.find((t) => t.id === this.settings.track) || this.piste[0]; }
  /** versione scelta della pista (solo circuiti di Circuit Studio) */
  versione(t = this.pista()) {
    if (t.mondo !== 'pacchetto') return '';
    return t.versioni.some((x) => x.k === this.settings.versione) ? this.settings.versione : t.versioni.at(-1).k;
  }
  /** id della pista scelta per record, ghost e storico: le piste dei pacchetti con la versione (roncadelle-B) */
  pistaId() { const t = this.pista(); return t.mondo === 'voxel' ? t.id : `${t.id}-${this.versione(t)}`; }
  /** chiave dei record e dei ghost: la pista con la sua versione (21-11), l'attuale se v non c'è */
  pistaRecord(v) { return chiaveRecord(this.pistaId(), v ?? versionePista(this.pistaId())); }
  /** nome della pista con la versione, per i titoli dei record */
  nomeRecord(v) { const id = this.pistaId(); return `${this.nomiPiste?.[id] || id} · v${v ?? versionePista(id)}`; }
  /** cosa serve costruire per la scelta del menu (la qualità conta solo nel mondo voxel: là cambia la costruzione) */
  chiaveSelezione() { const t = this.pista(); return `${t.id}|${this.versione(t)}|${t.mondo === 'voxel' ? this.settings.qual : this.cittaLeggera() ? 'leggera' : ''}`; }
  /** 27-11: città leggera delle piste di Circuit Studio: su telefoni e tablet SEMPRE, qualunque qualità (Gabriele: «a prescindere
   *  dalla qualità, anche ultra», anche iPad); sul PC a Telefono o Bassa (anche con «Auto» che le sceglie). ?leggera=0/1 per le prove */
  cittaLeggera() { const L = new URLSearchParams(location.search).get('leggera'); if (L) return L === '1'; if (DISPOSITIVO_TOCCO) return true; const q = this.settings.qual === 'auto' ? qualitaAutoCS() : this.settings.qual; return q === 'telefono' || q === 'basso'; }
  /** la pista scelta è quella pronta dietro il menu? */
  pronta() { return !!this.mondo && !this._prep && this.chiaveMondo === this.chiaveSelezione(); }

  // ---------------------------------------------------------------- pista
  /**
   * 21-11 (Gabriele: «la pista si carichi comunque, ma senza oscurare il menu»): la pista scelta si costruisce in un mondo
   * nuovo, su un canvas nascosto dietro il menu; quando è pronta prende il posto di quella di prima, che si chiude.
   * Niente schermata di caricamento e niente pagina ricaricata, nemmeno fra piste voxel e circuiti di Circuit Studio.
   * Una scelta nuova durante il caricamento lo annulla al primo passo utile. Il pulsante VIA mostra a che punto è.
   */
  prepara() {
    const s = this.settings, t = this.pista(), chiave = this.chiaveSelezione();
    if (this._prep?.chiave === chiave) return this._prep.promessa;
    if (!this._prep && this.mondo && this.chiaveMondo === chiave) return Promise.resolve();
    if (this._prep) this._prep.annullato = true;
    const job = { chiave, annullato: false, tempi: [[performance.now(), 'avvio']] };   // 23-11: tempi delle fasi (sonda del caricamento)
    this._prep = job;
    this.statoCarico(0.02, `Preparo ${t.nome}…`);
    const ANNULLATO = {};
    job.promessa = (async () => {
      await nextFrame();
      if (job.annullato) return;
      const canvas = document.createElement('canvas');
      canvas.className = 'gl attesa';
      document.body.prepend(canvas);
      let M = null;
      try {
        M = t.mondo === 'voxel' ? new MondoVoxel(canvas, s) : new MondoPacchetto(canvas, s);
        if (M.tipo === 'voxel') M.usaDati(this.datiVoxel); else M.cacheDati = this.cachePacchetti;
        M.avviso = (m) => UI.toast(m, 6000);
        const res = await M.carica(t.id, { ...s, versione: this.versione(t) || s.versione, leggera: chiave.endsWith('|leggera') }, (p, m) => {
          if (job.annullato) throw ANNULLATO;
          job.tempi.push([performance.now(), m.replace(/…$/, '')]);
          if (this._prep === job) this.statoCarico(p, `${t.nome}: ${m.replace(/…$/, '')}`);
        }, (tr) => buildRacingLineAsync(tr, CARS[0]));
        if (job.annullato) throw ANNULLATO;
        // 27-11: traiettorie dell'IA e del giocatore a pezzi adesso, non tutte insieme in setupRace (vetrina ferma 1-2 s)
        job.tempi.push([performance.now(), 'traiettorie']);
        if (this._prep === job) this.statoCarico(0.97, `${t.nome}: preparo gli avversari`);
        await preparaLinee(res.track, [...this.autoIA(M).map((k) => CARS[k]), CARS[s.car] || CARS[0]], M.wet || 0, { spec: CARS[0], rl: res.rl });
        if (job.annullato) throw ANNULLATO;
        job.tempi.push([performance.now(), 'shader']);
        try { await M.compilaAsync(); } catch (e) { console.warn('shader', e); }
        if (job.annullato) throw ANNULLATO;
        await cedi();
        job.tempi.push([performance.now(), 'installa']);
        this.installa(M, res, chiave);
        this.ultimoCarico = tempiCarico(t.id, job.tempi, this._tInstalla);
      } catch (e) {
        if (M) { try { M.distruggi(); } catch { /* niente */ } } else canvas.remove();
        if (e !== ANNULLATO) { console.error(e); window.__errore = e.stack; UI.toast('Pista non caricata: ' + e.message, 8000); }
      } finally {
        if (this._prep === job) {
          this._prep = null; this.statoCarico();
          if (this._viaInAttesa && this.pronta()) this.go();     // VIA premuto mentre la pista si preparava
        }
      }
    })();
    return job.promessa;
  }

  /** il mondo appena costruito prende il posto di quello di prima */
  installa(M, { track, rl, griglia }, chiave) {
    const vecchio = this.mondo, modoRig = this.rig?.mode;
    this.mondo = M; this.chiaveMondo = chiave;
    this.camera = M.camera;
    this.rig = new CameraRig(M.camera, M.canvas);
    if (modoRig) this.rig.mode = modoRig;
    this.specchio.leggero = !!M.leggero; M.specchio = this.specchio;
    this.track = track; this.rl = rl; this.griglia = griglia || null;
    if (this.lineaMesh) this.lineaMesh.geometry.dispose();
    this.lineaMesh = racingLineMesh(track, rl);
    this.lineaMesh.visible = !!this.settings.linea;
    M.scene.add(this.lineaMesh);
    this.hud.setTrack(track);
    this.loadTimes = M.loadTimes;
    document.body.classList.toggle('mondo-pacchetto', M.tipo !== 'voxel');
    if (this.ghost) { this.ghost.dispose(); this.ghost = null; }
    this.visuals = null;
    const t0 = performance.now();
    this.setupRace(false);
    const t1 = performance.now();
    M.compila();
    this._tInstalla = { gara: t1 - t0, shader: performance.now() - t1 };
    M.canvas.classList.remove('attesa');
    M.canvas.id = 'gl';
    this.recordMenu();
    if (vecchio) this.butta(vecchio);
  }

  /** 27-11: il mondo vecchio si chiude a pezzi, dopo che il nuovo è al suo posto (prima: 1-2 s di vetrina ferma) */
  async butta(W) {
    W.canvas.classList.add('attesa'); W.canvas.id = '';
    await cedi();
    try { W.scene?.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } catch (e) { console.warn(e); }
    await cedi();
    W.distruggi();
  }

  /** auto dell'IA secondo la pista (Gabriele 20-11): sulle piste voxel solo le auto voxel, su quelle di Circuit Studio
   *  solo le sue tre auto; il giocatore sceglie quella che vuole */
  autoIA(W) { return CARS.map((c, k) => (c.modello === (W.tipo === 'voxel' ? 'voxel' : 'lowpoly') ? k : -1)).filter((k) => k >= 0); }

  /** pulsante VIA e riga di stato del menu durante il caricamento dietro il menu; senza argomenti = pronto */
  statoCarico(p, msg) {
    const b = $id('go'), st = $id('mstato');
    if (!b) return;
    const carica = p !== undefined;
    b.classList.toggle('carica', carica);
    b.querySelector('.go-barra').style.width = carica ? `${Math.round(Math.min(1, p) * 100)}%` : '0';
    b.querySelector('.go-testo').textContent = carica ? (this._viaInAttesa ? 'PARTO APPENA È PRONTA…' : 'VIA!') : 'VIA!';
    if (st) st.textContent = carica ? msg || '' : '';
  }

  /** auto scelta nella vetrina del menu */
  aggiornaVetrina() {
    const s = this.settings;
    this.vetrina?.mostra(CARS[s.car] || CARS[0], LIVREE[s.livery] || LIVREE[0], s.stileAuto);
  }

  /** «Apri nello Studio» (solo da Tailscale) per i circuiti di Circuit Studio */
  linkStudio() {
    const a = $id('astudio');
    if (!a) return;
    const t = this.pista(), on = !!STUDIO && t.mondo === 'pacchetto';
    a.classList.toggle('hidden', !on);
    if (on) a.href = `${STUDIO}?c=${t.id}&v=${this.versione(t)}`;
  }

  // ---------------------------------------------------------------- gara
  /** modello di guida e sterzo da tastiera dalle impostazioni (lo sterzo dipende dalla pista) */
  applicaGuida() {
    const s = this.settings;
    setModelloGuida(Q.get('guida') || s.guida || 'misto');
    const st = s.sterzoPista[s.track] || UI.sterzoPredefinito(this.pista());
    setArcadeTuning(MARGINI_STERZO[st] ?? MARGINI_STERZO.dolce, 0.6);
  }

  setupRace(started) {
    const s = this.settings, W = this.mondo, scene = W.scene;
    this.applicaGuida();
    if (this.visuals) for (const v of this.visuals) { v.group.parent?.remove(v.group); v.dispose(); }
    W.spegniFari();
    this.race = new Race({
      track: this.track, laps: s.laps, difficulty: s.diff, grid: s.grid,
      playerCar: s.car, playerLivery: s.livery, wet: W.wet, seed: (Date.now() & 0xffff),
      penLimiti: !!s.penLimiti, penContatti: !!s.penContatti, timeTrial: s.modo === 'tempo', nAuto: s.nAuto, danniReali: s.danni === 'meccanici',
      griglia: this.griglia,
      autoIA: this.autoIA(W),
    });
    // time trial: fantasma del giro migliore per questa pista (uno solo, qualunque sia il comando: 21-11)
    if (this.ghost) { this.ghost.dispose(); this.ghost = null; }
    if (this.race.timeTrial) {
      const g = caricaGhost(this.pistaRecord());
      const spec = (g && (CARS.find((c) => c.id === g.specId) || CARS[g.specIdx])) || CARS[s.car];
      this.ghost = new Ghost(scene, spec, LIVREE[g ? g.livery ?? s.livery : s.livery] || LIVREE[0], 1, s.stileAuto, W.tipo === 'voxel');
      this.ghost.set(g);
      this.ghost.on = !!s.ghost;
    }
    $id('bfinett').classList.toggle('hidden', !this.race.timeTrial);
    this.input.sim = s.fisica === 'realistica';
    this.input.pedali = s.pedali || 'manuali';
    // via eventuali effetti di una distruzione precedente
    this.distruzione = null;
    W.distruzione(false);
    $id('distrutta').classList.add('hidden');
    $id('distrutta').classList.remove('testo');
    this.player = this.race.player;
    this.visuals = this.race.cars.map((c) => {
      const v = W.creaAuto(c.spec, LIVREE[c.livery] || LIVREE[0], c.num, s);
      scene.add(v.group);
      v.update(c, 0, 0);
      return v;
    });
    this.pVis = this.visuals[this.race.cars.indexOf(this.player)];
    W.accendiFari(this.race, this.visuals);
    this.player.onShift = (d) => this.audio.shift(d);
    this.finishT = -1; this.tvAnchor = null;
    W.nuovaGara();
    this.cheer = 0;
    this.fireworks = 0;
    this._catGiri = []; this._comGiro = new Set(); this._lapPrec = this.player.lap;
    this.rig.setMode(this.rig.mode, this.pVis);
    if (started) W.compila();
  }

  async go() {
    schermoIntero();               // telefono Android nel browser: prima di ogni await, finché vale il tocco su VIA
    UI.saveSettings(this.settings);
    if (!this.audio.ready) {
      try { await this.audio.init(); } catch (e) { console.warn('audio', e); }
    }
    this.audio.ready && this.audio.ui();
    this.audio.setMuted(!!this.settings.muto);
    // la pista scelta non è ancora pronta: si parte appena lo è (il menu resta com'è, il pulsante dice a che punto)
    if (!this.pronta()) { this._viaInAttesa = true; this.prepara(); this.statoCarico(0.05, $id('mstato')?.textContent); return; }
    this._viaInAttesa = false;
    const W = this.mondo, s = this.settings;
    if (W.tipo === 'pacchetto') { const wantQ = s.qual === 'auto' ? W.qualitaAuto() : s.qual; if (W.qualitaAttuale() !== wantQ) W.impostaQualita(wantQ); }
    this.setupRace(true);
    UI.apriFoglio(null);
    for (const id of ['impostazioni', 'novita', 'storico', 'conferma']) UI.showScreen(id, false);
    UI.showScreen('menu', false);
    UI.showScreen('results', false);
    UI.showScreen('hud', true);
    this.mode = 'race';
    this.paused = false;
    this.dyn = null; // misura della risoluzione dinamica da capo a ogni gara
    this.raceClock = 0;
    this.hud.camLabel(VISUALI_NOMI[this.rig.mode]);
  }

  onSetting(k) {
    this.audio.ready && this.audio.ui();
    const s = this.settings, W = this.mondo;
    UI.saveSettings(s);
    const stessoMondo = W && (W.tipo === 'voxel') === (this.pista().mondo === 'voxel');
    if (k === 'track' || k === 'versione') {
      this.linkStudio();
      if (UI.foglioAperto() !== 'pista') this.prepara();
      else if (this._prep) { this._prep.annullato = true; this._prep = null; this.statoCarico(); }   // si costruisce alla chiusura del pannello
    }
    else if (k === 'qual') {
      if (this.pista().mondo === 'voxel') this.prepara();            // nel mondo voxel la qualità cambia la costruzione
      else if (W && W.tipo === 'pacchetto') {
        W.impostaQualita(s.qual === 'auto' ? W.qualitaAuto() : s.qual);
        if (this.mode === 'menu' && this.chiaveMondo !== this.chiaveSelezione()) this.prepara();   // città leggera sì/no: si ricostruisce (in gara alla prossima partenza)
      }
    } else if ((k === 'ora' || k === 'meteo') && stessoMondo) { W.atmosfera(s); this.setupRace(false); }
    else if (['car', 'livery', 'stileAuto'].includes(k)) { this.aggiornaVetrina(); if (W) this.setupRace(false); }
    else if (['modo', 'nAuto', 'grid'].includes(k) && W) this.setupRace(false);
    else if (k === 'linea' && this.lineaMesh) this.lineaMesh.visible = !!s.linea;
    else if (k === 'pubblico' && W?.impostaPubblico) W.impostaPubblico(!!s.pubblico);
    else if (k === 'muto') this.impostaMuto(!!s.muto);
    else if (k === 'guida' || k === 'sterzo') this.applicaGuida();       // 26-11: anche dalla pausa, vale da subito
    else if (k === 'pedali') this.input.pedali = s.pedali || 'manuali';
    if (['telSterzo', 'telPedali', 'telLeva', 'telGas', 'telFreno'].includes(k)) this.telefono.aggiornaSchema();
    if (['track', 'versione', 'modo'].includes(k)) this.recordMenu();
  }

  bindKeys() {
    const I = this.input;
    I.on('KeyC', () => {
      if (this.mode !== 'race' || this.paused) return;
      this.hud.camLabel(VISUALI_NOMI[this.rig.next(this.pVis)]);
    });
    I.on('KeyR', () => {
      if (this.mode === 'race' && !this.paused && this.race.started && !this.player.distrutta) this.race.resetCar(this.player, this.rl);
    });
    I.on('KeyP', () => { if (this.mode === 'race' || this.mode === 'results') this.togglePhoto(); });
    I.on('Escape', () => {
      if (this.padUI.aperta) { if (this.pad.cattura) this.pad.annullaCattura(); else this.padUI.chiudi(); return; }
      if (this.chiudiInCima()) return;
      if (this.photo) return this.togglePhoto();
      if (this.mode === 'race') this.setPause(!this.paused);
    });
    I.on('KeyM', () => {
      this.impostaMuto(!this.settings.muto);
      UI.toast(this.settings.muto ? 'Audio spento' : 'Audio acceso', 1000);
    });
    I.on('KeyH', () => $id('hud').classList.toggle('hidden'));
    I.on('KeyG', () => {
      this.settings.ghost = !this.settings.ghost;
      if (this.ghost) this.ghost.on = this.settings.ghost;
      UI.saveSettings(this.settings);
      UI.toast(this.settings.ghost ? 'Ghost visibile' : 'Ghost nascosto', 1000);
    });
    I.on('KeyL', () => {
      this.impostaLinea(!this.settings.linea);
      UI.toast(this.settings.linea ? 'Traiettoria ideale visibile' : 'Traiettoria ideale nascosta', 1000);
    });
    I.on('KeyF', () => {
      this.perfOn = !this.perfOn;
      $id('perf').classList.toggle('hidden', !this.perfOn);
      this.perf = { n: 0, t0: performance.now(), max: 0, cpu: 0 };
    });
  }

  bindPanels() {
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => {
        this.audio.ready && this.audio.ui();
        const a = b.dataset.act;
        if (a === 'resume') this.setPause(false);
        // 26-11: dalla pausa Ricomincia ed Esci chiedono conferma; dai risultati no (la gara è già finita)
        if (a === 'restart') {
          if (this.paused) return this.conferma('Ricominciare la gara da capo?', 'Ricomincia', () => this.ricomincia());
          this.ricomincia();
        }
        if (a === 'menu') {
          if (this.paused) return this.conferma('Uscire al menu principale? La gara in corso si perde.', 'Esci', () => this.toMenu());
          this.toMenu();
        }
        if (a === 'confNo') this.conferma(null);
        if (a === 'confSi') { const f = this._conf; this.conferma(null); f && f(); }
        if (a === 'via') { UI.apriFoglio(null); this.go(); }
        if (a === 'chiudiFoglio') UI.apriFoglio(null);
        if (a === 'impostazioni') { UI.apriFoglio(null); UI.showScreen('impostazioni', true); }
        if (a === 'chiudiImp') UI.showScreen('impostazioni', false);
        if (a === 'storico') { $id('stab').innerHTML = REC.htmlStorico(REC.storico(), this.nomiPiste || {}); UI.showScreen('storico', true); }
        if (a === 'chiudiStorico') UI.showScreen('storico', false);
        if (a === 'novita') this.apriNovita();
        if (a === 'chiudiNovita') UI.showScreen('novita', false);
        if (a === 'fineTT') this.fineTimeTrial();
        if (a === 'pad') this.padUI.apri();
        if (a === 'photo') { this.setPause(false); this.togglePhoto(); }
        if (a === 'mute') this.impostaMuto(!this.settings.muto);
        if (a === 'lineaTog') this.impostaLinea(!this.settings.linea);
        if (a === 'visuale' && this.mode === 'race') { this.hud.camLabel(VISUALI_NOMI[this.rig.next(this.pVis)]); UI.toast(VISUALI_NOMI[this.rig.mode], 1200); }
      };
    });
    // pausa: classifica o una parte delle impostazioni nel riquadro di destra
    document.querySelectorAll('#pause [data-pv]').forEach((b) => { b.onclick = () => this.vistaPausa(b.dataset.pv); });
    this.aggiornaInterruttori();
  }

  /** gara ricominciata (dalla pausa dopo la conferma, o «Rigioca» dai risultati) */
  ricomincia() { $id('rrecord')?._confermaNome?.(); UI.showScreen('results', false); this.setPause(false); this.go(); }

  /** finestra «sei sicuro?»: testo + etichetta del pulsante + cosa fare; senza testo si chiude */
  conferma(testo, etichetta, fatto) {
    this._conf = testo ? fatto : null;
    if (testo) { $id('conftesto').textContent = testo; $id('confsi').textContent = etichetta; }
    UI.showScreen('conferma', !!testo);
  }

  /** chiude la cosa più in alto (conferma, storico, novità, pannello del menu, impostazioni); false se non c'era niente */
  chiudiInCima() {
    if ($id('conferma').classList.contains('show')) { this.conferma(null); return true; }
    if ($id('storico').classList.contains('show')) { UI.showScreen('storico', false); return true; }
    if ($id('novita').classList.contains('show')) { UI.showScreen('novita', false); return true; }
    if (this.mode === 'menu' && UI.foglioAperto()) { UI.apriFoglio(null); return true; }
    if ($id('impostazioni').classList.contains('show')) { UI.showScreen('impostazioni', false); return true; }
    return false;
  }

  impostaMuto(m) {
    this.settings.muto = m;
    this.audio.setMuted(m);
    UI.saveSettings(this.settings);
    this.aggiornaInterruttori();
  }
  impostaLinea(on) {
    this.settings.linea = on;
    if (this.lineaMesh) this.lineaMesh.visible = on;
    UI.saveSettings(this.settings);
    this.aggiornaInterruttori();
  }
  /** interruttori della pausa e segmenti delle impostazioni allineati alle scelte (anche quando cambiano coi tasti M e L) */
  aggiornaInterruttori() {
    const s = this.settings;
    const bm = $id('bmute');
    bm.innerHTML = s.muto ? '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>Audio no'
      : '<svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>Audio sì';
    bm.classList.toggle('sel', !s.muto);
    $id('blinea').classList.toggle('sel', !!s.linea);
    for (const [id, v] of [['audio', 1 - !s.muto], ['linea', +!!s.linea]]) {
      $id(id)?.querySelectorAll('button').forEach((b, i) => b.classList.toggle('sel', i === v));
    }
  }

  /** riquadro di destra della pausa: classifica e tempi, oppure una parte delle impostazioni (spostata qui dalla sua schermata) */
  vistaPausa(v) {
    document.querySelectorAll('#pause [data-pv]').forEach((b) => b.classList.toggle('sel', b.dataset.pv === v));
    const dx = $id('pause').querySelector('.pdestra'), corpo = $id('impcorpo');
    const classifica = v === 'classifica';
    dx.classList.toggle('imp', !classifica);
    if (classifica) { if (corpo.parentElement !== $id('impostazioni')) $id('impostazioni').appendChild(corpo); this.classificaPausa(); }
    else { UI.categoria(v); if (corpo.parentElement !== dx) dx.appendChild(corpo); }
  }

  /** classifica e tempi della gara in corso, per la pausa */
  classificaPausa() {
    const el = $id('pclass'), R = this.race, p = this.player;
    if (!R || !p) { el.innerHTML = ''; return; }
    const nome = this.nomiPiste?.[this.pistaId()] || this.pista().nome;
    const chip = (t) => `<span class="chip">${t}</span>`;
    const tempi = chip(`Migliore ${UI.fmt(p.best)}`) + chip(`Ultimo ${UI.fmt(p.lapTimes.at(-1))}`) + (p.pen ? chip(`Penalità +${p.pen} s`) : '');
    if (R.timeTrial) {
      el.innerHTML = `<div class="ptit">Time trial · ${nome}</div><div class="chips">${tempi}${chip(`Giri fatti ${Math.max(0, p.lap - 1)}`)}</div>`;
      return;
    }
    const st = R.standings(), lead = st[0], T = this.track;
    const righe = st.map((c, i) => {
      let gap = '—';
      if (i > 0) { const dl = lead.dist - c.dist; gap = dl > T.length ? `+${Math.floor(dl / T.length)} g` : '+' + (dl / Math.max(20, c.speed || 40)).toFixed(1); }
      return `<tr class="${c === p ? 'io' : ''}"><td class="n">${i + 1}</td><td>${c === p ? 'Tu' : c.nome}</td><td class="a">${c.spec.nome}</td><td class="t">${gap}</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="ptit">Giro ${Math.max(1, Math.min(R.laps, p.lap || 1))} di ${R.laps} · ${nome}</div><table class="ptab">${righe}</table><div class="chips">${tempi}</div>`;
  }

  /** modalità foto: camera libera, obiettivo, esposizione (nel mondo voxel anche messa a fuoco, sfocatura e filtri), PNG */
  bindFoto() {
    const upd = () => {
      if (!this.photo) return;
      this.camera.fov = +$id('pfov').value;
      this.camera.updateProjectionMatrix();
      this.mondo.foto({ fov: +$id('pfov').value, fuoco: +$id('pfocus').value, apertura: +$id('paper').value, esposizione: +$id('pexp').value, filtro: $id('pfilter').value });
      const hide = $id('phud').checked;
      this.visuals.forEach((v, k) => { if (v !== this.pVis) v.group.visible = !hide && !this.race.cars[k].rimossa; });
    };
    ['pfov', 'pfocus', 'paper', 'pexp', 'pfilter', 'phud'].forEach((id) => ($id(id).oninput = upd));
    this.photoUpd = upd;
    $id('psave').onclick = () => {
      const t = new Date();
      this.mondo.salvaFoto(`cubo-corse-${this.pistaId()}-${t.getHours()}${String(t.getMinutes()).padStart(2, '0')}${String(t.getSeconds()).padStart(2, '0')}.png`);
      UI.toast('Foto salvata');
    };
    $id('pexit').onclick = () => this.togglePhoto();
  }

  /** ○ del controller nei menu: chiude la schermata in cima, o riprende la gara dalla pausa */
  indietroPad() {
    if (this.padUI.aperta) return this.padUI.chiudi();
    if (this.chiudiInCima()) return;
    if (this.photo) return this.togglePhoto();
    if (this.mode === 'race' && this.paused) return this.setPause(false);
    const d = document.activeElement && document.activeElement.closest && document.activeElement.closest('details[open]');
    if (d) { d.open = false; d.querySelector('summary').focus(); }
  }

  /** controller: lettura una volta per fotogramma, azioni, vibrazione, schermata di configurazione */
  padFrame(dt) {
    const P = this.pad;
    const guida = this.mode === 'race' && !this.paused && !this.photo && !this.padUI.aperta;
    const scatti = P.poll(dt, guida);
    for (const a of scatti) { this.input.ultimaTastiera = 0; this.input.handlers[a.key] && this.input.handlers[a.key](); }
    P.vibra(dt, this.player, guida && this.race && this.race.started && !this.player.finished && !this.player.distrutta);
    this.telefono.frame(dt, this.player, guida && this.race && this.race.started && !this.player.finished && !this.player.distrutta);
    this.padUI.aggiorna();
    const inUso = P.inUso(this.input.ultimaTastiera);
    const T = this.telefono;
    const stato = P.gp ? nomeController(P.gp.id) + (inUso ? ' · in uso' : '') : T.inUso() ? `Telefono · ${{ tasti: 'tasti', leva: 'leva', inclinazione: 'inclinazione' }[T.sterzo]}${T.pedali === 'cursore' ? ' e cursore' : ''}` : 'Tastiera';
    if (stato !== this._padStato) {
      this._padStato = stato;
      const el = $id('mpadstato');
      if (el) el.textContent = stato;
      if (this.mode === 'menu') this.recordMenu();     // i record del menu seguono il comando in uso
    }
    const kr = inUso ? P.nomeAzione('rimetti') : this.telefono.inUso() ? '↺' : 'R';
    if (kr !== this._kRec) { this._kRec = kr; $id('hrecuperok').textContent = kr; }
  }

  setPause(on) {
    this.paused = on;
    document.body.classList.toggle('in-pausa', on);
    if (on) this.vistaPausa('classifica');
    else { this.conferma(null); if ($id('impcorpo').parentElement !== $id('impostazioni')) $id('impostazioni').appendChild($id('impcorpo')); }
    UI.showScreen('pause', on);
  }

  togglePhoto() {
    this.photo = !this.photo;
    if (this.photo) {
      this.wasHud = !$id('hud').classList.contains('hidden');
      UI.showScreen('hud', false);
      UI.showScreen('photo', true);
      UI.showScreen('results', false);
      const c = this.player;
      this.rig.startOrbit(new THREE.Vector3(c.x, c.y + 0.7, c.z));
      $id('pfov').value = Math.round(this.camera.fov);
      $id('pfocus').value = Math.round(this.camera.position.distanceTo(new THREE.Vector3(c.x, c.y, c.z)));
      this.pVis.setCockpit(false);
      this.photoUpd();
    } else {
      UI.showScreen('photo', false);
      this.rig.stopOrbit();
      this.mondo.fineFoto();
      this.visuals.forEach((v, k) => (v.group.visible = !this.race.cars[k].rimossa));
      this.rig.setMode(this.rig.mode, this.pVis);
      if (this.mode === 'results') UI.showScreen('results', true);
      else if (this.wasHud) UI.showScreen('hud', true);
    }
  }

  toMenu() {
    if (this.mode === 'race' || this.mode === 'results') this.cali?.fineGara();
    // 21-11 sera (Gabriele): dal time trial col «Menu principale» un giro da record non si perde: prima la schermata della
    // sessione con il nome, poi (dal suo pulsante «Menu») il menu
    if (this.mode === 'race' && this.race?.timeTrial && !this.player.finished && REC.posizione(this.pistaRecord(), 'tempo', this.player.bestValido ?? Infinity) >= 0) {
      this.fineTimeTrial(); return;
    }
    $id('rrecord')?._confermaNome?.();    // record in attesa del nome: si salva con quello scritto
    this.setPause(false);
    this.photo && this.togglePhoto();
    UI.showScreen('results', false);
    UI.showScreen('hud', false);
    UI.showScreen('menu', true);
    this.mode = 'menu';
    this.setupRace(false);
    this.recordMenu();
  }

  // ---------------------------------------------------------------- record
  /** comando del giro migliore valido del giocatore (il più aiutato fra quelli usati nel giro, REC.comandoDelGiro): dal 21-11
   *  non separa più le classifiche, si mostra col simbolo accanto al tempo */
  comandoMigliore(p) {
    const best = p.bestValido ?? Infinity;
    const k = p.lapTimes.findIndex((t, i) => t === best && (this.race._validi || [])[i] !== false);
    return this._catGiri[k] || this.input.comando;
  }

  /** tabella dei record (primi 5) per la pista e la modalità del menu */
  recordMenu() {
    const el = $id('mrecord');
    if (!el || !this.piste) return;
    const s = this.settings, pista = this.pistaId(), cat = REC.categoria(s.modo);
    // 21-11: una classifica per versione della pista; l'attuale in vista, le vecchie dalla tendina (si torna all'attuale
    // cambiando pista)
    const storia = storiaPista(pista), att = storia.at(-1).v;
    if (this._recV?.pista !== pista) this._recV = { pista, v: att };
    const v = storia.some((e) => e.v === this._recV.v) ? this._recV.v : att;
    const data = (d) => (d ? ` · dal ${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : '');
    const scelta = storia.length > 1
      ? `<select id="mrecv" title="Versione della pista: quando cambia in un modo che sposta i tempi, la classifica riparte">${[...storia].reverse().map((e) => `<option value="${e.v}" ${e.v === v ? 'selected' : ''}>v${e.v}${e.v === att ? ' (attuale)' : data(e.dal)}</option>`).join('')}</select>`
      : `<span title="Versione della pista: quando cambia in un modo che sposta i tempi, la classifica riparte">v${att}</span>`;
    el.innerHTML = `<div class="rec-sub">${this.nomiPiste?.[pista] || pista} ${scelta} · ${REC.nomeCategoria(cat)} · giro migliore</div>` +
      REC.htmlBoard(REC.board(this.pistaRecord(v), cat), -1, 10);
    // 26-11: il record della pista scelta anche sotto le tessere del menu (versione attuale)
    const primo = REC.board(this.pistaRecord(att), cat)[0], tr = $id('trec');
    if (tr) tr.innerHTML = primo ? `<svg viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/></svg>Record ${UI.fmt(primo.tempo)} · ${primo.nome.replace(/[<>&]/g, '')}` : 'Nessun record: il primo giro pulito è tuo';
    const sel = $id('mrecv');
    if (sel) { sel.onchange = () => { this._recV = { pista, v: +sel.value }; this.recordMenu(); }; sel.onkeydown = (e) => e.stopPropagation(); }
  }

  /** pannello «Novità» (CHANGELOG.md) */
  apriNovita() { const el = $id('novtab'); if (!el) return; mostraNovita(el); UI.showScreen('novita', true); }

  /**
   * all'arrivo: storico subito; il record (se il giro migliore pulito entra nei primi 10) chiede le iniziali
   * nella schermata dei risultati. Ritorna la funzione da chiamare quando i risultati sono visibili.
   */
  salvaRecord(race, pos) {
    if (this.misura) return () => {};      // misura delle prestazioni: guida l'IA, niente record né storico
    const p = race.player, s = this.settings, pista = this.pistaId(), fisica = s.fisica || 'arcade';
    const vPista = versionePista(pista), pk = this.pistaRecord(vPista);
    const best = p.bestValido ?? Infinity, cat = REC.categoria('gara'), comando = this.comandoMigliore(p);
    REC.aggiungiStorico({
      data: new Date().toISOString(), pista, vPista, gioco: VERSIONE, fisica, comando, guida: MODELLO.k, giri: race.laps, diff: s.diff,
      pos: race.results().findIndex((r) => r.car === p) + 1 || pos,
      tempo: p.finishTime + (p.pen || 0), pen: p.pen || 0, best: p.best, bestValido: Number.isFinite(best),
      auto: p.spec.nome, meteo: s.meteo, ora: s.ora,
    });
    const k = REC.posizione(pk, cat, best);
    const intest = `<h4>Record · ${this.nomeRecord(vPista)} · ${REC.nomeCategoria(cat)}</h4>`;
    return async () => {
      const el = $id('rrecord');
      if (!el) return;
      if (k < 0) {
        const nota = Number.isFinite(best) ? `Il tuo giro migliore pulito: ${UI.fmt(best)}` : 'Nessun giro pulito in questa gara (uscite o rimesse in pista): non vale per i record.';
        el.innerHTML = intest + `<p class="rec-vuoto">${nota}</p>` + REC.htmlBoard(REC.board(pk, cat), -1, 5);
        return;
      }
      this.audio.ready && this.audio.lap && this.audio.lap(true);
      const nome = await REC.chiediNome(el, `NUOVO RECORD! ${k + 1}° POSTO · ${UI.fmt(best)}`, REC.ultimoNome());
      const idx = REC.aggiungiRecord(pk, cat, { nome, tempo: best, comando, auto: p.spec.nome, meteo: s.meteo, ora: s.ora, fisica, guida: MODELLO.k, vPista, gioco: VERSIONE, data: new Date().toISOString() });
      el.innerHTML = intest + REC.htmlBoard(REC.board(pk, cat), idx);
      this.recordMenu();
    };
  }

  /** auto del giocatore distrutta: rallenty in bianco e nero, tunnel nero che si chiude, dopo ~2 s DISTRUTTA; dopo 5,2 s i risultati */
  iniziaDistruzione() {
    this.distruzione = { t0: this.clock, fatto: false };
    this.mondo.distruzione(true);
    // dall'abitacolo si vede poco: inquadratura esterna
    if (this.rig.mode === 'abitacolo' || this.rig.mode === 'cofano') this.rig.setMode('lontana', this.pVis);
    const ov = $id('distrutta');
    ov.classList.remove('testo');
    ov.classList.remove('hidden');
    this.rig.shake = 0.35;
  }

  fineDistruzione() {
    this.distruzione.fatto = true;
    $id('distrutta').classList.add('hidden');
    $id('distrutta').classList.remove('testo');
    const race = this.race;
    if (race.timeTrial) { this.fineTimeTrial(); return; }
    this.mode = 'results';
    UI.showResults(race);
    UI.showScreen('hud', false);
    $id('rrecord').innerHTML = '';
    if (!this.photo) UI.showScreen('results', true);
    REC.aggiungiStorico({ data: new Date().toISOString(), pista: this.pistaId(), vPista: versionePista(this.pistaId()), gioco: VERSIONE, fisica: this.settings.fisica || 'arcade', comando: this.input.comando, guida: MODELLO.k, giri: race.laps, diff: this.settings.diff, pos: 'RIT', tempo: Infinity, pen: this.player.pen || 0, best: this.player.best, bestValido: Number.isFinite(this.player.bestValido ?? Infinity), auto: this.player.spec.nome, meteo: this.settings.meteo, ora: this.settings.ora });
  }

  /** fine della sessione di time trial: elenco dei giri, record (iniziali) e storico */
  fineTimeTrial() {
    const race = this.race, p = this.player, s = this.settings;
    if (!race || !race.timeTrial) return;
    this.setPause(false);
    this.mode = 'results';
    p.finished = true;
    UI.showScreen('hud', false);
    const pista = this.pistaId(), fisica = s.fisica || 'arcade';
    const vPista = versionePista(pista), pk = this.pistaRecord(vPista);
    const best = p.bestValido ?? Infinity, cat = REC.categoria('tempo'), comando = this.comandoMigliore(p);
    $id('rtitle').textContent = `Time trial · ${this.nomiPiste?.[pista] || pista}`;
    const giri = p.lapTimes;
    const validi = race._validi || [];
    $id('rtable').innerHTML = `<tr><th>Giro</th><th>Tempo</th><th></th></tr>` + (giri.length ? giri.map((t, i) => `<tr class="${t === best ? 'me' : ''}"><td class="p">${i + 1}</td><td>${UI.fmt(t)}</td><td>${validi[i] === false ? '<span class="pen">non valido</span>' : t === best ? 'migliore' : ''}</td></tr>`).join('') : '<tr><td colspan="3">Nessun giro completato.</td></tr>');
    if (giri.length) REC.aggiungiStorico({ data: new Date().toISOString(), tipo: 'tempo', pista, vPista, gioco: VERSIONE, fisica, comando, guida: MODELLO.k, giri: giri.length, diff: '—', pos: '—', tempo: best, pen: 0, best: p.best, bestValido: Number.isFinite(best), auto: p.spec.nome, meteo: s.meteo, ora: s.ora });
    UI.showScreen('results', true);
    const k = REC.posizione(pk, cat, best);
    const el = $id('rrecord');
    const intest = `<h4>Record · ${this.nomeRecord(vPista)} · ${REC.nomeCategoria(cat)}</h4>`;
    if (k < 0) { el.innerHTML = intest + REC.htmlBoard(REC.board(pk, cat), -1, 5); return; }
    REC.chiediNome(el, `NUOVO RECORD! ${k + 1}° POSTO · ${UI.fmt(best)}`, REC.ultimoNome()).then((nome) => {
      const idx = REC.aggiungiRecord(pk, cat, { nome, tempo: best, comando, auto: p.spec.nome, meteo: s.meteo, ora: s.ora, fisica, guida: MODELLO.k, vPista, gioco: VERSIONE, data: new Date().toISOString() });
      el.innerHTML = intest + REC.htmlBoard(REC.board(pk, cat), idx);
      this.recordMenu();
    });
  }

  // ---------------------------------------------------------------- ciclo
  /** memorizza la posa di ogni auto prima di un passo di fisica */
  snapPrev() {
    for (const c of this.race.cars) {
      const p = c._prev || (c._prev = {});
      p.x = c.x; p.y = c.y; p.z = c.z; p.yaw = c.yaw; p.pitch = c.pitch; p.roll = c.roll; p.bankRoll = c.bankRoll || 0; p.wheelSpin = c.wheelSpin;
    }
  }

  /** pose interpolate (a = 0 passo precedente, 1 ultimo passo); il resto dei campi si legge dall'auto (prototipo) */
  renderStates(a) {
    const cars = this.race.cars;
    if (!this._rs || this._rsRace !== this.race) { this._rs = cars.map((c) => Object.create(c)); this._rsRace = this.race; }
    const L = (u, v) => u + (v - u) * a;
    cars.forEach((c, k) => {
      const r = this._rs[k], p = c._prev;
      // niente interpolazione senza un passo precedente o dopo un salto (rimessa in pista, griglia)
      if (!p || (p.x - c.x) ** 2 + (p.z - c.z) ** 2 > 25) {
        for (const f of ['x', 'y', 'z', 'yaw', 'pitch', 'roll', 'bankRoll', 'wheelSpin']) delete r[f];
        return;
      }
      r.x = L(p.x, c.x); r.y = L(p.y, c.y); r.z = L(p.z, c.z);
      let dy = c.yaw - p.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      r.yaw = p.yaw + dy * a;
      r.pitch = L(p.pitch, c.pitch); r.roll = L(p.roll, c.roll); r.bankRoll = L(p.bankRoll, c.bankRoll || 0); r.wheelSpin = L(p.wheelSpin, c.wheelSpin);
    });
    return this._rs;
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    if (this.saltaFotogramma(now)) return;
    this.mondo?.inizioFotogramma?.();
    if (this.cali === undefined) this.cali = Q.get('fps') === '1' || Q.get('cali') === '1' ? new RegistroCali(this) : null;
    this.cali?.prima();
    const tCpu = performance.now();
    try { this._frame(now); } finally {
      const cpu = performance.now() - tCpu;
      this.cali?.dopo(now, cpu);
      if (this.perfOn) this.perfTick(now, cpu);
    }
  }

  /**
   * 25-11 (Gabriele: sul Samsung a 120 Hz «lagga»: 100-120 fps nei tratti leggeri, 30-50 in quelli fitti): sui telefoni
   * con lo schermo a 100 Hz o più si disegna un fotogramma su due (120 → 60, 144 → 72). Ritmo costante invece di salti,
   * telefono meno caldo, meno batteria. La frequenza dello schermo si misura di continuo sugli intervalli fra le chiamate
   * del browser (un quarto più breve degli ultimi 60), così un caricamento lento non inganna. ?fps60=0 = senza tetto.
   * Ritorna true se questo fotogramma si salta (niente fisica né disegno: il passo successivo recupera il tempo).
   */
  saltaFotogramma(now) {
    if (!DISPOSITIVO_TOCCO || Q.get('fps60') === '0') return false;
    const S = this._tetto || (this._tetto = { d: [], prec: 0, ogni: 1, k: 0 });
    if (S.prec) { S.d.push(now - S.prec); if (S.d.length > 60) S.d.shift(); }
    S.prec = now;
    if (S.d.length === 60 && ++S.k % 60 === 0) {
      const q = [...S.d].sort((a, b) => a - b)[15];
      // schermi veri: 120 Hz → 8,3 ms, 144 → 6,9, 240 → 4,2; sotto 3 ms il browser non segue lo schermo: niente tetto
      S.ogni = q >= 3 && q < 10 ? Math.min(4, Math.max(2, Math.round(16.67 / q))) : 1;
      this.hz = q > 0 && q < 20 ? Math.round(1000 / q) : null;   // sotto 50 Hz la misura dice quanto è lento il gioco, non lo schermo
    }
    if (S.ogni === 1) return false;
    S.n = ((S.n || 0) + 1) % S.ogni;
    return S.n !== 0;
  }

  /** pannello prestazioni (tasto F): fps, tempo CPU, cosa arriva alla scheda video */
  perfTick(now, cpu) {
    const P = this.perf;
    P.n++; P.cpu += cpu;
    const dt = now - (P.last || now);
    P.last = now;
    P.max = Math.max(P.max, dt);
    const el = now - P.t0;
    if (el < 500) return;
    $id('perf').textContent = `${(P.n * 1000 / el).toFixed(0)} fps   fotogramma peggiore ${P.max.toFixed(0)} ms   CPU (JS) ${(P.cpu / P.n).toFixed(1)} ms\n` + (this.mondo ? this.mondo.infoPrestazioni() : 'pista in preparazione');
    P.n = 0; P.cpu = 0; P.max = 0; P.t0 = now;
  }

  _frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.clock += dt;
    const t = this.clock;
    // l'audio è in pausa esattamente quando il gioco non sta correndo: deciso qui a ogni fotogramma,
    // così nessun passaggio (menu → nuova gara, foto, pausa) può lasciarlo muto per errore
    if (this.audio.ready) {
      const mute = this.mode === 'loading' || this.mode === 'menu' || this.paused || this.photo;
      if (mute !== this.audio.paused) this.audio.pause(mute);
    }
    if (this.mode === 'loading') return;
    this.padFrame(dt);
    // vetrina dell'auto: solo col menu davanti
    if (this.mode === 'menu' && this.vetrina && $id('menu').classList.contains('show')) this.vetrina.disegna(dt);
    if (!this.mondo || !this.race) return;        // la prima pista si sta ancora costruendo dietro il menu
    // 27-11: mentre la pista nuova si prepara, la vecchia dietro il menu resta ferma sull'ultima immagine: ogni fotogramma
    // va alla vetrina e al caricamento (sul telefono il mondo dietro costava quanto un fotogramma di gara)
    if (this.mode === 'menu' && this._prep) return;
    const race = this.race, W = this.mondo;
    const simulate = (this.mode === 'race' || this.mode === 'results') && !this.paused && !this.photo;
    this._msFis = 0;
    if (simulate) {
      // rallenty dopo una distruzione: da 1 a 0,2 in un quinto di secondo
      const scala = this.distruzione ? Math.max(0.2, 1 - (this.clock - this.distruzione.t0) * 4) : 1;
      this.acc += dt * scala;
      let n = 0;
      const tFis = performance.now();
      while (this.acc >= STEP && n < 12) {
        const guida = this.mode === 'race' && !this.player.finished;
        const inp = guida ? (this.autopilota ? this.autopilota() : this.input.sample(STEP, this.player.speed)) : { throttle: 0, brake: 0.3, steer: 0 };
        if (guida && race.started) this._comGiro.add(this.input.comando);
        this.snapPrev();
        race.step(STEP, inp);
        this.acc -= STEP;
        n++;
        // inizio di un giro nuovo del giocatore: da capo il conto dei comandi usati
        if (this.player.lap !== this._lapPrec) { this._lapPrec = this.player.lap; this._comGiroNuovo = true; }
      }
      if (n === 12) this.acc = 0;
      this._msFis = performance.now() - tFis;   // registro dei cali
      this.raceClock += dt;
      this.handleEvents(dt);
      if (this._comGiroNuovo) { this._comGiroNuovo = false; this._comGiro = new Set(); }
    }
    // stato da disegnare: interpolato fra gli ultimi due passi di fisica (la fisica va a 120 Hz, lo schermo
    // al ritmo del monitor: senza interpolazione l'auto avanza a scatti di uno o due passi per fotogramma)
    const a = simulate ? Math.min(1, this.acc / STEP) : 1;
    const rs = this.renderStates(a);
    const rp = rs[race.cars.indexOf(this.player)];
    rs.forEach((c, k) => { if (c.rimossa) this.visuals[k].group.visible = false; this.visuals[k].update(c, dt, t); });
    if (this.ghost && race.timeTrial) {
      const P = this.player;
      const tGiro = P.lap > 0 ? race.time - (1 - a) * STEP - P.lapStart : -1;
      this.ghost.update(tGiro, dt, t);
      const sGiro = P.dist - (P.lap - 1) * this.track.length;
      race.deltaGhost = P.lap > 0 && this.ghost.dati ? this.ghost.delta(race.time - P.lapStart, sGiro) : null;
    }
    // camera
    const groundAt = (x, z) => W.quota(x, z);
    if (this.photo) this.rig.updateOrbit(groundAt);
    else if (this.mode === 'menu') {
      const c = this.player, ang = t * 0.12;
      this.camera.position.set(c.x + Math.cos(ang) * 8.5, c.y + 2.2 + Math.sin(t * 0.2) * 0.4, c.z + Math.sin(ang) * 8.5);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(c.x, c.y + 0.6, c.z);
      this.camera.fov = 45;
      this.camera.updateProjectionMatrix();
    } else if (this.mode === 'results' && this.finishT >= 0 && t - this.finishT > 1.5) {
      // inquadratura TV dal bordo pista
      if (!this.tvAnchor || this.player.proj.s - this.tvS > 120 || this.player.proj.s < this.tvS) {
        this.tvS = this.player.proj.s;
        const p = this.track.pointAt(this.tvS + 70, (this.track.w[this.player.proj.i] / 2 + W.tvLato) * (Math.random() < 0.5 ? -1 : 1));
        this.tvAnchor = new THREE.Vector3(p.x, p.y + 3.5, p.z);
      }
      this.rig.tv(dt, rp, this.tvAnchor);
    } else {
      // tasto B tenuto: sguardo indietro
      this.rig.indietro = this.mode === 'race' && !this.paused && (this.input.has('KeyB') || !!this.pad.giu.indietro);
      this.rig.update(dt, rp, this.pVis, groundAt);
    }
    // ambiente, scenario, pubblico
    W.aggiorna(dt, t, { camera: this.camera, player: this.player, race, rs, rp, cheer: this.cheer, clock: this.clock, mode: this.mode, track: this.track });
    W.aggiornaEffetti(simulate ? dt * (this.distruzione ? 0.2 : 1) : 0);
    // la scritta arriva dopo 2 s di rallenty (orologio del gioco, non del browser), i risultati dopo 5,2 s
    if (this.distruzione && !this.distruzione.testo && this.clock - this.distruzione.t0 > 2) { this.distruzione.testo = true; $id('distrutta').classList.add('testo'); }
    if (this.distruzione && !this.distruzione.fatto && this.clock - this.distruzione.t0 > 5.2) this.fineDistruzione();
    if (this.cheer > 0) this.cheer = Math.max(0, this.cheer - dt * 0.08);
    if (this.audio.ready) this.updateAudio(dt);
    if (this.mode === 'race') this.hud.update(dt, race, this.player, this.track);
    const tDis = performance.now();
    W.disegna(t);
    // retrovisore nelle visuali cofano e abitacolo (non guardando indietro, non in foto né durante la distruzione)
    const specchio = (this.mode === 'race' || this.mode === 'results') && !this.photo && !this.distruzione && !this.rig.indietro
      && (this.rig.mode === 'cofano' || this.rig.mode === 'abitacolo') && !!this.pVis;
    this.specchio.mostra(specchio);
    if (specchio) {
      const disegna = () => this.specchio.render(W.r, W.scene, this.pVis);
      if (W.conSpecchio) W.conSpecchio(this.pVis, disegna); else disegna();
    }
    this._msDis = performance.now() - tDis;
    if (this.mode === 'race' && simulate) this.risoluzioneDinamica(dt);
    this.fpsAngolo(dt);
  }

  /**
   * fps fissi in un angolo durante la gara (22-11, Gabriele: sul telefono non c'è il tasto F). Si vedono sui telefoni e con
   * ?fps=1; media degli ultimi 0,5 s, verde da 50 in su, giallo da 30, rosso sotto.
   */
  fpsAngolo(dt) {
    if (this._fpsOn === undefined) { this._fpsOn = document.body.classList.contains('tocco') || Q.get('fps') === '1'; document.body.classList.toggle('con-fps', this._fpsOn); }
    if (!this._fpsOn || this.mode !== 'race') return;
    const F = this._fps || (this._fps = { t: 0, n: 0, el: $id('fpsbox') });
    F.t += dt; F.n++;
    if (F.t < 0.5 || !F.el) return;
    const fps = Math.round(F.n / F.t);
    F.el.textContent = `${fps} fps`;
    F.el.className = fps >= 50 ? 'ok' : fps >= 30 ? 'medio' : 'basso';
    F.t = 0; F.n = 0;
  }

  handleEvents(dt) {
    const race = this.race, W = this.mondo;
    for (const e of race.events) {
      if (e.t === 'luce') { this.hud.lights(e.n); this.audio.ready && this.audio.beep(e.n); W.semaforo(e.n); }
      else if (e.t === 'via') {
        this.hud.lights(-1);
        this.audio.ready && this.audio.go();
        W.semaforo(-1);
        setTimeout(() => { this.hud.lights(0); W.semaforo(0); }, 1500);
        this.hud.message('VIA!', 1200);
      } else if (e.t === 'giro' && e.car === this.player) {
        // tipo di comando del giro: il più aiutato fra quelli usati (REC.PIU_AIUTATO: telefono, tastiera, controller)
        const com = REC.comandoDelGiro(this._comGiro);
        this._catGiri[this.player.lapTimes.length - 1] = com;
        if (race.timeTrial) {
          this.audio.ready && this.audio.lap(e.best);
          const g = this.ghost && this.ghost.g;
          // un ghost solo per pista (21-11): si confronta con quello salvato, fatto con qualunque comando
          const vecchio = e.valido && e.campioni && e.campioni.length > 20 ? caricaGhost(this.pistaRecord()) : null;
          if (e.valido && e.campioni && e.campioni.length > 20 && (!vecchio || e.tempo < vecchio.tempo)) {
            const nuovo = salvaGhost(this.pistaRecord(), e.tempo, e.campioni, { specIdx: this.player.specIdx, specId: this.player.spec.id, livery: this.player.livery, auto: this.player.spec.nome, comando: com });
            if (nuovo && this.ghost) this.ghost.set(nuovo);
            this.hud.message(`${UI.fmt(e.tempo)} · GIRO MIGLIORE · ${nuovo ? 'GHOST AGGIORNATO' : 'GHOST NON SALVATO: MEMORIA DEL BROWSER PIENA'}`, nuovo ? 2600 : 4500);
          } else this.hud.message(`${UI.fmt(e.tempo)}${e.valido ? '' : ' · NON VALIDO'}${g ? ` · ${e.tempo - g.tempo >= 0 ? '+' : '−'}${Math.abs(e.tempo - g.tempo).toFixed(3)}` : ''}`, 2200);
        } else {
          this.audio.ready && this.audio.lap(e.best);
          if (this.player.lap === race.laps && race.laps > 1) { this.hud.message('ULTIMO GIRO', 2200); W.boato?.(0.85); }
          else if (e.best && this.player.lapTimes.length > 1) this.hud.message('GIRO MIGLIORE ' + UI.fmt(e.tempo), 2200);
          else this.hud.message(UI.fmt(e.tempo), 1800);
        }
      } else if (e.t === 'arrivo' && e.car === this.player) {
        const pos = race.standings().indexOf(this.player) + 1;
        this.finishT = this.clock;
        this.mode = 'results';
        this.cheer = 1;
        W.boato?.(1);
        this.hud.message(pos === 1 ? 'VITTORIA!' : `ARRIVATO ${pos}°`, 3000);
        this.audio.ready && this.audio.finish(pos);
        if (W.fuochiArrivo) this.fireworks = 9;
        const recordPromessa = this.salvaRecord(race, pos);
        setTimeout(() => {
          if (this.mode !== 'results') return;
          UI.showResults(race);
          UI.showScreen('hud', false);
          if (!this.photo) UI.showScreen('results', true);
          recordPromessa();
        }, 3500);
      } else if (e.t === 'distrutta') {
        if (e.car === this.player) { if (!this.player.finished) this.iniziaDistruzione(); }
        else this.hud.message(`${e.car.nome.toUpperCase()} · AUTO DISTRUTTA`, 2200);
      } else if (e.t === 'danno' && e.car === this.player) {
        const box = $id('hdanni');
        box.classList.remove('lampo'); void box.offsetWidth; box.classList.add('lampo');
        if (e.a > 0.3 && !this.player.distrutta) this.hud.message(`DANNI · ${e.zona.toUpperCase()}`, 1600);
      } else if (e.t === 'reset' && e.car === this.player) { this.hud.message('IN PISTA', 900); this.hud.lento = 0; }
      else if (e.t === 'giroNonValido' && e.car === this.player && race.timeTrial) this.hud.message('GIRO NON VALIDO', 1600);
      else if (e.t === 'avviso' && e.car === this.player) this.hud.message(`LIMITI DELLA PISTA · AVVISO ${e.n}/${e.max || 5}`, 2000);
      else if (e.t === 'penalita') {
        const motivo = { taglio: 'TAGLIO', limiti: 'LIMITI DELLA PISTA', contatto: 'CONTATTO' }[e.motivo] || '';
        if (e.car === this.player) { this.hud.message(`+${e.sec} s · ${motivo}`, 2600); this.audio.ready && this.audio.beep && this.audio.beep(1); }
        else if (e.motivo === 'contatto') this.hud.message(`+${e.sec} s a ${e.car.nome} · CONTATTO`, 2000);
      }
    }
    race.events.length = 0;
    // urti → danni, effetti, suoni
    const interna = this.rig.mode === 'abitacolo' || this.rig.mode === 'cofano';
    for (const im of race.impacts) {
      const cars = im.type === 'auto' ? [im.a, im.b] : [im.car || this.nearestCar(im.x, im.z)];
      // visuale interna: fumo, scintille e detriti dell'auto del giocatore nascono a un metro dagli occhi e coprono tutto
      const mia = cars.includes(this.player);
      W.urto(im, cars, { interna, mia, timeTrial: race.timeTrial, visuali: this.visuals, race, player: this.player });
      if (this.audio.ready) this.audio.impact(im.speed, im.x, im.y, im.z, mia);
      if (mia) {
        this.pad.colpo(Math.min(1, 0.25 + im.speed / 14));
        if (this.telefono.inUso()) this.telefono.vibra(Math.round(Math.min(120, 25 + im.speed * 8)));
        this.rig.shake = Math.min(interna ? 0.12 : 0.4, im.speed * (interna ? 0.006 : 0.02));
      }
    }
    race.impacts.length = 0;
    // strisciate e fumo delle gomme
    for (const c of race.cars) {
      if (c.scraping > 0) W.strisciata(c, this.track, interna && c === this.player);
      W.fxAuto(dt, c);
    }
    if (this.audio.ready) this.audio.scrape(this.player.scraping > 0 || this.player.fondo > 0.3);   // anche il fondo che striscia
    // fuochi d'artificio all'arrivo (mondo voxel)
    if (this.fireworks > 0 && Math.random() < 0.05) {
      this.fireworks--;
      const p = this.track.pointAt(this.track.startS + (Math.random() - 0.5) * 120, (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30));
      const y = p.y + 45 + Math.random() * 30;
      W.fuoco(p.x, y, p.z);
      this.audio.ready && this.audio.firework(p.x, y, p.z);
    }
  }

  nearestCar(x, z) {
    let best = null, bd = Infinity;
    for (const c of this.race.cars) {
      const d = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  updateAudio(dt) {
    const p = this.player, cam = this.camera, fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, Math.atan2(fwd.z, fwd.x));
    const surf = p.surfaces.includes(3) ? 'ghiaia' : p.surfaces.includes(2) ? 'erba' : null;
    const others = [];
    for (const c of this.race.cars) if (c !== p) others.push({ x: c.x, y: c.y, z: c.z, rpm: c.rpm, throttle: c.throttle, speed: c.speed, cyl: c.spec.cyl, fam: c.spec.fam, voce: c.spec.voce, skid: c.skid });
    const amb = this.mondo.audioAmbiente(cam, this.cheer);
    this.audio.update(dt, {
      player: { rpm: p.distrutta ? 500 : p.rpm, throttle: p.distrutta ? 0 : this.race.started ? p.throttle : (p.rpmRev || 0), gear: p.gear, speed: p.speed, skid: p.skid, onKerb: p.onKerb, offroad: p.offroad, surface: surf, air: p.air, cyl: p.spec.cyl, fam: p.spec.fam, voce: p.spec.voce, x: p.x, y: p.y, z: p.z },
      cars: others, ...amb,
      wind: p.speed * (1 - 0.7 * (p.draft || 0)), // in scia il vento si sente meno
      cockpit: this.rig.mode === 'abitacolo',
    });
  }

  /**
   * Risoluzione dinamica (qualità Auto e Bassa): ogni 2 s misura gli fps; sotto 40 abbassa la risoluzione del 15%
   * (minimo 0,45), sopra 58 la rialza del 10% fino a quella della qualità scelta. I primi 3 s di gara non contano
   * (compilazione degli shader).
   */
  risoluzioneDinamica(dt) {
    const q = this.settings.qual;
    // 25-11 (Gabriele: «eviterei di scendere così tanto che l'esperienza viene uno schifo»): sul telefono la risoluzione
    // resta quella della qualità (Telefono: un pixel per punto dello schermo, ~840×390) e non scende più fino a 0,45
    if (DISPOSITIVO_TOCCO) return;
    if (this.misura || (q !== 'auto' && q !== 'basso' && q !== 'telefono')) return;      // misura (fase 2a): risoluzione fissa, numeri confrontabili
    if (this.raceClock < 3) return;
    const W = this.mondo, D = this.dyn || (this.dyn = { t: 0, n: 0, avvisato: false });
    D.t += dt; D.n++;
    if (D.t < 2) return;
    const fps = D.n / D.t;
    D.t = 0; D.n = 0;
    const pr = W.pixelRatio, base = W.pixelRatioBase;
    let nuovo = pr;
    if (fps < 40 && pr > 0.45) {
      nuovo = Math.max(0.45, pr * 0.85);
      if (!D.avvisato) { D.avvisato = true; UI.toast(`Risoluzione ridotta automaticamente (${Math.round(fps)} fps)`, 2500); }
    } else if (fps > 58 && pr < base) nuovo = Math.min(base, pr * 1.1);
    if (Math.abs(nuovo - pr) > 0.01) W.impostaPixelRatio(nuovo, nuovo < pr);
  }
}

const app = new App();
window.cuboCorse = app;
app.start().catch((e) => {
  console.error(e);
  window.__errore = e.stack;
  UI.setLoading(1, 'Errore: ' + e.message);
});
