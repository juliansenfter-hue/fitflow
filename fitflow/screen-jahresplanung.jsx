/* FitFlow — Jahresplanung (annual periodization) */
(function () {
  const { createElement: h, useState, useEffect, useRef, Fragment } = React;
  const { Card, Stat, Tabs, AiInsight, EmptyState } = window.UI;
  const C = window.Charts;
  const Icon = window.Icon;
  const fmt = FF.fmt;

  /* motion: honour the user's reduced-motion setting (skip count-ups & draw-ins) */
  const RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  /* entrance plays once per app session — re-mounts (data bootstrap, screen switches)
     render instantly and stay put instead of replaying the whole choreography */
  let YR_SEEN = false;
  const still = () => RM || YR_SEEN;
  /* count-up — a metric settles into place with an ease-out curve instead of popping in */
  function useCountUp(target, dur = 900) {
    const [v, setV] = useState(still() ? target : 0);
    useEffect(() => {
      if (still()) { setV(target); return; }
      let raf, t0;
      const tick = (t) => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / dur);
        setV(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [target]);
    return Math.round(v);
  }
  /* progress bar that grows to its value once mounted (CSS transition does the easing) */
  function GrowBar({ pct, delay = 250 }) {
    const [on, setOn] = useState(still());
    useEffect(() => { if (!still()) { const t = setTimeout(() => setOn(true), delay); return () => clearTimeout(t); } }, []);
    return h('div', { className: 'ff-yr-bar' }, h('span', { style: { width: on ? `${Math.min(100, pct)}%` : 0 } }));
  }

  const PHASE_INFO = {
    Recovery: { color: 'z1', icon: 'heart', desc: 'Freie Einteilung. Aktive Erholung ohne strukturierte Reize — Bewegung nach Gefühl, Fokus auf Regeneration und mentale Pause.' },
    'Off-Season': { color: 'z2', icon: 'waves', desc: 'Grundlagenausdauer. Hoher Anteil GA1/GA2-Volumen baut die aerobe Basis und Kapillarisierung auf, dazu Krafterhalt.' },
    Load: { color: 'z4', icon: 'flame', desc: 'Intensiver Aufbaublock. Wahlweise polarisiert (80/20), pyramidal oder schwellenorientiert — steigender CTL Richtung Wettkampf.' },
  };
  /* Load-phase methods (the athlete can assign any of these to each segment) */
  const METHODS = {
    pol: { id: 'pol', label: 'Polarisiert', headline: 'Polarisiertes Training', sub: '80 % Z1–Z2 · 20 % Z4–Z5', color: 'z4', desc: 'Klare Trennung: viel ruhiges Grundlagenvolumen plus wenige sehr harte VO₂max-Reize. Kaum Z3.', dist: [{ zone: 'z1', value: 45 }, { zone: 'z2', value: 35 }, { zone: 'z3', value: 5 }, { zone: 'z4', value: 8 }, { zone: 'z5', value: 7 }] },
    thr: { id: 'thr', label: 'Schwelle', headline: 'Schwellen-Training', sub: 'Fokus Z3–Z4', color: 'z3', desc: 'Schwellenorientiert: hoher Anteil an Sweet-Spot- und Threshold-Arbeit zur Anhebung der FTP/LT2.', dist: [{ zone: 'z1', value: 35 }, { zone: 'z2', value: 25 }, { zone: 'z3', value: 22 }, { zone: 'z4', value: 14 }, { zone: 'z5', value: 4 }] },
    pyr: { id: 'pyr', label: 'Pyramidal', headline: 'Pyramidales Training', sub: 'abnehmend Z1 → Z5', color: 'z4', desc: 'Pyramidale Verteilung mit solidem Z2–Z3-Anteil, zur Spitze hin weniger. Wettkampfspezifischer Block.', dist: [{ zone: 'z1', value: 40 }, { zone: 'z2', value: 30 }, { zone: 'z3', value: 18 }, { zone: 'z4', value: 8 }, { zone: 'z5', value: 4 }] },
  };
  const METHOD_ORDER = ['pol', 'thr', 'pyr'];

  /* persistence — the athlete's Load-phase plan survives navigation + reload */
  const LOAD_KEY = 'ff-loadplan-v1';
  function loadSavedPlan() {
    try {
      const s = JSON.parse(localStorage.getItem(LOAD_KEY));
      if (s && Array.isArray(s.loadSegs) && s.loadSegs.every((x) => x && METHODS[x.method] && typeof x.len === 'number')) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  function saverPlan(plan) {
    try { localStorage.setItem(LOAD_KEY, JSON.stringify(plan)); } catch (e) { /* ignore */ }
  }

  /* Load phase spans Wo 18–43 (months 4–10). The KI-Vorschlag splits it pol → thr → pyr. */
  const LOAD_W0 = 18, LOAD_W1 = 43, LOAD_M0 = 4, LOAD_M1 = 10;
  const AI_SEGS = [{ method: 'pol', len: 11 }, { method: 'thr', len: 9 }, { method: 'pyr', len: 6 }];

  /* week range (Wo a–b) of each segment */
  function segRanges(segs) {
    let acc = LOAD_W0;
    return segs.map((s) => { const start = acc, end = acc + s.len - 1; acc = end + 1; return { start, end }; });
  }
  /* turn the load segments into timeline blocks (months) so the chart reflects edits */
  function segsToBlocks(segs) {
    const total = segs.reduce((a, s) => a + s.len, 0) || 1;
    let accM = LOAD_M0;
    return segs.map((s) => {
      const frac = s.len / total, start = accM, end = accM + frac * (LOAD_M1 - LOAD_M0); accM = end;
      const m = METHODS[s.method];
      return { phase: 'Load', sub: m.label, start, end, color: m.color, desc: m.desc };
    });
  }
  /* move the boundary between segment i and its neighbour by delta weeks (min 2 each) */
  function adjustLen(segs, i, delta) {
    const out = segs.map((s) => ({ ...s }));
    const j = i < out.length - 1 ? i + 1 : i - 1;
    if (j < 0) return out;
    const ni = out[i].len + delta, nj = out[j].len - delta;
    if (ni < 2 || nj < 2) return out;
    out[i].len = ni; out[j].len = nj; return out;
  }
  /* nudge one zone of a distribution by delta %, rebalancing the rest, total stays 100 */
  function adjustDist(dist, idx, delta) {
    const vals = dist.map((z) => z.value);
    const target = Math.max(0, Math.min(100, vals[idx] + delta));
    const d = target - vals[idx];
    const others = vals.map((_, k) => k).filter((k) => k !== idx);
    const sum = others.reduce((a, k) => a + vals[k], 0);
    const out = vals.slice(); out[idx] = target;
    if (sum > 0) others.forEach((k) => { out[k] = vals[k] - d * (vals[k] / sum); });
    let r = out.map((v) => Math.round(Math.max(0, v)));
    let resid = 100 - r.reduce((a, b) => a + b, 0);
    if (resid !== 0) {
      const cand = others.slice().sort((a, b) => r[b] - r[a]);
      for (const k of cand) { if (r[k] + resid >= 0) { r[k] += resid; resid = 0; break; } }
      if (resid !== 0) r[idx] = Math.max(0, r[idx] + resid);
    }
    return dist.map((z, k) => ({ ...z, value: r[k] }));
  }
  const PHASE_FOCUS = {
    'Freie Einteilung': 'Regeneration \u00b7 Bewegung nach Gef\u00fchl',
    'Grundlagenausdauer': 'GA1/GA2-Volumen \u00b7 Krafterhalt',
    'Polarisiert': 'VO\u2082max-Reize \u00b7 80/20',
    'Schwelle': 'Sweet-Spot & Threshold',
    'Pyramidal': 'Wettkampf-Spezifik',
    'Transition': 'Volumen runter \u00b7 Ausklang',
  };
  const EVENT_DETAILS = {
    '\u00d6tztaler Radmarathon': { date: '29. Aug', dist: '227 km \u00b7 5\u2009500 hm', prio: 'A \u00b7 Saisonh\u00f6hepunkt' },
    'Wachau Halbmarathon': { date: '12. Okt', dist: '21,1 km', prio: 'B \u00b7 Formtest' },
  };

  function PeriodTimeline({ an, blocks, activeBlock, selPhase, setSelPhase, onPickLoad }) {
    const months = FF.months;
    const ctl = an.ctlTarget;
    const wk = ctl.length;                         // 52
    const maxCtl = Math.max(...ctl);
    const peakIdx = ctl.indexOf(maxCtl);
    const yMax = Math.ceil((maxCtl + 8) / 15) * 15;
    const W = 1000, plotH = 224, padTop = 46, padBot = 14;
    const innerH = plotH - padTop - padBot;
    const fW = (i) => i / (wk - 1);
    const xOf = (f) => f * W;
    const yOf = (v) => padTop + (1 - v / yMax) * innerH;
    const pts = ctl.map((v, i) => [xOf(fW(i)), yOf(v)]);
    const curveD = 'M ' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
    const areaD = `${curveD} L ${W} ${plotH} L 0 ${plotH} Z`;
    const gridVals = [0, Math.round(yMax / 3), Math.round((2 * yMax) / 3), yMax];
    const curF = an.currentMonth / 12;
    const curIdx = Math.round(curF * (wk - 1));
    const targetCtl = Math.round(ctl[curIdx]);
    const actualCtl = FF.fitnessScore;
    const peakF = peakIdx / (wk - 1);
    const yPct = (v) => (yOf(v) / plotH) * 100;
    const aEvent = an.targetEvents.find((e) => e.type === 'A');
    const weeksToA = aEvent ? Math.round((aEvent.month / 12 - curF) * wk) : null;

    const [hoverPhase, setHoverPhase] = useState(null);
    const [hoverEvent, setHoverEvent] = useState(null);
    const [showActual, setShowActual] = useState(false);
    const effPhase = hoverPhase != null ? hoverPhase : selPhase;

    /* scrubber — the pointer position across the year (0..1), tracked 1:1 */
    const [scrub, setScrub] = useState(null);
    /* draw-in — the CTL curve sweeps in from the left on mount (first visit only) */
    const [drawn, setDrawn] = useState(still());
    useEffect(() => { if (!still()) { const t = requestAnimationFrame(() => setDrawn(true)); return () => cancelAnimationFrame(t); } }, []);
    const onScrubMove = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setScrub(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
    };

    /* actual CTL line from FF.load (last ~16 weeks ending today) */
    const ld = FF.load || [], nLd = ld.length;
    const actPts = ld.map((d, i) => [xOf(curF - (nLd - 1 - i) / 365), yOf(d.ctl)]).filter((p) => p[0] >= -4);
    const actualD = actPts.length ? 'M ' + actPts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ') : '';

    /* taper window \u2014 ~2 weeks before the A event */
    const taperF0 = aEvent ? aEvent.month / 12 - 2 / wk : 0;
    const taperF1 = aEvent ? aEvent.month / 12 : 0;
    const aHover = !!(aEvent && hoverEvent != null && an.targetEvents[hoverEvent] === aEvent);

    const legend = h('div', { className: 'row center gap-12 ff-hide-sm' },
      h(Lg, { color: 'z1', label: 'Recovery' }), h(Lg, { color: 'z2', label: 'Off-Season' }), h(Lg, { color: 'z4', label: 'Load' }),
      h('div', { className: 'row center gap-6' },
        h('span', { style: { width: 14, height: 0, borderTop: '2px dashed var(--accent)' } }),
        h('span', { className: 'label', style: { color: 'var(--text-2)' } }, 'Plan')),
      showActual && h('div', { className: 'row center gap-6' },
        h('span', { style: { width: 14, height: 0, borderTop: '2px solid var(--info)' } }),
        h('span', { className: 'label', style: { color: 'var(--text-2)' } }, 'Ist')));
    const headerRight = h('div', { className: 'row center gap-12' },
      h('button', { type: 'button', onClick: () => setShowActual((v) => !v), className: 'chip',
        style: { cursor: 'pointer', height: 24, fontSize: 10.5, transition: 'background .2s, color .2s, border-color .2s',
          color: showActual ? 'var(--info)' : 'var(--text-2)',
          borderColor: showActual ? 'color-mix(in srgb, var(--info) 50%, transparent)' : 'var(--line)',
          background: showActual ? 'color-mix(in srgb, var(--info) 14%, transparent)' : 'var(--panel-2)' } },
        h(Icon, { name: 'activity', size: 12 }), 'Ist vs. Plan'),
      legend);

    return h(Card, { title: 'Periodisierung ' + an.season, icon: 'year', className: 'ff-yr-in', style: { '--yi': 4 },
        info: 'Jahresplan: Phasenbl\u00f6cke, geplante CTL-Rampe (Form) und Zielwettk\u00e4mpfe auf einer Zeitachse.',
        right: headerRight },
      h('div', { className: 'col', style: { gap: 0, position: 'relative' } },
        /* floating event tooltip */
        hoverEvent != null && (() => {
          const e = an.targetEvents[hoverEvent], d = EVENT_DETAILS[e.name] || {};
          const wks = Math.round((e.month / 12 - curF) * wk);
          const isA = e.type === 'A';
          const tRow = (k, val) => h('div', { className: 'row between center gap-16', style: { fontSize: 11.5 } },
            h('span', { style: { color: 'var(--text-3)' } }, k), h('span', { className: 'mono', style: { color: 'var(--text)' } }, val));
          return h('div', { style: { position: 'absolute', left: `${Math.min(86, Math.max(14, (e.month / 12) * 100))}%`, top: 34, transform: 'translateX(-50%)', zIndex: 60,
              minWidth: 210, padding: '11px 13px', borderRadius: 11, background: 'var(--panel)', border: '1px solid var(--line-2)',
              boxShadow: '0 18px 40px -18px rgba(0,0,0,.8)', pointerEvents: 'none' } },
            h('div', { className: 'row center gap-7', style: { marginBottom: 8 } },
              h('span', { style: { color: isA ? 'var(--z5)' : 'var(--text-2)' } }, h(Icon, { name: 'trophy', size: 14 })),
              h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, e.name)),
            h('div', { className: 'col gap-5' },
              tRow('Datum', d.date || '\u2014'), tRow('Strecke', d.dist || '\u2014'), tRow('Priorit\u00e4t', d.prio || (isA ? 'A' : 'B')),
              tRow('Countdown', `in ${wks} Wochen`)),
            isA && h('div', { className: 'row center gap-6', style: { marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 11, color: 'var(--z5)' } },
              h(Icon, { name: 'clock', size: 12 }), 'Taper: 2 Wochen vor dem Wettkampf'));
        })(),
        /* event flags above the plot */
        h('div', { style: { position: 'relative', height: 32, zIndex: 6 } },
          an.targetEvents.map((e, i) => {
            const isA = e.type === 'A';
            const hov = hoverEvent === i;
            return h('div', { key: i, onMouseEnter: () => setHoverEvent(i), onMouseLeave: () => setHoverEvent(null),
                style: { position: 'absolute', left: `${(e.month / 12) * 100}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' } },
              h('span', { className: 'chip', style: { height: 22, fontSize: 10, whiteSpace: 'nowrap', cursor: 'pointer', color: isA ? 'var(--z5)' : 'var(--text-2)',
                  borderColor: isA ? 'color-mix(in srgb, var(--z5) 45%, transparent)' : 'var(--line)',
                  background: hov ? (isA ? 'color-mix(in srgb, var(--z5) 24%, transparent)' : 'var(--line)') : (isA ? 'color-mix(in srgb, var(--z5) 12%, transparent)' : 'var(--panel-2)'),
                  transition: 'background .2s' } },
                h(Icon, { name: 'trophy', size: 11 }), e.name.split(' ')[0],
                h('span', { style: { opacity: .65, marginLeft: 1 } }, isA ? '\u00b7 A' : '\u00b7 B')),
              h('span', { style: { width: 1, height: 10, background: isA ? 'var(--z5)' : 'var(--line-2)' } }));
          })),
        /* integrated plot: phase zones + gridlines + CTL curve + markers */
        h('div', { onPointerMove: onScrubMove, onPointerLeave: () => setScrub(null),
            style: { position: 'relative', height: plotH, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', background: 'var(--panel-2)', touchAction: 'pan-y' } },
          /* subtle phase boundary hairlines \u2014 the segmented bar below carries the phase colors */
          blocks.slice(1).map((b, i) => h('div', { key: 'pb' + i, style: { position: 'absolute', left: `${(b.start / 12) * 100}%`, top: 0, bottom: 0, width: 1, background: 'var(--line)', pointerEvents: 'none' } })),
          /* taper window before the A event */
          aEvent && h('div', { style: { position: 'absolute', left: `${taperF0 * 100}%`, width: `${(taperF1 - taperF0) * 100}%`, top: 0, bottom: 0, pointerEvents: 'none', zIndex: 2,
              background: `repeating-linear-gradient(45deg, color-mix(in srgb, var(--z5) ${aHover ? 28 : 12}%, transparent) 0 5px, transparent 5px 11px)`,
              borderLeft: `1px dashed color-mix(in srgb, var(--z5) ${aHover ? 80 : 45}%, transparent)`, transition: 'background .2s' } },
            h('span', { className: 'label', style: { position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%) rotate(-90deg)', transformOrigin: 'center', fontSize: 8.5, color: 'var(--z5)', whiteSpace: 'nowrap', opacity: aHover ? 1 : .65 } }, 'Taper')),
          /* CTL curve + gridlines + event verticals (SVG) */
          h('svg', { viewBox: `0 0 ${W} ${plotH}`, width: '100%', height: '100%', preserveAspectRatio: 'none', style: { position: 'absolute', inset: 0, display: 'block', pointerEvents: 'none' } },
            h('defs', null,
              h('linearGradient', { id: 'ctlfill2', x1: '0', y1: '0', x2: '0', y2: '1' },
                h('stop', { offset: '0', style: { stopColor: 'var(--accent)', stopOpacity: .28 } }),
                h('stop', { offset: '1', style: { stopColor: 'var(--accent)', stopOpacity: 0 } })),
              /* the curve sweeps in left → right by widening this clip on mount */
              h('clipPath', { id: 'ffYrDraw' },
                h('rect', { x: 0, y: 0, height: plotH, width: drawn ? W : 0, style: { transition: 'width 1.3s var(--ease) .25s' } }))),
            gridVals.map((v) => h('line', { key: 'g' + v, x1: 0, x2: W, y1: yOf(v), y2: yOf(v), stroke: 'var(--line)', strokeWidth: 1 })),
            an.targetEvents.map((e, i) => h('line', { key: 'ev' + i, x1: xOf(e.month / 12), x2: xOf(e.month / 12), y1: 0, y2: plotH,
              stroke: e.type === 'A' ? 'color-mix(in srgb, var(--z5) 55%, transparent)' : 'var(--line-2)', strokeWidth: 1.5, strokeDasharray: '4 4' })),
            h('g', { clipPath: 'url(#ffYrDraw)' },
              h('path', { d: areaD, fill: 'url(#ctlfill2)' }),
              h('path', { d: curveD, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeDasharray: '7 5', strokeLinecap: 'round' }),
              showActual && actualD && h('path', { d: actualD, fill: 'none', stroke: 'var(--info)', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
          /* y-axis labels */
          gridVals.map((v) => h('span', { key: 'yl' + v, className: 'mono', style: {
            position: 'absolute', left: 6, top: `${yPct(v)}%`, transform: 'translateY(-50%)', fontSize: 9.5, color: 'var(--text-4)',
            background: 'color-mix(in srgb, var(--panel) 65%, transparent)', padding: '0 3px', borderRadius: 3, pointerEvents: 'none' } }, v)),
          h('span', { className: 'label', style: { position: 'absolute', left: 6, top: 6, fontSize: 8.5, color: 'var(--text-4)' } }, 'CTL'),
          /* peak marker */
          h('div', { style: { position: 'absolute', left: `${peakF * 100}%`, top: `${yPct(maxCtl)}%`, transform: 'translate(-50%,-50%)', zIndex: 4, pointerEvents: 'none' } },
            h('span', { style: { display: 'block', width: 11, height: 11, borderRadius: 99, background: 'var(--panel)', border: '2px solid var(--accent)' } })),
          h('span', { className: 'mono', style: { position: 'absolute', left: `${peakF * 100}%`, top: `calc(${yPct(maxCtl)}% + 16px)`, transform: 'translateX(-50%)', fontSize: 10, color: 'var(--accent)', whiteSpace: 'nowrap', pointerEvents: 'none', fontWeight: 600, background: 'color-mix(in srgb, var(--panel) 80%, transparent)', padding: '1px 6px', borderRadius: 5 } }, `Peak ${Math.round(maxCtl)}`),
          /* scrubber — hairline, curve dot and value pill follow the pointer */
          scrub != null && (() => {
            const si = Math.min(wk - 1, Math.round(scrub * (wk - 1)));
            const sm = months[Math.min(11, Math.floor(scrub * 12))];
            return h(Fragment, null,
              h('div', { className: 'ff-yr-scrub', style: { left: `${scrub * 100}%` } }),
              h('div', { className: 'ff-yr-scrub-dot', style: { left: `${scrub * 100}%`, top: `${yPct(ctl[si])}%` } }),
              h('div', { className: 'ff-yr-scrub-pill', style: { left: `${Math.min(88, Math.max(12, scrub * 100))}%`, top: 8 } },
                h('span', { className: 'mono', style: { color: 'var(--text-2)' } }, `Wo ${si + 1} · ${sm}`),
                h('span', { className: 'mono', style: { fontWeight: 700, color: 'var(--accent-bright)' } }, `CTL ${Math.round(ctl[si])}`)));
          })(),
          /* today line */
          h('div', { className: 'ff-yr-today', style: { position: 'absolute', left: `${curF * 100}%`, top: 0, bottom: 0, width: 2, background: 'var(--accent-bright)', transform: 'translateX(-1px)', zIndex: 3, pointerEvents: 'none' } },
            h('span', { className: 'label', style: { position: 'absolute', bottom: 6, left: 6, color: 'var(--accent-bright)', fontSize: 9, whiteSpace: 'nowrap' } }, 'Heute')),
          /* target point on the planned curve (hollow) */
          h('div', { style: { position: 'absolute', left: `${curF * 100}%`, top: `${yPct(ctl[curIdx])}%`, transform: 'translate(-50%,-50%)', zIndex: 4, pointerEvents: 'none' } },
            h('span', { style: { display: 'block', width: 9, height: 9, borderRadius: 99, background: 'var(--panel)', border: '2px dashed var(--accent)' } })),
          /* actual CTL today (solid) + value pill — shows the gap to plan */
          h('div', { style: { position: 'absolute', left: `${curF * 100}%`, top: `${yPct(actualCtl)}%`, transform: 'translate(-50%,-50%)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', pointerEvents: 'none' } },
            h('span', { style: { display: 'block', width: 13, height: 13, borderRadius: 99, flexShrink: 0, background: 'var(--accent-bright)', border: '2px solid var(--panel)', boxShadow: '0 0 12px color-mix(in srgb, var(--accent) 75%, transparent)' } }),
            h('span', { className: 'mono', style: { fontSize: 10.5, fontWeight: 600, color: 'var(--text)', background: 'color-mix(in srgb, var(--panel) 78%, transparent)', padding: '1px 6px', borderRadius: 5 } }, `CTL ${actualCtl}`))),
        /* phase bar \u2014 slim segmented strip, 1:1 aligned with the plot's time axis.
           Hover previews a phase, click selects it (same handlers the old zones had). */
        h('div', { className: 'ff-yr-phasebar' },
          blocks.map((b, i) => {
            const sel = selPhase === i;
            const dim = effPhase != null && effPhase !== i;
            return h('button', { key: i, type: 'button',
              className: 'ff-yr-phaseseg ff-yr-zone' + (sel ? ' is-sel' : '') + (dim ? ' is-dim' : ''),
              onMouseEnter: () => setHoverPhase(i), onMouseLeave: () => setHoverPhase(null),
              onClick: () => { const next = sel ? null : i; setSelPhase(next); if (next != null && b.phase === 'Load') onPickLoad(blocks.slice(0, i).filter((x) => x.phase === 'Load').length); },
              'aria-label': `${b.phase} \u00b7 ${b.sub}`,
              style: { '--yi': i, '--seg-c': `var(--${b.color})`, flex: `${b.end - b.start} 1 0` } });
          }),
          h('span', { className: 'ff-yr-phasebar-now', style: { left: `${curF * 100}%` } })),
        /* month axis */
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', marginTop: 6 } },
          months.map((m, i) => h('div', { key: m, className: 'label', style: { textAlign: 'center', fontSize: 10, color: i === an.currentMonth ? 'var(--accent-bright)' : 'var(--text-4)' } }, m))),
        /* phase caption \u2014 names what the pointer is on (default: current phase) */
        (() => {
          const b = effPhase != null ? blocks[effPhase] : activeBlock;
          const sw = Math.round((b.start / 12) * wk) + 1, ew = Math.round((b.end / 12) * wk);
          const isSel = effPhase != null && effPhase === selPhase;
          return h('div', { className: 'row between center wrap gap-8', style: { marginTop: 10 } },
            h('div', { key: 'cap' + (effPhase != null ? effPhase : 'act'), className: 'ff-yr-swap row center gap-8', style: { minWidth: 0 } },
              h('span', { style: { width: 9, height: 9, borderRadius: 3, background: `var(--${b.color})`, flexShrink: 0 } }),
              h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' } }, `${b.phase} \u00b7 ${b.sub}`),
              h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' } }, `Wo ${sw}\u2013${ew} \u00b7 ${ew - sw + 1} Wo`),
              isSel ? h('span', { className: 'chip chip--solid', style: { height: 17, fontSize: 8.5 } }, 'Gew\u00e4hlt')
                    : b === activeBlock && h('span', { className: 'chip chip--solid', style: { height: 17, fontSize: 8.5 } }, 'Aktiv')),
            h('span', { className: 'ff-hide-sm', style: { fontSize: 10.5, color: 'var(--text-4)', whiteSpace: 'nowrap' } },
              'Leiste anklicken f\u00fcr Details \u00b7 Kurve mit dem Zeiger abfahren'));
        })(),
        /* footer: phase detail (hover/selected) OR default stat strip */
        (() => {
          if (effPhase == null) {
            return h('div', { key: 'strip', className: 'ff-yr-swap row center gap-10 wrap', style: { marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--line)' } },
              h(PeriodStat, { label: 'Aktuelle Phase', value: `${activeBlock.phase} \u00b7 ${activeBlock.sub}`, color: activeBlock.color }),
              h('span', { style: { width: 1, height: 30, background: 'var(--line)' } }),
              h(PeriodStat, { label: 'CTL \u2192 Peak', value: `${FF.fitnessScore} \u2192 ${Math.round(maxCtl)}`, color: 'accent' }),
              h('span', { style: { width: 1, height: 30, background: 'var(--line)' } }),
              h(PeriodStat, { label: 'W\u00f6chentliche Rampe', value: '+3\u20135 CTL', color: 'good' }),
              aEvent && h('span', { style: { width: 1, height: 30, background: 'var(--line)' } }),
              aEvent && h(PeriodStat, { label: 'Bis A-Wettkampf', value: `${weeksToA} Wochen`, color: 'z5' }));
          }
          const b = blocks[effPhase];
          const swI = Math.round((b.start / 12) * (wk - 1)), ewI = Math.min(wk - 1, Math.round((b.end / 12) * (wk - 1)));
          const gain = Math.round(ctl[ewI] - ctl[swI]);
          const seg = ctl.slice(swI, ewI + 1), avg = seg.reduce((a, c) => a + c, 0) / (seg.length || 1);
          const weeklyTss = Math.round(avg * 7);
          const dur = Math.round((b.end / 12) * wk) - (Math.round((b.start / 12) * wk) + 1) + 1;
          const preview = hoverPhase != null && hoverPhase !== selPhase;
          const ms = (l, v, col) => h('div', { className: 'col', style: { gap: 2, minWidth: 0 } },
            h('span', { className: 'label', style: { fontSize: 9.5 } }, l),
            h('span', { className: 'mono', style: { fontSize: 13, fontWeight: 600, color: col ? `var(--${col})` : 'var(--text)', whiteSpace: 'nowrap' } }, v));
          return h('div', { key: 'ph' + effPhase, className: 'ff-yr-swap col gap-9', style: { marginTop: 10, paddingTop: 14, borderTop: '1px solid var(--line)' } },
            h('div', { className: 'row between center wrap gap-8' },
              h('div', { className: 'row center gap-8', style: { minWidth: 0 } },
                h('span', { style: { width: 10, height: 10, borderRadius: 3, background: `var(--${b.color})`, flexShrink: 0 } }),
                h('span', { className: 'strong', style: { fontSize: 14, fontWeight: 600 } }, `${b.phase} \u00b7 ${b.sub}`),
                h('span', { className: 'chip chip--solid', style: { height: 18, fontSize: 9 } }, preview ? 'Vorschau' : 'Gew\u00e4hlt')),
              selPhase != null && h('button', { type: 'button', className: 'chip', style: { cursor: 'pointer', height: 22, fontSize: 10 }, onClick: () => setSelPhase(null) }, h(Icon, { name: 'x', size: 12 }), 'Auswahl l\u00f6sen')),
            h('span', { style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)' } }, b.desc),
            h('div', { className: 'row gap-20 wrap', style: { marginTop: 2 } },
              ms('Dauer', `${dur} Wochen`),
              ms('\u00d8 Wochen-TSS', `~${weeklyTss}`),
              ms('CTL-Zuwachs', `${gain >= 0 ? '+' : ''}${gain}`, gain >= 0 ? 'good' : 'bad'),
              ms('Fokus', PHASE_FOCUS[b.sub] || '\u2014')));
        })()));
  }

  /* Trainingsfokus — tinted phase tiles that fill the card. Each tile shows the
     phase, its season week total and a mini year-strip marking where it sits;
     tapping unfolds the description. */
  function FocusList({ blocks, activeBlock, now }) {
    const [open, setOpen] = useState(activeBlock.phase);
    /* keep the active phase unfolded when it changes (e.g. after data bootstrap) */
    useEffect(() => { setOpen(activeBlock.phase); }, [activeBlock.phase]);
    const weeksOf = (p) => Math.round((blocks.filter((b) => b.phase === p).reduce((a, b) => a + (b.end - b.start), 0) / 12) * 52);
    return h('div', { className: 'col gap-12', style: { flex: 1 } }, Object.keys(PHASE_INFO).map((p, idx) => {
      const pi = PHASE_INFO[p];
      const isActive = activeBlock.phase === p;
      const isOpen = open === p;
      const spans = blocks.filter((b) => b.phase === p);
      return h('div', { key: p, className: 'ff-yr-acc ff-yr-zone' + (isOpen ? ' is-open' : '') + (isActive ? ' is-active' : ''),
          style: { '--yi': idx, '--acc-c': `var(--${pi.color})` } },
        h('button', { type: 'button', className: 'ff-yr-acc-head', 'aria-expanded': isOpen, onClick: () => setOpen(isOpen ? null : p) },
          h('span', { className: 'row center gap-12', style: { width: '100%' } },
            h('span', { className: 'ff-yr-acc-ic' }, h(Icon, { name: pi.icon, size: 17 })),
            h('span', { className: 'col', style: { gap: 2, minWidth: 0, flex: 1 } },
              h('span', { className: 'row center gap-7' },
                h('span', { className: 'strong', style: { fontSize: 14, fontWeight: 600 } }, p),
                isActive && h('span', { className: 'chip chip--solid', style: { height: 16, fontSize: 8.5, padding: '0 6px' } }, 'Aktiv')),
              h('span', { style: { fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
                spans.map((b, si) => h(Fragment, { key: si }, si > 0 ? ' · ' : null,
                  h('span', { style: b === activeBlock ? { color: `var(--${b.color})`, fontWeight: 700 } : null }, b.sub))))),
            h('span', { className: 'col', style: { gap: 1, alignItems: 'flex-end', flexShrink: 0 } },
              h('span', { className: 'mono strong', style: { fontSize: 15, fontWeight: 700, color: 'var(--text)' } }, `${weeksOf(p)} Wo`),
              h('span', { className: 'label', style: { fontSize: 8.5 } }, 'der Saison')),
            h('span', { className: 'ff-yr-acc-chev' }, h(Icon, { name: 'chevR', size: 14 }))),
          /* mini season strip — where this phase sits in the year */
          h('span', { className: 'ff-yr-acc-strip' },
            spans.map((b, si) => h('span', { key: si, className: 'sgm' + (b === activeBlock ? ' is-now' : ''),
              style: { left: `${(b.start / 12) * 100}%`, width: `${((b.end - b.start) / 12) * 100}%`,
                background: `var(--${b.color})`, boxShadow: b === activeBlock ? `0 0 8px var(--${b.color})` : 'none' } })),
            h('span', { className: 'now', style: { left: `${now * 100}%` } }))),
        h('div', { className: 'ff-yr-acc-body' },
          h('div', { className: 'ff-yr-acc-inner' },
            h('span', { style: { display: 'block', padding: '0 16px 14px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-2)' } }, pi.desc))));
    }));
  }

  function PeriodStat({ label, value, color }) {
    return h('div', { className: 'col', style: { gap: 3, minWidth: 0, flex: '1 1 auto' } },
      h('span', { className: 'label', style: { fontSize: 9.5 } }, label),
      h('div', { className: 'row center gap-7', style: { minWidth: 0 } },
        color && h('span', { style: { width: 8, height: 8, borderRadius: 99, background: `var(--${color})`, flexShrink: 0 } }),
        h('span', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, value)));
  }

  function Jahresplanung({ onNav }) {
    if (FF.empty) return h(EmptyState, { icon: 'calendar', title: 'Noch keine Jahresplanung',
      body: 'Lege Saisonziele und Wettkämpfe an, sobald dein Profil eingerichtet ist. Verbinde zuerst einen Dienst oder fülle dein Profil aus.',
      cta: 'Profil ausfüllen', onCta: () => onNav && onNav('profil') });
    const an = FF.annual;
    const saved = loadSavedPlan();
    const [loadMode, setLoadMode] = useState(saved ? saved.loadMode || 'ai' : 'ai');     // 'ai' = KI-Vorschlag · 'manual' = selbst planen
    const [loadSegs, setLoadSegs] = useState(saved ? saved.loadSegs : AI_SEGS);  // the athlete's load-phase plan
    const [distOv, setDistOv] = useState(saved && saved.distOv ? saved.distOv : {});           // segIndex -> custom intensity distribution
    const [selSeg, setSelSeg] = useState(saved && typeof saved.selSeg === 'number' ? saved.selSeg : 0);            // selected load segment in the editor
    const [selPhase, setSelPhase] = useState(null);
    /* entrance ran already? then render still; flag the session once this mount ends */
    const [wasSeen] = useState(YR_SEEN);
    useEffect(() => () => { YR_SEEN = true; }, []);

    /* persist the plan whenever it changes */
    useEffect(() => { saverPlan({ loadMode, loadSegs, distOv, selSeg }); }, [loadMode, loadSegs, distOv, selSeg]);

    const W = 1100, H = 70;
    const monthW = W / 12;
    const curX = (an.currentMonth + 0.5) * monthW;
    /* derived header facts — computed from the plan instead of hardcoded */
    const wkNow = Math.max(1, Math.round((an.currentMonth / 12) * 52));
    const aEv = an.targetEvents.find((e) => e.type === 'A');
    const weeksToA = aEv ? Math.max(0, Math.round(((aEv.month - an.currentMonth) / 12) * 52)) : null;
    const aDetail = aEv ? (EVENT_DETAILS[aEv.name] || {}) : {};
    const ctlNow = useCountUp(FF.fitnessScore);
    const wksToACount = useCountUp(weeksToA || 0);
    const loadBlocks = segsToBlocks(loadSegs);
    const blocks = [an.blocks[0], an.blocks[1], ...loadBlocks, an.blocks[an.blocks.length - 1]];
    const activeBlock = blocks.find((b) => an.currentMonth >= b.start && an.currentMonth < b.end) || loadBlocks[0];
    // CTL curve points across the year
    const ctlPts = an.ctlTarget.map((v, i) => [(i / 51) * W, 0]);
    const maxCtl = Math.max(...an.ctlTarget);
    const curveH = 96;
    const curve = an.ctlTarget.map((v, i) => [(i / 51) * W, curveH - (v / maxCtl) * (curveH - 12)]);
    const curveD = 'M ' + curve.map((p) => p.join(' ')).join(' L ');

    return h('div', { className: 'ff-grid' + (wasSeen ? ' ff-yr-still' : ''), style: { gap: 18 } },
      /* Phase summary tiles — staggered entrance, live values settle in */
      h('div', { className: 'ff-grid grid-4', style: { gap: 18 } },
        h('div', { className: 'tile ff-yr-in', style: { '--yi': 0 } },
          h('span', { className: 'label' }, 'Aktuelle Phase'),
          h('div', { className: 'row center gap-9' },
            h('span', { style: { width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: `color-mix(in srgb, var(--${PHASE_INFO[activeBlock.phase].color}) 16%, transparent)`, color: `var(--${PHASE_INFO[activeBlock.phase].color})` } },
              h(Icon, { name: PHASE_INFO[activeBlock.phase].icon, size: 16 })),
            h('span', { className: 'metric', style: { fontSize: 22 } }, activeBlock.phase)),
          h('span', { style: { fontSize: 12, color: 'var(--text-3)' } }, activeBlock.sub)),
        h('div', { className: 'tile ff-yr-in', style: { '--yi': 1 } },
          h(Stat, { label: 'Saisonfortschritt', value: `Woche ${wkNow}`, unit: '/ 52',
            sub: h('div', { className: 'col gap-6', style: { flex: 1, minWidth: 120 } },
              h(GrowBar, { pct: (wkNow / 52) * 100 }),
              h('span', { style: { fontSize: 11.5, color: 'var(--text-3)' } }, `Saison ${an.season} · ${Math.round((wkNow / 52) * 100)} %`)) })),
        h('div', { className: 'tile ff-yr-in', style: { '--yi': 2 } },
          h(Stat, { label: 'Form (CTL)', value: `${ctlNow}`, accent: 'accent',
            sub: h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } }, `Peak-Ziel ${Math.round(maxCtl)} (Aug)`) })),
        h('div', { className: 'tile ff-yr-in', style: { '--yi': 3 } },
          h('span', { className: 'label' }, 'Nächster A-Wettkampf'),
          h('div', { className: 'row center gap-8' },
            h('span', { style: { color: 'var(--z5)' } }, h(Icon, { name: 'trophy', size: 16 })),
            h('span', { className: 'metric mono', style: { fontSize: 22 } }, `${wksToACount} Wo`)),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } },
            aEv ? `${aEv.name.split(' ')[0]} · ${aDetail.date || ''}` : '—')),
      ),

      /* Periodization timeline */
      h(PeriodTimeline, { an, blocks, activeBlock, selPhase, setSelPhase, onPickLoad: setSelSeg }),

      /* Phase definitions + Load variant explorer */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 18 } },
        h(Card, { title: 'Trainingsfokus', icon: 'target', className: 'ff-yr-in ff-hero-card', style: { '--yi': 5 },
          info: 'Die drei Phasentypen der Saison. Antippen zeigt, was in der Phase trainiert wird.' },
          h(FocusList, { blocks, activeBlock, now: an.currentMonth / 12 })),
        h(LoadPhasePlanner, { loadMode, setLoadMode, loadSegs, setLoadSegs, distOv, setDistOv, selSeg, setSelSeg })));
  }

  /* ---- Load-Phase planner: KI-Vorschlag vs. selbst gewählte Methoden & Grenzen ---- */
  function LoadPhasePlanner({ loadMode, setLoadMode, loadSegs, setLoadSegs, distOv, setDistOv, selSeg, setSelSeg }) {
    const manual = loadMode === 'manual';
    const ranges = segRanges(loadSegs);
    const i = Math.min(selSeg, loadSegs.length - 1);
    const seg = loadSegs[i];
    const method = METHODS[seg.method];
    const dist = distOv[i] || method.dist;
    const isEdited = JSON.stringify(loadSegs) !== JSON.stringify(AI_SEGS) || Object.keys(distOv).length > 0;

    const setMode = (m) => { setLoadMode(m); if (m === 'ai') { setLoadSegs(AI_SEGS); setDistOv({}); setSelSeg(0); } };
    const setMethodOf = (idx, mid) => { setLoadSegs(loadSegs.map((s, k) => (k === idx ? { ...s, method: mid } : s))); const nd = { ...distOv }; delete nd[idx]; setDistOv(nd); };
    const nudgeZone = (zi, d) => setDistOv({ ...distOv, [i]: adjustDist(dist, zi, d) });
    const resetToAI = () => { setLoadSegs(AI_SEGS); setDistOv({}); setSelSeg(0); };

    /* boundary drag — grab the handle between two segments and pull; segments follow
       the pointer 1:1 (transitions off while dragging), snapping to whole weeks, min 2 each */
    const [dragK, setDragK] = useState(null);
    const totalLen = loadSegs.reduce((a, s) => a + s.len, 0);
    const SEG_GAP = 5;                                   // must match the segbar's flex gap
    /* handle positions are MEASURED from the real segment edges, so the pins sit
       dead-centre in each gap regardless of flex rounding — also mid-drag */
    const barRef = useRef(null);
    const [handleXs, setHandleXs] = useState([]);
    const measure = () => {
      const bar = barRef.current; if (!bar) return;
      const btns = Array.prototype.slice.call(bar.querySelectorAll('.ff-yr-seg'));
      if (btns.length < 2) { setHandleXs([]); return; }
      /* offsetLeft/offsetWidth = layout geometry — immune to the entrance animation's
         scale transform, which skews getBoundingClientRect */
      setHandleXs(btns.slice(0, -1).map((b, k) =>
        (b.offsetLeft + b.offsetWidth + btns[k + 1].offsetLeft) / 2));
    };
    useEffect(measure, [loadSegs, loadMode]);
    useEffect(() => {
      window.addEventListener('resize', measure);
      const bar = barRef.current;
      if (bar) bar.addEventListener('transitionend', measure);
      return () => { window.removeEventListener('resize', measure); if (bar) bar.removeEventListener('transitionend', measure); };
    }, []);
    const dragBoundary = (k, clientX, handleEl) => {
      const r = handleEl.parentElement.getBoundingClientRect();
      /* map pointer x onto week fractions, discounting the fixed gaps between segments */
      const track = r.width - (loadSegs.length - 1) * SEG_GAP;
      const frac = Math.min(1, Math.max(0, (clientX - r.left - (k * SEG_GAP + SEG_GAP / 2)) / track));
      const cur = loadSegs.slice(0, k + 1).reduce((a, s) => a + s.len, 0);
      let d = Math.round(frac * totalLen) - cur;
      d = Math.max(-(loadSegs[k].len - 2), Math.min(loadSegs[k + 1].len - 2, d));
      if (d !== 0) setLoadSegs(adjustLen(loadSegs, k, d));
    };

    const sBtn = (label, on, disabled) => h('button', { type: 'button', onClick: on, disabled, className: 'ff-yr-step',
      style: { width: 24, height: 24, borderRadius: 7, flexShrink: 0, border: '1px solid var(--line-2)', background: 'var(--panel-2)',
        color: disabled ? 'var(--text-4)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 13, lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 } }, label);

    const modeTabs = h(Tabs, { items: [{ value: 'ai', label: 'KI-Vorschlag' }, { value: 'manual', label: 'Selbst planen' }], value: loadMode, onChange: setMode });

    return h(Card, { title: 'Load-Phase · Methodik & Grenzen', icon: 'flame', className: 'ff-yr-in', style: { '--yi': 6 },
        info: 'Lege fest, welche Methode (polarisiert / Schwelle / pyramidal) in welchem Abschnitt der Load-Phase trainiert wird — oder übernimm den KI-Vorschlag.',
        right: modeTabs },
      h('div', { className: 'col gap-16' },
        /* segment bar across the load phase */
        h('div', { className: 'col gap-8' },
          h('div', { className: 'row between center' },
            h('span', { className: 'label' }, `Load-Phase · Wo ${LOAD_W0}–${LOAD_W1} · bis Ötztaler`),
            !manual && h('span', { className: 'chip chip--solid', style: { height: 19, fontSize: 9.5 } }, h(Icon, { name: 'spark', size: 11 }), 'KI-Vorschlag')),
          h('div', { ref: barRef, className: 'ff-yr-segbar row' + (dragK != null ? ' is-dragging' : ''), style: { gap: SEG_GAP, alignItems: 'stretch', position: 'relative' } },
            loadSegs.map((s, k) => {
              const m = METHODS[s.method]; const sel = k === i; const rg = ranges[k];
              return h('button', { key: k, type: 'button', onClick: () => setSelSeg(k), className: 'ff-yr-seg',
                style: { flex: `${s.len} 1 0`, minWidth: 0, cursor: 'pointer', textAlign: 'left', padding: '11px 12px', borderRadius: 12,
                  border: `1px solid ${sel ? 'var(--accent-bright)' : `color-mix(in srgb, var(--${m.color}) 30%, var(--line))`}`,
                  boxShadow: sel ? '0 0 0 1px var(--accent-bright), 0 12px 28px -20px color-mix(in srgb, var(--accent) 85%, transparent)' : 'inset 0 1px 0 rgba(255,255,255,.05)',
                  background: `linear-gradient(150deg, color-mix(in srgb, var(--${m.color}) ${sel ? 26 : 13}%, transparent), color-mix(in srgb, var(--${m.color}) ${sel ? 8 : 3}%, transparent) 70%)` } },
                h('div', { className: 'row center gap-6', style: { minWidth: 0 } },
                  h('span', { style: { width: 8, height: 8, borderRadius: 2, background: `var(--${m.color})`, flexShrink: 0 } }),
                  h('span', { className: 'strong', style: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, m.label)),
                h('div', { className: 'mono', style: { fontSize: 10, color: 'var(--text-3)', marginTop: 3, whiteSpace: 'nowrap' } }, `Wo ${rg.start}–${rg.end} · ${s.len} Wo`));
            }),
            /* drag handles on the boundaries (manual mode) */
            manual && loadSegs.slice(0, -1).map((s, k) => {
              const cum = loadSegs.slice(0, k + 1).reduce((a, x) => a + x.len, 0);
              /* measured gap centre; analytic fallback until the first measurement lands */
              const left = handleXs[k] != null ? handleXs[k]
                : `calc((100% - ${(loadSegs.length - 1) * SEG_GAP}px) * ${(cum / totalLen).toFixed(5)} + ${k * SEG_GAP + SEG_GAP / 2}px)`;
              return h('div', { key: 'h' + k, className: 'ff-yr-handle' + (dragK === k ? ' is-drag' : ''),
                onPointerDown: (e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* no live pointer (e.g. synthetic) */ } setDragK(k); },
                onPointerMove: (e) => { if (dragK === k) dragBoundary(k, e.clientX, e.currentTarget); },
                onPointerUp: () => setDragK(null), onPointerCancel: () => setDragK(null),
                style: { left } },
                h('span', { className: 'ff-yr-handle-grip' }),
                dragK === k && h('span', { className: 'ff-yr-handle-pill mono' }, `Wo ${ranges[k].end}`));
            })),
          manual && h('div', { className: 'row center gap-6', style: { fontSize: 10.5, color: 'var(--text-4)' } },
            h(Icon, { name: 'plus', size: 11 }), 'Griffe ziehen, um Grenzen zu verschieben · Segment antippen für Methode')),

        /* selected segment: tinted method sheet (re-animates when segment or method changes) */
        h('div', { key: `${i}-${seg.method}`, className: 'ff-yr-swap ff-yr-sheet col gap-10', style: { '--sheet-c': `var(--${method.color})` } },
          h('div', { className: 'row between center wrap gap-10' },
            h('div', { className: 'col gap-2', style: { minWidth: 0 } },
              h('span', { className: 'metric', style: { fontSize: 19, lineHeight: 1.15 } }, method.headline),
              h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-3)' } }, `${method.sub} · Wo ${ranges[i].start}–${ranges[i].end}`)),
            manual
              ? h(Tabs, { items: METHOD_ORDER.map((id) => ({ value: id, label: METHODS[id].label })), value: seg.method, onChange: (mid) => setMethodOf(i, mid) })
              : h('span', { className: 'chip chip--solid' }, h(Icon, { name: 'spark', size: 12 }), 'KI-Vorschlag')),
          h('span', { style: { fontSize: 13, lineHeight: 1.55, color: 'var(--text-2)' } }, method.desc),

          /* intensity distribution — the "Grenzen" */
          h('div', { className: 'col gap-8' },
            h('div', { className: 'row between center' },
              h('span', { className: 'label' }, 'Intensitätsverteilung · Grenzen'),
              manual && h('span', { className: 'label', style: { fontSize: 9.5, color: 'var(--text-4)' } }, 'anpassbar')),
            h('div', { className: 'ff-yr-dist' }, h(C.StackedZoneBar, { parts: dist, height: 14 })),
            /* per-zone rows with animated tracks; steppers only in manual mode */
            h('div', { className: 'col gap-6', style: { marginTop: 6 } }, dist.map((z, zi) =>
              h('div', { key: z.zone, className: 'row center gap-10' },
                h('span', { className: 'row center gap-6', style: { width: 44, flexShrink: 0 } },
                  h('span', { style: { width: 8, height: 8, borderRadius: 99, background: `var(--${z.zone})`, flexShrink: 0 } }),
                  h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-2)' } }, z.zone.toUpperCase())),
                h('span', { className: 'ff-yr-ztrack' },
                  h('span', { style: { width: `${z.value}%`, background: `var(--${z.zone})` } })),
                h('span', { className: 'mono', style: { fontSize: 12, fontWeight: 600, minWidth: 36, textAlign: 'right', color: 'var(--text)' } }, `${z.value}%`),
                manual && h('span', { className: 'row center gap-5' },
                  sBtn('−', () => nudgeZone(zi, -5), z.value <= 0),
                  sBtn('+', () => nudgeZone(zi, 5), z.value >= 100)))))),

          /* footer insight */
          manual
            ? h(AiInsight, { title: 'KI-Referenz' },
                h('div', { className: 'col gap-9' },
                  h('span', null, 'Du planst die Load-Phase selbst. FitFlows Vorschlag wäre Polarisiert (Wo 18–28) → Schwelle (Wo 29–37) → Pyramidal (Wo 38–43) Richtung Ötztaler.'),
                  isEdited && h('button', { type: 'button', className: 'chip', style: { cursor: 'pointer', alignSelf: 'flex-start', height: 26, fontSize: 11, borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)', color: 'var(--accent-bright)' }, onClick: resetToAI },
                    h(Icon, { name: 'spark', size: 12 }), 'KI-Vorschlag übernehmen')))
            : h(AiInsight, { title: 'KI-Periodisierung' }, `Für dieses Segment der Load-Phase empfiehlt FitFlow ${method.headline.toLowerCase()}. Bei einem CTL von ${FF.fitnessScore} und gutem TSB-Trend ist eine wöchentliche Rampe von +3–5 CTL tragbar. Wechsle auf „Selbst planen", um Methoden und Grenzen frei zu setzen.`))));
  }

  function Lg({ color, label }) {
    return h('div', { className: 'row center gap-6' },
      h('span', { style: { width: 10, height: 10, borderRadius: 3, background: `var(--${color})` } }),
      h('span', { className: 'label', style: { color: 'var(--text-2)' } }, label));
  }

  window.Screens = window.Screens || {};
  window.Screens.Jahresplanung = Jahresplanung;
})();
