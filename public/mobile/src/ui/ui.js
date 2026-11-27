// Menu, HUD, pausa, risultati, foto: tutto DOM.
// Fase 0 (20-11-2026): un solo menu per le piste di Cubo Corse e di Circuit Studio. Ora, meteo, qualità e filtri
// dipendono dal mondo che disegna la pista (voxel o pacchetto): li passa main.js.
import { CARS } from '../sim/car.js';
import { LIVREE } from '../sim/race.js';

const $ = (id) => document.getElementById(id);
export const fmt = (t) => {
  if (!isFinite(t) || t <= 0) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export const DEFAULTS = { track: 'monza', car: 0, livery: 0, laps: 3, diff: 'normale', grid: 'ultimo', ora: 'oro', meteo: 'sereno', qual: 'auto', fisica: 'arcade', linea: false, penLimiti: false, penContatti: false, modo: 'gara', ghost: true, nAuto: 10, pedali: 'manuali', danni: 'estetici', telSterzo: 'tasti', telPedali: 'tasti', telLeva: 'media', telGas: false, telFreno: false, telSens: 22,
  // fase 0: modello di guida (Agile = misto, Composta = cubo), sterzo da tastiera per pista (sterzoPista[id] = pronto|dolce,
  // altrimenti quello della pista), versione dei circuiti di Circuit Studio, pubblico, stile delle auto low-poly
  guida: 'misto', sterzoPista: {}, versione: 'B', pubblico: true, stileAuto: 'attuale' };
/** sterzo da tastiera di partenza: dolce sulle piste di Cubo Corse, pronto su quelle di Circuit Studio (decisione del 19-11) */
export const sterzoPredefinito = (pista) => (pista && pista.mondo === 'pacchetto' ? 'pronto' : 'dolce');

export function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('cubo-corse') || '{}') };
    if (s.telComandi === 'inclinazione' && !JSON.parse(localStorage.getItem('cubo-corse') || '{}').telSterzo) s.telSterzo = 'inclinazione';   // 23-11: telComandi → telSterzo
    delete s.telComandi;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}
export function saveSettings(s) {
  try { localStorage.setItem('cubo-corse', JSON.stringify(s)); } catch { /* niente */ }
}

export function showScreen(id, on = true) {
  const el = $(id);
  if (!el) return;
  if (el.classList.contains('screen')) el.classList.toggle('show', on);
  else el.classList.toggle('hidden', !on);
}

let toastT = 0;
export function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}

export function setLoading(p, msg) {
  $('loadbar').style.width = `${Math.round(p * 100)}%`;
  if (msg) $('loadmsg').textContent = msg;
}

/**
 * menu: tracks = [{id, mondo, nome, sottotitolo, lunghezza, outline:[[x,z]...], versioni?}];
 * mondi = { voxel: {ORE, METEO, QUALITA, FILTRI, oraPredefinita}, pacchetto: {…} }: ora, meteo, qualità e filtri seguono
 * il mondo della pista scelta (ora e meteo ricordati per mondo: ora_voxel, meteo_pacchetto…)
 */
