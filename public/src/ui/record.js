// Record e storico, salvati nel browser (localStorage).
// - Record: i 10 giri migliori per pista (con la versione) × modalità (gara | time trial) × tipo di comando (tastiera |
//   controller), con le iniziali (3 lettere) come ai cabinati. Non per modello di guida, sterzo o fisica (decisione del
//   17-11, fase 0). Valgono solo i giri puliti (niente uscite con 4 ruote fuori, niente rimesse in pista).
// - Storico: le ultime 50 gare.
// Fase 0 (20-11): chiave nuova (v2). I record di prima (v1, pista × fisica, tutti da tastiera) passano in «gara · tastiera».

const KEY = 'cubo-corse-record-v2', KEY_V1 = 'cubo-corse-record-v1';
const MAX_BOARD = 10, MAX_STORICO = 50;
const LETTERE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-* ';
export const MODI = { arcade: 'Arcade', realistica: 'Realistica' };
export const MODALITA = { gara: 'Gara', tempo: 'Time trial' };
export const COMANDI = { tastiera: 'Tastiera', controller: 'Controller' };
/** categoria di un record: modalità e tipo di comando */
export const categoria = (modo, comando) => `${modo === 'tempo' ? 'tempo' : 'gara'}|${comando === 'controller' ? 'controller' : 'tastiera'}`;
export const nomeCategoria = (cat) => { const [m, c] = cat.split('|'); return `${MODALITA[m] || m} · ${(COMANDI[c] || c).toLowerCase()}`; };

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
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { const m = migraV1(); if (m) { save(m); return m; } }
    const d = JSON.parse(raw || '{}');
    return { boards: d.boards || {}, storico: d.storico || [], ultimoNome: d.ultimoNome || 'AAA' };
  } catch {
    return { boards: {}, storico: [], ultimoNome: 'AAA' };
  }
}
function save(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* spazio pieno o storage bloccato: pazienza */ }
}
const chiave = (pista, cat) => `${pista}|${cat || 'gara|tastiera'}`;

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
export function ultimoNome() {
  return load().ultimoNome;
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
    <td class="r">${ord[i]}</td><td class="n">${esc(r.nome)}</td><td class="t">${fmt(r.tempo)}</td>
    <td class="a">${esc(r.auto || '')}</td><td class="m" title="${esc(r.meteo || '')}">${METEO_ICONA[r.meteo] || ''}</td><td class="d">${esc((r.data || '').slice(0, 10))}</td></tr>`).join('')}</table>`;
}

export function htmlStorico(lista, nomiPiste) {
  if (!lista.length) return '<p class="rec-vuoto">Nessuna gara ancora.</p>';
  return `<table class="rec-tab storico"><tr><th>Data</th><th>Pista</th><th>Comandi</th><th>Giri</th><th>Avversari</th><th>Pos.</th><th>Tempo</th><th>Giro migliore</th><th>Auto</th></tr>${lista.map((g) => `<tr>
    <td>${esc((g.data || '').replace('T', ' ').slice(0, 16))}</td><td>${esc(nomiPiste[g.pista] || g.pista)}</td><td>${esc(COMANDI[g.comando] || MODI[g.fisica] || g.fisica || '')}</td>
    <td>${g.giri}</td><td>${esc(g.tipo === 'tempo' ? 'time trial' : g.diff)}</td><td class="r">${g.tipo === 'tempo' ? 'TT' : g.pos === 'RIT' ? 'RIT' : g.pos + '°'}</td><td>${g.tipo === 'tempo' ? '—' : fmt(g.tempo)}${g.pen ? ` <span class="pen">(+${g.pen} s)</span>` : ''}</td>
    <td>${fmt(g.best)}${g.bestValido === false ? ' <span class="pen" title="nessun giro pulito">*</span>' : ''}</td><td>${esc(g.auto)}</td></tr>`).join('')}</table>`;
}

/**
 * Inserimento delle iniziali da cabinato dentro `el`: ↑↓ cambiano lettera, ←→ spostano, si può anche digitare;
 * Invio conferma. Ritorna una Promise con le 3 lettere.
 */
export function chiediIniziali(el, titolo, iniziali = 'AAA') {
  return new Promise((resolve) => {
    let nome = (iniziali + '   ').slice(0, 3).toUpperCase().split('').map((c) => (LETTERE.includes(c) ? c : 'A'));
    let cur = 0;
    const draw = () => {
      el.innerHTML = `<div class="arcade"><div class="arc-tit">${titolo}</div>
        <div class="arc-nome">${nome.map((c, i) => `<span class="${i === cur ? 'cur' : ''}">${c === ' ' ? '_' : esc(c)}</span>`).join('')}</div>
        <div class="arc-aiuto">↑ ↓ lettera · ← → posizione · oppure scrivi · <b>Invio</b> per confermare</div>
        <button class="go arc-ok">OK</button></div>`;
      el.querySelector('.arc-ok').onclick = fine;
      el.querySelectorAll('.arc-nome span').forEach((sp, i) => { sp.onclick = () => { cur = i; draw(); }; });
    };
    const giro = (d) => {
      const k = LETTERE.indexOf(nome[cur]);
      nome[cur] = LETTERE[(k + d + LETTERE.length) % LETTERE.length];
    };
    const onKey = (e) => {
      const c = e.key;
      if (c === 'ArrowUp') giro(-1);
      else if (c === 'ArrowDown') giro(1);
      else if (c === 'ArrowLeft') cur = Math.max(0, cur - 1);
      else if (c === 'ArrowRight') cur = Math.min(2, cur + 1);
      else if (c === 'Backspace') { cur = Math.max(0, cur - 1); nome[cur] = ' '; }
      else if (c === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); fine(); return; }
      else if (c.length === 1 && LETTERE.includes(c.toUpperCase())) { nome[cur] = c.toUpperCase(); cur = Math.min(2, cur + 1); }
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
      draw();
    };
    function fine() {
      removeEventListener('keydown', onKey, true);
      const n = nome.join('').trimEnd() || 'AAA';
      resolve(n);
    }
    addEventListener('keydown', onKey, true);
    draw();
  });
}
