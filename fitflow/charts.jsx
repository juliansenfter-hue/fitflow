/* FitFlow charts — dependency-free SVG. Colors via CSS vars (--z1.., --accent). */
(function () {
  const { useState, useRef, useEffect, useMemo, createElement: h, Fragment } = React;
  const cssVar = (name) => `var(--${name})`;

  /* ---- scales + smooth path ---- */
  const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }
  const uid = () => 'g' + Math.random().toString(36).slice(2, 8);

  /* subtle edge softening only — vivid, mostly-crisp strokes; NOT a heavy halo. */
  function glow(id, b) {
    const s = b || 3;
    return h('filter', { id, x: '-30%', y: '-30%', width: '160%', height: '160%' },
      h('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: s * 0.42, result: 'soft' }),
      h('feMerge', null,
        h('feMergeNode', { in: 'soft' }),
        h('feMergeNode', { in: 'SourceGraphic' })));
  }

  /* =========================================================
     RecoveryGauge — 270° arc with colored progress
     ========================================================= */
  function RecoveryGauge({ value, size = 180, label = 'Recovery Score' }) {
    const r = size / 2 - 16, cx = size / 2, cy = size / 2;
    const start = 135, sweep = 270;
    const a0 = (start * Math.PI) / 180;
    const polar = (ang) => [cx + r * Math.cos((ang * Math.PI) / 180), cy + r * Math.sin((ang * Math.PI) / 180)];
    const arc = (fromA, toA) => {
      const [x0, y0] = polar(fromA), [x1, y1] = polar(toA);
      const large = toA - fromA > 180 ? 1 : 0;
      return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
    };
    const valAng = start + (value / 100) * sweep;
    const col = value >= 70 ? cssVar('good') : value >= 50 ? cssVar('warn') : cssVar('bad');
    const gid = uid(), glid = uid();
    return h('div', { style: { position: 'relative', width: size, height: size * 0.82 } },
      h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size * 0.92}` },
        h('defs', null,
          glow(glid, 3.4),
          h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
          h('stop', { offset: '0', style: { stopColor: cssVar('bad') } }),
          h('stop', { offset: '.5', style: { stopColor: cssVar('warn') } }),
          h('stop', { offset: '1', style: { stopColor: cssVar('good') } }))),
        h('path', { d: arc(start, start + sweep), fill: 'none', stroke: 'rgba(255,255,255,.07)', strokeWidth: 12, strokeLinecap: 'round' }),
        h('path', { d: arc(start, valAng), fill: 'none', stroke: `url(#${gid})`, strokeWidth: 12, strokeLinecap: 'round', filter: `url(#${glid})` }),
        h('circle', { cx: polar(valAng)[0], cy: polar(valAng)[1], r: 7, fill: '#0a0b0d', stroke: col, strokeWidth: 2.5 })),
      h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 6 } },
        h('div', { className: 'metric', style: { fontSize: size * 0.30, color: col } }, value),
        h('div', { className: 'label', style: { marginTop: 2 } }, label)));
  }

  /* =========================================================
     AnimatedGradient — floating, blurred colour blobs (ported from the
     animated-gradient-with-svg component; framer-motion/tailwind stripped).
     ========================================================= */
  function AnimatedGradient({ colors, circleSize = 200, speed = 0.05, blur = 26, opacity = 0.62 }) {
    const cfg = useRef(null);
    if (!cfg.current) {
      cfg.current = colors.map(() => ({
        top: Math.random() * 50, left: Math.random() * 50, s: 0.5 + Math.random(),
        tx1: Math.random() - 0.5, ty1: Math.random() - 0.5, tx2: Math.random() - 0.5, ty2: Math.random() - 0.5,
        tx3: Math.random() - 0.5, ty3: Math.random() - 0.5, tx4: Math.random() - 0.5, ty4: Math.random() - 0.5,
      }));
    }
    return h('div', { 'aria-hidden': true, style: { position: 'absolute', inset: 0, overflow: 'hidden', filter: `blur(${blur}px)` } },
      colors.map((color, i) => {
        const c = cfg.current[i], sz = Math.round(circleSize * c.s);
        return h('svg', { key: i, className: 'ff-grad-circle', width: sz, height: sz, viewBox: '0 0 100 100',
          style: { top: `${c.top}%`, left: `${c.left}%`,
            '--bg-grad-speed': `${Math.round(1 / speed)}s`,
            '--tx-1': c.tx1, '--ty-1': c.ty1, '--tx-2': c.tx2, '--ty-2': c.ty2,
            '--tx-3': c.tx3, '--ty-3': c.ty3, '--tx-4': c.tx4, '--ty-4': c.ty4 } },
          h('circle', { cx: 50, cy: 50, r: 50, style: { fill: color, opacity } }));
      }));
  }

  /* =========================================================
     RecoveryScore — thick horizontal bar; animated gradient fills to the
     score, with the big number reading on top.
     ========================================================= */
  function RecoveryScore({ value, height = 100, label = 'Recovery Score' }) {
    const v = Math.max(0, Math.min(100, Math.round(value)));
    const status = v >= 70 ? 'good' : v >= 50 ? 'warn' : 'bad';
    const palettes = {
      good: ['#10e08a', '#06c79a', '#3df0a6', '#12d6c0'],
      warn: ['#ffb020', '#ff9416', '#ffc94d', '#ff7a2e'],
      bad: ['#ff3d5e', '#ff2d6e', '#ff6a48', '#ff4d8b'],
    };
    const accent = status === 'good' ? 'var(--good)' : status === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const tag = status === 'good' ? 'Bereit' : status === 'warn' ? 'Moderat' : 'Geschont';
    const [w, setW] = useState(0);
    useEffect(() => { const id = requestAnimationFrame(() => setW(v)); return () => cancelAnimationFrame(id); }, [v]);
    return h('div', { className: 'col gap-10', style: { width: '100%' } },
      h('div', { className: 'row between center' },
        h('span', { className: 'label' }, label),
        h('span', { className: 'chip', style: { height: 22, fontSize: 10, color: accent } },
          h('span', { className: 'dot', style: { background: accent } }), tag)),
      h('div', { className: 'ff-recovery', style: { height } },
        h('div', { className: 'ff-recovery-fill', style: { width: `${w}%` } },
          h(AnimatedGradient, { colors: palettes[status], circleSize: Math.round(height * 2.4), blur: 11, opacity: .96 })),
        h('div', { className: 'ff-recovery-num' },
          h('span', { className: 'metric', style: { fontSize: Math.round(height * 0.62), lineHeight: 1 } }, v),
          h('span', { className: 'metric', style: { fontSize: Math.round(height * 0.24), marginLeft: 3, opacity: .85 } }, '%'))));
  }

  /* =========================================================
     LiquidOrb — circular vessel that fills from the bottom with the
     same animated grainy mesh as RecoveryScore. New shape, same soul.
     ========================================================= */
  function LiquidOrb({ value, max, color = 'accent', label, detail, size = 132, pct: pctOverride }) {
    const pct = pctOverride != null ? pctOverride : Math.max(0, Math.min(1, value / max));
    const base = `var(--${color})`;
    return h('div', { className: 'col center', style: { gap: 12 } },
      h('div', { className: 'ff-orb', style: { width: size, height: size, '--c': base } },
        h('span', { className: 'ff-orb-ring', 'aria-hidden': true }),
        h('div', { className: 'ff-orb-num' },
          h('span', { className: 'metric', style: { fontSize: Math.round(size * 0.27), lineHeight: 1 } }, Math.round(pct * 100)),
          h('span', { className: 'metric', style: { fontSize: Math.round(size * 0.12), opacity: .85, marginLeft: 1 } }, '%'))),
      h('div', { className: 'col center', style: { gap: 3 } },
        h('span', { className: 'label', style: { color: 'var(--text-2)', letterSpacing: '.04em' } }, label),
        detail && h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-3)' } }, detail)));
  }

  /* =========================================================
     ProgressRing — simple closed ring (weekly goals)
     ========================================================= */
  function ProgressRing({ value, max, size = 86, stroke = 9, color = 'accent', children, sub }) {
    const r = size / 2 - stroke / 2 - 1, c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, value / max));
    const [p, setP] = useState(0);
    useEffect(() => { const id = requestAnimationFrame(() => setP(pct)); return () => cancelAnimationFrame(id); }, [pct]);
    const gid = uid(), fid = uid();
    const col = cssVar(color);
    return h('div', { style: { position: 'relative', width: size, height: size } },
      h('svg', { width: size, height: size, style: { display: 'block', overflow: 'visible' } },
        h('defs', null,
          h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0', style: { stopColor: col, stopOpacity: .65 } }),
            h('stop', { offset: '1', style: { stopColor: col, stopOpacity: 1 } })),
          h('filter', { id: fid, x: '-50%', y: '-50%', width: '200%', height: '200%' },
            h('feGaussianBlur', { stdDeviation: '2.4', result: 'b' }),
            h('feMerge', null, h('feMergeNode', { in: 'b' }), h('feMergeNode', { in: 'SourceGraphic' })))),
        h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.07)', strokeWidth: stroke }),
        h('circle', {
          cx: size / 2, cy: size / 2, r, fill: 'none', stroke: `url(#${gid})`, strokeWidth: stroke,
          strokeLinecap: 'round', strokeDasharray: c,
          transform: `rotate(-90 ${size / 2} ${size / 2})`,
          filter: `url(#${fid})`,
          style: { strokeDashoffset: `${c * (1 - p)}px`, transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)' },
        })),
      h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        children, sub && h('div', { className: 'label', style: { fontSize: 9, marginTop: 1 } }, sub)));
  }

  /* =========================================================
     Sparkline
     ========================================================= */
  function Sparkline({ data, w = 120, hgt = 34, color = 'accent', fill = true, responsive = false }) {
    const min = Math.min(...data), max = Math.max(...data);
    const sx = lin(0, data.length - 1, 2, w - 2), sy = lin(min, max, hgt - 4, 4);
    const pts = data.map((v, i) => [sx(i), sy(v)]);
    const d = smoothPath(pts);
    const gid = uid(), glid = uid();
    return h('svg', { width: responsive ? '100%' : w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: responsive ? 'none' : 'xMidYMid meet', style: { display: 'block', overflow: 'visible' } },
      h('defs', null,
        glow(glid, 2.1),
        fill && h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
          h('stop', { offset: '0', style: { stopColor: cssVar(color), stopOpacity: .5 } }),
          h('stop', { offset: '.55', style: { stopColor: cssVar(color), stopOpacity: .12 } }),
          h('stop', { offset: '1', style: { stopColor: cssVar(color), stopOpacity: 0 } }))),
      fill && h('path', { d: `${d} L ${w - 2} ${hgt} L 2 ${hgt} Z`, fill: `url(#${gid})`, stroke: 'none' }),
      h('path', { d, fill: 'none', stroke: cssVar(color), strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', filter: `url(#${glid})` }));
  }

  /* =========================================================
     ZoneBars — horizontal time-in-zone (like screenshot)
     ========================================================= */
  function ZoneBars({ dist, max, unit = 'min', height = 8 }) {
    const mx = max || Math.max(...dist.map((d) => d.value), 1);
    return h('div', { className: 'col gap-10' }, dist.map((d, i) =>
      h('div', { key: i, className: 'row gap-12', style: { alignItems: 'center' } },
        h('div', { className: 'label mono', style: { width: 22, color: cssVar(d.zone) } }, d.z),
        h('div', { style: { flex: 1, height, background: 'rgba(255,255,255,.06)', borderRadius: 99, overflow: 'hidden' } },
          h('div', { style: { width: `${(d.value / mx) * 100}%`, height: '100%', background: cssVar(d.zone), borderRadius: 99, transition: 'width .8s var(--ease)' } })),
        h('div', { className: 'mono', style: { width: 52, textAlign: 'right', fontSize: 12, color: 'var(--text-2)' } }, `${d.value}${unit}`))));
  }

  /* =========================================================
     StackedZoneBar — single horizontal stacked bar (intensity %)
     ========================================================= */
  function StackedZoneBar({ parts, height = 10, radius = 99, glass = false, labels = false }) {
    const active = parts.filter((p) => p.value > 0);
    // Bars render at their final width immediately (no 0%\u2192full \"load\" fill on
    // mount, no width ease on value change) so the distribution is shown instantly.
    if (!glass) {
      return h('div', { style: { display: 'flex', height, borderRadius: radius, overflow: 'hidden', background: 'rgba(255,255,255,.05)' } },
        active.map((p, i) =>
          h('div', { key: i, title: `${p.label || p.zone}: ${p.value}%`, style: { width: `${p.value}%`, background: cssVar(p.zone) } })));
    }
    return h('div', { className: 'ff-glassbar', style: { height } },
      h('div', { style: { position: 'absolute', inset: 0, display: 'flex', borderRadius: 'inherit', overflow: 'hidden' } },
        active.map((p, i) => {
          const base = `var(--${p.zone})`;
          return h('div', { key: i, title: `${p.label || p.zone}: ${p.value}%`, className: 'ff-shimmer',
            style: { width: `${p.value}%`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, position: 'relative', overflow: 'hidden',
              background: base,
              boxShadow: i ? 'inset 1px 0 0 rgba(10,12,20,.45)' : 'none' } },
            labels && p.value >= 3 && h('span', { className: 'mono', style: { position: 'relative', zIndex: 1, fontSize: p.value < 8 ? 10 : 12.5, fontWeight: 700, letterSpacing: '-.01em', color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,.5)', whiteSpace: 'nowrap' } }, `${p.value}%`));
        })),
      h('span', { className: 'ff-glassbar-sheen' }));
  }

  /* =========================================================
     LoadChart — CTL (area) + ATL (line) + TSB (line, fill) — fitness/form
     ========================================================= */
  function LoadChart({ data, height = 240, days = 56, onHover, pins = [], onTogglePin }) {
    const [hover, setHover] = useState(null);
    const ref = useRef(null);
    const wrapRef = useRef(null);
    const [W, setW] = useState(1080);
    useEffect(() => {
      if (!wrapRef.current) return;
      const measure = () => { const w = wrapRef.current.clientWidth; if (w) setW(w); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);
    const slice = data.slice(-days);
    const H = height, padL = 0, padR = 0, padT = 16, padB = 22;
    const maxL = Math.max(...slice.map((d) => Math.max(d.ctl, d.atl))) * 1.1;
    const tsbVals = slice.map((d) => d.tsb);
    const tsbMax = Math.max(Math.abs(Math.min(...tsbVals)), Math.abs(Math.max(...tsbVals)), 10) * 1.2;
    const sx = lin(0, slice.length - 1, padL, W - padR);
    const syL = lin(0, maxL, H - padB, padT);
    const syT = lin(-tsbMax, tsbMax, H - padB, padT);
    const ctlPts = slice.map((d, i) => [sx(i), syL(d.ctl)]);
    const atlPts = slice.map((d, i) => [sx(i), syL(d.atl)]);
    const tsbPts = slice.map((d, i) => [sx(i), syT(d.tsb)]);
    const ctlD = smoothPath(ctlPts), atlD = smoothPath(atlPts), tsbD = smoothPath(tsbPts);
    const gid = uid(), gid2 = uid(), glC = uid(), glA = uid(), glT = uid();
    const zeroY = syT(0);
    const idxAt = (e) => {
      const rect = ref.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      return Math.max(0, Math.min(slice.length - 1, Math.round(((x - padL) / (W - padL - padR)) * (slice.length - 1))));
    };
    const onMove = (e) => { const i = idxAt(e); setHover(i); onHover && onHover(slice[i], i); };
    const onClick = (e) => { if (onTogglePin) onTogglePin(idxAt(e)); };
    const hd = hover != null ? slice[hover] : null;
    const dot = (x, y, color, r) => h('circle', { cx: x, cy: y, r: r || 4, fill: cssVar(color), stroke: '#0a0b0d', strokeWidth: 2 });
    return h('div', { ref: wrapRef, style: { position: 'relative' } },
      h('svg', { ref, viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'xMidYMid meet', onMouseMove: onMove, onClick, onMouseLeave: () => { setHover(null); onHover && onHover(null); }, style: { display: 'block', overflow: 'visible', cursor: 'crosshair' } },
        h('defs', null,
          glow(glC, 3.2), glow(glA, 2.4), glow(glT, 2.6),
          h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0', style: { stopColor: cssVar('viz-fitness'), stopOpacity: .6 } }),
            h('stop', { offset: '.5', style: { stopColor: cssVar('viz-fitness'), stopOpacity: .18 } }),
            h('stop', { offset: '1', style: { stopColor: cssVar('viz-fitness'), stopOpacity: 0 } })),
          h('linearGradient', { id: gid2, x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0', style: { stopColor: cssVar('viz-fatigue'), stopOpacity: .2 } }),
            h('stop', { offset: '1', style: { stopColor: cssVar('viz-fatigue'), stopOpacity: 0 } }))),
        // gridlines
        [0.25, 0.5, 0.75, 1].map((g, i) => h('line', { key: i, x1: 0, x2: W, y1: padT + g * (H - padT - padB), y2: padT + g * (H - padT - padB), stroke: 'rgba(255,255,255,.05)', strokeWidth: 1 })),
        // zero line for TSB
        h('line', { x1: 0, x2: W, y1: zeroY, y2: zeroY, stroke: 'rgba(255,255,255,.12)', strokeWidth: 1, strokeDasharray: '3 4' }),
        // CTL area + line
        h('path', { d: `${ctlD} L ${W} ${H - padB} L 0 ${H - padB} Z`, fill: `url(#${gid})`, stroke: 'none' }),
        h('path', { d: ctlD, fill: 'none', stroke: cssVar('viz-fitness'), strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round', filter: `url(#${glC})` }),
        // ATL line
        h('path', { d: atlD, fill: 'none', stroke: cssVar('viz-fatigue'), strokeWidth: 2.6, strokeDasharray: '5 4', strokeLinecap: 'round', opacity: .98, filter: `url(#${glA})` }),
        // TSB line
        h('path', { d: tsbD, fill: 'none', stroke: cssVar('viz-form'), strokeWidth: 2.8, strokeLinecap: 'round', opacity: .98, filter: `url(#${glT})` }),
        // pinned comparison points — vertical line + marker on each of the 3 lines + numbered badge
        pins.map((pi, k) => {
          const pd = slice[pi]; if (!pd) return null; const x = sx(pi);
          return h('g', { key: 'pin' + pi },
            h('line', { x1: x, x2: x, y1: padT - 1, y2: H - padB, stroke: 'rgba(255,255,255,.42)', strokeWidth: 1.5 }),
            dot(x, syL(pd.ctl), 'viz-fitness', 5),
            dot(x, syL(pd.atl), 'viz-fatigue', 5),
            dot(x, syT(pd.tsb), 'viz-form', 5),
            h('circle', { cx: x, cy: padT - 9, r: 8, fill: '#11131a', stroke: 'rgba(255,255,255,.5)', strokeWidth: 1 }),
            h('text', { x, y: padT - 9, textAnchor: 'middle', dominantBaseline: 'central', fill: '#fff', style: { font: '700 9px system-ui' } }, k + 1));
        }),
        // hover crosshair (suppressed on a day that is already pinned)
        hd && !pins.includes(hover) && h('line', { x1: sx(hover), x2: sx(hover), y1: padT, y2: H - padB, stroke: 'rgba(255,255,255,.22)', strokeWidth: 1 }),
        hd && !pins.includes(hover) && dot(sx(hover), syL(hd.ctl), 'viz-fitness', 4),
        hd && !pins.includes(hover) && dot(sx(hover), syL(hd.atl), 'viz-fatigue', 4),
        hd && !pins.includes(hover) && dot(sx(hover), syT(hd.tsb), 'viz-form', 4),
      ));
  }

  /* =========================================================
     TelemetryChart — single stream w/ area, hover, optional 2nd stream
     ========================================================= */
  function TelemetryChart({ series, height = 150, yLabel, unit = '', onHover, pins = [], onTogglePin }) {
    const [hover, setHover] = useState(null);
    const ref = useRef(null);
    const wrapRef = useRef(null);
    // echte Breite messen → viewBox 1:1 zur Pixelbreite, sonst quetscht
    // preserveAspectRatio:none die Kreis-Marker zu Ovalen und verzerrt die Kurve
    const [W, setW] = useState(900);
    useEffect(() => {
      if (!wrapRef.current) return;
      const measure = () => { const w = wrapRef.current.clientWidth; if (w) setW(w); };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);
    const H = height, padT = 12, padB = 18;
    const all = series.flatMap((s) => s.data);
    const min = Math.min(...all), max = Math.max(...all);
    const len = series[0].data.length;
    const sx = lin(0, len - 1, 0, W);
    const sy = lin(min - (max - min) * .08, max + (max - min) * .08, H - padB, padT);
    const compare = !!onTogglePin;
    const idxAt = (e) => {
      const rect = ref.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      return Math.max(0, Math.min(len - 1, Math.round((x / W) * (len - 1))));
    };
    const onMove = (e) => { const i = idxAt(e); setHover(i); onHover && onHover(i); };
    const onClick = (e) => { if (onTogglePin) onTogglePin(idxAt(e)); };
    const leave = () => { setHover(null); onHover && onHover(null); };
    return h('div', { ref: wrapRef, style: { position: 'relative' } },
      h('svg', { ref, viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', onMouseMove: onMove, onClick, onMouseLeave: leave, style: { display: 'block', overflow: 'visible', cursor: compare ? 'crosshair' : 'default' } },
        [0.33, 0.66].map((g, i) => h('line', { key: i, x1: 0, x2: W, y1: padT + g * (H - padT - padB), y2: padT + g * (H - padT - padB), stroke: 'rgba(255,255,255,.05)' })),
        series.map((s, si) => {
          const pts = s.data.map((v, i) => [sx(i), sy(v)]);
          const d = smoothPath(pts);
          const gid = uid(), glid = uid();
          return h(Fragment, { key: si },
            h('defs', null,
              glow(glid, 2.4),
              s.fill !== false && h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
                h('stop', { offset: '0', style: { stopColor: cssVar(s.color), stopOpacity: .42 } }),
                h('stop', { offset: '.55', style: { stopColor: cssVar(s.color), stopOpacity: .13 } }),
                h('stop', { offset: '1', style: { stopColor: cssVar(s.color), stopOpacity: 0 } }))),
            s.fill !== false && h('path', { d: `${d} L ${W} ${H - padB} L 0 ${H - padB} Z`, fill: `url(#${gid})` }),
            h('path', { d, fill: 'none', stroke: cssVar(s.color), strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round', filter: `url(#${glid})` }));
        }),
        // pinned comparison points — vertical line + marker on each series + numbered badge
        pins.map((pi, k) => h('g', { key: 'pin' + pi },
          h('line', { x1: sx(pi), x2: sx(pi), y1: padT - 1, y2: H - padB, stroke: 'rgba(255,255,255,.42)', strokeWidth: 1.5 }),
          series.map((s, si) => h('circle', { key: si, cx: sx(pi), cy: sy(s.data[pi]), r: 5, fill: cssVar(s.color), stroke: '#0a0b0d', strokeWidth: 2 })),
          h('circle', { cx: sx(pi), cy: padT - 7, r: 8, fill: '#11131a', stroke: 'rgba(255,255,255,.5)', strokeWidth: 1 }),
          h('text', { x: sx(pi), y: padT - 7, textAnchor: 'middle', dominantBaseline: 'central', fill: '#fff', style: { font: '700 9px system-ui' } }, k + 1))),
        hover != null && !pins.includes(hover) && h('line', { x1: sx(hover), x2: sx(hover), y1: padT, y2: H - padB, stroke: 'rgba(255,255,255,.2)' }),
        hover != null && !pins.includes(hover) && series.map((s, si) => h('circle', { key: si, cx: sx(hover), cy: sy(s.data[hover]), r: 3.5, fill: cssVar(s.color), stroke: '#0a0b0d', strokeWidth: 2 })),
      ),
      !compare && hover != null && h('div', { className: 'tip', style: { left: `${(sx(hover) / W) * 100}%`, top: 4 } },
        series.map((s, si) => h('div', { key: si, className: 'mono', style: { fontSize: 12, color: cssVar(s.color) } }, `${s.label} ${Math.round(s.data[hover])}${s.unit || unit}`))));
  }

  /* =========================================================
     BarSeries — weekly volume bars w/ target line
     ========================================================= */
  function BarSeries({ data, height = 200, target, unit = 'h', color = 'accent' }) {
    const [hover, setHover] = useState(null);
    const W = 900, H = height, padB = 26, padT = 12, gap = 0.42;
    const max = Math.max(...data.map((d) => d.value), target || 0) * 1.12;
    const bw = (W / data.length) * (1 - gap);
    const sy = lin(0, max, H - padB, padT);
    return h('div', { style: { position: 'relative' } },
      h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
        target != null && h('line', { x1: 0, x2: W, y1: sy(target), y2: sy(target), stroke: cssVar('accent'), strokeWidth: 1.4, strokeDasharray: '6 5', opacity: .8 }),
        data.map((d, i) => {
          const x = (i + 0.5) * (W / data.length) - bw / 2;
          const yv = sy(d.value);
          const hl = hover === i;
          return h('g', { key: i, onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) },
            h('rect', { x: (i) * (W / data.length), y: 0, width: W / data.length, height: H, fill: 'transparent' }),
            h('rect', { x, y: yv, width: bw, height: Math.max(2, H - padB - yv), rx: 8, fill: cssVar(color), opacity: hl ? 1 : .82, style: { transition: 'opacity .2s' } }),
            h('text', { x: x + bw / 2, y: H - 8, textAnchor: 'middle', fill: 'var(--text-3)', style: { font: '600 11px system-ui' } }, d.label));
        })),
      hover != null && h('div', { className: 'tip', style: { left: `${((hover + 0.5) / data.length) * 100}%`, top: 0 } },
        h('span', { className: 'label' }, data[hover].label),
        h('div', { className: 'mono strong', style: { fontSize: 13 } }, `${FF.fmt.n(data[hover].value, 1)} ${unit}`)));
  }

  /* =========================================================
     RadarChart — weekly rhythm (load per weekday)
     ========================================================= */
  function RadarChart({ axes, values, size = 230, color = 'viz-rhythm', meta, onHover, pins = [], onTogglePin }) {
    const cx = size / 2, cy = size / 2, R = size / 2 - 34;
    const n = axes.length;
    const max = Math.max(...values, 1);
    const [hover, setHover] = useState(null); // index
    const gid = uid(), glid = uid();
    const pt = (i, rad) => [cx + rad * Math.cos((Math.PI * 2 * i) / n - Math.PI / 2), cy + rad * Math.sin((Math.PI * 2 * i) / n - Math.PI / 2)];
    const poly = values.map((v, i) => pt(i, (v / max) * R));
    const rings = [0.33, 0.66, 1];
    const set = (i) => { setHover(i); onHover && onHover(i); };
    const pinOf = (i) => pins.indexOf(i);

    return h('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { overflow: 'visible' } },
      h('defs', null,
        glow(glid, 3.4),
        h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
          h('stop', { offset: '0', style: { stopColor: cssVar('viz-rhythm') } }),
          h('stop', { offset: '1', style: { stopColor: cssVar('viz-rhythm2') } }))),
      rings.map((rr, ri) => h('polygon', { key: ri, points: axes.map((_, i) => pt(i, rr * R).join(',')).join(' '), fill: 'none', stroke: 'rgba(255,255,255,.07)', strokeWidth: 1 })),
      axes.map((_, i) => { const [x, y] = pt(i, R); return h('line', { key: i, x1: cx, y1: cy, x2: x, y2: y, stroke: 'rgba(255,255,255,.06)' }); }),
      h('polygon', { points: poly.map((p) => p.join(',')).join(' '), fill: `url(#${gid})`, fillOpacity: .26, stroke: `url(#${gid})`, strokeWidth: 2.4, strokeLinejoin: 'round', filter: `url(#${glid})` }),
      poly.map((p, i) => {
        const pi = pinOf(i);
        const on = hover === i || pi >= 0;
        return h('circle', { key: i, cx: p[0], cy: p[1], r: pi >= 0 ? 5.5 : on ? 4.5 : 2.6, fill: cssVar(color),
          stroke: on ? '#0a0b0d' : 'none', strokeWidth: on ? 2 : 0, style: { transition: 'r .12s var(--ease)' } });
      }),
      // numbered badge on pinned vertices
      poly.map((p, i) => { const pi = pinOf(i); if (pi < 0) return null;
        const [bx, by] = pt(i, (values[i] / max) * R + 15);
        return h('g', { key: 'pb' + i },
          h('circle', { cx: bx, cy: by, r: 8, fill: cssVar(color) }),
          h('text', { x: bx, y: by + 0.5, textAnchor: 'middle', dominantBaseline: 'middle', fill: '#0a0b0d', style: { font: '700 10px system-ui' } }, pi + 1)); }),
      axes.map((a, i) => { const [x, y] = pt(i, R + 16); return h('text', { key: 'a' + i, x, y, textAnchor: 'middle', dominantBaseline: 'middle', fill: (hover === i || pinOf(i) >= 0) ? cssVar(color) : 'var(--text-3)', style: { font: '600 10px system-ui', letterSpacing: '.08em' } }, a); }),
      // generous transparent hit-targets over each vertex
      meta && poly.map((p, i) => h('circle', { key: 'h' + i, cx: p[0], cy: p[1], r: 18, fill: 'transparent',
        style: { cursor: onTogglePin ? 'pointer' : 'default' }, onMouseEnter: () => set(i), onMouseLeave: () => set(null),
        onClick: onTogglePin ? () => onTogglePin(i) : undefined })));
  }

  /* =========================================================
     Donut — intensity distribution
     ========================================================= */
  function Donut({ parts, size = 130, thick = 16, center }) {
    const r = size / 2 - thick / 2 - 1, c = 2 * Math.PI * r;
    const total = parts.reduce((a, p) => a + p.value, 0) || 1;
    let acc = 0;
    return h('div', { style: { position: 'relative', width: size, height: size } },
      h('svg', { width: size, height: size, style: { transform: 'rotate(-90deg)' } },
        h('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'rgba(255,255,255,.05)', strokeWidth: thick }),
        parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = h('circle', { key: i, cx: size / 2, cy: size / 2, r, fill: 'none', stroke: cssVar(p.zone || p.color), strokeWidth: thick, strokeDasharray: `${len} ${c - len}`, strokeDashoffset: -acc, style: { transition: 'stroke-dasharray .8s var(--ease)' } });
          acc += len; return el;
        })),
      center && h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } }, center));
  }

  window.Charts = { RecoveryGauge, RecoveryScore, AnimatedGradient, LiquidOrb, ProgressRing, Sparkline, ZoneBars, StackedZoneBar, LoadChart, TelemetryChart, BarSeries, RadarChart, Donut };
})();
