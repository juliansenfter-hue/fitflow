/* FitFlow — Leistungsdiagnostik (telemetry, load, comparison) */
(function () {
  const { createElement: h, useState, useMemo, Fragment } = React;
  const { Card, Stat, Tabs, AiInsight, SportIcon, EmptyState } = window.UI;
  const C = window.Charts;
  const Icon = window.Icon;
  const SPORT = window.UI.SPORT;
  const fmt = FF.fmt;

  const zoneFromMin = (zoneMin) => FF.zoneColors.map((z, i) => ({ zone: z, z: z.toUpperCase(), value: zoneMin[i] || 0 }));

  /* ---- metric tile in detail ---- */
  function M({ label, value, unit, color }) {
    return h('div', { style: { padding: '12px 0' } },
      h('div', { className: 'label', style: { marginBottom: 6 } }, label),
      h('div', { className: 'row center', style: { gap: 4 } },
        h('span', { className: 'metric', style: { fontSize: 19, color: color ? `var(--${color})` : 'var(--text)' } }, value),
        unit && h('span', { className: 'unit', style: { fontSize: 11 } }, unit)));
  }

  function Telemetry({ a }) {
    const charts = [];
    if (a.streams.power) charts.push({ key: 'power', label: 'Leistung', unit: ' W', color: 'sport-bike', series: [{ data: a.streams.power, color: 'sport-bike', label: 'Watt', unit: ' W' }] });
    if (a.streams.pace) charts.push({ key: 'pace', label: 'Pace', unit: '', color: 'sport-run', series: [{ data: a.streams.pace.map((s) => 360 - s), color: 'sport-run', label: 'Tempo', unit: '', fill: true }], paceRaw: a.streams.pace });
    if (a.streams.hr) charts.push({ key: 'hr', label: 'Herzfrequenz', unit: ' bpm', color: 'z5', series: [{ data: a.streams.hr, color: 'z5', label: 'HF', unit: ' bpm' }] });
    if (a.streams.cadence) charts.push({ key: 'cad', label: 'Kadenz', unit: a.sport === 'run' ? ' spm' : ' rpm', color: 'info', series: [{ data: a.streams.cadence, color: 'info', label: 'Kadenz', unit: a.sport === 'run' ? ' spm' : ' rpm' }] });
    return h('div', { className: 'col gap-16' }, charts.map((ch) =>
      h('div', { key: ch.key, className: 'col gap-8' },
        h('div', { className: 'row between center' },
          h('span', { className: 'label', style: { color: `var(--${ch.color})` } }, ch.label),
          h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-3)' } }, 'über die Zeit')),
        h(C.TelemetryChart, { series: ch.series, height: 110 }))));
  }

  function Detail({ a }) {
    const sp = SPORT[a.sport];
    const intCol = a.intensity === 'Hard' ? 'z5' : a.intensity === 'Tempo' ? 'z3' : 'z1';
    return h('div', { className: 'col gap-18' },
      h('div', { className: 'row between center wrap gap-12' },
        h('div', { className: 'row center gap-14' },
          h(SportIcon, { sport: a.sport, size: 46, soft: true }),
          h('div', { className: 'col gap-3' },
            h('div', { className: 'h3', style: { fontSize: 18 } }, a.title),
            h('div', { className: 'row center gap-8', style: { fontSize: 12, color: 'var(--text-3)' } },
              h('span', null, fmt.dateFull(a.date)), h('span', null, '·'),
              h('span', { className: 'row center gap-5' }, h(Icon, { name: 'link', size: 12 }), a.platform)))),
        h('div', { className: 'row center gap-8' },
          h('span', { className: 'chip', style: { color: `var(--${intCol})` } }, h('span', { className: 'dot', style: { background: `var(--${intCol})` } }), a.intensity),
          h('span', { className: 'chip' }, `RPE ${a.rpe}/10`))),

      /* metric grid */
      h('div', { className: 'ff-metric-grid' },
        h(M, { label: 'Dauer', value: fmt.dur(a.duration) }),
        a.distance && h(M, { label: 'Distanz', value: fmt.n(a.distance, 1), unit: 'km' }),
        a.elevation && h(M, { label: 'Höhenmeter', value: fmt.big(a.elevation), unit: 'm' }),
        h(M, { label: 'Kalorien', value: fmt.big(a.calories), unit: 'kcal' }),
        h(M, { label: 'Trainingsload', value: a.tss, unit: 'TSS', color: intCol }),
        a.avgPower && h(M, { label: 'Ø Leistung', value: a.avgPower, unit: 'W', color: 'sport-bike' }),
        a.maxPower && h(M, { label: 'Max Leistung', value: a.maxPower, unit: 'W' }),
        a.np && h(M, { label: 'Norm. Power', value: a.np, unit: 'W' }),
        a.avgPace && h(M, { label: 'Ø Pace', value: fmt.pace(a.avgPace), unit: '/km', color: 'sport-run' }),
        h(M, { label: 'Ø Herzfrequenz', value: a.avgHr, unit: 'bpm', color: 'z5' }),
        h(M, { label: 'Max Herzfrequenz', value: a.maxHr, unit: 'bpm' }),
        a.avgCad && h(M, { label: 'Ø Kadenz', value: a.avgCad, unit: a.sport === 'run' ? 'spm' : 'rpm', color: 'info' }),
        a.load && h(M, { label: 'Trainingsgewicht', value: fmt.big(a.load), unit: 'kg', color: 'sport-lift' })),

      h('div', { className: 'rule' }),
      h(AiInsight, { title: 'KI-Diagnose' }, a.ai),

      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 18, marginTop: 4 } },
        h('div', { className: 'col gap-10' }, h('span', { className: 'label' }, 'Telemetrie'), h(Telemetry, { a })),
        h('div', { className: 'col gap-12' },
          h('span', { className: 'label' }, 'Zeit in Zonen'),
          h(C.ZoneBars, { dist: zoneFromMin(a.zoneMin), unit: 'm' }))));
  }

  function Compare({ list }) {
    const rows = [
      { k: 'duration', l: 'Dauer', f: (a) => fmt.dur(a.duration), raw: (a) => a.duration },
      { k: 'distance', l: 'Distanz (km)', f: (a) => a.distance ? fmt.n(a.distance, 1) : '–', raw: (a) => a.distance || 0 },
      { k: 'tss', l: 'Load (TSS)', f: (a) => a.tss, raw: (a) => a.tss, color: 'z4' },
      { k: 'avgHr', l: 'Ø HF (bpm)', f: (a) => a.avgHr, raw: (a) => a.avgHr, color: 'z5' },
      { k: 'avgPower', l: 'Ø Leistung (W)', f: (a) => a.avgPower || '–', raw: (a) => a.avgPower || 0, color: 'sport-bike' },
      { k: 'calories', l: 'Kalorien', f: (a) => fmt.big(a.calories), raw: (a) => a.calories },
      { k: 'rpe', l: 'RPE', f: (a) => `${a.rpe}/10`, raw: (a) => a.rpe },
    ];
    return h('div', { className: 'col gap-2' },
      h('div', { className: 'ff-cmp-head', style: { gridTemplateColumns: `160px repeat(${list.length},1fr)` } },
        h('span', null, ''), list.map((a) => h('div', { key: a.id, className: 'row center gap-8' },
          h(SportIcon, { sport: a.sport, size: 28, soft: true }),
          h('div', { className: 'col', style: { minWidth: 0 } },
            h('span', { className: 'strong', style: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.title),
            h('span', { style: { fontSize: 10.5, color: 'var(--text-3)' } }, fmt.date(a.date)))))),
      rows.map((r) => {
        const max = Math.max(...list.map(r.raw), 1);
        return h('div', { key: r.k, className: 'ff-cmp-row', style: { gridTemplateColumns: `160px repeat(${list.length},1fr)` } },
          h('span', { className: 'label', style: { alignSelf: 'center' } }, r.l),
          list.map((a) => h('div', { key: a.id, className: 'col gap-5', style: { paddingRight: 14 } },
            h('span', { className: 'mono strong', style: { fontSize: 14 } }, r.f(a)),
            h('div', { style: { height: 5, borderRadius: 99, background: 'rgba(255,255,255,.06)', overflow: 'hidden' } },
              h('div', { style: { width: `${(r.raw(a) / max) * 100}%`, height: '100%', background: `var(--${r.color || 'accent'})`, borderRadius: 99 } })))));
      }));
  }

  function Diagnostik({ activity, setActivity, onNav }) {
    if (FF.empty) return h(EmptyState, { icon: 'activity', title: 'Noch keine Diagnostik-Daten',
      body: 'Importiere eine Aktivität mit Herzfrequenz-, Power- oder Pace-Daten, um Leistungs- und Einheiten-Analysen zu sehen.',
      cta: 'Aktivität importieren', onCta: () => onNav && onNav('import') });
    const [mode, setMode] = useState('einheiten'); // einheiten | load
    const [filter, setFilter] = useState('all');
    const [compare, setCompare] = useState(false);
    const [selected, setSelected] = useState(activity ? [activity] : []);

    const acts = FF.activities.filter((a) => filter === 'all' || a.sport === filter);
    const current = activity || (acts[0] && acts[0].id);
    const cmpList = selected.map((id) => FF.activities.find((a) => a.id === id)).filter(Boolean);

    const toggleSelect = (id) => {
      if (compare) setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length < 3 ? [...s, id] : s);
      else setActivity(id);
    };

    // weekly TSS bars (last 8 weeks)
    const weekly = useMemo(() => {
      const out = [];
      for (let w = 7; w >= 0; w--) {
        const slice = FF.load.slice(FF.load.length - (w + 1) * 7, FF.load.length - w * 7);
        const sum = slice.reduce((a, d) => a + d.tss, 0);
        out.push({ label: w === 0 ? 'Diese' : `-${w}`, value: Math.round(sum / 60 * 10) / 10, tss: sum });
      }
      return out;
    }, []);
    const tl = FF.todayLoad;
    const ramp6 = +(FF.load[FF.load.length - 1].ctl - FF.load[FF.load.length - 43].ctl).toFixed(1);
    const rampRate = +(ramp6 / 6).toFixed(1);

    return h('div', { className: 'col gap-18' },
      h('div', { className: 'row between center wrap gap-12' },
        h(Tabs, { items: [{ value: 'einheiten', label: 'Einheiten' }, { value: 'load', label: 'Trainingsload' }], value: mode, onChange: setMode }),
        mode === 'einheiten' && h('div', { className: 'row center gap-10' },
          h('div', { className: 'seg' }, [['all', 'Alle'], ['bike', 'Rad'], ['run', 'Lauf'], ['lift', 'Kraft']].map(([v, l]) =>
            h('button', { key: v, className: filter === v ? 'is-active' : '', onClick: () => setFilter(v) }, l))),
          h('button', { className: 'btn btn--sm ' + (compare ? 'btn--primary' : 'btn--ghost'), onClick: () => { setCompare((c) => !c); setSelected(compare ? [] : (current ? [current] : [])); } },
            h(Icon, { name: 'layers', size: 15 }), compare ? `Vergleich (${selected.length})` : 'Vergleichen'))),

      mode === 'load'
        ? h(LoadView, { weekly, tl, rampRate, ramp6 })
        : h('div', { className: 'ff-grid', style: { gridTemplateColumns: '340px minmax(0,1fr)', gap: 18, alignItems: 'start' }, 'data-diag': true },
          h(Card, { title: `Einheiten`, icon: 'activity', pad: false,
            right: h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-3)' } }, `${acts.length}`) },
            h('div', { className: 'col', style: { padding: '4px 8px 8px', maxHeight: 660, overflowY: 'auto' } },
              acts.map((a) => {
                const active = compare ? selected.includes(a.id) : current === a.id;
                return h('div', { key: a.id, className: 'ff-arow' + (active ? ' is-active' : ''), onClick: () => toggleSelect(a.id) },
                  compare && h('span', { className: 'ff-check' + (active ? ' on' : '') }, active && h(Icon, { name: 'check', size: 12 })),
                  h(SportIcon, { sport: a.sport, size: 36, soft: true }),
                  h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
                    h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, a.title),
                    h('span', { style: { fontSize: 11, color: 'var(--text-3)' } }, `${fmt.date(a.date)} · ${fmt.dur(a.duration)}`)),
                  h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-2)' } }, a.tss));
              }))),
          h(Card, { pad: true },
            compare
              ? (cmpList.length >= 2 ? h(Compare, { list: cmpList })
                : h('div', { style: { textAlign: 'center', padding: 60, color: 'var(--text-3)' } }, h(Icon, { name: 'layers', size: 28 }), h('div', { style: { marginTop: 12 } }, 'Wähle 2–3 Einheiten zum Vergleich')))
              : h(Detail, { a: FF.activities.find((a) => a.id === current) || FF.activities[0] }))));
  }

  function LoadView({ weekly, tl, rampRate, ramp6 }) {
    const formStatus = tl.tsb > 5 ? { t: 'Frisch / formaufbauend', c: 'good' } : tl.tsb > -10 ? { t: 'Produktiv', c: 'warn' } : { t: 'Ermüdet', c: 'bad' };
    const tileStyle = { padding: '24px 22px' };
    return h('div', { className: 'col gap-24' },
      h('div', { className: 'ff-grid grid-4', style: { gap: 28 } },
        h('div', { className: 'tile', style: tileStyle }, h(Stat, { label: 'Fitness · CTL', value: FF.fitnessScore, accent: 'accent', big: true })),
        h('div', { className: 'tile', style: tileStyle }, h(Stat, { label: 'Fatigue · ATL', value: Math.round(tl.atl), accent: 'info', big: true })),
        h('div', { className: 'tile', style: tileStyle }, h(Stat, { label: 'Form · TSB', value: `${tl.tsb > 0 ? '+' : ''}${Math.round(tl.tsb)}`, accent: formStatus.c, big: true, sub: h('span', { style: { fontSize: 11.5, color: `var(--${formStatus.c})` } }, formStatus.t) })),
        h('div', { className: 'tile', style: tileStyle }, h(Stat, { label: 'Ramp Rate · 6 Wo', value: `${rampRate > 0 ? '+' : ''}${fmt.n(rampRate, 1)}`, accent: 'z3', big: true, sub: h('span', { style: { fontSize: 11.5, color: 'var(--text-3)' } }, 'CTL / Woche') }))),
      h(Card, { title: 'Trainingsload-Verlauf', icon: 'diag', info: 'ATL (7\u2009T), CTL (42\u2009T) und TSB über 16 Wochen.',
        right: h('div', { className: 'row center gap-14 ff-hide-sm' },
          h(Lg, { color: 'viz-fitness', label: 'CTL' }), h(Lg, { color: 'viz-fatigue', label: 'ATL', dash: true }), h(Lg, { color: 'viz-form', label: 'TSB' })) },
        h(C.LoadChart, { data: FF.load, days: 112, height: 300 })),
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 18 } },
        h(Card, { title: 'Wöchentliche Trainingszeit', icon: 'timer' },
          h(C.BarSeries, { data: weekly, height: 200, target: 8.5, unit: 'h', color: 'viz-fitness' }),
          h('div', { className: 'row center gap-6', style: { marginTop: 8 } },
            h('span', { style: { width: 14, height: 0, borderTop: '2px dashed var(--accent)' } }), h('span', { className: 'label', style: { color: 'var(--text-2)' } }, 'Ziel 8,5\u2009h / Woche'))),
        h(Card, { title: 'KI-Belastungssteuerung', icon: 'spark' },
          h('div', { className: 'col gap-14' },
            h(AiInsight, null, `Der CTL ist in 6 Wochen um ${fmt.n(Math.abs(ramp6), 1)} Punkte ${ramp6 >= 0 ? 'gestiegen' : 'gesunken'} (${rampRate > 0 ? '+' : ''}${fmt.n(rampRate, 1)} / Woche) — eine ${Math.abs(rampRate) > 7 ? 'sehr steile' : 'nachhaltige'} Rampe. Bei einem TSB von ${Math.round(tl.tsb)} bist du ${formStatus.t.toLowerCase()}.`),
            h('div', { className: 'col gap-10' },
              h(Reco, { icon: 'check', color: 'good', t: 'Belastung tragbar', d: 'Aktuelle Rampe < 8 CTL/Wo — geringes Überlastungsrisiko.' }),
              h(Reco, { icon: 'flame', color: 'z4', t: 'Qualität priorisieren', d: 'Im Load-Block 2 harte Reize/Woche, Rest streng aerob halten.' }),
              h(Reco, { icon: 'moon', color: 'info', t: 'Regeneration', d: 'Vor dem nächsten Peak eine Erholungswoche (-40\u2009% Volumen) einplanen.' }))))));
  }
  function Reco({ icon, color, t, d }) {
    return h('div', { className: 'row gap-12', style: { padding: '10px 12px', background: 'var(--panel-2)', borderRadius: 10, border: '1px solid var(--line)' } },
      h('span', { style: { color: `var(--${color})`, flexShrink: 0, marginTop: 1 } }, h(Icon, { name: icon, size: 16 })),
      h('div', { className: 'col gap-2' }, h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, t), h('span', { style: { fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45 } }, d)));
  }
  function Lg({ color, label, dash }) {
    return h('div', { className: 'row center gap-6' },
      h('span', { style: { width: 14, height: 0, borderTop: `2px ${dash ? 'dashed' : 'solid'} var(--${color})` } }),
      h('span', { className: 'label', style: { color: 'var(--text-2)' } }, label));
  }

  window.Screens = window.Screens || {};
  window.Screens.Diagnostik = Diagnostik;
})();
