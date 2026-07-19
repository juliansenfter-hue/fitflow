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
  var demo = true;         // Login entfernt: App startet immer im Demo-Dashboard (ohne Anmeldung).
                           // Nur eine echte Supabase-Session (falls vorhanden) hebt den Bypass auf.
  var user = null;         // current Supabase user object (or null)
  var testUser = null;     // local „neues, leeres Konto"-Testbypass (keine echte Mail nötig)

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

  /* per-account "user chose to open the (still empty) dashboard" flag. Lets the
     Erste-Schritte-Checkliste hand off to the real dashboard on demand, even
     before any activities are imported (the dashboard then renders empty). */
  function dashOpenKey(acc) { return 'ff-dashopen::' + String((acc && acc.email) || 'anon').toLowerCase(); }

  /* the clean app URL (no hash/query) — used as the redirect target for the
     reset/confirm e-mail links. Must be listed under Supabase → Auth → Redirect URLs. */
  function appUrl() { return location.href.split('#')[0].split('?')[0]; }

  /* ---- init Supabase (graceful if the SDK/config is missing) ---- */
  if (SB && SB.createClient && CFG.url && CFG.anonKey) {
    client = SB.createClient(CFG.url, CFG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    });
    // expose the configured client so the data layer (FFImports cloud sync) can
    // read/write the user's own rows under RLS. null when no backend is set up.
    window.FFSupabase = client;
    client.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      // a real Supabase session always wins over the local bypasses
      if (session && session.user) { demo = false; testUser = null; }
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
    isLoggedIn: function () { return demo || !!testUser || !!user; },
    isEmptyAccount: function () {
      if (demo) return false;
      if (testUser) return !testUser.onboarded;
      return !!(user && !isOnboarded(user));
    },

    get: function () {
      if (demo) return { email: DEMO.email, name: DEMO.name, loggedIn: true, empty: false, demo: true };
      if (testUser) return { email: testUser.email, name: testUser.name, loggedIn: true, empty: !testUser.onboarded, demo: false, test: true };
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
      if (testUser) {
        var tm = testUser.meta || {};
        return {
          name: testUser.name, email: testUser.email,
          sport: tm.sport || '', goal: tm.goal || '',
          height: tm.height || '', weight: tm.weight || '', age: tm.age || '', sex: tm.sex || '',
          empty: !testUser.onboarded, demo: false, test: true, initials: initials(testUser.name),
        };
      }
      var m = (user && user.user_metadata) || {};
      return {
        name: nameOf(user), email: user ? user.email : '',
        sport: m.sport || '', goal: m.goal || '',
        height: m.height || '', weight: m.weight || '', age: m.age || '', sex: m.sex || '',
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

    /* third-party sign-in (Google / Apple) via Supabase OAuth.
       We build the authorize URL (skipBrowserRedirect) and pre-flight it: the
       authorize endpoint sends CORS headers, so a 302 (opaqueredirect) means the
       provider is enabled → we navigate to start the real flow; a 400 means the
       provider isn't switched on yet → we surface a friendly hint instead of
       dumping the user on a raw JSON error page. On return to appUrl() the
       onAuthStateChange handler (detectSessionInUrl) opens the session. */
    oauth: function (provider) {
      var n = need(); if (n) return Promise.resolve(n);
      var label = provider === 'apple' ? 'Apple' : 'Google';
      var notEnabled = { ok: false, error: label + '-Login ist serverseitig noch nicht aktiviert. Bitte in Supabase → Authentication → Providers den ' + label + '-Provider einschalten.' };
      return client.auth.signInWithOAuth({ provider: provider, options: { redirectTo: appUrl(), skipBrowserRedirect: true } })
        .then(function (res) {
          if (res.error || !res.data || !res.data.url) {
            return Object.assign({ ok: false }, mapAuthError(res.error || { message: 'OAuth-URL konnte nicht erzeugt werden.' }));
          }
          var url = res.data.url;
          return fetch(url, { method: 'GET', redirect: 'manual' }).then(function (r) {
            if (r.type === 'opaqueredirect' || r.status === 0 || (r.status >= 300 && r.status < 400)) {
              window.location.assign(url);            // enabled → off to the provider
              return { ok: true, redirecting: true };
            }
            if (r.status === 400 || r.status === 422) return notEnabled;
            window.location.assign(url);              // unexpected → let the provider screen decide
            return { ok: true, redirecting: true };
          }).catch(function () {
            window.location.assign(url);              // CORS/network hiccup → best-effort redirect
            return { ok: true, redirecting: true };
          });
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

    /* 6-stelligen Reset-Code aus der E-Mail prüfen → eröffnet eine Recovery-Session */
    verifyResetCode: function (email, code) {
      var n = need(); if (n) return Promise.resolve(n);
      return client.auth.verifyOtp({ email: String(email).trim(), token: String(code || '').replace(/\s/g, ''), type: 'recovery' }).then(function (res) {
        if (res.error) return { ok: false, error: 'Code ist falsch oder abgelaufen.' };
        demo = false; user = res.data.user; recovery = true; emit();
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
      if (testUser) { testUser.onboarded = true; emit(); return Promise.resolve({ ok: true }); }
      if (demo || !client || !user) return Promise.resolve({ ok: true });
      return client.auth.updateUser({ data: { onboarded: true } }).then(function (res) {
        if (!res.error) { user = res.data.user; emit(); }
        return { ok: !res.error };
      });
    },

    /* the Erste-Schritte checklist's „Dashboard öffnen" → leave the empty state
       and show the real dashboard, even without imported activities. Persists so
       a reload keeps the dashboard open, and emits so Root re-renders. */
    openDashboard: function () {
      var acc = Auth.currentAccount();
      try { localStorage.setItem(dashOpenKey(acc), '1'); } catch (e) { /* quota — ignore */ }
      emit();
      return Promise.resolve({ ok: true });
    },
    isDashboardOpen: function (acc) {
      acc = acc || Auth.currentAccount();
      if (!acc || acc.demo) return false;
      try { return !!localStorage.getItem(dashOpenKey(acc)); } catch (e) { return false; }
    },

    /* force Root to re-render and re-evaluate empty↔full — used after a background
       data change (e.g. a Strava sync that just pulled in the first activities),
       so the real dashboard opens automatically instead of staying on the checklist. */
    refresh: function () { emit(); },

    /* lokaler Test: frisches, leeres Konto simulieren → Onboarding + Video + leeres Dashboard,
       ganz ohne echte E-Mail / Supabase. */
    loginTest: function () {
      demo = false; user = null; recovery = false;
      testUser = { name: 'Test-Konto', email: 'test@fitflow.local', onboarded: false, meta: {} };
      try { localStorage.removeItem(dashOpenKey(testUser)); } catch (e) { /* noop */ }
      emit();
      return Promise.resolve({ ok: true, registered: true, empty: true, test: true });
    },

    /* Onboarding-Wizard: Profilfelder + onboarded:true in user_metadata speichern */
    completeOnboarding: function (profile) {
      profile = profile || {};
      if (testUser) { testUser.meta = Object.assign({}, testUser.meta, profile); testUser.onboarded = true; emit(); return Promise.resolve({ ok: true }); }
      if (demo) return Promise.resolve({ ok: true });
      if (!client || !user) return Promise.resolve({ ok: false });
      var data = Object.assign({}, profile, { onboarded: true });
      return client.auth.updateUser({ data: data }).then(function (res) {
        if (!res.error) { user = res.data.user; emit(); }
        return { ok: !res.error };
      });
    },

    logout: function () {
      demo = false; recovery = false; testUser = null;
      if (!client) { user = null; emit(); return Promise.resolve(); }
      return client.auth.signOut().then(function () { user = null; emit(); });
    },

    /* Real self-delete via the Supabase `delete_user` RPC (SECURITY DEFINER,
       deletes auth.uid()). Returns { ok, error }. On success the auth user is
       gone server-side and we sign the (now-invalid) session out. If the RPC
       is missing/forbidden we report it instead of faking success, so the
       account is NOT silently left behind pretending to be deleted. */
    deleteAccount: function () {
      // local bypasses (demo / empty-test account): just drop local state
      if (testUser) { testUser = null; emit(); return Promise.resolve({ ok: true, local: true }); }
      if (demo) { demo = false; emit(); return Promise.resolve({ ok: true, local: true }); }
      if (!client) { user = null; emit(); return Promise.resolve({ ok: true, local: true }); }

      function friendly(err) {
        var m = (err && (err.message || err.msg || err.error_description)) || '';
        if (/function .*delete_user.* does not exist|could not find the function|schema cache/i.test(m)) {
          return 'Die Server-Funktion „delete_user" fehlt in Supabase. Bitte das mitgelieferte SQL-Snippet im Supabase SQL-Editor ausführen.';
        }
        if (/permission denied|not authorized|jwt/i.test(m)) {
          return 'Löschen wurde vom Server abgelehnt (fehlende Berechtigung). Bitte die delete_user-Funktion + Grant prüfen.';
        }
        return 'Konto konnte nicht gelöscht werden: ' + (m || 'unbekannter Fehler') + '.';
      }

      return client.rpc('delete_user').then(function (res) {
        if (res && res.error) return { ok: false, error: friendly(res.error) };
        return client.auth.signOut().catch(function () { /* session already invalid */ })
          .then(function () { user = null; recovery = false; emit(); return { ok: true }; });
      }, function (err) {
        return { ok: false, error: friendly(err) };
      });
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
