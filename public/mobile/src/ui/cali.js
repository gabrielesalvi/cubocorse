// Registro dei cali di fotogrammi (24-11-2026, Gabriele: «non è lag costante ma calo del framerate che passa da 50+ a
// sotto i 20 qualche volta», soprattutto vicino alle tribune). Con ?fps=1 (o ?cali=1), durante la gara:
//  - ogni mezzo secondo una «finestra»: fps, fotogramma peggiore, tempo JavaScript (fisica+IA, disegno, resto), tempo della
//    scheda video (EXT_disjoint_timer_query_webgl2, se il browser lo dà), chiamate e triangoli dell'ultimo fotogramma, punto
//    della pista, shader nuovi, auto ammaccate;
//  - un CALO = finestra sotto il 70% degli fps normali (mediana delle ultime 20 finestre buone). Finestre di calo di fila =
//    un episodio. All'inizio di ogni episodio una «fotografia» della scena per parti (pubblico, edifici, auto, alberi…,
//    vista e ombre separate), da confrontare con l'ultima fotografia fatta a fps normali (ogni 5 s): così si vede cosa
//    cresce nel calo;
//  - tasto K o uscita dalla gara: tabella, pulsante Copia, e i dati partono verso claw06 (POST misura con tipo «cali»;
//    arriva solo dalla copia su Tailscale, dal sito pubblico si copia).
// Costo: una fotografia ogni 5 s (giro della scena, qualche ms); il resto è trascurabile. Senza ?fps=1 non c'è niente.
import { dispositivo } from './misura.js';
import { VERSIONE } from '../versione.js';

const FINESTRA = 0.5;        // s
const SOGLIA = 0.7;          // calo: sotto il 70% degli fps normali
const FOTO_OGNI = 5;         // s fra due fotografie a fps normali
const MAX_EPISODI = 60;
const CHIAVE = 'cubo-corse-cali';
const $id = (id) => document.getElementById(id);
const mediana = (a) => { if (!a.length) return 0; const o = [...a].sort((x, y) => x - y); return o[Math.floor(o.length / 2)]; };
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

export class RegistroCali {
  constructor(app) {
    this.app = app;
    this.gpu = null;          // { gl, ext, attesa: [query], attiva }
    this.batteria = null;
    try { navigator.getBattery?.().then((b) => { this.batteria = b; }).catch(() => {}); } catch { /* niente */ }
    addEventListener('keydown', (e) => { if (e.code === 'KeyK' && !e.repeat && !(e.target && /INPUT|SELECT/.test(e.target.tagName))) this.alterna(); });
    this.daCapo();
  }

  daCapo() {
    this.F = null; this.buone = []; this.dts = []; this.episodi = []; this.ep = null; this.foto = null; this.fotoBuona = null;
    this.prossimaFoto = 0; this.inizio = null; this.ammaccate = 0; this.finestre = 0; this.R = null; this.gpuAcc = { ms: 0, n: 0 };
    this.somme = { n: 0, cpu: 0, fis: 0, dis: 0, gpu: 0, gn: 0, ch: 0, tri: 0 };   // 25-11: medie di tutto il giro
  }

  // ------------------------------------------------------------------ prima e dopo ogni fotogramma
  attivo() { const a = this.app; return a.mode === 'race' && !a.paused && !a.photo && a.race && a.mondo; }

