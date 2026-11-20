// Offline cache for The Arjuun Codex. Bump VERSION to roll out an update.
const VERSION = "codex-202611201249";
const CORE = ["art/banner.webp", "art/feather1.webp", "art/feather2.webp", "art/feather3.webp", "art/feather4.webp", "art/feather5.webp", "art/fen0.webp", "art/fen1.webp", "art/fen2.webp", "art/gate_frame.webp", "art/gate_left.webp", "art/gate_right.webp", "art/jorm_head.webp", "art/jorm_head2.webp", "art/jorm_scale.webp", "art/moon.webp", "art/parch_tile.webp", "art/rv2/base.webp", "art/rv2/h_body.webp", "art/rv2/h_head.webp", "art/rv2/h_jaw.webp", "art/rv2/h_sil.webp", "art/rv2/h_wing.webp", "art/rv2/m_body.webp", "art/rv2/m_head.webp", "art/rv2/m_jaw.webp", "art/rv2/m_sil.webp", "art/rv2/m_wing.webp", "art/sky.webp", "config.js", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "index.html", "manifest.webmanifest", "sync.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(["./"].concat(CORE))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
 const u = new URL(e.request.url);
 if(e.request.method !== "GET") return;
 if(u.hostname.endsWith("supabase.co")) return;                       // live data always goes to the network
 if(u.origin === location.origin && (u.pathname.endsWith("/") || u.pathname.endsWith(".html") || u.pathname.endsWith("config.js") || u.pathname.endsWith("sync.js"))){
  // the page itself: fresh when online, the saved copy if the network is slow (3s) or gone
  e.respondWith(new Promise(resolve => {
   let settled = false; const fallback = () => caches.match(e.request, {ignoreSearch:true}).then(r => r || (e.request.mode === "navigate" ? caches.match("./") : Response.error()));
   const timer = setTimeout(() => { if(!settled){ settled = true; resolve(fallback()); } }, 3000);
   fetch(e.request.url, {cache:"no-cache", credentials:"same-origin"}).then(r => {
    if(r.ok){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request.url.split("?")[0], cp)); }
    if(!settled){ settled = true; clearTimeout(timer); resolve(r.ok ? r : fallback().then(c => c || r)); }
   }).catch(() => { if(!settled){ settled = true; clearTimeout(timer); resolve(fallback()); } });
  }));
  return;
 }
 // art, fonts, libraries: cache first
 e.respondWith(caches.match(e.request, {ignoreSearch:true}).then(hit => hit || fetch(e.request).then(r => { if(r.ok || r.type === "opaque"){ const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return r; })));
});
