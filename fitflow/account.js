/* FitFlow — account data layer.
   Swaps the working dataset (window.FF) between the seeded DEMO data and an
   EMPTY profile, depending on the active account. Loaded AFTER data.js and
   store.js so both FF and FFLive exist. A pristine snapshot of the demo data
   is captured once at load and restored whenever the demo account is active. */
(function () {
  if (!window.FF) return;

  const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'FF';

  // pristine demo snapshot (deep enough for our needs)
  const SNAP = {
    athlete: JSON.parse(JSON.stringify(FF.athlete)),
    activities: FF.activities.slice(),
    notifications: (FF.notifications || []).slice(),
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

  const FFAccount = {
    /* mutate FF + FFLive in place to match the active account */
    apply(isEmpty, acc) {
      const Live = window.FFLive;
      if (isEmpty) {
        FF.athlete = emptyAthlete(acc);
        FF.activities.length = 0;
        FF.empty = true;
        FF.zonesSet = false;
        if (Live && Live.setEmptyMode) Live.setEmptyMode(true);
      } else {
        // restore demo dataset (the populated FitFlow experience)
        FF.athlete = JSON.parse(JSON.stringify(SNAP.athlete));
        // a registered athlete who has finished onboarding keeps their identity
        if (acc && !acc.demo && acc.name) {
          FF.athlete.name = acc.name;
          FF.athlete.email = acc.email || FF.athlete.email;
          FF.athlete.initials = initials(acc.name);
          if (acc.sport) FF.athlete.role = acc.sport;
          // aus dem Onboarding-Wizard (user_metadata) übernommene Profilwerte
          if (acc.height) FF.athlete.height = acc.height;
          if (acc.weight) FF.athlete.weight = acc.weight;
          if (acc.age) FF.athlete.age = acc.age;
          if (acc.sex) FF.athlete.sex = acc.sex;
          if (acc.goal) FF.athlete.goal = acc.goal;
        }
        FF.activities.length = 0;
        SNAP.activities.forEach((a) => FF.activities.push(a));
        FF.empty = false;
        FF.zonesSet = true;
        if (Live && Live.setEmptyMode) Live.setEmptyMode(false);
      }
      // re-inject the account's persisted FIT/CSV imports on top of the base
      // dataset (apply runs each render; hydrate is safe to call every time).
      if (window.FFImports && acc && acc.email) window.FFImports.hydrate(acc);
    },
    isEmpty() { return !!FF.empty; },
  };

  window.FFAccount = FFAccount;
})();
