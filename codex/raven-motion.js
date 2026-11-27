/* Huginn & Muninn motion engine — shared by the Ascension Log and the Arjuun Codex.
   One requestAnimationFrame loop moves every raven with springs and smooth curves instead of
   CSS keyframes, so nothing stops dead, snaps, folds flat or flips like a sheet of paper.
   Also: falling-feather physics (a pendulum glide with gentle 3D rocking, no flat flips). */
(function(){
"use strict";
const MQ = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
const reduced = () => !!(MQ && MQ.matches);

// ---------- maths ----------
const clamp = (v,a,b) => v<a ? a : v>b ? b : v;
const sm = x => { x = clamp(x,0,1); return x*x*x*(x*(x*6-15)+10); };            // smootherstep
const bump = (p,a,b,c,d) => p<=a || p>=d ? 0 : p<b ? sm((p-a)/(b-a)) : p<=c ? 1 : 1-sm((p-c)/(d-c));
const TAU = Math.PI*2;
function spring(s, target, dt, hz, z){          // damped spring, small fixed substeps so it never jitters
 const w = TAU*hz; let n = Math.ceil(dt/(1/240));
 const h = dt/n; while(n--){ s.v += (w*w*(target-s.x) - 2*z*w*s.v)*h; s.x += s.v*h; } return s.x;
}
// smooth curve through keyframes (cubic Hermite, tangents from neighbours, zero at the ends)
function curve(keys, p, ch){
 if(p <= keys[0][0]) return keys[0][ch]; const L = keys.length-1; if(p >= keys[L][0]) return keys[L][ch];
 let i = 0; while(keys[i+1][0] < p) i++;
 const k0 = keys[i], k1 = keys[i+1], dt = k1[0]-k0[0], u = (p-k0[0])/dt;
 // at the very start and end the bird is at rest; where a flight is cut in two (off-screen) it keeps its speed
 const one = (a,b) => (keys[b][ch]-keys[a][ch])/(keys[b][0]-keys[a][0]);
 const tan = j => j<=0 ? (keys[0][0]===0 ? 0 : one(0,1)) : j>=L ? (keys[L][0]===1 ? 0 : one(L-1,L)) : one(j-1,j+1);
 const m0 = tan(i)*dt, m1 = tan(i+1)*dt, u2 = u*u, u3 = u2*u;
 return (2*u3-3*u2+1)*k0[ch] + (u3-2*u2+u)*m0 + (-2*u3+3*u2)*k1[ch] + (u3-u2)*m1;
}

// ---------- whole-bird flights: [p, x%, y%, rot°, scaleX, scaleY, opacity, brightness] (Huginn's side; mirrored for Muninn) ----------
const K = (p,x,y,r,sx,sy,o,b) => [p,x||0,y||0,r||0,sx==null?1:sx,sy==null?1:sy,o==null?1:o,b==null?1:b];
const FLIGHTS = {
 hop:   {ms:1900, beats:[.12,.78], stab:.6, segs:[[K(0),K(.1,0,1.2,0,1.02,.96),K(.24,2.2,-13,-4),K(.44,3.4,-17,1.6),K(.64,2.2,-12,-2.4),K(.84,0,.8,0,1.03,.95),K(.93,0,-.4,0,.99,1.02),K(1)]]},
 loop:  {ms:2200, beats:[.1,.8], stab:0, segs:[[K(0),K(.08,0,1.4,0,1.03,.95),K(.2,4,-16,-27),K(.32,9.6,-30,-90),K(.44,5.6,-44,-180),K(.56,-.8,-34,-270),K(.7,1.6,-16,-352),K(.84,0,.8,-360,1.03,.95),K(.93,0,-.3,-360,.99,1.02),K(1,0,0,-360)]]},
 orbit: {ms:2600, beats:[.1,.86], stab:.5, segs:[[K(0),K(.1,0,1,0,1.02,.96),K(.24,16,-22,-10.8,1.06,1.06),K(.42,36,-30,5.4,.86,.86,1,.92),K(.58,20,-36,0,.62,.62,1,.7),K(.74,-4,-24,9,.84,.84,1,.95),K(.9,0,.6,0,1.03,.95),K(1)]]},
 dart:  {ms:2400, beats:[.08,.86], stab:.5, segs:[
          [K(0),K(.08,0,1.2,0,1.03,.94),K(.26,40,-26,-16),K(.40,88,-20,-22,.9,.9,0)],
          [K(.52,-64,-28,8,.9,.9,0),K(.66,-24,-22,10.8,1,1,1),K(.8,-4,-8,2),K(.92,0,.6,0,1.03,.95),K(1)]]},
 roll:  {ms:1800, beats:[.1,.84], stab:0, segs:[[K(0),K(.1,0,1.2,0,1.03,.95),K(.28,5.6,-20,-12),K(.4,9.6,-25,-120),K(.5,11.2,-26,-200),K(.6,9.6,-25,-285),K(.72,4,-17,-350),K(.86,0,.7,-360,1.03,.95),K(.94,0,-.3,-360,.99,1.02),K(1,0,0,-360)]]},
 hover: {ms:1700, beats:[.12,.84], stab:.7, segs:[[K(0),K(.12,0,1,0,1.02,.96),K(.26,0,-14,-4.5),K(.4,0,-11,0),K(.54,0,-15,3.6),K(.68,0,-12,0),K(.86,0,.6,0,1.03,.95),K(1)]]},
 swoop: {ms:2000, beats:[.06,.8], stab:.6, segs:[[K(0),K(.1,0,-6),K(.3,12,14,18),K(.5,24,16,4.5),K(.68,12,-12,-13.5),K(.86,0,.6,0,1.03,.95),K(1)]]}
};
function flightPose(f, p){
 const seg = f.segs.find(s => p <= s[s.length-1][0]) || f.segs[f.segs.length-1];
 const c = ch => curve(seg, p, ch);
 return {x:c(1), y:c(2), r:c(3), sx:c(4), sy:c(5), o:clamp(c(6),0,1), b:c(7)};
}

// ---------- perched actions: each returns offsets from rest. up = beak up (°), fx/hy = head shift (% of head), jaw 0..1,
//            bx/by = body scale add, bk = body skew°, wl = wing lift°, ws = wing stretch add ----------
const ACTIONS = {
 cawing:  {ms:950,  f:p => { const a = bump(p,0,.16,.26,.48), b = bump(p,.46,.6,.68,.94);
           return {up:-3*a - 2.4*b + 1.4*bump(p,.26,.36,.42,.5), fx:2.2*a + 1.6*b, jaw:a + .85*b, by:.014*(a+b), wl:1.2*(a+b)}; }},
 talking: {ms:1700, f:p => { const e = bump(p,0,.08,.82,1), o = .5 - .5*Math.cos(TAU*4.2*p);
           return {jaw:.62*e*o, up:e*(1 + 1.1*Math.sin(TAU*1.6*p)), fx:.6*e*o}; }},
 preen:   {ms:2200, f:p => { const e = bump(p,0,.22,.72,1), n = bump(p,.26,.34,.62,.7);
           return {up:-5*e - 1.1*n*Math.sin(TAU*5.5*p), hy:2.8*e, fx:-1.6*e, by:-.006*e}; }},
 puff:    {ms:1500, f:p => { const e = bump(p,0,.3,.62,1), q = bump(p,.3,.38,.56,.64);
           return {bx:.032*e, by:.026*e + .004*q*Math.sin(TAU*9*p), wl:1.6*e, ws:.02*e, hy:-1*e, up:.8*e}; }},
 shake:   {ms:800,  f:p => { const env = bump(p,0,.05,.55,1), o = Math.sin(TAU*6.5*p)*Math.pow(1-p,1.2);
           return {bk:1.6*o*env, fx:1.8*o*env, up:.9*o*env, wl:1.2*Math.abs(o)*env}; }},
 flap:    {ms:1600, f:p => { const a = bump(p,.04,.16,.22,.38), b = bump(p,.36,.5,.56,.76);
           return {wl:8*a + 9.5*b, ws:.035*(a+b), by:.02*(a+b), bx:.008*(a+b), up:1.6*(a+b), hy:-.8*(a+b)}; }},
 look:    {ms:2600, f:p => { const e = bump(p,0,.14,.74,1), g = bump(p,.32,.4,.5,.58);
           return {fx:-2.4*e + 1.2*g, up:-1.2*e + 2.4*g, hy:-.6*e}; }},
 tilt:    {ms:2000, f:p => { const e = bump(p,0,.22,.6,.96), g = bump(p,.32,.4,.46,.54);
           return {up:5*e + 1*g, hy:-1*e, fx:.6*e}; }},
 take:    {ms:1100, f:p => { const a = bump(p,0,.1,.14,.3), b = bump(p,.3,.42,.5,.86);
           return {up:4*a + 5.2*b, fx:1.4*a + 2*b, hy:-1*b}; }}
};

// ---------- per-bird state ----------
const ST = new WeakMap(); let birds = [], scanAt = 0;
const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { const s = ST.get(e.target); if(s) s.vis = e.isIntersecting; })) : null;
function init(el){
 const k = el.dataset.rv || (el.classList.contains("m") ? "m" : "h"), D = k==="h" ? 1 : -1;
 const q = sel => el.querySelector(sel);
 const s = {el, k, D, vis:!io, seed:Math.random()*100,
  body:q(".lyr.body>.act"), wing:q(".lyr.wing>.act"), head:q(".lyr.head>.act"), jaw:q(".jaw"),
  inst:[], fl:null, on:new Set(),
  hu:{x:0,v:0}, hx:{x:0,v:0}, hy:{x:0,v:0}, wl:{x:0,v:0}, jw:{x:0,v:0}, bk:{x:0,v:0},
  look:{up:0, fx:0, next:0}, beatA:{x:0,v:0}};
 el.setAttribute("data-rm","1");
 // a peek clone arrives with the flight already under way: let it start clean
 if(el.closest(".rvfly")) s.cloned = true;
 ST.set(el, s); if(io) io.observe(el); return s;
}
function start(s, name, ms, now){
 if(FLIGHTS[name]){ s.fl = {name, t0:now, ms:ms || FLIGHTS[name].ms}; return; }
 const A = ACTIONS[name]; if(!A) return;
 s.inst.forEach(i => { if(i.name===name && !i.fade) i.fade = now; });          // an old copy fades out instead of snapping
 s.inst.push({name, t0:now, ms:ms || A.ms});
}
function trigger(w, cls, ms){
 if(reduced()) return; const now = performance.now();
 document.querySelectorAll('.rv[data-rv="'+w+'"]').forEach(el => { const s = ST.get(el) || init(el); start(s, cls, ms, now); s.on.add(cls); });
}

