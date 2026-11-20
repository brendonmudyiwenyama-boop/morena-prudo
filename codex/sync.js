/* Arjuun sync: stands in for Claude's built-in storage so the same app code runs anywhere.
   Data lives in your own Supabase project, one row per document, readable only by your signed-in account. */
(function(){
"use strict";
const CFG = window.ARJUUN_CFG || {};
const P = CFG.prefix;                       // "al" or "cx"
const configured = !!(CFG.url && CFG.key && !/YOUR_/.test(CFG.url + CFG.key));
let client = null, readyFn; const ready = new Promise(r => readyFn = r);
window.claude = window.claude || {};
window.claude.use = async name => name === "db" ? await ready : null;

// ---------- tiny UI: a sheet for sign-in / import, and a toast ----------
const css = `.az-sheet{position:fixed;inset:0;z-index:99;background:rgba(6,10,10,.62);display:grid;align-items:end;justify-items:center;font:500 15px/1.45 system-ui,-apple-system,sans-serif}
.az-in{background:#fbf8f0;color:#1c1f1b;width:min(520px,100%);border-radius:18px 18px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.35)}
@media (prefers-color-scheme:dark){.az-in{background:#141c1d;color:#e7eee8}}
.az-in h3{margin:0 0 4px;font:700 19px Georgia,serif}.az-in p{margin:4px 0 12px;opacity:.8;font-size:14px}
.az-in input,.az-in textarea{width:100%;box-sizing:border-box;font:inherit;padding:11px 12px;border-radius:10px;border:1px solid #9aa59c66;background:transparent;color:inherit}
.az-in textarea{min-height:120px;font:12px ui-monospace,monospace}
.az-row{display:flex;gap:8px;margin-top:12px}.az-row button{flex:1;font:700 15px system-ui;padding:12px;border-radius:999px;border:none;cursor:pointer}
.az-go{background:#2c8a6c;color:#fff}.az-no{background:#9aa59c33;color:inherit}.az-err{color:#c2412e;font-size:13px;min-height:1.2em;margin-top:6px}
.az-pill{position:fixed;right:10px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:60;font:700 12px system-ui;padding:7px 11px;border-radius:999px;border:none;background:#2c8a6c;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.az-cloud{padding:6px 10px;font-size:15px;opacity:.85}
.az-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:100;background:#13201d;color:#eaf5ef;padding:9px 14px;border-radius:12px;font:600 14px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.35)}`;
function style(){ const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }
function toast(m){ const t = document.createElement("div"); t.className = "az-toast"; t.textContent = m; document.body.appendChild(t); setTimeout(()=>t.remove(), 2600); }
function sheet(html){ const w = document.createElement("div"); w.className = "az-sheet"; w.innerHTML = '<div class="az-in">'+html+'</div>'; document.body.appendChild(w); return w; }

// ---------- sign in with email + password (no email links needed for home-screen apps) ----------
function signInFlow(){
 const w = sheet('<h3>Sync your progress</h3><p>Use the same email and password in both apps. First time? Pick a password and tap <b>Create account</b>.</p>'+
  '<input type="email" id="azEmail" placeholder="you@example.com" autocomplete="email" inputmode="email">'+
  '<input type="password" id="azPass" placeholder="Password (8+ characters)" autocomplete="current-password" style="margin-top:8px"><div class="az-err" id="azErr"></div>'+
  '<div class="az-row"><button class="az-no" id="azLater">Not now</button><button class="az-no" id="azNew">Create account</button><button class="az-go" id="azIn">Sign in</button></div>');
 const err = m => { w.querySelector("#azErr").textContent = m || ""; };
 const vals = () => { const email = w.querySelector("#azEmail").value.trim(), password = w.querySelector("#azPass").value;
  if(!/^\S+@\S+\.\S+$/.test(email)){ err("Enter a valid email."); return null; }
  if(password.length < 8){ err("Password needs at least 8 characters."); return null; } return {email, password}; };
 w.querySelector("#azLater").onclick = () => { try{ localStorage.setItem("az-later-"+P, String(Date.now())); }catch(e){} w.remove(); pill(); };
 w.querySelector("#azIn").onclick = async () => { const c = vals(); if(!c) return; err("Signing in…");
  const r = await client.auth.signInWithPassword(c);
  if(r.error) return err(/confirm/i.test(r.error.message) ? "Confirm your email first (tap the link Supabase sent), then sign in." : r.error.message);
  location.reload(); };
 w.querySelector("#azNew").onclick = async () => { const c = vals(); if(!c) return; err("Creating account…");
  const r = await client.auth.signUp(c);
  if(r.error) return err(r.error.message);
  if(r.data && r.data.session) return location.reload();
  err("Almost there: tap the confirmation link Supabase emailed you, then come back and tap Sign in."); };
}
function pill(){ if(document.querySelector(".az-pill")) return; const b = document.createElement("button"); b.className = "az-pill"; b.textContent = "☁ Sign in to sync"; b.onclick = () => { b.remove(); signInFlow(); }; document.body.appendChild(b); }

// ---------- one-time import of what you had in the claude.ai version ----------
async function maybeImport(){
 try{ if(localStorage.getItem("az-imported-"+P)) return; }catch(e){}
 const {data, error} = await client.from("kv").select("k").like("k", P+"/%").limit(1);
 if(error || (data && data.length)){ try{ localStorage.setItem("az-imported-"+P,"1"); }catch(e){} return; }
 await new Promise(done => {
  const w = sheet('<h3>Bring your progress over</h3><p>In the claude.ai version, tap <b>“Move my data to the app”</b> at the bottom of the page, then paste it here.</p>'+
   '<textarea id="azData" placeholder="Paste here"></textarea><div class="az-err" id="azErr"></div>'+
   '<div class="az-row"><button class="az-no" id="azSkip">Start fresh</button><button class="az-go" id="azImp">Import</button></div>');
  w.querySelector("#azSkip").onclick = () => { try{ localStorage.setItem("az-imported-"+P,"1"); }catch(e){} w.remove(); done(); };
  w.querySelector("#azImp").onclick = async () => {
   const e = m => w.querySelector("#azErr").textContent = m;
   let pack; try{ pack = JSON.parse(w.querySelector("#azData").value.trim()); }catch(x){ return e("That doesn't look like an export. Copy it again and paste the whole thing."); }
   if(!pack || pack.app !== P || !pack.items) return e(pack && pack.app ? "That export is for the other app." : "That doesn't look like an export.");
   e("Importing…");
   const rows = Object.keys(pack.items).map(k => ({k:P+"/"+k, v:pack.items[k], updated_at:new Date().toISOString()}));
   for(let i=0;i<rows.length;i+=200){ const r = await client.from("kv").upsert(rows.slice(i,i+200)); if(r.error) return e(r.error.message); }
   try{ localStorage.setItem("az-imported-"+P,"1"); }catch(x){}
   w.remove(); toast("Imported "+rows.length+" item"+(rows.length===1?"":"s")); done();
  };
 });
}

// ---------- ravens fly through the database, so a raven sent from one app lands in the other ----------
async function applyPendingRaven(){
 const r = await client.from("kv").select("v").eq("k", P+"/bridge/pending").maybeSingle();
 const rec = r.data && r.data.v; let last = 0; try{ last = +(localStorage.getItem("az-raven-"+P)||0); }catch(e){}
 if(rec && rec.hash && rec.ts > last){ try{ localStorage.setItem("az-raven-"+P, String(rec.ts)); }catch(e){}
  if(decodeURIComponent((location.hash||"").slice(1)) !== rec.hash){ location.hash = rec.hash; location.reload(); return true; } }
 return false;
}
document.addEventListener("click", e => {
 const a = e.target.closest && e.target.closest('a[href*="#raven-"]'); if(!a || !client) return;
 const hash = decodeURIComponent(a.getAttribute("href").split("#")[1]||""), target = /^raven-asc-/.test(hash) ? "cx" : /^raven-cdx-/.test(hash) ? "al" : null;
 if(!target || target === P) return;
 e.preventDefault();
 client.from("kv").upsert({k:target+"/bridge/pending", v:{hash, ts:Date.now()}, updated_at:new Date().toISOString()})
  .then(r => toast(r.error ? "Couldn't send the raven: "+r.error.message : "Raven sent. It'll be waiting when you open "+(target==="cx"?"the Codex":"the Ascension Log")+"."));
}, true);

// ---------- the storage API the apps already speak: doc(path).set/onSnapshot, collection(name).limit(n).onSnapshot ----------
function makeDb(){
 const listeners = [];   // {match:k=>bool, fire:()=>void}
 let chan = client.channel("kv-"+P+"-"+Math.random().toString(36).slice(2,7))
  .on("postgres_changes", {event:"*", schema:"public", table:"kv"}, payload => {
   const k = (payload.new && payload.new.k) || (payload.old && payload.old.k) || "";
   listeners.forEach(l => { if(l.match(k)) l.fire(); });
  }).subscribe();
 const deb = fn => { let t = null; return () => { clearTimeout(t); t = setTimeout(fn, 250); }; };
 return {
  doc(path){ const k = P+"/"+path; return {
   set(v){ return client.from("kv").upsert({k, v, updated_at:new Date().toISOString()}).then(r => { if(r.error) throw r.error; }); },
   get(){ return client.from("kv").select("v").eq("k",k).maybeSingle().then(r => { if(r.error) throw r.error; return {exists:!!r.data, data:()=>r.data && r.data.v}; }); },
   onSnapshot(cb, onErr){ const pull = () => client.from("kv").select("v").eq("k",k).maybeSingle().then(r => { if(r.error){ onErr && onErr(r.error); return; } cb({exists:!!r.data, data:()=>r.data && r.data.v}); }).catch(e => onErr && onErr(e));
    pull(); listeners.push({match:x => x===k, fire:deb(pull)}); return () => {}; } }; },
  collection(name){ const pre = P+"/"+name+"/"; const q = n => ({ onSnapshot(cb, onErr){
    const pull = () => client.from("kv").select("k,v").like("k", pre+"%").limit(n||1000).then(r => { if(r.error){ onErr && onErr(r.error); return; } cb({docs:(r.data||[]).map(x => ({id:x.k.slice(pre.length), data:()=>x.v}))}); }).catch(e => onErr && onErr(e));
    pull(); listeners.push({match:x => x.startsWith(pre), fire:deb(pull)}); return () => {}; } });
   return Object.assign(q(1000), {limit:n => q(n)}); }
 };
}

// ---------- private settings (your schedule) load before the app starts, so none of it lives in the public code ----------
function runApp(priv){
 window.__PRIV = priv || {};
 document.querySelectorAll('script[type="text/x-deferred"]').forEach(old => { const s = document.createElement("script"); s.textContent = old.textContent; old.replaceWith(s); });
}
function cachedPriv(){ try{ return JSON.parse(localStorage.getItem("az-priv-"+P)||"null"); }catch(e){ return null; } }
async function loadPriv(){
 if(!CFG.priv) return null;
 try{ const r = await client.from("kv").select("v").eq("k", P+"/private/config").maybeSingle();
  if(r.data && r.data.v){ try{ localStorage.setItem("az-priv-"+P, JSON.stringify(r.data.v)); }catch(e){} return r.data.v; } }catch(e){}
 return cachedPriv();
}
// tap the sync status line for: paste an update, or sign out
document.addEventListener("click", e => {
 if(!client || !e.target.closest || !e.target.closest("#sync, .az-cloud")) return;
 const w = sheet('<h3>Sync</h3><p>Paste an update Claude gave you, or sign out of this device.</p><textarea id="azUp" placeholder="Paste update (optional)"></textarea><div class="az-err" id="azErr"></div>'+
  '<div class="az-row"><button class="az-no" id="azOut">Sign out</button><button class="az-no" id="azX">Close</button><button class="az-go" id="azApply">Apply</button></div>');
 w.querySelector("#azX").onclick = () => w.remove();
 w.querySelector("#azOut").onclick = async () => { await client.auth.signOut(); try{ localStorage.removeItem("az-priv-"+P); }catch(x){} location.reload(); };
 w.querySelector("#azApply").onclick = async () => {
  const er = m => w.querySelector("#azErr").textContent = m; let pack;
  try{ pack = JSON.parse(w.querySelector("#azUp").value.trim()); }catch(x){ return er("That isn't a valid update."); }
  if(!pack || pack.app !== P || !pack.items) return er("That update is for the other app.");
  const rows = Object.keys(pack.items).map(k => ({k:P+"/"+k, v:pack.items[k], updated_at:new Date().toISOString()}));
  const r = await client.from("kv").upsert(rows); if(r.error) return er(r.error.message);
  try{ localStorage.removeItem("az-priv-"+P); }catch(x){} location.reload();
 };
});

// ---------- boot ----------
// never let a slow or dead connection hold the app hostage: each network step gets a few seconds, then we move on
const tmo = (p, ms, fb) => Promise.race([Promise.resolve(p).catch(() => fb), new Promise(r => setTimeout(() => r(fb), ms))]);
async function boot(){
 style();
 if(!configured || !window.supabase){ runApp(cachedPriv()); readyFn(null); return; }
 client = window.supabase.createClient(CFG.url, CFG.key, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:"arjuun-auth-"+P}});
 const {data} = await tmo(client.auth.getSession(), 4000, {data:{session:null}});
 if(!data.session){ readyFn(null);
  let later = 0; try{ later = +(localStorage.getItem("az-later-"+P)||0); }catch(e){}
  const show = () => (Date.now() - later > 3*864e5) ? signInFlow() : pill();
  runApp(cachedPriv());
  setTimeout(show, CFG.priv ? 600 : 7000);   // the Log has nothing to show until you sign in
  return; }
 if(await tmo(applyPendingRaven(), 3500, false)) return;
 await tmo(maybeImport(), 3500, null);
 runApp(await tmo(loadPriv(), 3500, cachedPriv()));
 readyFn(makeDb());
 const c = document.createElement("button"); c.className = "az-pill az-cloud"; c.textContent = "☁"; c.setAttribute("aria-label","Sync settings"); document.body.appendChild(c);
}
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
// keep the installed app fresh: register the offline cache
if("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
})();
