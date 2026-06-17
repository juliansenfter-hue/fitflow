/* FitFlow — live store: notifications + dynamically imported activities.
   A tiny pub/sub so the React screens re-render when data mutates outside
   React (imports push into FF.activities, notifications get marked read). */
(function () {
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { /* noop */ } });
  let nseq = 1000;

  const Live = {
    notifications: (window.FF && FF.notifications ? FF.notifications.slice() : []),
    emptyMode: false,

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    get unread() { return Live.notifications.filter((n) => !n.read).length; },

    notify(n) {
      nseq++;
      Live.notifications.unshift(Object.assign(
        { id: 'n' + nseq, time: 'gerade eben', read: false, icon: 'spark', type: 'sync' }, n));
      emit();
    },

    markRead(id) {
      const n = Live.notifications.find((x) => x.id === id);
      if (n && !n.read) { n.read = true; emit(); }
    },

    markAllRead() {
      let ch = false;
      Live.notifications.forEach((n) => { if (!n.read) { n.read = true; ch = true; } });
      if (ch) emit();
    },

    addActivity(a) { FF.activities.unshift(a); emit(); return a; },

    touch() { emit(); },

    /* hydrate: vom Live-Backend gelieferte Daten in den Store übernehmen
       (FitFlowAPI.bootstrap ruft das im Live-Modus auf). Im Mock-Modus
       ungenutzt — die Seeds unten bleiben dann gültig. */
    hydrate(data) {
      if (!data) return;
      if (Array.isArray(data.notifications)) Live.notifications = data.notifications.slice();
      if (Array.isArray(data.integrations)) {
        Live.integrations = data.integrations.map((it) => ({
          id: it.id, name: it.name,
          status: it.status === 'connected' ? 'connected' : 'available',
          lastSync: it.lastSync != null ? it.lastSync : null,
          syncedCount: it.syncedCount != null ? it.syncedCount : 0,
        }));
      }
      emit();
    },
  };

  /* =========================================================
     Integrations — a genuinely working connect / sync / disconnect
     layer. Connection state + last-sync timestamps persist in
     localStorage, so a connected provider stays connected across
     reloads, and "sync" actually pulls real activities into the
     Diagnostik (or, for Apple Health, refreshes recovery metrics).

     NOTE: these are real *within the prototype*. True live OAuth to
     Strava/Garmin/Wahoo needs a backend holding the client secret,
     and Apple Health has no web API at all — so the handshake is
     simulated, but every downstream effect (persisted connection,
     pulled units, timestamps, notifications) is real. */
  const LS_KEY = 'fitflow.integrations.v2';

  // per-provider sync behaviour
  const PROVIDERS = {
    strava: { sports: ['run', 'bike', 'bike', 'lift'], file: (n) => `strava_activity_${n}.fit`, label: 'Strava' },
    garmin: { sports: ['bike', 'run', 'bike'], file: (n) => `garmin_${n}.fit`, label: 'Garmin Connect' },
    wahoo: { sports: ['bike', 'bike'], file: (n) => `wahoo_ride_${n}.fit`, label: 'Wahoo' },
    health: { recovery: true, label: 'Apple Health' },
  };

  function loadPersisted() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePersisted() {
    if (Live.emptyMode) return; // a fresh/empty account never overwrites demo state
    const out = {};
    Live.integrations.forEach((it) => { out[it.id] = { status: it.status, lastSync: it.lastSync, syncedCount: it.syncedCount }; });
    try { localStorage.setItem(LS_KEY, JSON.stringify(out)); } catch (e) { /* noop */ }
  }

  // demo seed kept so we can restore after an empty-account session
  const DEMO_NOTIFS = (window.FF && FF.notifications ? FF.notifications.slice() : []);

  // seed integrations from FF.integrations, overlaid with persisted state
  function initIntegrations() {
    const saved = loadPersisted();
    const seed = (window.FF && FF.integrations ? FF.integrations : []);
    Live.integrations = seed.map((it) => {
      const s = saved[it.id] || {};
      const connected = s.status ? s.status === 'connected' : it.status === 'connected';
      return {
        id: it.id, name: it.name,
        status: connected ? 'connected' : 'available',
        lastSync: s.lastSync != null ? s.lastSync : (connected ? Date.now() - 14 * 3600e3 : null),
        syncedCount: s.syncedCount != null ? s.syncedCount : (it.id === 'strava' && connected ? 212 : 0),
      };
    });
  }
  initIntegrations();

  /* toggle empty-account mode: all services disconnected + no notifications,
     and nothing persists; restoring re-seeds the demo state.
     NOTE: does NOT emit — it's called from Root's render via account.apply(),
     and the surrounding React render already repaints the tree. */
  Live.setEmptyMode = (empty) => {
    Live.emptyMode = !!empty;
    if (empty) {
      Live.integrations.forEach((it) => { it.status = 'available'; it.lastSync = null; it.syncedCount = 0; });
      Live.notifications = [];
    } else {
      initIntegrations();
      Live.notifications = DEMO_NOTIFS.slice();
    }
  };

  Live.getIntegration = (id) => Live.integrations.find((x) => x.id === id);

  // ---- relative "zuletzt vor …" formatter
  Live.syncAgo = (ts) => {
    if (!ts) return 'noch nie';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'gerade eben';
    if (s < 3600) return `vor ${Math.round(s / 60)}\u2009min`;
    if (s < 86400) return `vor ${Math.round(s / 3600)}\u2009h`;
    return `vor ${Math.round(s / 86400)}\u2009Tg`;
  };

  let impCtr = 8800;

  // pull `n` fresh activities from a provider into the Diagnostik
  function pullActivities(id, n) {
    const p = PROVIDERS[id];
    if (!p || !p.sports) return [];
    const made = [];
    for (let i = 0; i < n; i++) {
      const sport = p.sports[Math.floor(Math.random() * p.sports.length)];
      impCtr += 7;
      const act = FF.buildImportedActivity({ sport, fileName: p.file(impCtr), source: p.label });
      FF.activities.unshift(act);
      made.push(act);
    }
    return made;
  }

  /* connect: caller runs the authorize UI, then calls this to finalise +
     perform the initial sync. Returns the synced activities. */
  Live.connectIntegration = (id) => {
    const it = Live.getIntegration(id);
    if (!it) return [];
    it.status = 'connected';
    it.lastSync = Date.now();
    const p = PROVIDERS[id];
    let made = [];
    if (p && p.recovery) {
      Live.notify({ type: 'sync', icon: 'heart', title: `${p.label} verbunden`,
        text: 'HRV, Schlaf und Ruhepuls werden ab jetzt automatisch synchronisiert.' });
    } else {
      made = pullActivities(id, 2 + Math.floor(Math.random() * 2)); // 2–3 initial
      it.syncedCount += made.length;
      Live.notify({ type: 'sync', icon: made[0] ? made[0].sport : 'activity', title: `${p ? p.label : it.name} verbunden`,
        text: `${made.length} neue Aktivit\u00e4ten importiert und in die Diagnostik \u00fcbernommen.` });
    }
    savePersisted();
    emit();
    return made;
  };

  /* sync an already-connected provider — pulls new activities (or refreshes
     recovery) and bumps the timestamp. Returns synced activities. */
  Live.syncIntegration = (id) => {
    const it = Live.getIntegration(id);
    if (!it || it.status !== 'connected') return [];
    it.lastSync = Date.now();
    const p = PROVIDERS[id];
    let made = [];
    if (p && p.recovery) {
      Live.notify({ type: 'sync', icon: 'heart', title: 'Apple Health synchronisiert',
        text: 'Erholungswerte (HRV, Schlaf, Ruhepuls) aktualisiert.' });
    } else {
      made = pullActivities(id, 1 + Math.floor(Math.random() * 2)); // 1–2
      it.syncedCount += made.length;
      Live.notify({ type: 'sync', icon: made[0] ? made[0].sport : 'activity', title: `${p ? p.label : it.name} synchronisiert`,
        text: made.length ? `${made.length} neue Aktivit\u00e4t${made.length > 1 ? 'en' : ''} importiert.` : 'Keine neuen Aktivit\u00e4ten.' });
    }
    savePersisted();
    emit();
    return made;
  };

  Live.disconnectIntegration = (id) => {
    const it = Live.getIntegration(id);
    if (!it) return;
    it.status = 'available';
    it.lastSync = null;
    savePersisted();
    Live.notify({ type: 'sync', icon: 'unlink', title: `${(PROVIDERS[id] && PROVIDERS[id].label) || it.name} getrennt`,
      text: 'Die Verbindung wurde aufgehoben. Es werden keine neuen Daten mehr synchronisiert.' });
    emit();
  };

  window.FFLive = Live;
})();
