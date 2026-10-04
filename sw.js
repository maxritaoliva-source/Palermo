// Service worker: l'app si apre anche senza connessione (le tile della mappa
// già visualizzate restano in cache; la ricerca di nuovi indirizzi richiede rete).
const CACHE = 'palermo-itinerario-v7';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
// Librerie della mappa: salvate subito, così la pagina funziona offline anche al primo riavvio
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers.png',
  'https://unpkg.com/leaflet@1.9.4/dist/images/layers-2x.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(async (c) => {
        // Un file mancante (es. icona) non deve bloccare l'installazione
        await Promise.all(SHELL.map((u) =>
          fetch(u, { cache: 'reload' }).then((res) => (res && res.ok ? c.put(u, res) : null)).catch(() => null)
        ));
        // Una libreria non scaricabile non deve bloccare l'installazione
        await Promise.all(CDN.map((u) =>
          fetch(u).then((res) => (res && res.ok ? c.put(u, res) : null)).catch(() => null)
        ));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('nominatim')) return;           // ricerche indirizzi: sempre in rete
  if (url.pathname.indexOf('/api/') !== -1) return;         // sincronizzazione: mai in cache
  const isTile = url.hostname.endsWith('tile.openstreetmap.org');
  e.respondWith(
    fetch(req)
      .then((res) => {
        // Si salvano solo risposte riuscite: mai tile in errore (restavano rotte)
        const ok = res && res.status === 200 && (res.type !== 'opaque' || !isTile);
        if (ok || (res && res.type === 'opaque' && !isTile)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('./index.html');  // pagina, non immagini
        return Response.error();
      }))
  );
});
