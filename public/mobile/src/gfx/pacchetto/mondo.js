// Il mondo low-poly della guida: gli stessi costruttori del visualizzatore (viewer/src/costruttori), con le ombre.
// I dati del pacchetto hanno z in alto; la guida usa il sistema di Cubo Corse (y in alto, z verso sud):
// il gruppo del mondo è ruotato di -90° attorno a x, così (x, y, z) del pacchetto diventa (x, z, -y).
import * as THREE from 'three';
import { terrenoMesh } from '../../../cs/viewer/src/costruttori/terreno.js';
import { superficie, rilievo, pavimento, pavimentoTexture, cordoliCiclabile } from '../../../cs/viewer/src/costruttori/superfici.js';
import { volumi } from '../../../cs/viewer/src/costruttori/volumi.js';
import { linee, reti, recinzioni } from '../../../cs/viewer/src/costruttori/linee.js';
import { lampioni } from '../../../cs/viewer/src/costruttori/lampioni.js';
import { rialzo } from '../../../cs/viewer/src/costruttori/rialzo.js';
import { nastro3d } from '../../../cs/viewer/src/costruttori/nastro.js';
import { alberi } from '../../../cs/viewer/src/costruttori/alberi.js';
import { SUPERFICI, SEGNI, SAGRATO } from '../../../cs/viewer/src/costruttori/stile.js';
import { landmarkDettagliati } from '../../../cs/viewer/src/costruttori/landmark.js';
import { edificiCitta, campiSportivi, nucleoStorico } from '../../../cs/viewer/src/costruttori/citta.js';
import { distributori } from '../../../cs/viewer/src/costruttori/distributori.js';
import { paddock } from '../../../cs/viewer/src/costruttori/paddock.js';
import { pubblico } from '../../../cs/viewer/src/costruttori/pubblico.js';
import { arredi } from '../../../cs/viewer/src/costruttori/arredi.js';
import { portali } from '../../../cs/viewer/src/costruttori/portali.js';
import { applicaAsfalto, ambienteCielo, BAGNATO } from './asfalto.js';
import { tassella } from './tassella.js';
import { luciNotte, Notte } from '../../../cs/viewer/src/costruttori/notte.js';
import { starsPoints } from '../textures.js';

import { cediSeServe } from '../../cedi.js';
import { alberiLeggeri } from './leggera.js';
// 27-11: fra un passo e l'altro un fotogramma vero (prima setTimeout 0: il browser spesso non disegnava, vetrina ferma)
const pausa = cediSeServe;

