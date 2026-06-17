/* FitFlow — onboarding spotlight tour.
   Highlights UI areas one-by-one with an explanatory bubble (Weiter /
   Zurück / Überspringen). Navigates between screens as needed and waits for
   each target to mount before measuring it. Shown after registration. */
(function () {
  const { createElement: h, useState, useEffect, useRef, useCallback } = React;
  const Icon = window.Icon;

  const STEPS = [
    { route: 'dashboard', sel: '.ff-sidebar .ff-nav-list', pad: 10, place: 'right',
      title: 'Deine Navigation', body: 'Über die Seitenleiste erreichst du alle Bereiche — Dashboard, Planung, Diagnostik, Import und Design.' },
    { route: 'dashboard', sel: '[data-tour="onboarding"]', pad: 12, place: 'left',
      title: 'Deine ersten Schritte', body: 'Erledige diese drei Schritte — Profil ausfüllen, einen Dienst verbinden und Aktivitäten importieren. Danach erscheint dein volles Dashboard mit Morgen-Check, Belastungsrisiko und Form-Analyse.' },
    { route: 'import', sel: '[data-tour="integrations"]', pad: 10, place: 'top',
      title: 'Import & Sync', body: 'Verbinde Strava, Apple Health, Garmin oder Wahoo — oder importiere FIT-/CSV-Dateien. So füllt sich dein Tagebuch.' },
    { route: 'profil', sel: '[data-tour="konto"]', pad: 10, place: 'left',
      title: 'Profil & Konto', body: 'Hier vervollständigst du dein Athletenprofil, setzt deine Zonen und verwaltest dein Konto. Viel Erfolg!' },
  ];

  // find an element, retrying for a short while (it may mount after a nav)
  function waitFor(sel, cb) {
    let raf = 0, tries = 0;
    const tick = () => {
      const el = document.querySelector(sel);
      if (el) { cb(el); return; }
      if (tries++ > 90) { cb(null); return; }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }

  function OnboardingTour({ onNav, onFinish }) {
    const [i, setI] = useState(0);
    const [rect, setRect] = useState(null);
    const [vis, setVis] = useState(false);
    const step = STEPS[i];
    const lastRoute = useRef(null);

    const measure = useCallback((el) => {
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      const p = step.pad || 8;
      setRect({ x: r.left - p, y: r.top - p, w: r.width + p * 2, h: r.height + p * 2 });
    }, [step]);

    // when the step changes: navigate if needed, then locate the target
    useEffect(() => {
      setVis(false);
      let cancelWait = null;
      const locate = () => { cancelWait = waitFor(step.sel, (el) => { measure(el); setVis(true); }); };
      if (step.route && lastRoute.current !== step.route) {
        lastRoute.current = step.route;
        onNav && onNav(step.route);
        const t = setTimeout(locate, 260); // let the screen swap in
        return () => { clearTimeout(t); cancelWait && cancelWait(); };
      }
      lastRoute.current = step.route || lastRoute.current;
      const t = setTimeout(locate, 60);
      return () => { clearTimeout(t); cancelWait && cancelWait(); };
    }, [i]);

    // keep the spotlight aligned on resize / scroll
    useEffect(() => {
      const re = () => { const el = document.querySelector(step.sel); if (el) measure(el); };
      window.addEventListener('resize', re); window.addEventListener('scroll', re, true);
      return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re, true); };
    }, [step, measure]);

    // keyboard: →/Enter next, ← back, Esc skip
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter') next();
        else if (e.key === 'ArrowLeft') back();
        else if (e.key === 'Escape') onFinish && onFinish();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    });

    const last = i === STEPS.length - 1;
    const next = () => { if (last) { onNav && onNav('dashboard'); onFinish && onFinish(); } else setI((v) => v + 1); };
    const back = () => setI((v) => Math.max(0, v - 1));

    // bubble placement around the spotlight, clamped to the viewport
    const bubble = (() => {
      const W = 320, M = 16, vw = window.innerWidth, vh = window.innerHeight;
      if (!rect) return { left: vw / 2 - W / 2, top: vh / 2 - 90, arrow: null };
      let left, top, arrow = step.place;
      const cx = rect.x + rect.w / 2;
      if (step.place === 'right') { left = rect.x + rect.w + 14; top = rect.y; }
      else if (step.place === 'left') { left = rect.x - W - 14; top = rect.y; }
      else if (step.place === 'top') { left = cx - W / 2; top = rect.y - 14 - 150; }
      else { left = cx - W / 2; top = rect.y + rect.h + 14; }
      if (left < M) { left = M; if (step.place === 'left') arrow = null; }
      if (left + W > vw - M) { left = vw - M - W; }
      if (top < M) top = M;
      if (top + 200 > vh - M) top = Math.max(M, vh - M - 200);
      return { left, top, arrow };
    })();

    return h('div', { className: 'ff-tour' + (vis ? ' is-vis' : '') },
      // dimmed backdrop with a punched-out spotlight
      rect
        ? h('div', { className: 'ff-tour-hole', style: { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' } })
        : h('div', { className: 'ff-tour-fill' }),
      // explanation bubble
      h('div', { className: 'ff-tour-bubble', style: { left: bubble.left + 'px', top: bubble.top + 'px' } },
        h('div', { className: 'ff-tour-step' }, `Schritt ${i + 1} von ${STEPS.length}`),
        h('h3', null, step.title),
        h('p', null, step.body),
        h('div', { className: 'ff-tour-dots' }, STEPS.map((_, k) =>
          h('span', { key: k, className: 'ff-tour-dot' + (k === i ? ' is-active' : '') }))),
        h('div', { className: 'ff-tour-actions' },
          h('button', { className: 'ff-tour-skip', onClick: () => onFinish && onFinish() }, 'Überspringen'),
          h('div', { className: 'row gap-8' },
            i > 0 && h('button', { className: 'btn btn--ghost btn--sm', onClick: back }, 'Zurück'),
            h('button', { className: 'btn btn--primary btn--sm', onClick: next }, last ? 'Fertig' : 'Weiter',
              !last && h(Icon, { name: 'chevR', size: 14 }))))));
  }

  window.OnboardingTour = OnboardingTour;
})();