export function buildMenu(settings, tracks, cb, mondi) {
  const pista = () => tracks.find((t) => t.id === settings.track) || tracks[0];
  // circuiti (26-11, proposta B2 di docs/roncacircuit-proposte.html): linguette dei circuiti in alto, mappa grande fissa a
  // sinistra, colonna «Variante» a destra con la versione A/B in testa. Il pannello ha sempre la stessa forma: cambiando
  // circuito cambia solo il contenuto (niente salti). I percorsi di Circuit Studio con la stessa chiave in percorsi.json
  // sono varianti di un circuito solo (Roncacircuit). Scegliere una pista non la carica: main.js la prepara dietro il menu.
  const km = (m) => `${(m / 1000).toFixed(2).replace('.', ',')} km`;
  const circuiti = [];
  for (const t of tracks) {
    const k = t.mondo === 'voxel' ? t.id : `cs:${t.circuito}`;
    let c = circuiti.find((x) => x.id === k);
    if (!c) circuiti.push(c = { id: k, nome: t.mondo === 'voxel' ? t.nome.replace(/^Autodromo (delle|di) /, '') : t.circuitoNome, piste: [] });
    c.piste.push(t);
  }
  const circuitoDi = (t) => circuiti.find((c) => c.piste.includes(t));
  if (!settings.varianteCirc) settings.varianteCirc = {};
  const scegli = (id) => {
    if (settings.track === id) return;
    settings.track = id;
    aggiornaPista();
    cb.change('track');
  };
  const aggiornaPista = () => {
    const t = pista(), pac = t.mondo === 'pacchetto', c = circuitoDi(t);
    settings.varianteCirc[c.id] = t.id;
    document.body.classList.toggle('pacchetto', pac);
    $('circuiti').innerHTML = circuiti.map((x) => {
      const sel = x.piste.find((p) => p.id === settings.varianteCirc[x.id]) || x.piste[0];
      return `<button class="ctab${x === c ? ' sel' : ''}" data-c="${x.id}">${outlineSVG(sel.outline)}<b>${x.nome}</b></button>`;
    }).join('');
    $('circuiti').querySelectorAll('.ctab').forEach((b) => b.onclick = () => {
      const x = circuiti.find((y) => y.id === b.dataset.c);
      scegli((x.piste.find((p) => p.id === settings.varianteCirc[x.id]) || x.piste[0]).id);
    });
    $('pmappa').innerHTML = reteSVG(c.piste, t.id);
    $('pdida').innerHTML = `<b>${t.nome}</b><small>${km(t.lunghezza)} · ${pac ? `${t.curve} curve` : t.sottotitolo.replace(/\s*·\s*[\d.,]+ km/g, '')}</small>`;
    const unica = c.piste.length === 1;
    $('varianti').innerHTML = c.piste.map((p) => `<button class="vr${p === t ? ' sel' : ''}" data-id="${p.id}"><span><b>${unica ? 'Tracciato unico' : p.variante}</b><small>${unica ? `${c.nome} non ha varianti` : `${p.curve} curve`}</small></span><i>${km(p.lunghezza)}</i></button>`).join('');
    $('varianti').querySelectorAll('.vr').forEach((b) => b.onclick = () => scegli(b.dataset.id));
    if (pac) seg('versione', t.versioni.map((v) => [v.k, `${v.k} · ${v.nome}`, v.descrizione]), 'versione');
    else $('versione').innerHTML = '<button disabled class="unica">Versione unica</button>';
    $('tpistaic').innerHTML = outlineSVG(t.outline);
    $('tpista').textContent = t.nome;
    atmosfera();
    const st = settings.sterzoPista[t.id] || sterzoPredefinito(t);
    seg('sterzo', [['pronto', 'Pronto', 'Margine 0,16: le ruote girano subito un po\' oltre la tenuta (come Circuit Studio)'], ['dolce', 'Dolce', 'Margine 0,06: sterzo più progressivo (come Cubo Corse)']], null, st, (k) => { settings.sterzoPista[t.id] = k; cb.change('sterzo'); });
  };
  // auto (21-11; 26-11 garage): la vetrina al centro con le frecce ‹ ›, sotto nome, dati e livree
  const maxP = Math.max(...CARS.map((c) => c.power / c.mass));
  const barra = (nome, v) => `<div class="stat">${nome}<i><em style="width:${Math.round(Math.min(1, Math.max(0.2, v)) * 100)}%"></em></i></div>`;
  const aggiornaAuto = () => {
    const c = CARS[settings.car] || CARS[0];
    const pw = (c.power / c.mass) / maxP, gr = (c.mu + c.df * 0.25 - 1.8) / 0.25, top = 1 - (c.cd - 0.43) / 0.12;
    $('mauto').innerHTML = `<b>${c.nome}</b><small>${c.ispirata ? `${c.tipo} · ispirata a ${c.ispirata}` : c.tipo} · ${c.cyl} cilindri</small>`;
    $('mstat').innerHTML = barra('Potenza', pw) + barra('Aderenza', gr) + barra('Velocità', top);
    $('stileAuto')?.closest('.row')?.classList.toggle('spento', c.modello !== 'lowpoly');
  };
  const scegliAuto = (i) => { settings.car = (i + CARS.length) % CARS.length; aggiornaAuto(); cb.change('car'); };
  $('autoprec').onclick = () => scegliAuto(settings.car - 1);
  $('autosucc').onclick = () => scegliAuto(settings.car + 1);
  aggiornaAuto();
  const L = $('liveries');
  L.innerHTML = '';
  LIVREE.forEach((l, i) => {
    const d = document.createElement('div');
    d.className = 'sw' + (settings.livery === i ? ' sel' : '');
    d.title = l.nome;
    d.style.background = hex(l.base);
    d.style.setProperty('--sec', hex(l.sec));
    d.onclick = () => {
      settings.livery = i;
      L.querySelectorAll('.sw').forEach((x) => x.classList.remove('sel'));
      d.classList.add('sel');
      cb.change('livery');
    };
    L.appendChild(d);
  });
  // segmenti
  function seg(id, opts, key, valore, quando) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = '';
    for (const [k, label, title] of opts) {
      const b = document.createElement('button');
      b.textContent = label;
      if (title) b.title = title;
      if ((key ? settings[key] : valore) === k) b.classList.add('sel');
      b.onclick = () => {
        if (key) settings[key] = k;
        el.querySelectorAll('button').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        if (quando) quando(k); else cb.change(key);
      };
      el.appendChild(b);
    }
  }
  seg('diff', [['facile', 'Facili'], ['normale', 'Normali'], ['difficile', 'Difficili']], 'diff');
  seg('grid', [['ultimo', 'Ultimo'], ['caso', 'A caso'], ['pole', 'Pole']], 'grid');
  seg('guida', [['misto', 'Agile', 'ESC che aiuta anche a far girare l\'auto nelle curve lente (sotto i 130 km/h)'], ['cubo', 'Composta', 'ESC solo contro il sovrasterzo (Cubo Corse)']], 'guida');
  seg('stileAuto', [['attuale', 'Facce piatte', 'Auto di Circuit Studio: superfici a facce piatte, dettaglio medio'], ['lowpoly', 'Low poly', 'Poche facce, forme essenziali'], ['realistico', 'Realistici', 'Superfici lisce, vernice lucida, vetri e cerchi metallici (più pesanti)']], 'stileAuto');
  seg('pubblico', [[false, 'No'], [true, 'Sì']], 'pubblico');
  // atmosfera e grafica del mondo della pista scelta
  function atmosfera() {
    const tipo = pista().mondo, M = mondi[tipo];
    settings.ora = M.ORE[settings['ora_' + tipo]] ? settings['ora_' + tipo] : M.ORE[settings.ora] ? settings.ora : M.oraPredefinita;
    settings.meteo = M.METEO[settings['meteo_' + tipo]] ? settings['meteo_' + tipo] : M.METEO[settings.meteo] ? settings.meteo : 'sereno';
    seg('ora', Object.entries(M.ORE).map(([k, v]) => [k, v.nome]), null, settings.ora, (k) => { settings.ora = settings['ora_' + tipo] = k; cb.change('ora'); });
    seg('meteo', Object.entries(M.METEO).map(([k, v]) => [k, v.nome]), null, settings.meteo, (k) => { settings.meteo = settings['meteo_' + tipo] = k; cb.change('meteo'); });
    seg('qual', [['auto', 'Auto'], ...Object.entries(M.QUALITA).filter(([k]) => k !== 'telefono' || document.body.classList.contains('tocco')).map(([k, v]) => [k, v.nome])], 'qual');
    const F = $('pfilter');
    if (F) F.innerHTML = (M.FILTRI || ['nessuno']).map((f) => `<option>${f}</option>`).join('');
    document.body.classList.toggle('foto-semplice', !M.FILTRI);
  }
  seg('fisica', [['arcade', 'Arcade'], ['realistica', 'Realistica']], 'fisica');
  seg('modo', [['gara', 'Gara'], ['tempo', 'Time trial']], 'modo');
  seg('ghost', [[false, 'No'], [true, 'Sì']], 'ghost');
  seg('pedali', [['manuali', 'Manuali'], ['freno', 'Freno auto'], ['gas', 'Gas auto']], 'pedali');
  seg('danni', [['estetici', 'Estetici'], ['meccanici', 'Meccanici']], 'danni');
  // telefono (fase 2b, 22-11): schema dei comandi a schermo e automatismi, separati
  seg('telSterzo', [['tasti', 'Tasti', 'Sinistra e destra col pollice sinistro'], ['leva', 'Leva', 'Leva analogica: nasce dove appoggi il pollice sinistro, più lo sposti più sterzi'], ['inclinazione', 'Inclinazione', 'Il telefono fa da volante']], 'telSterzo');
  seg('telPedali', [['tasti', 'Tasti', 'Freno e gas come pedali, col pollice destro (con l\'inclinazione il freno va a sinistra)'], ['cursore', 'Cursore', 'Barra verticale a destra: sopra la tacca gas, sotto freno, tutti e due dosabili']], 'telPedali');
  seg('telLeva', [['pronta', 'Pronta', 'Sterzo pieno con un piccolo spostamento del pollice'], ['media', 'Media', 'Sterzo pieno a metà strada'], ['dolce', 'Dolce', 'Sterzo pieno con uno spostamento ampio: più preciso']], 'telLeva');
  seg('telGas', [[false, 'No'], [true, 'Sì']], 'telGas');
  seg('telFreno', [[false, 'No'], [true, 'Sì']], 'telFreno');
  seg('telSens', [[15, 'Pronta', 'Sterzo pieno a 15° di inclinazione'], [22, 'Media', 'Sterzo pieno a 22°'], [32, 'Dolce', 'Sterzo pieno a 32°']], 'telSens');
  const onOff = [[false, 'No'], [true, 'Sì']];
  seg('linea', [[false, 'Nascosta'], [true, 'Visibile']], 'linea');
  seg('audio', [[false, 'Acceso'], [true, 'Spento']], 'muto');
  // penalità: due interruttori indipendenti nella stessa riga
  document.querySelectorAll('#pen button').forEach((b) => {
    const k = b.dataset.k;
    b.classList.toggle('sel', !!settings[k]);
    b.onclick = () => { settings[k] = !settings[k]; b.classList.toggle('sel', settings[k]); cb.change(k); };
  });
  // selettori +/− (giri, auto in gara)
  document.querySelectorAll('#menu .stepper').forEach((st) => {
    const k = st.dataset.k, mn = +st.dataset.min, mx = +st.dataset.max, b = st.querySelector('b');
    if (!k) return;
    b.textContent = settings[k];
    st.querySelectorAll('button').forEach((x) => {
      x.onclick = () => { settings[k] = Math.max(mn, Math.min(mx, settings[k] + +x.dataset.step)); b.textContent = settings[k]; cb.change(k); };
    });
  });
  // gara / time trial: mostra solo le righe che servono
  const modo = () => document.body.classList.toggle('tt', settings.modo === 'tempo');
  modo();
  $('modo').addEventListener('click', modo);
  // 26-11 (garage): riassunto delle scelte nelle tessere del menu
  const riassunti = () => {
    const t = pista(), M = mondi[t.mondo];
    $('tpistat').textContent = t.mondo === 'pacchetto' ? `Pista · versione ${settings.versione}` : 'Pista';
    const diff = { facile: 'Facili', normale: 'Normali', difficile: 'Difficili' }[settings.diff];
    $('tsess').textContent = settings.modo === 'tempo' ? `Time trial · ghost ${settings.ghost ? 'sì' : 'no'}` : `Gara · ${settings.laps} ${settings.laps === 1 ? 'giro' : 'giri'} · ${diff}`;
    $('tatm').textContent = `${M.ORE[settings.ora]?.nome || ''} · ${M.METEO[settings.meteo]?.nome || ''}`;
  };
  $('menu').addEventListener('click', () => requestAnimationFrame(riassunti));
  // pannelli da destra: uno per tessera (pista, sessione, atmosfera, record)
  document.querySelectorAll('#menu [data-foglio]').forEach((b) => { b.onclick = () => apriFoglio(b.dataset.foglio); });
  // impostazioni: categorie a sinistra
  document.querySelectorAll('#impostazioni .cat').forEach((b) => { b.onclick = () => categoria(b.dataset.cat); });
  $('go').onclick = () => cb.go();
  aggiornaPista();
  riassunti();
}

