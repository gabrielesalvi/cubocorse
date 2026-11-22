// Record e storico, salvati nel browser (localStorage).
// - Record: i 10 giri migliori per pista (con la versione) × modalità (gara | time trial). Non per modello di guida, sterzo o
//   fisica (decisione del 17-11, fase 0). Valgono solo i giri puliti (niente uscite con 4 ruote fuori, niente rimesse in pista).
// - Storico: le ultime 50 gare.
// Fase 0 (20-11): chiave nuova (v2). I record di prima (v1, pista × fisica, tutti da tastiera) passano in «gara · tastiera».
// 21-11 (Cubo Corse 1.0): la pista nella chiave porta la sua versione («roncadelle-B@v2»): una classifica per versione
// della pista (ui/versioni.js). I record fatti fino ad allora restano dove sono e diventano la v1 (decisione di Gabriele).
// 21-11 sera (Gabriele): tastiera e controller nella STESSA classifica (tutti contro tutti), con un simbolo del comando usato
// accanto al tempo (chiave v4: le classifiche v3 tastiera e controller unite); al posto delle 3 iniziali da cabinato un nome
// di sole lettere, al massimo 8, scritto nella casella. Le chiavi vecchie (v2, v3) restano nel browser come copia.

import { verificaNome, vietatoSubito, caricaLista } from './nomi.js';

const KEY = 'cubo-corse-record-v4', KEY_V3 = 'cubo-corse-record-v3', KEY_V2 = 'cubo-corse-record-v2', KEY_V1 = 'cubo-corse-record-v1';
const MAX_BOARD = 10, MAX_STORICO = 50, MAX_NOME = 8;
export const MODI = { arcade: 'Arcade', realistica: 'Realistica' };
export const MODALITA = { gara: 'Gara', tempo: 'Time trial' };
// 22-11 (fase 1): il telefono, con le sue due varianti (tasti a schermo, inclinazione), nella stessa classifica col suo simbolo
export const COMANDI = { tastiera: 'Tastiera', controller: 'Controller', touch: 'Telefono · tasti', inclinazione: 'Telefono · inclinazione' };
/** giro fatto con più comandi: prende il simbolo del più aiutato fra quelli usati (tasti a schermo e tastiera hanno la
 *  rampa dello sterzo e il tetto in velocità; l'inclinazione è analogica ma filtrata; il controller è il meno aiutato) */
