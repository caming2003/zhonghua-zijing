/* 中华字经 · 识字乐园 - Service Worker */
const CACHE = 'zhonghua-zijing-v2';
const URLS = ['index.html','manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// TTS 代理：Service Worker 不受 CORS 限制
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname === '/tts') {
    const text = url.searchParams.get('text') || '';
    if (text) {
      e.respondWith(
        fetch('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(text) + '&le=zh', {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        }).then(resp => {
          const headers = new Headers(resp.headers);
          headers.set('Access-Control-Allow-Origin', '*');
          return new Response(resp.body, { status: 200, statusText: 'OK', headers });
        }).catch(() => new Response('', { status: 502 }))
      );
      return;
    }
  }
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => r))
  );
});