/** pannello del menu che entra da destra (null = chiude) */
export function apriFoglio(nome) {
  const prima = foglioAperto();
  document.querySelectorAll('#menu .foglio').forEach((f) => f.classList.toggle('aperto', f.dataset.f === nome));
  $('menu').classList.toggle('con-foglio', !!nome);
  // 27-11: la pista si costruisce quando si chiude il pannello Pista, non a ogni tocco (sul telefono laggava)
  if (prima === 'pista' && nome !== 'pista') $('menu').dispatchEvent(new Event('pista-scelta'));
}
export const foglioAperto = () => document.querySelector('#menu .foglio.aperto')?.dataset.f || null;

/** parte delle impostazioni in vista (la stessa nel menu e nella pausa) */
export function categoria(cat) {
  document.querySelectorAll('#impostazioni .cat').forEach((b) => b.classList.toggle('sel', b.dataset.cat === cat));
  document.querySelectorAll('#impcorpo .cat-p').forEach((p) => p.classList.toggle('sel', p.dataset.cat === cat));
}

/** mappa grande del pannello Pista: tutte le varianti del circuito in grigio (stesso riquadro), quella scelta in rosso */
export function reteSVG(piste, selId) {
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const p of piste) for (const [x, z] of p.outline) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  const w = maxx - minx, h = maxz - minz, s = Math.max(w, h) / 100;
  const path = (pts) => pts.map(([x, z], i) => `${i ? 'L' : 'M'}${((x - minx) / s).toFixed(1)},${((z - minz) / s).toFixed(1)}`).join('') + 'Z';
  const sel = piste.find((p) => p.id === selId) || piste[0], d = path(sel.outline), [x0, z0] = sel.outline[0];
  const grigi = piste.map((p) => `<path d="${path(p.outline)}" fill="none" stroke="#3b414d" stroke-width="${piste.length > 1 ? 1.5 : 3.6}" stroke-linejoin="round"/>`).join('');
  return `<svg viewBox="-4 -4 ${(w / s + 8).toFixed(1)} ${(h / s + 8).toFixed(1)}" preserveAspectRatio="xMidYMid meet">${grigi}`
    + `<path d="${d}" fill="none" stroke="#ff3b2f" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" class="psel"/>`
    + `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".5" stroke-linejoin="round"/>`
    + `<circle cx="${((x0 - minx) / s).toFixed(1)}" cy="${((z0 - minz) / s).toFixed(1)}" r="2.1" fill="#fff"/><circle cx="${((x0 - minx) / s).toFixed(1)}" cy="${((z0 - minz) / s).toFixed(1)}" r="1.1" fill="#111"/></svg>`;
}