export const PIU_AIUTATO = ['touch', 'tastiera', 'inclinazione', 'controller'];
export const comandoDelGiro = (usati) => PIU_AIUTATO.find((c) => usati.has(c)) || 'tastiera';
/** categoria di un record: la modalità (tastiera e controller insieme dal 21-11) */
export const categoria = (modo) => (modo === 'tempo' ? 'tempo' : 'gara');
export const nomeCategoria = (cat) => MODALITA[cat] || cat;
/** simbolo del comando con cui è stato fatto il giro (SVG, colore del testo) */
const ICONE = {
  tastiera: '<svg viewBox="0 0 24 16" width="20" height="13" aria-hidden="true"><rect x="1" y="1" width="22" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 5h2M9 5h2M13 5h2M17 5h2M5 8.5h2M9 8.5h2M13 8.5h2M17 8.5h2M7 12h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  controller: '<svg viewBox="0 0 24 16" width="20" height="13" aria-hidden="true"><path d="M7 2h10c3 0 5 2.5 5.6 6.5.5 3.4-.6 5.5-2.4 5.5-1.5 0-2.4-1.3-3.4-2.8H7.2C6.2 12.7 5.3 14 3.8 14 2 14 .9 11.9 1.4 8.5 2 4.5 4 2 7 2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 6v4M4.5 8h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="16.5" cy="6.8" r="1.1" fill="currentColor"/><circle cx="18.8" cy="9.2" r="1.1" fill="currentColor"/></svg>',
  touch: '<svg viewBox="0 0 24 16" width="20" height="13" aria-hidden="true"><rect x="2" y="2" width="20" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 8h3M7 6.5v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="18.6" cy="8" r="1.2" fill="currentColor"/></svg>',
  inclinazione: '<svg viewBox="0 0 24 16" width="20" height="13" aria-hidden="true"><g transform="rotate(-14 12 8)"><rect x="3" y="3.5" width="18" height="9" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.6"/></g><path d="M2.5 13.5c2-1.6 4-2.3 6-2.5M21.5 2.5c-2 1.6-4 2.3-6 2.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};
export const iconaComando = (c) => (ICONE[c] ? `<span class="ic-com" title="${COMANDI[c]}">${ICONE[c]}</span>` : '');

function migraV1() {
  try {
    const v1 = JSON.parse(localStorage.getItem(KEY_V1) || 'null');
    if (!v1) return null;
    const boards = {};
    for (const [k, b] of Object.entries(v1.boards || {})) {
      const pista = k.split('|')[0], nk = `${pista}|gara|tastiera`;
      boards[nk] = (boards[nk] || []).concat(b.map((r) => ({ ...r, prima: true }))).sort((a, c) => a.tempo - c.tempo).slice(0, MAX_BOARD);
    }
    return { boards, storico: v1.storico || [], ultimoNome: v1.ultimoNome || 'AAA' };
  } catch { return null; }
}
/** record v2 (o v1) → v3: ogni pista diventa la sua v1 */
function migraV2() {
  let d = null;
  try { const raw = localStorage.getItem(KEY_V2); d = raw ? JSON.parse(raw) : migraV1(); } catch { d = null; }
  if (!d) return null;
  const boards = {};
  for (const [k, b] of Object.entries(d.boards || {})) { const [pista, ...cat] = k.split('|'); boards[[`${pista.includes('@v') ? pista : pista + '@v1'}`, ...cat].join('|')] = b.map((r) => ({ vPista: 1, ...r })); }
  return { boards, storico: (d.storico || []).map((g) => ({ vPista: 1, ...g })), ultimoNome: d.ultimoNome || 'AAA' };
}
/** v3 → v4: per ogni pista e modalità le classifiche tastiera e controller unite (ogni record si porta il suo comando) */
function migraV3() {
  let d = null;
  try { const raw = localStorage.getItem(KEY_V3); d = raw ? JSON.parse(raw) : migraV2(); } catch { d = null; }
  if (!d) return null;
  const boards = {};
  for (const [k, b] of Object.entries(d.boards || {})) {
    const [pista, modo, com] = k.split('|'), nk = `${pista}|${modo === 'tempo' ? 'tempo' : 'gara'}`;
    boards[nk] = (boards[nk] || []).concat(b.map((r) => ({ comando: com === 'controller' ? 'controller' : 'tastiera', ...r })))
      .sort((x, y) => x.tempo - y.tempo).slice(0, MAX_BOARD);
  }
  return { boards, storico: d.storico || [], ultimoNome: d.ultimoNome || '' };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const m = migraV3(); if (m) { save(m); return m; } }
    const d = JSON.parse(raw || '{}');
    return { boards: d.boards || {}, storico: d.storico || [], ultimoNome: d.ultimoNome || '' };
  } catch {
    return { boards: {}, storico: [], ultimoNome: '' };
  }
}
function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* spazio pieno o storage bloccato: pazienza */ }
}
/** pista = chiave con la versione (chiaveRecord in ui/versioni.js: «roncadelle-B@v2») */
const chiave = (pista, cat) => `${pista}|${cat || 'gara'}`;

export function board(pista, cat) {
  return load().boards[chiave(pista, cat)] || [];
}