  prima() {
    if (!this.attivo()) return;
    const W = this.app.mondo, R = W.r || W.renderer?.r;
    if (R !== this.R) { this.R = R; this.gpu = null; this.programmi = R?.info.programs?.length || 0; this._timer(R); }
    if (this.gpu && !this.gpu.attiva) {
      const { gl, ext } = this.gpu, q = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q); this.gpu.attiva = q;
    }
    if (this.vuoleFoto) { this.vuoleFoto = false; this.foto = this._aggancia(W); }
  }

  dopo(now, cpu) {
    const a = this.app;
    if (this.gpu?.attiva) { const { gl, ext } = this.gpu; gl.endQuery(ext.TIME_ELAPSED_EXT); this.gpu.attesa.push(this.gpu.attiva); this.gpu.attiva = null; }
    if (this.foto?.hook) this._sgancia(this.foto);
    this._leggiGpu();
    if (!this.attivo() || !a.race.started) { this.ultimo = null; return; }
    const dt = this.ultimo == null ? null : now - this.ultimo;
    this.ultimo = now;
    if (dt == null || dt > 5000 || document.hidden) return;   // primo fotogramma o pagina rimasta in secondo piano
    if (this.inizio == null) { this.inizio = a.raceClock; this.ammaccate = 0; }
    if (this.dts.length < 30000) this.dts.push(dt);
    const F = this.F || (this.F = { t: 0, n: 0, max: 0, cpu: 0, fis: 0, dis: 0 });
    F.t += dt / 1000; F.n++; F.max = Math.max(F.max, dt); F.cpu += cpu; F.fis += a._msFis || 0; F.dis += a._msDis || 0;
    if (F.t >= FINESTRA) { this.F = null; this._chiudi(F); }
  }

  // ------------------------------------------------------------------ finestre ed episodi
  _chiudi(F) {
    const a = this.app, R = this.R, P = a.player, T = a.track;
    this.finestre++;
    const fps = F.n / F.t, rif = mediana(this.buone.slice(-20));
    const prog = R?.info.programs?.length || 0, nuovi = Math.max(0, prog - this.programmi); this.programmi = prog;
    const f = {
      t: r1(a.raceClock - this.inizio), fps: r1(fps), peggiore: Math.round(F.max), intervallo: r1(1000 * F.t / F.n),
      cpu: r1(F.cpu / F.n), fis: r1(F.fis / F.n), dis: r1(F.dis / F.n), gpu: this.gpuAcc.n ? r1(this.gpuAcc.ms / this.gpuAcc.n) : null,
      chiamate: R?.info.render.calls ?? null, tri: R ? Math.round(R.info.render.triangles / 1000) : null,
      s: Math.round(P.proj?.s ?? 0), giro: T?.length ? Math.round(100 * ((P.proj?.s ?? 0) % T.length) / T.length) : null,
      shader: nuovi, ammaccate: this.ammaccate, visuale: a.rig?.mode || '',
    };
    this.ammaccate = 0; this.gpuAcc = { ms: 0, n: 0 };
    const S = this.somme; S.n++; S.cpu += f.cpu; S.fis += f.fis; S.dis += f.dis; S.ch += f.chiamate || 0; S.tri += f.tri || 0;
    if (f.gpu != null) { S.gpu += f.gpu; S.gn++; }
    const calo = this.buone.length >= 6 && fps < SOGLIA * rif;
    if (!calo) {
      this.buone.push(fps); if (this.buone.length > 60) this.buone.shift();
      if (this.ep) { this._fineEpisodio(); }
      if (a.raceClock >= this.prossimaFoto) { this.prossimaFoto = a.raceClock + FOTO_OGNI; this.vuoleFoto = true; this._fotoPer = 'buona'; }
      return;
    }
    if (!this.ep) {
      this.ep = { inizio: f.t, rif: r1(rif), finestre: [], primaFoto: this.fotoBuona };
      this.vuoleFoto = true; this._fotoPer = 'calo';
    }
    this.ep.finestre.push(f);
  }

  _fineEpisodio() {
    const e = this.ep; this.ep = null;
    const W = e.finestre, med = (k) => r1(W.reduce((s, x) => s + (x[k] ?? 0), 0) / W.length), peg = W.reduce((m, x) => (x.fps < m.fps ? x : m), W[0]);
    const gpuNote = W.filter((x) => x.gpu != null);
    const ep = {
      t: e.inizio, durata: r1(W.length * FINESTRA), rif: e.rif, fpsMin: peg.fps, fps: med('fps'), peggiore: Math.max(...W.map((x) => x.peggiore)),
      intervallo: med('intervallo'), cpu: med('cpu'), fis: med('fis'), dis: med('dis'), gpu: gpuNote.length ? r1(gpuNote.reduce((s, x) => s + x.gpu, 0) / gpuNote.length) : null,
      chiamate: peg.chiamate, tri: peg.tri, s: W[0].s, sFine: W.at(-1).s, giro: W[0].giro, visuale: W[0].visuale,
      shader: W.reduce((s, x) => s + x.shader, 0), ammaccate: W.reduce((s, x) => s + x.ammaccate, 0),
      foto: e.foto || null, primaFoto: e.primaFoto || null,
    };
    ep.colpa = colpa(ep);
    ep.cresce = cresce(ep.primaFoto, ep.foto);
    this.episodi.push(ep);
    if (this.episodi.length > MAX_EPISODI) { this.episodi.sort((x, y) => x.fpsMin - y.fpsMin); this.episodi.length = MAX_EPISODI; this.episodi.sort((x, y) => x.t - y.t); }
    this._contatore();
  }

  _contatore() {
    const el = $id('fpsbox'); if (!el) return;
    el.dataset.cali = this.episodi.length ? `${this.episodi.length} cali · K` : '';
  }

  /** un'auto si è ammaccata (carmodel._remesh): conta per la finestra */
  ammaccata() { this.ammaccate++; }

  // ------------------------------------------------------------------ tempo della scheda video
  _timer(R) {
    try {
      const gl = R?.getContext(), ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (ext) { this.gpu = { gl, ext, attesa: [], attiva: null }; gl.getParameter(ext.GPU_DISJOINT_EXT); }
    } catch { this.gpu = null; }
  }

  _leggiGpu() {
    const G = this.gpu; if (!G) return;
    const { gl, ext } = G;
    while (G.attesa.length) {
      const q = G.attesa[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      G.attesa.shift();
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT), rotto = gl.getParameter(ext.GPU_DISJOINT_EXT);
      gl.deleteQuery(q);
      if (!rotto) { this.gpuAcc.ms += ns / 1e6; this.gpuAcc.n++; }   // risultati di 1-3 fotogrammi fa: vanno alla finestra in corso
    }
    if (G.attesa.length > 20) { G.attesa.splice(0, G.attesa.length - 20).forEach((q) => gl.deleteQuery(q)); }
  }

  // ------------------------------------------------------------------ fotografia della scena per parti
  _aggancia(W) {
    const a = this.app, scena = W.scene, cat = new Map(), hook = [];
    const auto = new Set((a.visuals || []).map((v) => v && v.group).filter(Boolean));
    if (a.ghost?.group) auto.add(a.ghost.group);
    const nome = (o) => {
      let x = o, proprio = o.name || '';
      for (let y = o; y; y = y.parent) if (auto.has(y)) return 'auto';
      while (x && x.parent) { if (!proprio && x.name && x.name !== 'mondo') proprio = x.name; if (x.parent === scena || x.parent.name === 'mondo') break; x = x.parent; }
      const top = x?.name || x?.type || '?';
      return proprio && proprio !== top ? `${top} / ${proprio}` : top;
    };
    const conta = (k, o, g, gr, ombra) => {
      const e = cat.get(k) || cat.set(k, { c: 0, t: 0, co: 0, to: 0 }).get(k);
      const n = g.index ? g.index.count : (g.attributes.position?.count || 0), dr = gr ? gr.count : Math.min(n, g.drawRange.count);
      const tri = (Number.isFinite(dr) ? dr : n) / 3 * (o.isInstancedMesh ? o.count : 1);
      if (ombra) { e.co++; e.to += tri; } else { e.c++; e.t += tri; }
    };
    scena.traverse((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
      const k = nome(o);
      const pr = Object.prototype.hasOwnProperty.call(o, 'onBeforeRender') ? o.onBeforeRender : undefined;
      const ps = Object.prototype.hasOwnProperty.call(o, 'onBeforeShadow') ? o.onBeforeShadow : undefined;
      const br = o.onBeforeRender, bs = o.onBeforeShadow;
      o.onBeforeRender = function (r, s, c, g, m, gr) { conta(k, o, g, gr, false); return br.call(this, r, s, c, g, m, gr); };
      if (!o.isBatchedMesh) o.onBeforeShadow = function (r, ob, c, sc, g, dm, gr) { conta(k, o, g, gr, true); return bs.call(this, r, ob, c, sc, g, dm, gr); };
      hook.push([o, pr, ps]);
    });
    return { hook, cat };
  }

  _sgancia(F) {
    for (const [o, pr, ps] of F.hook) {
      if (pr === undefined) delete o.onBeforeRender; else o.onBeforeRender = pr;
      if (ps === undefined) delete o.onBeforeShadow; else o.onBeforeShadow = ps;
    }
    const parti = [...F.cat].map(([k, v]) => ({ k, c: v.c, t: Math.round(v.t / 1000), co: v.co, to: Math.round(v.to / 1000) }))
      .filter((x) => x.c || x.co).sort((x, y) => (y.t + y.to) - (x.t + x.to));
    const foto = { parti: parti.slice(0, 14), s: Math.round(this.app.player.proj?.s ?? 0) };
    F.hook = null;
    if (this._fotoPer === 'calo' && this.ep) this.ep.foto = foto;
    else this.fotoBuona = foto;
  }

  // ------------------------------------------------------------------ resoconto
  riassunto() {
    const ord = [...this.dts].sort((x, y) => x - y), tot = this.dts.reduce((s, x) => s + x, 0);
    const R = this.R, c = R?.domElement, b = this.batteria;
    return {
      tipo: 'cali', quando: new Date().toISOString(), versione: VERSIONE, prova: prova(),
      pista: this.app.pistaId?.() || this.app.settings.track, qual: this.app.settings.qual,
      // 25-11 (tabella dell'iPhone: «auto», 22 fps costanti, nessun calo = nessun dettaglio): la qualità davvero in uso,
      // la frequenza dello schermo, il tetto a 60 e le medie di tutto il giro anche quando i cali non ci sono
      qualEffettiva: this.app.mondo?.qk || this.app.mondo?.renderer?.qKey || null, hz: this.app.hz || null,
      tetto60: (this.app._tetto?.ogni || 1) > 1,
      medie: (() => { const S = this.somme, m = (x) => (S.n ? r1(x / S.n) : null);
        return { cpu: m(S.cpu), fis: m(S.fis), dis: m(S.dis), gpu: S.gn ? r1(S.gpu / S.gn) : null, chiamate: S.n ? Math.round(S.ch / S.n) : null, tri: S.n ? Math.round(S.tri / S.n) : null }; })(),
      secondi: r1(tot / 1000), fps: ord.length ? r1(1000 * ord.length / tot) : null, fps1: ord.length ? r1(1000 / ord[Math.floor(ord.length * 0.99)]) : null,
      peggiore: Math.round(ord.at(-1) || 0), fpsNormali: r1(mediana(this.buone)),
      risoluzione: c ? `${c.width}×${c.height}` : '', pr: R ? r1(R.getPixelRatio()) : null, timerGpu: !!this.gpu,
      corrente: b ? (b.charging ? 'in carica' : `a batteria ${Math.round(b.level * 100)}%`) : null,
      dispositivo: dispositivo(), episodi: this.episodi,
    };
  }

  alterna() { if ($id('cali')) $id('cali').remove(); else this.mostra(); }

  /** tabella; `invia` = manda anche a claw06 (all'uscita dalla gara) */
  mostra(invia = false) {
    if (this.ep) this._fineEpisodio();
    const d = this.riassunto();
    try { localStorage.setItem(CHIAVE, JSON.stringify(d)); } catch { /* niente */ }
    let el = $id('cali');
    if (!el) { el = document.createElement('div'); el.id = 'cali'; document.body.appendChild(el); }
    el.style.cssText = 'position:fixed;inset:0;z-index:210;display:flex;align-items:center;justify-content:center;font:13px/1.35 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.35)';
    const testo = testoCali(d);
    const righe = d.episodi.map((e) => `<tr><td>${tempo(e.t)}</td><td>${e.s} m (${e.giro}%)</td><td>${e.durata} s</td><td><b>${e.fpsMin}</b> / ${e.rif}</td>
      <td>${e.cpu} ms <span style="color:#999">(${e.fis}+${e.dis})</span></td><td>${e.gpu ?? '—'}${e.gpu != null ? ' ms' : ''}</td><td>${e.chiamate} · ${e.tri} k</td>
      <td>${e.colpa}</td><td>${e.cresce || '—'}${e.shader ? ` · ${e.shader} shader nuovi` : ''}${e.ammaccate ? ` · ${e.ammaccate} ammaccate` : ''}</td></tr>`).join('');
    el.innerHTML = `<div style="background:rgba(10,12,16,.95);border:1px solid #ffd23f;border-radius:12px;padding:14px 16px;max-width:min(96vw,1100px);max-height:90vh;overflow:auto">
      <div style="font-weight:700;color:#ffd23f;font-size:16px">Registro dei cali · ${d.pista} · qualità ${d.qual}${d.qualEffettiva && d.qualEffettiva !== d.qual ? ' → ' + d.qualEffettiva : ''}</div>
      <div style="margin:4px 0 8px;color:#ccc">${d.secondi} s di gara · fps medi ${d.fps} · normali ${d.fpsNormali} · 1% lenti ${d.fps1} · peggiore ${d.peggiore} ms ·
        ${d.risoluzione} (scala ${d.pr})${d.corrente ? ` · ${d.corrente}` : ''} · tempo scheda video ${d.timerGpu ? 'misurato' : 'non disponibile in questo browser'}</div>
      ${d.medie?.cpu != null ? `<div style="margin:0 0 8px;color:#ccc">media del giro: CPU ${d.medie.cpu} ms (${d.medie.fis}+${d.medie.dis}) · scheda video ${d.medie.gpu ?? '—'}${d.medie.gpu != null ? ' ms' : ''} · ${d.medie.chiamate} chiamate · ${d.medie.tri} k triangoli${d.hz ? ` · schermo ${d.hz} Hz${d.tetto60 ? ', tetto a 60 fps' : ''}` : ''}</div>` : ''}
      ${d.episodi.length ? `<table style="border-collapse:collapse" cellpadding="3"><tr style="color:#aaa;text-align:left"><td>quando</td><td>dove</td><td>durata</td><td>fps min / normali</td>
        <td>CPU JS (fisica+disegno)</td><td>scheda video</td><td>chiamate · triangoli</td><td>colpa</td><td>cosa cresce rispetto a prima</td></tr>${righe}</table>` : '<p>Nessun calo finora.</p>'}
      <div style="margin-top:8px;color:#aaa;font-size:12px">${d.dispositivo.gpu}</div>
      <div id="cali-stato" style="margin-top:6px"></div>
      <div style="margin-top:10px;display:flex;gap:8px"><button id="cali-copia" style="font:600 14px system-ui;padding:7px 12px;border-radius:8px;border:0;background:#ffd23f">Copia</button>
        <button id="cali-chiudi" style="font:600 14px system-ui;padding:7px 12px;border-radius:8px;border:1px solid #888;background:none;color:#fff">Chiudi (K)</button></div></div>`;
    $id('cali-chiudi').onclick = () => el.remove();
    $id('cali-copia').onclick = async () => {
      try { await navigator.clipboard.writeText(testo + '\n\n' + JSON.stringify(d)); $id('cali-stato').textContent = '📋 Copiato: incollalo in chat.'; }
      catch { $id('cali-stato').textContent = '⚠️ Non riesco a copiare: fai uno screenshot.'; }
    };
    if (invia && d.episodi.length) {
      fetch('misura', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
        .then((r) => { if (r.ok && $id('cali-stato')) $id('cali-stato').textContent = '✅ Arrivato a claw06.'; }).catch(() => {});
    }
  }

  /** uscita dalla gara: tabella se c'è stato qualcosa, poi da capo */
  fineGara() {
    if (this.ep) this._fineEpisodio();
    if (this.dts.length > 120) this.mostra(true);
    this.daCapo(); this._contatore();
  }
}

