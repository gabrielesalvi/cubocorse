// Misura delle prestazioni sul telefono (fase 2a, 22-11-2026): ?misura=1 (o ?misura=medio per un'altra qualità).
// L'IA guida l'auto del giocatore in una gara a 8 auto, pista per pista (le tre voxel e le due di Circuit Studio, versione B),
// e il gioco misura per 30 s dopo il via: fps medi, fps nell'1% dei fotogrammi più lenti, fotogramma peggiore, risoluzione
// disegnata, tempo di caricamento. Alla fine una tabella da fotografare; i risultati partono anche verso claw06 (POST
// /misura su tools/serve.py, solo dentro Tailscale) e restano nel browser: se il telefono ricarica la pagina a metà (memoria
// piena, succede su iPhone) si riparte dalla pista dopo, e la tabella lo segnala.
// Le impostazioni di chi gioca non si toccano: si salvano all'inizio e si rimettono alla fine. Niente record né storico.
import * as UI from './ui.js';

const CHIAVE = 'cubo-corse-misura';
const PISTE = [['monza', ''], ['porto', ''], ['colline', ''], ['roncadelle', 'B'], ['roncadelle-nenni', 'B']];
const SECONDI = +(new URLSearchParams(location.search).get('secondi')) || 30;   // ?secondi=5 per le prove
const $id = (id) => document.getElementById(id);
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const leggi = () => { try { return JSON.parse(localStorage.getItem(CHIAVE) || 'null'); } catch { return null; } };
const scrivi = (d) => { try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch { /* niente */ } };

function dispositivo() {
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
    <div style="margin-top:8px">${d.inviato ? '✅ Risultati arrivati a claw06.' : '⚠️ Non sono riuscito a mandarli a claw06: fai uno screenshot di questa schermata.'}</div>
    <div style="margin-top:10px;display:flex;gap:8px"><button id="mis-menu" style="font:600 15px system-ui;padding:8px 14px;border-radius:8px;border:0;background:#ffd23f">Torna al gioco</button><button id="mis-capo" style="font:600 15px system-ui;padding:8px 14px;border-radius:8px;border:1px solid #888;background:none;color:#fff">Rifai la misura</button></div>`;
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
    circa ${Math.round(PISTE.length * 55 / 60)} minuti in tutto. Alla fine c'è una tabella da fotografare.</p>
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
    await app.prepara();
    const carico = +((performance.now() - t0) / 1000).toFixed(1);
    await app.go();
    app.race.pilotaAutomatico();
    UI.showScreen('menu', false);
    while (!app.race.started) await attendi(200);
    await attendi(2000);               // primi secondi: shader e partenza
    const dts = await misuraFotogrammi(SECONDI, (sec, fps) => {
      el.innerHTML = cartellino(`Misura ${d.risultati.length + 1}/${PISTE.length} · ${nome}<br>${Math.round(sec)}/${SECONDI} s · ${fps.toFixed(0)} fps`);
    });
    const W = app.mondo, c = W.canvas || $id('gl');
    const fasi = (app.ultimoCarico?.id === id ? app.ultimoCarico.fasi : []).slice(0, 3);   // 23-11: dove va il tempo di caricamento
    d.risultati.push({ id, nome, ...riassumi(dts), carico, fasi, risoluzione: c ? `${c.width}×${c.height}` : '', pr: W.pixelRatio ?? null, info: W.infoPrestazioni ? W.infoPrestazioni() : '' });
    d.incorso = null; scrivi(d);
  }
  d.finita = true; d.finitaAlle = new Date().toISOString();
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
  $id('mis-capo').onclick = () => { localStorage.removeItem(CHIAVE); Object.assign(app.settings, d.originali || {}); UI.saveSettings(app.settings); location.reload(); };
}