const STATE_CLASSES = Object.keys(ACTIONS).concat(Object.keys(FLIGHTS));
let last = 0;
function frame(now){
 requestAnimationFrame(frame);
 if(reduced() || document.hidden){ last = now; return; }
 const dt = clamp((now - (last||now))/1000, 0, 1/20); last = now;
 if(now > scanAt){ scanAt = now + 600; birds = [...document.querySelectorAll(".rv[data-rv]")]; birds.forEach(el => { if(!ST.has(el)) init(el); }); }
 if(document.body && document.body.classList.contains("splashing")) return;
 for(const el of birds){ const s = ST.get(el); if(!s || !el.isConnected) continue;
  // classes added by code that bypasses act() (speech, peek clones) still start their motion
  for(const c of STATE_CLASSES){ const has = el.classList.contains(c);
   if(has && !s.on.has(c)){ s.on.add(c); if(!(s.cloned && FLIGHTS[c])) start(s, c, 0, now); } else if(!has && s.on.has(c)) s.on.delete(c); }
  if(!s.vis && !s.fl) continue;
  pose(s, now, dt);
 }
}

function pose(s, now, dt){
 const t = now/1000 + s.seed, D = s.D;
 // idle: breathing, a slow wing settle, and bird-like head moves (quick turn, then hold still)
 const br = Math.sin(TAU*t/(s.k==="h"?4.6:5.3));
 let up = 0, fx = 0, hy = 0, jaw = 0, bx = .003*br, by = .008*br, bk = 0, wl = .5*Math.sin(TAU*t/(s.k==="h"?6.2:7.1)) + .25*br, ws = 0;
 if(now > s.look.next){ s.look.next = now + 1400 + Math.random()*3400;
  s.look.up = Math.random()<.35 ? 0 : -2.2 + Math.random()*4.6; s.look.fx = -1.4 + Math.random()*2.8; }
 up += s.look.up; fx += s.look.fx;
 // perched actions, summed
 s.inst = s.inst.filter(i => now - i.t0 < i.ms && !(i.fade && now - i.fade > 220));
 for(const i of s.inst){ const p = (now - i.t0)/i.ms, o = ACTIONS[i.name].f(p), w = i.fade ? 1 - (now - i.fade)/220 : 1;
  up += (o.up||0)*w; fx += (o.fx||0)*w; hy += (o.hy||0)*w; jaw += (o.jaw||0)*w; bx += (o.bx||0)*w; by += (o.by||0)*w; bk += (o.bk||0)*w; wl += (o.wl||0)*w; ws += (o.ws||0)*w; }
 // whole-bird flight
 let F = null, beat = 0;
 if(s.fl){ const f = FLIGHTS[s.fl.name], p = (now - s.fl.t0)/s.fl.ms;
  if(p >= 1){ s.fl = null; s.el.style.transform = ""; s.el.style.opacity = ""; s.el.style.filter = ""; }
  else { F = flightPose(f, p); F.stab = f.stab; beat = bump(p, f.beats[0], f.beats[0]+.06, f.beats[1]-.06, f.beats[1]); } }
 // springs: the head leads with quick, damped turns; the wing and body skew follow through
 const hu = spring(s.hu, clamp(up,-6.5,6.5), dt, 3.6, .72), hxp = spring(s.hx, clamp(fx,-3.2,3.2), dt, 3.2, .78), hyp = spring(s.hy, clamp(hy,-3,3.2), dt, 3.2, .78);
 const wlp = spring(s.wl, wl, dt, 5.5, .62), jw = spring(s.jw, clamp(jaw,0,1.05), dt, 11, .8), bkp = spring(s.bk, bk, dt, 7, .45);
 const bA = spring(s.beatA, beat, dt, 4, 1);
 // wingbeats in flight: a smooth stroke — the wing lifts and opens, then sweeps down — never a flat flip
 const ph = TAU*5.2*t, stroke = Math.sin(ph);
 const wFly = bA*(6 + 9*stroke), wsFly = bA*(.05*stroke + .03);
 // head stays level while the body pitches (the way a real bird holds its head steady)
 let hr = -hu*D;
 if(F && F.stab) hr += clamp(-F.r*D*F.stab, -5, 5);
 hr = clamp(hr, -8, 8);
 if(s.head) s.head.style.transform = "translate("+(hxp*D).toFixed(2)+"%,"+hyp.toFixed(2)+"%) rotate("+hr.toFixed(2)+"deg)";
 if(s.jaw) s.jaw.style.transform = "rotate("+(11*D*jw).toFixed(2)+"deg)";
 if(s.wing) s.wing.style.transform = "rotate("+((wlp + wFly)*D).toFixed(2)+"deg) scale("+(1 + ws*.4 + wsFly*.3).toFixed(4)+","+(1 + ws + wsFly).toFixed(4)+")";
 if(s.body) s.body.style.transform = "scale("+(1 + bx + bA*.01).toFixed(4)+","+(1 + by).toFixed(4)+") skewX("+bkp.toFixed(2)+"deg)";
 if(F) { s.el.style.transform = "translate("+(F.x*D).toFixed(2)+"%,"+F.y.toFixed(2)+"%) rotate("+(F.r*D).toFixed(2)+"deg) scale("+F.sx.toFixed(4)+","+F.sy.toFixed(4)+")";
  s.el.style.opacity = F.o < .999 ? F.o.toFixed(3) : ""; s.el.style.filter = Math.abs(F.b-1) > .005 ? "brightness("+F.b.toFixed(3)+")" : ""; }
}