const tempo = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** chi ha tenuto fermo il fotogramma */
function colpa(e) {
  const iv = e.intervallo || 0;
  if (e.gpu != null) {
    if (e.gpu > 0.75 * iv) return 'scheda video';
    if (e.cpu > 0.6 * iv) return e.fis > e.dis ? 'processore (fisica)' : 'processore (disegno)';
    return 'altro (browser, sistema)';
  }
  if (e.cpu > 0.6 * iv) return e.fis > e.dis ? 'processore (fisica)' : 'processore (disegno)';
  return 'scheda video o sistema';
}

/** le parti della scena che crescono di più fra la fotografia normale e quella del calo */
function cresce(prima, dopo) {
  if (!dopo) return '';
  const p = new Map((prima?.parti || []).map((x) => [x.k, x]));
  const d = dopo.parti.map((x) => { const y = p.get(x.k) || { t: 0, to: 0, c: 0, co: 0 }; return { k: x.k, dt: x.t - y.t, dto: x.to - y.to, dc: x.c + x.co - y.c - y.co, t: x.t, to: x.to }; })
    .sort((x, y) => (y.dt + y.dto) - (x.dt + x.dto)).filter((x) => x.dt + x.dto > 20).slice(0, 3);
  return d.map((x) => `${x.k.replace(/^scenario \/ /, '')} +${x.dt + x.dto} k tri${x.dto > 20 ? ` (ombre +${x.dto})` : ''}`).join(', ');
}

