/* FitFlow — shared UI: shell, sidebar, cards, stats, tags. */
(function () {
  const { useState, useEffect, useRef, createElement: h, Fragment } = React;
  const Icon = window.Icon;

  const SPORT = {
    bike: { label: 'Radfahren', icon: 'bike', color: 'sport-bike' },
    run: { label: 'Laufen', icon: 'run', color: 'sport-run' },
    lift: { label: 'Krafttraining', icon: 'lift', color: 'sport-lift' },
  };

  /* ---- Avatar ---- */
  function Avatar({ initials, size = 38, ring }) {
    return h('div', {
      style: {
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(140deg, var(--accent), var(--accent-deep))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: size * 0.38, letterSpacing: '.02em',
        boxShadow: ring ? '0 0 0 2px var(--bg), 0 0 0 3px var(--accent-soft)' : 'none',
      },
    }, initials);
  }

  /* ---- Sport tag / icon chip ---- */
  function SportIcon({ sport, size = 34, soft }) {
    const s = SPORT[sport];
    return h('div', {
      style: {
        width: size, height: size, borderRadius: 9, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: soft ? `color-mix(in srgb, var(--${s.color}) 16%, transparent)` : 'var(--panel-2)',
        color: `var(--${s.color})`, border: '1px solid var(--line)',
      },
    }, h(Icon, { name: s.icon, size: size * 0.5 }));
  }
  function SportTag({ sport }) {
    const s = SPORT[sport];
    return h('span', { className: 'chip' },
      h('span', { className: 'dot', style: { background: `var(--${s.color})` } }), s.label);
  }

  /* ---- Delta badge ---- */
  function Delta({ value, unit = '', invert, suffix }) {
    const pos = value >= 0;
    const good = invert ? !pos : pos;
    return h('span', {
      className: 'mono',
      style: {
        display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600,
        color: good ? 'var(--good)' : 'var(--bad)',
      },
    }, h(Icon, { name: pos ? 'arrowUp' : 'arrowDown', size: 13 }),
      `${pos ? '+' : ''}${FF.fmt.n(value, Number.isInteger(value) ? 0 : 1)}${unit}`, suffix);
  }

  /* ---- Stat block ---- */
  function Stat({ label, value, unit, sub, accent, big, vsize, nowrap }) {
    return h('div', { className: 'col gap-6' },
      h('div', { className: 'label' }, label),
      h('div', { className: 'row center', style: { gap: 6, flexWrap: nowrap ? 'nowrap' : 'wrap' } },
        h('span', { className: 'metric', style: { fontSize: vsize || (big ? 34 : 26), color: accent ? `var(--${accent})` : 'var(--text)', whiteSpace: nowrap ? 'nowrap' : 'normal' } }, value),
        unit && h('span', { className: 'unit', style: { fontSize: 13 } }, unit)),
      sub && h('div', { className: 'row center gap-6', style: { fontSize: 12 } }, sub));
  }

  /* ---- Card / panel ---- */
  function Card({ title, icon, right, children, pad = true, className = '', style, glow, spotlight, info, tour }) {
    return h('section', { className: `panel ${className}${spotlight ? ' spotlight' : ''}`, 'data-tour': tour, style: { ...style, ...(spotlight ? { '--glow-color': spotlight } : {}), ...(glow ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,.07), 0 0 0 1px var(--accent-soft), 0 24px 60px -36px rgba(0,0,0,.8)' } : {}) } },
      (title || right) && h('div', { className: 'panel-head', style: { padding: pad ? '20px 24px 0' : '20px 24px 16px', marginBottom: pad ? 0 : 0 } },
        h('div', { className: 'h3' },
          icon && h(Icon, { name: icon, size: 17, style: { color: 'var(--text-3)' } }),
          title,
          info && h('span', { title: info, style: { color: 'var(--text-4)', display: 'inline-flex', cursor: 'help' } }, h(Icon, { name: 'info', size: 14 }))),
        right),
      h('div', { className: pad ? 'panel-pad' : '', style: title && pad ? { paddingTop: 16 } : undefined }, children));
  }

  /* ---- Segmented tabs ---- */
  function Tabs({ items, value, onChange }) {
    return h('div', { className: 'seg' }, items.map((it) =>
      h('button', { key: it.value || it, className: (value === (it.value || it)) ? 'is-active' : '', onClick: () => onChange(it.value || it) }, it.label || it)));
  }

  /* ---- KI insight card ---- */
  function AiInsight({ children, title = 'KI-Analyse', compact }) {
    return h('div', {
      className: 'ff-ai-border',
      style: {
        display: 'flex', gap: 12, padding: compact ? '12px 14px' : '15px 16px',
        background: 'var(--accent-soft)', border: '1px solid transparent',
        borderRadius: 12,
      },
    },
      h('div', { style: { color: 'var(--accent-bright)', flexShrink: 0, marginTop: 1 } }, h(Icon, { name: 'spark', size: 17 })),
      h('div', { className: 'col gap-4' },
        h('div', { className: 'label', style: { color: 'var(--accent-bright)', letterSpacing: '.1em' } }, title),
        h('div', { style: { fontSize: 13, lineHeight: 1.5, color: 'var(--text-2)' } }, children)));
  }

  /* ---- full-screen empty state (for data screens before any data) ---- */
  function EmptyState({ icon = 'spark', title, body, cta, onCta, cta2, onCta2 }) {
    return h('div', { className: 'ff-emptyscreen' },
      h('span', { className: 'ff-emptyscreen-ic' }, h(Icon, { name: icon, size: 30 })),
      h('h2', null, title),
      body && h('p', null, body),
      (cta || cta2) && h('div', { className: 'row center gap-10', style: { marginTop: 6 } },
        cta && h('button', { className: 'btn btn--primary', onClick: onCta }, cta),
        cta2 && h('button', { className: 'btn btn--outline', onClick: onCta2 }, cta2)));
  }

  /* =========================================================
     NAV + SHELL
     ========================================================= */
  const NAV = [
    { group: 'Steuerung', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'jahr', label: 'Jahres Übersicht', icon: 'year' },
      { id: 'prognose', label: 'Form-Prognose', icon: 'forecast' },
      { id: 'woche', label: 'Planung', icon: 'calendar' },
    ] },
    { group: 'Diagnostik', items: [
      { id: 'diag', label: 'Leistungsdiagnostik', icon: 'diag' },
    ] },
    { group: 'Daten', items: [
      { id: 'import', label: 'Import & Sync', icon: 'import' },
      { id: 'design', label: 'Design', icon: 'palette' },
    ] },
  ];

  function NavItem({ item, active, onClick }) {
    return h('button', {
      onClick, className: 'ff-nav' + (active ? ' is-active' : ''),
    }, h(Icon, { name: item.icon, size: 18 }), h('span', null, item.label));
  }

  /* ===========================================================
     LiquidF — animated liquid-metal “F” brand mark.
     A bold geometric F filled with a flowing chrome gradient,
     a sweeping specular highlight, and a subtle liquid wobble.
     =========================================================== */
  function LiquidF() {
    const uid = useRef('lf' + Math.random().toString(36).slice(2, 8)).current;
    const FPATH = 'M30 14 H94 V36.5 H53 V52 H84 V73 H53 V106 H30 Z';
    return h('div', { className: 'ff-logo-mark', 'aria-label': 'FitFlow' },
      h('svg', { viewBox: '0 0 124 120', width: '100%', height: '100%', role: 'img' },
        h('defs', null,
          // flowing chrome gradient
          h('linearGradient', { id: uid + '-metal', gradientUnits: 'userSpaceOnUse', x1: 8, y1: 4, x2: 116, y2: 116 },
            h('stop', { offset: '0%', stopColor: '#23283a' }),
            h('stop', { offset: '12%', stopColor: '#aab6cf' }),
            h('stop', { offset: '21%', stopColor: '#ffffff' }),
            h('stop', { offset: '31%', stopColor: '#7e8aa6' }),
            h('stop', { offset: '43%', stopColor: '#eef2fb' }),
            h('stop', { offset: '53%', stopColor: '#363c4f' }),
            h('stop', { offset: '63%', stopColor: '#b9c2ff' }),
            h('stop', { offset: '74%', stopColor: '#ffffff' }),
            h('stop', { offset: '85%', stopColor: '#565f78' }),
            h('stop', { offset: '100%', stopColor: '#c7d0e6' }),
            h('animateTransform', { attributeName: 'gradientTransform', type: 'translate',
              values: '0 0; 30 30; 0 0; -30 -30; 0 0', dur: '6s', repeatCount: 'indefinite',
              calcMode: 'spline', keyTimes: '0;0.25;0.5;0.75;1',
              keySplines: '.45 .05 .55 .95;.45 .05 .55 .95;.45 .05 .55 .95;.45 .05 .55 .95' })),
          // sweeping specular streak
          h('linearGradient', { id: uid + '-sheen', gradientUnits: 'userSpaceOnUse', x1: -60, y1: 0, x2: -8, y2: 120 },
            h('stop', { offset: '0%', stopColor: '#fff', stopOpacity: 0 }),
            h('stop', { offset: '50%', stopColor: '#fff', stopOpacity: '.85' }),
            h('stop', { offset: '100%', stopColor: '#fff', stopOpacity: 0 }),
            h('animateTransform', { attributeName: 'gradientTransform', type: 'translate',
              values: '0 0; 190 0', dur: '3.6s', repeatCount: 'indefinite',
              calcMode: 'spline', keyTimes: '0;1', keySplines: '.7 0 .3 1' })),
          // violet base wash
          h('linearGradient', { id: uid + '-tint', x1: '0', y1: '0', x2: '1', y2: '1' },
            h('stop', { offset: '0%', stopColor: 'var(--accent)' }),
            h('stop', { offset: '100%', stopColor: 'var(--accent-deep)' })),
          // liquid wobble
          h('filter', { id: uid + '-liquid', x: '-20%', y: '-20%', width: '140%', height: '140%' },
            h('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.012 0.02', numOctaves: 2, seed: 7, result: 'n' },
              h('animate', { attributeName: 'baseFrequency', dur: '14s', repeatCount: 'indefinite',
                values: '0.012 0.02; 0.02 0.012; 0.012 0.02', calcMode: 'spline', keyTimes: '0;0.5;1',
                keySplines: '.45 .05 .55 .95;.45 .05 .55 .95' })),
            h('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: 3.2, xChannelSelector: 'R', yChannelSelector: 'G' }))),
        // rounded tile backdrop
        h('rect', { x: 4, y: 2, width: 116, height: 116, rx: 30, fill: `url(#${uid}-tint)` }),
        h('rect', { x: 4, y: 2, width: 116, height: 116, rx: 30, fill: '#0c0e16', opacity: '.34' }),
        // the F — chrome fill + wobble, then specular sweep on top
        h('g', { filter: `url(#${uid}-liquid)`, transform: 'skewX(-5)', style: { transformOrigin: '62px 60px' } },
          h('path', { d: FPATH, fill: `url(#${uid}-metal)` }),
          h('path', { d: FPATH, fill: `url(#${uid}-sheen)` }),
          h('path', { d: FPATH, fill: 'none', stroke: '#fff', strokeOpacity: '.22', strokeWidth: 1 })),
        h('rect', { x: 4.5, y: 2.5, width: 115, height: 115, rx: 29.5, fill: 'none', stroke: '#fff', strokeOpacity: '.16' })));
  }

  function AnimatedWordmark({ text, replayKey }) {
    const letters = Array.from(text);
    return h('span', { className: 'ff-wm', key: replayKey, role: 'img', 'aria-label': text },
      letters.map((ch, i) => h('span', { key: i, className: 'ff-wm-letter', 'aria-hidden': true, style: { '--i': i } }, ch)),
      h('span', { className: 'ff-wm-underline', 'aria-hidden': true, style: { '--n': letters.length } }));
  }

  /* Bild-Logo (ersetzt den Text-Schriftzug) — F-Mark + FITFLOW als PNG */
  function BrandLogo({ replayKey }) {
    return h('img', { className: 'ff-brandlogo', key: replayKey, src: 'fitflow/logo-mark.png',
      alt: 'FitFlow', draggable: false });
  }

  function Sidebar({ current, onNav, onClose }) {
    const a = FF.athlete;
    /* replay the wordmark animation on first mount and every time the
       athlete returns to the Dashboard */
    const [logoKey, setLogoKey] = useState(0);
    const prevRoute = useRef(current);
    useEffect(() => {
      if (current === 'dashboard' && prevRoute.current !== 'dashboard') setLogoKey((k) => k + 1);
      prevRoute.current = current;
    }, [current]);
    return h('aside', { className: 'ff-sidebar panel' },
      h('div', { className: 'ff-brand' },
        h('div', { className: 'ff-logo' },
          h(BrandLogo, { replayKey: logoKey })),
        onClose && h('button', { className: 'btn btn--icon btn--sm btn--ghost ff-only-mobile', onClick: onClose }, h(Icon, { name: 'x', size: 16 }))),
      h('nav', { className: 'ff-nav-list' }, NAV.map((grp) =>
        h('div', { key: grp.group, className: 'col gap-4', style: { marginBottom: 18 } },
          h('div', { className: 'label', style: { padding: '0 14px 8px' } }, grp.group),
          grp.items.map((it) => h(NavItem, { key: it.id, item: it, active: current === it.id, onClick: () => onNav(it.id) }))))),
      h('div', { className: 'ff-side-foot' },
        h('button', { className: 'ff-profile-btn' + (current === 'profil' ? ' is-active' : ''), onClick: () => onNav('profil'), title: 'Profileinstellungen' },
          h(Avatar, { initials: a.initials, size: 36 }),
          h('div', { className: 'col', style: { lineHeight: 1.25, minWidth: 0, flex: 1, textAlign: 'left' } },
            h('div', { className: 'row center gap-6' },
              h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, a.name),
              h('span', { style: { fontSize: 9.5, fontWeight: 600, letterSpacing: '.02em', color: 'var(--accent-bright)', background: 'var(--accent-soft)', padding: '2px 7px', borderRadius: 99 } }, a.plan)),
            h('span', { style: { fontSize: 11, color: 'var(--text-3)' } }, 'Athlet')))));
  }

  function Topbar({ title, sub, onMenu, children }) {
    const ref = useRef(null);
    // Hinweis: Die eigene Maus-Verfolgung der Topbar (--mx/--my/--shine) wurde entfernt —
    // sie speiste nur das deaktivierte .ff-topbar-shine (display:none) und lief ungedrosselt
    // bei jeder Bewegung. Der sichtbare Rand-Glow der Topbar kommt ohnehin über --lx/--ly
    // aus dem zentralen Spotlight-Tracker (app.jsx), der .ff-topbar mitführt.
    return h('header', { className: 'ff-topbar', ref: ref },
      h('div', { className: 'ff-topbar-shine' }),
      h('div', { className: 'row center gap-14', style: { minWidth: 0, position: 'relative', zIndex: 1 } },
        h('button', { className: 'btn btn--icon btn--ghost ff-only-mobile', onClick: onMenu }, h(Icon, { name: 'menu', size: 18 })),
        h('div', { className: 'col', style: { minWidth: 0 } },
          h('h1', { className: 'h2 ff-topbar-title', style: { fontSize: 'clamp(26px,3vw,34px)', fontWeight: 800, letterSpacing: '0', lineHeight: 1.05 } }, title),
          sub && h('div', { style: { fontSize: 13, fontWeight: 400, letterSpacing: '-.005em', color: 'var(--text-3)', marginTop: 5 } }, sub))),
      h('div', { className: 'row center gap-10', style: { position: 'relative', zIndex: 1 } }, children));
  }

  function Shell({ current, onNav, topbar, children }) {
    const [drawer, setDrawer] = useState(false);
    return h('div', { className: 'ff-shell' },
      h('div', { className: 'ff-side-desktop' }, h(Sidebar, { current, onNav })),
      drawer && h('div', { className: 'ff-drawer-bg', onClick: () => setDrawer(false) },
        h('div', { className: 'ff-drawer', onClick: (e) => e.stopPropagation() },
          h(Sidebar, { current, onNav: (id) => { onNav(id); setDrawer(false); }, onClose: () => setDrawer(false) }))),
      h('main', { className: 'ff-main' },
        topbar && React.cloneElement(topbar, { onMenu: () => setDrawer(true) }),
        h('div', { className: 'ff-content', key: current === 'dashboard' ? 'dashboard' : 'inner' }, children)));
  }

  window.UI = { Shell, Topbar, Sidebar, Card, Stat, Avatar, SportIcon, SportTag, Delta, Tabs, AiInsight, AnimatedWordmark, BrandLogo, LiquidF, EmptyState, SPORT, NAV };
})();