/** posizione (0-based) che un giro di `tempo` secondi avrebbe nella classifica, o -1 se non entra */
export function posizione(pista, cat, tempo) {
  if (!Number.isFinite(tempo)) return -1;
  const b = board(pista, cat);
  const k = b.findIndex((r) => tempo < r.tempo);
  if (k >= 0) return k;
  return b.length < MAX_BOARD ? b.length : -1;
}

export function aggiungiRecord(pista, cat, voce) {
  const d = load();
  const k = chiave(pista, cat);
  const b = (d.boards[k] || []).concat([voce]).sort((a, c) => a.tempo - c.tempo).slice(0, MAX_BOARD);
  d.boards[k] = b;
  d.ultimoNome = voce.nome;
  save(d);
  return b.indexOf(voce);
}

export function aggiungiStorico(voce) {
  const d = load();
  d.storico.unshift(voce);
  d.storico = d.storico.slice(0, MAX_STORICO);
  save(d);
}

export function storico() {
  return load().storico;
}
/** ultimo nome usato (vuoto se era ancora quello di prova «AAA» delle iniziali) */
export function ultimoNome() {
  const n = load().ultimoNome || '';
  return n === 'AAA' ? '' : n;
}

const fmt = (t) => {
  if (!Number.isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const METEO_ICONA = { sereno: '☀', nuvoloso: '☁', pioggia: '☂' };

/** tabella dei record in stile cabinato; `evidenzia` = indice della riga appena inserita */
export function htmlBoard(b, evidenzia = -1, righe = MAX_BOARD) {
  if (!b.length) return '<p class="rec-vuoto">Ancora nessun record. Il primo giro pulito è tuo.</p>';
  const ord = ['1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°'];
  return `<table class="rec-tab">${b.slice(0, righe).map((r, i) => `<tr class="${i === evidenzia ? 'nuovo' : ''}${i === 0 ? ' primo' : ''}">
    <td class="r">${ord[i]}</td><td class="n">${esc(r.nome)}</td><td class="t">${fmt(r.tempo)}</td><td class="c">${iconaComando(r.comando)}</td>
    <td class="a">${esc(r.auto || '')}</td><td class="m" title="${esc(r.meteo || '')}">${METEO_ICONA[r.meteo] || ''}</td><td class="d" title="${esc(r.gioco ? `Cubo Corse ${r.gioco}` : 'prima della 1.0')}">${esc((r.data || '').slice(0, 10))}</td></tr>`).join('')}</table>`;
}

export function htmlStorico(lista, nomiPiste) {
  if (!lista.length) return '<p class="rec-vuoto">Nessuna gara ancora.</p>';
  return `<table class="rec-tab storico"><tr><th>Data</th><th>Pista</th><th>Comandi</th><th>Giri</th><th>Avversari</th><th>Pos.</th><th>Tempo</th><th>Giro migliore</th><th>Auto</th></tr>${lista.map((g) => `<tr>
    <td>${esc((g.data || '').replace('T', ' ').slice(0, 16))}</td><td>${esc(nomiPiste[g.pista] || g.pista)}${g.vPista ? ` <span class="pen">v${g.vPista}</span>` : ''}</td><td>${esc(COMANDI[g.comando] || MODI[g.fisica] || g.fisica || '')}</td>
    <td>${g.giri}</td><td>${esc(g.tipo === 'tempo' ? 'time trial' : g.diff)}</td><td class="r">${g.tipo === 'tempo' ? 'TT' : g.pos === 'RIT' ? 'RIT' : g.pos + '°'}</td><td>${g.tipo === 'tempo' ? '—' : fmt(g.tempo)}${g.pen ? ` <span class="pen">(+${g.pen} s)</span>` : ''}</td>
    <td>${fmt(g.best)}${g.bestValido === false ? ' <span class="pen" title="nessun giro pulito">*</span>' : ''}</td><td>${esc(g.auto)}</td></tr>`).join('')}</table>`;
}

/** solo lettere (anche accentate), al massimo 8 */
export const pulisciNome = (t) => String(t || '').replace(/[^\p{L}]/gu, '').slice(0, MAX_NOME);

/**
 * 21-11 sera (Gabriele): il nome del record, sole lettere (niente numeri), al massimo 8, in una casella di testo; Invio o
 * OK conferma. Al posto dell'inserimento da cabinato a 3 lettere. Col controller si conferma il nome già scritto (l'ultimo
 * usato). Ritorna una Promise con il nome; vuoto → «Pilota».
 * 22-11 (fase 1, corretto la sera su richiesta di Gabriele): il controllo del nome si fa MENTRE si scrive e il risultato
 * compare sotto la casella. Nome vietato → «Questo nome non si può usare…» e OK non lo accetta. Nome già usato da un altro
 * giocatore nella classifica mondiale → solo avviso sotto, e OK lo salva al primo clic (mai due clic).
 * Uscendo dai risultati senza OK, un nome vietato diventa «Pilota».
 */
export function chiediNome(el, titolo, nome = '') {
  caricaLista();
  return new Promise((resolve) => {
    el.innerHTML = `<div class="arcade"><div class="arc-tit">${titolo}</div>
      <label class="nome-rec"><span>Il tuo nome</span><input type="text" maxlength="${MAX_NOME}" autocomplete="nickname" spellcheck="false" value="${esc(pulisciNome(nome))}" placeholder="Pilota"></label>
      <div class="arc-aiuto">solo lettere, al massimo ${MAX_NOME} · <b>Invio</b> per confermare</div>
      <div class="arc-avviso" role="status" hidden></div>
      <button class="go arc-ok">OK</button></div>`;
    const inp = el.querySelector('input'), ok = el.querySelector('.arc-ok'), avviso = el.querySelector('.arc-avviso');
    let fatto = false, giro = 0;
    const MSG_VIETATO = 'Questo nome non si può usare, scegline un altro.';
    const mostra = (testo, tipo) => { avviso.textContent = testo; avviso.className = `arc-avviso ${tipo}`; avviso.hidden = !testo; };
    // controllo mentre si scrive (con una piccola attesa, per non chiedere al server a ogni lettera); conta solo l'ultimo
    const controlla = async () => {
      const g = ++giro, n = pulisciNome(inp.value);
      if (!n) { mostra('', ''); return; }
      const { vietato, usato } = await verificaNome(n);
      if (g !== giro || fatto) return;
      if (vietato) mostra(MSG_VIETATO, 'no');
      else if (usato) mostra(`C'è già un ${n.toUpperCase()} in classifica: se vuoi, scegline un altro.`, 'attenzione');
      else mostra('', '');
    };
    let attesa = 0;
    inp.oninput = () => { const v = pulisciNome(inp.value); if (v !== inp.value) inp.value = v; clearTimeout(attesa); attesa = setTimeout(controlla, 350); };
    const chiudi = (n) => { if (fatto) return; fatto = true; clearTimeout(attesa); inp.disabled = true; ok.disabled = true; delete el._confermaNome; resolve(n); };
    // OK: un clic solo. Blocca soltanto un nome vietato (il filtro è locale, la risposta è immediata); un nome già usato si salva
    const fine = async () => {
      if (fatto) return;
      const n = pulisciNome(inp.value) || 'Pilota';
      await caricaLista();
      if (fatto) return;
      if (vietatoSubito(n)) { giro++; mostra(MSG_VIETATO, 'no'); inp.focus(); inp.select(); return; }
      chiudi(n);
    };
    controlla();          // anche il nome già scritto (l'ultimo usato) si controlla subito
    // uscendo dai risultati senza OK il record si salva lo stesso (main.js); un nome vietato diventa «Pilota»
    el._confermaNome = () => { const n = pulisciNome(inp.value) || 'Pilota'; chiudi(vietatoSubito(n) ? 'Pilota' : n); };
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); fine(); } };
    ok.onclick = fine;
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  });
}