/** parametri di prova nell'indirizzo (tutti tranne fps/cali), per sapere con cosa è stata fatta una tabella */
function prova() {
  return [...new URLSearchParams(globalThis.location?.search || '')].filter(([k]) => k !== 'fps' && k !== 'cali').map(([k, v]) => `${k}=${v}`).join('&');
}

function testoCali(d) {
  const M = d.medie || {};
  const r = [`Cali · ${d.pista} · ${d.qual}${d.qualEffettiva && d.qualEffettiva !== d.qual ? ' → ' + d.qualEffettiva : ''}${d.prova ? ' [' + d.prova + ']' : ''} · ${d.secondi} s · fps medi ${d.fps}, normali ${d.fpsNormali}, 1% ${d.fps1} · ${d.risoluzione} · ${d.corrente || ''} · ${d.dispositivo.gpu}`];
  if (M.cpu != null) r.push(`media del giro: CPU ${M.cpu} (${M.fis}+${M.dis}), GPU ${M.gpu ?? '—'}, ${M.chiamate} ch ${M.tri} k tri${d.hz ? ` · schermo ${d.hz} Hz${d.tetto60 ? ', tetto a 60' : ''}` : ''}`);
  for (const e of d.episodi) r.push(`${tempo(e.t)} ${e.s} m (${e.giro}%) ${e.durata} s: ${e.fpsMin}/${e.rif} fps, CPU ${e.cpu} (${e.fis}+${e.dis}), GPU ${e.gpu ?? '—'}, ${e.chiamate} ch ${e.tri} k tri, ${e.colpa}; ${e.cresce || ''}`);
  return r.join('\n');
}