/** costruisce il mondo della versione v; avanza(frazione, testo) per la barra di caricamento */
export async function costruisciMondo(dati, v, avanza = () => {}, { leggera = false } = {}) {
  // 27-11: città leggera (Telefono e Bassa): maglia più larga, dettagli dei palazzi solo vicino alla pista, alberi semplici
  const L2 = leggera ? 2 : 1;
  const { circuito, terreno, contesto, comune, versioni } = dati;
  const V = versioni[v], lv = V.livelli;
  const g = new THREE.Group(); g.name = 'mondo';
  g.rotation.x = -Math.PI / 2;
  const ombra = (o, cast = true, rec = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = rec; } }); return o; };
  const add = (o, cast = false) => { g.add(ombra(o, cast, true)); return o; };
  const passi = [
    ['terreno', () => add(terrenoMesh(terreno, leggera ? { salto: 2 } : {}))],
    ['verde', () => add(superficie(contesto.verde, { terreno, colore: SUPERFICI.verde, scarto: 0.02, nome: 'Verde', passo: 10, lato: 10 * L2 }))],
    ['campi', () => add(superficie(contesto.campi, { terreno, colore: SUPERFICI.campo, scarto: 0.03, nome: 'Campi sportivi', lato: 6 * L2 }))],
    ['parcheggi', () => add(superficie(contesto.parcheggi, { terreno, colore: SUPERFICI.parcheggio, scarto: 0.035, nome: 'Parcheggi', lato: 6 * L2 }))],
    // 27-11: in tre passi (landmark, palazzi, campi) invece di uno: fra l'uno e l'altro il menu disegna
    ['edifici', () => { g.userData._LM = landmarkDettagliati(circuito, contesto, terreno); add(g.userData._LM.gruppo, true); }],   // landmark descritti al posto dei volumi semplici
    ['palazzi', () => { const LM = g.userData._LM; delete g.userData._LM;
      add(edificiCitta(contesto.edifici.filter((e) => !LM.ids.has(e.landmark)), { asse: circuito.asse.punti, nucleo: nucleoStorico(circuito), ...(leggera ? { vicino: 60 } : {}) }), true); }],
    ['impianti sportivi', () => add(campiSportivi(contesto.campi, terreno), true)],
    ['pensiline', () => { const DS = distributori(circuito, contesto, terreno, versioni); add(DS.gruppo, true); add(volumi((contesto.pensiline || []).filter((p) => !DS.usate.has(p)), { nome: 'Pensiline' }), true); }],
    ['alberi', () => { const A = add(alberi(contesto.alberi, { terreno, nome: 'Alberi', escludi: (f) => f & (v === 'A' ? 1 : 2) }), true); if (leggera) g.userData.alberiLeggeri = alberiLeggeri(A); }],
  ];
  const alza = rialzo(circuito, V.bordi_pista, terreno);
  passi.push(
    ['muri', () => lv.recinzioni && add(recinzioni(lv.recinzioni.linee, { terreno, nome: 'Muri', strada: circuito.asse.punti }), true)],
    // rev. 11: lampioni, solo da vedere
    ['lampioni', () => { if (v === 'A') g.userData.lampioni = add(lampioni(circuito, { terreno, bordiA: versioni.A.bordi_pista, bordi: V.bordi_pista, edifici: contesto.edifici }), true); }],   // solo A
    // rev. 11 ter: cordoli verdi della ciclabile (solo A, il livello c'è solo lì) e pavimenti di via Roma (texture)
    ['arredo', () => {
      if (lv.ciclabile?.poligoni?.length) add(cordoliCiclabile(lv.ciclabile, { terreno }), true);
      if (lv.pavimenti?.poligoni?.length) add(pavimentoTexture(lv.pavimenti, { terreno, alza }));
    }],
    ['strade', () => add(superficie(lv.strade.poligoni, { terreno, colore: SUPERFICI.asfalto_strada, scarto: 0.05, nome: 'Strade', passo: 8, lato: 8 * L2 }))],
    ['marciapiedi', () => add(rilievo(lv.marciapiedi.poligoni, { terreno, colore: SUPERFICI.marciapiede, altezza: 0.15, nome: 'Marciapiedi' }))],
    ['pista', () => add(superficie(lv.pista.poligoni, { terreno, colore: SUPERFICI.asfalto_pista, scarto: 0.08, nome: 'Pista', alza, lato: 6 * L2 }))],   // la gommatura è una texture (asfalto.js), non serve una mesh fitta
    ['ponte', () => add(nastro3d(lv.ponte, { terreno, nome: 'Cavalcavia' }), true)],
    ['fughe', () => {
      if (lv.fuga_asfalto) add(superficie(lv.fuga_asfalto.poligoni, { terreno, colore: SUPERFICI.asfalto_fuga, scarto: 0.07, nome: 'Fuga asfalto', alza, lato: 6 * L2 }));
      if (lv.fuga_erba) add(superficie(lv.fuga_erba.poligoni, { terreno, colore: SUPERFICI.erba_fuga, scarto: 0.07, nome: 'Fuga erba', alza, lato: 6 * L2 }));
      if (lv.fuga_ghiaia?.poligoni.length) add(superficie(lv.fuga_ghiaia.poligoni, { terreno, colore: SUPERFICI.ghiaia_fuga, scarto: 0.075, nome: 'Fuga ghiaia', alza, lato: 6 * L2 }));
    }],
    ['cordoli', () => {
      if (lv.cordoli) add(superficie(lv.cordoli.poligoni, { terreno, colore: (p) => SEGNI[p.colore], scarto: 0.12, nome: 'Cordoli', passo: 1e9, lato: 0, alza }));
      if (lv.linee_bianche) add(superficie(lv.linee_bianche.poligoni, { terreno, colore: SEGNI.bianco, scarto: 0.115, nome: 'Linee', passo: 1e9, lato: 0, alza }));
      // rev. 9 bis: segnaletica della strada vera (costruita su DBT e OSM) e tombini disegnati
      if (lv.segnaletica?.poligoni.length) add(superficie(lv.segnaletica.poligoni, { terreno, colore: (p) => SEGNI[p.colore] || SEGNI.bianco, scarto: 0.1, nome: 'Segnaletica stradale', passo: 1e9, lato: 0, alza }));
      if (lv.tombini?.poligoni.length) add(superficie(lv.tombini.poligoni, { terreno, colore: (p) => SEGNI[p.colore] || SEGNI.tombino, scarto: 0.095, nome: 'Tombini', passo: 1e9, lato: 0, alza }));
      // rev. 10: sagrato di San Bernardino (pavimentazione disegnata; materiale delle vernici in asfalto.js, mesh 'Sagrato')
      if (lv.sagrato?.poligoni?.length) add(pavimento(lv.sagrato, { terreno, colori: SAGRATO, nome: 'Sagrato' }));
    }],
    // rev. 10: semafori sopraelevati, solo da vedere (nessuna collisione: la fisica usa i bordi della pista e le barriere)
    ['semafori', () => { if (lv.portali?.elementi?.length) add(portali(lv.portali.elementi, { terreno, alza, percorso: circuito.id }), true); }],
    ['barriere', () => {
      add(linee(lv.barriere.linee, { terreno, nome: 'Barriere', alza, blocco: 40 }), true);   // rev. 17: gomme a pezzi di 40 m con LOD
      if (lv.reti) add(reti(lv.reti.linee, { terreno, alza }), false);
    }],
    ['box', () => {
      if (lv.corsia_box) add(superficie(lv.corsia_box.poligoni, { terreno, colore: SUPERFICI.asfalto_box, scarto: 0.09, nome: 'Corsia box' }));
      if (lv.muretto_box) add(linee(lv.muretto_box.linee, { terreno, nome: 'Muretto box' }), true);
      const cl = comune.livelli;
      if (cl.corsia_box) add(superficie(cl.corsia_box.poligoni, { terreno, colore: SUPERFICI.asfalto_box, scarto: 0.09, nome: 'Corsia box' }));
      if (cl.muretto_box) add(linee(cl.muretto_box.linee, { terreno, nome: 'Muretto box' }), true);
      const PD = paddock(dati, v); add(PD.gruppo, true); g.userData.semaforo = PD.semaforo;
      if (cl.griglia) add(superficie(cl.griglia.poligoni, { terreno, colore: (p) => SEGNI[p.colore], scarto: 0.11, nome: 'Griglia', passo: 1e9, lato: 0 }));
    }],
    // rev. 14: maxischermi e pannelli pubblicitari messi nell'editor (solo da vedere, niente collisioni)
    ['arredi', () => { if (lv.arredi?.elementi?.length) add(arredi(lv.arredi.elementi, terreno, { asse: circuito.asse.punti }), true); }],
    ['pubblico', () => { if (lv.pubblico) { const P = pubblico(lv.pubblico, terreno, { maxPersone: Infinity, blocco: +(new URLSearchParams(globalThis.location?.search || '').get('bloccoPersone') || 25), asse: circuito.asse.punti }); P.visible = false; g.userData.pubblico = P; add(P, true);
      P.traverse((m) => { if (m.userData.semplice || m.userData.lontana) m.castShadow = false; }); } }],   // rev. 15 ter: tutte le persone, a riquadri di 50 m (main.js accende solo quelli vicini)
    ['traguardo', () => add(superficie(lv.traguardo.poligoni, { terreno, colore: (p) => SEGNI[p.colore], scarto: 0.11, nome: 'Traguardo', passo: 1e9, lato: 0, alza }))],
  );
  for (let k = 0; k < passi.length; k++) {
    avanza(k / passi.length, passi[k][0]);
    await pausa();
    passi[k][1]();
  }
  // rev. 17: notte (luci delle sorgenti del circuito; accesa da main.js con l'ora «notte»)
  const N = new Notte(luciNotte(dati, v, { lampioni: g.userData.lampioni }), terreno, { nLuci: 6 }); g.add(N.g); g.userData.notte = N;
  // 21-11: lampade dei lampioni più piccole (1,6 m in cs/viewer, che è una copia: qui senza toccarla), come i fari
  N.g.traverse((o) => { if (o.isPoints && o.name === 'Lampade') o.material.size = 0.6; });
  await pausa();
  applicaAsfalto(g);                     // rev. 9: asfalto e vernice PBR con texture e riflessi (asfalto.js)
  // 11-11 (prestazioni): le mesh grandi quanto la città divise in riquadri, così le parti fuori inquadratura non si disegnano
  // (tassella.js; ?tasselli=0 per confrontare senza, ?tasselli=<lato mesh>,<lato istanze> in metri per provare altre misure)
  const T = new URLSearchParams(globalThis.location?.search || '').get('tasselli');
  await pausa();
  if (T !== '0') { const [a, b, c] = (T || '').split(',').map(Number); g.userData.tasselli = await tassella(g, T ? { lato: a || 1e9, latoIstanze: b || a || 1e9, minTri: c || undefined } : leggera ? { lato: 600, latoIstanze: 800, minTri: 30000 } : {}); }   // leggera: riquadri più grandi = meno chiamate (misurato 27-11: 440 → 355 chiamate, triangoli comunque −40%)
  g.updateMatrixWorld(true);
  return g;
}

