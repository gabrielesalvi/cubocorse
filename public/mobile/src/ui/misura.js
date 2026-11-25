// Misura delle prestazioni sul telefono (fase 2a, 22-11-2026): ?misura=1 (o ?misura=medio per un'altra qualità).
// L'IA guida l'auto del giocatore in una gara a 8 auto, pista per pista (le tre voxel e le due di Circuit Studio, versione B),
// e il gioco misura per 30 s dopo il via: fps medi, fps nell'1% dei fotogrammi più lenti, fotogramma peggiore, risoluzione
// disegnata, tempo di caricamento. Alla fine una tabella da copiare (pulsante Copia, 25-11); i risultati partono anche verso claw06 (POST
// /misura su tools/serve.py, solo dentro Tailscale) e restano nel browser: se il telefono ricarica la pagina a metà (memoria
// piena, succede su iPhone) si riparte dalla pista dopo, e la tabella lo segnala.
// Le impostazioni di chi gioca non si toccano: si salvano all'inizio e si rimettono alla fine. Niente record né storico.
import { togliMisura } from './prove.js';
import { RegistroCali } from './cali.js';
import * as UI from './ui.js';

const CHIAVE = 'cubo-corse-misura';
const PISTE = [['monza', ''], ['porto', ''], ['colline', ''], ['roncadelle', 'B'], ['roncadelle-nenni', 'B']];
const SECONDI = +(new URLSearchParams(location.search).get('secondi')) || 30;   // ?secondi=5 per le prove
const $id = (id) => document.getElementById(id);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch { return null; } };
const scrivi = (d) => { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch { /* niente */ } };

export function dispositivo() {
  let gpu = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : 'niente WebGL');
  } catch { gpu = '?'; }
  return {
    ua: navigator.userAgent, gpu, schermo: `${screen.width}×${screen.height}`, finestra: `${innerWidth}×${innerHeight}`,
    dpr: devicePixelRatio, cpu: navigator.hardwareConcurrency || null, memoria: navigator.deviceMemory || null,
    app: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  };
}

/** misura i fotogrammi per `sec` secondi con un suo requestAnimationFrame */
function misuraFotogrammi(sec, avanza) {
  return new Promise((resolve) => {
    const dts = []; let t0 = null, prima = null;
    const passo = (t) => {
      if (prima !== null) dts.push(t - prima);
      prima = t; if (t0 === null) t0 = t;
      const el = (t - t0) / 1000;
      if (dts.length % 15 === 0 && dts.length) avanza(el, 1000 * dts.length / (t - t0));
      if (el < sec) requestAnimationFrame(passo); else resolve(dts);
    };
    requestAnimationFrame(passo);
  });
}