// ---------- falling feathers ----------
// A feather doesn't drop: it glides side to side like a pendulum, stalling at each end of the swing and
// dropping fastest through the middle, tilting into its motion and rocking gently in depth.
function fall(el, x0, y0, o){
 o = o || {}; const big = !!o.big;
 el.style.transformOrigin = "50% 30%";
 const dist = o.dist || (big ? 260 : 220) + Math.random()*160, V = (big ? 46 : 38) + Math.random()*14, A = (big ? 24 : 16) + Math.random()*14;
 const om = 2.1 + Math.random()*.9, drift = (Math.random()-.5)*14, side = Math.random()<.5 ? -1 : 1, base = side*(35 + Math.random()*30);
 let phi = Math.random()*TAU, y = 0, last = performance.now(); const t0 = last, rk = Math.random()*TAU;
 const step = now => {
  if(!el.isConnected){ o.done && o.done(); return; }
  const dt = Math.min(.05, (now-last)/1000), t = (now - t0)/1000; last = now;
  const go = sm(t/.55);                                  // it lets go of the plumage, then picks up its rhythm
  phi += om*(.75 + .25*go)*dt;
  const c = Math.cos(phi), sn = Math.sin(phi);
  y += V*go*(.32 + .95*c*c)*dt;                          // fastest through the bottom of the swing
  const k = y/dist; if(k >= 1){ el.remove(); o.done && o.done(); return; }
  const amp = A*go*(1 - .25*k);
  const x = x0 + drift*t + amp*sn, yy = y0 + y - 3.5*go*sn*sn;   // a slight lift as it stalls at each end
  const rot = base*(.35 + .65*go) + 30*go*c*side;
  const rockY = 38*Math.sin(.5*phi + rk), sc = .55 + .45*sm(t/.3);
  el.style.opacity = Math.min(1, t/.25, (1-k)/.16).toFixed(3);
  el.style.transform = "translate3d("+x.toFixed(2)+"px,"+yy.toFixed(2)+"px,0) rotate("+rot.toFixed(2)+"deg) perspective(240px) rotateY("+rockY.toFixed(2)+"deg) scale("+sc.toFixed(3)+")";
  requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
}
// the same flutter, steered onto a point (used by the Codex when a feather stabs into a card)
function flutterTo(el, from, to, ms, endRot, place, done){
 const A = 18 + Math.random()*12, om = 2.3 + Math.random()*.7, side = Math.random()<.5 ? -1 : 1, rk = Math.random()*TAU, t0 = performance.now();
 let phi = Math.random()*TAU, last = t0;
 const step = now => {
  if(!el.isConnected) return;
  const t = now - t0, k = clamp(t/ms, 0, 1), dt = Math.min(.05,(now-last)/1000); last = now; phi += om*dt;
  const e = sm(k), free = 1 - e, go = sm(t/450);
  const x = from[0] + (to[0]-from[0])*e + A*go*free*Math.sin(phi), y = from[1] + (to[1]-from[1])*e - 3*go*free*Math.sin(phi)**2;
  const rot = 30*go*free*Math.cos(phi)*side + endRot*e, rockY = 38*free*Math.sin(.5*phi + rk);
  el.style.opacity = Math.min(1, t/280).toFixed(3);
  place(x, y, rot, rockY, .6 + .4*sm(t/300));
  if(k < 1) requestAnimationFrame(step); else done && done();
 };
 requestAnimationFrame(step);
}

// each app's act() calls RavenMotion.trigger, so a move that restarts while already running restarts here too
window.RavenMotion = {fall, flutterTo, trigger};
requestAnimationFrame(frame);
})();
