/* FitFlow — Profil & Zonen (interactive) */
(function () {
  const { createElement: h, useState, useRef, useEffect, Fragment } = React;
  const { Card, Stat, AiInsight, Avatar } = window.UI;
  const Icon = window.Icon;
  const fmt = FF.fmt;

  function Field({ label, children, suffix }) {
    return h('label', { className: 'col gap-6' },
      h('span', { className: 'label' }, label),
      h('div', { style: { position: 'relative' } }, children,
        suffix && h('span', { style: { position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-4)', pointerEvents: 'none' } }, suffix)));
  }

  function ZoneEditor({ title, zones, threshold, thLabel, unit, deriveKey, color }) {
    return h('div', { className: 'col gap-12' },
      // stacked visual
      h('div', { style: { display: 'flex', height: 14, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--line)' } },
        zones.map((z, i) => h('div', { key: i, title: z.name, style: { flex: z.hi - z.lo || 0.2, background: `var(--${z.color})` } }))),
      h('div', { className: 'col gap-1' }, zones.map((z, i) => {
        const lo = z[deriveKey + 'Lo'], hi = z[deriveKey + 'Hi'];
        const range = (isNaN(lo) || isNaN(hi)) ? '—' : `${lo}–${hi} ${unit}`;
        return h('div', { key: i, className: 'ff-zrow' },
          h('span', { className: 'mono', style: { width: 26, color: `var(--${z.color})`, fontWeight: 700, fontSize: 12 } }, z.z),
          h('span', { className: 'strong', style: { flex: 1, fontSize: 12.5, fontWeight: 500 } }, z.name),
          h('span', { className: 'label', style: { color: 'var(--text-4)', whiteSpace: 'nowrap', flexShrink: 0 } }, `${Math.round(z.lo * 100)}–${Math.round(z.hi * 100)}%`),
          h('span', { className: 'mono', style: { width: 100, textAlign: 'right', fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0 } }, range));
      })));
  }

  function Profil() {
    const a = FF.athlete;
    const empty = !!FF.empty;
    const [p, setP] = useState({ name: a.name, age: a.age, height: a.height, weight: a.weight, sex: a.sex });
    const [thrHr, setThrHr] = useState(a.thrHr);
    const [maxHr, setMaxHr] = useState(a.maxHr);
    const [restHr, setRestHr] = useState(a.restHr);
    const [ftp, setFtp] = useState(a.ftp);
    const [avatar, setAvatar] = useState(null);
    const fileRef = useRef(null);

    const num = (v) => (v === '' || v == null || isNaN(v)) ? '—' : v;
    // keep the global athlete record in sync so the onboarding checklist on the
    // dashboard (and zone derivations elsewhere) reflect what's entered here.
    useEffect(() => {
      Object.assign(FF.athlete, { name: p.name, age: p.age, height: p.height, weight: p.weight, sex: p.sex, thrHr, maxHr, restHr, ftp });
      if (thrHr && ftp) FF.zonesSet = true;
    }, [p, thrHr, maxHr, restHr, ftp]);
    const hrZones = FF.hrZones.map((z) => ({ ...z, bpmLo: thrHr ? Math.max(restHr || 0, Math.round(z.lo * thrHr)) : NaN, bpmHi: thrHr ? Math.round(z.hi * thrHr) : NaN }));
    const pwZones = FF.powerZones.map((z) => ({ ...z, wLo: ftp ? Math.round(z.lo * ftp) : NaN, wHi: ftp ? Math.round(z.hi * ftp) : NaN }));
    const bmi = (p.weight && p.height) ? (p.weight / Math.pow(p.height / 100, 2)).toFixed(1) : '—';
    const wkg = (ftp && p.weight) ? (ftp / p.weight).toFixed(2) : '—';

    const onAvatar = (e) => { const f = e.target.files[0]; if (f) { const url = URL.createObjectURL(f); setAvatar(url); } };

    const settingsView = h('div', { className: 'col gap-18', 'data-prof': true },
      /* row 1: Athletenprofil + Konto */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'stretch' } },
        h(Card, { title: 'Athletenprofil', icon: 'profile' },
          h('div', { className: 'row center gap-16', style: { marginBottom: 20 } },
            h('div', { style: { position: 'relative' } },
              avatar
                ? h('img', { src: avatar, style: { width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '1px solid var(--line-2)' } })
                : h('div', { style: { width: 72, height: 72, borderRadius: 16 } }, h(Avatar, { initials: a.initials, size: 72 })),
              h('button', { className: 'ff-avatar-edit', onClick: () => fileRef.current.click(), title: 'Profilbild ändern' }, h(Icon, { name: 'upload', size: 13 })),
              h('input', { ref: fileRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: onAvatar })),
            h('div', { className: 'col gap-3' },
              h('span', { className: 'h3', style: { fontSize: 18 } }, p.name),
              h('span', { style: { fontSize: 12.5, color: 'var(--text-3)' } }, a.role),
              h('span', { className: 'chip chip--solid', style: { marginTop: 4, alignSelf: 'flex-start' } }, h(Icon, { name: 'spark', size: 12 }), `FitFlow ${a.plan}`))),
          h('div', { className: 'col gap-12' },
            h(Field, { label: 'Profilname' }, h('input', { className: 'ff-input', value: p.name, onChange: (e) => setP({ ...p, name: e.target.value }) })),
            h('div', { className: 'ff-grid grid-3', style: { gap: 12 } },
              h(Field, { label: 'Alter', suffix: 'J' }, h('input', { type: 'number', className: 'ff-input', value: p.age, onChange: (e) => setP({ ...p, age: e.target.value === '' ? '' : +e.target.value }) })),
              h(Field, { label: 'Größe', suffix: 'cm' }, h('input', { type: 'number', className: 'ff-input', value: p.height, onChange: (e) => setP({ ...p, height: e.target.value === '' ? '' : +e.target.value }) })),
              h(Field, { label: 'Gewicht', suffix: 'kg' }, h('input', { type: 'number', step: '0.1', className: 'ff-input', value: p.weight, onChange: (e) => setP({ ...p, weight: e.target.value === '' ? '' : +e.target.value }) }))),
            h(Field, { label: 'Geschlecht' }, h('div', { className: 'row gap-8' }, [['m', 'Männlich'], ['w', 'Weiblich'], ['d', 'Divers']].map(([v, l]) =>
              h('button', { key: v, className: 'ff-pill' + (p.sex === v ? ' is-active' : ''), style: { flex: 1, justifyContent: 'center' }, onClick: () => setP({ ...p, sex: v }) }, l)))))),
        h(KontoCard)),

      /* row 2: Einstellungen über die gesamte Breite */
      h(EinstellungenCard),

      /* row 3: beide Zonen nebeneinander */
      h('div', { className: 'ff-grid', style: { gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' } },
        h(Card, { title: 'Herzfrequenz-Zonen', icon: 'heart', info: 'Zonen werden aus der Schwellen-HF (LTHR) abgeleitet — manuell anpassbar.' },
          h('div', { className: 'ff-grid grid-3', style: { gap: 12, marginBottom: 18 } },
            h(Field, { label: 'Ruhepuls', suffix: 'bpm' }, h('input', { type: 'number', className: 'ff-input', value: restHr, onChange: (e) => setRestHr(+e.target.value) })),
            h(Field, { label: 'Schwelle (LTHR)', suffix: 'bpm' }, h('input', { type: 'number', className: 'ff-input', value: thrHr, onChange: (e) => setThrHr(+e.target.value) })),
            h(Field, { label: 'Maximalpuls', suffix: 'bpm' }, h('input', { type: 'number', className: 'ff-input', value: maxHr, onChange: (e) => setMaxHr(+e.target.value) }))),
          h(ZoneEditor, { zones: hrZones, deriveKey: 'bpm', unit: 'bpm', color: 'z5' })),
        h(Card, { title: 'Leistungs-Zonen', icon: 'bolt', info: 'Power-Zonen werden aus der FTP abgeleitet (Coggan-Modell).' },
          h('div', { className: 'row gap-12 wrap', style: { marginBottom: 18, alignItems: 'flex-end' } },
            h(Field, { label: 'FTP', suffix: 'W' }, h('input', { type: 'number', className: 'ff-input', style: { width: 130 }, value: ftp, onChange: (e) => setFtp(+e.target.value) })),
            h('div', { className: 'row center gap-6', style: { height: 42 } },
              h('input', { type: 'range', min: 180, max: 360, value: ftp || 250, onChange: (e) => setFtp(+e.target.value), className: 'ff-range', style: { flex: 1, minWidth: 140 } }),
              h('span', { className: 'mono', style: { width: 64, fontSize: 13, color: 'var(--sport-bike)' } }, `${wkg} W/kg`))),
          h(ZoneEditor, { zones: pwZones, deriveKey: 'w', unit: 'W', color: 'sport-bike' }))),

      empty
        ? h(AiInsight, { title: 'Zonen einrichten' }, 'Trag deine Schwellen-Herzfrequenz (LTHR), deinen Maximal- und Ruhepuls sowie deine FTP ein — FitFlow leitet daraus automatisch deine Trainingszonen ab.')
        : h(AiInsight, { title: 'KI-Zonenabgleich' }, `Basierend auf deinen letzten Schwellen-Einheiten liegt deine geschätzte LTHR bei ${thrHr} bpm und die FTP bei ${ftp} W. FitFlow empfiehlt, die Zonen alle 6–8 Wochen über einen Rampentest zu überprüfen.`),

      /* row 4: Leistungskennzahlen über die gesamte Breite */
      h(Card, { title: 'Leistungskennzahlen', icon: 'gauge' },
        h('div', { className: 'ff-grid', style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 16 } },
          h(KStat, { label: 'BMI', value: bmi }),
          h(KStat, { label: 'VO₂max', value: empty ? '—' : fmt.n(a.vo2max, 1), unit: 'ml/min/kg', color: 'good' }),
          h(KStat, { label: 'FTP / kg', value: wkg, unit: 'W/kg', color: 'sport-bike' }),
          h(KStat, { label: 'Schwellen-Pace', value: empty ? '—' : fmt.pace(a.runThrPace), unit: '/km', color: 'sport-run' }))),

      /* row 5: Gesundheit über die gesamte Breite */
      h(GesundheitCard));

    return settingsView;
  }

  function KStat({ label, value, unit, color }) {
    return h('div', { style: { background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '13px 15px' } },
      h('div', { className: 'label', style: { marginBottom: 7 } }, label),
      h('div', { className: 'row center', style: { gap: 4 } },
        h('span', { className: 'metric', style: { fontSize: 21, color: color ? `var(--${color})` : 'var(--text)' } }, value),
        unit && h('span', { className: 'unit', style: { fontSize: 10.5 } }, unit)));
  }

  /* ============================================================
     DESIGN TAB — live background picker + liquid-glass controls
     (drive window.FFBackground + window.FFGlass)
     ============================================================ */

  /* small local colour helper (the engine's rgba isn't exported) */
  function bgRgba(hex, a) {
    const x = String(hex).replace('#', '');
    const n = x.length === 3 ? x.replace(/./g, (c) => c + c) : x.padEnd(6, '0');
    const i = parseInt(n.slice(0, 6), 16);
    return `rgba(${(i >> 16) & 255},${(i >> 8) & 255},${i & 255},${a})`;
  }

  /* downscale a picked image file to a storable JPEG data URL (persists in localStorage) */
  function fileToScaledDataURL(file, maxW) {
    maxW = maxW || 1920;
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const hh = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = hh;
        cv.getContext('2d').drawImage(img, 0, 0, w, hh);
        URL.revokeObjectURL(url);
        try { res(cv.toDataURL('image/jpeg', 0.85)); } catch (e) { rej(e); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }

  /* miniature live preview of each backdrop mode, recoloured to `color` */
  function BgPreview({ mode, color }) {
    const B = window.FFBackground;
    if (mode === 'etheral') {
      return h('div', { className: 'ff-bgprev' },
        h('div', { style: { position: 'absolute', inset: '-22%', filter: 'blur(7px)',
          background:
            `radial-gradient(44% 54% at 30% 32%, ${bgRgba(color, 0.95)} 0%, transparent 66%),` +
            `radial-gradient(50% 60% at 72% 66%, ${bgRgba(color, 0.7)} 0%, transparent 70%),` +
            `radial-gradient(54% 58% at 58% 14%, ${bgRgba(color, 0.5)} 0%, transparent 74%)` } }));
    }
    if (mode === 'beams') {
      return h('div', { className: 'ff-bgprev' },
        h('div', { style: { position: 'absolute', inset: 0,
          backgroundImage:
            `linear-gradient(118deg, transparent 26%, ${bgRgba(color, 0.62)} 40%, transparent 50%),` +
            `linear-gradient(118deg, transparent 50%, ${bgRgba(color, 0.46)} 62%, transparent 72%),` +
            `linear-gradient(118deg, transparent 6%, ${bgRgba(color, 0.34)} 16%, transparent 24%)` } }));
    }
    if (mode === 'bars') {
      const hs = [1, 0.78, 0.55, 0.4, 0.3, 0.4, 0.55, 0.78, 1];
      return h('div', { className: 'ff-bgprev', style: { display: 'flex', alignItems: 'flex-end', gap: 2, padding: '0 5px' } },
        hs.map((hh, i) => h('div', { key: i, style: { flex: 1, height: (hh * 100) + '%', borderRadius: '2px 2px 0 0',
          background: `linear-gradient(to top, ${bgRgba(color, 0.95)}, ${bgRgba(color, 0)})` } })));
    }
    if (mode === 'paths') {
      return h('div', { className: 'ff-bgprev' },
        h('svg', { viewBox: '0 0 100 64', preserveAspectRatio: 'none', style: { position: 'absolute', inset: 0, width: '100%', height: '100%' } },
          [0, 1, 2, 3, 4, 5].map((i) => h('path', { key: i,
            d: `M-8 ${64 - i * 8} C 22 ${48 - i * 7}, 48 ${10 + i * 5}, 108 ${30 - i * 9}`,
            fill: 'none', stroke: color, strokeWidth: 0.8 + i * 0.12, strokeOpacity: 0.28 + i * 0.11 }))));
    }
    // photo — reflects a custom uploaded image when present
    const url = (B && B.get().photo) || (B && B.PHOTO_URL);
    return h('div', { className: 'ff-bgprev', style: { background: `#0a0d14 url("${url}") center / cover no-repeat` } });
  }

  function BgTile({ mode, label, active, color, onSelect }) {
    return h('button', { className: 'ff-bgtile' + (active ? ' is-active' : ''), onClick: onSelect, type: 'button' },
      h(BgPreview, { mode, color }),
      active && h('span', { className: 'ff-bgtile-check' }, h(Icon, { name: 'check', size: 12 })),
      h('span', { className: 'ff-bgtile-label' }, label));
  }

  function ColorSwatches({ value, options, onChange }) {
    const lc = String(value).toLowerCase();
    const preset = options.some((c) => c.toLowerCase() === lc);
    return h('div', { className: 'ff-swatches' },
      options.map((c) => h('button', { key: c, type: 'button',
        className: 'ff-swatch' + (c.toLowerCase() === lc ? ' is-active' : ''),
        style: { '--sw': c }, onClick: () => onChange(c), title: c })),
      h('label', { className: 'ff-swatch ff-swatch--custom' + (!preset ? ' is-active' : ''), style: { '--sw': value }, title: 'Eigene Farbe' },
        h(Icon, { name: 'plus', size: 13, style: { color: '#fff', position: 'relative', zIndex: 1, mixBlendMode: 'difference' } }),
        h('input', { type: 'color', value, onChange: (e) => onChange(e.target.value) })));
  }

  function PhotoImport({ photo, onFile, onReset }) {
    const ref = useRef(null);
    const [drag, setDrag] = useState(false);
    const B = window.FFBackground;
    const current = photo || (B && B.PHOTO_URL);
    const isCustom = !!photo;
    const handle = (f) => { if (f && /^image\//.test(f.type)) onFile(f); };
    return h('div', { className: 'ff-photo-import' + (drag ? ' is-drag' : ''),
        onDragOver: (e) => { e.preventDefault(); setDrag(true); },
        onDragLeave: () => setDrag(false),
        onDrop: (e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); } },
      h('div', { className: 'ff-photo-thumb', style: { backgroundImage: `url("${current}")` } },
        drag && h('span', { className: 'ff-photo-thumb-drop' }, h(Icon, { name: 'image', size: 18 }))),
      h('div', { className: 'col gap-3', style: { flex: 1, minWidth: 0 } },
        h('span', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600 } }, isCustom ? 'Eigenes Hintergrundfoto' : 'Standard-Hintergrundfoto'),
        h('span', { style: { fontSize: 12, color: 'var(--text-3)' } }, 'JPG oder PNG hierher ziehen oder auswählen')),
      h('div', { className: 'row gap-8', style: { flexShrink: 0 } },
        isCustom && h('button', { type: 'button', className: 'btn btn--ghost btn--sm', onClick: onReset }, h(Icon, { name: 'refresh', size: 14 }), 'Standard'),
        h('button', { type: 'button', className: 'btn btn--outline btn--sm', onClick: () => ref.current.click() }, h(Icon, { name: 'upload', size: 14 }), 'Foto wählen')),
      h('input', { ref, type: 'file', accept: 'image/*', style: { display: 'none' },
        onChange: (e) => { handle(e.target.files[0]); e.target.value = ''; } }));
  }

  function GlassDesign() {
    const G = window.FFGlass;
    const B = window.FFBackground;
    const [s, setS] = useState(() => (G ? G.get() : {}));
    const [b, setB] = useState(() => (B ? B.get() : null));
    useEffect(() => { if (G) return G.subscribe(setS); }, []);
    useEffect(() => { if (B) return B.subscribe(setB); }, []);
    if (!G) return h('div', { className: 'panel panel-pad', style: { color: 'var(--text-3)' } }, 'Liquid-Glass-Engine wird geladen …');
    const upd = (k) => (v) => G.set({ [k]: v });
    const setBg = (k) => (v) => B.set({ [k]: v });
    const onPhoto = (file) => { fileToScaledDataURL(file).then((data) => B.set({ photo: data, mode: 'photo', photoScale: 1, photoX: 50, photoY: 50 })).catch(() => {}); };
    const MODES = [
      { id: 'etheral', label: 'Nebel' },
      { id: 'beams', label: 'Strahlen' },
      { id: 'bars', label: 'Balken' },
      { id: 'paths', label: 'Pfade' },
      { id: 'photo', label: 'Foto' },
    ];
    const COLORS = ((B && B.PRESETS) || []).map((p) => p.color);

    return h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }, 'data-prof': true },
      /* ---- Hintergrund (full width) ---- */
      B && b && h('div', { style: { gridColumn: '1 / -1' } },
        h(Card, { title: 'Hintergrund', icon: 'image', info: 'Wähle eine Szene und Farbe — live hinter allen Glas-Kästchen in jedem Reiter.' },
          h('div', { className: 'ff-bgtiles' },
            MODES.map((m) => h(BgTile, { key: m.id, mode: m.id, label: m.label, active: b.mode === m.id, color: b.color, onSelect: () => setBg('mode')(m.id) }))),
          b.mode === 'photo' && h(PhotoImport, { photo: b.photo, onFile: onPhoto, onReset: () => B.set({ photo: null, photoScale: 1, photoX: 50, photoY: 50 }) }),
          b.mode === 'photo' && h('div', { className: 'ff-bg-sliders', style: { marginTop: 16 } },
            h(GSlider, { label: 'Größe', value: Math.round(b.photoScale * 100), min: 100, max: 300, format: (v) => v + '%', hint: 'Foto vergrößern – zoomt in den Bildausschnitt', onChange: (v) => setBg('photoScale')(v / 100) }),
            h(GSlider, { label: 'Ausschnitt horizontal', value: b.photoX, min: 0, max: 100, format: (v) => v + '%', hint: 'Sichtbaren Bereich nach links / rechts schieben', onChange: setBg('photoX') }),
            h(GSlider, { label: 'Ausschnitt vertikal', value: b.photoY, min: 0, max: 100, format: (v) => v + '%', hint: 'Sichtbaren Bereich nach oben / unten schieben', onChange: setBg('photoY') })),
          h('div', { className: 'ff-bg-controls' + (b.mode === 'photo' ? ' ff-bg-controls--solo' : '') },
            b.mode !== 'photo' && h('div', { className: 'col gap-10' },
              h('span', { className: 'label', style: { display: 'flex', alignItems: 'center', gap: 7 } }, h(Icon, { name: 'palette', size: 14, style: { color: 'var(--text-3)' } }), 'Farbe'),
              h(ColorSwatches, { value: b.color, options: COLORS, onChange: setBg('color') })),
            h('div', { className: 'ff-bg-sliders' },
              h(GSlider, { label: 'Stärke', value: b.intensity, min: 30, max: 100, format: (v) => v + '%', hint: 'Gesamtintensität des Hintergrunds', onChange: setBg('intensity') }),
              b.mode === 'bars' && h(GSlider, { label: 'Balkenanzahl', value: b.bars, min: 5, max: 28, format: (v) => v, hint: 'Anzahl der animierten Balken', onChange: setBg('bars') }))))),

      /* ---- Material ---- */
      h('div', { className: 'col gap-18' },
        h(Card, { title: 'Material', icon: 'layers', info: 'Tönung und Unschärfe des Glases — live auf alle Kästchen angewendet.' },
          h('div', { className: 'ff-gs-stack' },
            h(GSlider, { label: 'Deckkraft', value: s.opacity, min: 0, max: 55, format: (v) => v + '%', hint: 'Einfärbung / Transparenz der Kästchen', onChange: upd('opacity') }),
            h(GSlider, { label: 'Unschärfe', value: s.blur, min: 0, max: 30, format: (v) => v + 'px', hint: 'Intensität der Hintergrund-Unschärfe', onChange: upd('blur') }),
            h(GSlider, { label: 'Sättigung', value: s.sat, min: 100, max: 220, format: (v) => v + '%', hint: 'Farbsättigung des Hintergrunds', onChange: upd('sat') }),
            h(GSlider, { label: 'Helligkeit', value: s.bright, min: 80, max: 140, format: (v) => v + '%', hint: 'Lichtdurchlässigkeit des Materials', onChange: upd('bright') })))),

      /* ---- Form ---- */
      h('div', { className: 'col gap-18' },
        h(Card, { title: 'Form', icon: 'spark', info: 'Geometrie und Tönung der Glas-Kästchen.' },
          h('div', { className: 'ff-gs-stack' },
            h(GSlider, { label: 'Eckenradius', value: s.radius, min: 0, max: 44, format: (v) => v + 'px', hint: 'Rundung der Glas-Ecken', onChange: upd('radius') }),
            h(GToggle, { label: 'Heller Hintergrund', value: s.overLight, hint: 'Glas dunkler tönen (für helle Hintergründe)', onChange: upd('overLight') })),
          h('div', { className: 'row', style: { marginTop: 22 } },
            h('button', { className: 'btn btn--outline', style: { width: '100%' }, onClick: () => { G.reset(); B && B.reset(); } }, h(Icon, { name: 'refresh', size: 15 }), 'Auf Standard zurücksetzen'))),
        h(AiInsight, { title: 'Hinweis' }, 'Hintergrund und Glas werden live auf alle Kästchen angewendet – auch auf diese Karten. Einstellungen bleiben gespeichert.')));
  }
  function GSlider({ label, hint, value, min, max, step = 1, format, onChange }) {
    const trackRef = useRef(null);
    const [drag, setDrag] = useState(false);
    const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

    const setFromX = (clientX) => {
      const el = trackRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      let t = (clientX - r.left) / r.width;
      t = Math.max(0, Math.min(1, t));
      const snapped = Math.round((min + t * (max - min)) / step) * step;
      onChange(Math.max(min, Math.min(max, +snapped.toFixed(4))));
    };
    const onDown = (e) => {
      e.preventDefault();
      setDrag(true);
      setFromX(e.clientX);
      const move = (ev) => setFromX(ev.clientX);
      const up = () => { setDrag(false); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    return h('div', { className: 'ff-gs' + (drag ? ' is-drag' : '') },
      h('div', { className: 'ff-gs-head' },
        h('span', { className: 'ff-gs-label' }, label),
        h('span', { className: 'ff-gs-val' }, format ? format(value) : value)),
      h('div', { className: 'ff-gs-track', ref: trackRef, onPointerDown: onDown },
        h('div', { className: 'ff-gs-fill', style: { width: pct + '%' } }),
        h('div', { className: 'ff-gs-thumb', style: { left: pct + '%' } })),
      hint && h('span', { className: 'ff-gs-hint' }, hint));
  }

  function GToggle({ label, hint, value, onChange }) {
    return h('button', { className: 'row between center', onClick: () => onChange(!value),
      style: { width: '100%', padding: '18px 0 4px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' } },
      h('div', { className: 'col gap-4' },
        h('span', { className: 'ff-gs-label' }, label),
        hint && h('span', { className: 'ff-gs-hint', style: { marginTop: 0 } }, hint)),
      h('span', { className: 'ff-gtoggle' + (value ? ' is-on' : '') },
        h('span', { className: 'ff-gtoggle-knob' })));
  }

  /* ============================================================
     KONTO — echte Sitzung über FFAuth: An-/Abmelden, E-Mail &
     Passwort ändern, Datenexport als Datei, Konto löschen.
     ============================================================ */
  function KontoCard() {
    const a = FF.athlete;
    const Auth = window.FFAuth;
    const [acct, setAcct] = useState(() => (Auth ? Auth.get() : { email: '', loggedIn: false }));
    const [pane, setPane] = useState(null);   // null | 'email' | 'password' | 'delete'
    const [toast, setToast] = useState(null);

    useEffect(() => { if (!Auth) return; return Auth.subscribe((s) => setAcct(s)); }, []);
    useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 3200); return () => clearTimeout(id); }, [toast]);

    const flash = (msg) => setToast(msg);
    const onExport = () => {
      const blob = Auth.exportData();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 10);
      const link = document.createElement('a');
      link.href = url; link.download = `fitflow-export-${stamp}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      flash('Daten als JSON exportiert.');
    };

    return h(Card, { title: 'Konto', icon: 'profile', tour: 'konto' },
      h('div', { className: 'col gap-14' },
        h('div', { className: 'row between center', style: { padding: '2px 0' } },
          h('div', { className: 'row center gap-10' },
            h('span', { className: 'ff-acct-dot is-on' }),
            h('div', { className: 'col gap-1' },
              h('span', { className: 'strong', style: { fontSize: 13.5, fontWeight: 600 } }, 'Angemeldet'),
              h('span', { style: { fontSize: 11.5, color: 'var(--text-3)' } }, acct.email))),
          h('span', { className: 'chip chip--solid' }, h(Icon, { name: 'spark', size: 12 }), `FitFlow ${a.plan}`)),

        toast && h('div', { className: 'ff-acct-toast' }, h(Icon, { name: 'check', size: 14 }), h('span', null, toast)),

        h('div', { className: 'rule' }),

        // ---- e-mail row / inline editor
        pane === 'email'
          ? h(EmailEditor, { current: acct.email, onCancel: () => setPane(null), onSaved: (msg) => { setPane(null); flash(msg); } })
          : h('div', { className: 'ff-acct-row' },
              h('div', { className: 'col gap-1', style: { minWidth: 0 } },
                h('span', { className: 'label' }, 'E-Mail-Adresse'),
                h('span', { className: 'strong', style: { fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, acct.email)),
              h('button', { className: 'btn btn--ghost btn--sm', onClick: () => setPane('email') }, h(Icon, { name: 'mailOpen', size: 14 }), 'Ändern')),

        // ---- password row / inline editor
        pane === 'password'
          ? h(PasswordEditor, { onCancel: () => setPane(null), onSaved: () => { setPane(null); flash('Passwort aktualisiert.'); } })
          : h('div', { className: 'ff-acct-row' },
              h('div', { className: 'col gap-1' },
                h('span', { className: 'label' }, 'Passwort'),
                h('span', { className: 'strong', style: { fontSize: 13.5, letterSpacing: '.12em' } }, '••••••••')),
              h('button', { className: 'btn btn--outline btn--sm', onClick: () => setPane('password') }, h(Icon, { name: 'lock', size: 14 }), 'Ändern')),

        h('button', { className: 'btn btn--ghost btn--sm', style: { alignSelf: 'flex-start' }, onClick: onExport },
          h(Icon, { name: 'download', size: 14 }), 'Daten exportieren'),

        // ---- delete (with confirmation)
        pane === 'delete'
          ? h('div', { className: 'ff-acct-confirm' },
              h('div', { className: 'row center gap-8', style: { marginBottom: 6 } },
                h(Icon, { name: 'trash', size: 15, style: { color: 'var(--bad)' } }),
                h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, 'Konto wirklich löschen?')),
              h('p', { style: { fontSize: 12, color: 'var(--text-3)', lineHeight: 1.45, margin: '0 0 12px' } },
                'Alle lokal gespeicherten Zugangsdaten werden entfernt und du wirst abgemeldet. Dieser Schritt kann nicht rückgängig gemacht werden.'),
              h('div', { className: 'row gap-8' },
                h('button', { className: 'btn btn--ghost btn--sm', onClick: () => setPane(null) }, 'Abbrechen'),
                h('button', { className: 'btn btn--sm ff-btn-danger', onClick: () => Auth.deleteAccount() }, h(Icon, { name: 'trash', size: 14 }), 'Endgültig löschen')))
          : h('button', { className: 'ff-acct-danger', onClick: () => setPane('delete') },
              h(Icon, { name: 'trash', size: 14 }), 'Konto löschen'),

        h('div', { className: 'rule' }),
        h('button', { className: 'btn btn--outline', style: { width: '100%' }, onClick: () => Auth.logout() },
          h(Icon, { name: 'logout', size: 16 }), 'Abmelden')));
  }

  /* inline e-mail editor */
  function EmailEditor({ current, onCancel, onSaved }) {
    const Auth = window.FFAuth;
    const [val, setVal] = useState(current);
    const [err, setErr] = useState(null);
    const save = async () => {
      const res = await Auth.changeEmail(val);
      if (!res.ok) { setErr(res.error); return; }
      onSaved(res.pending ? 'Bestätigungs-Mail an die neue Adresse geschickt — nach dem Klick ist sie aktiv.' : 'E-Mail-Adresse geändert.');
    };
    return h('div', { className: 'ff-acct-edit' },
      h(Field, { label: 'Neue E-Mail-Adresse' },
        h('input', { className: 'ff-input' + (err ? ' is-err' : ''), type: 'email', value: val, autoFocus: true,
          onChange: (e) => { setVal(e.target.value); setErr(null); } })),
      err && h('div', { className: 'ff-field-err' }, err),
      h('div', { className: 'row gap-8', style: { marginTop: 12 } },
        h('button', { className: 'btn btn--ghost btn--sm', onClick: onCancel }, 'Abbrechen'),
        h('button', { className: 'btn btn--primary btn--sm', onClick: save }, h(Icon, { name: 'check', size: 14 }), 'Speichern')));
  }

  /* inline password editor: current + new + confirm */
  function PasswordEditor({ onCancel, onSaved }) {
    const Auth = window.FFAuth;
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');
    const [conf, setConf] = useState('');
    const [show, setShow] = useState(false);
    const [err, setErr] = useState(null);   // { field, error }
    const save = async () => {
      if (next !== conf) { setErr({ field: 'conf', error: 'Die Passwörter stimmen nicht überein.' }); return; }
      const res = await Auth.changePassword(cur, next);
      if (!res.ok) { setErr(res); return; }
      onSaved();
    };
    const field = (label, val, set, fieldKey, ph) => h(Field, { label },
      h('div', { className: 'ff-input-wrap' },
        h('input', { className: 'ff-input' + (err && err.field === fieldKey ? ' is-err' : ''), type: show ? 'text' : 'password',
          value: val, placeholder: ph, onChange: (e) => { set(e.target.value); setErr(null); } })));
    return h('div', { className: 'ff-acct-edit' },
      h('div', { className: 'col gap-10' },
        field('Aktuelles Passwort', cur, setCur, 'current', '••••••••'),
        field('Neues Passwort', next, setNext, 'next', 'mind. 6 Zeichen'),
        field('Neues Passwort bestätigen', conf, setConf, 'conf', '••••••••')),
      h('label', { className: 'row center gap-8', style: { marginTop: 10, cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: show, onChange: (e) => setShow(e.target.checked) }),
        h('span', { style: { fontSize: 12, color: 'var(--text-3)' } }, 'Passwörter anzeigen')),
      err && err.error && h('div', { className: 'ff-field-err' }, err.error),
      h('div', { className: 'row gap-8', style: { marginTop: 12 } },
        h('button', { className: 'btn btn--ghost btn--sm', onClick: onCancel }, 'Abbrechen'),
        h('button', { className: 'btn btn--primary btn--sm', onClick: save }, h(Icon, { name: 'check', size: 14 }), 'Passwort speichern')));
  }

  /* ============================================================
     EINSTELLUNGEN — Einheiten, Sprache, Zeit, Benachrichtigungen
     ============================================================ */
  function SetRow({ label, hint, children }) {
    return h('div', { className: 'row between center', style: { gap: 14, padding: '11px 0', borderTop: '1px solid var(--line-soft)' } },
      h('div', { className: 'col gap-1', style: { minWidth: 0 } },
        h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 500 } }, label),
        hint && h('span', { style: { fontSize: 11, color: 'var(--text-4)' } }, hint)),
      h('div', { style: { flexShrink: 0 } }, children));
  }
  function Seg({ value, options, onChange }) {
    return h('div', { className: 'row gap-6' }, options.map(([v, l]) =>
      h('button', { key: v, className: 'ff-pill' + (value === v ? ' is-active' : ''), style: { height: 32, fontSize: 12, padding: '0 12px' }, onClick: () => onChange(v) }, l)));
  }
  function NotiRow({ label, value, onChange }) {
    return h('button', { className: 'row between center', onClick: () => onChange(!value),
      style: { width: '100%', padding: '11px 0', borderTop: '1px solid var(--line-soft)', background: 'none', border: 0, borderTopWidth: 1, borderTopStyle: 'solid', borderTopColor: 'var(--line-soft)', cursor: 'pointer', textAlign: 'left' } },
      h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 500 } }, label),
      h('span', { className: 'ff-gtoggle' + (value ? ' is-on' : '') }, h('span', { className: 'ff-gtoggle-knob' })));
  }
  function EinstellungenCard() {
    const [units, setUnits] = useState('metric');
    const [lang, setLang] = useState('de');
    const [tz, setTz] = useState('Europe/Vienna');
    const [week, setWeek] = useState('mo');
    const [noti, setNoti] = useState({ reminder: true, weekly: true, sync: false, push: true });
    const sel = (v, set) => h('select', { className: 'ff-input', style: { width: 188, height: 36 }, value: v, onChange: (e) => set(e.target.value) },
      v === lang
        ? [['de', 'Deutsch'], ['en', 'English'], ['it', 'Italiano']].map(([k, l]) => h('option', { key: k, value: k }, l))
        : [['Europe/Vienna', 'Wien (MEZ)'], ['Europe/Berlin', 'Berlin (MEZ)'], ['Europe/Rome', 'Rom (MEZ)'], ['Europe/London', 'London (GMT)']].map(([k, l]) => h('option', { key: k, value: k }, l)));
    return h(Card, { title: 'Einstellungen', icon: 'settings' },
      h('div', { className: 'col' },
        h(SetRow, { label: 'Einheiten', hint: 'Distanz, Gewicht & Tempo', children: h(Seg, { value: units, options: [['metric', 'Metrisch'], ['imperial', 'Imperial']], onChange: setUnits }) }),
        h(SetRow, { label: 'Sprache', children: sel(lang, setLang) }),
        h(SetRow, { label: 'Zeitzone', children: sel(tz, setTz) }),
        h(SetRow, { label: 'Wochenstart', children: h(Seg, { value: week, options: [['mo', 'Mo'], ['su', 'So']], onChange: setWeek }) }),
        h('div', { className: 'label', style: { padding: '16px 0 2px' } }, 'Benachrichtigungen'),
        h(NotiRow, { label: 'Trainingserinnerungen', value: noti.reminder, onChange: (v) => setNoti({ ...noti, reminder: v }) }),
        h(NotiRow, { label: 'Wochenrückblick per E-Mail', value: noti.weekly, onChange: (v) => setNoti({ ...noti, weekly: v }) }),
        h(NotiRow, { label: 'Sync- & Import-Hinweise', value: noti.sync, onChange: (v) => setNoti({ ...noti, sync: v }) }),
        h(NotiRow, { label: 'Push auf Mobilgerät', value: noti.push, onChange: (v) => setNoti({ ...noti, push: v }) })));
  }

  /* ============================================================
     GESUNDHEIT — Basiswerte + Verletzungs-/Krankheitshistorie
     ============================================================ */
  function GesundheitCard() {
    const r = FF.recovery;
    const empty = !!FF.empty;
    const [items, setItems] = useState(empty ? [] : [
      { id: 1, label: 'ITBS – leichtes Tractus-Syndrom', area: 'Knie rechts', date: 'seit Mai 2026', kind: 'injury', status: 'active' },
      { id: 2, label: 'Patellasehnen-Reizung', area: 'Knie rechts', date: 'Apr 2026', kind: 'injury', status: 'healed' },
      { id: 3, label: 'Grippaler Infekt', area: 'Atemwege · 5 Tage Pause', date: 'Feb 2026', kind: 'illness', status: 'healed' },
    ]);
    const toggle = (id) => setItems((a) => a.map((it) => it.id === id ? { ...it, status: it.status === 'active' ? 'healed' : 'active' } : it));
    const remove = (id) => setItems((a) => a.filter((it) => it.id !== id));
    const add = () => setItems((a) => [{ id: Date.now(), label: 'Neuer Eintrag', area: 'Bereich', date: 'heute', kind: 'injury', status: 'active' }, ...a]);
    return h(Card, { title: 'Gesundheit', icon: 'heart' },
      h('div', { className: 'ff-grid grid-3', style: { gap: 12, marginBottom: 20 } },
        h(KStat, { label: 'Ruhepuls', value: empty ? '—' : r.rhr.val, unit: 'bpm', color: 'sport-run' }),
        h(KStat, { label: 'HRV Ø', value: empty ? '—' : r.hrv.val, unit: 'ms', color: 'good' }),
        h(KStat, { label: 'Schlaf Ø', value: empty ? '—' : fmt.n(r.sleep.val, 1), unit: 'h', color: 'z2' })),
      h('div', { className: 'row between center', style: { marginBottom: 12 } },
        h('span', { className: 'label' }, 'Verletzungs- & Krankheitshistorie'),
        h('button', { className: 'btn btn--ghost btn--sm', onClick: add }, h(Icon, { name: 'plus', size: 13 }), 'Eintrag')),
      h('div', { className: 'col gap-8' }, items.length === 0
        ? h('div', { style: { fontSize: 12.5, color: 'var(--text-4)', padding: '8px 2px' } }, 'Keine Einträge – alles im grünen Bereich.')
        : items.map((it) => h('div', { key: it.id, className: 'row center gap-12', style: { padding: '11px 13px', background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 10 } },
          h('span', { className: 'ff-inj-ic' + (it.status === 'active' ? ' is-active' : '') }, h(Icon, { name: it.kind === 'illness' ? 'drop' : 'heart', size: 14 })),
          h('div', { className: 'col gap-1', style: { flex: 1, minWidth: 0 } },
            h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, it.label),
            h('span', { style: { fontSize: 11.5, color: 'var(--text-4)' } }, `${it.area} · ${it.date}`)),
          h('button', { className: 'ff-pill' + (it.status === 'active' ? '' : ' is-active'), style: { height: 28, fontSize: 11, padding: '0 11px', flexShrink: 0 }, onClick: () => toggle(it.id) }, it.status === 'active' ? 'Aktiv' : 'Verheilt'),
          h('button', { className: 'ff-xbtn', onClick: () => remove(it.id), title: 'Entfernen' }, h(Icon, { name: 'x', size: 13 }))))));
  }

  window.Screens = window.Screens || {};
  window.Screens.Profil = Profil;
  window.Screens.Design = GlassDesign;
})();