// ------------------------------------------------------------------ diagnostica (25-11)
// Gabriele: «mettici più dettagli in questa registrazione, prendi tutti i log che riesci e tutto ciò che può servire per
// l'ottimizzazione». Per ogni pista: il registro dei cali gira durante i 30 s (medie di processore fisica/disegno, scheda
// video se il browser la misura, chiamate e triangoli, scena per parti a fps normali, i cali peggiori con la scena per
// parti), compiti lunghi del browser, memoria JS e della scheda video, errori e avvisi della console; una volta sola le
// capacità WebGL del telefono.
const LOG = [];
const LUNGHI = { n: 0, ms: 0 };
const breve = (x) => { if (x instanceof Error) return x.message; if (typeof x === 'object' && x) { try { return JSON.stringify(x).slice(0, 200); } catch { return String(x); } } return String(x); };
function preparaDiagnostica() {
  if (preparaDiagnostica.fatto) return;
  preparaDiagnostica.fatto = true;
  for (const k of ['error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { if (LOG.length < 60) LOG.push(`${k}: ${a.map(breve).join(' ').slice(0, 300)}`); orig(...a); };
  }
  addEventListener('error', (e) => { if (LOG.length < 60) LOG.push(`errore: ${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`); });
  addEventListener('unhandledrejection', (e) => { if (LOG.length < 60) LOG.push(`promessa: ${breve(e.reason)}`); });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) { LUNGHI.n++; LUNGHI.ms += e.duration; } }).observe({ type: 'longtask', buffered: false }); } catch { /* Safari: non c'è */ }
}
const rendererDi = (app) => app.mondo?.r || app.mondo?.renderer?.r || null;
function capacitaGL(app) {
  const R = rendererDi(app); if (!R) return null;
  try {
    const gl = R.getContext(), fp = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    const EST = ['EXT_disjoint_timer_query_webgl2', 'KHR_parallel_shader_compile', 'WEBGL_multi_draw', 'EXT_color_buffer_half_float', 'EXT_color_buffer_float', 'OES_texture_float_linear', 'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_s3tc'];
    return { versione: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxSamples: gl.getParameter(gl.MAX_SAMPLES), maxUniformVertici: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS), highpFrammenti: fp ? fp.precision : null,
      estensioni: EST.filter((n) => !!gl.getSupportedExtensions()?.includes(n)), profonditaLog: !!R.capabilities.logarithmicDepthBuffer };
  } catch (e) { return { errore: e.message }; }
}
function stato(app) {
  const W = app.mondo, R = rendererDi(app), m = performance.memory;
  return { qualita: W?.qk || W?.renderer?.qKey || null, scala: R ? +R.getPixelRatio().toFixed(2) : null, ombre: (() => { let o = false; W?.scene?.traverse?.((x) => { if (x.isLight && x.castShadow && x.visible) o = true; }); return o; })(),
    geometrie: R?.info.memory.geometries ?? null, texture: R?.info.memory.textures ?? null, programmi: R?.info.programs?.length ?? null,
    heapMB: m ? Math.round(m.usedJSHeapSize / 1048576) : null, heapLimiteMB: m ? Math.round(m.jsHeapSizeLimit / 1048576) : null,
    hz: app.hz || null, tetto60: (app._tetto?.ogni || 1) > 1, visibile: document.visibilityState };
}
const parti = (f, n) => (f?.parti || []).slice(0, n).map((x) => `${x.k} ${x.t}${x.to ? '+' + x.to : ''}k/${x.c}${x.co ? '+' + x.co : ''}ch`);
/** il riassunto del registro dei cali per la misura: medie, scena normale e i cali peggiori (con la scena), senza i doppioni */
function diagnosi(reg, app, l0, log0) {
  if (reg.ep) reg._fineEpisodio();
  const c = reg.riassunto();
  const cali = [...c.episodi].sort((a, b) => a.fpsMin - b.fpsMin).slice(0, 5).map((e) => ({ ...e,
    foto: e.foto ? { parti: e.foto.parti.slice(0, 10) } : null, primaFoto: e.primaFoto ? { parti: e.primaFoto.parti.slice(0, 10) } : null }));
  return { medie: c.medie, fpsNormali: c.fpsNormali, timerGpu: c.timerGpu, corrente: c.corrente, ncali: c.episodi.length,
    scenaNormale: c.fotoNormale ? c.fotoNormale.parti.slice(0, 14) : null, cali,
    compitiLunghi: { n: LUNGHI.n - l0.n, ms: Math.round(LUNGHI.ms - l0.ms) }, log: LOG.slice(log0), stato: stato(app) };
}

function riassumi(dts) {
  const tot = dts.reduce((a, b) => a + b, 0), ord = [...dts].sort((a, b) => a - b);
  const p99 = ord[Math.floor(ord.length * 0.99)] || 0;
  return { fps: +(1000 * dts.length / tot).toFixed(1), fps1: +(1000 / p99).toFixed(1), peggiore: Math.round(ord.at(-1) || 0), n: dts.length };
}

