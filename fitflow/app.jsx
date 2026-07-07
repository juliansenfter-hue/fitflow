/* FitFlow — app root + routing + tweaks */
(function () {
  const { createElement: h, useState, useEffect, useRef, Fragment } = React;
  const UI = window.UI;
  const { Shell, Topbar, SportIcon, AnimatedWordmark, BrandLogo } = UI;
  const Icon = window.Icon;
  const S = window.Screens;
  const { useTweaks, TweaksPanel, TweakSection, TweakColor,
          TweakSlider, TweakRadio, TweakToggle, TweakButton } = window;

  /* ---- Background controls (Hintergrund) ---- Strahlen / Nebel / Balken,
     each recolourable. Backed by the standalone FFBackground engine. */
  function BackgroundControls() {
    const B = window.FFBackground;
    const [b, setB] = useState(() => (B ? B.get() : null));
    useEffect(() => {
      if (!B) return;
      setB(B.get());
      return B.subscribe((next) => setB(next));
    }, []);
    if (!B || !b) return null;
    const set = (k) => (v) => B.set({ [k]: v });
    const COLORS = (B.PRESETS || []).map((p) => p.color);
    const SOLIDS = (B.SOLID_PRESETS || []).map((p) => p.color);
    return h(Fragment, null,
      h(TweakSection, { label: 'Hintergrund' }),
      h(TweakRadio, { label: 'Stil', value: b.mode,
        options: [{ value: 'beams', label: 'Strahlen' }, { value: 'etheral', label: 'Nebel' }, { value: 'bars', label: 'Balken' }, { value: 'paths', label: 'Pfade' }, { value: 'photo', label: 'Foto' }, { value: 'solid', label: 'Einfärbig' }],
        onChange: set('mode') }),
      b.mode === 'solid'
        ? h(TweakColor, { label: 'Farbe', value: b.solidColor, options: SOLIDS, onChange: set('solidColor') })
        : h(TweakColor, { label: 'Farbe', value: b.color, options: COLORS, onChange: set('color') }),
      b.mode !== 'solid' && h(TweakSlider, { label: 'Stärke', value: b.intensity, min: 30, max: 100, step: 1, unit: '%', onChange: set('intensity') }),
      b.mode === 'bars' && h(TweakSlider, { label: 'Balkenanzahl', value: b.bars, min: 5, max: 28, step: 1, onChange: set('bars') }));
  }

  /* ---- Liquid-glass controls (mirrors the rdev/liquid-glass-react demo).
     Backed by the standalone FFGlass engine, not useTweaks, because the glass
     filter lives in plain JS (SVG displacement) outside React. We hold a local
     mirror of FFGlass.get() and push every change straight back through it. */
  function GlassControls() {
    const G = window.FFGlass;
    const [g, setG] = useState(() => (G ? G.get() : null));
    useEffect(() => {
      if (!G) return;
      setG(G.get());
      return G.subscribe((next) => setG(next));
    }, []);
    if (!G || !g) return null;
    const up = (k) => (v) => G.set({ [k]: v });
    return h(Fragment, null,
      h(TweakSection, { label: 'Glas · Einstellungen' }),
      h(TweakRadio, { label: 'Brechung', value: g.mode,
        options: [{ value: 'standard', label: 'Standard' }, { value: 'polar', label: 'Polar' }, { value: 'prominent', label: 'Stark' }],
        onChange: up('mode') }),
      h(TweakSlider, { label: 'Verzerrung', value: g.displace, min: 0, max: 200, step: 2, onChange: up('displace') }),
      h(TweakSlider, { label: 'Unschärfe', value: g.blur, min: 0, max: 30, step: 0.5, unit: 'px', onChange: up('blur') }),
      h(TweakSlider, { label: 'Chromatik', value: g.chroma, min: 0, max: 14, step: 0.5, onChange: up('chroma') }),
      h(TweakSlider, { label: 'Kantentiefe', value: g.depth, min: 1, max: 20, step: 1, onChange: up('depth') }),
      h(TweakToggle, { label: 'Heller Hintergrund', value: g.overLight, onChange: up('overLight') }),
      h(TweakSection, { label: 'Glas · Design' }),
      h(TweakSlider, { label: 'Deckkraft', value: g.opacity, min: 0, max: 60, step: 1, unit: '%', onChange: up('opacity') }),
      h(TweakSlider, { label: 'Eckenradius', value: g.radius, min: 0, max: 48, step: 1, unit: 'px', onChange: up('radius') }),
      h(TweakSlider, { label: 'Sättigung', value: g.sat, min: 100, max: 320, step: 2, unit: '%', onChange: up('sat') }),
      h(TweakSlider, { label: 'Helligkeit', value: g.bright, min: 80, max: 150, step: 1, unit: '%', onChange: up('bright') }),
      h('div', { style: { paddingTop: 4 } }, h(TweakButton, { label: 'Glas zurücksetzen', secondary: true, onClick: () => G.reset() })));
  }

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "#7C5CFF",
    "zones": ["#7C5CFF", "#64D2FF", "#30D158", "#FF9F0A", "#FF453A"],
    "modCheckin": true,
    "modRisk": true,
    "modSim": true
  }/*EDITMODE-END*/;

  /* Markenfarben: Violett, Indigo, Magenta, Blau, Pink */
  const ACCENTS = ['#7C5CFF', '#5E5CE6', '#BF5AF2', '#0A84FF', '#FF375F'];
  const ZONE_PALETTES = [
    ['#7C5CFF', '#64D2FF', '#30D158', '#FF9F0A', '#FF453A'], // Standard
    ['#5E5CE6', '#7C5CFF', '#30D158', '#FFD60A', '#FF453A'], // Thermal
    ['#64D2FF', '#7C5CFF', '#5E5CE6', '#BF5AF2', '#FF375F'], // Kühl mono
  ];

  const TITLES = {
    dashboard: { t: 'Dashboard', s: () => `${FF.fmt.dateFull(FF.TODAY)} · Trainingsblock Load · Polarisiert` },
    jahr: { t: 'Jahres Übersicht', s: () => 'Saison 2026 · Periodisierung & Trainingsfokus' },
    prognose: { t: 'Form-Prognose', s: () => 'TSB-Projektion & Taper-Optimierung bis zum Zielwettkampf' },
    woche: { t: 'Planung', s: () => 'KI-Empfehlung für die kommende Woche' },
    diag: { t: 'Leistungsdiagnostik', s: () => 'Telemetrie, Trainingsload & Aktivitäten-Vergleich' },
    import: { t: 'Import & Sync', s: () => 'FIT / CSV Import · Strava · Apple Health' },
    design: { t: 'Design', s: () => 'Hintergrund, Material & Form der Oberfläche' },
    profil: { t: 'Profileinstellungen', s: () => 'Persönliche Daten, HF- & Leistungszonen' },
  };

  /* =========================================================
     Topbar actions — working search + notifications dropdowns.
     Search spans views (nav) and units (activities); notifications
     come from the live store and mark-as-read on click. Clicking a
     result navigates (and opens the unit in the Diagnostik).
     ========================================================= */
  function TopbarActions({ onNav, onOpenActivity }) {
    const Live = window.FFLive;
    const [open, setOpen] = useState(null); // 'search' | 'notif' | null
    const [q, setQ] = useState('');
    const inputRef = useRef(null);
    const close = () => { setOpen(null); setQ(''); };

    useEffect(() => {
      if (open === 'search' && inputRef.current) inputRef.current.focus();
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const ql = q.trim().toLowerCase();
    const allNav = UI.NAV.flatMap((g) => g.items);
    const navHits = ql ? allNav.filter((it) => it.label.toLowerCase().includes(ql)) : allNav;
    const actHits = ql
      ? FF.activities.filter((a) => a.title.toLowerCase().includes(ql)).slice(0, 6)
      : FF.activities.slice(0, 4);
    const unread = Live.unread;

    return h('div', { className: 'ff-actions' },
      h('button', { className: 'btn btn--icon ff-glass-icon' + (open === 'search' ? ' is-on' : ''), onClick: () => setOpen(open === 'search' ? null : 'search'), 'aria-label': 'Suche' },
        h(Icon, { name: 'search', size: 17 })),
      h('button', { className: 'btn btn--icon ff-glass-icon' + (open === 'notif' ? ' is-on' : ''), style: { position: 'relative' }, onClick: () => setOpen(open === 'notif' ? null : 'notif'), 'aria-label': 'Benachrichtigungen' },
        h(Icon, { name: 'bell', size: 17 }),
        unread > 0 && h('span', { className: 'ff-badge' }, unread)),
      h('button', { className: 'btn btn--primary ff-liquid-btn ff-hide-sm', onClick: () => onNav('woche') },
        h(Icon, { name: 'plus', size: 16 }), 'Einheit planen'),

      open && h('div', { className: 'ff-pop-backdrop', onClick: close }),

      open === 'search' && h('div', { className: 'ff-pop ff-pop--search', onClick: (e) => e.stopPropagation() },
        h('div', { className: 'ff-pop-search-bar' },
          h(Icon, { name: 'search', size: 16, style: { color: 'var(--text-3)', flexShrink: 0 } }),
          h('input', { ref: inputRef, className: 'ff-pop-input', placeholder: 'Einheiten & Ansichten suchen …', value: q, onChange: (e) => setQ(e.target.value) }),
          q && h('button', { className: 'ff-pop-clear', onClick: () => setQ('') }, h(Icon, { name: 'x', size: 14 }))),
        h('div', { className: 'ff-pop-body' },
          navHits.length > 0 && h(Fragment, null,
            h('div', { className: 'ff-pop-label' }, 'Ansichten'),
            navHits.map((it) => h('button', { key: it.id, className: 'ff-pop-row', onClick: () => { onNav(it.id); close(); } },
              h('span', { className: 'ff-pop-ic' }, h(Icon, { name: it.icon, size: 16 })),
              h('span', { className: 'ff-pop-row-t', style: { flex: 1 } }, it.label),
              h(Icon, { name: 'arrowUR', size: 14, style: { color: 'var(--text-4)' } })))),
          actHits.length > 0 && h(Fragment, null,
            h('div', { className: 'ff-pop-label' }, ql ? 'Einheiten' : 'Letzte Einheiten'),
            actHits.map((a) => h('button', { key: a.id, className: 'ff-pop-row', onClick: () => { onOpenActivity(a.id); close(); } },
              h(SportIcon, { sport: a.sport, size: 30, soft: true }),
              h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
                h('span', { className: 'ff-pop-row-t' }, a.title),
                h('span', { className: 'ff-pop-row-s' }, `${FF.fmt.date(a.date)} \u00b7 ${a.tss} TSS`)),
              h(Icon, { name: 'arrowUR', size: 14, style: { color: 'var(--text-4)' } })))),
          ql && navHits.length === 0 && actHits.length === 0 && h('div', { className: 'ff-pop-empty' }, 'Keine Treffer für „' + q + '“'))),

      open === 'notif' && h('div', { className: 'ff-pop ff-pop--notif', onClick: (e) => e.stopPropagation() },
        h('div', { className: 'ff-pop-head' },
          h('span', { className: 'strong', style: { fontSize: 14, fontWeight: 600 } }, 'Benachrichtigungen'),
          unread > 0 && h('button', { className: 'ff-pop-link', onClick: () => Live.markAllRead() }, 'Alle gelesen')),
        h('div', { className: 'ff-pop-body' },
          Live.notifications.length === 0
            ? h('div', { className: 'ff-pop-empty' }, 'Keine Benachrichtigungen')
            : Live.notifications.map((n) => h('button', { key: n.id, className: 'ff-pop-row ff-noti' + (n.read ? '' : ' is-unread'),
                onClick: () => { Live.markRead(n.id); if (n.actId) onOpenActivity(n.actId); else if (n.nav) onNav(n.nav); close(); } },
              h('span', { className: 'ff-noti-ic ' + (n.type || 'sync') }, h(Icon, { name: n.icon || 'spark', size: 15 })),
              h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
                h('span', { className: 'ff-pop-row-t' }, n.title),
                h('span', { className: 'ff-noti-text' }, n.text),
                h('span', { className: 'ff-pop-row-s' }, n.time)),
              !n.read && h('span', { className: 'ff-noti-dot' }))))));
  }

  function Placeholder({ name }) {
    return h('div', { className: 'panel panel-pad', style: { textAlign: 'center', padding: 60, color: 'var(--text-3)' } },
      h(Icon, { name: 'layers', size: 30 }), h('div', { style: { marginTop: 12 } }, `${name} – in Arbeit`));
  }

  function App({ locked, startTour, onTourDone }) {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const [route, setRoute] = useState(() => location.hash.replace('#', '') || 'dashboard');
    const [activity, setActivity] = useState(null);
    const [, bump] = useState(0);

    // re-render whenever the live store changes (new imports, read notifications)
    useEffect(() => window.FFLive.subscribe(() => bump((n) => n + 1)), []);

    useEffect(() => { location.hash = route; }, [route]);
    useEffect(() => {
      const r = document.documentElement;
      r.style.setProperty('--accent', t.accent);
      (t.zones || []).forEach((c, i) => r.style.setProperty(`--z${i + 1}`, c));
    }, [t.accent, t.zones]);

    /* spotlight cursor tracker — every card tracks the pointer in its OWN
       local coordinates, so a card's near edge starts glowing as the cursor
       approaches and ramps up the closer you get (the gradient falloff +
       per-card --glow-size set how far that reach extends) */
    useEffect(() => {
      // Touch-/Pencil-Geräte (iPad: pointer coarse): den wandernden Glow NICHT pro
      // Pointer-Bewegung neu zeichnen — das Repaint der Radial-Gradienten über dem
      // Milchglas ist dort zu teuer und ruckelt extrem. Am Desktop (Maus) bleibt er aktiv.
      if ((navigator.maxTouchPoints || 0) > 0 ||
          (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) return;
      let raf = null, ev = null, cache = null;
      // Karten-Rechtecke werden gecacht und nur bei Scroll/Resize/DOM-Wechsel neu
      // gemessen — so kostet jede Pointer-/Pencil-Bewegung nur noch Arithmetik
      // (kein querySelectorAll und kein getBoundingClientRect pro Frame).
      const rebuild = () => {
        cache = [];
        document.querySelectorAll('.spotlight, .panel, .tile, .ff-topbar').forEach((el) => {
          cache.push({ el, r: el.getBoundingClientRect() });
        });
      };
      const invalidate = () => { cache = null; };
      const apply = () => {
        raf = null;
        if (!ev) return;
        if (!cache) rebuild();
        const x = ev.clientX, y = ev.clientY;
        for (let i = 0; i < cache.length; i++) {
          const el = cache[i].el, r = cache[i].r;
          // nur Karten in Reichweite (~340px) bekommen den Glow — ferne bleiben dunkel
          const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
          const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
          if (dx > 340 || dy > 340) { if (el.style.getPropertyValue('--lx')) { el.style.removeProperty('--lx'); el.style.removeProperty('--ly'); } continue; }
          el.style.setProperty('--lx', (x - r.left).toFixed(1) + 'px');
          el.style.setProperty('--ly', (y - r.top).toFixed(1) + 'px');
        }
      };
      const onMove = (e) => { ev = e; if (!raf) raf = requestAnimationFrame(apply); };
      const onLeave = () => {
        ev = null;
        if (cache) cache.forEach((c) => { c.el.style.removeProperty('--lx'); c.el.style.removeProperty('--ly'); });
      };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('scroll', invalidate, { passive: true, capture: true });
      window.addEventListener('resize', invalidate);
      document.addEventListener('pointerleave', onLeave);
      const mo = new MutationObserver(invalidate); // Screenwechsel/Layoutänderung → Rechtecke neu messen
      mo.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('scroll', invalidate, { capture: true });
        window.removeEventListener('resize', invalidate);
        document.removeEventListener('pointerleave', onLeave);
        mo.disconnect();
        if (raf) cancelAnimationFrame(raf);
      };
    }, []);

    const nav = (id) => { setActivity(null); setRoute(id); window.scrollTo(0, 0); };
    const openActivity = (id) => { setActivity(id); setRoute('diag'); window.scrollTo(0, 0); };

    /* intro splash: big centred wordmark over the blurred live background,
       then it flies into the sidebar logo box while all cards stagger in.
       Plays once when the authenticated app first mounts — never behind the
       locked login teaser. */
    const [intro, setIntro] = useState(!locked);
    // onboarding tour: 'ask' (prompt) → 'run' (spotlight) → null
    const [tour, setTour] = useState(startTour ? 'ask' : null);
    const endTour = () => { setTour(null); onTourDone && onTourDone(); };

    let screen;
    const props = { onNav: nav, onOpenActivity: openActivity, activity, setActivity,
      modules: { checkin: t.modCheckin !== false, risk: t.modRisk !== false, sim: t.modSim !== false } };
    if (route === 'dashboard') screen = h(S.Dashboard, props);
    else if (route === 'jahr' && S.Jahresplanung) screen = h(S.Jahresplanung, props);
    else if (route === 'prognose' && S.Prognose) screen = h(S.Prognose, props);
    else if (route === 'woche' && S.Wochenplanung) screen = h(S.Wochenplanung, props);
    else if (route === 'diag' && S.Diagnostik) screen = h(S.Diagnostik, props);
    else if (route === 'import' && S.ImportSync) screen = h(S.ImportSync, props);
    else if (route === 'design' && S.Design) screen = h(S.Design, props);
    else if (route === 'profil' && S.Profil) screen = h(S.Profil, props);
    else screen = h(Placeholder, { name: TITLES[route]?.t || route });

    const tb = TITLES[route] || TITLES.dashboard;
    const topbar = h(Topbar, { title: tb.t, sub: tb.s() },
      h(TopbarActions, { onNav: nav, onOpenActivity: openActivity }));

    return h(Fragment, null,
      h(Shell, { current: route, onNav: nav, topbar }, screen),
      intro && h(IntroSplash, { onDone: () => setIntro(false) }),
      tour === 'ask' && h(TourPrompt, { onStart: () => setTour('run'), onLater: endTour }),
      tour === 'run' && window.OnboardingTour && h(window.OnboardingTour, { onNav: nav, onFinish: endTour }),
      h(TweaksPanel, { title: 'Tweaks' },
        h(TweakSection, { label: 'Akzentfarbe' }),
        h(TweakColor, { label: 'Primär', value: t.accent, options: ACCENTS, onChange: (v) => setTweak('accent', v) }),
        h(TweakSection, { label: 'Trainingszonen Z1–Z5' }),
        h(TweakColor, { label: 'Palette', value: t.zones, options: ZONE_PALETTES, onChange: (v) => setTweak('zones', v) }),
        h(TweakSection, { label: 'Dashboard-Module' }),
        h(TweakToggle, { label: 'Morgen-Check', value: t.modCheckin !== false, onChange: (v) => setTweak('modCheckin', v) }),
        h(TweakToggle, { label: 'Belastungsrisiko (ACWR)', value: t.modRisk !== false, onChange: (v) => setTweak('modRisk', v) }),
        h(TweakToggle, { label: 'Form-Simulator', value: t.modSim !== false, onChange: (v) => setTweak('modSim', v) }),
        h(BackgroundControls),
        h(GlassControls)));
  }

  /* =========================================================
     Boot: App-Start läuft über die Datenschicht (FitFlowAPI.bootstrap).
     Im Mock-Modus löst das sofort auf; im Live-Modus holt es das echte
     Dataset vom Backend. So ist die Nahtstelle End-to-End verdrahtet —
     die Daten betreten die App ausschließlich über die API.
     ========================================================= */
  /* =========================================================
     IntroSplash — big centred FitFlow wordmark over the blurred
     live background; flies into the sidebar logo box while every
     card / nav item staggers in behind it.
     ========================================================= */
  function IntroSplash({ onDone }) {
    const floatRef = useRef(null);
    const [fly, setFly] = useState(false);
    const [settled, setSettled] = useState(false);

    useEffect(() => {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { onDone(); return; }

      document.body.classList.add('ff-intro-hold');

      /* hold an opaque black cover over everything for the first beat so the
         background engine's first (jittery) frames settle UNSEEN, then ease
         the cover away to reveal the calm, blurred backdrop behind the logo. */
      const tSettle = setTimeout(() => setSettled(true), 1250);

      /* arm a staggered reveal on the cards + nav. `both` fill keeps each
         element hidden through its delay, then plays as the logo flies in. */
      const armed = [];
      const arm = (els, d0, step, dur) => els.forEach((el, i) => {
        el.style.animation = `ffCardIn ${dur}s cubic-bezier(.2,.8,.2,1) both`;
        el.style.animationDelay = (d0 + i * step).toFixed(3) + 's';
        armed.push(el);
      });
      const base = 2.65;
      const tb = document.querySelector('.ff-topbar');
      if (tb) arm([tb], base - 0.1, 0, 0.6);
      arm([...document.querySelectorAll('.ff-content > *')], base, 0.07, 0.62);
      arm([...document.querySelectorAll('.ff-sidebar .ff-nav-list > *, .ff-sidebar .ff-side-foot')], base + 0.18, 0.045, 0.5);

      const tFly = setTimeout(() => {
        const target = document.querySelector('.ff-sidebar .ff-logo');
        const fl = floatRef.current;
        if (target && fl) {
          const tr = target.getBoundingClientRect();
          const fr = fl.getBoundingClientRect();
          const s = tr.width / fr.width;
          fl.style.setProperty('--fx', (tr.left - fr.left).toFixed(1) + 'px');
          fl.style.setProperty('--fy', (tr.top - fr.top).toFixed(1) + 'px');
          fl.style.setProperty('--fs', s.toFixed(4));
        }
        setFly(true);
      }, 2600);

      /* the flight lasts 1.25s; on the exact frame it lands, reveal the real
         sidebar logo with NO fade — the flying copy is identical and pixel-
         aligned, so the swap is invisible — then drop the overlay 2 frames
         later. No crossfade = no brightening / flicker. */
      const tHandoff = setTimeout(() => document.body.classList.remove('ff-intro-hold'), 3850);
      const tDone = setTimeout(() => {
        armed.forEach((el) => { el.style.animation = ''; el.style.animationDelay = ''; });
        onDone();
      }, 3885);

      return () => {
        clearTimeout(tSettle); clearTimeout(tFly); clearTimeout(tHandoff); clearTimeout(tDone);
        document.body.classList.remove('ff-intro-hold');
      };
    }, []);

    return h('div', { className: 'ff-intro' + (settled ? ' is-settled' : '') + (fly ? ' is-fly' : '') },
      h('div', { className: 'ff-intro-cover' }),
      h('div', { className: 'ff-intro-scrim' }),
      h('div', { className: 'ff-intro-logo', ref: floatRef },
        h(BrandLogo, { replayKey: 'intro' })));
  }

  function BootSplash({ label }) {
    return h('div', { className: 'ff-boot' },
      h('div', { className: 'ff-boot-mark' }, 'FF'),
      h('div', { className: 'ff-boot-spin' }),
      h('div', { className: 'ff-boot-label' }, label || 'Daten werden geladen …'));
  }

  function BootError({ err, onRetry, onMock }) {
    const API = window.FitFlowAPI;
    return h('div', { className: 'ff-boot' },
      h('div', { className: 'ff-boot-mark', style: { color: 'var(--bad)', borderColor: 'color-mix(in srgb, var(--bad) 45%, transparent)' } }, '!'),
      h('div', { className: 'ff-boot-label', style: { fontWeight: 600, color: 'var(--text)' } }, 'Backend nicht erreichbar'),
      h('div', { style: { fontSize: 12.5, color: 'var(--text-3)', maxWidth: 420, textAlign: 'center', lineHeight: 1.5 } },
        `Der Live-Modus (${API ? API.config.baseUrl : ''}) hat nicht geantwortet. Solange kein Backend läuft, nutze den Mock-Modus.`),
      err && h('div', { className: 'mono', style: { fontSize: 11, color: 'var(--text-4)', maxWidth: 460, textAlign: 'center', wordBreak: 'break-word' } }, String(err.message || err)),
      h('div', { className: 'row gap-8', style: { marginTop: 6 } },
        h('button', { className: 'btn btn--ghost btn--sm', onClick: onRetry }, 'Erneut versuchen'),
        h('button', { className: 'btn btn--primary btn--sm', onClick: onMock }, 'In den Mock-Modus wechseln')));
  }

  /* welcome prompt shown right after registration */
  function TourPrompt({ onStart, onLater }) {
    return h('div', { className: 'ff-tour-prompt-scrim' },
      h('div', { className: 'ff-tour-prompt' },
        h('div', { className: 'ff-tour-prompt-mark' }, h(Icon, { name: 'spark', size: 22 })),
        h('h2', null, 'Willkommen bei FitFlow'),
        h('p', null, 'Dein Profil ist noch leer. Sollen wir dir in einer kurzen Tour die wichtigsten Bereiche zeigen?'),
        h('div', { className: 'ff-tour-prompt-btns' },
          h('button', { className: 'btn btn--ghost', onClick: onLater }, 'Später'),
          h('button', { className: 'btn btn--primary', onClick: onStart }, h(Icon, { name: 'spark', size: 15 }), 'Tour starten'))));
  }

  function Root() {
    const API = window.FitFlowAPI;
    const Auth = window.FFAuth;
    const Acct = window.FFAccount;
    const [phase, setPhase] = useState(API ? 'loading' : 'ready'); // loading | ready | error
    const [err, setErr] = useState(null);
    const [authed, setAuthed] = useState(Auth ? Auth.isLoggedIn() : true);
    const [, bump] = useState(0);
    const [tour, setTour] = useState(false);
    const run = () => {
      if (!API) { setPhase('ready'); return; }
      setPhase('loading'); setErr(null);
      API.bootstrap().then(() => setPhase('ready')).catch((e) => { setErr(e); setPhase('error'); });
    };
    useEffect(run, []);
    useEffect(() => {
      if (!Auth) return;
      // bump on every auth change (login/logout AND markOnboarded) so Root
      // re-applies the active account's dataset and the screen swaps.
      return Auth.subscribe((s) => {
        setAuthed(!!s.loggedIn); bump((n) => n + 1);
        // real account (re)connected → pull cloud-synced imports in the
        // background, then re-render if the local cache changed (cross-device).
        if (s.loggedIn && window.FFImports && window.FFImports.isCloud) {
          const acc = Auth.currentAccount && Auth.currentAccount();
          if (window.FFImports.isCloud(acc)) {
            window.FFImports.pullCloud(acc).then((changed) => { if (changed) bump((n) => n + 1); });
          }
        }
      });
    }, []);
    if (phase === 'loading') return h(BootSplash, { label: API && API.mode === 'live' ? 'Mit Backend verbinden …' : 'Daten werden geladen …' });
    if (phase === 'error') return h(BootError, { err, onRetry: run, onMock: () => { API.useMock(); run(); } });
    // wait for the first Supabase session check before deciding login vs app (kein Login-Flash)
    if (Auth && !Auth.isReady()) return h(BootSplash, { label: 'Sitzung wird geprüft …' });
    // arrived via a password-reset link → let the user set a new password
    if (Auth && Auth.isRecovery && Auth.isRecovery()) {
      const Reset = window.ResetPasswordScreen;
      if (Reset) return h(Reset, { onDone: () => bump((n) => n + 1) });
    }
    // gated: blurred dashboard teaser (always demo data) behind the login card
    if (Auth && !authed) {
      if (Acct) Acct.apply(false, null);
      const Login = window.LoginScreen;
      return h(Fragment, null,
        h('div', { className: 'ff-applocked', 'aria-hidden': true, inert: '' }, h(App, { locked: true })),
        Login ? h(Login, { onSuccess: () => setAuthed(true) }) : null);
    }
    // neues/leeres Konto → geführtes Onboarding (dunkel, eine Frage nach der anderen)
    if (Auth && authed && Auth.isEmptyAccount && Auth.isEmptyAccount()) {
      const Onb = window.OnboardingFlow;
      if (Onb) return h(Onb, { account: Auth.currentAccount(), onDone: () => bump((n) => n + 1) });
    }
    // authed + onboarded: load the active account's dataset.
    // Nur das DEMO-Konto zeigt den vollen Beispiel-Datensatz. Ein echtes
    // (registriertes) Konto bleibt IMMER leer — auch nach dem Onboarding —
    // bis der Nutzer selbst den ersten Eintrag anlegt.
    const acc = Auth ? Auth.currentAccount() : null;
    const isEmpty = acc ? !acc.demo : false;
    if (Acct) Acct.apply(isEmpty, acc);
    return h(App, { key: acc ? acc.email : 'live' });
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(Root));
})();
