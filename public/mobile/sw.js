// Cubo Corse sul telefono (fase 2d, 22-11-2026): il telefono tiene i file del gioco, così si apre anche senza rete e i
// pacchetti delle piste (7 MB l'uno) non si riscaricano a ogni partita.
// - codice e dati piccoli (html, js, css, json, md): prima la rete, la copia solo se la rete non c'è → gli aggiornamenti
//   arrivano subito;
// - file grossi (pacchetti delle piste, three.js, font, icone, modelli): prima la copia → niente download ripetuti;
// - il nome della cache porta la versione del gioco (sw.js?v=…, la passa main.js da src/versione.js): a ogni nuova versione
//   il service worker è un altro, si installa da solo e butta le copie vecchie, poi il gioco mostra le Novità.
const VER = new URL(self.location).searchParams.get('v') || 'x';
// la cartella fa parte del nome: due copie del gioco sullo stesso sito (/ e /mobile) non si cancellano le copie a vicenda
const CARTELLA = new URL(self.registration ? self.registration.scope : self.location).pathname.replace(/[^a-z0-9]+/gi, '-');
const PREFISSO = `cubo-corse${CARTELLA}`;
const CACHE = `${PREFISSO}${VER}`;
const GROSSI = /\/(cs\/pacchetti|vendor|fonts|icone|modelli)\/|\.(bin|glb|gltf|png|jpg|jpeg|webp|woff2|ktx2|mp3|ogg|wav)$/i;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './style.css', './manifest.webmanifest']).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFISSO) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // font di Google, classifica: niente copia
  if (url.searchParams.has('misura')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (GROSSI.test(url.pathname)) {
      const c = await cache.match(req);
      if (c) return c;
      const r = await fetch(req);
      if (r.ok) cache.put(req, r.clone()).catch(() => {});
      return r;
    }
    try {
      const r = await fetch(req, { cache: 'no-cache' });     // 27-11: chiede sempre al sito se il file è cambiato (niente copie vecchie di 10 min)
      if (r.ok) cache.put(req, r.clone()).catch(() => {});
      return r;
    } catch (err) {
      const c = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (c) return c;
      throw err;
    }
  })());
});