function pannello() {
  let el = $id('misura');
  if (!el) {
    el = document.createElement('div'); el.id = 'misura';
    el.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;pointer-events:none;font:15px/1.4 system-ui,sans-serif;color:#fff';
    document.body.appendChild(el);
  }
  return el;
}
const scatola = (html, toccabile = false) => `<div style="pointer-events:${toccabile ? 'auto' : 'none'};background:rgba(10,12,16,.9);border:1px solid #ffd23f;border-radius:12px;padding:16px 18px;max-width:min(92vw,720px);max-height:90vh;overflow:auto">${html}</div>`;
const cartellino = (html) => `<div style="position:fixed;top:8px;left:8px;pointer-events:none;background:rgba(10,12,16,.82);border-radius:8px;padding:6px 10px;font:13px/1.35 ui-monospace,Menlo,monospace;color:#d8f5d0">${html}</div>`;

function tabella(d) {
  const righe = d.risultati.map((r) => `<tr><td>${r.nome}</td><td style="text-align:right"><b>${r.fps ?? '—'}</b></td><td style="text-align:right">${r.fps1 ?? '—'}</td><td style="text-align:right">${r.peggiore ?? '—'} ms</td><td>${r.risoluzione || ''}</td><td style="text-align:right">${r.carico ?? '—'} s</td>${r.nota ? `<td>${r.nota}</td>` : '<td></td>'}</tr>${r.fasi?.length ? `<tr><td></td><td colspan="6" style="font-size:12px;color:#aaa;padding-top:0">carico: ${r.fasi.map(([n, v]) => `${n} ${String(v.toFixed(1)).replace('.', ',')} s`).join(' · ')}</td></tr>` : ''}`).join('');
  const D = d.dispositivo;
  return `<div style="font-weight:700;color:#ffd23f;margin-bottom:6px">Misura finita · qualità ${d.qual}</div>
    <table style="border-collapse:collapse;font-size:14px" cellpadding="4"><tr style="color:#aaa"><td>Pista</td><td>fps medi</td><td>fps 1% lenti</td><td>peggiore</td><td>risoluzione</td><td>carico</td><td></td></tr>${righe}</table>
    <div style="margin-top:8px;font-size:12px;color:#aaa">${D.gpu} · schermo ${D.schermo} · finestra ${D.finestra} · dpr ${D.dpr}${D.memoria ? ` · ${D.memoria} GB` : ''}${D.app ? ' · come app' : ''}<br>${D.ua}</div>
    <div style="margin-top:8px">${d.inviato ? '✅ Risultati arrivati a claw06.' : 'Tocca <b>Copia</b> e incolla tutto in chat.'}</div>
    <div id="mis-stato" style="margin-top:6px;color:#9fe6a0"></div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button id="mis-copia" style="font:700 15px system-ui;padding:8px 14px;border-radius:8px;border:0;background:#ffd23f">Copia</button><button id="mis-menu" style="font:600 15px system-ui;padding:8px 14px;border-radius:8px;border:1px solid #888;background:none;color:#fff">Torna al gioco</button><button id="mis-capo" style="font:600 15px system-ui;padding:8px 14px;border-radius:8px;border:1px solid #888;background:none;color:#fff">Rifai la misura</button></div>`;
}

