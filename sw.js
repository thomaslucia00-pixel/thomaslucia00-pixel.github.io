// Service worker scritto a mano: l'app shell resta in cache per l'uso offline.
// Asset con hash (/assets/*) = cache-first; pagine = network-first con ripiego su index.html.
const CACHE = 'gymos-v3'

// All'installazione metto in cache anche JS, CSS e font della versione nuova: l'app si apre offline già dalla seconda volta.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])
    const html = await (await c.match('/')).text()
    const assets = [...new Set(html.match(/\/assets\/[^"']+/g) ?? [])]
    await c.addAll(assets)
    const css = assets.find((a) => a.endsWith('.css'))
    const fonts = css ? [...new Set((await (await c.match(css)).text()).match(/\/assets\/[^)"']+\.woff2/g) ?? [])] : []
    await c.addAll(fonts)
    // via i file delle versioni vecchie, che altrimenti si accumulerebbero sul telefono
    const keep = new Set([...assets, ...fonts])
    for (const r of await c.keys()) { const path = new URL(r.url).pathname; if (path.startsWith('/assets/') && !keep.has(path)) await c.delete(r) }
  }))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))))
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return // Supabase e simili: mai in cache

  if (req.mode === 'navigate') {
    // In palestra il segnale va e viene: se la rete non risponde in 3 secondi apro la copia salvata.
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)) } return res })
    const slow = new Promise((ok) => setTimeout(ok, 3000)).then(() => caches.match('/'))
    e.respondWith(Promise.race([net.catch(() => caches.match('/')), slow.then((hit) => hit || net)]))
    return
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
      return res
    })),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('/allenamento'))))
})
