// Pannello «Novità» (21-11-2026): le sezioni di CHANGELOG.md, scritte per chi gioca. Si apre da solo una volta dopo ogni
// aggiornamento (localStorage `cubo-corse-novita` = ultima versione vista), e sempre dal pulsante in alto nel menu.
import { VERSIONE } from '../versione.js';

const VISTA = 'cubo-corse-novita';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

/** markdown semplice del changelog → [{ titolo, html }] per versione (## …), più l'introduzione */
export function sezioni(md) {
  const out = []; let cur = { titolo: '', righe: [] };
  for (const l of md.split('\n')) {
    if (/^# /.test(l)) continue;
    if (/^## /.test(l)) { out.push(cur); cur = { titolo: l.slice(3).trim(), righe: [] }; } else cur.righe.push(l);
  }
  out.push(cur);
  return out.map(({ titolo, righe }) => {
    let html = '', lista = false, par = [];
    const chiudiPar = () => { if (par.length) { html += `<p>${inline(par.join(' '))}</p>`; par = []; } };
    const chiudiLista = () => { if (lista) { html += '</ul>'; lista = false; } };
    for (const l of righe) {
      if (/^### /.test(l)) { chiudiPar(); chiudiLista(); html += `<h4>${inline(l.slice(4))}</h4>`; }
      else if (/^- /.test(l)) { chiudiPar(); if (!lista) { html += '<ul>'; lista = true; } html += `<li>${inline(l.slice(2))}`; }
      else if (/^\s+\S/.test(l) && lista) html += ' ' + inline(l.trim());
      else if (!l.trim()) { chiudiPar(); chiudiLista(); }
      else { chiudiLista(); par.push(l.trim()); }
    }
    chiudiPar(); chiudiLista();
    return { titolo, html: html.replace(/<li>/g, '</li><li>').replace(/<ul><\/li>/g, '<ul>').replace(/<\/ul>/g, '</li></ul>') };
  }).filter((s) => s.titolo || s.html);
}

/** riempie el con le novità: la versione attuale in evidenza, quelle prima sotto */
export async function mostraNovita(el) {
  let md = '';
  try { md = await (await fetch('CHANGELOG.md', { cache: 'no-cache' })).text(); } catch { el.innerHTML = '<p>Novità non disponibili.</p>'; return; }
  const S = sezioni(md), intro = S.find((s) => !s.titolo), ver = S.filter((s) => s.titolo);
  const pre = VERSIONE.endsWith('-pre'), base = VERSIONE.replace(/-pre$/, '');
  const titolo = (t) => (/^Non ancora pubblicato/.test(t) ? `${base} · in arrivo` : t);
  // in una versione «-pre» la sezione in arrivo è quella attuale; altrimenti quella che comincia con il numero
  const att = ver.findIndex((s) => (pre ? /^Non ancora pubblicato/.test(s.titolo) : s.titolo.startsWith(base)));
  const lista = ver.filter((s, i) => i === att || (!/^Non ancora pubblicato/.test(s.titolo) && i > att));
  el.innerHTML = (intro ? `<div class="nov-intro">${intro.html}</div>` : '') + lista.map((s, i) =>
    `<details class="nov-ver" ${i === 0 ? 'open' : ''}><summary>${esc(titolo(s.titolo))}</summary>${s.html}</details>`).join('');
}

/** la versione è nuova per questo browser? (e da ora risulta vista) */
export function novitaDaMostrare() {
  let vista = null;
  try { vista = localStorage.getItem(VISTA); localStorage.setItem(VISTA, VERSIONE); } catch { return false; }
  return vista !== VERSIONE;
}