export function outlineSVG(pts) {
  if (!pts || !pts.length) return '<svg></svg>';
  let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
  for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
  const w = maxx - minx, h = maxz - minz, s = Math.max(w, h);
  const d = pts.map(([x, z], i) => `${i ? 'L' : 'M'}${(((x - minx) / s) * 100 + (100 - (w / s) * 100) / 2).toFixed(1)},${(((z - minz) / s) * 100 + (100 - (h / s) * 100) / 2).toFixed(1)}`).join('') + 'Z';
  return `<svg viewBox="-6 -6 112 112" preserveAspectRatio="xMidYMid meet"><path d="${d}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="9" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`;
}

// ------------------------------------------------------------------ HUD
export class HUD {
  constructor() {
    this.el = {
      pos: $('hpos'), lap: $('hlap'), laps: $('hlaps'), cur: $('hcur'), best: $('hbest'), last: $('hlast'),
      corner: $('hcorner'), msg: $('hmsg'), board: $('hboard'), spd: $('hspd'), gear: $('hgear'), rev: $('hrev'), lights: $('lights'), cam: $('cam'),
    };
    this.mm = $('minimap').getContext('2d');
    this.msgT = 0;
    this.camT = 0;
    this._boardT = 0;
    this._corner = '';
  }
  setTrack(track) {
    // contorno per la minimappa
    const pts = [];
    for (let i = 0; i < track.n; i += 4) pts.push([track.px[i], track.pz[i]]);
    let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
    for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    const s = 200 / Math.max(maxx - minx, maxz - minz);
    const ox = 120 - ((maxx - minx) * s) / 2, oz = 120 - ((maxz - minz) * s) / 2;
    this.mmT = (x, z) => [ox + (x - minx) * s, oz + (z - minz) * s];
    this.mmPts = pts.map(([x, z]) => this.mmT(x, z));
  }
  message(text, ms = 1800) {
    this.el.msg.textContent = text;
    this.el.msg.classList.add('on');
    this.msgT = ms / 1000;
  }
  camLabel(text) {
    this.el.cam.textContent = text;
    this.el.cam.classList.add('on');
    this.camT = 1.6;
  }
  lights(n) {
    const L = this.el.lights;
    if (n === 0) { L.classList.add('hidden'); L.classList.remove('go'); return; }
    L.classList.remove('hidden');
    L.classList.toggle('go', n < 0);
    [...L.children].forEach((c, i) => c.classList.toggle('on', n > 0 && i < n));
  }
  update(dt, race, player, track) {
    const e = this.el;
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) e.msg.classList.remove('on'); }
    if (this.camT > 0) { this.camT -= dt; if (this.camT <= 0) e.cam.classList.remove('on'); }
    if (!player) return;
    const st = race.standings();
    e.pos.textContent = st.indexOf(player) + 1;
    e.lap.textContent = Math.max(1, Math.min(race.laps, player.lap || 1));
    e.laps.textContent = Number.isFinite(race.laps) ? race.laps : '';
    if (this._tt !== !!race.timeTrial) {
      // time trial: niente posizione (sei solo) e giri senza limite
      this._tt = !!race.timeTrial;
      $('hposw').style.display = this._tt ? 'none' : '';
      $('hlapsw').style.display = this._tt ? 'none' : '';
      // il tempo del giro va al centro, sotto il nome della curva
      $('hcrono').classList.toggle('hidden', !this._tt);
      $('hcurrow').style.display = this._tt ? 'none' : '';
    }
    if (this._tt) {
      const lancio = player.lap < 1;
      const t = lancio ? 'GIRO DI LANCIO' : fmt(race.time - player.lapStart).replace('—', '0:00.000');
      if (lancio !== this._lancio) { this._lancio = lancio; $('hcrono').classList.toggle('lancio', lancio); }
      if (t !== this._crono) { this._crono = t; $('hcrono').textContent = t; }
    }
    $('hposn').textContent = '/' + race.cars.length;
    e.cur.textContent = race.started && !player.finished ? fmt(race.time - player.lapStart) : player.finished ? fmt(player.lapTimes.at(-1)) : '0:00.000';
    e.best.textContent = fmt(player.best);
    e.last.textContent = fmt(player.lapTimes.at(-1));
    // giro invalidato → scritta che resta accanto ai tempi fino a fine giro; l'ultimo giro non valido barrato (Circuit Studio rev. 17)
    const inval = race.started && !player.finished && player.lap > 0 && player.lapPulito === false;
    if (inval !== this._inval) { this._inval = inval; $('hinval').classList.toggle('hidden', !inval); e.cur.classList.toggle('nonvalido', inval); }
    const vu = race._validi?.length ? race._validi.at(-1) === false : false;
    if (vu !== this._invU) { this._invU = vu; e.last.classList.toggle('nonvalido', vu); e.last.title = vu ? 'giro non valido' : ''; }
    // limitatore in corsia box (piste di Circuit Studio con pit.limite)
    const lim = !!player.limitatore;
    if (lim !== this._lim) { this._lim = lim; $('hlim').classList.toggle('on', lim); }
    // time trial: distacco dal ghost allo stesso punto della pista
    const dg = race.timeTrial ? race.deltaGhost : null;
    if ((dg != null) !== this._dOn) { this._dOn = dg != null; $('hdeltarow').classList.toggle('hidden', !this._dOn); }
    if (dg != null) { const el = $('hdelta'); el.textContent = (dg > 0 ? '+' : '−') + Math.abs(dg).toFixed(2); el.style.color = dg > 0 ? '#ff5a4a' : '#3bd16f'; }
        // stato dell'auto (danni meccanici): sagoma colorata + elenco con integrità
    if (race.danniReali && player.dmg) {
      if (!this._dz) {
        this._dz = { box: $('hdanni'), el: {}, li: {} };
        for (const k of ['muso', 'motore', 'cambio', 'alettone', 'r0', 'r1', 'r2', 'r3']) this._dz.el[k] = $('dz-' + k);
        this._dz.box.querySelectorAll('.dlista li').forEach((li) => { this._dz.li[li.dataset.k] = { li, em: li.querySelector('em'), b: li.querySelector('b') }; });
        this._dz.box.classList.remove('hidden');
      }
      const D = player.dmg, col = (v) => (v <= 0.05 ? '#3bd16f' : v < 0.3 ? '#c8e04a' : v < 0.55 ? '#ffd23f' : v < 0.8 ? '#ff8a2a' : '#ff3b2f');
      const set = (k, v) => { const e = this._dz.el[k]; e.classList.toggle('rotto', v >= 1); e.style.fill = v >= 1 ? '' : col(v); };
      const riga = (k, v) => { const r = this._dz.li[k]; const ok = Math.max(0, 1 - v); r.em.style.width = `${(ok * 100).toFixed(0)}%`; r.em.style.background = col(v); r.b.textContent = v >= 1 ? 'KO' : `${Math.round(ok * 100)}%`; r.li.classList.toggle('rotto', v >= 1); };
      set('muso', D.muso); set('motore', D.motore); set('cambio', D.cambio); set('alettone', D.alettone);
      D.ruote.forEach((v, i) => set('r' + i, v));
      riga('muso', D.muso); riga('motore', D.motore); riga('cambio', D.cambio); riga('alettone', D.alettone); riga('ruote', Math.max(...D.ruote));
    } else if (this._dz) { this._dz.box.classList.add('hidden'); this._dz = null; }
    const pen = player.pen || 0;
    if (pen !== this._pen) { this._pen = pen; $('hpenrow').classList.toggle('hidden', !pen); $('hpen').textContent = `+${pen} s`; }
    // scia: si accende sopra il 5% di resistenza in meno, barra piena al 40%
    const dr = player.draft || 0;
    if (!this._scia) this._scia = { el: $('hscia'), em: $('hscia').querySelector('em'), on: false };
    const on = dr > 0.05;
    if (on !== this._scia.on) { this._scia.on = on; this._scia.el.classList.toggle('on', on); }
    if (on) {
      this._scia.em.style.width = `${Math.min(100, (dr / 0.4) * 100).toFixed(0)}%`;
      const forte = dr > 0.25;
      if (forte !== this._scia.forte) { this._scia.forte = forte; this._scia.el.classList.toggle('forte', forte); }
    }
    const kmh = Math.round(player.speed * 3.6);
    e.spd.textContent = kmh;
    // fermo o sotto i 30 km/h per più di 3 s (gara in corso, auto ancora viva): suggerisci il recupero
    const lenta = race.started && !player.finished && !player.distrutta && player.speed * 3.6 < 30;
    this.lento = lenta ? (this.lento || 0) + dt : 0;
    const rec = this.lento > 3;
    if (rec !== this._rec) { this._rec = rec; $('hrecupero').classList.toggle('on', rec); }
    e.gear.textContent = player.gear === -1 ? 'R' : player.speed < 0.5 && player.throttle < 0.05 ? 'N' : player.gear;
    const rv = Math.max(0, Math.min(1, (player.rpm - 1300) / (8300 - 1300)));
    e.rev.style.width = `${rv * 100}%`;
    e.rev.parentElement.classList.toggle('limit', player.rpm > 8100);
    const cn = track.cornerAt(player.proj.s) || '';
    if (cn !== this._corner) { this._corner = cn; e.corner.textContent = cn; }
    // classifica (4 volte al secondo)
    this._boardT -= dt;
    if (this._boardT <= 0) {
      this._boardT = 0.25;
      const leader = st[0];
      e.board.innerHTML = st.map((c, i) => {
        let gap = '';
        if (i === 0) gap = c.finished ? 'ARRIVO' : `G${Math.max(1, c.lap)}`;
        else if (c.finished && leader.finished) gap = '+' + (c.finishTime - leader.finishTime).toFixed(1);
        else {
          const dl = leader.dist - c.dist;
          if (dl > track.length) gap = `+${Math.floor(dl / track.length)} g`;
          else gap = '+' + (dl / Math.max(20, c.speed || 40)).toFixed(1);
        }
        const L = LIVREE[c.livery] || LIVREE[0];
        return `<li class="${c === player ? 'me' : ''}"><span class="n">${i + 1}</span><span class="num" style="background:${hex(L.base)};color:${hex(L.sec)}">${c.num}</span><span>${c.nome}</span><span class="g">${gap}</span></li>`;
      }).join('');
    }
    // minimappa
    const g = this.mm;
    g.clearRect(0, 0, 240, 240);
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 9;
    g.beginPath(); this.mmPts.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z))); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.stroke();
    const sp = track.pointAt(track.startS, 0);
    const [sx, sz] = this.mmT(sp.x, sp.z);
    g.fillStyle = '#ffd23f'; g.fillRect(sx - 4, sz - 4, 8, 8);
    for (const c of race.cars) {
      const [x, z] = this.mmT(c.x, c.z);
      const L = LIVREE[c.livery] || LIVREE[0];
      g.fillStyle = c === player ? '#ff3b2f' : hex(L.base);
      g.strokeStyle = c === player ? '#fff' : 'rgba(0,0,0,.7)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, z, c === player ? 6.5 : 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
}

