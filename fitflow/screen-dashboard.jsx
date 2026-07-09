/* FitFlow — Dashboard screen */
(function () {
  const { createElement: h, useState, useEffect, Fragment } = React;
  const { Card, Stat, Delta, Tabs, AiInsight, SportIcon, SportTag } = window.UI;
  const C = window.Charts;
  const Icon = window.Icon;
  const fmt = FF.fmt;

  /* ---------- Morgen-Check: model + persistence + derived note ---------- */
  const CK_METRICS = [
    { key: 'fatigue', label: 'Müdigkeit', icon: 'moon', opts: [
      { v: 'frisch', label: 'Frisch', tone: 'good' }, { v: 'ok', label: 'Ok', tone: 'mid' }, { v: 'müde', label: 'Müde', tone: 'bad' }] },
    { key: 'stress',  label: 'Stress',    icon: 'bolt', opts: [
      { v: 'ruhig',  label: 'Ruhig',  tone: 'good' }, { v: 'ok', label: 'Ok', tone: 'mid' }, { v: 'hoch',   label: 'Hoch',   tone: 'bad' }] },
    { key: 'injury',  label: 'Verletzungen', icon: 'heart', opts: [
      { v: 'nein', label: 'Nein', tone: 'good' }, { v: 'ja', label: 'Ja', tone: 'bad' }] },
  ];
  const CK_KEY = 'ff-checkin-' + FF.TODAY.toISOString().slice(0, 10);
  function loadCheckin() {
    try { const s = localStorage.getItem(CK_KEY); if (s) return JSON.parse(s); } catch (e) {}
    return { fatigue: null, stress: null, injury: null, note: '', time: null };
  }
  function saveCheckin(c) {
    try { localStorage.setItem(CK_KEY, JSON.stringify(c)); } catch (e) {}
    // zusätzlich über die Datenschicht ans Backend (Live) bzw. no-op (Mock)
    try { if (window.FitFlowAPI) window.FitFlowAPI.saveCheckin(FF.TODAY.toISOString().slice(0, 10), c); } catch (e) {}
  }
  function checkinSummary(c) {
    c = c || {};
    const complete = c.fatigue && c.stress && c.injury;
    if (!complete) return { complete: false, clause: null, note: null, tone: 'mid' };
    const bad = [];
    if (c.injury === 'ja') bad.push('Verletzung gemeldet');
    if (c.fatigue === 'müde') bad.push('müde');
    if (c.stress === 'hoch') bad.push('hoher Stress');
    if (bad.length) {
      const note = c.injury === 'ja' ? 'Verletzung gemeldet — Belastung anpassen, ggf. auf Alternativtraining ausweichen.'
        : c.fatigue === 'müde' ? 'Wenig erholt — Warm-up verlängern, Intensität beobachten.'
        : 'Hohe Außenbelastung — heute eher Z2 statt Z5.';
      return { complete: true, clause: bad[0] + ' laut Check-in', note, tone: 'bad' };
    }
    const allBest = c.fatigue === 'frisch' && c.stress === 'ruhig' && c.injury === 'nein';
    return {
      complete: true,
      clause: (c.fatigue === 'frisch' ? 'Frisch' : 'Körpergefühl ok') + ' laut Check-in',
      note: allBest ? 'Körpergefühl top — Empfehlung bestätigt.' : 'Werte solide — Empfehlung bestätigt.',
      tone: allBest ? 'good' : 'mid',
    };
  }

  /* recommendation presets driven by the Morgen-Check (net level vs. base 0) */
  const RECO_PRESETS = {
    '1':  { band: 'Hoch',           focus: 'VO₂max · Z5',      headline: 'Grünes Licht — Spitzenreiz',  tssLo: 70, tssHi: 100, fill: 90, cols: ['#7C5CFF', '#5E5CE6', '#BF5AF2'], col: 'viz-fitness' },
    '0':  { band: 'Mittel–Hoch',    focus: 'VO₂max · Z5',      headline: 'Qualitäts-Einheit möglich',   tssLo: 55, tssHi: 85,  fill: 73, cols: ['#10e08a', '#06c79a', '#3df0a6'], col: 'good' },
    '-1': { band: 'Mittel–Hoch',    focus: 'Sweet-Spot · Z3',  headline: 'Kontrollierte Qualität',      tssLo: 50, tssHi: 72,  fill: 62, cols: ['#10e08a', '#06c79a', '#3df0a6'], col: 'good' },
    '-2': { band: 'Niedrig–Mittel', focus: 'GA2 · Z2',         headline: 'Ruhige Grundlage',            tssLo: 40, tssHi: 60,  fill: 50, cols: ['#ffb020', '#ff9416', '#ffc94d'], col: 'warn' },
    '-3': { band: 'Recovery',       focus: 'Regeneration · Z1', headline: 'Erholung priorisieren',       tssLo: 20, tssHi: 40,  fill: 30, cols: ['#ff6a48', '#ff2e2e', '#ff7a8b'], col: 'bad' },
  };
  function recoState(checkin, showCheckin) {
    const c = checkin || {};
    const complete = !!(showCheckin && c.fatigue && c.stress && c.injury);
    let net = 0; const drivers = [];
    if (complete) {
      if (c.injury === 'ja') { net--; drivers.push('eine gemeldete Verletzung'); }
      if (c.fatigue === 'müde') { net--; drivers.push('Müdigkeit'); }
      if (c.stress === 'hoch') { net--; drivers.push('hohe Alltagsbelastung'); }
      if (c.fatigue === 'frisch' && c.stress === 'ruhig' && c.injury === 'nein') net++;
    }
    net = Math.max(-3, Math.min(1, net));
    const p = RECO_PRESETS[String(net)];
    let text;
    if (net < 0) text = `Dein Morgen-Check meldet ${drivers.join(' und ')}. Die Empfehlung wurde auf „${p.focus}“ zurückgenommen und die Belastung auf ${p.tssLo}–${p.tssHi}\u2009TSS gesenkt — so bleibt der Reiz adaptiv, statt die Erholung zu kippen.`;
    else if (net > 0) text = `HRV über Baseline und der Morgen-Check durchweg frisch — grünes Licht für „${p.focus}“. Die Belastung darf heute auf ${p.tssLo}–${p.tssHi}\u2009TSS steigen und trägt optimal zum Load-Block bei.`;
    else text = FF.reco.text;
    return { p, net, complete, adjusted: complete && net !== 0, text,
      adjNote: net < 0 ? 'Durch Check-in zurückgenommen' : net > 0 ? 'Durch Check-in angehoben' : null,
      adjTone: net < 0 ? 'warn' : 'good' };
  }

  function ReadinessInputs({ value, onChange, wide }) {
    const complete = value && value.fatigue && value.stress && value.injury;
    const set = (key, v) => {
      const next = { ...value, [key]: v };
      if (next.fatigue && next.stress && next.injury && !value.time)
        next.time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      onChange(next);
    };
    const setNote = (e) => onChange({ ...value, note: e.target.value });
    const noteField = h('div', { className: 'col', style: { gap: 6, width: '100%' } },
      h('span', { className: 'ff-rd-label', style: { color: 'var(--text-3)' } }, 'Persönliche Anmerkungen'),
      h('textarea', { className: 'ff-ck-note', rows: 2, value: (value && value.note) || '',
        placeholder: 'z. B. leichte Erkältung, Zeitmangel, Wetter …', onChange: setNote }));
    const header = h('div', { className: 'row between center' },
      h('span', { className: 'label' }, 'Wie fühlst du dich heute?'),
      complete
        ? h('span', { className: 'row center gap-4 mono', style: { fontSize: 10, color: 'var(--text-4)' } }, h(Icon, { name: 'check', size: 11, style: { color: 'var(--good)' } }), value.time || 'erfasst')
        : h('span', { className: 'mono', style: { fontSize: 10, color: 'var(--text-4)' } }, 'fließt in die Empfehlung'));
    if (wide) {
      return h('div', { className: 'col', style: { gap: 12, width: '100%' } },
        header,
        h('div', { className: 'ff-ckgrid', style: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, alignItems: 'start' } },
          CK_METRICS.map((m) => h('div', { key: m.key, className: 'col', style: { gap: 8, minWidth: 0 } },
            h('div', { className: 'row center gap-8' },
              h(Icon, { name: m.icon, size: 14, style: { color: 'var(--text-3)' } }),
              h('span', { className: 'ff-rd-label' }, m.label)),
            h('div', { className: 'ff-ck-opts', style: { display: 'flex', width: '100%' } }, m.opts.map((o) =>
              h('button', { key: o.v, className: 'ff-ck-opt' + (value[m.key] === o.v ? ' on' : ''), 'data-tone': o.tone, style: { flex: 1, textAlign: 'center', padding: '7px 4px' }, onClick: () => set(m.key, o.v) }, o.label)))))),
        noteField);
    }
    return h('div', { className: 'col', style: { gap: 9, width: '100%' } },
      header,
      CK_METRICS.map((m) => h('div', { key: m.key, className: 'ff-rd-row' },
        h('div', { className: 'row center gap-8', style: { minWidth: 0 } },
          h(Icon, { name: m.icon, size: 14, style: { color: 'var(--text-3)' } }),
          h('span', { className: 'ff-rd-label' }, m.label)),
        h('div', { className: 'ff-ck-opts' }, m.opts.map((o) =>
          h('button', { key: o.v, className: 'ff-ck-opt' + (value[m.key] === o.v ? ' on' : ''), 'data-tone': o.tone, onClick: () => set(m.key, o.v) }, o.label))))),
      noteField);
  }

  /* ---------- Belastungsrisiko (ACWR) — full-width gauge under the vitals ---------- */
  /* compact in-card empty state — used across the dashboard when a fresh account
     has no imported activities yet, so demo numbers never leak through. */
  function CardEmpty({ icon = 'spark', title, hint, onNav, ctaRoute, cta }) {
    return h('div', { className: 'col center gap-10', style: { padding: '34px 18px', textAlign: 'center', flex: 1, justifyContent: 'center', minHeight: 130 } },
      h('span', { style: { width: 46, height: 46, borderRadius: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-2)', border: '1px solid var(--line)', color: 'var(--text-3)' } }, h(Icon, { name: icon, size: 21 })),
      h('span', { className: 'strong', style: { fontSize: 14.5, fontWeight: 700 } }, title),
      hint && h('span', { style: { fontSize: 12.5, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5 } }, hint),
      cta && onNav && h('button', { className: 'btn btn--sm btn--outline', onClick: () => onNav(ctaRoute) }, cta, h(Icon, { name: 'chevR', size: 13 })));
  }

  function RiskBar({ risk, noData }) {
    // band is null until there's enough load history (fresh/empty account) —
    // fall back to a neutral „no data yet" state instead of crashing.
    const b = noData ? { status: 'text-4', label: 'Noch keine Daten' }
      : (risk.band || { status: 'text-4', label: 'Noch keine Daten' });
    const col = `var(--${b.status})`;
    const lo = risk.gaugeLo, hi = risk.gaugeHi, span = hi - lo;
    const pos = Math.max(0, Math.min(1, (risk.acwr - lo) / span));
    const zones = [{ to: 0.8, c: 'info' }, { to: 1.3, c: 'good' }, { to: 1.5, c: 'warn' }, { to: hi, c: 'bad' }];
    let prev = lo;
    return h('div', { className: 'tile', style: { padding: '15px 18px', gap: 0, flexShrink: 0 } },
      h('div', { className: 'row between center', style: { marginBottom: 13 } },
        h('div', { className: 'row center gap-8', style: { color: 'var(--text-3)' } },
          h(Icon, { name: 'gauge', size: 15 }),
          h('span', { className: 'h3' }, 'Belastungsbalance'),
          h('span', { title: 'Acute:Chronic Workload Ratio — Akutlast (7 Tage) ÷ Chroniklast (28 Tage). Sweet Spot 0,8–1,3.', style: { color: 'var(--text-4)', display: 'inline-flex', cursor: 'help' } }, h(Icon, { name: 'info', size: 13 }))),
        h('span', { className: 'chip', style: { height: 24, fontSize: 10.5, color: col, borderColor: `color-mix(in srgb, ${col} 40%, transparent)` } },
          h('span', { className: 'dot', style: { background: col } }), b.label)),
      h('div', { className: 'row center gap-18' },
        h('div', { className: 'col', style: { gap: 2, flexShrink: 0 } },
          h('div', { className: 'row', style: { alignItems: 'baseline', gap: 5 } },
            h('span', { className: 'metric', style: { fontSize: 34, lineHeight: .9, color: col } }, noData ? '–' : fmt.n(risk.acwr, 2).replace('.', ',')),
            h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, 'ACWR')),
          h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-4)' } }, noData ? 'Noch keine Belastungsdaten' : `Akut ${risk.acute} · Chron. ${risk.chronic}`)),
        h('div', { style: { flex: 1, minWidth: 0 } },
          h('div', { className: 'ff-risk-gauge' },
            zones.map((z, i) => { const w = (z.to - prev) / span * 100; prev = z.to; return h('span', { key: i, className: 'ff-risk-zone', style: { width: w + '%', background: `color-mix(in srgb, var(--${z.c}) 44%, transparent)` } }); }),
            h('span', { className: 'ff-risk-marker', style: { left: pos * 100 + '%', background: col } })),
          h('div', { className: 'row between center', style: { marginTop: 7 } },
            h('span', { className: 'mono', style: { fontSize: 9.5, color: 'var(--text-4)' } }, '0,5'),
            h('span', { className: 'mono', style: { fontSize: 9.5, color: 'var(--good)', letterSpacing: '.02em' } }, 'Sweet Spot 0,8–1,3'),
            h('span', { className: 'mono', style: { fontSize: 9.5, color: 'var(--text-4)' } }, '1,8')))));
  }

  /* ---------- Trainingsfokus — Intensitätsverteilung über wählbaren Zeitraum ----------
     Drei Bereiche (gering aerob / hoch aerob / anaerob) in Minuten je Zeitraum;
     daraus wird die Verteilungsform abgeleitet (polarisiert / pyramidal / Schwelle). */
  const FOKUS_RANGES = [
    { key: '7d',  label: '7 T',  data: { low: 320,  mid: 40,  high: 60  } },
    { key: '14d', label: '14 T', data: { low: 610,  mid: 95,  high: 105 } },
    { key: '4w',  label: '4 W',  data: { low: 1180, mid: 260, high: 180 } },
    { key: '6w',  label: '6 W',  data: { low: 1650, mid: 520, high: 230 } },
    { key: '8w',  label: '8 W',  data: { low: 2000, mid: 860, high: 280 } },
  ];
  const FOKUS_BUCKETS = [
    { key: 'low',  label: 'Gering aerob', zone: 'z1', desc: 'GA1 · lockere Ausdauer' },
    { key: 'mid',  label: 'Hoch aerob',   zone: 'z4', desc: 'GA2 · Schwelle' },
    { key: 'high', label: 'Anaerob',      zone: 'z5', desc: 'VO₂max · Sprints' },
  ];
  function fokusVerdict(p) { /* p = Prozentanteile {low, mid, high} */
    if (p.mid >= 25) return { t: 'Schwelle', c: 'z4',
      text: `Mit ${p.mid} % liegt ein großer Teil deiner Arbeit im hoch aeroben Bereich rund um die Schwelle — schwellenorientiertes Training. Achte auf ausreichend lockere Einheiten zur Erholung.` };
    if (p.high >= p.mid) return { t: 'Polarisiert', c: 'accent',
      text: `${p.low} % Grundlage, gezielte anaerobe Spitzen (${p.high} %) und ein bewusst kleiner mittlerer Bereich (${p.mid} %) — klassisch polarisierte Verteilung nach dem 80/20-Prinzip.` };
    return { t: 'Pyramidal', c: 'info',
      text: `Der Umfang nimmt mit steigender Intensität stufenweise ab: ${p.low} % Grundlage, ${p.mid} % hoch aerob, ${p.high} % anaerob — pyramidale Verteilung, solide für den Aufbau.` };
  }
  /* Eine Zeile des Trainingsfokus: Label + Dauer/Anteil und darunter ein
     schlanker Balken mit weichem Farbverlauf, der beim Wechsel neu einläuft. */
  function FokusRow({ b, pct, dur }) {
    const [w, setW] = useState(0);
    useEffect(() => { const id = setTimeout(() => setW(pct), 60); return () => clearTimeout(id); }, [pct]);
    return h('div', { className: 'col', style: { gap: 7 } },
      h('div', { className: 'row between center' },
        h('div', { className: 'row center gap-8', style: { minWidth: 0 } },
          h('span', { style: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' } }, b.label),
          h('span', { style: { fontSize: 10.5, color: 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, b.desc)),
        h('div', { className: 'row center gap-10', style: { flexShrink: 0, alignItems: 'baseline' } },
          h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } }, dur),
          h('span', { className: 'mono', style: { fontSize: 13, fontWeight: 700, color: `var(--${b.zone})`, minWidth: 36, textAlign: 'right' } }, `${pct}%`))),
      h('div', { className: 'ff-fokus-track' },
        h('div', { className: 'ff-fokus-fill', style: { width: `${w}%`, '--fc': `var(--${b.zone})` } })));
  }

  function TrainingsfokusCard({ noData, onNav }) {
    const [range, setRange] = useState('7d');
    if (noData) {
      return h(Card, { title: 'Trainingsfokus', icon: 'flame', style: { flex: 1 },
          info: 'Verteilung der Trainingszeit nach Intensitätsbereichen im gewählten Zeitraum.' },
        h(CardEmpty, { icon: 'flame', title: 'Noch kein Trainingsfokus',
          hint: 'Sobald du Aktivitäten importierst, zeigt sich hier deine Intensitätsverteilung.',
          onNav, ctaRoute: 'import', cta: 'Aktivitäten importieren' }));
    }
    const r = FOKUS_RANGES.find((x) => x.key === range);
    const total = r.data.low + r.data.mid + r.data.high;
    const pct = {
      low:  Math.round(r.data.low  / total * 100),
      mid:  Math.round(r.data.mid  / total * 100),
      high: Math.round(r.data.high / total * 100),
    };
    /* Rundungsrest auf den größten Anteil schlagen, damit die Summe 100 ergibt */
    pct.low += 100 - (pct.low + pct.mid + pct.high);
    const v = fokusVerdict(pct);
    return h(Card, { title: 'Trainingsfokus', icon: 'flame', style: { flex: 1 },
        info: 'Verteilung der Trainingszeit nach Intensitätsbereichen im gewählten Zeitraum.',
        right: h(Tabs, { items: FOKUS_RANGES.map((x) => ({ value: x.key, label: x.label })), value: range, onChange: setRange }) },
      h('div', { className: 'col', style: { gap: 18, flex: 1, justifyContent: 'center' } },
        /* Drei Intensitätsbereiche als schlanke Verlaufs-Balken */
        h('div', { className: 'col', style: { gap: 15 } }, FOKUS_BUCKETS.map((b) =>
          h(FokusRow, { key: b.key + range, b, pct: pct[b.key], dur: fmt.dur(r.data[b.key]) }))),
        h('div', { className: 'rule', style: { margin: 0 } }),
        /* Auswertung des Zeitraums */
        h('div', { className: 'row between center' },
          h('div', { className: 'row center gap-8' },
            h('span', { className: 'label' }, 'Auswertung'),
            h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, `Gesamt ${fmt.dur(total)}`)),
          h('span', { className: 'chip', style: { height: 24, fontSize: 10.5, color: `var(--${v.c})`, borderColor: `color-mix(in srgb, var(--${v.c}) 40%, transparent)` } },
            h('span', { className: 'dot', style: { background: `var(--${v.c})` } }), v.t)),
        h('p', { style: { margin: 0, fontSize: 12, lineHeight: 1.55, color: 'var(--text-3)' } }, v.text)));
  }

  /* ---------- Form-Simulator (Verlauf | Simulieren) ---------- */
  function ModeSeg({ value, onChange }) {
    return h('div', { className: 'seg' },
      h('button', { className: value === 'history' ? 'is-active' : '', onClick: () => onChange('history') }, 'Verlauf'),
      h('button', { className: value === 'sim' ? 'is-active' : '', onClick: () => onChange('sim') }, 'Simulieren'));
  }

  function SimSlider({ label, value, min, max, step, unit, onChange, hint }) {
    return h('div', { className: 'col', style: { gap: 7 } },
      h('div', { className: 'row between', style: { alignItems: 'baseline' } },
        h('span', { style: { fontSize: 13, fontWeight: 600, color: 'var(--text)' } }, label),
        h('span', { className: 'mono', style: { fontSize: 13.5, fontWeight: 700, color: 'var(--accent-bright)' } }, fmt.n(value) + (unit || ''))),
      h('input', { type: 'range', className: 'ff-range', min, max, step, value, onChange: (e) => onChange(Number(e.target.value)), style: { width: '100%' } }),
      hint && h('span', { style: { fontSize: 11, color: 'var(--text-4)' } }, hint));
  }

  function MiniProjChart({ proj }) {
    const W = 560, H = 140, padT = 14, padB = 18, padX = 6;
    const maxCtl = Math.max(...proj.map((p) => p.ctl)) * 1.12;
    const tsbVals = proj.map((p) => p.tsb);
    const tsbMax = Math.max(Math.abs(Math.min(...tsbVals)), Math.abs(Math.max(...tsbVals)), 12) * 1.25;
    const n = proj.length;
    const sx = (i) => padX + (i / (n - 1)) * (W - 2 * padX);
    const syC = (v) => (H - padB) - (v / maxCtl) * (H - padB - padT);
    const midT = padT + (H - padB - padT) / 2;
    const syT = (v) => midT - (v / tsbMax) * ((H - padB - padT) / 2);
    const ctlPts = proj.map((p, i) => [sx(i), syC(p.ctl)]);
    const tsbPts = proj.map((p, i) => [sx(i), syT(p.tsb)]);
    const line = (pts) => 'M ' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
    const zeroY = syT(0);
    const lastX = sx(n - 1), lastTsbY = syT(proj[n - 1].tsb);
    return h('div', { className: 'col', style: { gap: 8 } },
      h('div', { style: { position: 'relative', height: H } },
        h('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, preserveAspectRatio: 'none', style: { display: 'block', overflow: 'visible' } },
          h('path', { d: line(ctlPts) + ` L ${sx(n - 1)} ${H - padB} L ${sx(0)} ${H - padB} Z`, fill: 'var(--viz-fitness)', opacity: .12 }),
          h('line', { x1: padX, x2: W - padX, y1: zeroY, y2: zeroY, stroke: 'rgba(255,255,255,.14)', strokeWidth: 1, strokeDasharray: '3 4', vectorEffect: 'non-scaling-stroke' }),
          h('path', { d: line(ctlPts), fill: 'none', stroke: 'var(--viz-fitness)', strokeWidth: 2.6, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }),
          h('path', { d: line(tsbPts), fill: 'none', stroke: 'var(--viz-form)', strokeWidth: 2.6, vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round', strokeLinecap: 'round' }),
          h('line', { x1: lastX, x2: lastX, y1: padT - 2, y2: H - padB, stroke: 'var(--accent-bright)', strokeWidth: 1.4, vectorEffect: 'non-scaling-stroke', strokeDasharray: '4 4' })),
        h('span', { style: { position: 'absolute', left: (sx(n - 1) / W * 100) + '%', top: lastTsbY + 'px', width: 10, height: 10, borderRadius: 99, background: 'var(--viz-form)', boxShadow: '0 0 0 2px #0a0b0d', transform: 'translate(-50%,-50%)' } }),
        h('div', { style: { position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 4px', pointerEvents: 'none' } },
          h('span', { className: 'mono', style: { fontSize: 10, color: 'var(--text-4)' } }, 'Heute'),
          h('span', { className: 'mono', style: { fontSize: 10, color: 'var(--accent-bright)' } }, 'Renntag'))),
      h('div', { className: 'row center gap-16', style: { justifyContent: 'center' } },
        h(LegendDot, { color: 'viz-fitness', label: 'CTL Fitness' }),
        h(LegendDot, { color: 'viz-form', label: 'TSB Form' })));
  }

  function FormSimulator() {
    const KEY = 'ff-sim';
    const init = (() => { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} return { tss: 450, weeks: 8, taper: true }; })();
    const [tss, setTss] = useState(init.tss);
    const [weeks, setWeeks] = useState(init.weeks);
    const [taper, setTaper] = useState(init.taper);
    useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ tss, weeks, taper })); } catch (e) {} }, [tss, weeks, taper]);
    const proj = FF.projectForm(tss, weeks, taper);
    const last = proj[proj.length - 1];
    const raceTsb = Math.round(last.tsb), startTsb = Math.round(proj[0].tsb);
    const verdict = raceTsb > 15 ? { t: 'Spritzig getapert', c: 'good' } : raceTsb > 5 ? { t: 'Gut erholt', c: 'good' } : raceTsb > -5 ? { t: 'Neutral', c: 'warn' } : { t: 'Noch ermüdet', c: 'bad' };
    const cell = (label, value, color, sub, size) => h('div', { className: 'col', style: { gap: 9, flex: '1 1 0', minWidth: 84 } },
      h('div', { className: 'label', style: { fontSize: 10.5, letterSpacing: '.08em', color: 'var(--text-3)' } }, label),
      h('div', { className: 'row', style: { height: 42, alignItems: 'flex-end' } },
        h('span', { className: 'metric', style: { fontSize: size || 34, fontWeight: 800, lineHeight: .95, color: color === 'text' ? 'var(--text)' : `var(--${color})` } }, value)),
      h('div', { style: { fontSize: 12, minHeight: 22, display: 'flex', alignItems: 'center', gap: 6 } }, sub));
    return h('div', { className: 'col', style: { gap: 18 } },
      h('div', { className: 'ff-frost', style: { padding: '14px 16px', borderRadius: 14 } },
        h('div', { className: 'row between center', style: { marginBottom: 4 } },
          h('span', { className: 'label' }, 'Szenario bis zum Wettkampf'),
          h('span', { className: 'chip', style: { height: 22, fontSize: 10.5 } }, h(Icon, { name: 'trophy', size: 12 }), `in ${weeks} ${weeks === 1 ? 'Woche' : 'Wochen'}`)),
        h('div', { className: 'col', style: { gap: 16, marginTop: 12 } },
          h(SimSlider, { label: 'Wochenvolumen', value: tss, min: 150, max: 650, step: 10, unit: ' TSS', onChange: setTss, hint: `≈ ${Math.round(tss / 7)} TSS pro Tag · aktuell ${FF.week.tssPlan} TSS/Woche geplant` }),
          h(SimSlider, { label: 'Wochen bis Wettkampf', value: weeks, min: 2, max: 20, step: 1, unit: weeks === 1 ? ' Woche' : ' Wochen', onChange: setWeeks }),
          h('div', { className: 'row between center' },
            h('div', { className: 'row center gap-8', style: { color: 'var(--text-2)' } }, h(Icon, { name: 'forecast', size: 15 }), h('span', { style: { fontSize: 12.5 } }, 'Taper in der letzten Woche')),
            h('button', { className: 'ff-gtoggle' + (taper ? ' is-on' : ''), onClick: () => setTaper((t) => !t), role: 'switch', 'aria-checked': taper, style: { cursor: 'pointer' } }, h('span', { className: 'ff-gtoggle-knob' }))))),
      h(MiniProjChart, { proj }),
      h('div', { className: 'row between', style: { gap: 18, alignItems: 'stretch' } },
        cell('Form am Renntag (TSB)', `${raceTsb > 0 ? '+' : ''}${raceTsb}`, 'viz-form',
          h('span', { className: 'chip', style: { height: 22, fontSize: 10, color: `var(--${verdict.c})` } }, h('span', { className: 'dot', style: { background: `var(--${verdict.c})` } }), verdict.t), 42),
        h('div', { style: { width: 1, background: 'var(--line)', alignSelf: 'stretch' } }),
        cell('Fitness am Renntag (CTL)', Math.round(last.ctl), 'viz-fitness',
          h(Delta, { value: Math.round(last.ctl - proj[0].ctl), suffix: ' vs. heute' }), 34),
        h('div', { style: { width: 1, background: 'var(--line)', alignSelf: 'stretch' } }),
        cell('Form heute (TSB)', `${startTsb > 0 ? '+' : ''}${startTsb}`, 'text',
          h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, `CTL ${Math.round(proj[0].ctl)}`), 34)),
      h('div', { style: { fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6 } },
        h(Icon, { name: 'info', size: 12 }),
        'Projektion über das CTL/ATL-Modell ab heute' + (taper ? ' · inkl. Taper letzte Woche' : '') + ' · Annahme: konstantes Wochenvolumen'));
  }

  /* ---------- Manuelle Vital-Eingaben: gelten bis Mitternacht (Tagesschlüssel) ---------- */
  const MV_KEY = 'ff-vitals-' + FF.TODAY.toISOString().slice(0, 10);
  function loadManualVitals() {
    try { const s = localStorage.getItem(MV_KEY); if (s) return JSON.parse(s); } catch (e) {}
    return {};
  }
  function saveManualVital(id, value) {
    try {
      const all = loadManualVitals();
      if (value === '' || value == null) delete all[id]; else all[id] = value;
      localStorage.setItem(MV_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  /* ---------- Gemeinsame Vital-Verlaufsdaten ----------
     Kachel-Sparkline UND großer Detail-Graph teilen sich dieselbe Reihe + Farbe,
     damit beide identisch aussehen. Letzter Punkt = heute. */
  const VITAL_DATA = {
    hrv:  { color: 'bad',       hist: [54, 57, 55, 59, 56, 60, 58, 56, 61, 59, 63, 60, 58, 62, 64, 61, 60, 63, 65, 62, 66, 63, 62, 65, 64, 67, 65, FF.recovery.hrv.val] },
    sleep:{ color: 'accent',    hist: [6.2, 7.1, 6.8, 7.5, 6.9, 7.2, 7.8, 6.5, 7.0, 7.4, 6.7, 7.6, 7.1, 6.9, 7.3, 7.7, 6.8, 7.2, 7.5, 7.0, 6.6, 7.4, 7.8, 7.1, 6.9, 7.5, 7.2, FF.recovery.sleep.val] },
    rhr:  { color: 'warn',      hist: [46, 47, 48, 46, 49, 47, 50, 48, 49, 47, 48, 50, 49, 48, 47, 49, 50, 48, 47, 49, 48, 50, 49, 47, 48, 49, 50, FF.recovery.rhr.val] },
    resp: { color: 'info',      hist: [16, 15, 17, 15, 16, 14, 15, 16, 15, 14, 16, 15, 14, 15, 13, 14, 15, 14, 16, 15, 14, 15, 14, 13, 14, 15, 14, 14] },
    spo2: { color: 'good',      hist: [97, 98, 97, 98, 99, 98, 97, 98, 98, 97, 98, 99, 98, 97, 98, 98, 99, 98, 97, 98, 98, 98, 97, 99, 98, 98, 97, 98] },
    bp:   { color: 'sport-run', hist: [120, 118, 122, 119, 117, 121, 118, 120, 119, 118, 121, 117, 119, 120, 118, 122, 119, 117, 120, 118, 119, 121, 118, 120, 117, 119, 118, 118] },
  };
  /* Verlauf inkl. heute manuell eingegebenem Wert (ersetzt den letzten = heutigen Punkt) */
  function vitalHist(id, manualValue) {
    const d = VITAL_DATA[id]; if (!d) return null;
    const m = manualValue != null ? manualValue : loadManualVitals()[id];
    if (m == null || m === '') return d.hist;
    const num = parseFloat(String(m).replace(',', '.'));
    return isNaN(num) ? d.hist : d.hist.slice(0, -1).concat(num);
  }

  function Vital({ id, icon, label, value, unit, base, status, spark, sparkColor, glow, pulse, pulseColor, onClick, active, valueSize = 56, manualHint, noData }) {
    const stCol = status === 'good' ? 'var(--good)' : status === 'warn' ? 'var(--warn)' : 'var(--bad)';
    const [manual, setManual] = useState(() => (id ? (loadManualVitals()[id] || null) : null));
    const [draft, setDraft] = useState('');
    const hasManual = manual != null && manual !== '';
    // fresh account with no data yet: show a dash + manual-entry field, never the
    // demo value/baseline/history (those belong to the sample dataset only).
    const showData = hasManual || !noData;
    const displayValue = hasManual ? manual : (noData ? '–' : value);
    /* manueller Wert erscheint als neuester Punkt im Verlauf */
    let displaySpark = spark;
    if (hasManual && Array.isArray(spark)) {
      const num = parseFloat(String(manual).replace(',', '.'));
      if (!isNaN(num)) displaySpark = spark.slice(0, -1).concat(num);
    }
    const commit = () => {
      const v = draft.trim();
      setDraft('');
      if (v === '') return;
      setManual(v);
      if (id) saveManualVital(id, v);
    };
    const stop = (e) => e.stopPropagation();
    return h('div', { className: 'tile' + (glow ? ' spotlight' : '') + (onClick ? ' tile--clickable' : '') + (active ? ' tile--active' : ''),
        style: { ...(glow ? { '--glow-color': glow } : {}), position: 'relative', display: 'flex', flexDirection: 'column', gap: 0 }, onClick, role: onClick ? 'button' : undefined, tabIndex: onClick ? 0 : undefined },
      /* ambient pulse behind the content */
      pulse && h('span', { className: 'ff-vital-pulse' + (pulse === 'heart' ? ' is-heart' : ''), style: { '--pc': pulseColor || glow || 'var(--accent)' } }),
      /* content sits above the pulse */
      h('div', { style: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 0 } },
        /* header: label + status */
        h('div', { className: 'row between center' },
          h('div', { className: 'row center gap-8', style: { color: 'var(--text-3)' } },
            h(Icon, { name: icon, size: 15 }), h('span', { className: 'h3' }, label)),
          onClick ? h('span', { className: 'tile-expand', style: { color: active ? (glow || 'var(--good)') : 'var(--text-4)' } }, h(Icon, { name: 'arrowUR', size: 13 }))
            : h('span', { style: { width: 7, height: 7, borderRadius: 99, background: stCol } })),
        /* value + baseline, stacked */
        h('div', { className: 'col', style: { gap: 4, marginTop: 'auto', paddingTop: 10 } },
          h('div', { className: 'row', style: { alignItems: 'baseline', gap: 5, minWidth: 0 } },
            h('span', { className: 'metric', style: { fontSize: valueSize, lineHeight: .9, letterSpacing: '-.02em' } }, displayValue),
            h('span', { className: 'unit' }, unit)),
          base && showData && h('div', { className: 'row center', style: { minHeight: 22 } }, base)),
        /* full-width sparkline */
        spark && showData && h('div', { style: { marginTop: 10, width: '100%' } },
          h(C.Sparkline, { data: displaySpark, w: 260, hgt: 40, color: sparkColor || 'accent', fill: true, responsive: true })),
        /* manuelles Eingabefeld — überschreibt Wert bis Mitternacht */
        id && h('div', { className: 'ff-vital-manual', onClick: stop, onMouseDown: stop, onPointerDown: stop },
          h('input', { className: 'ff-vital-input', type: 'text', inputMode: 'decimal', value: draft,
            placeholder: hasManual ? ('Aktuell: ' + manual) : (manualHint || 'Wert eingeben'),
            onChange: (e) => setDraft(e.target.value),
            onKeyDown: (e) => { if (e.key === 'Enter') { commit(); e.currentTarget.blur(); } },
            onBlur: commit }),
          hasManual && h('button', { className: 'ff-vital-clear', type: 'button', title: 'Zurücksetzen',
            onClick: () => { setManual(null); setDraft(''); if (id) saveManualVital(id, ''); } }, h(Icon, { name: 'x', size: 12 })))));
  }

  function GoalBar({ value, max, color, label, detail }) {
    const pct = Math.max(0, Math.min(1, value / max));
    const [w, setW] = useState(0);
    useEffect(() => { const id = setTimeout(() => setW(pct), 80); return () => clearTimeout(id); }, [pct]);
    const base = `var(--${color})`;
    const pal = [
      base,
      `color-mix(in srgb, ${base} 74%, #ffffff)`,
      `color-mix(in srgb, ${base} 82%, #000000)`,
      `color-mix(in srgb, ${base} 80%, #ffffff)`,
    ];
    return h('div', { className: 'ff-glassbar', style: { height: 74 } },
      h('div', { className: 'ff-glassbar-fill', style: { width: `${w * 100}%`, '--c': base } },
        h(C.AnimatedGradient, { colors: pal, circleSize: 168, blur: 13, opacity: .92 })),
      h('div', { className: 'ff-glassbar-text' },
        h('div', { className: 'row', style: { gap: 10, minWidth: 0, flex: '1 1 auto', overflow: 'hidden', flexWrap: 'nowrap', alignItems: 'baseline' } },
          h('span', { className: 'h2', style: { fontSize: 22, color: '#fff', letterSpacing: '-.01em', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0 } }, label),
          h('span', { className: 'mono', style: { fontSize: 13.5, color: 'rgba(255,255,255,.9)', whiteSpace: 'nowrap', letterSpacing: '-.01em', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, detail)),
        h('span', { className: 'metric', style: { fontSize: 36, fontWeight: 800, lineHeight: 1, letterSpacing: '-.04em', flexShrink: 0, marginLeft: 10 } }, `${Math.round(pct * 100)}%`)));
  }

  /* ---- Form & Fitness: scrub the chart to read values at the cursor ---- */
  function FormFitnessCard({ onNav, allowSim, noData }) {
    const tl = FF.todayLoad;
    const [mode, setMode] = useState('history');
    const m = allowSim ? mode : 'history';
    const [scrub, setScrub] = useState(null);
    const [pins, setPins] = useState([]); // indices into the 56-day slice, in placement order, max 3
    const fslice = FF.load.slice(-56);
    // chart click is additive: add a new day, or (at max 3) drop the oldest and append — never removes
    const addPin = (i) => setPins((p) => p.includes(i) ? p : (p.length >= 3 ? [...p.slice(1), i] : [...p, i]));
    const removePin = (i) => setPins((p) => p.filter((x) => x !== i));
    const pinned = pins.length > 0;
    const live = !pinned && scrub != null;
    const d = live
      ? { ctl: Math.round(scrub.ctl), atl: Math.round(scrub.atl), tsb: Math.round(scrub.tsb), date: scrub.date }
      : { ctl: FF.fitnessScore, atl: Math.round(tl.atl), tsb: Math.round(tl.tsb), date: FF.TODAY };
    const st = d.tsb > 5 ? { t: 'Frisch', c: 'good' } : d.tsb > -10 ? { t: 'Neutral', c: 'warn' } : { t: 'Ermüdet', c: 'bad' };
    // pinned comparison: join each day's value with " / " in placement order
    const pinVals = (key) => pins.map((i) => {
      const v = fslice[i][key];
      return key === 'tsb' ? `${v > 0 ? '+' : ''}${Math.round(v)}` : Math.round(v);
    }).join('\u2009/\u2009');
    const numSize = (base) => pinned ? (pins.length >= 3 ? 21 : 27) : base;

    const ro = (label, value, color, sub, big, size) => h('div', { className: 'col', style: { gap: 9, minWidth: 88, flex: '1 1 0' } },
      h('div', { className: 'label', style: { fontSize: 10.5, letterSpacing: '.09em', color: 'var(--text-3)' } }, label),
      h('div', { className: 'row', style: { height: 44, alignItems: 'flex-end', gap: 4 } },
        h('span', { className: 'metric', style: { fontSize: size || (big ? 44 : 34), fontWeight: 800, lineHeight: .95, letterSpacing: '-.02em', color: color ? `var(--${color})` : 'var(--text)', transition: 'color .2s var(--ease), font-size .2s var(--ease)' } }, value)),
      h('div', { style: { fontSize: 12, height: 22, display: 'flex', alignItems: 'center', gap: 6 } }, sub));

    if (noData) {
      return h(Card, { title: 'Belastungsverh\u00e4ltnis', icon: 'diag', info: 'ATL (7\u2009Tage) vs. CTL (42\u2009Tage) ergeben die Trainingsstressbalance (TSB).' },
        h(CardEmpty, { icon: 'diag', title: 'Noch keine Form-Daten',
          hint: 'Fitness (CTL), Fatigue (ATL) und Form (TSB) berechnen sich aus deinen Aktivit\u00e4ten.',
          onNav, ctaRoute: 'import', cta: 'Aktivit\u00e4ten importieren' }));
    }
    return h(Card, { title: 'Belastungsverh\u00e4ltnis', icon: 'diag', info: 'ATL (7\u2009Tage) vs. CTL (42\u2009Tage) ergeben die Trainingsstressbalance (TSB).',
        right: h('div', { className: 'row center gap-12' },
          allowSim && h(ModeSeg, { value: m, onChange: setMode }),
          m === 'history' && h('div', { className: 'row center gap-16 ff-hide-sm' },
            h(LegendDot, { color: 'viz-fitness', label: 'CTL Fitness' }),
            h(LegendDot, { color: 'viz-fatigue', label: 'ATL Fatigue', dash: true }),
            h(LegendDot, { color: 'viz-form', label: 'TSB Form' })),
          h('button', { className: 'btn btn--sm btn--ghost', onClick: () => onNav(m === 'sim' ? 'prognose' : 'diag') }, m === 'sim' ? 'Mehr' : 'Details', h(Icon, { name: 'chevR', size: 14 }))) },
      m === 'sim' ? h(FormSimulator, null) : h(Fragment, null,
      // scrub / compare readout header
      h('div', { className: 'row between center', style: { marginBottom: 14, gap: 12, height: 30 } },
        pinned
          ? h('span', { className: 'chip', style: { height: 24, fontSize: 10, color: 'var(--accent-bright)', borderColor: 'color-mix(in srgb,var(--accent) 40%, transparent)' } },
              h(Icon, { name: 'diag', size: 12 }), `Vergleich · ${pins.length} ${pins.length === 1 ? 'Tag' : 'Tage'}`)
          : h('span', { className: 'chip', style: { height: 24, fontSize: 10, color: live ? 'var(--accent-bright)' : 'var(--text-3)', borderColor: live ? 'color-mix(in srgb,var(--accent) 40%, transparent)' : 'var(--line)', transition: 'color .2s, border-color .2s' } },
              h(Icon, { name: live ? 'activity' : 'check', size: 12 }), live ? 'Verlaufspunkt' : 'Aktueller Stand'),
        pinned
          ? h('div', { className: 'row center', style: { gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' } },
              pins.map((i, k) => h('button', { key: i, className: 'chip', onClick: () => removePin(i), title: 'Tag entfernen',
                  style: { height: 24, fontSize: 11, gap: 6, cursor: 'pointer', background: 'transparent' } },
                h('span', { style: { width: 15, height: 15, borderRadius: 99, background: 'rgba(255,255,255,.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9 } }, k + 1),
                h('span', { className: 'mono' }, fmt.date(fslice[i].date)),
                h(Icon, { name: 'x', size: 11 }))),
              h('button', { className: 'btn btn--sm btn--ghost', onClick: () => setPins([]) }, 'Zurücksetzen'))
          : h('span', { className: 'mono', style: { fontSize: 13, color: live ? 'var(--accent-bright)' : 'var(--text-3)', transition: 'color .2s var(--ease)' } }, fmt.dateFull(d.date))),
      h('div', { className: 'row between', style: { marginBottom: 18, gap: 20, alignItems: 'stretch' } },
        ro('Fitness Score (CTL)', pinned ? pinVals('ctl') : d.ctl, 'viz-fitness',
          h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, 'CTL · 42 Tage'), true, numSize(44)),
        h('div', { style: { width: 1, background: 'var(--line)', alignSelf: 'stretch', flex: '0 0 auto' } }),
        ro('Fatigue (ATL)', pinned ? pinVals('atl') : d.atl, 'viz-fatigue',
          h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, 'ATL · 7 Tage'), false, numSize(34)),
        h('div', { style: { width: 1, background: 'var(--line)', alignSelf: 'stretch', flex: '0 0 auto' } }),
        ro('Form (TSB)', pinned ? pinVals('tsb') : `${d.tsb > 0 ? '+' : ''}${d.tsb}`, 'viz-form',
          pinned
            ? h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)' } }, 'TSB · Form')
            : h('span', { className: 'chip', style: { height: 22, fontSize: 10, color: `var(--${st.c})` } }, h('span', { className: 'dot', style: { background: `var(--${st.c})` } }), st.t),
          false, numSize(34))),
      h(C.LoadChart, { data: FF.load, days: 56, height: 230, onHover: setScrub, pins, onTogglePin: addPin }),
      h('div', { style: { marginTop: 8, fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6 } },
        h(Icon, { name: pinned ? 'check' : 'plus', size: 12 }),
        pins.length >= 3
          ? 'Max. 3 Tage — ein weiterer Klick ersetzt den ältesten Punkt · × am Chip entfernt einzeln'
          : pinned
            ? 'Weiteren Tag anklicken zum Vergleichen · × am Chip entfernt einzeln'
            : 'Auf den Verlauf klicken, um bis zu 3 Tage zu vergleichen')));
  }

  function WochenrhythmusCard({ noData, onNav }) {
    const fmt = FF.fmt;
    const [hoverDay, setHoverDay] = useState(null);
    const [pins, setPins] = useState([]); // weekday indices, placement order, max 3
    if (noData) {
      return h(Card, { title: 'Wochenrhythmus', icon: 'activity', className: 'ff-hero-card' },
        h(CardEmpty, { icon: 'activity', title: 'Noch kein Wochenrhythmus',
          hint: 'Dein wöchentliches Belastungsmuster erscheint hier, sobald Aktivitäten vorliegen.',
          onNav, ctaRoute: 'import', cta: 'Aktivitäten importieren' }));
    }
    const addPin = (i) => { if (i == null) return; setPins((p) => p.includes(i) ? p : (p.length >= 3 ? [...p.slice(1), i] : [...p, i])); };
    const removePin = (i) => setPins((p) => p.filter((x) => x !== i));
    const rhythm = [3.2, 9.6, 4.8, 9.2, 3.0, 8.4, 6.1];
    const rhythmMeta = [
      { total: 45, activities: 1, avg: 45 },   // Mo
      { total: 150, activities: 2, avg: 75 },  // Di
      { total: 70, activities: 1, avg: 70 },   // Mi
      { total: 135, activities: 2, avg: 68 },  // Do
      { total: 40, activities: 1, avg: 40 },   // Fr
      { total: 120, activities: 1, avg: 120 }, // Sa
      { total: 85, activities: 1, avg: 85 },   // So
    ];
    const dayNames = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    const dayShort = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const totMin = rhythmMeta.reduce((s, d) => s + d.total, 0);
    const totAct = rhythmMeta.reduce((s, d) => s + d.activities, 0);
    const avgDur = Math.round(totMin / totAct);
    const pinned = pins.length > 0;
    const hd = !pinned && hoverDay != null ? rhythmMeta[hoverDay] : null;

    const cell = (label, value, sub) => h('div', { className: 'col gap-6' },
      h('span', { className: 'label' }, label),
      h('span', { className: 'metric', style: { fontSize: 17, lineHeight: 1.1 } }, value),
      h('span', { style: { fontSize: 11, color: 'var(--text-3)' } }, sub));

    const right = pinned
      ? h('button', { className: 'btn btn--sm btn--ghost', onClick: () => setPins([]) }, 'Zurücksetzen')
      : h('span', { className: 'chip', style: { height: 24, fontSize: 10, color: hd ? 'var(--accent-bright)' : 'var(--text-3)', borderColor: hd ? 'color-mix(in srgb,var(--accent) 40%, transparent)' : 'var(--line)', transition: 'color .2s, border-color .2s' } },
          h(Icon, { name: hd ? 'activity' : 'check', size: 12 }), hd ? dayNames[hoverDay] : 'Wochenmittel');

    // comparison block
    let block;
    if (pinned) {
      block = h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${pins.length}, 1fr)`, gap: 14 } },
        pins.map((i, k) => {
          const m = rhythmMeta[i];
          return h('div', { key: i, className: 'col gap-6', style: { minWidth: 0 } },
            h('button', { className: 'chip', onClick: () => removePin(i), title: 'Tag entfernen',
                style: { height: 22, fontSize: 10, gap: 6, cursor: 'pointer', background: 'transparent', alignSelf: 'flex-start' } },
              h('span', { style: { width: 14, height: 14, borderRadius: 99, background: 'var(--accent-bright)', color: '#0a0b0d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9 } }, k + 1),
              h('span', { className: 'mono' }, dayShort[i]),
              h(Icon, { name: 'x', size: 10 })),
            h('span', { className: 'metric', style: { fontSize: 19, lineHeight: 1.05, color: 'var(--accent-bright)' } }, fmt.dur(m.total)),
            h('span', { style: { fontSize: 11, color: 'var(--text-3)' } }, `${m.activities} ${m.activities === 1 ? 'Einheit' : 'Einheiten'} · ⌀ ${fmt.dur(m.avg)}`));
        }));
    } else {
      block = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 } },
        hd ? cell(dayNames[hoverDay], fmt.dur(hd.total), 'Gesamtzeit')
           : cell('Aktivste Tage', 'Di · Do', 'Qualitätseinheiten'),
        hd ? cell('Aktivitäten', hd.activities, hd.activities === 1 ? 'Einheit' : 'Einheiten')
           : cell('Ø Einh. / Woche', '6,2', 'pro Woche'),
        hd ? cell('Ø Zeit', fmt.dur(hd.avg), 'je Einheit')
           : cell('Ø Dauer', fmt.dur(avgDur), 'je Einheit'));
    }

    return h(Card, { title: 'Wochenrhythmus', icon: 'activity', right, className: 'ff-hero-card' },
      h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' } },
        h('div', { className: 'col center', style: { padding: '4px 0' } },
          h(C.RadarChart, { axes: dayShort, values: rhythm, size: 300, meta: rhythmMeta, onHover: setHoverDay, pins, onTogglePin: addPin })),
        h('div', { style: { margin: '10px 0 6px', fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' } },
          h(Icon, { name: pinned ? 'check' : 'plus', size: 12 }),
          pins.length >= 3
            ? 'Max. 3 Tage — ein weiterer Klick ersetzt den ältesten · × am Chip entfernt einzeln'
            : pinned
              ? 'Weiteren Tag anklicken zum Vergleichen · × am Chip entfernt einzeln'
              : 'Auf einen Tag klicken, um bis zu 3 Tage zu vergleichen'),
        h('div', { className: 'rule', style: { margin: '6px 0 16px' } }),
        block));
  }

  /* ---- Intensity ring: one large donut, hover a zone to read its detail ---- */
  function IntensityRing({ parts, totalMin }) {
    /* Gleicher Stil wie Trainingsfokus: schlanke Verlaufs-Balken je Zone */
    const ZMETA = {
      z1: { name: 'Recovery', sub: 'Aktive Erholung' },
      z2: { name: 'Endurance', sub: 'Grundlagenausdauer' },
      z3: { name: 'Tempo', sub: 'Sweet Spot' },
      z4: { name: 'Threshold', sub: 'Schwelle' },
      z5: { name: 'VO\u2082max', sub: 'Maximale Intensit\u00e4t' },
    };
    return h('div', { className: 'col', style: { gap: 15 } },
      parts.map((p) => h(FokusRow, { key: p.zone, pct: p.value,
        dur: fmt.dur(Math.round(p.value / 100 * totalMin)),
        b: { zone: p.zone, label: `${p.label} \u00b7 ${ZMETA[p.zone].name}`, desc: ZMETA[p.zone].sub } })));
  }

  /* ============================================================
     EMPTY DASHBOARD — shown for a freshly registered (empty) account.
     A guided onboarding checklist (no Morgen-Check — that lives on the full
     dashboard). Steps tick off live; when all are done the full dashboard opens.
     Carries data-tour anchors for the onboarding tour.
     ============================================================ */
  function StepRow({ n, step, onNav }) {
    return h('div', { className: 'ff-ob-step' + (step.done ? ' is-done' : '') },
      h('span', { className: 'ff-ob-check' },
        step.done ? h(Icon, { name: 'check', size: 16 }) : h('span', { className: 'ff-ob-num' }, n)),
      h('span', { className: 'ff-ob-ic' }, h(Icon, { name: step.icon, size: 18 })),
      h('span', { className: 'col gap-1', style: { flex: 1, minWidth: 0 } },
        h('span', { className: 'ff-ob-title' }, step.t),
        h('span', { className: 'ff-ob-desc' }, step.d)),
      step.done
        ? h('span', { className: 'ff-ob-badge' }, h(Icon, { name: 'check', size: 12 }), 'Erledigt')
        : h('button', { className: 'btn btn--outline btn--sm', onClick: () => onNav(step.go) }, step.cta, h(Icon, { name: 'chevR', size: 14 })));
  }

  function EmptyDashboard({ onNav, onOnboarded, name }) {
    const a = FF.athlete;
    const Live = window.FFLive;
    const profileDone = !!(a.age && a.height && a.weight);
    const serviceDone = !!(Live && Live.integrations && Live.integrations.some((i) => i.status === 'connected'));
    const activitiesDone = !!(FF.activities && FF.activities.length > 0);
    const steps = [
      { key: 'profil', icon: 'profile', t: 'Profil vervollständigen', d: 'Alter, Größe, Gewicht & Schwellenwerte hinterlegen', done: profileDone, go: 'profil', cta: 'Profil öffnen' },
      { key: 'dienst', icon: 'link', t: 'Dienst verbinden', d: 'Strava, Garmin, Wahoo oder Apple Health', done: serviceDone, go: 'import', cta: 'Verbinden' },
      { key: 'import', icon: 'upload', t: 'Aktivitäten importieren', d: 'Per Sync oder FIT-/CSV-Datei hochladen', done: activitiesDone, go: 'import', cta: 'Importieren' },
    ];
    const doneCount = steps.filter((s) => s.done).length;
    const allDone = doneCount === steps.length;
    const pct = Math.round((doneCount / steps.length) * 100);

    return h('div', { className: 'ff-ob-wrap' },
      h('section', { className: 'panel ff-ob-card', 'data-tour': 'onboarding' },
        h('div', { className: 'panel-pad col gap-20' },
          h('div', { className: 'col gap-7' },
            h('span', { className: 'chip chip--solid', style: { alignSelf: 'flex-start' } }, h(Icon, { name: 'spark', size: 12 }), 'Erste Schritte'),
            h('h2', { className: 'metric', style: { fontSize: 30, lineHeight: 1.05, margin: '4px 0 0' } }, `Willkommen, ${name || 'Athlet'}.`),
            h('p', { style: { fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5, margin: 0, maxWidth: 520 } },
              'Schließe diese drei Schritte ab — dann erwacht dein Dashboard mit Morgen-Check, Belastungsrisiko und Form-Analyse zum Leben.')),

          h('div', { className: 'col gap-9' },
            h('div', { className: 'row between center' },
              h('span', { className: 'label' }, 'Fortschritt'),
              h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-2)' } }, `${doneCount} / ${steps.length} erledigt`)),
            h('div', { className: 'ff-ob-bar' }, h('div', { className: 'ff-ob-bar-fill', style: { width: pct + '%' } }))),

          h('div', { className: 'col gap-10' }, steps.map((s, i) => h(StepRow, { key: s.key, n: i + 1, step: s, onNav }))),

          allDone
            ? h('div', { className: 'ff-ob-done' },
                h('span', { className: 'ff-ob-done-ic' }, h(Icon, { name: 'check', size: 22 })),
                h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
                  h('span', { className: 'strong', style: { fontSize: 15, fontWeight: 700 } }, 'Alles startklar!'),
                  h('span', { style: { fontSize: 12.5, color: 'var(--text-2)' } }, 'Dein vollständiges Dashboard steht bereit.')),
                h('button', { className: 'btn btn--primary', onClick: () => {
                    if (window.FFAuth) { window.FFAuth.markOnboarded(); window.FFAuth.openDashboard(); }
                    onOnboarded && onOnboarded();
                  } },
                  'Dashboard öffnen', h(Icon, { name: 'chevR', size: 15 })))
            : h('p', { className: 'ff-ob-hint' }, h(Icon, { name: 'info', size: 14 }),
                h('span', null, 'Sobald alle Schritte erledigt sind, öffnet sich dein persönliches Dashboard automatisch.')))));
  }

  function Dashboard({ onOpenActivity, onNav, onOnboarded, modules }) {
    // Choose empty vs full WITHOUT calling either's hooks here, so the hook
    // order stays stable across the empty→full transition.
    if (FF.empty) return h(EmptyDashboard, { onNav, onOnboarded, name: FF.athlete.name });
    return h(FullDashboard, { onOpenActivity, onNav, modules });
  }

  function FullDashboard({ onOpenActivity, onNav, modules }) {
    const mods = modules || { checkin: true, risk: true, sim: true };
    const rec = FF.recovery, reco = FF.reco, w = FF.week, tl = FF.todayLoad;
    const [heroView, setHeroView] = useState('reco');
    const [checkin, setCheckin] = useState(loadCheckin);
    useEffect(() => { saveCheckin(checkin); }, [checkin]);
    const formStatus = tl.tsb > 5 ? { t: 'Frisch', c: 'good' } : tl.tsb > -10 ? { t: 'Neutral', c: 'warn' } : { t: 'Ermüdet', c: 'bad' };
    const intensity = [
      { zone: 'z1', value: w.intensity.z1, label: 'Z1' }, { zone: 'z2', value: w.intensity.z2, label: 'Z2' },
      { zone: 'z3', value: w.intensity.z3, label: 'Z3' }, { zone: 'z4', value: w.intensity.z4, label: 'Z4' },
      { zone: 'z5', value: w.intensity.z5, label: 'Z5' },
    ];
    // fresh account with no imported activities → render clean empty states
    // everywhere instead of the seeded demo values (recovery / vitals / focus).
    const noData = !FF.activities.length;

    return h('div', { className: 'ff-grid', style: { gap: 18 } },
      /* ---------- HERO ROW ---------- */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 18, alignItems: 'stretch' }, 'data-hero': true },
        /* Left column: recommendation + Belastungsbalance + Trainingsfokus below it */
        h('div', { className: 'col', style: { gap: 18 } },
          noData
            ? h(Card, { title: 'Heutige Empfehlung', icon: 'spark' },
                h(CardEmpty, { icon: 'spark', title: 'Noch keine Empfehlung',
                  hint: 'Sobald Aktivitäten und Erholungsdaten vorliegen, erscheint hier deine tägliche Trainingsempfehlung.',
                  onNav, ctaRoute: 'import', cta: 'Aktivitäten importieren' }))
            : h(EmpfehlungContent, { rec, reco, view: heroView, setView: setHeroView, checkin, setCheckin, showCheckin: mods.checkin }),
          mods.risk && h(RiskBar, { risk: FF.risk, noData }),
          h(TrainingsfokusCard, { noData, onNav })),
        /* Vitals 3x2 — Zeilen strecken sich über die volle Spaltenhöhe */
        h('div', { className: 'col', style: { gap: 18, height: '100%' } },
        h('div', { className: 'ff-grid grid-2', style: { gap: 18, gridTemplateRows: 'repeat(3, 1fr)', flex: 1, minHeight: 0 } },
          h(Vital, { id: 'hrv', icon: 'heart', label: 'HRV', value: rec.hrv.val, unit: 'ms', status: rec.hrv.status, glow: 'var(--bad)', pulse: 'heart', pulseColor: 'var(--bad)', noData,
            onClick: () => setHeroView((v) => (v === 'hrv' ? 'reco' : 'hrv')), active: heroView === 'hrv',
            base: h(Delta, { value: rec.hrv.val - rec.hrv.base, unit: ' ms', suffix: ' Baseline' }),
            spark: VITAL_DATA.hrv.hist, sparkColor: VITAL_DATA.hrv.color, manualHint: 'z. B. 68' }),
          h(Vital, { id: 'sleep', icon: 'moon', label: 'Schlaf', value: fmt.n(rec.sleep.val, 1), unit: 'h', status: rec.sleep.status, glow: 'var(--accent)', pulse: 'breathe', pulseColor: 'var(--accent)', noData,
            onClick: () => setHeroView((v) => (v === 'sleep' ? 'reco' : 'sleep')), active: heroView === 'sleep',
            base: h(Delta, { value: +(rec.sleep.val - 8).toFixed(1), unit: ' h', suffix: ' vs. Ziel' }),
            spark: VITAL_DATA.sleep.hist, sparkColor: VITAL_DATA.sleep.color, manualHint: 'z. B. 7,4' }),
          h(Vital, { id: 'rhr', icon: 'waves', label: 'Ruhepuls', value: rec.rhr.val, unit: 'bpm', status: rec.rhr.status, glow: 'var(--warn)', pulse: 'heart', pulseColor: 'var(--warn)', noData,
            onClick: () => setHeroView((v) => (v === 'rhr' ? 'reco' : 'rhr')), active: heroView === 'rhr',
            base: h(Delta, { value: rec.rhr.val - rec.rhr.base, unit: ' bpm', invert: true, suffix: ' Baseline' }),
            spark: VITAL_DATA.rhr.hist, sparkColor: VITAL_DATA.rhr.color, manualHint: 'z. B. 49' }),
          h(Vital, { id: 'resp', icon: 'lungs', label: 'Atemfrequenz', value: 14, unit: '/min', status: 'good', glow: 'var(--info)', pulse: 'breathe', pulseColor: 'var(--info)', noData,
            onClick: () => setHeroView((v) => (v === 'resp' ? 'reco' : 'resp')), active: heroView === 'resp',
            base: h(Delta, { value: 14 - 15, unit: ' /min', invert: true, suffix: ' Baseline' }),
            spark: VITAL_DATA.resp.hist, sparkColor: VITAL_DATA.resp.color, manualHint: 'z. B. 14' }),
          h(Vital, { id: 'spo2', icon: 'drop', label: 'Blutsauerstoff', value: 98, unit: '%', status: 'good', glow: 'var(--good)', pulse: 'breathe', pulseColor: 'var(--good)', noData,
            onClick: () => setHeroView((v) => (v === 'spo2' ? 'reco' : 'spo2')), active: heroView === 'spo2',
            base: h(Delta, { value: 98 - 97, unit: ' %', suffix: ' Baseline' }),
            spark: VITAL_DATA.spo2.hist, sparkColor: VITAL_DATA.spo2.color, manualHint: 'z. B. 98' }),
          h(Vital, { id: 'bp', icon: 'activity', label: 'Blutdruck', value: '118/76', unit: 'mmHg', valueSize: 32, status: 'good', glow: 'var(--sport-run)', pulse: 'heart', pulseColor: 'var(--sport-run)', noData,
            onClick: () => setHeroView((v) => (v === 'bp' ? 'reco' : 'bp')), active: heroView === 'bp',
            base: h(Delta, { value: 118 - 120, unit: ' mmHg', invert: true, suffix: ' Baseline' }),
            spark: VITAL_DATA.bp.hist, sparkColor: VITAL_DATA.bp.color, manualHint: 'z. B. 118/76' })))),

      /* ---------- FORM / FITNESS ROW ---------- */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 18 }, 'data-dash': true },
        h(FormFitnessCard, { onNav, allowSim: mods.sim, noData }),
        /* Weekly rhythm */
        h(WochenrhythmusCard, { noData, onNav })),

      /* ---------- WEEKLY GOALS + ACTIVITIES ---------- */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 18 }, 'data-dash': true },
        h(Card, { title: 'Wochenziele', icon: 'target',
          right: h('span', { className: 'chip' }, h('span', { className: 'dot', style: { background: 'var(--z4)' } }), w.focus) },
          /* four animated liquid-mesh orbs — same soul as the Recovery Score */
          h('div', { className: 'ff-goalgrid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, margin: '6px 0 24px', justifyItems: 'center' } },
            h(C.LiquidOrb, { value: w.sessionsDone, max: w.sessionsPlan, color: 'accent', label: 'Einheiten', detail: `${w.sessionsDone} / ${w.sessionsPlan}` }),
            h(C.LiquidOrb, { value: w.durDone, max: w.durPlan, color: 'info', label: 'Dauer', detail: `${fmt.dur(w.durDone)} / ${fmt.dur(w.durPlan)}` }),
            h(C.LiquidOrb, { value: w.kmDone, max: w.kmPlan, color: 'sport-run', label: 'Distanz', detail: `${fmt.n(w.kmDone, 0)} / ${w.kmPlan} km` }),
            h(C.LiquidOrb, { value: w.tssDone, max: w.tssPlan, color: 'z4', label: 'Trainingsload', detail: `${w.tssDone} / ${w.tssPlan} TSS` })),
          h('div', { className: 'rule', style: { margin: '4px 0 18px' } }),
          /* intensity distribution as a donut + legend */
          h('div', { className: 'row between center', style: { marginBottom: 18 } },
            h('span', { className: 'label' }, 'Intensit\u00e4tsverteilung'),
            h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-3)' } }, 'polarisiert \u00b7 80/20')),
          h(IntensityRing, { parts: intensity, totalMin: w.durDone }),
          h('div', { className: 'rule', style: { margin: '18px 0' } }),
          h(WeekStrip, { days: w.days, onNav })),
        h(Card, { title: 'Letzte Einheiten', icon: 'activity', pad: false,
          right: h('button', { className: 'btn btn--sm btn--ghost', onClick: () => onNav('diag') }, 'Alle') },
          h('div', { className: 'col', style: { padding: '4px 10px 10px' } },
            FF.activities.length
              ? FF.activities.slice(0, 5).map((a) => h(ActivityRow, { key: a.id, a, onClick: () => onOpenActivity(a.id) }))
              : h('div', { className: 'col center gap-8', style: { padding: '28px 10px', textAlign: 'center', color: 'var(--text-3)' } },
                  h(Icon, { name: 'activity', size: 22 }),
                  h('span', { style: { fontSize: 13 } }, 'Noch keine Aktivitäten'),
                  h('button', { className: 'btn btn--sm btn--outline', onClick: () => onNav('import') }, 'Aktivitäten importieren', h(Icon, { name: 'chevR', size: 13 })))))));
  }

  function LoadBar({ band, lo, hi, fillTo = 73, height = 100, colors = ['var(--z3)', 'var(--z4)', 'var(--z5)'] }) {
    const [w, setW] = useState(0);
    useEffect(() => { const id = requestAnimationFrame(() => setW(fillTo)); return () => cancelAnimationFrame(id); }, [fillTo]);
    return h('div', { className: 'ff-recovery', style: { height } },
      h('div', { className: 'ff-recovery-fill', style: { width: `${w}%` } },
        h(C.AnimatedGradient, { colors, circleSize: Math.round(height * 2.4), blur: 11, opacity: .96 })),
      h('div', { className: 'ff-recovery-num', style: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 3 } },
        h('span', { className: 'metric', style: { fontSize: Math.round(height * 0.32), lineHeight: 1 } }, band),
        h('span', { className: 'mono', style: { fontSize: Math.round(height * 0.15), opacity: .9, letterSpacing: '.02em' } }, `${lo}–${hi} TSS`)));
  }

  function RevealText({ text, stagger = 0.045 }) {
    const parts = text.split(/(\s+)/);
    let wi = 0;
    return h(Fragment, null, parts.map((p, i) => {
      if (p === '' || /^\s+$/.test(p)) return p;
      const d = (wi++ * stagger).toFixed(3);
      return h('span', { key: i, 'aria-hidden': true, className: 'ff-reveal-word', style: { animationDelay: `${d}s` } }, p);
    }));
  }

  function EmpfehlungContent({ rec, reco, view, setView, checkin, setCheckin, showCheckin }) {
    const [open, setOpen] = useState(false);
    const [hoverI, setHoverI] = useState(null);
    const [pins, setPins] = useState([]); // indices into the 28-day hist, placement order, max 3
    useEffect(() => { setPins([]); setHoverI(null); }, [view]); // reset when switching metric
    const addPin = (i) => { if (i == null) return; setPins((p) => p.includes(i) ? p : (p.length >= 3 ? [...p.slice(1), i] : [...p, i])); };
    const removePin = (i) => setPins((p) => p.filter((x) => x !== i));
    const histDates = FF.load.slice(-28).map((d) => d.date); // shared 28-day axis for pin labels
    const kiBtn = h('button', { className: 'btn-colorful', style: { height: 30, padding: '0 11px', fontSize: 10, letterSpacing: '.07em', flexShrink: 0 }, onClick: () => setOpen((o) => !o), 'aria-expanded': open },
      h('span', { className: 'btn-colorful__grad' }),
      h('span', { className: 'btn-colorful__content', style: { gap: 6 } },
        h(Icon, { name: 'spark', size: 12 }),
        'KI Analyse',
        h(Icon, { name: 'arrowUR', size: 12, style: { transition: 'transform .3s var(--ease)', transform: open ? 'rotate(90deg)' : 'none' } })));
    const backBtn = h('button', { className: 'btn btn--sm btn--ghost', onClick: () => setView('reco') },
      h(Icon, { name: 'chevL', size: 14 }), 'Heutige Empfehlung');

    if (view !== 'reco') {
      const tl = FF.todayLoad;
      const tsb = Math.round(tl.tsb);
      const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const DETAILS = {
        hrv: {
          title: 'HRV', icon: 'heart', color: VITAL_DATA.hrv.color,
          val: rec.hrv.val, unit: 'ms',
          hist: vitalHist('hrv'),
          delta: h(Delta, { value: rec.hrv.val - rec.hrv.base, unit: ' ms', suffix: ' vs. Baseline' }),
          subLabel: '28-Tage Trend', subFmt: (a) => `\u00d8 ${Math.round(a)} ms`,
          text: (() => { const dv = rec.hrv.val - rec.hrv.base; return `Deine HRV liegt mit ${rec.hrv.val}\u2009ms aktuell ${dv >= 0 ? dv + '\u2009ms \u00fcber' : Math.abs(dv) + '\u2009ms unter'} deiner 7-Tage-Baseline \u2014 ein ${dv >= 0 ? 'klares Zeichen guter Erholung' : 'Hinweis auf erh\u00f6hte Belastung'}. Der Aufw\u00e4rtstrend der letzten Tage deutet auf steigende Belastungstoleranz hin. Eine intensivere Einheit ist heute gut vertretbar.`; })(),
        },
        sleep: {
          title: 'Schlaf', icon: 'moon', color: VITAL_DATA.sleep.color,
          val: fmt.n(rec.sleep.val, 1), unit: 'h',
          hist: vitalHist('sleep'),
          delta: h(Delta, { value: +(rec.sleep.val - 8).toFixed(1), unit: ' h', suffix: ' vs. Ziel 8 h' }),
          subLabel: 'Schlafqualit\u00e4t', subFmt: () => `${rec.sleep.quality}%`,
          text: `Mit ${fmt.n(rec.sleep.val, 1)}\u2009h Schlaf liegst du nahe deinem Ziel von 8\u2009h. Die Schlafqualit\u00e4t von ${rec.sleep.quality}% deutet auf erholsame Tiefschlafphasen hin. Dein Nervensystem ist gut regeneriert \u2014 eine fordernde Einheit ist heute problemlos m\u00f6glich.`,
        },
        rhr: {
          title: 'Ruhepuls', icon: 'waves', color: VITAL_DATA.rhr.color,
          val: rec.rhr.val, unit: 'bpm',
          hist: vitalHist('rhr'),
          delta: h(Delta, { value: rec.rhr.val - rec.rhr.base, unit: ' bpm', invert: true, suffix: ' vs. Baseline' }),
          subLabel: '28-Tage Trend', subFmt: (a) => `\u00d8 ${Math.round(a)} bpm`,
          text: `Dein Ruhepuls liegt mit ${rec.rhr.val}\u2009bpm leicht \u00fcber deiner Baseline von ${rec.rhr.base}\u2009bpm. Ein erh\u00f6hter Ruhepuls kann auf beginnende Erm\u00fcdung oder unvollst\u00e4ndige Erholung hindeuten. Achte heute auf dein K\u00f6rpergef\u00fchl und halte die Intensit\u00e4t eher moderat.`,
        },
        tsb: {
          title: 'Form (TSB)', icon: 'bolt', color: 'z3',
          val: `${tsb > 0 ? '+' : ''}${tsb}`, unit: '',
          hist: FF.load.slice(-28).map((d) => d.tsb),
          delta: h(Delta, { value: Math.round(tl.tsb - tl.tsbPrev), suffix: ' vs. Vorwoche' }),
          subLabel: 'Fitness \u00b7 Fatigue', subFmt: () => `${Math.round(tl.ctl)} \u00b7 ${Math.round(tl.atl)}`,
          text: `Deine Form (TSB) liegt bei ${tsb > 0 ? '+' : ''}${tsb}. ${tsb > 5 ? 'Du bist frisch und ausgeruht \u2014 ideale Voraussetzungen f\u00fcr eine intensive Einheit oder einen Wettkampf.' : tsb > -10 ? 'Du befindest dich in einem ausgewogenen Zustand zwischen Belastung und Erholung \u2014 produktives Training ist gut m\u00f6glich.' : 'Dein K\u00f6rper tr\u00e4gt aktuell hohe Erm\u00fcdung \u2014 plane bewusst Erholung ein, um \u00dcberlastung zu vermeiden.'}`,
        },
        resp: {
          title: 'Atemfrequenz', icon: 'lungs', color: VITAL_DATA.resp.color,
          val: 14, unit: '/min',
          hist: vitalHist('resp'),
          delta: h(Delta, { value: 14 - 15, unit: ' /min', invert: true, suffix: ' vs. Baseline' }),
          subLabel: '28-Tage Trend', subFmt: (a) => `\u00d8 ${Math.round(a)} /min`,
          text: 'Deine Atemfrequenz liegt mit 14 Atemz\u00fcgen pro Minute im ruhigen Normalbereich (12\u201316 /min). Eine niedrige, gleichm\u00e4\u00dfige Ruheatmung spricht f\u00fcr ein gut regeneriertes, entspanntes Nervensystem.',
        },
        spo2: {
          title: 'Blutsauerstoff', icon: 'drop', color: VITAL_DATA.spo2.color,
          val: 98, unit: '%',
          hist: vitalHist('spo2'),
          delta: h(Delta, { value: 98 - 97, unit: ' %', suffix: ' vs. Baseline' }),
          subLabel: 'S\u00e4ttigung', subFmt: (a) => `\u00d8 ${Math.round(a)} %`,
          text: 'Deine Sauerstoffs\u00e4ttigung liegt mit 98 % im Normalbereich gesunder Menschen (98\u2013100 %). Werte von 95\u201397 % gelten weiterhin als normal, 90\u201394 % sind zu gering und abkl\u00e4rungsbed\u00fcrftig, unter 90 % ist der Bereich kritisch.',
        },
        bp: {
          title: 'Blutdruck', icon: 'activity', color: VITAL_DATA.bp.color,
          val: '118/76', unit: 'mmHg',
          hist: vitalHist('bp'),
          delta: h(Delta, { value: 118 - 120, unit: ' mmHg', invert: true, suffix: ' vs. Baseline' }),
          subLabel: 'Systole \u00b7 Diastole', subFmt: () => '118 \u00b7 76 mmHg',
          text: 'Dein Blutdruck liegt mit 118/76 mmHg im optimalen Bereich (systolisch < 120 und diastolisch < 80). Der Verlauf zeigt den systolischen Wert der letzten Wochen.',
        },
      };
      const d = DETAILS[view];
      const manualV = loadManualVitals()[view];
      const dVal = (manualV != null && manualV !== '') ? manualV : d.val; // heute manuell eingegebener Wert
      const fmtV = view === 'sleep' ? (v) => fmt.n(v, 1)
        : view === 'tsb' ? (v) => `${v > 0 ? '+' : ''}${Math.round(v)}`
        : (v) => `${Math.round(v)}`;
      const pinned = pins.length > 0;
      const live = !pinned && hoverI != null;
      const bigVal = pinned ? pins.map((i) => fmtV(d.hist[i])).join('\u2009/\u2009')
        : live ? fmtV(d.hist[hoverI]) : dVal;
      const bigSize = pinned ? (pins.length >= 3 ? 23 : pins.length === 2 ? 30 : 40) : 40;
      return h(Card, { key: view, title: `${d.title} \u00b7 Verlauf`, icon: d.icon, glow: true, spotlight: `var(--${d.color})`, className: 'ff-hero-card', style: { '--glow-size': '600px', minHeight: 'var(--hero-h, 410px)' },
          right: backBtn },
        // hover / compare status row — fixed height so the card never jumps
        h('div', { className: 'row between center', style: { marginBottom: 10, gap: 12, height: 28 } },
          pinned
            ? h('span', { className: 'chip', style: { height: 24, fontSize: 10, color: `var(--${d.color})`, borderColor: `color-mix(in srgb,var(--${d.color}) 40%, transparent)` } },
                h(Icon, { name: 'diag', size: 12 }), `Vergleich \u00b7 ${pins.length} ${pins.length === 1 ? 'Tag' : 'Tage'}`)
            : h('span', { className: 'chip', style: { height: 24, fontSize: 10, color: live ? `var(--${d.color})` : 'var(--text-3)', borderColor: live ? `color-mix(in srgb,var(--${d.color}) 40%, transparent)` : 'var(--line)', transition: 'color .2s, border-color .2s' } },
                h(Icon, { name: live ? 'activity' : 'check', size: 12 }), live ? 'Verlaufspunkt' : 'Aktueller Stand'),
          pinned
            ? h('div', { className: 'row center', style: { gap: 6, flexWrap: 'nowrap', justifyContent: 'flex-end' } },
                pins.map((i, k) => h('button', { key: i, className: 'chip', onClick: () => removePin(i), title: 'Punkt entfernen',
                    style: { height: 24, fontSize: 11, gap: 6, cursor: 'pointer', background: 'transparent' } },
                  h('span', { style: { width: 15, height: 15, borderRadius: 99, background: 'rgba(255,255,255,.14)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 9 } }, k + 1),
                  h('span', { className: 'mono' }, fmt.date(histDates[i])),
                  h(Icon, { name: 'x', size: 11 }))),
                h('button', { className: 'btn btn--sm btn--ghost', onClick: () => setPins([]) }, 'Zur\u00fccksetzen'))
            : h('span', { className: 'mono', style: { fontSize: 13, color: live ? `var(--${d.color})` : 'var(--text-3)', transition: 'color .2s var(--ease)' } }, live ? fmt.dateFull(histDates[hoverI]) : fmt.dateFull(FF.TODAY))),
        h('div', { className: 'row gap-24 wrap', style: { alignItems: 'center', marginBottom: 8 } },
          h('div', { className: 'col gap-2' },
            h('div', { className: 'row', style: { gap: 5, height: 42, alignItems: 'flex-end' } },
              h('span', { className: 'metric', style: { fontSize: bigSize, lineHeight: .95, color: `var(--${d.color})`, transition: 'font-size .2s var(--ease)' } }, bigVal),
              d.unit && h('span', { className: 'unit', style: { fontSize: 15 } }, d.unit)),
            h('div', { style: { height: 18, display: 'flex', alignItems: 'center' } }, pinned ? h('span', { className: 'label' }, `${pins.length} Punkte im Vergleich`) : d.delta)),
          h('div', { style: { width: 1, alignSelf: 'stretch', background: 'var(--line)' } }),
          h('div', { className: 'col gap-2' },
            h('span', { className: 'label' }, d.subLabel),
            h('span', { className: 'mono', style: { fontSize: 14, color: `var(--${d.color})` } }, d.subFmt(avg(d.hist))))),
        h(C.TelemetryChart, { height: 100, unit: d.unit ? ` ${d.unit}` : '', onHover: setHoverI, pins, onTogglePin: addPin,
          series: [{ data: d.hist, color: d.color, label: d.title, unit: d.unit ? ` ${d.unit}` : '' }] }),
        h('div', { style: { marginTop: 8, fontSize: 11, color: 'var(--text-4)', display: 'flex', alignItems: 'center', gap: 6 } },
          h(Icon, { name: pinned ? 'check' : 'plus', size: 12 }),
          pins.length >= 3
            ? 'Max. 3 Punkte \u2014 ein weiterer Klick ersetzt den \u00e4ltesten \u00b7 \u00d7 am Chip entfernt einzeln'
            : pinned
              ? 'Weiteren Punkt anklicken zum Vergleichen \u00b7 \u00d7 am Chip entfernt einzeln'
              : 'Auf den Verlauf klicken, um bis zu 3 Punkte zu vergleichen'),
        h('div', { className: 'ff-ki-body ff-ai-border row gap-10', style: {
            alignItems: 'flex-start', padding: '10px 14px', marginTop: 12, width: '100%',
            background: 'var(--accent-soft)', border: '1px solid transparent', borderRadius: 9 } },
          h('div', { style: { color: 'var(--accent-bright)', flexShrink: 0, marginTop: 1 } }, h(Icon, { name: 'spark', size: 14 })),
          h('div', { className: 'ff-ki-text', style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)', flex: 1, minWidth: 0 } },
            h(RevealText, { key: view, text: d.text }))));
    }

    const rs = recoState(checkin, showCheckin);
    const p = rs.p;
    return h(Card, { key: 'reco', title: 'Heutige Empfehlung', icon: 'gauge', glow: true, spotlight: 'var(--accent)', className: 'ff-hero-card', style: { '--glow-size': '600px', minHeight: 'var(--hero-h, 410px)' },
        right: h('div', { className: 'row center gap-10' },
          h('span', { className: 'chip chip--solid' }, h(Icon, { name: 'spark', size: 13 }), 'KI-gesteuert'),
          kiBtn) },
      h('div', { className: 'ff-reco-mid col gap-16', style: { flex: '1 1 auto', width: '100%', justifyContent: 'center' } },
        /* top: recovery score + recommended load — equal columns, aligned headers */
        h('div', { className: 'row gap-24 wrap', style: { alignItems: 'flex-start', width: '100%' } },
          /* LEFT — recovery score */
          h('div', { className: 'col gap-10', style: { flex: '1 1 280px', minWidth: 240 } },
            h(C.RecoveryScore, { value: rec.score }),
            h('div', { className: 'row center gap-6' }, h(Delta, { value: rec.trend, suffix: ' vs. gestern' }))),
          /* RIGHT — recommended load, driven by the Morgen-Check */
          h('div', { className: 'col gap-10', style: { flex: '1 1 280px', minWidth: 240 } },
            h('div', { className: 'row between center', style: { minHeight: 22 } },
              h('span', { className: 'label' }, 'Empfohlene Belastung'),
              h('span', { className: 'chip', style: { color: `var(--${p.col})` } }, h('span', { className: 'dot', style: { background: `var(--${p.col})` } }), p.focus)),
            h(LoadBar, { band: p.band, lo: p.tssLo, hi: p.tssHi, fillTo: p.fill, colors: p.cols }),
            rs.adjusted && h('div', { className: 'row center gap-6', style: { fontSize: 11.5, color: `var(--${rs.adjTone})` } }, h(Icon, { name: 'spark', size: 12 }), rs.adjNote))),
        /* full-width Morgen-Check — three metrics distributed across the whole row */
        showCheckin && h('div', { className: 'rule' }),
        showCheckin && h(ReadinessInputs, { value: checkin, onChange: setCheckin, wide: true })),
      h('div', { style: { paddingTop: 16, width: '100%' } },
        open
          ? h('div', { key: 'ki', className: 'ff-ki-body ff-ai-border ff-swap-in row gap-10', style: {
              alignItems: 'flex-start', padding: '10px 14px', width: '100%',
              background: 'var(--accent-soft)', border: '1px solid transparent', borderRadius: 9 } },
            h('div', { style: { color: 'var(--accent-bright)', flexShrink: 0, marginTop: 1 } }, h(Icon, { name: 'spark', size: 14 })),
            h('div', { className: 'ff-ki-text', style: { fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)', flex: 1, minWidth: 0 } },
              h(RevealText, { key: 'open' + rs.net, text: rs.text })))
          : h('div', { key: 'sum', className: 'ff-frost ff-swap-in row between center gap-12', style: {
              padding: '11px 14px', width: '100%', borderRadius: 9 } },
            h('div', { className: 'row center gap-10', style: { minWidth: 0 } },
              h('div', { style: { color: 'var(--accent-bright)', flexShrink: 0, display: 'inline-flex' } }, h(Icon, { name: 'bolt', size: 16 })),
              h('div', { className: 'col', style: { minWidth: 0, gap: 1 } },
                h('span', { className: 'label' }, 'Empfehlung heute'),
                h('span', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, p.headline))),
            h('span', { className: 'chip', style: { color: `var(--${p.col})`, flexShrink: 0 } }, h('span', { className: 'dot', style: { background: `var(--${p.col})` } }), p.focus))));
  }

  function LegendDot({ color, label, dash }) {
    return h('div', { className: 'row center gap-6' },
      h('span', { style: { width: 14, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} var(--${color})` } }),
      h('span', { className: 'label', style: { color: 'var(--text-2)' } }, label));
  }

  function WeekStrip({ days, onNav }) {
    return h('div', null,
      h('div', { className: 'row between center', style: { marginBottom: 10 } },
        h('span', { className: 'label' }, 'Diese Woche'),
        h('button', { className: 'btn btn--sm btn--ghost', onClick: () => onNav('woche') }, 'Wochenplan', h(Icon, { name: 'chevR', size: 13 }))),
      h('div', { className: 'ff-weekstrip', style: { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 8 } },
        days.map((d, i) => {
          const done = d.done, plan = d.planned;
          const sp = done?.sport || plan?.sport;
          const col = sp ? `var(--${window.UI.SPORT[sp].color})` : 'var(--text-4)';
          return h('div', { key: i, style: {
            border: `1px solid ${d.today ? 'var(--accent-soft)' : 'var(--line)'}`,
            background: d.today ? 'var(--accent-soft)' : 'var(--panel-2)',
            borderRadius: 11, padding: '10px 6px', textAlign: 'center', position: 'relative',
            boxShadow: d.today ? 'inset 0 0 0 1px var(--accent-soft)' : 'none',
          } },
            h('div', { className: 'label', style: { fontSize: 10, marginBottom: 8, color: d.today ? 'var(--accent-bright)' : 'var(--text-3)' } }, d.day),
            sp ? h('div', { className: 'col center gap-4' },
              h('div', { style: { color: col, opacity: done ? 1 : .5 } }, h(Icon, { name: window.UI.SPORT[sp].icon, size: 17 })),
              h('span', { className: 'mono', style: { fontSize: 10, color: done ? 'var(--text-2)' : 'var(--text-4)' } }, `${(done || plan).tss}`),
              done && h('span', { style: { position: 'absolute', top: 6, right: 6, color: 'var(--good)' } }, h(Icon, { name: 'check', size: 11 })))
              : h('div', { style: { height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 11 } }, 'Rest'));
        })));
  }

  function ActivityRow({ a, onClick }) {
    const intCol = a.intensity === 'Hard' ? 'z5' : a.intensity === 'Tempo' ? 'z3' : 'z1';
    return h('div', { className: 'ff-arow', onClick },
      h(SportIcon, { sport: a.sport, size: 38, soft: true }),
      h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
        h('div', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.title),
        h('div', { className: 'row center gap-8', style: { fontSize: 11.5, color: 'var(--text-3)', flexWrap: 'wrap', rowGap: 2 } },
          h('span', null, FF.fmt.date(a.date)),
          h('span', null, '·'), h('span', { className: 'mono' }, FF.fmt.dur(a.duration)),
          a.distance && h(Fragment, null, h('span', null, '·'), h('span', { className: 'mono' }, `${FF.fmt.n(a.distance, 1)} km`)))),
      h('div', { className: 'col', style: { alignItems: 'flex-end', gap: 4, flexShrink: 0 } },
        h('span', { className: 'mono strong', style: { fontSize: 14 } }, a.tss),
        h('span', { className: 'label', style: { fontSize: 8.5 } }, 'TSS')),
      h('span', { className: 'chip', style: { height: 22, fontSize: 10, color: `var(--${intCol})`, flexShrink: 0, whiteSpace: 'nowrap' } }, h('span', { className: 'dot', style: { background: `var(--${intCol})` } }), `RPE ${a.rpe}`));
  }

  window.Screens = window.Screens || {};
  window.Screens.Dashboard = Dashboard;
  window.Screens.ActivityRow = ActivityRow;
})();
