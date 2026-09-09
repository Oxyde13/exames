// Service worker — Treino de Marinheiro com Segurança Básica (PWA)
// Estratégia: stale-while-revalidate (rápido + offline + atualiza em segundo plano).
// v2: o conteúdo em claro (questions.js) deixou de existir — a subida de versão
// é o que apaga a cache antiga nos dispositivos que já tinham a app instalada.
const CACHE = 'exames-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './auth.js',
  './content.enc.js',
  './manifest.webmanifest',
  './icons/logo.png',
  './icons/favicon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
  // As imagens das perguntas não estão aqui: viajam cifradas dentro do
  // content.enc.js e são reconstruídas em memória depois do PIN.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