/** ore del giorno e meteo (menu Atmosfera, come Cubo Corse ma senza notte: il mondo low-poly non ha luci) */
export const ORE = {
  mattina: { nome: 'Mattina', dir: [0.85, 0.42, -0.35], sole: 0xffe2bf, iSole: 2.1, iEmi: 1.3, top: '#6aa6dc', oriz: '#f1e3cf' },
  giorno: { nome: 'Mezzogiorno', dir: [-0.45, 1, 0.6], sole: 0xfff2dd, iSole: 2.4, iEmi: 1.45, top: '#5d9bd6', oriz: '#dce8f0' },
  tramonto: { nome: 'Tramonto', dir: [-0.9, 0.22, 0.25], sole: 0xffb36b, iSole: 2.0, iEmi: 1.05, top: '#5a7fb8', oriz: '#f5b98a' },
  // rev. 17: notte, illuminata solo dai fari e dalle luci del circuito (nella A anche dai lampioni); la luna appena.
  // 21-11 (Gabriele: «se è nuvoloso c'è un sacco di luce riflessa», «non ci sono stelle»): col cielo coperto il grigio del
  // meteo (pensato per il giorno: cielo #787e84, nebbia #8c939a) faceva sfumare tutto oltre 500 m verso il chiaro; ora di
  // notte le nuvole sono scure con un filo di bagliore caldo all'orizzonte (le luci della città sulle nuvole basse).
  // Luna più bassa (si vede in gara) nella direzione della sua luce; stelle e luna solo col sereno.
  notte: { nome: 'Notte', dir: [0.55, 0.3, -0.78], sole: 0x9fb2ff, iSole: 0.09, iEmi: 0.1, top: '#02040a', oriz: '#0a0f1a', notte: true,
    coperto: { top: '#0b0d12', oriz: '#1f1b17' } },
};
export const METEO = {
  sereno: { nome: 'Sereno', kSole: 1, kEmi: 1, grigio: 0, nebbia: [700, 4200], pioggia: 0, wet: 0 },
  nuvoloso: { nome: 'Nuvoloso', kSole: 0.35, kEmi: 1.18, grigio: 0.7, nebbia: [500, 3000], pioggia: 0, wet: 0 },
  pioggia: { nome: 'Pioggia', kSole: 0.18, kEmi: 1.05, grigio: 0.85, nebbia: [260, 1800], pioggia: 1, wet: 1 },
};