/** 25-11 (Gabriele: «con un tasto il tester copia tutto in blocco»): tabella in testo + tutti i dati, da incollare in chat */
function testo(d) {
  const D = d.dispositivo, r = [`Misura · qualità ${d.qual} · ${D.gpu} · schermo ${D.schermo} · finestra ${D.finestra} · dpr ${D.dpr}${D.app ? ' · come app' : ''}`];
  if (d.gl) r.push(`WebGL: ${d.gl.versione} · texture max ${d.gl.maxTexture} · MSAA max ${d.gl.maxSamples} · highp ${d.gl.highpFrammenti} · ${(d.gl.estensioni || []).join(', ')}`);
  for (const x of d.risultati) {
    r.push(`${x.nome}: ${x.fps ?? '—'} fps medi, 1% ${x.fps1 ?? '—'}, peggiore ${x.peggiore ?? '—'} ms, ${x.risoluzione || ''}, carico ${x.carico ?? '—'} s${x.nota ? ` · ${x.nota}` : ''}`);
    if (x.fasi?.length) r.push(`  carico: ${x.fasi.map(([n, v]) => `${n} ${v.toFixed(1)} s`).join(' · ')}`);
    const g = x.diag;
    if (g) {
      const M = g.medie || {}, S = g.stato || {};
      r.push(`  media: CPU ${M.cpu} ms (fisica ${M.fis} + disegno ${M.dis}), GPU ${M.gpu ?? '—'}, ${M.chiamate} chiamate, ${M.tri} k tri · normali ${g.fpsNormali} fps · ${g.ncali} cali · compiti lunghi ${g.compitiLunghi.n} (${g.compitiLunghi.ms} ms)`);
      r.push(`  stato: qualità ${S.qualita}, scala ${S.scala}, ombre ${S.ombre ? 'sì' : 'no'}, ${S.geometrie} geometrie, ${S.texture} texture, ${S.programmi} shader${S.heapMB != null ? `, JS ${S.heapMB}/${S.heapLimiteMB} MB` : ''}${S.hz ? `, schermo ${S.hz} Hz${S.tetto60 ? ' (tetto 60)' : ''}` : ''}${g.corrente ? `, ${g.corrente}` : ''}`);
      if (g.scenaNormale) r.push(`  scena (vista+ombre): ${parti({ parti: g.scenaNormale }, 8).join(' · ')}`);
      for (const e of g.cali.slice(0, 3)) r.push(`  calo a ${e.s} m: ${e.fpsMin}/${e.rif} fps per ${e.durata} s, CPU ${e.cpu} (${e.fis}+${e.dis}), GPU ${e.gpu ?? '—'}, ${e.chiamate} ch ${e.tri} k tri, ${e.colpa}; ${e.cresce || ''}`);
      for (const l of g.log.slice(0, 8)) r.push(`  log: ${l}`);
    }
    if (x.info) r.push(`  ${String(x.info).replace(/\n/g, ' · ')}`);
  }
  return r.join('\n') + '\n\n' + JSON.stringify({ ...d, originali: undefined });
}

/** copia negli appunti; se il browser non lo permette, il testo resta selezionabile in un riquadro */
async function copia(d, stato) {
  const t = testo(d);
  try { await navigator.clipboard.writeText(t); stato.textContent = '📋 Copiato: incollalo in chat.'; return; } catch { /* sotto */ }
  const a = document.createElement('textarea'); a.value = t; a.readOnly = true;
  a.style.cssText = 'width:100%;height:120px;margin-top:6px;font:11px ui-monospace,monospace';
  stato.textContent = 'Il browser non ha permesso la copia automatica: tieni premuto nel riquadro, «Seleziona tutto» e «Copia».';
  stato.after(a); a.focus(); a.select();
}

