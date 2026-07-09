/* ============================================================================
   FitFlow — Strava integration (client side)   window.FFStrava
   ----------------------------------------------------------------------------
   Talks to the `strava` Supabase Edge Function. The Client Secret and the
   per-user OAuth tokens live ONLY on the server; the browser just:
     • connect()    → asks the function for an authorize URL, then redirects the
                      user to Strava's own consent page (their own Strava login)
     • handleReturn()→ after Strava sends them back (?strava=connected), pulls
                      their activities and stores them like any other import
     • sync()       → fetch new activities on demand / on login
     • disconnect() → drop the server-side tokens

   Every account connects its OWN Strava through the one shared app registration
   — no user ever sees a client id/secret. Synced activities go through the same
   FFImports store as FIT files, so they flow into the real metrics engine and
   sync across devices.
   ============================================================================ */
(function () {
  const CFG = window.FF_SUPABASE || {};
  const BASE = CFG.url ? CFG.url.replace(/\/+$/, '') + '/functions/v1/strava' : null;
  const KEY = 'fitflow.strava.v1';

  const emailOf = (acc) => String((acc && acc.email) || 'anon').toLowerCase();
  const keyFor = (acc) => KEY + '::' + emailOf(acc);

  function curAcc() { return (window.FFAuth && FFAuth.currentAccount && FFAuth.currentAccount()) || null; }
  // a real, cloud-backed account (not the demo/test bypasses)
  function isReal(acc) {
    acc = acc || curAcc();
    return !!(BASE && window.FFSupabase && acc && acc.email && !acc.demo && !acc.test);
  }

  function loadStatus(acc) {
    try { return JSON.parse(localStorage.getItem(keyFor(acc))) || null; } catch (e) { return null; }
  }
  function saveStatus(acc, st) {
    try { st ? localStorage.setItem(keyFor(acc), JSON.stringify(st)) : localStorage.removeItem(keyFor(acc)); } catch (e) { /* noop */ }
  }

  async function accessToken() {
    const c = window.FFSupabase;
    if (!c) return null;
    try { const { data } = await c.auth.getSession(); return data && data.session ? data.session.access_token : null; }
    catch (e) { return null; }
  }

  async function call(route, body) {
    const tok = await accessToken();
    if (!tok) throw new Error('not-signed-in');
    const res = await fetch(BASE + '/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify(body || {}),
    });
    if (res.status === 404) throw new Error('not-deployed');
    let data = null;
    try { data = await res.json(); } catch (e) { /* noop */ }
    if (!res.ok) throw new Error((data && data.error) || ('http-' + res.status));
    return data || {};
  }

  function notify(kind, title, text) {
    if (window.FFLive && FFLive.notify) FFLive.notify({ type: 'sync', icon: kind, title, text });
  }

  /* reflect the stored connection into the live integrations list (called from
     account.apply after the integrations were reset to "available"). */
  function reflectStatus(acc) {
    acc = acc || curAcc();
    if (!isReal(acc) || !window.FFLive) return;
    const st = loadStatus(acc);
    const it = FFLive.getIntegration && FFLive.getIntegration('strava');
    if (it && st && st.connected) {
      it.status = 'connected';
      it.lastSync = st.lastSync || Date.now();
      it.syncedCount = st.count || 0;
    }
  }

  const FFStrava = {
    isConfigured() { return !!BASE; },
    isReal,
    isConnected(acc) { const st = loadStatus(acc || curAcc()); return !!(st && st.connected); },
    reflectStatus,

    /* start the OAuth flow → redirect the browser to Strava */
    async connect() {
      const acc = curAcc();
      if (!isReal(acc)) { notify('alert', 'Strava nicht verfügbar', 'Bitte zuerst mit einem echten Konto anmelden.'); return { ok: false }; }
      try {
        const ret = location.origin + location.pathname;      // come back to this exact page
        const { authUrl } = await call('connect', { ret });
        if (authUrl) { location.href = authUrl; return { ok: true, redirecting: true }; }
        throw new Error('no-url');
      } catch (e) {
        const m = String(e && e.message || e);
        notify('alert', 'Strava-Verbindung fehlgeschlagen',
          m === 'not-deployed' ? 'Der Strava-Dienst ist serverseitig noch nicht eingerichtet (Edge Function „strava" fehlt).'
          : m === 'not-signed-in' ? 'Bitte melde dich zuerst an.'
          : 'Konnte die Verbindung nicht starten: ' + m + '.');
        return { ok: false, error: m };
      }
    },

    /* pull activities and persist them like any other import */
    async sync(opts) {
      opts = opts || {};
      const acc = curAcc();
      if (!isReal(acc)) return { ok: false };
      const prev = loadStatus(acc) || {};
      let r;
      try { r = await call('sync', { after: opts.full ? 0 : (prev.lastSyncEpoch || 0) }); }
      catch (e) {
        const m = String(e && e.message || e);
        if (m !== 'not-signed-in') notify('alert', 'Strava-Sync fehlgeschlagen',
          m === 'not-deployed' ? 'Der Strava-Dienst ist serverseitig noch nicht eingerichtet.' : ('Synchronisierung nicht möglich: ' + m + '.'));
        return { ok: false, error: m };
      }
      if (!r.connected) { saveStatus(acc, null); reflectStatus(acc); return { ok: false, connected: false }; }

      const list = Array.isArray(r.activities) ? r.activities : [];
      let added = 0;
      list.forEach((s) => {
        if (!window.FF || !FF.buildActivityFromStrava || !window.FFImports) return;
        const act = FF.buildActivityFromStrava(s);
        act.id = 'strava-' + String(s.id);
        const meta = { name: act.title, size: 'Strava', status: 'done', sport: act.sport,
          rows: FF.fmt ? FF.fmt.date(act.date) : '', actId: act.id };
        FFImports.add(act, meta, acc);
        added++;
      });

      const st = {
        connected: true, athlete: r.athlete || prev.athlete || null,
        lastSync: Date.now(), lastSyncEpoch: Math.floor(Date.now() / 1000),
        count: (prev.count || 0) + added,
      };
      saveStatus(acc, st);
      reflectStatus(acc);
      if (added > 0) notify('activity', 'Strava synchronisiert', added + (added === 1 ? ' neue Aktivität übernommen.' : ' neue Aktivitäten übernommen.'));
      if (window.FFLive && FFLive.touch) FFLive.touch();       // trigger a re-render → metrics recompute
      // first activities just arrived → let Root re-evaluate empty↔full so the
      // real dashboard opens automatically (no manual FIT upload / step 3 needed).
      if (added > 0 && window.FFAuth && FFAuth.refresh) FFAuth.refresh();
      return { ok: true, connected: true, added };
    },

    async disconnect() {
      const acc = curAcc();
      if (!isReal(acc)) return { ok: false };
      try { await call('disconnect', {}); } catch (e) { /* best-effort */ }
      saveStatus(acc, null);
      if (window.FFLive) { const it = FFLive.getIntegration('strava'); if (it) { it.status = 'available'; it.lastSync = null; it.syncedCount = 0; } }
      notify('link', 'Strava getrennt', 'Die automatische Synchronisierung wurde beendet. Bereits importierte Aktivitäten bleiben erhalten.');
      if (window.FFLive && FFLive.touch) FFLive.touch();
      return { ok: true };
    },

    /* handle the ?strava=connected|error return from the OAuth callback */
    handleReturn() {
      const sp = new URLSearchParams(location.search);
      const flag = sp.get('strava');
      if (!flag) return false;
      // clean the URL so a reload doesn't re-trigger
      sp.delete('strava');
      const clean = location.pathname + (sp.toString() ? '?' + sp.toString() : '') + location.hash;
      try { history.replaceState(null, '', clean); } catch (e) { /* noop */ }

      const run = () => {
        const acc = curAcc();
        if (!isReal(acc)) return;
        if (flag === 'connected') {
          notify('link', 'Strava verbunden', 'Deine Aktivitäten werden jetzt geladen …');
          FFStrava.sync({ full: true });
        } else {
          notify('alert', 'Strava-Verbindung abgebrochen', 'Die Verbindung wurde nicht abgeschlossen. Du kannst es erneut versuchen.');
        }
      };
      // wait until auth is ready + an account is present
      if (window.FFAuth && FFAuth.isReady && FFAuth.isReady() && curAcc()) { run(); }
      else if (window.FFAuth && FFAuth.subscribe) {
        const off = FFAuth.subscribe(() => { if (FFAuth.isReady() && curAcc()) { off(); run(); } });
      }
      return true;
    },
  };

  window.FFStrava = FFStrava;

  // On load: process an OAuth return, and auto-sync once for already-connected
  // accounts so new Strava activities appear without a manual click.
  function boot() {
    const returned = FFStrava.handleReturn();
    if (window.FFAuth && FFAuth.subscribe) {
      let syncedFor = null;
      FFAuth.subscribe(() => {
        const acc = curAcc();
        if (!returned && acc && isReal(acc) && FFStrava.isConnected(acc) && syncedFor !== emailOf(acc)) {
          syncedFor = emailOf(acc);
          FFStrava.sync();                                 // incremental background sync
        }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
