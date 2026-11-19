// Offline cache for The Arjuun Codex. Bump VERSION to roll out an update.
const VERSION = "codex-202611191834";
const CORE = ["art/banner.webp", "art/feather1.webp", "art/feather2.webp", "art/feather3.webp", "art/feather4.webp", "art/feather5.webp", "art/gate_frame.webp", "art/gate_left.webp", "art/gate_right.webp", "art/jorm_head.webp", "art/jorm_scale.webp", "art/moon.webp", "art/parch_tile.webp", "art/rv2/base.webp", "art/rv2/h_body.webp", "art/rv2/h_head.webp", "art/rv2/h_jaw.webp", "art/rv2/h_sil.webp", "art/rv2/h_wing.webp", "art/rv2/m_body.webp", "art/rv2/m_head.webp", "art/rv2/m_jaw.webp", "art/rv2/m_sil.webp", "art/rv2/m_wing.webp", "art/sky.webp", "config.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "manifest.webmanifest", "sync.js"];
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
