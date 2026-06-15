/* ============================================================
   FitFlow — Background engine (FFBackground)
   A single fixed full-viewport layer (#ff-bg, z-index 0) painted BEHIND the
   transparent app shell, so whatever it draws glows up through the frosted
   liquid-glass panels (backdrop-filter). Three interchangeable backdrops,
   each recolourable:

     • beams    — animated light beams (the original FitFlow backdrop)
     • etheral  — slow undulating colour fog (SVG turbulence + displacement,
                  adapted from the rdev / framer "etheral shadow" technique)
     • bars     — animated vertical gradient bars (gradient-bars-background)

   Vanilla JS (no React) — loaded as a normal <script>. Driven by the
   "Hintergrund" section of the Tweaks panel via window.FFBackground.
   ============================================================ */
(function () {
  const KEY = 'ff-bg-v3';

  /* curated colour presets — the four the user asked for */
  const PRESETS = [
    { id: 'violet', color: '#7C5CFF' },
    { id: 'blue',   color: '#2f5cff' },
    { id: 'green',  color: '#16c560' },
    { id: 'red',    color: '#ff2e2e' },
    { id: 'yellow', color: '#ffc21f' },
  ];

  /* scenic photo backdrop (sharp, full-bleed) */
  const PHOTO_URL = 'https://cdn.hasselblad.com/f/77891/11656x8742/237f663ffc/x-system_02_download.jpg';

  /* flat solid-colour backdrops — neutral tones that sit well behind the
     liquid-glass panels (mostly deep darks plus one light option) */
  const SOLID_PRESETS = [
    { id: 'black',   color: '#000000' },
    { id: 'ink',     color: '#0a0d14' },
    { id: 'navy',    color: '#0c1430' },
    { id: 'slate',   color: '#1c2230' },
    { id: 'graphite',color: '#222428' },
    { id: 'white',   color: '#eef0f4' },
  ];

  const DEFAULTS = {
    mode: 'etheral',    // beams | etheral | bars | paths | photo | solid
    color: '#7C5CFF',   // dominant colour (violet) — used by the animated modes
    solidColor: '#0a0d14', // flat fill colour (solid mode)
    intensity: 55,      // overall strength (→ layer opacity), 30–100
    bars: 15,           // bar count (bars mode)
    photo: null,        // custom uploaded background (data URL); null → scenic default
  };

  let S = Object.assign({}, DEFAULTS);
  const subs = new Set();
  let root = null, cleanup = null;

  /* ---- colour helpers ---- */
  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
    const i = parseInt(n.slice(0, 6), 16);
    return { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255 };
  }
  function rgba(hex, a) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function hexToHue(hex) {
    let { r, g, b } = hexToRgb(hex); r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
    return h;
  }
  function map(v, a, b, c, d) { return c + ((v - a) / (b - a)) * (d - c); }

  /* ---- container ---- */
  function ensureRoot() {
    root = document.getElementById('ff-bg');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ff-bg';
      document.body.insertBefore(root, document.body.firstChild);
    }
    return root;
  }
  function applyIntensity() {
    if (!root) return;
    // a flat fill should read at full strength; intensity governs the
    // animated/atmospheric modes only
    root.style.opacity = S.mode === 'solid' ? '1' : map(S.intensity, 30, 100, 0.32, 1).toFixed(3);
  }

  /* ---- persistent ambient colour wash ----
     A full-viewport spread of the current colour, painted as the FIRST layer of
     #ff-bg (behind the animated backdrop). Without this the beams/bars cluster
     in a few regions, leaving the content area over flat near-black — so the
     liquid-glass blur/saturation/brightness have nothing to refract there and
     only opacity reads. The wash guarantees every glass box, in every tab,
     sits over colour and responds to all material settings. ---- */
  function buildWash() {
    const c = S.color;
    const wash = document.createElement('div');
    wash.className = 'ff-bg-wash';
    wash.style.cssText =
      'position:absolute;inset:0;pointer-events:none;' +
      'background:' +
        `radial-gradient(62% 70% at 18% 22%, ${rgba(c, 0.30)} 0%, transparent 68%),` +
        `radial-gradient(58% 66% at 82% 30%, ${rgba(c, 0.24)} 0%, transparent 70%),` +
        `radial-gradient(64% 72% at 60% 80%, ${rgba(c, 0.22)} 0%, transparent 72%),` +
        `radial-gradient(54% 62% at 30% 68%, ${rgba(c, 0.18)} 0%, transparent 72%),` +
        `radial-gradient(70% 80% at 90% 88%, ${rgba(c, 0.17)} 0%, transparent 74%);`;
    root.appendChild(wash);
  }

  /* ============================================================
     BEAMS
     ============================================================ */
  function buildBeams() {
    const MIN = 22;
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const hue = hexToHue(S.color);
    let beams = [], dpr = 1, cw = 0, ch = 0, raf = null;

    const make = () => ({
      x: Math.random() * cw * 1.5 - cw * 0.25,
      y: Math.random() * ch * 1.5 - ch * 0.25,
      width: 90 + Math.random() * 130,
      length: ch * 2.6,
      angle: -35 + Math.random() * 10,
      speed: 0.5 + Math.random() * 1.1,
      opacity: 0.22 + Math.random() * 0.16,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.018 + Math.random() * 0.026,
    });
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = window.innerWidth; ch = window.innerHeight;
      canvas.width = cw * dpr; canvas.height = ch * dpr;
      canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      beams = Array.from({ length: Math.floor(MIN * 1.5) }, make);
    }
    function reset(b, i) {
      const spacing = cw / 3;
      b.y = ch + 120;
      b.x = (i % 3) * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.6;
      b.width = 120 + Math.random() * 150;
      b.speed = 0.5 + Math.random() * 0.5;
      b.opacity = 0.24 + Math.random() * 0.14;
    }
    function draw(b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate((b.angle * Math.PI) / 180);
      const o = b.opacity * (0.8 + Math.sin(b.pulse) * 0.2);
      const g = ctx.createLinearGradient(0, 0, 0, b.length);
      const c = (a) => `hsla(${hue}, 100%, 62%, ${a})`;
      g.addColorStop(0, c(0)); g.addColorStop(0.1, c(o * 0.5));
      g.addColorStop(0.4, c(o)); g.addColorStop(0.6, c(o));
      g.addColorStop(0.9, c(o * 0.5)); g.addColorStop(1, c(0));
      ctx.fillStyle = g;
      ctx.fillRect(-b.width / 2, 0, b.width, b.length);
      ctx.restore();
    }
    function frame(animate) {
      ctx.clearRect(0, 0, cw, ch);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      beams.forEach((b, i) => {
        if (animate) {
          b.y -= b.speed; b.pulse += b.pulseSpeed;
          if (b.y + b.length < -120) reset(b, i);
        }
        draw(b);
      });
      ctx.restore();
    }
    resize();
    window.addEventListener('resize', resize);
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { frame(false); }
    else {
      let last = 0;
      (function loop(t) { raf = requestAnimationFrame(loop); if (t - last < 24) return; last = t; frame(true); })(0);
    }
    return () => { if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }

  /* ============================================================
     ETHERAL — undulating colour fog
     ============================================================ */
  function buildEtheral() {
    const id = 'ff-eth-' + Math.random().toString(36).slice(2, 8);
    const scale = map(S.intensity, 30, 100, 45, 95);     // displacement strength
    const c = S.color;

    // SVG filter (turbulence → animated hue-rotate → displacement ×2)
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.innerHTML =
      `<defs><filter id="${id}" x="-30%" y="-30%" width="160%" height="160%">` +
        `<feTurbulence result="undulation" numOctaves="2" baseFrequency="0.0009,0.0028" seed="3" type="turbulence"/>` +
        `<feColorMatrix class="hue" in="undulation" type="hueRotate" values="0"/>` +
        `<feColorMatrix in="dist" result="circulation" type="matrix" values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="circulation" scale="${scale}" result="dist"/>` +
        `<feDisplacementMap in="dist" in2="undulation" scale="${scale}" result="output"/>` +
      `</filter></defs>`;
    root.appendChild(svg);

    // coloured blob layer the filter distorts
    const fog = document.createElement('div');
    fog.style.cssText =
      `position:absolute;inset:-12%;` +
      `filter:url(#${id}) blur(12px);` +
      `background:` +
        `radial-gradient(38% 46% at 28% 32%, ${rgba(c, 0.85)} 0%, transparent 68%),` +
        `radial-gradient(42% 52% at 72% 64%, ${rgba(c, 0.6)} 0%, transparent 70%),` +
        `radial-gradient(46% 56% at 58% 18%, ${rgba(c, 0.45)} 0%, transparent 74%),` +
        `radial-gradient(50% 60% at 18% 78%, ${rgba(c, 0.5)} 0%, transparent 72%),` +
        `radial-gradient(60% 70% at 85% 30%, ${rgba(c, 0.35)} 0%, transparent 76%);`;
    root.appendChild(fog);

    const hueEl = svg.querySelector('.hue');
    let raf = null;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduced && hueEl) {
      let v = 0, last = 0;
      (function loop(t) {
        raf = requestAnimationFrame(loop);
        if (t - last < 40) return; last = t;        // ~25fps, plenty for slow fog
        v = (v + 0.6) % 360;
        hueEl.setAttribute('values', String(v));
      })(0);
    }
    return () => { if (raf) cancelAnimationFrame(raf); };
  }

  /* ============================================================
     BARS — animated gradient bars
     ============================================================ */
  function buildBars() {
    const n = Math.max(3, Math.min(30, S.bars | 0));
    const c = S.color;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;filter:blur(4px) saturate(125%);';

    const height = (i) => {
      const pos = i / (n - 1);
      const dist = Math.abs(pos - 0.5);
      return 30 + (100 - 30) * Math.pow(dist * 2, 1.2);
    };
    for (let i = 0; i < n; i++) {
      const h = height(i) / 100;
      const bar = document.createElement('div');
      bar.style.cssText =
        `flex:1 0 calc(100% / ${n});max-width:calc(100% / ${n});height:100%;` +
        `background:linear-gradient(to top, ${rgba(c, 0.95)}, ${rgba(c, 0)});` +
        `transform:scaleY(${h});transform-origin:bottom;` +
        `animation:ff-bar-pulse 2s ease-in-out ${i * 0.12}s infinite alternate;` +
        `--isc:${h};`;
      wrap.appendChild(bar);
    }
    root.appendChild(wrap);
    return null;
  }

  /* ============================================================
     PATHS — flowing line-art (adapted from the "background paths" component).
     Two mirrored fans of 36 bézier strokes, animated by sweeping the dash
     offset along each path. Recoloured to S.color. No blur (sharp lines).
     ============================================================ */
  function buildPaths() {
    const c = S.color;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 696 316');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    const fan = (position) => {
      for (let i = 0; i < 36; i++) {
        const d =
          `M-${380 - i * 5 * position} -${189 + i * 6}` +
          `C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}` +
          `C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`;
        const p = document.createElementNS(svgNS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', c);
        p.setAttribute('stroke-width', (0.6 + i * 0.06).toFixed(2));
        p.setAttribute('fill', 'none');
        p.setAttribute('pathLength', '1');
        p.style.strokeDasharray = '0.5 0.5';
        const o0 = (0.10 + i * 0.016).toFixed(3);
        const o1 = Math.min(0.85, 0.28 + i * 0.018).toFixed(3);
        if (reduced) {
          p.setAttribute('stroke-opacity', o1);
        } else {
          p.style.setProperty('--o0', o0);
          p.style.setProperty('--o1', o1);
          const dur = (20 + Math.random() * 10).toFixed(1);
          const pdur = (7 + Math.random() * 6).toFixed(1);
          p.style.animation = `ff-path-flow ${dur}s linear infinite, ff-path-pulse ${pdur}s ease-in-out infinite`;
        }
        svg.appendChild(p);
      }
    };
    fan(1); fan(-1);
    root.appendChild(svg);
    return null;
  }

  /* ============================================================
     SOLID — flat single-colour fill
     ============================================================ */
  function buildSolid() {
    const fill = document.createElement('div');
    fill.style.cssText =
      `position:absolute;inset:0;background:${S.solidColor || '#000000'};`;
    root.appendChild(fill);
    return null;
  }

  /* ============================================================
     PHOTO — scenic landscape, sharp & full-bleed
     ============================================================ */
  function buildPhoto() {
    const img = document.createElement('div');
    img.style.cssText =
      `position:absolute;inset:0;` +
      `background:#0a0d14 url("${S.photo || PHOTO_URL}") center / cover no-repeat;`;
    root.appendChild(img);
    return null;
  }

  /* ---- one-time keyframes ---- */
  function injectStyle() {
    if (document.getElementById('ff-bg-style')) return;
    const s = document.createElement('style');
    s.id = 'ff-bg-style';
    s.textContent =
      '@keyframes ff-bar-pulse{0%{transform:scaleY(var(--isc))}100%{transform:scaleY(calc(var(--isc) * 0.62))}}' +
      '@keyframes ff-path-flow{to{stroke-dashoffset:-1}}' +
      '@keyframes ff-path-pulse{0%,100%{stroke-opacity:var(--o0)}50%{stroke-opacity:var(--o1)}}';
    document.head.appendChild(s);
  }

  /* ---- render / switch ---- */
  function render() {
    ensureRoot();
    injectStyle();
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    root.innerHTML = '';
    if (S.mode !== 'photo' && S.mode !== 'solid') buildWash();
    if (S.mode === 'etheral') cleanup = buildEtheral();
    else if (S.mode === 'bars') cleanup = buildBars();
    else if (S.mode === 'paths') cleanup = buildPaths();
    else if (S.mode === 'photo') cleanup = buildPhoto();
    else if (S.mode === 'solid') cleanup = buildSolid();
    else cleanup = buildBeams();
    applyIntensity();
  }

  function init() {
    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) S = Object.assign({}, DEFAULTS, saved); } catch (e) {}
    render();
  }

  window.FFBackground = {
    DEFAULTS, PRESETS, SOLID_PRESETS, PHOTO_URL,
    get() { return Object.assign({}, S); },
    set(partial) {
      const prev = S;
      S = Object.assign({}, S, partial);
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      // intensity-only change → just fade, no costly rebuild
      const structural = ['mode', 'color', 'solidColor', 'bars', 'photo'].some((k) => k in partial && partial[k] !== prev[k]);
      if (structural || !root) render();
      else applyIntensity();
      subs.forEach((fn) => { try { fn(Object.assign({}, S)); } catch (e) {} });
    },
    reset() { this.set(Object.assign({}, DEFAULTS)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
