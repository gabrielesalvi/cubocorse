// Strumenti di prova da dentro il gioco (25-11-2026). Il tester su iPhone: dall'app sulla schermata Home `?fps=1` e
// `?misura=1` si perdono (l'app parte sempre da ./?app=1, il manifest) e su iPhone l'app ha una memoria sua, separata da
// Safari. Qui si accendono con 5 tocchi sul logo del menu e restano in localStorage (main.js li legge all'avvio come se
// fossero nell'indirizzo): registro dei cali acceso finché non si spegne, misura delle prestazioni una volta sola.

const CHIAVE = 'cubo-corse-prove';
const CHIAVE_MISURA = 'cubo-corse-misura';   // stato della misura (ui/misura.js)

export function leggiProve() {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || '{}') || {}; } catch { return {}; }
}
function scriviProve(o) { try { localStorage.setItem(CHIAVE, JSON.stringify(o)); } catch { /* niente */ } }

/** la misura è finita o fermata: all'avvio successivo non riparte */
export function togliMisura() { const o = leggiProve(); if (o.misura) { delete o.misura; scriviProve(o); } }

/** 5 tocchi di fila sul logo del menu aprono il pannello. `cali(on)` accende o spegne il registro subito */
export function preparaProve({ cali }) {
  const logo = document.querySelector('#menu header .logo');
  if (!logo) return;
  let n = 0, prec = 0;
  // si contano i tocchi (pointerdown), non i click: tocchi rapidi di fila il browser li può prendere per un doppio tocco.
  // Valgono se fra uno e l'altro passa meno di 1,5 s
  logo.addEventListener('pointerdown', () => {
    const t = performance.now();
    if (t - prec > 1500) n = 0;
    prec = t;
    if (++n >= 5) { n = 0; apri(cali); }
  });
}

function apri(cali) {
  document.getElementById('prove')?.remove();
  const el = document.createElement('div'); el.id = 'prove';
  el.style.cssText = 'position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);font:14px/1.4 system-ui,sans-serif;color:#fff';
  const bottone = 'font:600 14px system-ui;padding:8px 12px;border-radius:8px;border:0;background:#ffd23f;color:#000';
  const secondario = 'font:600 14px system-ui;padding:8px 12px;border-radius:8px;border:1px solid #888;background:none;color:#fff';
  const disegna = () => {
    const o = leggiProve(), registro = o.fps === '1';
    el.innerHTML = `<div style="background:rgba(10,12,16,.96);border:1px solid #ffd23f;border-radius:12px;padding:16px 18px;max-width:min(92vw,460px)">
      <div style="font-weight:700;color:#ffd23f;font-size:17px;margin-bottom:8px">Strumenti di prova</div>
      <p style="margin:0 0 6px"><b>Registro dei cali</b>: ${registro ? 'acceso' : 'spento'}. Da acceso, a fine gara (o tornando al menu)
        compare la tabella da copiare.</p>
      <button id="prove-cali" style="${registro ? secondario : bottone}">${registro ? 'Spegni il registro' : 'Accendi il registro'}</button>
      <p style="margin:14px 0 6px"><b>Misura delle prestazioni</b>: l'IA guida da sola su tutte le piste, alla fine una tabella da copiare.
        ${o.misura ? 'È già programmata o in corso.' : ''}</p>
      ${o.misura ? `<button id="prove-misura-ferma" style="${secondario}">Ferma la misura</button>` : `<button id="prove-misura" style="${bottone}">Avvia la misura</button>`}
      <div style="margin-top:16px;text-align:right"><button id="prove-chiudi" style="${secondario}">Chiudi</button></div></div>`;
    el.querySelector('#prove-chiudi').onclick = () => el.remove();
    el.querySelector('#prove-cali').onclick = () => {
      const p = leggiProve();
      if (p.fps === '1') delete p.fps; else p.fps = '1';
      scriviProve(p); cali(p.fps === '1'); disegna();
    };
    const via = el.querySelector('#prove-misura');
    if (via) via.onclick = () => {
      const p = leggiProve(); p.misura = '1'; scriviProve(p);
      try { localStorage.removeItem(CHIAVE_MISURA); } catch { /* niente */ }   // una misura nuova, non la ripresa di una vecchia
      location.reload();
    };
    const ferma = el.querySelector('#prove-misura-ferma');
    if (ferma) ferma.onclick = () => { togliMisura(); disegna(); };
  };
  disegna();
  document.body.appendChild(el);
}
