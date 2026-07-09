/* FitFlow — persistence for user-imported activities.

   Two layers:
   1. localStorage (per account e-mail) — an instant, offline cache. hydrate()
      reads it synchronously so imports show immediately and survive reloads.
   2. Supabase table `public.activities` (RLS: each user sees only their own
      rows) — the cross-device source of truth for REAL accounts. On login we
      pullCloud() in the background, refresh the cache and re-render; on import
      we write through to the cloud. Demo/Test accounts stay local-only.

   FFAccount.apply() resets FF.activities on every Root render, then calls
   FFImports.hydrate(acc) — which re-injects the persisted imports on top.
   Because apply() rebuilds the base list each time, hydrate() can unshift
   unconditionally without ever accumulating duplicates. */
(function () {
  if (!window.FF) return;

  const KEY = 'fitflow.imports.v1';
  const TABLE = 'activities';
  // pristine seed of the demo "Letzte Importe" list, restored for the demo account
  const SEED_RECENT = (FF.recentImports || []).slice();

  function emailOf(acc) {
    acc = acc || (window.FFAuth && FFAuth.currentAccount && FFAuth.currentAccount());
    return String((acc && acc.email) || 'anon').toLowerCase();
  }
  function keyFor(acc) { return KEY + '::' + emailOf(acc); }

  // a real, cloud-synced account = logged-in Supabase user (not demo/test bypass)
  function db() { return window.FFSupabase || null; }
  function isCloud(acc) { return !!(db() && acc && acc.email && !acc.demo && !acc.test); }

  function reviveEntry(e) { if (e && e.activity && e.activity.date) e.activity.date = new Date(e.activity.date); return e; }

  function load(acc) {
    try {
      const raw = JSON.parse(localStorage.getItem(keyFor(acc))) || [];
      raw.forEach(reviveEntry);
      return Array.isArray(raw) ? raw : [];
    } catch (e) { return []; }
  }
  function saveList(acc, list) {
    try { localStorage.setItem(keyFor(acc), JSON.stringify(list)); } catch (e) { /* quota/serialise — ignore */ }
  }

  const FFImports = {
    /* persist a freshly imported activity + its display row */
    add(activity, metaRow, acc) {
      if (!activity) return activity;
      acc = acc || (window.FFAuth && FFAuth.currentAccount && FFAuth.currentAccount());
      let list = load(acc);
      // dedupe by activity id so a re-run (e.g. a repeated Strava sync) replaces
      // the existing entry instead of stacking a duplicate.
      if (activity.id != null) list = list.filter((e) => !(e && e.activity && e.activity.id === activity.id));
      const entry = { activity, meta: metaRow || null };
      list.unshift(entry);
      saveList(acc, list);
      // write through to the cloud for real accounts (best-effort; local copy
      // already saved, so an offline/failed upload never loses the import)
      if (isCloud(acc)) {
        try {
          db().from(TABLE).upsert({ id: activity.id, data: entry }, { onConflict: 'id' }).then(function (res) {
            if (res && res.error && window.FFLive) {
              window.FFLive.notify({ type: 'import', icon: 'alert', title: 'Cloud-Sync ausstehend',
                text: 'Import ist lokal gespeichert, konnte aber noch nicht synchronisiert werden.' });
            }
          });
        } catch (e) { /* SDK missing — local copy stands */ }
      }
      return activity;
    },

    /* re-inject persisted imports into the live dataset (called from FFAccount.apply) */
    hydrate(acc) {
      const list = load(acc);
      // unshift in reverse so the newest import ends up first in FF.activities
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i] && list[i].activity) FF.activities.unshift(list[i].activity);
      }
      const rows = list.map((e) => e.meta).filter(Boolean);
      const seed = (acc && acc.demo) ? SEED_RECENT : [];
      FF.recentImports = rows.concat(seed);
      return list.length;
    },

    /* pull the account's activities from Supabase, refresh the local cache and
       upload any local-only imports. Resolves true if the cache changed (so the
       caller can trigger a re-render). No-op for demo/local accounts. */
    pullCloud(acc) {
      acc = acc || (window.FFAuth && FFAuth.currentAccount && FFAuth.currentAccount());
      if (!isCloud(acc)) return Promise.resolve(false);
      const local = load(acc);
      return db().from(TABLE).select('id,data,created_at').order('created_at', { ascending: false })
        .then(function (res) {
          if (!res || res.error || !Array.isArray(res.data)) return false;
          const cloud = res.data.map(function (r) { return reviveEntry(Object.assign({}, r.data)); })
            .filter(function (e) { return e && e.activity; });
          const cloudIds = new Set(cloud.map(function (e) { return e.activity.id; }));

          // local-only imports (not yet in the cloud) → upload them, keep in list
          const localOnly = local.filter(function (e) { return e && e.activity && !cloudIds.has(e.activity.id); });
          localOnly.forEach(function (e) {
            try { db().from(TABLE).upsert({ id: e.activity.id, data: e }, { onConflict: 'id' }); } catch (x) { /* noop */ }
          });

          // merged view: cloud (source of truth) + still-unsynced local, newest first
          const merged = localOnly.concat(cloud);
          const before = JSON.stringify(local.map(function (e) { return e.activity && e.activity.id; }));
          const after = JSON.stringify(merged.map(function (e) { return e.activity && e.activity.id; }));
          saveList(acc, merged);
          return before !== after;
        })
        .catch(function () { return false; });
    },

    /* wipe a user's imports locally + in the cloud (e.g. on account deletion) */
    clear(acc) {
      try { localStorage.removeItem(keyFor(acc)); } catch (e) { /* noop */ }
      if (isCloud(acc)) { try { db().from(TABLE).delete().not('id', 'is', null); } catch (e) { /* noop */ } }
      FF.recentImports = (acc && acc.demo) ? SEED_RECENT.slice() : [];
    },

    /* drop all imports whose activity id starts with `prefix` (e.g. 'strava-'),
       locally and in the cloud. Used before a full re-sync so an earlier, larger
       import (e.g. the old 400) doesn't linger next to the fresh newest-N set. */
    dropByPrefix(acc, prefix) {
      const list = load(acc);
      const drop = list.filter((e) => e && e.activity && String(e.activity.id).indexOf(prefix) === 0);
      if (!drop.length) return 0;
      const keep = list.filter((e) => !(e && e.activity && String(e.activity.id).indexOf(prefix) === 0));
      saveList(acc, keep);
      if (isCloud(acc)) { try { db().from(TABLE).delete().in('id', drop.map((e) => e.activity.id)); } catch (e) { /* noop */ } }
      return drop.length;
    },

    isCloud: isCloud,
    count(acc) { return load(acc).length; },
  };

  window.FFImports = FFImports;
})();