async function invia(d) {
  try {
    const r = await fetch('misura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
    return r.ok;
  } catch { return false; }
}

/** schermata iniziale, poi le piste una dopo l'altra */
export function avviaMisura(app, qual = 'basso') {
  const el = pannello();
  let d = leggi();
  const nuova = !d || d.finita || d.qual !== qual;
  if (nuova) d = { qual, iniziata: new Date().toISOString(), dispositivo: dispositivo(), risultati: [], incorso: null, originali: JSON.parse(JSON.stringify(app.settings)), finita: false };
  // pagina ricaricata mentre una pista era in corso: il telefono ha chiuso la pagina (di solito memoria piena)
  if (d.incorso) { d.risultati.push({ id: d.incorso.id, nome: d.incorso.nome, nota: 'pagina ricaricata dal telefono a metà' }); d.incorso = null; scrivi(d); }
  const fatte = d.risultati.length;
  el.innerHTML = scatola(`<div style="font-weight:700;color:#ffd23f;font-size:18px">Misura delle prestazioni</div>
    <p>Tieni il telefono <b>in orizzontale</b> e non toccarlo: l'IA guida da sola su ${PISTE.length} piste, 30 secondi ciascuna,
    circa ${Math.round(PISTE.length * 55 / 60)} minuti in tutto. Alla fine c'è una tabella: tocca <b>Copia</b> e incollala in chat.</p>
    ${fatte ? `<p>Ripresa: ${fatte} piste già fatte su ${PISTE.length}.</p>` : ''}
    <button id="mis-via" style="font:700 17px system-ui;padding:10px 18px;border-radius:10px;border:0;background:#ffd23f">Inizia</button>
    <button id="mis-no" style="font:600 15px system-ui;padding:10px 14px;margin-left:6px;border-radius:10px;border:1px solid #888;background:none;color:#fff">Annulla</button>`, true);
  $id('mis-no').onclick = () => { el.remove(); };
  $id('mis-via').onclick = async () => {
    try { if (navigator.wakeLock) app._wake = await navigator.wakeLock.request('screen'); } catch { /* niente */ }
    try { if (document.documentElement.requestFullscreen && !/iPhone|iPad/.test(navigator.userAgent)) await document.documentElement.requestFullscreen(); } catch { /* niente */ }
    scrivi(d);
    corri(app, d, el);
  };
}

async function corri(app, d, el) {
  app.misura = true;
  preparaDiagnostica();
  // errori fuori dalla preparazione (moduli, shader, contesto WebGL perso): finiscono a schermo nel cartellino
  addEventListener('error', (e) => { window.__errore ||= e.message; });
  addEventListener('unhandledrejection', (e) => { window.__errore ||= String(e.reason?.message || e.reason); });
  const s = app.settings;
  for (const [id, v] of PISTE) {
    if (d.risultati.some((r) => r.id === id)) continue;
    const t = app.piste.find((p) => p.id === id);
    if (!t) { d.risultati.push({ id, nome: id, nota: 'pista non trovata' }); continue; }
    const nome = t.mondo === 'voxel' ? t.nome : `${t.nome} ${v}`;
    d.incorso = { id, nome }; scrivi(d);
    el.innerHTML = cartellino(`Misura ${d.risultati.length + 1}/${PISTE.length} · ${nome}<br>carico la pista…`);
    if (app.mode === 'race' || app.mode === 'results') app.toMenu();
    UI.showScreen('menu', false);
    Object.assign(s, { track: id, versione: v || s.versione, qual: d.qual, modo: 'gara', nAuto: 8, laps: 9, grid: 'ultimo', meteo: 'sereno', danni: 'estetici' });
    const t0 = performance.now();
    // 25-11 (Gabriele: misura ferma su «carico la pista» da oltre un minuto, telefono fermo sulla schermata): a schermo il
    // passaggio in corso, i secondi e l'eventuale errore; un errore o 120 s senza via = pista segnata e si passa alla dopo
    window.__errore = null;
    let fase = 'preparo il mondo';
    const orologio = setInterval(() => {
      const sec = Math.round((performance.now() - t0) / 1000), st = $id('mstato')?.textContent || '';
      el.innerHTML = cartellino(`Misura ${d.risultati.length + 1}/${PISTE.length} · ${nome}<br>carico la pista… ${sec} s · ${fase}${st ? ` · ${st}` : ''}${window.__errore ? `<br><span style="color:#ff8a80">errore: ${String(window.__errore).split('\n')[0].slice(0, 160)}</span>` : ''}`);
    }, 1000);
    let carico;
    try {
      const scadenza = (ms, cosa) => attendi(ms).then(() => { throw new Error(`ferma da ${ms / 1000} s: ${cosa}`); });
      await Promise.race([app.prepara(), scadenza(120000, 'preparo il mondo')]);
      if (!app.pronta()) throw new Error(window.__errore ? String(window.__errore).split('\n')[0] : 'mondo non pronto dopo la preparazione');
      carico = +((performance.now() - t0) / 1000).toFixed(1);
      fase = 'parto'; await app.go();
      app.race.pilotaAutomatico();
      UI.showScreen('menu', false);
      fase = 'aspetto il via';
      const t1 = performance.now();
      while (!app.race.started) { if (performance.now() - t1 > 120000) throw new Error('il via non arriva da 120 s'); await attendi(200); }
    } catch (e) {
      clearInterval(orologio);
      console.error('misura', id, e);
      d.risultati.push({ id, nome, nota: `bloccata: ${e.message}`.slice(0, 200), carico: +((performance.now() - t0) / 1000).toFixed(1) });
      d.incorso = null; scrivi(d);
      el.innerHTML = cartellino(`Misura ${d.risultati.length}/${PISTE.length} · ${nome}<br><span style="color:#ff8a80">${e.message}</span><br>passo alla pista dopo…`);
      await attendi(4000);
      continue;
    }
    clearInterval(orologio);
    await attendi(2000);               // primi secondi: shader e partenza
    if (!d.gl) d.gl = capacitaGL(app);
    const reg = new RegistroCali(app), l0 = { ...LUNGHI }, log0 = LOG.length;
    app.cali = reg;
    const dts = await misuraFotogrammi(SECONDI, (sec, fps) => {
      const u = reg.dts.slice(-30), fd = u.length ? 1000 * u.length / u.reduce((x, y) => x + y, 0) : fps;   // fotogrammi disegnati
      el.innerHTML = cartellino(`Misura ${d.risultati.length + 1}/${PISTE.length} · ${nome}<br>${Math.round(sec)}/${SECONDI} s · ${fd.toFixed(0)} fps`);
    });
    const W = app.mondo, c = W.canvas || $id('gl');
    const fasi = (app.ultimoCarico?.id === id ? app.ultimoCarico.fasi : []).slice(0, 3);   // 23-11: dove va il tempo di caricamento
    const diag = diagnosi(reg, app, l0, log0);
    app.cali = null;                   // niente tabella del registro tornando al menu fra una pista e l'altra
    // fps dai fotogrammi DISEGNATI (registro), non dalle chiamate del browser: col tetto a 60 su uno schermo a 120 sono la metà
    d.risultati.push({ id, nome, ...riassumi(reg.dts.length > 30 ? reg.dts : dts), carico, fasi, diag, risoluzione: c ? `${c.width}×${c.height}` : '', pr: W.pixelRatio ?? null, info: W.infoPrestazioni ? W.infoPrestazioni() : '' });
    d.incorso = null; scrivi(d);
  }
  d.finita = true; d.finitaAlle = new Date().toISOString();
  togliMisura();   // 25-11: misura avviata dal pannello delle prove (app sulla Home): all'avvio dopo non riparte
  if (app.mode === 'race' || app.mode === 'results') app.toMenu();
  UI.showScreen('menu', false);
  d.inviato = await invia({ ...d, originali: undefined });
  scrivi(d);
  try { app._wake?.release(); } catch { /* niente */ }
  el.innerHTML = scatola(tabella(d), true);
  const fine = () => {
    Object.assign(app.settings, d.originali || {});
    UI.saveSettings(app.settings);
    app.misura = false;
    location.href = location.pathname;
  };
  $id('mis-menu').onclick = fine;
  $id('mis-copia').onclick = () => copia(d, $id('mis-stato'));
  $id('mis-capo').onclick = () => { localStorage.removeItem(CHIAVE); Object.assign(app.settings, d.originali || {}); UI.saveSettings(app.settings); location.reload(); };
}
