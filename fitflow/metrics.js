/* ============================================================
   FitFlow — real training-load engine  (window.FFMetrics)
   ------------------------------------------------------------
   Turns a REAL activity list (the user's own imports / synced
   sessions) into the exact same data shapes the dashboard reads
   from window.FF — load series, today's CTL/ATL/TSB, fitness
   score, injury-risk (ACWR) and the current-week summary.

   Same formulas as the demo story in data.js, but seeded at ZERO
   (an honest cold start) and driven only by activities that truly
   happened. An account with no data yields a valid all-zero
   structure, so the full dashboard renders without ever crashing.

   Used by account.js for real (non-demo) accounts. The demo
   account keeps its seeded 16-week narrative untouched.
   ============================================================ */
(function () {
  if (!window.FF) return;

  const dayMs = 86400000;
  const N = 112;                               // days of history, matches data.js
  const kC = 1 - Math.exp(-1 / 42);            // CTL time constant (42 d)
  const kA = 1 - Math.exp(-1 / 7);             // ATL time constant (7 d)

  const startOfDay = (d) => { const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };

  /* daily TSS totals for the N days ending "today", summed from real activities */
  function dailyTss(activities, today) {
    const buckets = new Array(N).fill(0);
    const t0 = today.getTime();
    (activities || []).forEach((a) => {
      if (!a || a.tss == null || !a.date) return;
      const d = startOfDay(a.date).getTime();
      const idx = N - 1 - Math.round((t0 - d) / dayMs);
      if (idx >= 0 && idx < N) buckets[idx] += a.tss;
    });
    return buckets;
  }

  /* current-week (Mon–Sun) actuals, aggregated from real activities */
  function buildWeek(activities, today, chronic) {
    const dow = (today.getDay() + 6) % 7;                 // Mon=0 … Sun=6
    const monday = new Date(today.getTime() - dow * dayMs);
    const labels = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const zoneSum = [0, 0, 0, 0, 0];

    const days = labels.map((day, i) => {
      const dayStart = startOfDay(new Date(monday.getTime() + i * dayMs)).getTime();
      const acts = (activities || []).filter((a) => a && a.date && startOfDay(a.date).getTime() === dayStart);
      let done = null;
      if (acts.length) {
        const top = acts.reduce((m, a) => ((a.tss || 0) > (m.tss || 0) ? a : m));
        done = { sport: top.sport, tss: acts.reduce((s, a) => s + (a.tss || 0), 0) };
        acts.forEach((a) => { if (Array.isArray(a.zoneMin)) a.zoneMin.forEach((v, z) => { zoneSum[z] += v || 0; }); });
      }
      return { day, planned: null, done, today: i === dow };
    });

    const weekActs = (activities || []).filter((a) => {
      if (!a || !a.date) return false;
      const t = startOfDay(a.date).getTime();
      return t >= startOfDay(monday).getTime() && t <= today.getTime();
    });
    const sessionsDone = weekActs.length;
    const durDone = Math.round(weekActs.reduce((s, a) => s + (a.duration || 0), 0));
    const kmDone = +weekActs.reduce((s, a) => s + (a.distance || 0), 0).toFixed(1);
    const tssDone = Math.round(weekActs.reduce((s, a) => s + (a.tss || 0), 0));

    const zTot = zoneSum.reduce((a, b) => a + b, 0);
    const pct = (v) => (zTot ? Math.round((v / zTot) * 100) : 0);
    const intensity = { z1: pct(zoneSum[0]), z2: pct(zoneSum[1]), z3: pct(zoneSum[2]), z4: pct(zoneSum[3]), z5: pct(zoneSum[4]) };

    // honest maintenance target from chronic load (keeps the "Wochenziele" orbs
    // meaningful without a saved plan); floors avoid divide-by-zero in the orbs.
    const tssPlan = Math.max(Math.round((chronic || 0) * 7), tssDone, 1);
    const focus = zTot === 0 ? 'Aktuelle Woche'
      : (intensity.z4 + intensity.z5) >= 25 ? 'Intensiv · Polarisiert'
      : (intensity.z1 + intensity.z2) >= 65 ? 'Grundlage · GA1/GA2'
      : 'Gemischt';

    return {
      sessionsDone, sessionsPlan: Math.max(sessionsDone, 1),
      durDone, durPlan: Math.max(durDone, 1),
      kmDone, kmPlan: Math.max(kmDone, 1),
      tssDone, tssPlan,
      focus, intensity, days,
    };
  }

  const FFMetrics = {
    /* recompute every dashboard metric from a real activity list */
    recompute(activities, opts) {
      opts = opts || {};
      const today = FF.TODAY;
      const daily = dailyTss(activities, today);

      // EWMA CTL(42) / ATL(7), honest cold start at 0
      let ctl = 0, atl = 0;
      const load = daily.map((tss, i) => {
        const date = new Date(today.getTime() - (N - 1 - i) * dayMs);
        const tsbPrev = ctl - atl;
        ctl = ctl + kC * (tss - ctl);
        atl = atl + kA * (tss - atl);
        return { date, tss: Math.round(tss), ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1), tsbPrev: +tsbPrev.toFixed(1) };
      });
      const todayLoad = load[load.length - 1];
      const fitnessScore = Math.round(todayLoad.ctl);

      // injury risk — Acute:Chronic Workload Ratio (7:28)
      const meanLast = (n) => daily.slice(-n).reduce((a, b) => a + b, 0) / n;
      const acute = meanLast(7), chronic = meanLast(28);
      const acwr = chronic > 0 ? +(acute / chronic).toFixed(2) : 0;
      const bands = (FF.risk && FF.risk.bands) || [];
      const band = bands.find((b) => acwr < b.max) || bands[0] || null;
      const risk = {
        acwr, acute: Math.round(acute), chronic: Math.round(chronic),
        lo: 0.8, hi: 1.3, gaugeLo: 0.5, gaugeHi: 1.8, band, bands,
      };

      const week = buildWeek(activities, today, chronic);

      return { load, todayLoad, fitnessScore, risk, week };
    },

    /* mutate window.FF in place with metrics derived from FF.activities */
    apply(activities) {
      const m = FFMetrics.recompute(activities || FF.activities, {});
      FF.load = m.load;
      FF.todayLoad = m.todayLoad;
      FF.fitnessScore = m.fitnessScore;
      FF.risk = m.risk;
      FF.week = m.week;
      return m;
    },
  };

  window.FFMetrics = FFMetrics;
})();