/** cielo a gradiente (cupola) + luce: sole con ombre che segue l'auto, emisfero */
export class Cielo {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer; this.envRT = null;
    const top = new THREE.Color('#5d9bd6'), oriz = new THREE.Color('#dce8f0');
    scene.background = oriz.clone();
    scene.fog = new THREE.Fog(oriz.clone(), 700, 4200);
    const geo = new THREE.SphereGeometry(6000, 24, 12), n = geo.attributes.position.count, c = new Float32Array(n * 3), k = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const y = geo.attributes.position.getY(i) / 6000;
      k.copy(oriz).lerp(top, Math.pow(Math.max(0, y), 0.55)); c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.cupola = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.cupola.renderOrder = -10; this.cupola.frustumCulled = false;
    scene.add(this.cupola);
    this.pioggia = null; this.wet = 0;
    // 21-11: stelle (le stesse delle piste voxel, textures.js) e luna, accese di notte col sereno; seguono la camera
    this.stelle = starsPoints(); this.stelle.visible = false; this.stelle.renderOrder = -9; this.stelle.frustumCulled = false;
    this.luna = new THREE.Mesh(new THREE.SphereGeometry(38, 20, 12), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }));
    this.luna.visible = false; this.luna.renderOrder = -9; this.luna.frustumCulled = false;
    scene.add(this.stelle, this.luna);
    // stessi valori del visualizzatore, con un sole un po' più deciso per le ombre
    this.emi = new THREE.HemisphereLight(0xeaf3ff, 0x6b6150, 1.45);
    this.sole = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.dir = new THREE.Vector3(-0.45, 1, 0.6).normalize();          // da sud-ovest, alto (y in alto, z sud)
    const S = this.sole.shadow;
    // 24-11 (Gabriele: «le ombre sotto le macchine a volte sembrano che stiano fluttuando»): il bias è in unità della
    // profondità della camera delle ombre (600 m), quindi -0,0004 = 24 cm: quello che stava entro 24 cm dall'asfalto
    // (fondo delle auto, 10-15 cm da terra) non faceva ombra e fra paraurti e ombra restava una striscia di sole.
    // -0,0001 = 6 cm: l'ombra parte da sotto l'auto; niente righe (acne) né a mezzogiorno né al tramonto.
    S.mapSize.set(2048, 2048); S.bias = -0.0001; S.normalBias = 0.04;
    Object.assign(S.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 600 });
    this.sole.castShadow = true;
    scene.add(this.emi, this.sole, this.sole.target);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  /** 27-11: k > 0 = cupola rimpicciolita di k che segue la camera (vista corta della città leggera); 0 = ferma, intera */
  vicino(k) {
    const C = this.cupola;
    C.scale.setScalar(k || 1);
    C.onBeforeRender = k ? (r, s, cam) => { C.position.copy(cam.position); C.updateMatrixWorld(); } : () => {};
    if (!k) { C.position.set(0, 0, 0); C.updateMatrixWorld(); }
  }
  /** ora del giorno e meteo: direzione e colore del sole, cielo, nebbia, pioggia */
  imposta(ora = 'giorno', meteo = 'sereno') {
    const O = ORE[ora] || ORE.giorno, M = METEO[meteo] || METEO.sereno;
    const grigio = new THREE.Color('#8d949b');
    let top, oriz;
    if (O.coperto) {          // notte: le nuvole sono scure, non grigio chiaro (21-11)
      const k = Math.min(1, M.grigio / 0.7);
      top = new THREE.Color(O.top).lerp(new THREE.Color(O.coperto.top), k); oriz = new THREE.Color(O.oriz).lerp(new THREE.Color(O.coperto.oriz), k);
    } else { top = new THREE.Color(O.top).lerp(grigio, M.grigio); oriz = new THREE.Color(O.oriz).lerp(grigio.clone().offsetHSL(0, 0, 0.12), M.grigio); }
    const geo = this.cupola.geometry, n = geo.attributes.position.count, c = geo.attributes.color, k = new THREE.Color();
    for (let i = 0; i < n; i++) { const y = geo.attributes.position.getY(i) / 6000; k.copy(oriz).lerp(top, Math.pow(Math.max(0, y), 0.55)); c.setXYZ(i, k.r, k.g, k.b); }
    c.needsUpdate = true;
    this.scene.background = oriz.clone(); this.scene.fog.color.copy(oriz); this.scene.fog.near = M.nebbia[0]; this.scene.fog.far = O.notte ? Math.min(M.nebbia[1], 1600) : M.nebbia[1];
    this.dir.set(...O.dir).normalize();
    this.sole.color.set(O.sole).lerp(new THREE.Color(0xffffff), M.grigio * 0.6);
    this.sole.intensity = O.iSole * M.kSole;
    this.emi.intensity = O.iEmi * M.kEmi;
    this.emi.color.set(0xeaf3ff).lerp(new THREE.Color(O.oriz), 0.25);
    this.wet = M.wet; BAGNATO.value = M.wet;
    // rev. 9: ambiente riflesso (asfalto, vernici, auto PBR): il cielo di quest'ora e meteo, più il sole
    if (this.envRT) this.envRT.dispose();
    // (di notte col cielo coperto niente disco della luna da riflettere)
    this.envRT = ambienteCielo(this.renderer, top, oriz, this.dir, this.sole.color, O.notte && M.grigio > 0.3 ? 0 : M.kSole);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = (O.notte ? 0.08 : 0.55) * (1 - M.grigio * 0.25);
    this.notte = !!O.notte;
    const sereno = this.notte && M.grigio < 0.3;
    this.stelle.visible = sereno; this.luna.visible = sereno;
    if (M.pioggia && !this.pioggia) this.pioggia = new Pioggia(this.scene);
    if (this.pioggia) this.pioggia.linee.visible = !!M.pioggia;
  }
  update(dt, cam) {
    if (this.stelle.visible) {
      // 27-11: con la vista corta (città leggera) stelle e luna più vicine e più piccole, stessa grandezza apparente
      const k = Math.min(1, (cam.far * 0.85) / 3000);
      this.stelle.scale.setScalar(k); this.luna.scale.setScalar(k);
      this.stelle.position.copy(cam.position); this.luna.position.copy(this.dir).multiplyScalar(2800 * k).add(cam.position);
    }
    if (this.pioggia && this.pioggia.linee.visible) this.pioggia.update(dt, cam);
  }

  /** il riquadro delle ombre segue il punto (davanti all'auto) */
  segui(x, y, z) {
    this.cupola.position.set(x, 0, z);
    // passo di 2 m per non far "nuotare" i bordi delle ombre
    const qx = Math.round(x / 2) * 2, qz = Math.round(z / 2) * 2;
    this.sole.target.position.set(qx, y, qz);
    this.sole.position.set(qx + this.dir.x * 300, y + this.dir.y * 300, qz + this.dir.z * 300);
  }
}

