/* FitFlow — auth layer (multi-account, prototype).
   No real backend: accounts live in localStorage. The seeded DEMO account
   (Julian) carries the full sample dataset; any account the user REGISTERS
   starts empty (empty:true) so the app opens blank and the tour can run.
   The session stays open until the user actively logs out.

   Demo account:  julian.senfter@gmail.com  /  fitflow
*/
(function () {
  const ACC_KEY = 'fitflow.accounts.v1';
  const SES_KEY = 'fitflow.session.v1';

  const DEMO_EMAIL = (window.FF && FF.athlete && FF.athlete.email) || 'julian.senfter@gmail.com';
  const DEMO = {
    name: (window.FF && FF.athlete && FF.athlete.name) || 'Julian Senfter',
    email: DEMO_EMAIL,
    password: 'fitflow',
    sport: 'Ausdauer',
    goal: '',
    empty: false,
    demo: true,
    createdAt: 0,
  };

  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(Auth.get()); } catch (e) { /* noop */ } });
  const norm = (s) => String(s || '').trim().toLowerCase();
  const initials = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || 'FF';

  function loadAccounts() {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(ACC_KEY)) || {}; } catch (e) { map = {}; }
    if (!map[norm(DEMO.email)]) map[norm(DEMO.email)] = Object.assign({}, DEMO); // always keep demo
    return map;
  }
  function saveAccounts() { try { localStorage.setItem(ACC_KEY, JSON.stringify(accounts)); } catch (e) { /* noop */ } }

  function loadSession() {
    try { return JSON.parse(localStorage.getItem(SES_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveSession() { try { localStorage.setItem(SES_KEY, JSON.stringify(session)); } catch (e) { /* noop */ } }

  let accounts = loadAccounts();
  saveAccounts();
  let session = loadSession();
  if (!session.activeEmail || !accounts[norm(session.activeEmail)]) {
    session = { activeEmail: DEMO.email, loggedIn: false };
  }
  saveSession();

  const active = () => accounts[norm(session.activeEmail)] || accounts[norm(DEMO.email)];

  const Auth = {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    get() {
      const a = active();
      return { email: a.email, name: a.name, loggedIn: !!session.loggedIn, empty: !!a.empty, demo: !!a.demo };
    },
    isLoggedIn() { return !!session.loggedIn; },
    isEmptyAccount() { const a = active(); return !!(a && a.empty); },
    currentAccount() {
      const a = active();
      return { name: a.name, email: a.email, sport: a.sport, goal: a.goal, empty: !!a.empty, demo: !!a.demo, initials: initials(a.name) };
    },

    login(email, password) {
      const acc = accounts[norm(email)];
      if (!acc) return { ok: false, field: 'email', error: 'Kein Konto mit dieser E-Mail-Adresse.' };
      if (String(password) !== String(acc.password)) return { ok: false, field: 'password', error: 'Passwort ist nicht korrekt.' };
      session = { activeEmail: acc.email, loggedIn: true };
      saveSession(); emit();
      return { ok: true, registered: false, empty: !!acc.empty };
    },

    register({ name, email, password, password2, sport, goal }) {
      const e = String(email || '').trim();
      if (!String(name || '').trim()) return { ok: false, field: 'name', error: 'Bitte gib deinen Namen ein.' };
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, field: 'email', error: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
      if (accounts[norm(e)]) return { ok: false, field: 'email', error: 'Mit dieser E-Mail existiert bereits ein Konto.' };
      if (String(password).length < 6) return { ok: false, field: 'password', error: 'Das Passwort braucht mindestens 6 Zeichen.' };
      if (String(password) !== String(password2)) return { ok: false, field: 'password2', error: 'Die Passwörter stimmen nicht überein.' };
      const acc = {
        name: String(name).trim(), email: e, password: String(password),
        sport: sport || '', goal: goal || '', empty: true, demo: false, createdAt: Date.now(),
      };
      accounts[norm(e)] = acc;
      saveAccounts();
      session = { activeEmail: e, loggedIn: true };
      saveSession(); emit();
      return { ok: true, registered: true, empty: true };
    },

    logout() { session.loggedIn = false; saveSession(); emit(); },

    /* mark the active account as onboarded — it leaves the empty state and
       the full dashboard opens. (No-op for the demo account.) */
    markOnboarded() {
      const a = active();
      a.empty = false;
      saveAccounts(); emit();
    },

    changeEmail(next) {
      const e = String(next || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' };
      const a = active();
      if (norm(e) !== norm(a.email) && accounts[norm(e)]) return { ok: false, error: 'Diese E-Mail wird bereits verwendet.' };
      delete accounts[norm(a.email)];
      a.email = e;
      accounts[norm(e)] = a;
      session.activeEmail = e;
      saveAccounts(); saveSession(); emit();
      return { ok: true };
    },

    changePassword(current, next) {
      const a = active();
      if (String(current) !== String(a.password)) return { ok: false, field: 'current', error: 'Aktuelles Passwort ist nicht korrekt.' };
      if (String(next).length < 6) return { ok: false, field: 'next', error: 'Das neue Passwort braucht mindestens 6 Zeichen.' };
      a.password = String(next);
      saveAccounts(); emit();
      return { ok: true };
    },

    /* delete the active account (the demo account is reset, not removed) */
    deleteAccount() {
      const a = active();
      if (a.demo) {
        accounts[norm(DEMO.email)] = Object.assign({}, DEMO);
      } else {
        delete accounts[norm(a.email)];
      }
      saveAccounts();
      session = { activeEmail: DEMO.email, loggedIn: false };
      saveSession(); emit();
    },

    exportData() {
      const FFd = window.FF || {};
      const a = active();
      const payload = {
        exportedAt: new Date().toISOString(),
        app: 'FitFlow',
        account: { name: a.name, email: a.email, sport: a.sport, goal: a.goal },
        athlete: FFd.athlete || null,
        zones: { hr: FFd.hrZones || null, power: FFd.powerZones || null },
        activities: (FFd.activities || []).map((x) => ({
          id: x.id, sport: x.sport, date: x.date, title: x.title,
          durationS: x.durationS, distanceKm: x.distanceKm, tss: x.tss,
        })),
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    },
  };

  window.FFAuth = Auth;
})();
