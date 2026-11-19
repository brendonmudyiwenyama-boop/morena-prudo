// Offline cache for Ascension Log. Bump VERSION to roll out an update.
const VERSION = "ascension-202611191834";
const CORE = ["avatar/b0.webp", "avatar/b1.webp", "avatar/b2.webp", "avatar/b3.webp", "avatar/b4.webp", "avatar/b5.webp", "avatar/b6.webp", "avatar/b7.webp", "config.js", "dragon/s0.webp", "dragon/s1.webp", "dragon/s2.webp", "dragon/s3.webp", "dragon/s4.webp", "dragon/s5.webp", "dragon/s6.webp", "dragon/s7.webp", "dragon/s8.webp", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "ink/jade_band.webp", "ink/wash_day.webp", "ink/wash_night.webp", "intro/skullius_cocky.mp4", "kindle/k0.webp", "kindle/k1.webp", "kindle/k2.webp", "kindle/k3.webp", "kindle/k4.webp", "manifest.webmanifest", "raven/feather1.webp", "raven/feather2.webp", "raven/feather3.webp", "raven/feather4.webp", "raven/feather5.webp", "raven/rv2/base.webp", "raven/rv2/h_body.webp", "raven/rv2/h_head.webp", "raven/rv2/h_jaw.webp", "raven/rv2/h_sil.webp", "raven/rv2/h_wing.webp", "raven/rv2/m_body.webp", "raven/rv2/m_head.webp", "raven/rv2/m_jaw.webp", "raven/rv2/m_sil.webp", "raven/rv2/m_wing.webp", "sync.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(["./"].concat(CORE))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
 const u = new URL(e.request.url);
 if(e.request.method !== "GET") return;
 if(u.hostname.endsWith("supabase.co")) return;                       // live data always goes to the network
 if(u.origin === location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith(".html") || u.pathname.endsWith("config.js") || u.pathname.endsWith("sync.js"))){
  // the page itself: fresh when online, cached when not
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("./"))));
  return;
 }
 // art, fonts, libraries: cache first
 e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; })));
});