/** pioggia: segmenti attorno alla camera che cadono e si riciclano (stile Cubo Corse, senza coperture) */
class Pioggia {
  constructor(scene, n = 2600) {
    this.n = n; this.R = 34; this.H = 22;
    this.p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.p[i * 3] = (Math.random() * 2 - 1) * this.R; this.p[i * 3 + 1] = Math.random() * this.H; this.p[i * 3 + 2] = (Math.random() * 2 - 1) * this.R; }
    this.pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.linee = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4de, transparent: true, opacity: 0.38, depthWrite: false }));
    this.linee.frustumCulled = false; this.linee.renderOrder = 2;
    scene.add(this.linee);
  }
  update(dt, cam) {
    const P = this.p, V = this.pos, R = this.R, H = this.H, cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, cad = 13 * dt;
    for (let i = 0; i < this.n; i++) {
      let y = P[i * 3 + 1] - cad;
      if (y < 0) { y += H; P[i * 3] = (Math.random() * 2 - 1) * R; P[i * 3 + 2] = (Math.random() * 2 - 1) * R; }
      P[i * 3 + 1] = y;
      const x = cx + P[i * 3], z = cz + P[i * 3 + 2], yy = cy - 6 + y;
      V[i * 6] = x; V[i * 6 + 1] = yy; V[i * 6 + 2] = z; V[i * 6 + 3] = x + 0.03; V[i * 6 + 4] = yy + 0.55; V[i * 6 + 5] = z + 0.02;
    }
    this.linee.geometry.attributes.position.needsUpdate = true;
  }
}
