/* ============================================================================
   FitFlow — Datenzugriffsschicht  (window.FitFlowAPI)
   ----------------------------------------------------------------------------
   DIES IST DIE EINE NAHTSTELLE zwischen App und Daten.

   Alle Bildschirme holen ihre Daten ausschließlich über diese Schicht. Heute
   liefert sie Mock-Daten (aus data.js / store.js). Sobald ein echtes Backend
   existiert, wird KEIN Screen angefasst — es reicht, hier den Modus auf
   'live' zu stellen und die baseUrl zu setzen:

       FitFlowAPI.useLive('https://dein-backend.example/api')

   Jede Methode hat zwei Zweige:
     • mode === 'mock'  → delegiert an die bestehende Prototyp-Logik
     • mode === 'live'  → echter fetch() gegen das Backend (Vertrag s. unten)

   Der vollständige Backend-Vertrag (Endpunkte, Datenmodell, OAuth-Flow) steht
   in »FitFlow - Backend-Bauanleitung.html«.
   ============================================================================ */
(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     KONFIGURATION  (in localStorage gespiegelt, damit der Modus Reloads übersteht)
     ---------------------------------------------------------------------- */
  const CFG_KEY = 'fitflow.api.config.v1';
  const DEFAULTS = {
    mode: 'mock',                 // 'mock' | 'live'
    baseUrl: '/api',              // Wurzel aller Endpunkte im Live-Modus
    token: null,                  // Bearer-Token / Session (nach Login gesetzt)
  };
  function loadCfg() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(CFG_KEY)) || {}); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveCfg() {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(CONFIG)); } catch (e) { /* noop */ }
  }
  const CONFIG = loadCfg();
  const isLive = () => CONFIG.mode === 'live';

  /* ----------------------------------------------------------------------
     HTTP-HELFER (nur Live-Modus). Hängt Auth-Header & baseUrl an, wirft bei Fehler.
     ---------------------------------------------------------------------- */
  async function request(path, opts) {
    opts = opts || {};
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      CONFIG.token ? { Authorization: 'Bearer ' + CONFIG.token } : {},
      opts.headers || {}
    );
    const res = await fetch(CONFIG.baseUrl + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body != null ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch (e) { /* noop */ }
      throw new Error(`FitFlowAPI ${res.status} ${res.statusText} @ ${path}${detail ? ' — ' + detail : ''}`);
    }
    return res.status === 204 ? null : res.json();
  }
  // FormData-Upload (Datei-Import) — ohne JSON-Content-Type
  async function upload(path, formData) {
    const res = await fetch(CONFIG.baseUrl + path, {
      method: 'POST',
      headers: CONFIG.token ? { Authorization: 'Bearer ' + CONFIG.token } : {},
      body: formData,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`FitFlowAPI upload ${res.status} @ ${path}`);
    return res.json();
  }

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ----------------------------------------------------------------------
     DATUM-WIEDERBELEBUNG — das Backend liefert ISO-Strings, die App erwartet
     echte Date-Objekte (wie data.js sie erzeugt). Wandelt die bekannten Felder.
     ---------------------------------------------------------------------- */
  function reviveDates(data) {
    if (!data) return data;
    const d = (s) => (s ? new Date(s) : s);
    if (Array.isArray(data.load)) data.load.forEach((x) => { x.date = d(x.date); });
    if (Array.isArray(data.activities)) data.activities.forEach((a) => { a.date = d(a.date); });
    if (data.recovery && Array.isArray(data.recovery.history)) data.recovery.history.forEach((h) => { h.date = d(h.date); });
    if (data.todayLoad) data.todayLoad.date = d(data.todayLoad.date);
    return data;
  }

  /* ----------------------------------------------------------------------
     LIVE → APP MAPPING. Überschreibt die DATEN-Felder auf window.FF, lässt aber
     die HELFER (fmt, projectForm, buildImportedActivity, addDays …) intakt.
     ---------------------------------------------------------------------- */
  const DATA_FIELDS = ['athlete', 'hrZones', 'powerZones', 'load', 'todayLoad', 'fitnessScore',
    'risk', 'recovery', 'reco', 'activities', 'sportMeta', 'week', 'annual', 'months',
    'planner', 'integrations', 'recentImports', 'notifications'];
  function applyBootstrap(data) {
    reviveDates(data);
    DATA_FIELDS.forEach((k) => { if (k in data) window.FF[k] = data[k]; });
    if (window.FFLive && typeof window.FFLive.hydrate === 'function') window.FFLive.hydrate(data);
    return window.FF;
  }

  /* ======================================================================
     ÖFFENTLICHE API
     ====================================================================== */
  const API = {
    /* ---- Konfiguration / Modus ---------------------------------------- */
    config: CONFIG,
    get mode() { return CONFIG.mode; },
    setConfig(partial) { Object.assign(CONFIG, partial); saveCfg(); return CONFIG; },
    useMock() { return API.setConfig({ mode: 'mock' }); },
    useLive(baseUrl) { return API.setConfig({ mode: 'live', baseUrl: baseUrl || CONFIG.baseUrl }); },
    setToken(token) { return API.setConfig({ token: token }); },

    /* ---- AUTH ---------------------------------------------------------
       Live-Vertrag:
         POST /auth/signup   { email, password, name } -> { token, athlete }
         POST /auth/login    { email, password }        -> { token, athlete }
         POST /auth/logout                              -> 204
         GET  /auth/session                             -> { athlete } | 401
    ------------------------------------------------------------------- */
    async signup({ email, password, name }) {
      if (isLive()) {
        const r = await request('/auth/signup', { method: 'POST', body: { email, password, name } });
        API.setToken(r.token); return r;
      }
      await delay(300);
      API.setToken('mock-token'); return { token: 'mock-token', athlete: window.FF.athlete };
    },
    async login({ email, password }) {
      if (isLive()) {
        const r = await request('/auth/login', { method: 'POST', body: { email, password } });
        API.setToken(r.token); return r;
      }
      await delay(300);
      API.setToken('mock-token'); return { token: 'mock-token', athlete: window.FF.athlete };
    },
    async logout() {
      if (isLive()) { try { await request('/auth/logout', { method: 'POST' }); } catch (e) { /* noop */ } }
      API.setToken(null); return true;
    },
    async session() {
      if (isLive()) return request('/auth/session');
      return { athlete: window.FF.athlete };
    },

    /* ---- BOOTSTRAP ----------------------------------------------------
       Holt das komplette Anfangs-Dataset des angemeldeten Athleten in EINEM
       Aufruf. Genau dieses Objekt erwartet die App (Felder s. DATA_FIELDS).
         Live:  GET /bootstrap -> { athlete, load, activities, recovery, … }
    ------------------------------------------------------------------- */
    async bootstrap() {
      if (isLive()) {
        const data = await request('/bootstrap');
        return applyBootstrap(data);
      }
      // Mock: data.js hat window.FF bereits synchron vollständig aufgebaut.
      await delay(120);
      return window.FF;
    },

    /* ---- AKTIVITÄTEN --------------------------------------------------
         Live:  GET  /activities?limit=&offset=&sport= -> Activity[]
                GET  /activities/:id                   -> Activity (inkl. streams)
    ------------------------------------------------------------------- */
    async getActivities(params) {
      params = params || {};
      if (isLive()) {
        const q = new URLSearchParams(params).toString();
        return request('/activities' + (q ? '?' + q : ''));
      }
      await delay(60);
      let list = window.FF.activities.slice();
      if (params.sport) list = list.filter((a) => a.sport === params.sport);
      const off = params.offset || 0;
      return params.limit ? list.slice(off, off + params.limit) : list;
    },
    async getActivity(id) {
      if (isLive()) return request('/activities/' + encodeURIComponent(id));
      await delay(40);
      return window.FF.activities.find((a) => a.id === id) || null;
    },

    /* ---- TRAININGSLAST & RISIKO --------------------------------------
       CTL(42)/ATL(7)/TSB sowie ACWR(7:28) werden serverseitig aus den
       Aktivitäten berechnet (Formeln s. data.js / Bauanleitung).
         Live:  GET /load?days=     -> LoadPoint[]
                GET /risk           -> { acwr, acute, chronic, band, … }
    ------------------------------------------------------------------- */
    async getLoadSeries(params) {
      params = params || {};
      if (isLive()) {
        const q = new URLSearchParams(params).toString();
        return request('/load' + (q ? '?' + q : ''));
      }
      await delay(40);
      const days = params.days;
      return days ? window.FF.load.slice(-days) : window.FF.load;
    },
    async getRisk() {
      if (isLive()) return request('/risk');
      await delay(20); return window.FF.risk;
    },

    /* ---- ERHOLUNG / RECOVERY -----------------------------------------
       HRV, Schlaf, Ruhepuls. Quelle real: Apple Health (nur via iOS-App),
       Garmin/Whoop o. manuelle Eingabe — s. Bauanleitung.
         Live:  GET /recovery -> { score, hrv, rhr, sleep, history, … }
    ------------------------------------------------------------------- */
    async getRecovery() {
      if (isLive()) return request('/recovery');
      await delay(20); return window.FF.recovery;
    },

    /* ---- MORGEN-CHECK (Readiness) ------------------------------------
         Live:  GET  /checkins/:date           -> { sleep, legs, stress, time } | null
                PUT  /checkins/:date  { … }     -> gespeicherter Check-in
    ------------------------------------------------------------------- */
    async getCheckin(dateISO) {
      if (isLive()) return request('/checkins/' + dateISO);
      try { const s = localStorage.getItem('ff-checkin-' + dateISO); return s ? JSON.parse(s) : null; }
      catch (e) { return null; }
    },
    async saveCheckin(dateISO, checkin) {
      if (isLive()) return request('/checkins/' + dateISO, { method: 'PUT', body: checkin });
      try { localStorage.setItem('ff-checkin-' + dateISO, JSON.stringify(checkin)); } catch (e) { /* noop */ }
      return checkin;
    },

    /* ---- KI-EMPFEHLUNG -----------------------------------------------
       Heute regelbasiert (im Screen). Live: serverseitige Engine / LLM, die
       Recovery + TSB + Check-in als Kontext bekommt.
         Live:  POST /recommendation { checkin } -> { headline, focus, tssLo, tssHi, text, … }
    ------------------------------------------------------------------- */
    async getRecommendation(checkin) {
      if (isLive()) return request('/recommendation', { method: 'POST', body: { checkin } });
      await delay(50); return window.FF.reco;
    },

    /* ---- FORM-SIMULATOR ----------------------------------------------
       Projiziert CTL/ATL/TSB ab heute. Reine Berechnung — bleibt clientseitig
       sinnvoll; das Backend liefert nur den Startpunkt (todayLoad).
    ------------------------------------------------------------------- */
    projectForm(weeklyTss, weeks, taper) {
      return window.FF.projectForm(weeklyTss, weeks, taper);
    },

    /* ---- DATEI-IMPORT (FIT / GPX / CSV) ------------------------------
       Live: Datei wird hochgeladen, das Backend parst sie (z.B. fit-file-parser),
       rechnet Telemetrie + TSS und legt die Aktivität an.
         POST /imports  (multipart: file) -> { activity, meta }
    ------------------------------------------------------------------- */
    async importActivityFile(file, opts) {
      opts = opts || {};
      const fname = (file && file.name) || opts.fileName || `aktivitaet_${Date.now()}.fit`;
      if (isLive()) {
        const fd = new FormData();
        if (file) fd.append('file', file);
        else fd.append('fileName', fname);
        const r = await upload('/imports', fd);
        reviveDates({ activities: [r.activity] });
        window.FFLive.addActivity(r.activity);
        window.FFLive.notify({ type: 'import', icon: r.activity.sport, title: 'Import abgeschlossen',
          text: `${r.activity.title} · ${r.activity.tss} TSS übernommen.`, actId: r.activity.id });
        return r;
      }
      // Mock: rekonstruiere eine plausible Aktivität (wie bisher)
      await delay(250);
      const act = window.FF.buildImportedActivity({ fileName: fname, sport: opts.sport });
      window.FFLive.addActivity(act);
      window.FFLive.notify({ type: 'import', icon: act.sport, title: 'Import abgeschlossen',
        text: `${act.title} · ${act.tss} TSS · in die Diagnostik übernommen.`, actId: act.id });
      const rows = act.sport === 'lift'
        ? `${20 + Math.floor(Math.random() * 20)} Sätze`
        : `${(2500 + Math.floor(Math.random() * 3500)).toLocaleString('de-DE')} Datenpunkte`;
      const size = act.sport === 'lift'
        ? `${30 + Math.floor(Math.random() * 22)}\u2009KB`
        : `${(0.9 + Math.random() * 1.4).toFixed(1).replace('.', ',')}\u2009MB`;
      return { activity: act, meta: { name: fname, size, rows, status: 'done' } };
    },

    /* ---- INTEGRATIONEN  (Strava zuerst) ------------------------------
       Echte OAuth-Anbindungen brauchen ein Backend, das das Client-Secret hält.
         Live (verbinden, OAuth-Redirect):
                GET  /integrations/:provider/connect    -> { authUrl }
                (Provider-Consent → Callback → Backend tauscht Code gegen Token)
         Live (synchronisieren / trennen):
                POST /integrations/:provider/sync       -> { imported: Activity[] }
                DELETE /integrations/:provider          -> 204
                GET  /integrations                      -> Integration[]
    ------------------------------------------------------------------- */
    async listIntegrations() {
      if (isLive()) return request('/integrations');
      return window.FFLive.integrations;
    },
    async connectIntegration(provider) {
      if (isLive()) {
        const { authUrl } = await request('/integrations/' + provider + '/connect');
        window.location.href = authUrl;       // → Provider-Zustimmungsseite
        return { redirecting: true };
      }
      await delay(650);
      const made = window.FFLive.connectIntegration(provider);
      return { connected: true, imported: made };
    },
    async syncIntegration(provider) {
      if (isLive()) {
        const r = await request('/integrations/' + provider + '/sync', { method: 'POST' });
        (r.imported || []).forEach((a) => { reviveDates({ activities: [a] }); window.FFLive.addActivity(a); });
        return r;
      }
      await delay(550);
      const made = window.FFLive.syncIntegration(provider);
      return { imported: made };
    },
    async disconnectIntegration(provider) {
      if (isLive()) { await request('/integrations/' + provider, { method: 'DELETE' }); }
      else { await delay(200); }
      window.FFLive.disconnectIntegration(provider);
      return { disconnected: true };
    },

    /* ---- PLANUNG  (Woche + Saison) -----------------------------------
         Live:  GET    /plan/sessions?from=&to=     -> PlannedSession[]
                POST   /plan/sessions  { date, … }  -> PlannedSession
                PATCH  /plan/sessions/:id { … }     -> PlannedSession
                DELETE /plan/sessions/:id           -> 204
                POST   /plan/events  { name, date, type } -> TargetEvent
                PUT    /plan/annual  { loadSegs, … }      -> gespeicherter Plan
    ------------------------------------------------------------------- */
    async getPlannedSessions(range) {
      if (isLive()) {
        const q = new URLSearchParams(range || {}).toString();
        return request('/plan/sessions' + (q ? '?' + q : ''));
      }
      await delay(30); return window.FF.planner.sessions;
    },
    async addPlannedSession(dateISO, session) {
      if (isLive()) return request('/plan/sessions', { method: 'POST', body: Object.assign({ date: dateISO }, session) });
      await delay(120); return Object.assign({ id: 'ps' + Date.now(), date: dateISO }, session);
    },
    async updatePlannedSession(id, patch) {
      if (isLive()) return request('/plan/sessions/' + id, { method: 'PATCH', body: patch });
      await delay(80); return Object.assign({ id }, patch);
    },
    async deletePlannedSession(id) {
      if (isLive()) return request('/plan/sessions/' + id, { method: 'DELETE' });
      await delay(60); return true;
    },
    async addTargetEvent(event) {
      if (isLive()) return request('/plan/events', { method: 'POST', body: event });
      await delay(100); return Object.assign({ id: 'ev' + Date.now() }, event);
    },
    async saveAnnualPlan(plan) {
      if (isLive()) return request('/plan/annual', { method: 'PUT', body: plan });
      try { localStorage.setItem('ff-annual-plan', JSON.stringify(plan)); } catch (e) { /* noop */ }
      return plan;
    },

    /* ---- PROFIL & ZONEN ----------------------------------------------
         Live:  PUT /athlete  { name, weight, ftp, thrHr, … } -> Athlete
    ------------------------------------------------------------------- */
    async updateProfile(profile) {
      if (isLive()) return request('/athlete', { method: 'PUT', body: profile });
      await delay(120); Object.assign(window.FF.athlete, profile); return window.FF.athlete;
    },

    /* ---- BENACHRICHTIGUNGEN ------------------------------------------
         Live:  GET  /notifications                -> Notification[]
                POST /notifications/:id/read        -> 204
                POST /notifications/read-all        -> 204
    ------------------------------------------------------------------- */
    async listNotifications() {
      if (isLive()) return request('/notifications');
      return window.FFLive.notifications;
    },
    async markNotificationRead(id) {
      if (isLive()) { try { await request('/notifications/' + id + '/read', { method: 'POST' }); } catch (e) { /* noop */ } }
      window.FFLive.markRead(id); return true;
    },
    async markAllNotificationsRead() {
      if (isLive()) { try { await request('/notifications/read-all', { method: 'POST' }); } catch (e) { /* noop */ } }
      window.FFLive.markAllRead(); return true;
    },
  };

  window.FitFlowAPI = API;
})();