export function showResults(race) {
  const res = race.results();
  const best = Math.min(...race.cars.map((c) => c.best));
  const me = res.findIndex((r) => r.car === race.player);
  $('rtitle').textContent = race.player && race.player.ritirato ? 'Ritirato · auto distrutta' : me === 0 ? 'Vittoria!' : me >= 0 ? `Arrivato ${me + 1}°` : 'Bandiera a scacchi';
  const lead = res[0].tempo;
  $('rtable').innerHTML = `<tr><th>Pos</th><th>N.</th><th>Pilota</th><th>Auto</th><th>Tempo</th><th>Giro migliore</th></tr>` +
    res.map((r, i) => `<tr class="${r.car === race.player ? 'me' : ''}"><td class="p">${r.rit ? '—' : i + 1}</td><td>${r.car.num}</td><td>${r.car.nome}</td><td>${r.car.spec.nome}</td>
      <td>${r.rit ? `<span class="pen">RIT · ${r.giri} giri</span>` : i === 0 ? fmt(r.tempo) : '+' + (r.tempo - lead >= 60 ? fmt(r.tempo - lead) : (r.tempo - lead).toFixed(3))}${r.stimato ? '*' : ''}${r.pen ? ` <span class="pen" title="penalità incluse nel tempo">(+${r.pen} s)</span>` : ''}</td><td style="${r.best === best ? 'color:#c77dff;font-weight:800' : ''}">${fmt(r.best)}</td></tr>`).join('');
}
