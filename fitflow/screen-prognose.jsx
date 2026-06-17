/* FitFlow — Form-Prognose & Taper-Optimizer
   Forward-projects CTL/ATL/TSB to the target race using the SAME EWMA model as
   data.js, then auto-tunes a taper so Form (TSB) peaks exactly on race day.
   The competition shows the past — this shows (and shapes) the future. */
(function () {
  const { createElement: h, useState, useMemo, useEffect, useRef, Fragment } = React;
  const { Card, Tabs, AiInsight, EmptyState } = window.UI;
  const Icon = window.Icon;
  const fmt = FF.fmt;

  /* ---- EWMA constants — identical to data.js so past + future are one model ---- */
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  // weekly load shape (Mon..Sun): easy/hard/long rhythm, sums to 1.0
  const SHAPE = [0.06, 0.20, 0.09, 0.18, 0.05, 0.24, 0.18];
  const climbDaily = (3 / 7) / kC; // daily TSS-over-CTL that pulls ~+3 CTL / week

  /* target events, day-offsets measured from TODAY (06 Jun 2026) */
  const EVENTS = [
    { id: 'otz', name: 'Ötztaler Radmarathon', short: 'Ötztaler', type: 'A', offset: 84, sport: 'bike', dist: '227 km · 5 500 hm', dateLbl: '29. Aug' },
    { id: 'wachau', name: 'Wachau Halbmarathon', short: 'Wachau', type: 'B', offset: 128, sport: 'run', dist: '21,1 km', dateLbl: '12. Okt' },
  ];

  /* ---- pure forward simulation ---- */
  function project(start, raceOffset, peakCtl, taperWeeks, taperDrop, tail) {
    let ctl = start.ctl, atl = start.atl;
    const total = raceOffset + (tail || 10);
    const taperStart = raceOffset - taperWeeks * 7; // day index where the taper begins
    const series = [];
    for (let d = 1; d <= total; d++) {
      const date = FF.addDays(FF.TODAY, d);
      const dow = (date.getDay() + 6) % 7; // 0 = Mon
      let mean;
      if (d <= taperStart) {
        mean = Math.min(ctl + climbDaily, peakCtl);
      } else {
        const tp = Math.min(1, (d - taperStart) / (taperWeeks * 7));
        mean = ctl * (1 - taperDrop * tp);
      }
      const tss = Math.max(0, mean * SHAPE[dow] * 7);
      ctl = ctl + kC * (tss - ctl);
      atl = atl + kA * (tss - atl);
      series.push({ date, ctl: +ctl.toFixed(2), atl: +atl.toFixed(2), tsb: +(ctl - atl).toFixed(2), taper: d > taperStart });
    }
    return { series, raceIdx: raceOffset - 1, taperStart };
  }
  // index of the highest TSB within [start of taper window .. race + a few days]
  function peakIdx(series, from, to) {
    let bi = from, bv = -1e9;
    for (let i = from; i <= to && i < series.length; i++) { if (series[i].tsb > bv) { bv = series[i].tsb; bi = i; } }
    return bi;
  }
  /* KI: scan taper length × volume-cut, land race-day TSB on target with the
     peak as close to race day as possible. */
  function optimizeTaper(start, raceOffset, peakCtl, target) {
    let best = null;
    for (const tw of [1, 2, 3]) {
      for (let drop = 0.30; drop <= 0.621; drop += 0.04) {
        const p = project(start, raceOffset, peakCtl, tw, drop, 8);
        const race = p.series[p.raceIdx];
        const pk = peakIdx(p.series, p.taperStart, p.raceIdx + 6);
        const peakOff = pk - p.raceIdx;
        const cost = Math.abs(race.tsb - target) + Math.abs(peakOff) * 1.6;
        if (!best || cost < best.cost) best = { cost, tw, drop: +drop.toFixed(2), raceTsb: race.tsb, peakOff };
      }
    }
    return best;
  }

  /* ---- form / readiness bands ---- */
  function raceBand(tsb) {
    if (tsb >= 26) return { t: 'Überspitzt', c: 'warn', note: 'sehr frisch, Fitness verloren' };
    if (tsb >= 15) return { t: 'Renn-Optimal', c: 'good', note: 'ideale Wettkampfform' };
    if (tsb >= 5) return { t: 'Knapp erholt', c: 'warn', note: 'noch Restermüdung' };
    return { t: 'Zu ermüdet', c: 'bad', note: 'Taper zu kurz' };
  }
  function timingVerdict(off) {
    const a = Math.abs(off);
    if (a <= 1) return { t: 'Punktgenau getimt', c: 'good', icon: 'check' };
    if (a <= 3) return { t: 'Nah dran', c: 'warn', icon: 'clock' };
    return { t: `${a} Tage ${off < 0 ? 'zu früh' : 'zu spät'}`, c: 'bad', icon: 'clock' };
  }

  /* ---- smooth cubic path ---- */
  function smooth(pts) {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  }
  const lin = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);

  /* =========================================================
     ForecastChart — past (solid) + projection (dashed) for CTL/ATL/TSB,
     taper window shaded, race-day flag, optional no-taper ghost, hover scrub.
     ========================================================= */
  function ForecastChart({ hist, plan, ghost, raceIdx, taperStart, ev, peak }) {
    const wrapRef = useRef(null), svgRef = useRef(null);
    const [W, setW] = useState(1000);
    const [hover, setHover] = useState(null);
    useEffect(() => {
      if (!wrapRef.current) return;
      const measure = () => { const w = wrapRef.current.clientWidth; if (w) setW(w); };
      measure();
      const ro = new ResizeObserver(measure); ro.observe(wrapRef.current);
      return () => ro.disconnect();
    }, []);
    const H = 320, padT = 26, padB = 26;
    const Hn = hist.length;
    // connected projection (start from today's actual point)
    const conn = [hist[Hn - 1], ...plan];
    const N = Hn + plan.length;          // total columns; today sits at Hn-1
    const xi = (planK) => (Hn - 1) + planK; // x-index of conn[planK]
    const all = hist.concat(plan);
    const maxLoad = Math.max(...all.map((d) => Math.max(d.ctl, d.atl))) * 1.12;
    const tsbAbs = Math.max(...all.map((d) => Math.abs(d.tsb)), 12) * 1.15;
    const sx = lin(0, N - 1, 0, W);
    const syL = lin(0, maxLoad, H - padB, padT);
    const syT = lin(-tsbAbs, tsbAbs, H - padB, padT);
    const zeroY = syT(0);

    const histPts = (k) => hist.map((d, i) => [sx(i), syL(d[k])]);
    const histTsb = hist.map((d, i) => [sx(i), syT(d.tsb)]);
    const planPts = (k) => conn.map((d, i) => [sx(xi(i)), syL(d[k])]);
    const planTsb = conn.map((d, i) => [sx(xi(i)), syT(d.tsb)]);
    const ghostTsb = ghost ? [hist[Hn - 1], ...ghost].map((d, i) => [sx(xi(i)), syT(d.tsb)]) : null;

    const xToday = sx(Hn - 1);
    const xRace = sx(xi(raceIdx + 1));
    const xTaper = sx(xi(taperStart));
    const xPeak = peak != null ? sx(xi(peak + 1)) : null;
    const raceD = plan[raceIdx];
    const peakD = peak != null ? plan[peak] : null;

    const idxAt = (e) => {
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * W;
      return Math.max(0, Math.min(N - 1, Math.round((x / W) * (N - 1))));
    };
    const dataAt = (gi) => gi < Hn ? hist[gi] : plan[gi - Hn];
    const hd = hover != null ? dataAt(hover) : null;
    const hx = hover != null ? sx(hover) : 0;

    const vline = (x, color, w, dash) => h('line', { x1: x, x2: x, y1: padT - 6, y2: H - padB, stroke: color, strokeWidth: w || 1, strokeDasharray: dash || 'none' });
    const dot = (x, y, color, r) => h('circle', { cx: x, cy: y, r: r || 4, fill: `var(--${color})`, stroke: '#0a0b0d', strokeWidth: 2 });

    const Lg = ({ color, label, dash }) => h('div', { className: 'row center gap-6' },
      h('span', { style: { width: 15, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} var(--${color})` } }),
      h('span', { className: 'label', style: { color: 'var(--text-2)' } }, label));

    return h('div', { ref: wrapRef, style: { position: 'relative' } },
      // hover readout
      hd && h('div', { style: { position: 'absolute', left: `${Math.min(82, Math.max(2, (hx / W) * 100))}%`, top: 0, transform: 'translateX(-50%)', zIndex: 20,
          padding: '8px 11px', borderRadius: 10, background: 'var(--panel)', border: '1px solid var(--line-2)', boxShadow: '0 16px 36px -18px rgba(0,0,0,.8)', pointerEvents: 'none', whiteSpace: 'nowrap' } },
        h('div', { className: 'row center gap-7', style: { marginBottom: 5 } },
          h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-2)' } }, fmt.dateFull(hd.date)),
          hover >= Hn && h('span', { className: 'chip', style: { height: 18, fontSize: 8.5, color: 'var(--accent-bright)' } }, 'Prognose')),
        h('div', { className: 'row center gap-12' },
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--viz-fitness)' } }, `CTL ${Math.round(hd.ctl)}`),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--viz-fatigue)' } }, `ATL ${Math.round(hd.atl)}`),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--viz-form)' } }, `TSB ${hd.tsb > 0 ? '+' : ''}${Math.round(hd.tsb)}`))),
      h('svg', { ref: svgRef, viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none',
          onMouseMove: (e) => setHover(idxAt(e)), onMouseLeave: () => setHover(null),
          style: { display: 'block', overflow: 'visible', cursor: 'crosshair' } },
        h('defs', null,
          h('linearGradient', { id: 'fcCtl', x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0', style: { stopColor: 'var(--viz-fitness)', stopOpacity: .42 } }),
            h('stop', { offset: '.6', style: { stopColor: 'var(--viz-fitness)', stopOpacity: .1 } }),
            h('stop', { offset: '1', style: { stopColor: 'var(--viz-fitness)', stopOpacity: 0 } }))),
        // gridlines
        [0.25, 0.5, 0.75, 1].map((g, i) => h('line', { key: 'g' + i, x1: 0, x2: W, y1: padT + g * (H - padT - padB), y2: padT + g * (H - padT - padB), stroke: 'rgba(255,255,255,.05)', strokeWidth: 1 })),
        // taper shaded window
        h('rect', { x: xTaper, y: padT - 6, width: Math.max(0, xRace - xTaper), height: H - padB - padT + 6, fill: 'color-mix(in srgb, var(--z5) 9%, transparent)' }),
        h('rect', { x: xTaper, y: padT - 6, width: Math.max(0, xRace - xTaper), height: H - padB - padT + 6, fill: 'url(#fcTaper)' }),
        h('defs', null, h('pattern', { id: 'fcTaper', width: 9, height: 9, patternTransform: 'rotate(45)', patternUnits: 'userSpaceOnUse' },
          h('line', { x1: 0, y1: 0, x2: 0, y2: 9, stroke: 'color-mix(in srgb, var(--z5) 22%, transparent)', strokeWidth: 2 }))),
        // zero TSB line
        h('line', { x1: 0, x2: W, y1: zeroY, y2: zeroY, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1, strokeDasharray: '3 4' }),
        // future tint (very subtle) right of today
        h('rect', { x: xToday, y: padT - 6, width: W - xToday, height: H - padB - padT + 6, fill: 'rgba(255,255,255,.012)' }),

        // ---- PAST (solid) ----
        h('path', { d: `${smooth(histPts('ctl'))} L ${xToday} ${H - padB} L 0 ${H - padB} Z`, fill: 'url(#fcCtl)' }),
        h('path', { d: smooth(histPts('ctl')), fill: 'none', stroke: 'var(--viz-fitness)', strokeWidth: 3, strokeLinecap: 'round' }),
        h('path', { d: smooth(histPts('atl')), fill: 'none', stroke: 'var(--viz-fatigue)', strokeWidth: 2.2, strokeLinecap: 'round', opacity: .92 }),
        h('path', { d: smooth(histTsb), fill: 'none', stroke: 'var(--viz-form)', strokeWidth: 2.6, strokeLinecap: 'round' }),

        // ---- GHOST (no taper) ----
        ghostTsb && h('path', { d: smooth(ghostTsb), fill: 'none', stroke: 'var(--text-3)', strokeWidth: 1.8, strokeDasharray: '2 5', strokeLinecap: 'round', opacity: .8 }),

        // ---- PROJECTION (dashed) ----
        h('path', { d: smooth(planPts('ctl')), fill: 'none', stroke: 'var(--viz-fitness)', strokeWidth: 2.6, strokeDasharray: '7 5', strokeLinecap: 'round', opacity: .92 }),
        h('path', { d: smooth(planPts('atl')), fill: 'none', stroke: 'var(--viz-fatigue)', strokeWidth: 2, strokeDasharray: '6 5', strokeLinecap: 'round', opacity: .82 }),
        h('path', { d: smooth(planTsb), fill: 'none', stroke: 'var(--viz-form)', strokeWidth: 2.6, strokeDasharray: '7 5', strokeLinecap: 'round' }),

        // today divider
        vline(xToday, 'var(--accent-bright)', 2),
        // race divider
        vline(xRace, 'color-mix(in srgb, var(--z5) 70%, transparent)', 1.5, '4 4'),
        // peak TSB marker
        xPeak != null && peakD && h('g', null,
          dot(xPeak, syT(peakD.tsb), 'viz-form', 5),
          h('circle', { cx: xPeak, cy: syT(peakD.tsb), r: 10, fill: 'none', stroke: 'var(--viz-form)', strokeWidth: 1, opacity: .5 })),
        // race-day TSB dot (emphasised)
        h('circle', { cx: xRace, cy: syT(raceD.tsb), r: 6.5, fill: 'var(--viz-form)', stroke: '#0a0b0d', strokeWidth: 2.5 }),
        // hover crosshair
        hd && vline(hx, 'rgba(255,255,255,.22)', 1),
        hd && dot(hx, syL(hd.ctl), 'viz-fitness', 3.5),
        hd && dot(hx, syL(hd.atl), 'viz-fatigue', 3.5),
        hd && dot(hx, syT(hd.tsb), 'viz-form', 3.5)),

      // overlay labels (HTML, crisp)
      h('div', { style: { position: 'absolute', left: `${(xToday / W) * 100}%`, top: 2, transform: 'translateX(-50%)', pointerEvents: 'none' } },
        h('span', { className: 'label', style: { fontSize: 9, color: 'var(--accent-bright)', background: 'color-mix(in srgb, var(--panel) 75%, transparent)', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' } }, 'Heute')),
      h('div', { style: { position: 'absolute', left: `${(xRace / W) * 100}%`, top: 2, transform: `translateX(${xRace > W * 0.9 ? '-100%' : '-50%'})`, pointerEvents: 'none' } },
        h('span', { className: 'chip', style: { height: 19, fontSize: 9.5, color: 'var(--z5)', borderColor: 'color-mix(in srgb, var(--z5) 45%, transparent)', background: 'color-mix(in srgb, var(--z5) 14%, transparent)', whiteSpace: 'nowrap' } },
          h(Icon, { name: 'trophy', size: 11 }), `${ev.short} · ${ev.dateLbl}`)),
      // race-day TSB value pill near the dot
      h('div', { style: { position: 'absolute', left: `${(xRace / W) * 100}%`, top: `${(syT(raceD.tsb) / H) * 100}%`, transform: `translate(${xRace > W * 0.9 ? '-108%' : '10px'}, -50%)`, pointerEvents: 'none' } },
        h('span', { className: 'mono', style: { fontSize: 11, fontWeight: 700, color: 'var(--viz-form)', background: 'color-mix(in srgb, var(--panel) 82%, transparent)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' } }, `${raceD.tsb > 0 ? '+' : ''}${Math.round(raceD.tsb)} TSB`)),

      // legend + axis hint
      h('div', { className: 'row between center', style: { marginTop: 12, flexWrap: 'wrap', gap: 10 } },
        h('div', { className: 'row center gap-14', style: { flexWrap: 'wrap' } },
          h(Lg, { color: 'viz-fitness', label: 'CTL Fitness' }),
          h(Lg, { color: 'viz-fatigue', label: 'ATL Fatigue' }),
          h(Lg, { color: 'viz-form', label: 'TSB Form' }),
          h('div', { className: 'row center gap-6' },
            h('span', { style: { width: 15, height: 0, borderTop: '2px dashed var(--text-3)' } }),
            h('span', { className: 'label', style: { color: 'var(--text-3)' } }, 'Prognose'))),
        h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-4)' } }, 'durchgezogen = Ist · gestrichelt = projiziert')));
  }

  /* small +/- stepper button (matches Jahresplanung) */
  function StepBtn({ children, onClick, disabled }) {
    return h('button', { type: 'button', onClick, disabled,
      style: { width: 26, height: 26, borderRadius: 7, flexShrink: 0, border: '1px solid var(--line-2)', background: 'var(--panel-2)',
        color: disabled ? 'var(--text-4)' : 'var(--text)', cursor: disabled ? 'default' : 'pointer', fontSize: 14, lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'background .2s, border-color .2s' } }, children);
  }
  function StepRow({ icon, label, value, sub, onMinus, onPlus, minusOff, plusOff, locked }) {
    return h('div', { className: 'row between center', style: { padding: '11px 0', borderBottom: '1px solid var(--line-soft)' } },
      h('div', { className: 'row center gap-10', style: { minWidth: 0 } },
        h('div', { style: { width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-2)', color: 'var(--text-3)', border: '1px solid var(--line)' } }, h(Icon, { name: icon, size: 15 })),
        h('div', { className: 'col', style: { gap: 1, minWidth: 0 } },
          h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, label),
          sub && h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, sub))),
      locked
        ? h('span', { className: 'mono', style: { fontSize: 14, fontWeight: 700, color: 'var(--text-2)', minWidth: 64, textAlign: 'right' } }, value)
        : h('div', { className: 'row center gap-9' },
            h(StepBtn, { onClick: onMinus, disabled: minusOff }, '−'),
            h('span', { className: 'mono', style: { fontSize: 14, fontWeight: 700, minWidth: 64, textAlign: 'center', color: 'var(--text)' } }, value),
            h(StepBtn, { onClick: onPlus, disabled: plusOff }, '+')));
  }

  /* outcome stat */
  function Outcome({ label, value, color, sub }) {
    return h('div', { className: 'col', style: { gap: 4, minWidth: 0, flex: '1 1 0' } },
      h('span', { className: 'label', style: { fontSize: 9.5 } }, label),
      h('span', { className: 'metric', style: { fontSize: 30, lineHeight: .95, letterSpacing: '-.02em', color: color ? `var(--${color})` : 'var(--text)' } }, value),
      sub && h('div', { style: { fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5, minHeight: 16 } }, sub));
  }

  /* =========================================================
     Screen
     ========================================================= */
  function Prognose({ onNav }) {
    if (FF.empty) return h(EmptyState, { icon: 'forecast', title: 'Keine Prognose verfügbar',
      body: 'Die Form- und Leistungsprognose braucht deine aktuelle Fitness (CTL/ATL). Verbinde einen Dienst oder importiere Aktivitäten, um zu starten.',
      cta: 'Dienst verbinden', onCta: () => onNav && onNav('import') });
    const start = { ctl: FF.todayLoad.ctl, atl: FF.todayLoad.atl };
    const [evId, setEvId] = useState('otz');
    const [mode, setMode] = useState('ai');           // 'ai' | 'manual'
    const [peakCtl, setPeakCtl] = useState(Math.round(start.ctl * 1.15));
    const [tw, setTw] = useState(2);
    const [drop, setDrop] = useState(0.50);
    const [cmp, setCmp] = useState(true);             // overlay "no taper" ghost
    const TARGET = 20;

    const ev = EVENTS.find((e) => e.id === evId);
    const opt = useMemo(() => optimizeTaper(start, ev.offset, peakCtl, TARGET), [ev.offset, peakCtl, start.ctl, start.atl]);
    const effTw = mode === 'ai' ? opt.tw : tw;
    const effDrop = mode === 'ai' ? opt.drop : drop;

    const proj = useMemo(() => project(start, ev.offset, peakCtl, effTw, effDrop, 12), [ev.offset, peakCtl, effTw, effDrop, start.ctl, start.atl]);
    const ghost = useMemo(() => project(start, ev.offset, peakCtl, effTw, 0, 12).series, [ev.offset, peakCtl, effTw, start.ctl, start.atl]);
    const hist = useMemo(() => FF.load.slice(-42).map((d) => ({ ctl: d.ctl, atl: d.atl, tsb: d.tsb, date: d.date })), []);

    const pk = peakIdx(proj.series, proj.taperStart, proj.raceIdx + 8);
    const race = proj.series[proj.raceIdx];
    const peakOff = pk - proj.raceIdx;
    const band = raceBand(race.tsb);
    const verdict = timingVerdict(peakOff);
    const ghostRace = ghost[proj.raceIdx];
    const gain = race.tsb - ghostRace.tsb;
    const peakFitness = Math.max(...proj.series.slice(0, proj.raceIdx + 1).map((d) => d.ctl));
    const fitnessLoss = race.ctl - peakFitness; // negative = lost to taper
    const weeksToRace = Math.round(ev.offset / 7);
    const optimal = Math.abs(peakOff) <= 1 && race.tsb >= 14 && race.tsb < 26;

    const setModeTo = (m) => { if (m === 'manual') { setTw(opt.tw); setDrop(opt.drop); } setMode(m); };
    const resetToAI = () => { setMode('ai'); setPeakCtl(Math.round(start.ctl * 1.15)); };

    const dropPct = Math.round(effDrop * 100);
    const taperStartDate = FF.addDays(FF.TODAY, ev.offset - effTw * 7);

    /* event selector + recompute KI badge in header */
    const eventSeg = h('div', { className: 'seg' }, EVENTS.map((e) =>
      h('button', { key: e.id, className: evId === e.id ? 'is-active' : '', onClick: () => setEvId(e.id) },
        h('span', { className: 'row center gap-6' }, h(Icon, { name: 'trophy', size: 12 }), `${e.short} · ${e.type}`))));

    return h('div', { className: 'ff-grid', style: { gap: 18 }, 'data-screen-label': 'Form-Prognose' },
      /* ---- summary tiles ---- */
      h('div', { className: 'ff-grid grid-4', style: { gap: 18 } },
        h('div', { className: 'tile' },
          h('span', { className: 'label' }, 'Zielwettkampf'),
          h('div', { className: 'row center gap-8' }, h('span', { style: { color: 'var(--z5)' } }, h(Icon, { name: 'trophy', size: 16 })),
            h('span', { className: 'metric', style: { fontSize: 19, lineHeight: 1.1 } }, ev.short)),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } }, `in ${weeksToRace} Wochen · ${ev.dateLbl}`)),
        h('div', { className: 'tile' },
          h('span', { className: 'label' }, 'Aktuelle Form'),
          h('div', { className: 'row', style: { alignItems: 'baseline', gap: 4 } },
            h('span', { className: 'metric', style: { fontSize: 30, color: 'var(--viz-form)' } }, `${FF.todayLoad.tsb > 0 ? '+' : ''}${Math.round(FF.todayLoad.tsb)}`),
            h('span', { className: 'unit', style: { fontSize: 12 } }, 'TSB')),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } }, `CTL ${Math.round(start.ctl)} · ATL ${Math.round(start.atl)}`)),
        h('div', { className: 'tile', style: { borderColor: `color-mix(in srgb, var(--${band.c}) 30%, var(--line))` } },
          h('span', { className: 'label' }, 'Projizierte Form am Renntag'),
          h('div', { className: 'row', style: { alignItems: 'baseline', gap: 4 } },
            h('span', { className: 'metric', style: { fontSize: 30, color: `var(--${band.c})` } }, `${race.tsb > 0 ? '+' : ''}${Math.round(race.tsb)}`),
            h('span', { className: 'unit', style: { fontSize: 12 } }, 'TSB')),
          h('span', { className: 'chip', style: { height: 20, fontSize: 10, color: `var(--${band.c})` } }, h('span', { className: 'dot', style: { background: `var(--${band.c})` } }), band.t)),
        h('div', { className: 'tile', style: { borderColor: `color-mix(in srgb, var(--${verdict.c}) 30%, var(--line))` } },
          h('span', { className: 'label' }, 'Form-Peak'),
          h('div', { className: 'row center gap-7' }, h('span', { style: { color: `var(--${verdict.c})` } }, h(Icon, { name: verdict.icon, size: 16 })),
            h('span', { className: 'metric', style: { fontSize: 18, lineHeight: 1.1, color: `var(--${verdict.c})` } }, verdict.t)),
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } }, `Gipfel: ${fmt.date(proj.series[pk].date)}`))),

      /* ---- forecast chart ---- */
      h(Card, { title: 'TSB-Projektion bis zum Wettkampf', icon: 'forecast',
          info: 'Vorwärts-Simulation von Fitness (CTL), Fatigue (ATL) und Form (TSB) mit demselben Modell wie deine Vergangenheit — inkl. optimiertem Taper.',
          right: h('div', { className: 'row center gap-12' },
            h('button', { type: 'button', onClick: () => setCmp((v) => !v), className: 'chip',
              style: { cursor: 'pointer', height: 24, fontSize: 10.5,
                color: cmp ? 'var(--text)' : 'var(--text-3)',
                borderColor: cmp ? 'var(--line-2)' : 'var(--line)',
                background: cmp ? 'var(--panel-2)' : 'transparent' } },
              h(Icon, { name: 'activity', size: 12 }), 'Ohne Taper vergleichen'),
            eventSeg) },
        h(ForecastChart, { hist, plan: proj.series, ghost: cmp ? ghost : null, raceIdx: proj.raceIdx, taperStart: proj.taperStart, ev, peak: pk }),
        // bottom outcome strip
        h('div', { className: 'rule', style: { margin: '16px 0 14px' } }),
        h('div', { className: 'row between wrap', style: { gap: 20 } },
          h(Outcome, { label: 'Form am Renntag', value: `${race.tsb > 0 ? '+' : ''}${Math.round(race.tsb)}`, color: band.c,
            sub: h('span', { style: { color: 'var(--text-3)' } }, band.note) }),
          h('div', { style: { width: 1, alignSelf: 'stretch', background: 'var(--line)' } }),
          h(Outcome, { label: 'Fitness am Renntag (CTL)', value: Math.round(race.ctl), color: 'viz-fitness',
            sub: h('span', { className: 'mono', style: { color: fitnessLoss < -5 ? 'var(--warn)' : 'var(--text-3)' } }, `${fitnessLoss <= 0 ? '' : '+'}${Math.round(fitnessLoss)} vs. Peak ${Math.round(peakFitness)}`) }),
          h('div', { style: { width: 1, alignSelf: 'stretch', background: 'var(--line)' } }),
          h(Outcome, { label: 'Taper-Effekt auf die Form', value: `${gain >= 0 ? '+' : ''}${Math.round(gain)}`, color: gain >= 0 ? 'good' : 'bad',
            sub: h('span', { style: { color: 'var(--text-3)' } }, 'TSB vs. ohne Taper') }),
          h('div', { style: { width: 1, alignSelf: 'stretch', background: 'var(--line)' } }),
          h(Outcome, { label: 'Taper-Start', value: fmt.date(taperStartDate), color: 'z5',
            sub: h('span', { className: 'mono', style: { color: 'var(--text-3)' } }, `${effTw} Wo · −${dropPct}% Vol.`) }))),

      /* ---- optimizer + analysis ---- */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.25fr)', gap: 18 } },
        /* control panel */
        h(Card, { title: 'Taper-Optimizer', icon: 'sliders',
            info: 'KI tunt Taper-Länge und Volumenreduktion so, dass die Form punktgenau am Renntag gipfelt. Oder plane selbst.',
            right: h(Tabs, { items: [{ value: 'ai', label: 'KI-Taper' }, { value: 'manual', label: 'Selbst planen' }], value: mode, onChange: setModeTo }) },
          h('div', { className: 'col', style: { gap: 0 } },
            mode === 'ai' && h('div', { className: 'row center gap-8', style: { padding: '2px 0 12px' } },
              h('span', { className: 'chip chip--solid', style: { height: 22, fontSize: 10 } }, h(Icon, { name: 'spark', size: 12 }), 'KI optimiert auf +20 TSB am Renntag')),
            h(StepRow, { icon: 'forecast', label: 'Aufbau-Ziel (Peak CTL)', sub: `Fitness-Gipfel vor dem Taper`,
              value: Math.round(peakCtl),
              onMinus: () => setPeakCtl((v) => Math.max(Math.round(start.ctl), v - 2)),
              onPlus: () => setPeakCtl((v) => Math.min(Math.round(start.ctl) + 45, v + 2)),
              minusOff: peakCtl <= Math.round(start.ctl), plusOff: peakCtl >= Math.round(start.ctl) + 45 }),
            h(StepRow, { icon: 'clock', label: 'Taper-Länge', sub: `Start ${fmt.date(taperStartDate)}`,
              value: `${effTw} Wo`, locked: mode === 'ai',
              onMinus: () => setTw((v) => Math.max(1, v - 1)), onPlus: () => setTw((v) => Math.min(3, v + 1)),
              minusOff: tw <= 1, plusOff: tw >= 3 }),
            h(StepRow, { icon: 'waves', label: 'Volumen-Reduktion', sub: 'Last-Cut über den Taper',
              value: `−${dropPct}%`, locked: mode === 'ai',
              onMinus: () => setDrop((v) => Math.max(0.30, +(v - 0.05).toFixed(2))), onPlus: () => setDrop((v) => Math.min(0.65, +(v + 0.05).toFixed(2))),
              minusOff: drop <= 0.30, plusOff: drop >= 0.65 }),
            // optimal banner
            h('div', { className: 'row center gap-8', style: { marginTop: 14, padding: '11px 13px', borderRadius: 10,
                background: optimal ? 'color-mix(in srgb, var(--good) 12%, transparent)' : 'var(--panel-2)',
                border: `1px solid ${optimal ? 'color-mix(in srgb, var(--good) 35%, transparent)' : 'var(--line)'}` } },
              h('span', { style: { color: optimal ? 'var(--good)' : 'var(--warn)' } }, h(Icon, { name: optimal ? 'check' : 'info', size: 16 })),
              h('span', { style: { fontSize: 12.5, lineHeight: 1.4, color: 'var(--text-2)' } },
                optimal ? 'Optimaler Taper: Form gipfelt im Renn-Fenster, Fitness bleibt hoch.'
                  : `Form-Peak ${Math.abs(peakOff)} Tage ${peakOff < 0 ? 'vor' : 'nach'} dem Renntag — Taper anpassen.`)),
            mode === 'manual' && h('button', { type: 'button', className: 'chip', style: { cursor: 'pointer', alignSelf: 'flex-start', marginTop: 12, height: 28, fontSize: 11.5, borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)', color: 'var(--accent-bright)' }, onClick: resetToAI },
              h(Icon, { name: 'spark', size: 13 }), 'KI-Taper übernehmen'))),

        /* analysis */
        h(Card, { title: 'Prognose-Auswertung', icon: 'gauge',
            right: h('span', { className: 'chip', style: { height: 24, color: `var(--${band.c})`, borderColor: `color-mix(in srgb, var(--${band.c}) 40%, transparent)` } },
              h('span', { className: 'dot', style: { background: `var(--${band.c})` } }), band.t) },
          // peak fitness vs race fitness mini-visual
          h('div', { className: 'col gap-14' },
            h('div', { className: 'row between center wrap gap-12' },
              h('div', { className: 'col gap-2' },
                h('span', { className: 'label' }, 'Zeitplan'),
                h('span', { className: 'strong', style: { fontSize: 14, fontWeight: 600 } }, `Aufbau bis ${fmt.date(taperStartDate)} · Taper ${effTw} Wo`)),
              h('span', { className: 'chip', style: { height: 24, color: `var(--${verdict.c})`, borderColor: `color-mix(in srgb, var(--${verdict.c}) 40%, transparent)` } },
                h(Icon, { name: verdict.icon, size: 12 }), verdict.t)),
            // form-build mini timeline bar
            h(PhaseBar, { weeksToRace, taperWeeks: effTw }),
            h(AiInsight, { title: 'KI-Taper-Analyse' },
              h('div', { className: 'col gap-8' },
                h('span', null,
                  `Bei einem Aufbau bis CTL ${Math.round(peakCtl)} und einem ${effTw}-Wochen-Taper mit −${dropPct}% Volumen `,
                  `landet deine Form am ${ev.dateLbl} bei `,
                  h('strong', { style: { color: `var(--${band.c})` } }, `${race.tsb > 0 ? '+' : ''}${Math.round(race.tsb)} TSB`),
                  ` (${band.note}). `,
                  Math.abs(peakOff) <= 1
                    ? 'Der Form-Gipfel fällt genau auf den Renntag. '
                    : `Der Gipfel liegt ${Math.abs(peakOff)} Tage ${peakOff < 0 ? 'davor — ein längerer oder sanfterer Taper schiebt ihn nach hinten. ' : 'danach — kürze den Taper leicht. '}`,
                  `Du behältst ${Math.round(race.ctl)} CTL `,
                  h('strong', null, `(${Math.round(fitnessLoss)} Fitness`),
                  `) und gewinnst gegenüber „weiter Vollgas" `,
                  h('strong', { style: { color: 'var(--good)' } }, `+${Math.round(gain)} TSB`),
                  ' Frische.'),
                !optimal && mode === 'ai' && h('span', { style: { color: 'var(--text-3)' } }, 'Tipp: Ein höheres Aufbau-Ziel bringt mehr Fitness, verlangt aber einen kräftigeren Taper.'))),
            // comparison rows: this plan vs no taper
            h('div', { className: 'col gap-2', style: { marginTop: 2 } },
              h('span', { className: 'label', style: { marginBottom: 6 } }, 'Form am Renntag — Vergleich'),
              h(CmpRow, { label: `Mit Taper (${effTw} Wo · −${dropPct}%)`, tsb: race.tsb, max: Math.max(Math.abs(race.tsb), Math.abs(ghostRace.tsb), 25), color: band.c, strong: true }),
              h(CmpRow, { label: 'Ohne Taper (weiter Vollgas)', tsb: ghostRace.tsb, max: Math.max(Math.abs(race.tsb), Math.abs(ghostRace.tsb), 25), color: 'text-3' }))))));
  }

  /* small build/taper timeline bar */
  function PhaseBar({ weeksToRace, taperWeeks }) {
    const buildW = Math.max(1, weeksToRace - taperWeeks);
    return h('div', { className: 'col gap-6' },
      h('div', { className: 'row', style: { height: 30, borderRadius: 9, overflow: 'hidden', gap: 2 } },
        h('div', { style: { flex: `${buildW} 1 0`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--z4) 22%, transparent)', borderTop: '2px solid var(--z4)', minWidth: 0 } },
          h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden' } }, `Aufbau · ${buildW} Wo`)),
        h('div', { style: { flex: `${taperWeeks} 1 0`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--z5) 22%, transparent)', borderTop: '2px solid var(--z5)', minWidth: 0 } },
          h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--z5)', whiteSpace: 'nowrap', overflow: 'hidden' } }, `Taper · ${taperWeeks} Wo`))),
      h('div', { className: 'row between', style: { fontSize: 9.5 } },
        h('span', { className: 'label' }, 'Heute'),
        h('span', { className: 'label', style: { color: 'var(--z5)' } }, 'Renntag')));
  }

  /* comparison bar (TSB can be negative → centred at zero) */
  function CmpRow({ label, tsb, max, color, strong }) {
    const half = 100 / 2;
    const w = Math.min(half, (Math.abs(tsb) / max) * half);
    const pos = tsb >= 0;
    return h('div', { className: 'row center gap-12', style: { padding: '5px 0' } },
      h('span', { style: { width: 180, flexShrink: 0, fontSize: 12, color: strong ? 'var(--text)' : 'var(--text-3)', fontWeight: strong ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
      h('div', { style: { flex: 1, height: 16, position: 'relative', background: 'rgba(255,255,255,.05)', borderRadius: 6, minWidth: 0 } },
        h('div', { style: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.18)' } }),
        h('div', { style: { position: 'absolute', top: 2, bottom: 2, borderRadius: 4,
          left: pos ? '50%' : `${half - w}%`, width: `${w}%`,
          background: `var(--${color})`, opacity: strong ? 1 : .5 } })),
      h('span', { className: 'mono', style: { width: 48, textAlign: 'right', flexShrink: 0, fontSize: 13, fontWeight: 700, color: `var(--${color === 'text-3' ? 'text-3' : color})` } }, `${tsb > 0 ? '+' : ''}${Math.round(tsb)}`));
  }

  window.Screens = window.Screens || {};
  window.Screens.Prognose = Prognose;
})();
