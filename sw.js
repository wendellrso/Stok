// Service worker do Stok — cache do "casco" do app para abrir rápido e funcionar offline.
// Os dados ao vivo (Supabase) NUNCA são cacheados: precisam estar sempre atualizados.
const CACHE = 'stok-v6';
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

// busca:
// - Supabase: sempre rede (dados ao vivo)
// - HTML/navegação: REDE PRIMEIRO (app sempre atualizado quando online; cache só no offline)
// - resto (libs, ícones): cache primeiro (são estáticos e pesados)
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.url.includes('supabase.co')) return;
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req).then(resp => { const c = resp.clone(); caches.open(CACHE).then(cc => cc.put(req, c)); return resp; })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
