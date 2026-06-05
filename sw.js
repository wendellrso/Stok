// Service worker do Stok — cache do "casco" do app para abrir rápido e funcionar offline.
// Os dados ao vivo (Supabase) NUNCA são cacheados: precisam estar sempre atualizados.
const CACHE = 'stok-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js'
];

// instala: baixa e guarda o casco
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// ativa: limpa caches de versões antigas (quando trocarmos 'stok-v1' por 'stok-v2')
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// busca: API do Supabase passa direto pela rede; o resto é cache-first
self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return; // deixa a rede cuidar dos dados ao vivo
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request)).catch(() => caches.match('./index.html'))
  );
});
