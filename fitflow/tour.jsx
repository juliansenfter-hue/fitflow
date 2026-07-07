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

  /* ============================================================
     GEFÜHRTES ONBOARDING — dunkel, eine Frage nach der anderen,
     Eingabe darunter, grünes „perfekt", dann die nächste Frage.
     Wird beim ersten Login eines leeren Kontos gezeigt; speichert das
     Profil (FFAuth.completeOnboarding) und öffnet danach die App.
     ============================================================ */
  const ONB_Q = [
    { key: 'height', q: 'Wie groß bist du?', unit: 'cm', kind: 'num', min: 120, max: 230, ph: 'z. B. 182' },
    { key: 'weight', q: 'Wie viel wiegst du?', unit: 'kg', kind: 'num', min: 35, max: 200, ph: 'z. B. 74' },
    { key: 'age', q: 'Wie alt bist du?', unit: 'Jahre', kind: 'num', min: 12, max: 100, ph: 'z. B. 29' },
    { key: 'sex', q: 'Dein Geschlecht?', kind: 'choice', opts: [['m', 'Männlich'], ['w', 'Weiblich'], ['d', 'Divers']] },
    { key: 'sport', q: 'Deine Hauptsportart?', kind: 'choice', opts: [['Radsport', 'Radsport'], ['Laufen', 'Laufen'], ['Triathlon', 'Triathlon'], ['Andere', 'Andere']] },
    { key: 'goal', q: 'Dein Saisonziel?', kind: 'text', optional: true, ph: 'z. B. Sub-3 Marathon · Ötztaler finishen' },
  ];
  const ONB_PRAISE = ['Perfekt', 'Super', 'Stark', 'Top', 'Klasse', 'Passt'];

  function OnboardingFlow({ account, onDone }) {
    const [i, setI] = useState(0);
    const [answers, setAnswers] = useState({});
    const [val, setVal] = useState('');
    const [ok, setOk] = useState(false);     // grünes „perfekt" sichtbar → gleich weiter
    const [err, setErr] = useState(false);
    const [done, setDone] = useState(false);
    const [saving, setSaving] = useState(false);
    const [video, setVideo] = useState(false);      // Willkommens-Video läuft
    const [videoEnded, setVideoEnded] = useState(false);
    const [pendingAcc, setPendingAcc] = useState(null); // Antworten, die nach dem Video gespeichert werden
    const step = ONB_Q[i];
    const firstName = account && account.name ? String(account.name).split(/\s+/)[0] : '';

    // Antworten NICHT sofort speichern — sonst markiert completeOnboarding das Konto
    // direkt als onboarded und Root springt am Video vorbei aufs Dashboard.
    // Erst „Alles bereit" → Video, und beim „Los geht's"-Klick speichern + weiter.
    const finish = (acc) => {
      setPendingAcc(acc || {});
      setDone(true);
      setTimeout(function () { setVideo(true); }, 1100);
    };
    const enterApp = () => {
      setSaving(true);
      const fin = (window.FFAuth && window.FFAuth.completeOnboarding)
        ? window.FFAuth.completeOnboarding(pendingAcc || {}) : Promise.resolve();
      Promise.resolve(fin).then(function () { onDone && onDone(); });
    };
    const advance = (acc) => {
      setOk(false); setVal(''); setErr(false);
      if (i >= ONB_Q.length - 1) { finish(acc); return; }
      setI(i + 1);
    };
    const commit = (raw) => {
      if (ok) return;
      let v = raw, store = true;
      if (step.kind === 'num') {
        const n = parseInt(v, 10);
        if (isNaN(n) || n < step.min || n > step.max) { setErr(true); return; }
        v = n;
      } else if (step.kind === 'text') {
        v = String(v || '').trim();
        if (!v) { if (step.optional) store = false; else { setErr(true); return; } }
      }
      setErr(false);
      const next = store ? Object.assign({}, answers, { [step.key]: v }) : Object.assign({}, answers);
      setAnswers(next);
      setOk(true);
      setTimeout(function () { advance(next); }, 720);
    };
    const back = () => { if (i > 0) { setI(i - 1); setVal(''); setOk(false); setErr(false); } };

    const progress = h('div', { className: 'ff-onb-progress' }, ONB_Q.map(function (_, k) {
      return h('span', { key: k, className: 'ff-onb-pip' + (k < i ? ' is-done' : '') + (k === i ? ' is-active' : '') });
    }));

    if (video) {
      return h('div', { className: 'ff-onb ff-onb--video' },
        h('video', {
          className: 'ff-onb-video', src: 'fitflow/onboarding-intro.mp4',
          autoPlay: true, muted: true, playsInline: true, controls: false, preload: 'auto',
          onEnded: function () { setVideoEnded(true); },
        }),
        videoEnded && h('div', { className: 'ff-welcome' },
          h('img', { className: 'ff-welcome-logo', src: 'fitflow/welcome-mark.png', alt: 'FitFlow', draggable: false }),
          h('h1', { className: 'ff-welcome-title' }, firstName ? 'Willkommen,\u00a0' + firstName : 'Willkommen'),
          h('button', { type: 'button', className: 'ff-welcome-go', disabled: saving, onClick: enterApp },
            saving ? 'Wird gespeichert …' : 'Los geht\u2019s', !saving && h(Icon, { name: 'chevR', size: 22 }))));
    }

    if (done) {
      return h('div', { className: 'ff-onb' }, progress,
        h('div', { className: 'ff-onb-stage' },
          h('div', { className: 'ff-onb-check' }, h(Icon, { name: 'check', size: 42 })),
          h('h1', { className: 'ff-onb-q' }, saving ? 'Wird gespeichert …' : 'Alles bereit' + (firstName ? ', ' + firstName : '') + '!'),
          h('p', { className: 'ff-onb-sub' }, 'Dein FitFlow ist eingerichtet.')));
    }

    return h('div', { className: 'ff-onb' }, progress,
      h('div', { className: 'ff-onb-stage', key: i },
        h('div', { className: 'ff-onb-count' }, 'Frage ' + (i + 1) + ' von ' + ONB_Q.length),
        h('h1', { className: 'ff-onb-q' }, step.q),
        step.kind === 'choice'
          ? h('div', { className: 'ff-onb-choices' }, step.opts.map(function (o) {
              return h('button', { key: o[0], type: 'button',
                className: 'ff-onb-choice' + (ok && answers[step.key] === o[0] ? ' is-ok' : ''),
                onClick: function () { commit(o[0]); } }, o[1]);
            }))
          : h('form', { className: 'ff-onb-form', onSubmit: function (e) { e.preventDefault(); commit(val); } },
              h('div', { className: 'ff-onb-inputwrap' + (ok ? ' is-ok' : '') + (err ? ' is-err' : '') },
                h('input', { className: 'ff-onb-input', type: step.kind === 'num' ? 'number' : 'text',
                  inputMode: step.kind === 'num' ? 'numeric' : 'text', value: val, autoFocus: true, placeholder: step.ph,
                  disabled: ok, onChange: function (e) { setVal(e.target.value); setErr(false); } }),
                step.unit && h('span', { className: 'ff-onb-unit' }, step.unit)),
              h('button', { type: 'submit', className: 'ff-onb-go', disabled: ok }, h(Icon, { name: 'chevR', size: 22 }))),
        ok
          ? h('div', { className: 'ff-onb-praise' }, h(Icon, { name: 'check', size: 16 }), ONB_PRAISE[i % ONB_PRAISE.length])
          : h('div', { className: 'ff-onb-foot' },
              i > 0 && h('button', { type: 'button', className: 'ff-onb-back', onClick: back }, 'Zurück'),
              step.optional && h('button', { type: 'button', className: 'ff-onb-skip', onClick: function () { advance(answers); } }, 'Überspringen'),
              h('button', { type: 'button', className: 'ff-onb-skipall', onClick: function () { finish(answers); } }, 'Später einrichten'))));
  }

  window.OnboardingFlow = OnboardingFlow;
})();
