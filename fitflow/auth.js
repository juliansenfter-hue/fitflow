/* FitFlow — auth layer (Supabase-backed).
   Real accounts live in Supabase Auth: registration, login, password reset by
   e-mail, password change. The same window.FFAuth interface as before is kept
   (synchronous getters + subscribe, backed by a local mirror that Supabase's
   onAuthStateChange keeps in sync) so the rest of the app is undisturbed.

   The seeded DEMO account (Julian / fitflow) is a LOCAL bypass — it carries the
   full sample dataset and never touches Supabase, so "Demo ansehen" always works.
   Any REAL account a user registers starts empty (empty:true → blank app + tour)
   until onboarded.

   Config: window.FF_SUPABASE = { url, anonKey } (see supabase-config.js).
*/
(function () {
  var CFG = window.FF_SUPABASE || {};
  var SB = window.supabase; // UMD global from the @supabase/supabase-js CDN bundle

  var DEMO = {
    name: (window.FF && FF.athlete && FF.athlete.name) || 'Julian Senfter',
    email: (window.FF && FF.athlete && FF.athlete.email) || 'julian.senfter@gmail.com',
    password: 'fitflow',
  };

  var listeners = new Set();
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };
  var initials = function (name) {
    return String(name || '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0] || ''; }).join('').toUpperCase() || 'FF';
  };
  var emailEsc = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---- local mirror of the auth state (read synchronously by the app) ---- */
  var client = null;
  var ready = false;       // first session check done?
  var recovery = false;    // arrived via a password-reset link?
  var demo = false;        // local demo bypass active?
  var user = null;         // current Supabase user object (or null)

  function emit() {
    var s = Auth.get();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* noop */ } });
  }
  function setReady() { if (!ready) { ready = true; } emit(); }

  function nameOf(u) {
    if (!u) return '';
    var m = u.user_metadata || {};
    if (m.name) return m.name;
    return String(u.email || '').split('@')[0];
  }
  function isOnboarded(u) { return !!(u && u.user_metadata && u.user_metadata.onboarded); }

  /* the clean app URL (no hash/query) — used as the redirect target for the
     reset/confirm e-mail links. Must be listed under Supabase → Auth → Redirect URLs. */
  function appUrl() { return location.href.split('#')[0].split('?')[0]; }

  /* ---- init Supabase (graceful if the SDK/config is missing) ---- */
  if (SB && SB.createClient && CFG.url && CFG.anonKey) {
    client = SB.createClient(CFG.url, CFG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      // a real Supabase session always wins over the local demo bypass
      if (session && session.user) demo = false;
      user = session ? session.user : null;
      setReady();
    });
    // also resolve the initial session explicitly (covers the no-event case)
    client.auth.getSession().then(function (res) {
      if (!demo) user = res && res.data && res.data.session ? res.data.session.user : user;
      setReady();
    }).catch(function () { setReady(); });
  } else {
    // No backend configured → demo-only mode (app still usable).
    if (!SB) console.warn('[FitFlow] Supabase SDK nicht geladen — nur Demo-Login verfügbar.');
    else if (!CFG.url || !CFG.anonKey) console.warn('[FitFlow] Supabase nicht konfiguriert (supabase-config.js) — nur Demo-Login.');
    ready = true;
  }

  function mapAuthError(error) {
    var m = String((error && error.message) || '').toLowerCase();
    if (m.indexOf('invalid login') >= 0) return { field: 'password', error: 'E-Mail oder Passwort ist nicht korrekt.' };
    if (m.indexOf('not confirmed') >= 0 || m.indexOf('email not confirmed') >= 0) return { field: 'email', error: 'Bitte bestätige zuerst deine E-Mail (Link in der Bestätigungs-Mail).' };
    if (m.indexOf('already registered') >= 0 || m.indexOf('already been registered') >= 0) return { field: 'email', error: 'Mit dieser E-Mail existiert bereits ein Konto.' };
    if (m.indexOf('rate limit') >= 0 || m.indexOf('too many') >= 0) return { error: 'Zu viele Versuche — bitte kurz warten und erneut probieren.' };
    if (m.indexOf('password') >= 0 && m.indexOf('6') >= 0) return { field: 'password', error: 'Das Passwort braucht mindestens 6 Zeichen.' };
    return { error: (error && error.message) || 'Es ist ein Fehler aufgetreten.' };
  }

  function need() {
    if (!client) return { ok: false, error: 'Backend nicht verbunden. Bitte Supabase in supabase-config.js eintragen.' };
    return null;
  }

  var Auth = {
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },

    /* ---- synchronous getters (read by the app's render) ---- */
    isReady: function () { return ready; },
    isConfigured: function () { return !!client; },
    isRecovery: function () { return recovery; },
    isLoggedIn: function () { return demo || !!user; },
    isEmptyAccount: function () { if (demo) return false; return !!(user && !isOnboarded(user)); },

    get: function () {
      if (demo) return { email: DEMO.email, name: DEMO.name, loggedIn: true, empty: false, demo: true };
      return {
        email: user ? user.email : '',
        name: nameOf(user),
        loggedIn: !!user,
        empty: !!(user && !isOnboarded(user)),
        demo: false,
      };
    },
    currentAccount: function () {
      if (demo) return { name: DEMO.name, email: DEMO.email, sport: 'Ausdauer', goal: '', empty: false, demo: true, initials: initials(DEMO.name) };
      var m = (user && user.user_metadata) || {};
      return {
        name: nameOf(user), email: user ? user.email : '',
        sport: m.sport || '', goal: m.goal || '',
        empty: !!(user && !isOnboarded(user)), demo: false, initials: initials(nameOf(user)),
      };
    },

    /* ---- actions (async) ---- */
    login: function (email, password) {
      // local demo bypass (no Supabase round-trip)
      if (norm(email) === norm(DEMO.email) && String(password) === DEMO.password) {
        demo = true; user = null; recovery = false; emit();
        return Promise.resolve({ ok: true, registered: false, empty: false, demo: true });
      }
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.signInWithPassword({ email: String(email).trim(), password: String(password) })
        .then(function (res) {
          if (res.error) return Object.assign({ ok: false }, mapAuthError(res.error));
          demo = false; user = res.data.user; emit();
          return { ok: true, registered: false, empty: !isOnboarded(user) };
        });
    },

    register: function (data) {
      data = data || {};
      var name = String(data.name || '').trim();
      var email = String(data.email || '').trim();
      var password = String(data.password || '');
      var password2 = String(data.password2 || '');
      if (!name) return Promise.resolve({ ok: false, field: 'name', error: 'Bitte gib deinen Namen ein.' });
      if (!emailEsc.test(email)) return Promise.resolve({ ok: false, field: 'email', error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      if (password.length < 6) return Promise.resolve({ ok: false, field: 'password', error: 'Das Passwort braucht mindestens 6 Zeichen.' });
      if (password !== password2) return Promise.resolve({ ok: false, field: 'password2', error: 'Die Passwörter stimmen nicht überein.' });
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.signUp({
        email: email, password: password,
        options: { data: { name: name, sport: data.sport || '', goal: data.goal || '', onboarded: false }, emailRedirectTo: appUrl() },
      }).then(function (res) {
        if (res.error) return Object.assign({ ok: false }, mapAuthError(res.error));
        // existing-email signups come back with an empty identities array (anti-enumeration)
        if (res.data.user && res.data.user.identities && res.data.user.identities.length === 0) {
          return { ok: false, field: 'email', error: 'Mit dieser E-Mail existiert bereits ein Konto.' };
        }
        if (res.data.session) { // e-mail confirmation OFF → logged in immediately
          demo = false; user = res.data.user; emit();
          return { ok: true, registered: true, empty: true };
        }
        // e-mail confirmation ON → must confirm before the session opens
        return { ok: true, registered: true, empty: true, needConfirm: true, email: email };
      });
    },

    /* send a password-reset e-mail (always reports success — anti-enumeration) */
    resetPassword: function (email) {
      var e = String(email || '').trim();
      if (!emailEsc.test(e)) return Promise.resolve({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.resetPasswordForEmail(e, { redirectTo: appUrl() })
        .then(function (res) {
          if (res.error) return Object.assign({ ok: false }, mapAuthError(res.error));
          return { ok: true };
        });
    },

    /* set a new password for the recovered/logged-in session (reset-link return) */
    updatePassword: function (next) {
      if (String(next).length < 6) return Promise.resolve({ ok: false, field: 'next', error: 'Das neue Passwort braucht mindestens 6 Zeichen.' });
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.updateUser({ password: String(next) }).then(function (res) {
        if (res.error) return Object.assign({ ok: false }, mapAuthError(res.error));
        recovery = false; user = res.data.user; emit();
        return { ok: true };
      });
    },

    /* change password while logged in: re-verify the current one, then update */
    changePassword: function (current, next) {
      if (demo) return Promise.resolve({ ok: false, field: 'current', error: 'Im Demo-Konto nicht möglich.' });
      if (String(next).length < 6) return Promise.resolve({ ok: false, field: 'next', error: 'Das neue Passwort braucht mindestens 6 Zeichen.' });
      var n = need(); if (n) return Promise.resolve(n);
      var email = user ? user.email : '';
      return client.auth.signInWithPassword({ email: email, password: String(current) }).then(function (res) {
        if (res.error) return { ok: false, field: 'current', error: 'Aktuelles Passwort ist nicht korrekt.' };
        return client.auth.updateUser({ password: String(next) }).then(function (r2) {
          if (r2.error) return Object.assign({ ok: false, field: 'next' }, mapAuthError(r2.error));
          user = r2.data.user; emit();
          return { ok: true };
        });
      });
    },

    changeEmail: function (nextEmail) {
      if (demo) return Promise.resolve({ ok: false, error: 'Im Demo-Konto nicht möglich.' });
      var e = String(nextEmail || '').trim();
      if (!emailEsc.test(e)) return Promise.resolve({ ok: false, error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.updateUser({ email: e }, { emailRedirectTo: appUrl() }).then(function (res) {
        if (res.error) return Object.assign({ ok: false }, mapAuthError(res.error));
        // takes effect only after the user confirms via the e-mail Supabase sends
        return { ok: true, pending: true };
      });
    },

    /* mark the active account as onboarded → leaves the empty state */
    markOnboarded: function () {
      if (demo || !client || !user) return Promise.resolve({ ok: true });
      return client.auth.updateUser({ data: { onboarded: true } }).then(function (res) {
        if (!res.error) { user = res.data.user; emit(); }
        return { ok: !res.error };
      });
    },

    logout: function () {
      demo = false; recovery = false;
      if (!client) { user = null; emit(); return Promise.resolve(); }
      return client.auth.signOut().then(function () { user = null; emit(); });
    },

    /* best-effort self-delete: needs a `delete_user` RPC in Supabase (optional);
       falls back to signing out so the account is at least left. */
    deleteAccount: function () {
      if (demo) { demo = false; emit(); return Promise.resolve(); }
      if (!client) { user = null; emit(); return Promise.resolve(); }
      return client.rpc('delete_user').catch(function () { /* RPC not set up — ignore */ })
        .then(function () { return client.auth.signOut(); })
        .then(function () { user = null; emit(); });
    },

    exportData: function () {
      var FFd = window.FF || {};
      var a = Auth.currentAccount();
      var payload = {
        exportedAt: new Date().toISOString(), app: 'FitFlow',
        account: { name: a.name, email: a.email, sport: a.sport, goal: a.goal },
        athlete: FFd.athlete || null,
        zones: { hr: FFd.hrZones || null, power: FFd.powerZones || null },
        activities: (FFd.activities || []).map(function (x) {
          return { id: x.id, sport: x.sport, date: x.date, title: x.title, durationS: x.durationS, distanceKm: x.distanceKm, tss: x.tss };
        }),
      };
      return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    },
  };

  window.FFAuth = Auth;
})();
