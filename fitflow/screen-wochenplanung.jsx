/* FitFlow — Planung (Tag · Woche · Jahr planner, interactive) */
(function () {
  const { createElement: h, useState, useRef, Fragment } = React;
  const { Card, Stat, AiInsight, EmptyState } = window.UI;
  const C = window.Charts;
  const Icon = window.Icon;
  const SPORT = window.UI.SPORT;
  const fmt = FF.fmt;

  const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const ZONES = [
    { v: 'z1', l: 'Z1 Recovery' }, { v: 'z2', l: 'Z2 Endurance' }, { v: 'z3', l: 'Z3 Tempo' },
    { v: 'z4', l: 'Z4 Threshold' }, { v: 'z5', l: 'Z5 VO₂max' },
  ];
  const PLATFORMS = { bike: ['Wahoo', 'Zwift', 'Garmin', 'Outdoor'], run: ['Garmin', 'Coros', 'Outdoor', 'Laufband'], lift: ['Hevy', 'Strong', 'Notiz'] };
  const tssEstimate = (dur, zone) => Math.round(dur * ({ z1: 0.55, z2: 0.82, z3: 1.15, z4: 1.5, z5: 1.75 }[zone] || 1));
  const parseTime = (t) => { const [hh, mm] = (t || '0:0').split(':').map(Number); return hh + (mm || 0) / 60; };

  /* ---------- workout-builder model + helpers ----------
     A workout is a list of rows. Each row is either a steady segment
     ({reps:1, on:{zone,dur}, off:null}) or an interval block
     ({reps:N, on:{zone,dur}, off:{zone,dur}}) — e.g. 4× [4min Z5 / 3min Z2].
     Rows flatten into segments that drive the profile graph + Live-TSS. */
  const ZONE_FACTOR = { z1: 0.55, z2: 0.82, z3: 1.15, z4: 1.5, z5: 1.75 };
  const ZONE_H = { z1: 0.34, z2: 0.5, z3: 0.66, z4: 0.83, z5: 1 };
  const ZONE_SHORT = { z1: 'Recovery', z2: 'Endurance', z3: 'Sweet-Spot', z4: 'Schwelle', z5: 'VO\u2082max' };
  const tssRaw = (dur, zone) => dur * (ZONE_FACTOR[zone] || 1);
  const rowSegs = (r) => { const o = []; for (let i = 0; i < r.reps; i++) { o.push({ zone: r.on.zone, dur: r.on.dur }); if (r.off) o.push({ zone: r.off.zone, dur: r.off.dur }); } return o; };
  const planSegs = (rows) => rows.reduce((a, r) => a.concat(rowSegs(r)), []);
  const segsDur = (segs) => segs.reduce((a, s) => a + s.dur, 0);
  const segsTss = (segs) => Math.round(segs.reduce((a, s) => a + tssRaw(s.dur, s.zone), 0));
  const domZone = (segs) => { const m = {}; segs.forEach((s) => { m[s.zone] = (m[s.zone] || 0) + s.dur; }); return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || 'z2'; };
  function autoTitle(rows) {
    const iv = rows.find((r) => r.reps > 1);
    if (iv) return `${iv.reps}\u00d7${iv.on.dur}\u2032 ${ZONE_SHORT[iv.on.zone]}`;
    const hard = rows.slice().sort((a, b) => ZONE_FACTOR[b.on.zone] - ZONE_FACTOR[a.on.zone])[0];
    return hard ? `${ZONE_SHORT[hard.on.zone]} ${hard.on.dur}\u2032` : 'Einheit';
  }

  /* classic workout-profile graph: one block per segment, width = duration,
     height = zone intensity, coloured by zone. */
  function WorkoutGraph({ segs, height = 82 }) {
    if (!segs || !segs.length) return null;
    return h('div', { className: 'wb-graph', style: { height } }, segs.map((s, i) =>
      h('div', { key: i, className: 'wb-seg', style: { flex: s.dur, height: (ZONE_H[s.zone] || 0.5) * 100 + '%', background: `var(--${s.zone})` }, title: `${ZONE_SHORT[s.zone]} \u00b7 ${s.dur} min` })));
  }
  function MiniWorkout({ segs, height = 16 }) {
    if (!segs || !segs.length) return null;
    return h('div', { className: 'wb-mini', style: { height } }, segs.map((s, i) =>
      h('i', { key: i, style: { flex: s.dur, height: (ZONE_H[s.zone] || 0.5) * 100 + '%', background: `var(--${s.zone})` } })));
  }
  function ZoneSet({ value, onChange }) {
    return h('div', { className: 'wb-zoneset' }, ['z1', 'z2', 'z3', 'z4', 'z5'].map((z) =>
      h('button', { key: z, type: 'button', className: 'wb-zbtn' + (value === z ? ' is-active' : ''), style: { '--zc': `var(--${z})` }, onClick: () => onChange(z) }, z.toUpperCase())));
  }
  function BuilderRow({ row, onChange, onRemove }) {
    const set = (patch) => onChange({ ...row, ...patch });
    const setOn = (patch) => onChange({ ...row, on: { ...row.on, ...patch } });
    const setOff = (patch) => onChange({ ...row, off: { ...row.off, ...patch } });
    return h('div', { className: 'wb-row' },
      h('div', { className: 'wb-reps', title: 'Wiederholungen' },
        h('button', { type: 'button', className: 'wb-step', onClick: () => set({ reps: Math.max(1, row.reps - 1) }) }, '\u2212'),
        h('span', { className: 'mono' }, row.reps + '\u00d7'),
        h('button', { type: 'button', className: 'wb-step', onClick: () => set({ reps: Math.min(20, row.reps + 1) }) }, '+')),
      h('div', { className: 'wb-seg-edit' },
        h(ZoneSet, { value: row.on.zone, onChange: (z) => setOn({ zone: z }) }),
        h('div', { className: 'wb-dur' },
          h('input', { type: 'number', className: 'ff-input wb-num', min: 1, step: 1, value: row.on.dur, onChange: (e) => setOn({ dur: Math.max(1, +e.target.value || 1) }) }),
          h('span', { className: 'wb-unit' }, 'min'))),
      row.off
        ? h('div', { className: 'wb-seg-edit wb-off' },
            h('span', { className: 'wb-slash' }, '/'),
            h(ZoneSet, { value: row.off.zone, onChange: (z) => setOff({ zone: z }) }),
            h('div', { className: 'wb-dur' },
              h('input', { type: 'number', className: 'ff-input wb-num', min: 1, step: 1, value: row.off.dur, onChange: (e) => setOff({ dur: Math.max(1, +e.target.value || 1) }) }),
              h('span', { className: 'wb-unit' }, 'min')),
            h('button', { type: 'button', className: 'ff-xbtn', title: 'Erholung entfernen', onClick: () => set({ off: null }) }, h(Icon, { name: 'x', size: 12 })))
        : h('button', { type: 'button', className: 'wb-addrec', onClick: () => set({ off: { zone: 'z2', dur: 3 } }) }, h(Icon, { name: 'plus', size: 12 }), 'Erholung'),
      h('button', { type: 'button', className: 'wb-del', title: 'Schritt l\u00f6schen', onClick: onRemove }, h(Icon, { name: 'x', size: 14 })));
  }
  const WB_PRESETS = [
    { label: 'Aufw\u00e4rmen', row: { reps: 1, on: { zone: 'z1', dur: 12 }, off: null } },
    { label: '4\u00d74 VO\u2082max', row: { reps: 4, on: { zone: 'z5', dur: 4 }, off: { zone: 'z2', dur: 3 } } },
    { label: '3\u00d712 Sweet-Spot', row: { reps: 3, on: { zone: 'z3', dur: 12 }, off: { zone: 'z2', dur: 4 } } },
    { label: '5\u00d73 Schwelle', row: { reps: 5, on: { zone: 'z4', dur: 3 }, off: { zone: 'z1', dur: 2 } } },
    { label: 'Ausfahren', row: { reps: 1, on: { zone: 'z1', dur: 10 }, off: null } },
  ];
  function WorkoutBuilder({ rows, setRows }) {
    const segs = planSegs(rows);
    const update = (i, r) => setRows(rows.map((x, j) => (j === i ? r : x)));
    const remove = (i) => setRows(rows.filter((_, j) => j !== i));
    const add = (r) => setRows(rows.concat([r]));
    return h('div', { className: 'col gap-10' },
      h(WorkoutGraph, { segs }),
      h('div', { className: 'col gap-8' }, rows.length === 0
        ? h('div', { style: { textAlign: 'center', padding: '14px 0', color: 'var(--text-4)', fontSize: 12 } }, 'Noch keine Schritte \u2014 Preset w\u00e4hlen oder Schritt hinzuf\u00fcgen.')
        : rows.map((r, i) => h(BuilderRow, { key: i, row: r, onChange: (nr) => update(i, nr), onRemove: () => remove(i) }))),
      h('button', { type: 'button', className: 'ff-add', style: { height: 36, marginTop: 0 }, onClick: () => add({ reps: 1, on: { zone: 'z2', dur: 20 }, off: null }) }, h(Icon, { name: 'plus', size: 14 }), 'Schritt hinzuf\u00fcgen'),
      h('div', { className: 'wb-presets' }, WB_PRESETS.map((p) =>
        h('button', { key: p.label, type: 'button', className: 'ff-pill wb-preset', onClick: () => add(p.row) }, h(Icon, { name: 'plus', size: 12 }), p.label))));
  }

  /* timeline window */
  const DAY_START = 6, DAY_END = 22, HOURH = 36;

  /* ---------- shared small bits ---------- */
  function Field({ label, children }) {
    return h('label', { className: 'col gap-6' }, h('span', { className: 'label' }, label), children);
  }
  function MiniStat({ label, value, unit, color, icon }) {
    return h('div', { style: { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px' } },
      h('div', { className: 'row between center', style: { marginBottom: 6 } },
        h('span', { className: 'label' }, label),
        icon && h('span', { style: { color: `var(--${color})`, opacity: .8 } }, h(Icon, { name: icon, size: 13 }))),
      h('div', { className: 'row center', style: { gap: 4 } },
        h('span', { className: 'metric', style: { fontSize: 20, color: `var(--${color})` } }, value),
        unit && h('span', { className: 'unit' }, unit)));
  }

  /* ---------- session card (week board) ---------- */
  function SessionCard({ s, onRemove, onAccept, onOpen, onDragStart, onDragEnd, dragging }) {
    const sp = SPORT[s.sport];
    return h('div', {
      className: 'ff-sess-card', draggable: true, onDragStart, onDragEnd,
      onClick: onOpen, style: {
        background: 'var(--panel-2)', border: `1px solid var(--line)`,
        borderLeft: `3px solid var(--${s.zone})`, borderRadius: 9, padding: '9px 10px', position: 'relative',
        opacity: dragging ? 0.35 : (s.suggested ? 0.94 : 1), borderStyle: s.suggested ? 'dashed' : 'solid',
      },
    },
      h('div', { className: 'row between center', style: { marginBottom: 5 } },
        h('div', { className: 'row center gap-6', style: { color: `var(--${sp.color})` } }, h(Icon, { name: sp.icon, size: 14 }),
          h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-3)' } }, s.time)),
        s.suggested
          ? h('span', { style: { color: 'var(--accent-bright)' }, title: 'KI-Vorschlag' }, h(Icon, { name: 'spark', size: 13 }))
          : h('button', { className: 'ff-xbtn', onClick: (e) => { e.stopPropagation(); onRemove(); }, title: 'Entfernen' }, h(Icon, { name: 'x', size: 12 }))),
      h('div', { className: 'strong', style: { fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, marginBottom: 6 } }, s.title),
      s.structure && h(MiniWorkout, { segs: s.structure, height: 16 }),
      h('div', { className: 'row between center', style: { marginTop: s.structure ? 6 : 0 } },
        h('span', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-2)' } }, `${fmt.dur(s.dur)} · ${s.tss} TSS`),
        h('span', { style: { width: 8, height: 8, borderRadius: 99, background: `var(--${s.zone})` } })),
      s.suggested && onAccept && h('button', { className: 'btn btn--sm btn--ghost', style: { width: '100%', marginTop: 8, height: 26, fontSize: 10 }, onClick: (e) => { e.stopPropagation(); onAccept(); } }, h(Icon, { name: 'check', size: 12 }), 'Übernehmen'));
  }

  /* ---------- add-session form ---------- */
  function AddForm({ onAdd, onCancel, defaultTime }) {
    const [sport, setSport] = useState('bike');
    const [platform, setPlatform] = useState('Wahoo');
    const [title, setTitle] = useState('');
    const [time, setTime] = useState(defaultTime || '17:30');
    const [mode, setMode] = useState('simple'); // simple | builder
    const [dur, setDur] = useState(60);
    const [zone, setZone] = useState('z2');
    const [rows, setRows] = useState([
      { reps: 1, on: { zone: 'z1', dur: 12 }, off: null },
      { reps: 4, on: { zone: 'z5', dur: 4 }, off: { zone: 'z2', dur: 3 } },
      { reps: 1, on: { zone: 'z1', dur: 8 }, off: null },
    ]);
    const isB = mode === 'builder';
    const segs = planSegs(rows);
    const bDur = segsDur(segs), bTss = segsTss(segs), bZone = segs.length ? domZone(segs) : 'z2';
    const simpleTss = tssEstimate(dur, zone);
    const outDur = isB ? bDur : dur;
    const outTss = isB ? bTss : simpleTss;
    const outZone = isB ? bZone : zone;
    const intensity = (outZone === 'z5' || outZone === 'z4') ? 'Hard' : outZone === 'z3' ? 'Tempo' : 'Easy';
    const submit = () => onAdd({ sport, platform, title: title || (isB ? autoTitle(rows) : SPORT[sport].label), time, dur: outDur, tss: outTss, zone: outZone, intensity, structure: isB && segs.length ? segs : null });
    return h('div', { className: 'col gap-12' },
      h('div', { className: 'col gap-6' }, h('span', { className: 'label' }, 'Sportart'),
        h('div', { className: 'row gap-8' }, Object.keys(SPORT).map((sp) =>
          h('button', { key: sp, onClick: () => { setSport(sp); setPlatform(PLATFORMS[sp][0]); }, className: 'ff-pill' + (sport === sp ? ' is-active' : '') },
            h(Icon, { name: SPORT[sp].icon, size: 15 }), SPORT[sp].label)))),
      h('div', { className: 'ff-grid grid-2', style: { gap: 12 } },
        h(Field, { label: 'Bezeichnung' }, h('input', { className: 'ff-input', placeholder: isB ? autoTitle(rows) : 'z.B. Sweet-Spot 3×12', value: title, onChange: (e) => setTitle(e.target.value) })),
        h(Field, { label: 'Trainingsplattform' }, h('select', { className: 'ff-input', value: platform, onChange: (e) => setPlatform(e.target.value) }, PLATFORMS[sport].map((p) => h('option', { key: p }, p))))),
      h('div', { className: 'row between center wrap', style: { gap: 12, alignItems: 'flex-end' } },
        h('div', { className: 'col gap-6' }, h('span', { className: 'label' }, 'Struktur'),
          h('div', { className: 'seg' }, [['simple', 'Einfach'], ['builder', 'Intervalle']].map(([v, l]) =>
            h('button', { key: v, className: mode === v ? 'is-active' : '', onClick: () => setMode(v) }, l)))),
        h(Field, { label: 'Zeitpunkt' }, h('input', { type: 'time', className: 'ff-input', style: { width: 132 }, value: time, onChange: (e) => setTime(e.target.value) }))),
      isB
        ? h(WorkoutBuilder, { rows, setRows })
        : h('div', { className: 'ff-grid grid-2', style: { gap: 12 } },
            h(Field, { label: 'Dauer (min)' }, h('input', { type: 'number', className: 'ff-input', value: dur, min: 5, step: 5, onChange: (e) => setDur(Math.max(5, +e.target.value || 5)) })),
            h(Field, { label: 'Intensität (Zone)' }, h('select', { className: 'ff-input', value: zone, onChange: (e) => setZone(e.target.value) }, ZONES.map((z) => h('option', { key: z.v, value: z.v }, z.l))))),
      h('div', { className: 'row between center', style: { marginTop: 2 } },
        h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-3)' } },
          isB
            ? h(Fragment, null, fmt.dur(outDur), ' · ', h('span', { style: { color: `var(--${outZone})`, fontWeight: 700 } }, `${outTss} TSS`))
            : h(Fragment, null, 'Geschätzte Load: ', h('span', { style: { color: `var(--${zone})`, fontWeight: 700 } }, `${simpleTss} TSS`))),
        h('div', { className: 'row gap-8' },
          h('button', { className: 'btn btn--sm btn--ghost', onClick: onCancel }, 'Abbrechen'),
          h('button', { className: 'btn btn--sm btn--primary', disabled: isB && !segs.length, onClick: submit }, h(Icon, { name: 'plus', size: 14 }), 'Hinzufügen'))));
  }

  /* ---------- add-event (Wettkampf) form ---------- */
  function EventForm({ onAdd, onCancel }) {
    const [name, setName] = useState('');
    const [date, setDate] = useState('2026-08-15');
    const [dist, setDist] = useState('');
    const [type, setType] = useState('A');
    return h('div', { className: 'col gap-12' },
      h(Field, { label: 'Bezeichnung' }, h('input', { className: 'ff-input', placeholder: 'z.B. Ötztaler Radmarathon', value: name, onChange: (e) => setName(e.target.value) })),
      h('div', { className: 'ff-grid grid-2', style: { gap: 12 } },
        h(Field, { label: 'Wettkampf-Datum' }, h('input', { type: 'date', className: 'ff-input', value: date, min: '2026-01-01', max: '2026-12-31', onChange: (e) => setDate(e.target.value) })),
        h(Field, { label: 'Strecke / Disziplin' }, h('input', { className: 'ff-input', placeholder: 'z.B. 227 km · 5500 hm', value: dist, onChange: (e) => setDist(e.target.value) }))),
      h('div', { className: 'col gap-6' }, h('span', { className: 'label' }, 'Priorität'),
        h('div', { className: 'seg' }, ['A', 'B', 'C'].map((p) =>
          h('button', { key: p, className: type === p ? 'is-active' : '', onClick: () => setType(p) },
            p === 'A' ? 'A · Saisonhöhepunkt' : p === 'B' ? 'B · Wichtig' : 'C · Training')))),
      h('div', { className: 'row between center', style: { marginTop: 2 } },
        h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-3)' } }, date ? `Countdown: ${weeksTo(date)} Wochen` : ''),
        h('div', { className: 'row gap-8' },
          h('button', { className: 'btn btn--sm btn--ghost', onClick: onCancel }, 'Abbrechen'),
          h('button', { className: 'btn btn--sm btn--primary', disabled: !name || !date, onClick: () => onAdd({ name: name || 'Wettkampf', date, dist, type }) }, h(Icon, { name: 'trophy', size: 14 }), 'Speichern'))));
  }

  /* ---------- helpers ---------- */
  const dayMs = 86400000;
  function weeksTo(dateStr) { return Math.max(0, Math.round((new Date(dateStr) - FF.TODAY) / (7 * dayMs))); }
  function monthFloat(d) { return d.getMonth() + (d.getDate() - 1) / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }

  /* annual weekly target load (seeded, phase-driven) */
  function buildYear() {
    const blocks = FF.annual.blocks;
    let s = 424242 >>> 0; const rr = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const phaseBase = { Recovery: 210, 'Off-Season': 360, Load: 545 };
    return Array.from({ length: 52 }, (_, w) => {
      const m = (w / 52) * 12;
      const block = blocks.find((b) => m >= b.start && m < b.end) || blocks[blocks.length - 1];
      const isReco = w % 4 === 3;
      const tss = Math.round(phaseBase[block.phase] * (isReco ? 0.58 : 1) * (0.88 + rr() * 0.26));
      return { w, tss, color: block.color, phase: block.phase, sub: block.sub, isReco };
    });
  }

  /* =========================================================
     WEEK VIEW
     ========================================================= */
  function WeekView({ days, selDay, onSelDay, onAdd, onRemove, onAccept, onAcceptAll, onMove }) {
    const [drag, setDrag] = useState(null);
    const [dropDay, setDropDay] = useState(null);
    const plannedTss = days.reduce((s, d) => s + d.items.reduce((a, it) => a + it.tss, 0), 0);
    const plannedDur = days.reduce((s, d) => s + d.items.reduce((a, it) => a + it.dur, 0), 0);
    const sessionCount = days.reduce((s, d) => s + d.items.length, 0);
    const suggestions = days.reduce((s, d) => s + d.items.filter((it) => it.suggested).length, 0);
    const zoneAgg = ['z1', 'z2', 'z3', 'z4', 'z5'].map((z) => ({ zone: z, value: days.reduce((s, d) => s + d.items.filter((it) => it.zone === z).reduce((a, it) => a + it.dur, 0), 0) }));
    const zoneTotal = zoneAgg.reduce((a, z) => a + z.value, 0) || 1;
    const zonePct = zoneAgg.map((z) => ({ zone: z.zone, value: Math.round((z.value / zoneTotal) * 100) }));
    const maxDayTss = Math.max(...days.map((d) => d.items.reduce((a, it) => a + it.tss, 0)), 1);
    const reco = FF.planner.recoTss;

    return h('div', { className: 'pl-view' },
      h(Card, {
        className: 'pl-main', title: 'Kalenderwoche · KW 24', icon: 'calendar',
        style: { alignSelf: 'stretch' },
        right: h('div', { className: 'row center gap-8' },
          h('span', { className: 'chip chip--solid' }, h(Icon, { name: 'flame', size: 12 }), 'Load · Polarisiert')),
      },
        h('div', { className: 'ff-week-scroll', style: { flex: 1 } },
          h('div', { className: 'ff-week-grid', style: { minHeight: 480, height: '100%' } }, days.map((d, di) => {
            const dayTss = d.items.reduce((s, it) => s + it.tss, 0);
            const isSel = di === selDay;
            return h('div', {
              key: di, className: 'ff-daycol' + (isSel ? ' is-sel' : '') + (dropDay === di && drag && drag.di !== di ? ' is-drop' : ''),
              onDragOver: (e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropDay !== di) setDropDay(di); } },
              onDrop: (e) => { e.preventDefault(); if (drag && drag.di !== di) onMove(drag.di, drag.ii, di); setDrag(null); setDropDay(null); },
            },
              h('div', { className: 'ff-daycol-head', onClick: () => onSelDay(di), title: 'Tagesansicht öffnen' },
                h('div', { className: 'row between center' },
                  h('div', { className: 'col' },
                    h('span', { className: 'label', style: { color: isSel ? 'var(--accent-bright)' : 'var(--text-3)' } }, d.day),
                    h('span', { className: 'metric', style: { fontSize: 16 } }, d.date)),
                  dayTss > 0 && h('span', { className: 'mono', style: { fontSize: 10, color: 'var(--text-3)' } }, `${dayTss}`)),
                h('div', { style: { height: 3, borderRadius: 99, marginTop: 7, background: 'rgba(255,255,255,.06)', overflow: 'hidden' } },
                  h('div', { style: { height: '100%', width: `${(dayTss / maxDayTss) * 100}%`, background: dayTss ? 'var(--accent)' : 'transparent', borderRadius: 99 } }))),
              h('div', { className: 'col gap-8', style: { minHeight: 40 } },
                d.items.length === 0 && h('div', { style: { fontSize: 11, color: 'var(--text-4)', textAlign: 'center', padding: '14px 0' } }, 'Ruhetag'),
                d.items.map((s, ii) => h(SessionCard, {
                  key: ii, s,
                  onRemove: () => onRemove(di, ii), onAccept: () => onAccept(di, ii), onOpen: () => onSelDay(di),
                  dragging: !!drag && drag.di === di && drag.ii === ii,
                  onDragStart: (e) => { setDrag({ di, ii }); try { e.dataTransfer.setData('text/plain', di + ':' + ii); e.dataTransfer.effectAllowed = 'move'; } catch (_) { /* noop */ } },
                  onDragEnd: () => { setDrag(null); setDropDay(null); },
                }))),
              h('button', { className: 'ff-add', onClick: () => onAdd(di) }, h(Icon, { name: 'plus', size: 14 }), 'Einheit'));
          }))),
        h('div', { className: 'row center gap-6', style: { marginTop: 12, justifyContent: 'center', fontSize: 10.5, color: 'var(--text-4)' } },
          h(Icon, { name: 'info', size: 11 }), 'Einheit ziehen, um sie auf einen anderen Tag zu verschieben · Tag anklicken für die Zeitstrahl-Ansicht')),

      h('div', { className: 'col', style: { gap: 30, alignSelf: 'stretch', justifyContent: 'space-between' } },
        h(Card, { title: 'KI-Empfehlung', icon: 'spark' },
          h('div', { className: 'col gap-14' },
            h('div', { className: 'row between center' },
              h(Stat, { label: 'Empfohlene Wochenload', value: reco, unit: 'TSS', accent: 'accent' }),
              h(C.ProgressRing, { value: plannedTss, max: reco, color: 'accent', size: 76, stroke: 8 },
                h('span', { className: 'metric', style: { fontSize: 15 } }, `${Math.round((plannedTss / reco) * 100)}%`))),
            h(AiInsight, null, `Polarisierter Block: 2 harte Reize (Di Sweet-Spot, Do VO₂max) und am Samstag die lange GA2-Ausfahrt. Aktuell ${plannedTss} von ${reco} TSS verplant — ${plannedTss < reco ? `noch ${reco - plannedTss} TSS Spielraum.` : 'Ziel erreicht.'}`),
            suggestions > 0 && h('button', { className: 'btn btn--sm btn--primary', style: { width: '100%' }, onClick: onAcceptAll },
              h(Icon, { name: 'check', size: 14 }), `${suggestions} KI-Vorschläge übernehmen`))),
        h(Card, { title: 'Wochenbilanz', icon: 'target' },
          h('div', { className: 'ff-grid grid-2', style: { gap: 12, marginBottom: 16 } },
            h(MiniStat, { label: 'Einheiten', value: sessionCount, color: 'accent', icon: 'activity' }),
            h(MiniStat, { label: 'Dauer', value: fmt.dur(plannedDur), color: 'info', icon: 'clock' }),
            h(MiniStat, { label: 'Load', value: plannedTss, unit: 'TSS', color: 'z4', icon: 'flame' }),
            h(MiniStat, { label: 'Ø Intensität', value: 'Mittel', color: 'z3', icon: 'gauge' })),
          h('span', { className: 'label', style: { display: 'block', marginBottom: 10 } }, 'Geplante Intensität'),
          h(C.StackedZoneBar, { parts: zonePct, height: 12 }),
          h('div', { className: 'row gap-10 wrap', style: { marginTop: 12 } }, zonePct.filter((z) => z.value > 0).map((z) =>
            h('span', { key: z.zone, className: 'mono', style: { fontSize: 11, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 5 } },
              h('span', { style: { width: 7, height: 7, borderRadius: 99, background: `var(--${z.zone})` } }), `${z.zone.toUpperCase()} ${z.value}%`))))));
  }

  /* =========================================================
     DAY VIEW — vertical timeline
     ========================================================= */
  function DayView({ days, selDay, onAddAt, onRemove, onAccept }) {
    const d = days[selDay];
    const hours = [];
    for (let hh = DAY_START; hh <= DAY_END; hh++) hours.push(hh);
    const trackH = (DAY_END - DAY_START) * HOURH;
    const dayTss = d.items.reduce((a, it) => a + it.tss, 0);
    const dayDur = d.items.reduce((a, it) => a + it.dur, 0);
    const focusZone = d.items.length ? d.items.reduce((m, it) => (it.tss > m.tss ? it : m)).zone : null;

    const onTrackClick = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const y = e.clientY - rect.top;
      let hf = DAY_START + y / HOURH;
      const mins = Math.round((hf * 60) / 30) * 30;
      const hh = Math.floor(mins / 60), mm = mins % 60;
      onAddAt(selDay, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    };

    return h('div', { className: 'pl-view' },
      h(Card, {
        className: 'pl-main', title: `${d.day} · ${d.date}. Juni`, icon: 'calendar',
        right: dayTss > 0
          ? h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-2)' } }, `${fmt.dur(dayDur)} · ${dayTss} TSS`)
          : h('span', { className: 'chip' }, h('span', { className: 'dot', style: { background: 'var(--z1)' } }), 'Ruhetag'),
      },
        h('div', { className: 'pl-tl', style: { height: trackH + 12 } },
          h('div', { className: 'pl-tl-axis', style: { height: trackH } },
            hours.map((hh, i) => h('div', { key: hh, className: 'pl-tl-hour', style: { top: i * HOURH } },
              h('span', { className: 'pl-tl-hlabel' }, `${String(hh).padStart(2, '0')}:00`)))),
          h('div', { className: 'pl-tl-track', style: { height: trackH }, onClick: onTrackClick },
            hours.map((hh, i) => h('div', { key: hh, className: 'pl-tl-line', style: { top: i * HOURH } })),
            d.items.length === 0 && h('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 12, pointerEvents: 'none' } },
              'Kein Training geplant — auf den Zeitstrahl klicken, um eine Einheit zu setzen'),
            d.items.map((s, ii) => {
              const sp = SPORT[s.sport];
              const top = (parseTime(s.time) - DAY_START) * HOURH;
              const ht = Math.max(34, (s.dur / 60) * HOURH);
              return h('div', {
                key: ii, className: 'pl-tl-block', onClick: (e) => e.stopPropagation(),
                style: { top, height: ht, '--bc': `var(--${s.zone})`, opacity: s.suggested ? 0.96 : 1, borderStyle: s.suggested ? 'dashed' : 'solid' },
              },
                h('div', { className: 'row between center', style: { marginBottom: ht > 50 ? 4 : 0 } },
                  h('div', { className: 'row center gap-7', style: { minWidth: 0 } },
                    h('span', { style: { color: `var(--${sp.color})`, flexShrink: 0 } }, h(Icon, { name: sp.icon, size: 14 })),
                    h('span', { className: 'strong', style: { fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, s.title)),
                  s.suggested
                    ? h('span', { style: { color: 'var(--accent-bright)', flexShrink: 0 }, title: 'KI-Vorschlag' }, h(Icon, { name: 'spark', size: 12 }))
                    : h('button', { className: 'ff-xbtn', style: { flexShrink: 0 }, onClick: () => onRemove(selDay, ii) }, h(Icon, { name: 'x', size: 12 }))),
                ht > 50 && h('div', { className: 'mono', style: { fontSize: 10.5, color: 'var(--text-3)' } }, `${s.time} · ${fmt.dur(s.dur)} · ${s.tss} TSS`),
                s.structure && ht > 70 && h(MiniWorkout, { segs: s.structure, height: 13 }),
                s.suggested && ht > 64 && h('button', { className: 'btn btn--sm btn--ghost', style: { height: 24, fontSize: 10, marginTop: 5 }, onClick: () => onAccept(selDay, ii) }, h(Icon, { name: 'check', size: 11 }), 'Übernehmen'));
            }))),
        h('div', { className: 'row center gap-6', style: { marginTop: 6, justifyContent: 'center', fontSize: 10.5, color: 'var(--text-4)' } },
          h(Icon, { name: 'plus', size: 11 }), 'Auf den Zeitstrahl klicken, um eine Einheit zur gewählten Uhrzeit zu planen')),

      h('div', { className: 'col', style: { gap: 30, alignSelf: 'stretch', justifyContent: 'space-between' } },
        h(Card, { title: 'Bereitschaft', icon: 'heart' },
          h('div', { className: 'col center gap-12' },
            h(C.RecoveryGauge, { value: FF.recovery.score, size: 168, label: 'Recovery Score' }),
            h('div', { className: 'row gap-8 wrap', style: { justifyContent: 'center' } },
              h('span', { className: 'chip' }, h('span', { className: 'dot', style: { background: 'var(--good)' } }), `HRV ${FF.recovery.hrv.val} ms`),
              h('span', { className: 'chip' }, h('span', { className: 'dot', style: { background: 'var(--info)' } }), `Schlaf ${FF.fmt.n(FF.recovery.sleep.val, 1)} h`),
              h('span', { className: 'chip' }, h('span', { className: 'dot', style: { background: 'var(--warn)' } }), `Ruhepuls ${FF.recovery.rhr.val}`)))),
        h(Card, { title: 'Tagesempfehlung', icon: 'spark' },
          h('div', { className: 'col gap-12' },
            h(AiInsight, { compact: true }, FF.reco.text),
            h('div', { className: 'ff-grid grid-2', style: { gap: 12 } },
              h(MiniStat, { label: 'Tagesziel', value: dayTss || '—', unit: dayTss ? 'TSS' : '', color: 'accent', icon: 'target' }),
              h(MiniStat, { label: 'Fokus', value: focusZone ? focusZone.toUpperCase() : 'Reg.', color: focusZone || 'z1', icon: 'flame' }))))));
  }

  /* =========================================================
     YEAR VIEW — annual load strip + phases + events
     ========================================================= */
  function YearView({ events, onAddEvent, onRemoveEvent }) {
    const [hover, setHover] = useState(null);
    const weeks = useRef(null);
    if (!weeks.current) weeks.current = buildYear();
    const wk = weeks.current;
    const maxTss = Math.max(...wk.map((x) => x.tss));
    const blocks = FF.annual.blocks;
    const curMF = monthFloat(FF.TODAY);
    const curX = (curMF / 12) * 100;
    const curWeek = 23;
    const peak = wk.reduce((m, x) => (x.tss > m.tss ? x : m));
    const aEvent = events.find((e) => e.type === 'A');
    const phaseLabel = { Recovery: 'Erholung', 'Off-Season': 'Grundlage', Load: 'Aufbau' };

    const peakCtl = Math.round(Math.max(...FF.annual.ctlTarget));
    return h('div', { className: 'pl-view' },
      h(Card, { className: 'pl-main', title: 'Saison 2026 · Trainingslast', icon: 'year',
        right: h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-3)' } }, 'Woche 23 / 52') },
        h('div', { className: 'col', style: { flex: 1, gap: 0, minHeight: 0 } },
          /* phase ribbon */
          h('div', { className: 'pl-ribbon', style: { marginBottom: 4 } }, blocks.map((b, i) =>
            h('div', { key: i, className: 'pl-ribbon-seg', style: { width: `${((b.end - b.start) / 12) * 100}%`, background: `color-mix(in srgb, var(--${b.color}) 30%, transparent)`, color: 'var(--text)' } },
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${phaseLabel[b.phase] || b.phase} · ${b.sub}`)))),
          /* event flags */
          h('div', { className: 'pl-flagrow' }, events.map((e, i) => {
            const x = (monthFloat(new Date(e.date)) / 12) * 100;
            const col = e.type === 'A' ? 'var(--z5)' : e.type === 'B' ? 'var(--z4)' : 'var(--text-3)';
            return h('div', { key: i, className: 'pl-flag', style: { left: `${x}%` } },
              h('span', { className: 'mono', style: { fontSize: 9.5, fontWeight: 700, color: col, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' } },
                h(Icon, { name: 'trophy', size: 10 }), e.type),
              h('span', { className: 'pl-flag-pin', style: { background: col } }));
          })),
          /* bars */
          h('div', { style: { position: 'relative', flex: 1, minHeight: 280 } },
            h('div', { className: 'pl-bars', style: { position: 'absolute', inset: 0, height: 'auto' } }, wk.map((x, i) => {
              const isCur = i === curWeek;
              return h('div', {
                key: i, className: 'pl-bar', onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null),
                style: {
                  height: `${(x.tss / maxTss) * 100}%`, background: `var(--${x.color})`,
                  opacity: hover == null ? (isCur ? 1 : 0.62) : (hover === i ? 1 : 0.3),
                  boxShadow: isCur ? '0 0 0 1.5px var(--accent-bright)' : 'none',
                },
              });
            })),
            h('div', { className: 'pl-now-v', style: { left: `${curX}%` } })),
          /* month axis */
          h('div', { className: 'pl-months' }, FF.months.map((m, i) => h('span', { key: i, className: 'pl-month' }, m))),
          /* hover readout / legend */
          h('div', { className: 'row between center', style: { marginTop: 14, minHeight: 22 } },
            hover != null
              ? h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-2)' } },
                  `Woche ${hover + 1} · `, h('span', { style: { color: `var(--${wk[hover].color})`, fontWeight: 700 } }, `${wk[hover].tss} TSS`),
                  h('span', { style: { color: 'var(--text-4)' } }, ` · ${phaseLabel[wk[hover].phase] || wk[hover].phase}${wk[hover].isReco ? ' · Erholungswoche' : ''}`))
              : h('div', { className: 'row gap-12 wrap' }, [['z1', 'Erholung'], ['z2', 'Grundlage'], ['z4', 'Aufbau']].map(([z, l]) =>
                  h('span', { key: z, className: 'mono', style: { fontSize: 11, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 5 } },
                    h('span', { style: { width: 8, height: 8, borderRadius: 2, background: `var(--${z})` } }), l))),
            h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--accent-bright)', display: 'inline-flex', alignItems: 'center', gap: 5 } },
              h('span', { style: { width: 8, height: 2, background: 'var(--accent-bright)' } }), 'Heute')))),

      h('div', { className: 'col', style: { gap: 30, alignSelf: 'stretch', justifyContent: 'space-between' } },
        h(Card, { title: 'Saison-Überblick', icon: 'target' },
          h('div', { className: 'ff-grid grid-2', style: { gap: 12 } },
            h(MiniStat, { label: 'Aktuelle Phase', value: 'Aufbau', color: 'z4', icon: 'flame' }),
            h(MiniStat, { label: 'CTL → Peak', value: `${FF.fitnessScore} → ${peakCtl}`, color: 'accent', icon: 'year' }),
            h(MiniStat, { label: 'Wettkämpfe', value: events.length, color: 'info', icon: 'trophy' }),
            h(MiniStat, { label: 'Bis A-Wettkampf', value: aEvent ? weeksTo(aEvent.date) : '—', unit: aEvent ? 'Wo' : '', color: 'z5', icon: 'clock' }))),
        h(Card, { title: 'Wettkämpfe & Ziele', icon: 'trophy',
          right: h('button', { className: 'btn btn--sm btn--primary', onClick: onAddEvent }, h(Icon, { name: 'plus', size: 14 }), 'Wettkampf') },
          events.length === 0
            ? h('div', { style: { textAlign: 'center', padding: '24px 0', color: 'var(--text-4)', fontSize: 13 } }, 'Noch keine Wettkämpfe geplant.')
            : h('div', { className: 'col gap-10' }, events.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map((e, i) => {
                const col = e.type === 'A' ? 'z5' : e.type === 'B' ? 'z4' : 'text-3';
                return h('div', { key: i, className: 'pl-evt' },
                  h('span', { className: 'pl-badge mono', style: { background: `color-mix(in srgb, var(--${col}) 20%, transparent)`, color: `var(--${col})` } }, e.type),
                  h('div', { className: 'col', style: { flex: 1, minWidth: 0, lineHeight: 1.3 } },
                    h('span', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600 } }, e.name),
                    h('span', { className: 'mono', style: { fontSize: 11.5, color: 'var(--text-3)' } },
                      `${fmt.date(new Date(e.date))} 2026${e.dist ? ' · ' + e.dist : ''}`)),
                  h('div', { className: 'col', style: { alignItems: 'flex-end', lineHeight: 1.3 } },
                    h('span', { className: 'metric', style: { fontSize: 17 } }, weeksTo(e.date)),
                    h('span', { className: 'label' }, 'Wochen')),
                  h('button', { className: 'ff-xbtn', style: { marginLeft: 4 }, onClick: () => onRemoveEvent(i) }, h(Icon, { name: 'x', size: 13 })));
              })))));
  }

  /* =========================================================
     PLANUNG — shell + view switching
     ========================================================= */
  function Planung({ onNav }) {
    if (FF.empty) return h(EmptyState, { icon: 'calendar', title: 'Noch keine Trainingswoche',
      body: 'Sobald Aktivit\u00e4ten vorliegen oder du Einheiten planst, erscheint hier dein Wochen- und Tagesplan.',
      cta: 'Dienst verbinden', onCta: () => onNav && onNav('import'), cta2: 'Profil ausf\u00fcllen', onCta2: () => onNav && onNav('profil') });
    const [view, setView] = useState('woche'); // tag | woche | jahr
    const [selDay, setSelDay] = useState(1);
    const [days, setDays] = useState(() => FF.planner.sessions.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it, suggested: it.ai })) })));
    const [modal, setModal] = useState(null);   // { dayIdx, time? }
    const [evModal, setEvModal] = useState(false);
    const [events, setEvents] = useState([
      { name: 'Ötztaler Radmarathon', date: '2026-08-30', dist: '227 km · 5500 hm', type: 'A' },
      { name: 'Wachau Halbmarathon', date: '2026-09-20', dist: '21,1 km', type: 'B' },
    ]);

    const addItem = (di, item) => { setDays((ds) => ds.map((d, i) => i === di ? { ...d, items: [...d.items, item].sort((a, b) => parseTime(a.time) - parseTime(b.time)) } : d)); setModal(null); };
    const removeItem = (di, ii) => setDays((ds) => ds.map((d, i) => i === di ? { ...d, items: d.items.filter((_, j) => j !== ii) } : d));
    const acceptItem = (di, ii) => setDays((ds) => ds.map((d, i) => i === di ? { ...d, items: d.items.map((it, j) => j === ii ? { ...it, suggested: false } : it) } : d));
    const acceptAll = () => setDays((ds) => ds.map((d) => ({ ...d, items: d.items.map((it) => ({ ...it, suggested: false })) })));
    const moveItem = (fromDi, fromIi, toDi) => {
      if (fromDi === toDi) return;
      setDays((ds) => {
        const item = ds[fromDi] && ds[fromDi].items[fromIi];
        if (!item) return ds;
        return ds.map((d, i) => {
          if (i === fromDi) return { ...d, items: d.items.filter((_, j) => j !== fromIi) };
          if (i === toDi) return { ...d, items: [...d.items, item].sort((a, b) => parseTime(a.time) - parseTime(b.time)) };
          return d;
        });
      });
    };

    const goDay = (di) => { setSelDay(di); setView('tag'); };
    const stepDay = (dir) => setSelDay((s) => Math.max(0, Math.min(6, s + dir)));

    const d = days[selDay];

    /* period label per view */
    const periodMain = view === 'tag' ? `${d.day}, ${d.date}. Juni` : view === 'woche' ? '8.–14. Juni 2026' : 'Saison 2026';
    const periodSub = view === 'tag' ? 'Tagesplanung' : view === 'woche' ? 'Kalenderwoche 24' : 'Jahresperiodisierung';

    return h('div', { className: 'col', style: { gap: 0 } },
      /* view header */
      h('div', { className: 'pl-head' },
        h('div', { className: 'pl-head-l' },
          h('div', { className: 'seg' }, [['tag', 'Tag'], ['woche', 'Woche'], ['jahr', 'Jahr']].map(([v, l]) =>
            h('button', { key: v, className: view === v ? 'is-active' : '', onClick: () => setView(v) }, l))),
          view === 'tag' && h('div', { className: 'pl-nav' },
            h('button', { className: 'pl-navbtn', onClick: () => stepDay(-1), disabled: selDay === 0 }, h(Icon, { name: 'chevL', size: 16 })),
            h('div', { className: 'pl-period' }, periodMain, h('small', null, periodSub)),
            h('button', { className: 'pl-navbtn', onClick: () => stepDay(1), disabled: selDay === 6 }, h(Icon, { name: 'chevR', size: 16 }))),
          view !== 'tag' && h('div', { className: 'pl-period', style: { paddingLeft: 4 } }, periodMain, h('small', null, periodSub))),
        h('div', { className: 'row center gap-8' },
          view === 'jahr'
            ? h('button', { className: 'btn btn--sm btn--primary', onClick: () => setEvModal(true) }, h(Icon, { name: 'trophy', size: 15 }), 'Wettkampf')
            : h('button', { className: 'btn btn--sm btn--primary', onClick: () => setModal({ dayIdx: selDay }) }, h(Icon, { name: 'plus', size: 15 }), 'Einheit planen'))),

      /* body */
      view === 'woche' && h(WeekView, { days, selDay, onSelDay: goDay, onAdd: (di) => setModal({ dayIdx: di }), onRemove: removeItem, onAccept: acceptItem, onAcceptAll: acceptAll, onMove: moveItem }),
      view === 'tag' && h(DayView, { days, selDay, onAddAt: (di, time) => setModal({ dayIdx: di, time }), onRemove: removeItem, onAccept: acceptItem }),
      view === 'jahr' && h(YearView, { events, onAddEvent: () => setEvModal(true), onRemoveEvent: (i) => setEvents((es) => es.filter((_, j) => j !== i)) }),

      /* add-session modal */
      modal != null && h('div', { className: 'ff-modal-bg', onClick: () => setModal(null) },
        h('div', { className: 'ff-modal ff-modal--wide', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'row between center', style: { marginBottom: 18 } },
            h('div', { className: 'h3' }, `Einheit planen · ${days[modal.dayIdx].day} ${days[modal.dayIdx].date}. Juni`),
            h('button', { className: 'btn btn--icon btn--sm btn--ghost', onClick: () => setModal(null) }, h(Icon, { name: 'x', size: 16 }))),
          h(AddForm, { defaultTime: modal.time, onAdd: (item) => addItem(modal.dayIdx, item), onCancel: () => setModal(null) }))),

      /* add-event modal */
      evModal && h('div', { className: 'ff-modal-bg', onClick: () => setEvModal(false) },
        h('div', { className: 'ff-modal', onClick: (e) => e.stopPropagation() },
          h('div', { className: 'row between center', style: { marginBottom: 18 } },
            h('div', { className: 'h3' }, 'Wettkampf hinzufügen'),
            h('button', { className: 'btn btn--icon btn--sm btn--ghost', onClick: () => setEvModal(false) }, h(Icon, { name: 'x', size: 16 }))),
          h(EventForm, { onAdd: (ev) => { setEvents((es) => [...es, ev]); setEvModal(false); }, onCancel: () => setEvModal(false) }))));
  }

  window.Screens = window.Screens || {};
  window.Screens.Wochenplanung = Planung;
})();
