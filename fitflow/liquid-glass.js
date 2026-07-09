/* ============================================================
   FitFlow — Liquid Glass engine
   Real Apple-style "liquid glass" edge refraction, ported from the
   technique in rdev/liquid-glass-react: a per-element SVG filter whose
   feDisplacementMap bends the backdrop only near the rounded edges, run
   three times at slightly different scales (R/G/B) for chromatic
   aberration, then blended back together. Applied to every .panel AND
   .tile via inline backdrop-filter (sized per element through a
   ResizeObserver), reading each element's real corner radius so the
   bevel lines up on both large panels and small metric tiles.
   Shell / buttons / segmented controls keep the cheaper CSS-var frost.

   NOTE: edge refraction only renders in Chromium-based browsers.
   ============================================================ */
(function () {
  const KEY = 'ff-glass-v4';

  const DEFAULTS = {
    mode: 'standard',   // standard | polar | prominent
    displace: 0,        // displacement scale (edge distortion intensity) — calm by default
    blur: 10,           // backdrop blur, px (Apple material)
    sat: 150,           // saturation, %
    bright: 100,        // brightness, %
    chroma: 0,          // chromatic aberration (RGB channel separation)
    radius: 20,         // corner radius, px
    opacity: 30,        // glass fill alpha, %
    depth: 8,           // edge refraction band depth
    overLight: false,   // tint glass dark (for bright backgrounds)
  };

  const MODES = {
    standard:  { depthMul: 1.0, strMul: 1.0, band: 26 },
    polar:     { depthMul: 1.4, strMul: 1.25, band: 34 },
    prominent: { depthMul: 2.0, strMul: 1.6, band: 20 },
  };

  let S = Object.assign({}, DEFAULTS);
  const subs = new Set();

  /* ---- displacement map: neutral grey centre, gradient-coded edges ----
     Encodes a convex "thick glass" bevel. Centre stays neutral grey (#808080 =
     no displacement); near each edge the R channel (x) and G channel (y) ramp
     away from neutral so the backdrop gets bent inward — magnifying the content
     just inside the rim the way a real lens does. A wide blurred inner core
     keeps the centre perfectly flat so only the bevel band refracts. ---- */
  function dispMap(w, h, radius, depth, band) {
    const ry = Math.max(1, Math.ceil((radius / h) * band));
    const rx = Math.max(1, Math.ceil((radius / w) * band));
    // bevel band width in px — the visible "thickness" of the glass edge.
    // Bounded so large panels keep a flat, legible centre (only the rim refracts).
    const bevel = Math.max(depth, Math.min(54, Math.round(depth * 3.2), Math.floor(Math.min(w, h) / 3.2)));
    const iw = Math.max(0, w - 2 * bevel);
    const ih = Math.max(0, h - 2 * bevel);
    const blur = Math.max(2, Math.round(bevel * 0.7));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs>` +
      `<linearGradient id="Y" x1="0" x2="0" y1="${ry}%" y2="${100 - ry}%">` +
      `<stop offset="0%" stop-color="#0F0"/><stop offset="18%" stop-color="#0a0"/><stop offset="100%" stop-color="#000"/></linearGradient>` +
      `<linearGradient id="X" x1="${rx}%" x2="${100 - rx}%" y1="0" y2="0">` +
      `<stop offset="0%" stop-color="#F00"/><stop offset="18%" stop-color="#a00"/><stop offset="100%" stop-color="#000"/></linearGradient>` +
      `</defs>` +
      `<rect width="${w}" height="${h}" fill="#000"/>` +
      `<rect width="${w}" height="${h}" rx="${radius}" fill="#808080"/>` +
      `<rect width="${w}" height="${h}" rx="${radius}" fill="url(#Y)" style="mix-blend-mode:screen"/>` +
      `<rect width="${w}" height="${h}" rx="${radius}" fill="url(#X)" style="mix-blend-mode:screen"/>` +
      `<rect x="${bevel}" y="${bevel}" width="${iw}" height="${ih}" rx="${Math.max(0, radius - bevel)}" ` +
      `fill="#808080" style="filter:blur(${blur}px)"/>` +
      `</svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /* ---- full filter: displacement pass(es) + optional chromatic split ----
     With chroma off (the liquid default) a single displacement pass is used —
     one third of the raster cost of the R/G/B triple. That matters now that
     EVERY panel refracts: 3-pass on all cards at once wedges the compositor.
     Turning the chroma slider up still buys the full 3-pass aberration. */
  function dispFilter(w, h, radius, cfg) {
    const c = cfg || S;
    const m = MODES[c.mode] || MODES.standard;
    const depth = Math.max(1, Math.round(c.depth * m.depthMul));
    const strength = c.displace * m.strMul;
    const map = dispMap(w, h, radius, depth, m.band);
    const head =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      `<defs><filter id="d" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">` +
      `<feImage x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" href="${map}" result="m"/>`;
    let body;
    if ((c.chroma || 0) < 0.5) {
      body = `<feDisplacementMap in="SourceGraphic" in2="m" scale="${strength}" xChannelSelector="R" yChannelSelector="G"/>`;
    } else {
      const s1 = strength + c.chroma * 2, s2 = strength + c.chroma, s3 = strength;
      body =
        `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s1}" xChannelSelector="R" yChannelSelector="G" result="dR"/>` +
        `<feColorMatrix in="dR" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="cR"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s2}" xChannelSelector="R" yChannelSelector="G" result="dG"/>` +
        `<feColorMatrix in="dG" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="cG"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="m" scale="${s3}" xChannelSelector="R" yChannelSelector="G" result="dB"/>` +
        `<feColorMatrix in="dB" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="cB"/>` +
        `<feBlend in="cR" in2="cG" mode="screen" result="rg"/>` +
        `<feBlend in="rg" in2="cB" mode="screen"/>`;
    }
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(head + body + `</filter></defs></svg>`) + '#d';
  }

  /* ---- style one panel/tile for its current size ----
     Reads the element's actual corner radius so the refraction bevel lines up
     on both large panels (--lg-radius) and the smaller tiles (--lg-radius-tile). */
  function styleEl(el) {
    const r = el.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    const cs = getComputedStyle(el);
    const radius = Math.max(1, Math.round(parseFloat(cs.borderTopLeftRadius) || S.radius));
    const brightness = S.overLight ? Math.min(62, S.bright - 50) : S.bright;
    const cfg = S;
    // Liquid Glass material: reads "thicker" than plain frost — a touch more
    // blur + saturation on every glass box. The clear fill, specular rims and
    // gloss streak live in styles.css (.panel/.tile); real edge refraction
    // stays a Design-tab opt-in (displace slider) because even one SVG
    // displacement pass per card wedges the compositor on weaker machines.
    // "Thicker glass" bump: proportional statt pauschal +4/+20. Bei den Standard-
    // Werten (blur 24 / sat 170) ergibt das praktisch dasselbe (≈28px / ≈190%),
    // aber wenn der Nutzer Unschärfe/Sättigung Richtung Minimum zieht, verschwindet
    // der Frost-Boden vollständig — das Kästchen wird wieder wirklich klar/durchlässig.
    const blur = S.blur * 1.18;
    const sat = Math.min(220, Math.round(S.sat * 1.12));
    const plain = `blur(${blur}px) saturate(${sat}%) brightness(${brightness}%)`;
    // Effective edge-refraction strength. When it's ~0 (the calm default) the SVG
    // displacement filter produces no visible refraction anyway — but swapping a
    // box's backdrop to a url(<svg>) filter makes it render flat/dark for a frame
    // or two while the feImage data-URI resolves. That's the "box shows the
    // standard look, then the settings apply ~1s later" flash. So only attach the
    // expensive SVG filter when refraction is actually turned on; otherwise use
    // the plain, instant backdrop-filter (identical to what the CSS already paints).
    const m = MODES[cfg.mode] || MODES.standard;
    const strength = cfg.displace * m.strMul + cfg.chroma * 2;
    let bf = plain;
    // Tiles skip the displacement filter: their bevel band is a few px and
    // visually indistinguishable from the CSS rim, but each SVG filter costs
    // a full backdrop raster pass — on a card wall that wedges the compositor.
    const isTile = el.classList.contains('tile');
    if (!isTile && strength > 0.5) {
      try { bf = `url('${dispFilter(w, h, radius, cfg)}') ${plain}`; }
      catch (e) { bf = plain; }
    }
    el.style.backdropFilter = bf;
    el.style.webkitBackdropFilter = bf;
  }

  /* ---- CSS vars consumed by tiles / shell / buttons ---- */
  function applyVars() {
    const root = document.documentElement.style;
    const op = (S.opacity / 100);
    root.setProperty('--lg-opacity', op.toFixed(3));
    root.setProperty('--lg-opacity-tile', Math.min(0.85, Math.max(0, op * 0.92)).toFixed(3));
    // Schimmer-/Glanz-Intensität folgt dem Deckkraft-Regler (0–55) → 0..1.
    // So blenden die weißen Glas-Reflex-Schichten mit aus, wenn der Nutzer die
    // Deckkraft senkt — bei Minimum wird das Kästchen wirklich durchlässig
    // (nur Haarlinien-Kante + Blur), statt einen fixen milchigen Film zu behalten.
    root.setProperty('--lg-sheen', Math.max(0, Math.min(1, S.opacity / 55)).toFixed(3));
    root.setProperty('--lg-blur', S.blur + 'px');
    root.setProperty('--lg-blur-tile', Math.round(S.blur * 1.4) + 'px');
    root.setProperty('--lg-sat', S.sat + '%');
    root.setProperty('--lg-bright', (S.overLight ? Math.min(62, S.bright - 50) : S.bright) + '%');
    root.setProperty('--lg-radius', S.radius + 'px');
    root.setProperty('--lg-radius-tile', Math.max(8, S.radius - 6) + 'px');
    root.setProperty('--lg-tint', S.overLight ? '16,16,18' : '28,28,30');
    root.setProperty('--lg-tint2', S.overLight ? '12,12,14' : '58,58,64');
  }

  /* every glass box: large panels + the smaller metric tiles */
  const GLASS_SEL = '.panel, .tile';

  function refreshAll() {
    applyVars();
    document.querySelectorAll(GLASS_SEL).forEach(styleEl);
  }

  // styleEl auf allen Glas-Boxen ist teuer (SVG-Filter + backdrop-filter-Recomposite).
  // Beim Regler-Ziehen feuert set() pro pointermove — daher den teuren Sweep auf
  // höchstens 1×/Frame drosseln (die billigen CSS-Variablen via applyVars bleiben live).
  let styleRaf = 0;
  function styleAllSoon() {
    if (styleRaf) return;
    styleRaf = requestAnimationFrame(() => { styleRaf = 0; document.querySelectorAll(GLASS_SEL).forEach(styleEl); });
  }

  /* ---- observers: keep filters sized to live panels + tiles ---- */
  const ro = new ResizeObserver((entries) => { entries.forEach((e) => styleEl(e.target)); });
  let scanT = null;
  function attachAll() {
    document.querySelectorAll(GLASS_SEL).forEach((el) => {
      if (el.dataset.lg) return;
      el.dataset.lg = '1';
      ro.observe(el);
      styleEl(el);
    });
  }
  function init() {
    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (saved) S = Object.assign({}, DEFAULTS, saved); } catch (e) {}
    applyVars();
    attachAll();
    const root = document.getElementById('root') || document.body;
    const mo = new MutationObserver(() => { clearTimeout(scanT); scanT = setTimeout(attachAll, 60); });
    mo.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', () => { clearTimeout(scanT); scanT = setTimeout(refreshAll, 120); });

    /* Entrance wrappers (.screen-enter / .ff-swap-in) animate transform/opacity.
       While running — and, in some engines, while their finished animation keeps
       them promoted to a compositing layer — they act as a "backdrop root" that
       stops descendant glass from refracting the fixed page background. Once the
       entrance ends we strip the animation so content cards sample the real
       violet backdrop exactly like the sidebar/topbar do, then re-measure them. */
    document.addEventListener('animationend', (e) => {
      const t = e.target;
      if (!t.classList) return;
      if (t.classList.contains('screen-enter') || t.classList.contains('ff-swap-in')) {
        t.style.animation = 'none';
        t.style.transform = 'none';
        t.style.willChange = 'auto';
        requestAnimationFrame(() => {
          if (t.matches(GLASS_SEL)) styleEl(t);
          t.querySelectorAll(GLASS_SEL).forEach(styleEl);
        });
      }
    }, true);
  }

  window.FFGlass = {
    DEFAULTS,
    get() { return Object.assign({}, S); },
    set(partial) {
      S = Object.assign({}, S, partial);
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      applyVars();        // billige CSS-Variablen sofort anwenden
      styleAllSoon();     // teures Neu-Stylen aller Glas-Boxen gedrosselt (1×/Frame)
      subs.forEach((fn) => { try { fn(Object.assign({}, S)); } catch (e) {} });
    },
    reset() { this.set(Object.assign({}, DEFAULTS)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };

  if (document.getElementById('root')) init();
  else document.addEventListener('DOMContentLoaded', init);
})();
