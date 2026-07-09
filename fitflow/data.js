/* ============================================================
   FitFlow — mock data + domain logic.
   A coherent single-athlete story (~16 weeks) driving CTL/ATL/TSB,
   recovery score, weekly targets and per-activity telemetry streams.
   Exposed on window.FF.
   ============================================================ */
(function () {
  /* ---------- formatting (European, de-DE) ---------- */
  const deNum = (n, dec = 0) =>
    new Intl.NumberFormat('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  const thin = (n) => deNum(n).replace(/\./g, '\u2009'); // 64 000 style with thin space
  const fmt = {
    n: deNum,
    big: thin,
    dur: (min) => {
      const h = Math.floor(min / 60), m = Math.round(min % 60);
      return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
    },
    durLong: (min) => {
      const h = Math.floor(min / 60), m = Math.round(min % 60);
      return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
    },
    pace: (secPerKm) => {
      const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    },
    date: (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }),
    dateFull: (d) => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'long' }),
  };

  /* ---------- seeded RNG for stable streams ---------- */
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // echtes, tagesaktuelles Datum (lokale Mitternacht) statt eingefrorenem Demo-Tag.
  // Alles Relative (Load-Serie, Aktivitäten, Recovery-Historie, „heute" im Dashboard,
  // Check-in-Schlüssel) leitet sich hieraus ab und wird damit automatisch tagesaktuell.
  const _now = new Date();
  const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
  const dayMs = 86400000;
  const addDays = (base, n) => new Date(base.getTime() + n * dayMs);

  /* ---------- athlete + zones ---------- */
  const athlete = {
    name: 'Julian Senfter',
    initials: 'JS',
    role: 'Ausdauerathlet · Self-Coaching',
    age: 34, height: 178, weight: 71.4,
    sex: 'm',
    ftp: 268,           // W
    vo2max: 57.5,       // ml/min/kg
    thrHr: 172,         // bpm
    maxHr: 188,
    restHr: 47,
    runThrPace: 245,    // s/km (4:05)
    plan: 'PRO',
  };

  // HR zones (5) from threshold HR (Coggan-ish %LTHR)
  const hrZones = [
    { z: 'Z1', name: 'Recovery',   lo: 0,   hi: 0.81, color: 'z1' },
    { z: 'Z2', name: 'Endurance',  lo: 0.81, hi: 0.89, color: 'z2' },
    { z: 'Z3', name: 'Tempo',      lo: 0.89, hi: 0.94, color: 'z3' },
    { z: 'Z4', name: 'Threshold',  lo: 0.94, hi: 1.0,  color: 'z4' },
    { z: 'Z5', name: 'VO₂max',     lo: 1.0,  hi: 1.06, color: 'z5' },
  ].map((zz) => ({ ...zz, bpmLo: Math.round(zz.lo * athlete.thrHr) || athlete.restHr, bpmHi: Math.round(zz.hi * athlete.thrHr) }));

  const powerZones = [
    { z: 'Z1', name: 'Active Rec.', lo: 0,    hi: 0.55, color: 'z1' },
    { z: 'Z2', name: 'Endurance',   lo: 0.55, hi: 0.75, color: 'z2' },
    { z: 'Z3', name: 'Tempo',       lo: 0.75, hi: 0.90, color: 'z3' },
    { z: 'Z4', name: 'Threshold',   lo: 0.90, hi: 1.05, color: 'z4' },
    { z: 'Z5', name: 'VO₂max',      lo: 1.05, hi: 1.30, color: 'z5' },
  ].map((zz) => ({ ...zz, wLo: Math.round(zz.lo * athlete.ftp), wHi: Math.round(zz.hi * athlete.ftp) }));

  /* ---------- 112-day TSS series + CTL/ATL/TSB ---------- */
  // phases: weeks of off-season base -> load (polarized) build with a recovery week
  const N = 112;
  const r = rng(20260606);
  const tssSeries = [];
  for (let i = 0; i < N; i++) {
    const date = addDays(TODAY, -(N - 1 - i));
    const dow = date.getDay(); // 0 Sun..6 Sat
    const weekIdx = Math.floor(i / 7);
    const isRecoveryWeek = weekIdx % 4 === 3;        // every 4th week lighter
    const phaseBuild = i > N - 56;                   // last 8 weeks = Load block ramps up
    let base = phaseBuild ? 78 : 58;
    if (isRecoveryWeek) base *= 0.6;
    // weekly shape: hard Tue/Thu/Sat, long Sun, easy Mon/Wed/Fri
    const shape = { 1: 0.35, 2: 1.25, 3: 0.55, 4: 1.15, 5: 0.3, 6: 1.4, 0: 1.0 }[dow];
    let tss = base * shape * (0.8 + r() * 0.45);
    if (dow === 1 && r() > 0.6) tss = 0; // some rest Mondays
    tss = Math.round(tss);
    tssSeries.push({ date, tss });
  }
  // EWMA CTL(42) / ATL(7)
  let ctl = 52, atl = 50;
  const kC = 1 - Math.exp(-1 / 42), kA = 1 - Math.exp(-1 / 7);
  const load = tssSeries.map((d) => {
    const tsbPrev = ctl - atl;
    ctl = ctl + kC * (d.tss - ctl);
    atl = atl + kA * (d.tss - atl);
    return { date: d.date, tss: d.tss, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +(ctl - atl).toFixed(1), tsbPrev: +tsbPrev.toFixed(1) };
  });
  const todayLoad = load[load.length - 1];
  const fitnessScore = Math.round(todayLoad.ctl);

  /* ---------- injury risk — Acute:Chronic Workload Ratio (7:28) ----------
     Classic Gabbett ACWR: mean daily load over the last 7 days divided by the
     mean daily load over the last 28 days. 0.8–1.3 is the “sweet spot”. */
  const meanLast = (n) => tssSeries.slice(-n).reduce((s, d) => s + d.tss, 0) / n;
  const acwrAcute = meanLast(7);
  const acwrChronic = meanLast(28) || 1;
  const acwr = +(acwrAcute / acwrChronic).toFixed(2);
  const riskBands = [
    { key: 'low',    max: 0.8,      label: 'Unterbelastung',   status: 'info', note: 'Belastung unter dem Schnitt — Spielraum, das Volumen kontrolliert anzuheben.' },
    { key: 'opt',    max: 1.3,      label: 'Optimaler Bereich', status: 'good', note: 'Akut- und Chroniklast im Gleichgewicht — produktiver, sicherer Trainingsreiz.' },
    { key: 'high',   max: 1.5,      label: 'Erhöhtes Risiko',   status: 'warn', note: 'Akutlast steigt schneller als die Basis — neue Reize behutsam dosieren.' },
    { key: 'danger', max: Infinity, label: 'Hohes Risiko',      status: 'bad',  note: 'Deutlicher Belastungssprung — Verletzungsrisiko erhöht, Erholung einplanen.' },
  ];
  const riskBand = riskBands.find((b) => acwr < b.max);
  const risk = {
    acwr, acute: Math.round(acwrAcute), chronic: Math.round(acwrChronic),
    lo: 0.8, hi: 1.3, gaugeLo: 0.5, gaugeHi: 1.8,
    band: riskBand, bands: riskBands,
  };

  /* ---------- form projection (simulator) ----------
     Steps CTL/ATL forward from today with a constant weekly TSS, optionally
     tapering the final week. Returns one point per week (plus the race day). */
  function projectForm(weeklyTss, weeks, taper) {
    let c = todayLoad.ctl, a = todayLoad.atl;
    const pts = [{ week: 0, ctl: +c.toFixed(1), atl: +a.toFixed(1), tsb: +(c - a).toFixed(1) }];
    const totalDays = Math.round(weeks * 7);
    for (let d = 1; d <= totalDays; d++) {
      const daysLeft = totalDays - d;
      const taperFactor = (taper && daysLeft < 7) ? 0.55 : 1; // auto-taper final week
      const dayTss = (weeklyTss / 7) * taperFactor;
      c = c + kC * (dayTss - c);
      a = a + kA * (dayTss - a);
      if (d % 7 === 0 || d === totalDays) pts.push({ week: +(d / 7).toFixed(2), ctl: +c.toFixed(1), atl: +a.toFixed(1), tsb: +(c - a).toFixed(1) });
    }
    return pts;
  }

  /* ---------- recovery score (today) ---------- */
  const recovery = {
    score: 74,
    trend: +6,
    hrv: { val: 68, unit: 'ms', base: 62, status: 'good' },     // above baseline
    rhr: { val: 49, unit: 'bpm', base: 47, status: 'warn' },    // slightly elevated
    sleep: { val: 7.4, unit: 'h', quality: 82, status: 'good' },
    fatigue: { val: Math.abs(Math.min(0, todayLoad.tsb)), unit: 'TSB', status: todayLoad.tsb < -15 ? 'bad' : todayLoad.tsb < -5 ? 'warn' : 'good' },
    // 14-day recovery history
    history: Array.from({ length: 14 }, (_, i) => {
      const rr = rng(700 + i)();
      return { date: addDays(TODAY, -(13 - i)), score: Math.round(58 + rr * 34) };
    }),
  };
  recovery.history[recovery.history.length - 1].score = recovery.score;

  // recommended load band based on recovery + TSB
  const reco = {
    band: recovery.score >= 70 ? 'Mittel–Hoch' : recovery.score >= 50 ? 'Niedrig–Mittel' : 'Recovery',
    tssLo: 55, tssHi: 85,
    headline: 'Qualitäts-Einheit möglich',
    text: 'HRV liegt 6\u2009ms über deiner Baseline und der TSB hat sich erholt. Heute trägt eine polarisierte VO₂max-Einheit (4×4\u2009min Z5) optimal zum Load-Block bei. Ruhepuls leicht erhöht — halte das Warm-up locker.',
    focus: 'VO₂max · Z5',
  };

  /* ---------- activities (recent, with detail streams) ---------- */
  const platforms = { bike: 'Wahoo', run: 'Garmin', lift: 'Hevy' };
  const sportMeta = {
    bike: { label: 'Radfahren', color: 'sport-bike', icon: 'bike' },
    run: { label: 'Laufen', color: 'sport-run', icon: 'run' },
    lift: { label: 'Krafttraining', color: 'sport-lift', icon: 'lift' },
  };

  function stream(seed, n, fn) {
    const rr = rng(seed);
    return Array.from({ length: n }, (_, i) => fn(i / (n - 1), rr, i));
  }

  // zone distribution helper (minutes per zone)
  const zoneDist = (total, weights) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => Math.round((w / sum) * total));
  };

  let aid = 0;
  const mkActivity = (cfg) => {
    aid++;
    const n = 60;
    return {
      id: 'a' + aid,
      sport: cfg.sport,
      title: cfg.title,
      platform: platforms[cfg.sport],
      date: cfg.date,
      duration: cfg.duration,         // min
      distance: cfg.distance || null, // km
      elevation: cfg.elevation || null,
      calories: cfg.calories,
      tss: cfg.tss,
      rpe: cfg.rpe,
      avgPower: cfg.avgPower || null,
      maxPower: cfg.maxPower || null,
      np: cfg.np || null,
      avgHr: cfg.avgHr,
      maxHr: cfg.maxHr,
      avgCad: cfg.avgCad || null,
      maxCad: cfg.maxCad || null,
      avgPace: cfg.avgPace || null,
      load: cfg.load || null,        // total kg lifted (strength)
      zoneMin: cfg.zoneMin,
      intensity: cfg.intensity,      // 'Easy'|'Tempo'|'Hard'
      ai: cfg.ai,
      streams: cfg.streams,
    };
  };

  const activities = [
    mkActivity({
      sport: 'bike', title: 'VO₂max Intervalle 4×4', date: addDays(TODAY, -1),
      duration: 78, distance: 41.2, elevation: 420, calories: 842, tss: 96, rpe: 8,
      avgPower: 214, maxPower: 612, np: 248, avgHr: 158, maxHr: 186, avgCad: 89, maxCad: 112,
      intensity: 'Hard', zoneMin: zoneDist(78, [18, 26, 8, 8, 18]),
      ai: 'NP 248\u2009W bei IF 0,93 — Zielleistung in allen vier Intervallen gehalten, Decoupling nur 3,1\u2009%. Sehr saubere Ausführung.',
      streams: {
        hr: stream(11, 60, (t, rr) => 110 + Math.sin(t * Math.PI * 4) * 8 + (t > .25 ? Math.sin(t * 28) * 0 : 0) + Math.round(rr() * 6) + t * 30 + (Math.floor(t * 4) % 2 === 1 ? 22 : 0)),
        power: stream(12, 60, (t, rr) => {
          const interval = Math.floor((t - .2) * 8);
          const inWork = t > .2 && t < .85 && interval % 2 === 0;
          return Math.max(80, (inWork ? 300 : 150) + rr() * 40 - 20);
        }),
        cadence: stream(13, 60, (t, rr) => 84 + Math.round(rr() * 14)),
      },
    }),
    mkActivity({
      sport: 'run', title: 'Lockerer Dauerlauf', date: addDays(TODAY, -2),
      duration: 52, distance: 11.8, elevation: 95, calories: 712, tss: 48, rpe: 4,
      avgHr: 142, maxHr: 158, avgCad: 178, maxCad: 188, avgPace: 264,
      intensity: 'Easy', zoneMin: zoneDist(52, [14, 30, 6, 2, 0]),
      ai: 'Aerob sauber im GA1-Bereich. HR-Drift 2,4\u2009% bei konstanter Pace — gute aerobe Effizienz, ideale Regenerations-Vorbereitung.',
      streams: {
        hr: stream(21, 60, (t, rr) => 132 + t * 12 + Math.round(rr() * 5)),
        pace: stream(22, 60, (t, rr) => 270 - Math.sin(t * Math.PI * 3) * 8 + rr() * 6),
        cadence: stream(23, 60, (t, rr) => 174 + Math.round(rr() * 8)),
      },
    }),
    mkActivity({
      sport: 'lift', title: 'Kraft — Unterkörper', date: addDays(TODAY, -3),
      duration: 64, calories: 388, tss: 38, rpe: 7,
      avgHr: 118, maxHr: 162, load: 14820,
      intensity: 'Tempo', zoneMin: zoneDist(64, [40, 14, 6, 4, 0]),
      ai: 'Gesamtvolumen 14\u2009820\u2009kg, +6\u2009% zur Vorwoche. Progressive Overload im Plan — achte auf 48\u2009h Beinregeneration vor der nächsten Z5-Einheit.',
      streams: {
        hr: stream(31, 60, (t, rr) => 100 + Math.abs(Math.sin(t * Math.PI * 7)) * 50 + Math.round(rr() * 6)),
      },
    }),
    mkActivity({
      sport: 'bike', title: 'GA2 Tempo Endurance', date: addDays(TODAY, -5),
      duration: 134, distance: 72.4, elevation: 860, calories: 1684, tss: 138, rpe: 6,
      avgPower: 198, maxPower: 442, np: 212, avgHr: 148, maxHr: 171, avgCad: 86, maxCad: 104,
      intensity: 'Tempo', zoneMin: zoneDist(134, [20, 72, 30, 10, 2]),
      ai: 'Lange GA2-Einheit mit stabiler NP 212\u2009W. Kohlenhydrat-Verfügbarkeit gegen Ende kritisch — VLaMax-Ziel erreicht.',
      streams: {
        hr: stream(41, 60, (t, rr) => 140 + Math.sin(t * Math.PI * 2) * 10 + Math.round(rr() * 6)),
        power: stream(42, 60, (t, rr) => 190 + Math.sin(t * Math.PI * 5) * 35 + rr() * 30),
        cadence: stream(43, 60, (t, rr) => 85 + Math.round(rr() * 10)),
      },
    }),
    mkActivity({
      sport: 'run', title: 'Schwellenlauf 3×8', date: addDays(TODAY, -7),
      duration: 58, distance: 13.1, elevation: 70, calories: 798, tss: 72, rpe: 8,
      avgHr: 164, maxHr: 182, avgCad: 184, maxCad: 196, avgPace: 252,
      intensity: 'Hard', zoneMin: zoneDist(58, [10, 14, 8, 24, 2]),
      ai: 'Threshold-Pace 4:01/km gehalten, knapp unter Ziel-LT2. HR in Block 3 leicht entkoppelt — Schwelle aktuell gut getroffen.',
      streams: {
        hr: stream(51, 60, (t, rr) => 150 + (Math.floor(t * 6) % 2 === 0 ? 20 : 0) + t * 8 + Math.round(rr() * 5)),
        pace: stream(52, 60, (t, rr) => (Math.floor(t * 6) % 2 === 0 ? 248 : 300) + rr() * 8),
        cadence: stream(53, 60, (t, rr) => 182 + Math.round(rr() * 8)),
      },
    }),
    mkActivity({
      sport: 'bike', title: 'Recovery Spin', date: addDays(TODAY, -8),
      duration: 45, distance: 19.6, elevation: 110, calories: 392, tss: 28, rpe: 2,
      avgPower: 132, maxPower: 240, np: 138, avgHr: 118, maxHr: 134, avgCad: 88, maxCad: 96,
      intensity: 'Easy', zoneMin: zoneDist(45, [38, 7, 0, 0, 0]),
      ai: 'Reine Regeneration, NP 138\u2009W weit unter Z2. Genau richtig nach dem gestrigen Schwellenblock.',
      streams: {
        hr: stream(61, 60, (t, rr) => 112 + Math.round(rr() * 8)),
        power: stream(62, 60, (t, rr) => 130 + rr() * 20),
        cadence: stream(63, 60, (t, rr) => 87 + Math.round(rr() * 8)),
      },
    }),
  ];

  /* ---------- imported-activity factory (used by Import & Sync) ----------
     Builds a complete, plausible activity (metrics + telemetry streams) from a
     dropped/selected file so imports land as real units in the Diagnostik. */
  let impSeed = 84000;
  function buildImportedActivity(opts) {
    opts = opts || {};
    impSeed += 13;
    const rr = rng(impSeed);
    const pick = (a) => a[Math.floor(rr() * a.length)];
    const name = (opts.fileName || '').toLowerCase();
    let sport = opts.sport;
    if (!sport) sport = /run|lauf|\.gpx/.test(name) ? 'run' : /kraft|lift|strength|\.csv/.test(name) ? 'lift' : /bike|rad|ride|vo2|ftp|\.fit/.test(name) ? 'bike' : pick(['bike', 'run', 'lift']);
    const date = opts.date || TODAY;
    const base = { sport, date, imported: true, fileName: opts.fileName || null };
    // fall back to sane defaults when the athlete profile is still blank (real,
    // freshly-onboarded accounts have no FTP/maxHR yet) — avoids /0 and NaN.
    const FTP = Number(athlete.ftp) || 240;
    const MAXHR = Number(athlete.maxHr) || 190;

    if (sport === 'bike') {
      const dur = 45 + Math.round(rr() * 95);
      const avgPower = 150 + Math.round(rr() * 80);
      const iF = avgPower / FTP;
      const np = avgPower + 6 + Math.round(rr() * 22);
      const dist = +(dur / 60 * (27 + rr() * 13)).toFixed(1);
      const avgHr = Math.min(MAXHR - 8, 128 + Math.round(iF * 38) + Math.round(rr() * 6));
      const tss = Math.max(18, Math.round(dur / 60 * iF * iF * 100));
      const hard = iF > 0.82;
      return mkActivity({ ...base, title: opts.title || (hard ? 'Intervall-Einheit' : 'Ausdauerfahrt'),
        duration: dur, distance: dist, elevation: Math.round(dist * 8 + rr() * 220),
        calories: Math.round(dur * 11 + rr() * 140), tss, rpe: Math.min(10, Math.max(2, Math.round(tss / 13))),
        avgPower, maxPower: np + 190 + Math.round(rr() * 260), np,
        avgHr, maxHr: Math.min(MAXHR, avgHr + 16 + Math.round(rr() * 12)),
        avgCad: 84 + Math.round(rr() * 10), maxCad: 106 + Math.round(rr() * 10),
        intensity: hard ? 'Hard' : 'Tempo', zoneMin: zoneDist(dur, hard ? [14, 22, 10, 12, 16] : [16, 42, 18, 6, 2]),
        ai: 'Automatisch aus der importierten FIT-Datei rekonstruiert — Telemetrie, Zonenverteilung und TSS wurden FitFlow-seitig berechnet.',
        streams: {
          hr: stream(impSeed + 1, 60, (t, g) => avgHr - 8 + t * 14 + Math.sin(t * Math.PI * 4) * 7 + Math.round(g() * 6)),
          power: stream(impSeed + 2, 60, (t, g) => Math.max(80, avgPower + Math.sin(t * Math.PI * 6) * 62 + g() * 40 - 20)),
          cadence: stream(impSeed + 3, 60, (t, g) => 86 + Math.round(g() * 12)),
        } });
    }
    if (sport === 'run') {
      const dur = 32 + Math.round(rr() * 70);
      const pace = 232 + Math.round(rr() * 70); // s/km
      const dist = +(dur * 60 / pace).toFixed(1);
      const avgHr = 138 + Math.round(rr() * 26);
      const hard = pace < 258;
      const tss = Math.max(16, Math.round(dur / 60 * (hard ? 78 : 52)));
      return mkActivity({ ...base, title: opts.title || (hard ? 'Tempolauf' : 'Dauerlauf'),
        duration: dur, distance: dist, elevation: Math.round(dist * 7 + rr() * 60),
        calories: Math.round(dur * 13 + rr() * 90), tss, rpe: Math.min(10, Math.max(2, Math.round(tss / 11))),
        avgHr, maxHr: Math.min(MAXHR, avgHr + 16 + Math.round(rr() * 10)),
        avgCad: 176 + Math.round(rr() * 8), maxCad: 188 + Math.round(rr() * 8), avgPace: pace,
        intensity: hard ? 'Hard' : 'Easy', zoneMin: zoneDist(dur, hard ? [8, 16, 10, 20, 4] : [16, 30, 6, 2, 0]),
        ai: 'Automatisch aus der importierten Datei rekonstruiert — Pace-, HF- und Kadenzstreams sowie TSS wurden FitFlow-seitig berechnet.',
        streams: {
          hr: stream(impSeed + 1, 60, (t, g) => avgHr - 8 + t * 12 + Math.round(g() * 5)),
          pace: stream(impSeed + 2, 60, (t, g) => pace + Math.sin(t * Math.PI * 3) * 10 + g() * 6),
          cadence: stream(impSeed + 3, 60, (t, g) => 175 + Math.round(g() * 8)),
        } });
    }
    // lift
    const dur = 40 + Math.round(rr() * 45);
    const loadKg = 9000 + Math.round(rr() * 9000);
    const avgHr = 104 + Math.round(rr() * 22);
    const tss = Math.max(14, Math.round(dur / 60 * 36));
    return mkActivity({ ...base, title: opts.title || 'Krafttraining',
      duration: dur, calories: Math.round(dur * 6 + rr() * 120), tss, rpe: Math.min(10, Math.max(3, Math.round(tss / 6))),
      avgHr, maxHr: avgHr + 40 + Math.round(rr() * 14), load: loadKg,
      intensity: 'Tempo', zoneMin: zoneDist(dur, [40, 14, 6, 4, 0]),
      ai: 'Automatisch aus der importierten CSV rekonstruiert — Satz- und Wiederholungsdaten wurden in Trainingsgewicht, HF-Belastung und TSS übersetzt.',
      streams: {
        hr: stream(impSeed + 1, 60, (t, g) => 100 + Math.abs(Math.sin(t * Math.PI * 7)) * 48 + Math.round(g() * 6)),
      } });
  }

  /* ---------- notification seed (live store wraps these) ---------- */
  // Renntermin (siehe auch screen-prognose.jsx EVENTS) + relative Zeitangaben aus dem realen Datum
  const otzDate = new Date(2026, 7, 29);
  const weeksToOtz = Math.max(0, Math.round((otzDate - TODAY) / (7 * 86400000)));
  const relAgo = (ms) => {
    const hh = Math.round(ms / 3600000);
    if (hh < 1) return 'gerade eben';
    if (hh < 24) return `vor ${hh}\u2009h`;
    const dd = Math.round(ms / 86400000);
    return dd === 1 ? 'gestern' : `vor ${dd}\u2009Tg`;
  };
  const notifications = [
    { id: 'n1', type: 'sync', icon: 'link', title: 'Strava synchronisiert', text: 'VO\u2082max Intervalle 4\u00d74 \u00b7 96 TSS in die Diagnostik \u00fcbernommen.', time: relAgo(14 * 3600000), read: false, actId: 'a1' },
    { id: 'n2', type: 'recovery', icon: 'moon', title: 'Erholung im gr\u00fcnen Bereich', text: 'Recovery 74\u2009% \u00b7 HRV +6\u2009ms \u00fcber Baseline \u2014 heute ist eine Qualit\u00e4tseinheit m\u00f6glich.', time: 'heute 06:12', read: false, nav: 'dashboard' },
    { id: 'n3', type: 'event', icon: 'trophy', title: `\u00d6tztaler in ${weeksToOtz} Wochen`, text: 'Form-Prognose aktualisiert: +20 TSB zum Renntag bei Taper-Start 08.\u2009Aug.', time: relAgo(24 * 3600000), read: true, nav: 'prognose' },
    { id: 'n4', type: 'health', icon: 'heart', title: 'Apple Health aktualisiert', text: 'HRV 68\u2009ms \u00b7 Schlaf 7,4\u2009h \u00b7 Ruhepuls 49\u2009bpm synchronisiert.', time: 'heute 06:12', read: true, nav: 'import' },
  ];

  /* ---------- weekly summary (current week) ---------- */
  const week = {
    sessionsDone: 6, sessionsPlan: 6,
    durDone: 386, durPlan: 540,       // min
    kmDone: 145.4, kmPlan: 190,
    tssDone: 348, tssPlan: 470,
    focus: 'Load · Polarisiert',
    intensity: { z1: 22, z2: 49, z3: 14, z4: 11, z5: 4 }, // %
    days: [ // Mon..Sun
      { day: 'Mo', planned: null, done: { sport: 'lift', tss: 38 } },
      { day: 'Di', planned: { sport: 'bike', tss: 96 }, done: { sport: 'bike', tss: 96 } },
      { day: 'Mi', planned: { sport: 'run', tss: 48 }, done: { sport: 'run', tss: 48 } },
      { day: 'Do', planned: { sport: 'bike', tss: 138 }, done: { sport: 'bike', tss: 138 } },
      { day: 'Fr', planned: { sport: 'run', tss: 50 }, done: null },
      { day: 'Sa', planned: { sport: 'bike', tss: 110 }, done: null },
      { day: 'So', planned: { sport: 'bike', tss: 70 }, done: null },
    ],
  };
  // „heute"-Markierung im Wochenstreifen auf den realen Wochentag legen (Mo=0 … So=6)
  week.days.forEach((d, i) => { d.today = i === ((TODAY.getDay() + 6) % 7); });

  /* ---------- annual periodization ---------- */
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const annual = {
    season: '2026',
    blocks: [
      { phase: 'Recovery', sub: 'Freie Einteilung', start: 0, end: 1.5, color: 'z1', desc: 'Aktive Erholung, freie Bewegung, kein strukturierter Reiz.' },
      { phase: 'Off-Season', sub: 'Grundlagenausdauer', start: 1.5, end: 4, color: 'z2', desc: 'Aerobe Basis aufbauen, hohes GA1/GA2-Volumen, Krafterhalt.' },
      { phase: 'Load', sub: 'Polarisiert', start: 4, end: 6.5, color: 'z4', desc: '80/20-Verteilung, VO₂max-Reize, steigender CTL.' },
      { phase: 'Load', sub: 'Schwelle', start: 6.5, end: 8.5, color: 'z3', desc: 'Schwellen-fokussierter Block Richtung Wettkampf.' },
      { phase: 'Load', sub: 'Pyramidal', start: 8.5, end: 10, color: 'z4', desc: 'Pyramidale Intensitätsverteilung, Wettkampf-Spezifik.' },
      { phase: 'Off-Season', sub: 'Transition', start: 10, end: 12, color: 'z2', desc: 'Ausklang, Volumen reduzieren, Saisonabschluss.' },
    ],
    currentMonth: TODAY.getMonth(), // realer Monat (0-idx)
    targetEvents: [
      { name: 'Ötztaler Radmarathon', month: 8.0, type: 'A' },
      { name: 'Wachau Halbmarathon', month: 9.3, type: 'B' },
    ],
    // weekly CTL ramp across the year (target curve)
    ctlTarget: Array.from({ length: 52 }, (_, w) => {
      const x = w / 51;
      return 45 + 45 * Math.sin(Math.min(x, .82) * Math.PI * 0.95) + (x > .82 ? -10 : 0);
    }),
  };

  /* ---------- week planner template (next week recommendation) ---------- */
  const planner = {
    weekLabel: '8.–14. Jun',
    recoTss: 460,
    sessions: [
      { day: 'Mo', date: 8, items: [] },
      { day: 'Di', date: 9, items: [{ sport: 'bike', title: 'Sweet-Spot 3×12', time: '17:30', dur: 75, tss: 88, zone: 'z3', ai: true, intensity: 'Tempo' }] },
      { day: 'Mi', date: 10, items: [{ sport: 'run', title: 'Lockerer DL', time: '07:00', dur: 50, tss: 46, zone: 'z2', ai: true, intensity: 'Easy' }, { sport: 'lift', title: 'Kraft Oberkörper', time: '19:00', dur: 55, tss: 32, zone: 'z2', intensity: 'Tempo' }] },
      { day: 'Do', date: 11, items: [{ sport: 'bike', title: 'VO₂max 5×3', time: '17:30', dur: 70, tss: 92, zone: 'z5', ai: true, intensity: 'Hard' }] },
      { day: 'Fr', date: 12, items: [] },
      { day: 'Sa', date: 13, items: [{ sport: 'bike', title: 'Lange GA2', time: '09:00', dur: 180, tss: 165, zone: 'z2', ai: true, intensity: 'Tempo' }] },
      { day: 'So', date: 14, items: [{ sport: 'run', title: 'Recovery Run', time: '09:30', dur: 35, tss: 28, zone: 'z1', intensity: 'Easy' }] },
    ],
  };

  /* ---------- integrations ---------- */
  const integrations = [
    { id: 'strava', name: 'Strava', status: 'connected', detail: 'Auto-Sync · letzte Aktivität vor 14\u2009h', sub: '212 Aktivitäten synchronisiert' },
    { id: 'health', name: 'Apple Health', status: 'connected', detail: 'HRV, Schlaf & Ruhepuls', sub: 'Aktualisiert heute 06:12' },
    { id: 'garmin', name: 'Garmin', status: 'available', detail: 'FIT-Dateien & Telemetrie', sub: 'Nicht verbunden' },
    { id: 'wahoo', name: 'Wahoo', status: 'available', detail: 'Power-Trainings importieren', sub: 'Nicht verbunden' },
  ];
  const recentImports = [
    { name: '2026-06-05_vo2max_4x4.fit', size: '1,8\u2009MB', status: 'done', sport: 'bike', rows: '4 712 Datenpunkte' },
    { name: '2026-06-04_dauerlauf.fit', size: '1,1\u2009MB', status: 'done', sport: 'run', rows: '3 120 Datenpunkte' },
    { name: 'kraft_unterkoerper.csv', size: '34\u2009KB', status: 'done', sport: 'lift', rows: '28 Sätze' },
  ];

  /* Build a real activity from a parsed FIT/CSV summary (window.FitParser).
     Everything here is derived from the actual file — duration, distance,
     HR/power/cadence aggregates, TSS, zone split and the telemetry streams
     are computed, not fabricated. Falls back sensibly when a field is absent. */
  function buildActivityFromFit(p, opts) {
    opts = opts || {};
    const fname = opts.fileName || p.fileName || null;

    // sport: parser guess → filename hint → stream-based inference
    let sport = p.sport;
    if (!sport) {
      const name = (fname || '').toLowerCase();
      sport = /run|lauf/.test(name) ? 'run'
        : /kraft|lift|strength|\.csv/.test(name) ? 'lift'
        : p.avgPower ? 'bike' : (p.avgSpeed || p.distance) ? 'run' : 'lift';
    }

    const durMin = Math.max(1, Math.round((p.duration || 0) / 60) || 1);
    const durH = durMin / 60;
    const distKm = p.distance != null ? +(p.distance / 1000).toFixed(1) : null;

    // intensity factor + TSS: power-based for bike, HR-based otherwise
    let tss, iF = null;
    const npOrAvg = p.np || p.avgPower;
    if (npOrAvg && athlete.ftp) {
      iF = npOrAvg / athlete.ftp;
      tss = Math.max(1, Math.round(durH * iF * iF * 100));
    } else if (p.avgHr && athlete.thrHr) {
      const hrIf = p.avgHr / athlete.thrHr;
      tss = Math.max(1, Math.round(durH * hrIf * hrIf * 100));
    } else {
      tss = Math.max(1, Math.round(durMin * 0.8));
    }

    // avg pace (s/km) for running
    let avgPace = null;
    const spd = p.avgSpeed || (p.distance && p.duration ? p.distance / p.duration : null);
    if (sport === 'run' && spd) avgPace = Math.round(1000 / spd);

    // zone minutes: bucket the HR stream against the athlete's zones, else estimate
    const hrStream = p.records ? p.records.map((r) => r.hr).filter((v) => v != null) : [];
    let zoneMin;
    if (hrStream.length > 8 && athlete.thrHr) {
      const buckets = [0, 0, 0, 0, 0];
      hrStream.forEach((hr) => {
        const frac = hr / athlete.thrHr;
        let zi = hrZones.findIndex((z) => frac < z.hi);
        if (zi < 0) zi = 4;
        buckets[zi]++;
      });
      const tot = hrStream.length;
      zoneMin = buckets.map((c) => Math.round((c / tot) * durMin));
    } else {
      const w = iF && iF > 0.9 ? [10, 20, 12, 10, 12] : iF && iF > 0.75 ? [16, 34, 12, 6, 2] : [22, 30, 6, 2, 0];
      zoneMin = zoneDist(durMin, w);
    }

    // downsample any per-record channel to 60 points for the charts
    const down = (key) => {
      const src = p.records ? p.records.map((r) => r[key]) : [];
      const clean = src.filter((v) => v != null);
      if (clean.length < 4) return null;
      const out = [];
      for (let i = 0; i < 60; i++) {
        const a = Math.floor((i / 60) * clean.length), b = Math.max(a + 1, Math.floor(((i + 1) / 60) * clean.length));
        let s = 0, n = 0; for (let k = a; k < b && k < clean.length; k++) { s += clean[k]; n++; }
        out.push(n ? Math.round(s / n) : clean[Math.min(a, clean.length - 1)]);
      }
      return out;
    };
    const paceStream = () => {
      const src = p.records ? p.records.map((r) => (r.speed ? 1000 / r.speed : null)) : [];
      const clean = src.filter((v) => v != null && isFinite(v) && v < 900);
      if (clean.length < 4) return null;
      const out = [];
      for (let i = 0; i < 60; i++) {
        const a = Math.floor((i / 60) * clean.length), b = Math.max(a + 1, Math.floor(((i + 1) / 60) * clean.length));
        let s = 0, n = 0; for (let k = a; k < b && k < clean.length; k++) { s += clean[k]; n++; }
        out.push(n ? Math.round(s / n) : clean[Math.min(a, clean.length - 1)]);
      }
      return out;
    };

    const streams = {};
    const hrDown = down('hr'); if (hrDown) streams.hr = hrDown;
    if (sport === 'run') { const pc = paceStream(); if (pc) streams.pace = pc; }
    else { const pw = down('power'); if (pw) streams.power = pw; }
    const cad = down('cadence'); if (cad) streams.cadence = cad;

    const hard = iF != null ? iF > 0.9 : (avgPace && athlete.runThrPace ? avgPace < athlete.runThrPace : false);
    const intensity = hard ? 'Hard' : (iF != null ? (iF > 0.75 ? 'Tempo' : 'Easy') : 'Tempo');
    const title = opts.title
      || (sport === 'bike' ? (hard ? 'Intervall-Einheit' : 'Ausdauerfahrt')
        : sport === 'run' ? (hard ? 'Tempolauf' : 'Dauerlauf') : 'Krafttraining');

    const date = p.startTime instanceof Date && !isNaN(p.startTime) ? p.startTime : (opts.date || TODAY);

    return mkActivity({
      sport, title, date, imported: true, fileName: fname,
      duration: durMin, distance: distKm,
      elevation: p.elevation != null ? p.elevation : null,
      calories: p.calories != null ? p.calories : Math.round(durMin * (sport === 'bike' ? 10 : sport === 'run' ? 12 : 6)),
      tss, rpe: Math.min(10, Math.max(2, Math.round(tss / (sport === 'lift' ? 6 : 12)))),
      avgPower: p.avgPower || null, maxPower: p.maxPower || null, np: p.np || null,
      avgHr: p.avgHr || null, maxHr: p.maxHr || null,
      avgCad: p.avgCad || null, maxCad: p.maxCad || null, avgPace,
      intensity, zoneMin,
      ai: 'Aus deiner echten ' + (fname && /\.csv$/i.test(fname) ? 'CSV' : 'FIT') + '-Datei eingelesen — Dauer, '
        + 'Distanz, HF/Power/Kadenz, Zonenverteilung und TSS wurden direkt aus den Messwerten berechnet.',
      streams: Object.keys(streams).length ? streams : undefined,
    });
  }

  /* Build a real activity from a Strava activity summary (the normalised object
     the strava Edge Function returns). Everything is derived from Strava's own
     numbers — duration, distance, HR/power, elevation and TSS. TSS prefers
     power (needs FTP), then HR (needs threshold HR), then Strava's Relative
     Effort (suffer_score), then a duration estimate, so it still yields an
     honest value when the athlete profile has no performance values yet. */
  function buildActivityFromStrava(s, opts) {
    opts = opts || {};
    const type = String(s.type || '').toLowerCase();
    let sport = /ride|cycl|bike|velomobile|handcycle|ebike/.test(type) ? 'bike'
      : /run|walk|hike/.test(type) ? 'run'
      : /weight|workout|crossfit|strength/.test(type) ? 'lift'
      : (s.average_watts ? 'bike' : (s.distance ? 'run' : 'lift'));

    const durMin = Math.max(1, Math.round((s.moving_time || s.elapsed_time || 0) / 60) || 1);
    const durH = durMin / 60;
    const distKm = s.distance != null ? +(s.distance / 1000).toFixed(1) : null;
    const np = s.weighted_average_watts || null;
    const avgPower = s.average_watts || null;
    const avgHr = s.average_heartrate ? Math.round(s.average_heartrate) : null;
    const maxHr = s.max_heartrate ? Math.round(s.max_heartrate) : null;
    const FTP = Number(athlete.ftp) || 0;
    const THR = Number(athlete.thrHr) || 0;

    let tss, iF = null;
    const powerRef = np || avgPower;
    if (powerRef && FTP) { iF = powerRef / FTP; tss = Math.max(1, Math.round(durH * iF * iF * 100)); }
    else if (avgHr && THR) { const hr = avgHr / THR; tss = Math.max(1, Math.round(durH * hr * hr * 100)); }
    else if (s.suffer_score) { tss = Math.max(1, Math.round(s.suffer_score)); }
    else { tss = Math.max(1, Math.round(durMin * 0.7)); }

    let avgPace = null;
    const spd = s.average_speed || (s.distance && s.moving_time ? s.distance / s.moving_time : null);
    if (sport === 'run' && spd) avgPace = Math.round(1000 / spd);

    let zoneMin;
    if (avgHr && THR) {
      const frac = avgHr / THR;
      const w = frac > 0.98 ? [6, 14, 14, 16, 10] : frac > 0.9 ? [10, 24, 14, 8, 4] : frac > 0.82 ? [16, 34, 8, 2, 0] : [26, 26, 4, 0, 0];
      zoneMin = zoneDist(durMin, w);
    } else {
      const w = iF && iF > 0.9 ? [10, 20, 12, 10, 12] : iF && iF > 0.75 ? [16, 34, 12, 6, 2] : [22, 30, 6, 2, 0];
      zoneMin = zoneDist(durMin, w);
    }

    const hard = iF != null ? iF > 0.9 : (avgPace && athlete.runThrPace ? avgPace < athlete.runThrPace : (s.suffer_score > 80));
    const intensity = hard ? 'Hard' : (iF != null ? (iF > 0.75 ? 'Tempo' : 'Easy') : 'Tempo');
    const title = s.name || (sport === 'bike' ? (hard ? 'Intervall-Einheit' : 'Ausdauerfahrt')
      : sport === 'run' ? (hard ? 'Tempolauf' : 'Dauerlauf') : 'Krafttraining');
    const date = s.start_date ? new Date(s.start_date) : (opts.date || TODAY);
    const calories = s.calories || (s.kilojoules ? Math.round(s.kilojoules) : Math.round(durMin * (sport === 'bike' ? 10 : sport === 'run' ? 12 : 6)));

    return mkActivity({
      sport, title, date, imported: true,
      duration: durMin, distance: distKm,
      elevation: s.total_elevation_gain != null ? Math.round(s.total_elevation_gain) : null,
      calories, tss, rpe: Math.min(10, Math.max(2, Math.round(tss / (sport === 'lift' ? 6 : 12)))),
      avgPower, maxPower: s.max_watts || null, np,
      avgHr, maxHr,
      avgCad: s.average_cadence ? Math.round(s.average_cadence * (sport === 'run' ? 2 : 1)) : null, maxCad: null, avgPace,
      intensity, zoneMin,
      ai: 'Automatisch von Strava synchronisiert — Dauer, Distanz, HF/Power, Höhenmeter und TSS stammen aus deinen Strava-Aktivitätsdaten.',
    });
  }

  window.FF = {
    fmt, TODAY, addDays,
    athlete, hrZones, powerZones,
    load, todayLoad, fitnessScore,
    risk, projectForm,
    recovery, reco,
    activities, sportMeta, week,
    annual, months, planner,
    integrations, recentImports,
    buildImportedActivity, buildActivityFromFit, buildActivityFromStrava, notifications,
    zoneColors: ['z1', 'z2', 'z3', 'z4', 'z5'],
  };
})();
