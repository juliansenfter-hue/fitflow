/* FitFlow — account data layer.
   Swaps the working dataset (window.FF) between the seeded DEMO data and an
   EMPTY profile, depending on the active account. Loaded AFTER data.js and
   store.js so both FF and FFLive exist. A pristine snapshot of the demo data
   is captured once at load and restored whenever the demo account is active. */
(function () {
  if (!window.FF) return;

  const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'FF';

  // pristine demo snapshot (deep enough for our needs). load/todayLoad/risk/week
  // are captured by reference because FFMetrics.apply() REPLACES these globals
  // (never mutates the originals) — so the demo can always be restored intact
  // even after a real account recomputed them.
  const SNAP = {
    athlete: JSON.parse(JSON.stringify(FF.athlete)),
    activities: FF.activities.slice(),
    notifications: (FF.notifications || []).slice(),
    load: FF.load,
    todayLoad: FF.todayLoad,
    fitnessScore: FF.fitnessScore,
    risk: FF.risk,
    week: FF.week,
  };

  function emptyAthlete(acc) {
    acc = acc || {};
    return {
      name: acc.name || '', initials: initials(acc.name),
      role: acc.sport ? acc.sport : 'Neues Profil',
      age: acc.age || '', height: acc.height || '', weight: acc.weight || '', sex: acc.sex || '',
      ftp: '', vo2max: '', thrHr: '', maxHr: '', restHr: '', runThrPace: '',
      plan: 'FREE', email: acc.email || '', goal: acc.goal || '',
    };
  }

  // an onboarded REAL athlete: same shape as emptyAthlete but presented as an
  // active profile (its performance values still come from the user's onboarding
  // and stay blank until entered — no demo numbers are borrowed).
  function realAthlete(acc) {
    const a = emptyAthlete(acc);
    a.role = (acc && acc.sport) || 'Athlet';
    return a;
  }

  const FFAccount = {
    /* mutate FF + FFLive in place to match the active account */
    apply(isEmpty, acc) {
      const Live = window.FFLive;
      // no account = the not-logged-in login teaser → show demo data behind it.
      const isDemo = !acc || !!acc.demo;
      if (isEmpty) {
        FF.athlete = emptyAthlete(acc);
        FF.activities.length = 0;
        FF.empty = true;
        FF.zonesSet = false;
        if (Live && Live.setEmptyMode) Live.setEmptyMode(true);
      } else if (!isDemo) {
        // REAL onboarded account with data — starts from the user's own
        // activities only. No demo sessions are injected; every dashboard metric
        // is computed from the real imports below (FFMetrics), so the numbers are
        // genuinely theirs. Services stay "available" (honest) until truly linked.
        FF.athlete = realAthlete(acc);
        FF.activities.length = 0;
        FF.empty = false;
        FF.zonesSet = !!(FF.athlete.thrHr || FF.athlete.ftp);
        if (Live && Live.setEmptyMode) Live.setEmptyMode(true);
      } else {
        // DEMO account — restore the seeded 16-week story untouched, including
        // the derived metrics (a real account may have replaced these globals).
        FF.athlete = JSON.parse(JSON.stringify(SNAP.athlete));
        FF.activities.length = 0;
        SNAP.activities.forEach((a) => FF.activities.push(a));
        FF.load = SNAP.load;
        FF.todayLoad = SNAP.todayLoad;
        FF.fitnessScore = SNAP.fitnessScore;
        FF.risk = SNAP.risk;
        FF.week = SNAP.week;
        FF.empty = false;
        FF.zonesSet = true;
        if (Live && Live.setEmptyMode) Live.setEmptyMode(false);
      }
      // Only the DEMO account carries real recovery/vital data (HRV, sleep, RHR …).
      // A real account (incl. Strava) has NO source for these — Strava doesn't
      // deliver them — so the dashboard must show "keine Angabe" instead of the
      // seeded demo numbers, until the user enters them manually.
      FF.hasVitals = isDemo;

      // re-inject the account's persisted FIT/CSV imports on top of the base
      // dataset (apply runs each render; hydrate is safe to call every time).
      if (window.FFImports && acc && acc.email) window.FFImports.hydrate(acc);

      // real accounts: derive load / CTL-ATL-TSB / risk / week straight from the
      // (now hydrated) real activity list. Demo keeps its narrative; empty stays empty.
      if (!isDemo && !FF.empty && window.FFMetrics) {
        window.FFMetrics.apply(FF.activities);
      }
      // reflect a real account's Strava connection into the integrations list
      // (services were just reset to "available"); safe for empty accounts too,
      // so the "Dienst verbinden" onboarding step ticks off.
      if (!isDemo && acc && acc.email && window.FFStrava) window.FFStrava.reflectStatus(acc);
    },
    isEmpty() { return !!FF.empty; },
  };

  window.FFAccount = FFAccount;
})();
