/* FitFlow — persistence for user-imported activities.
   Imported FIT/CSV activities are stored in localStorage, namespaced per
   account e-mail, so they survive a reload (device-local; no cross-device
   sync without a backend). Loaded AFTER data.js/store.js/account.js.

   FFAccount.apply() resets FF.activities on every Root render, then calls
   FFImports.hydrate(acc) — which re-injects the persisted imports on top.
   Because apply() rebuilds the base list each time, hydrate() can unshift
   unconditionally without ever accumulating duplicates. */
(function () {
  if (!window.FF) return;

  const KEY = 'fitflow.imports.v1';
  // pristine seed of the demo "Letzte Importe" list, restored for the demo account
  const SEED_RECENT = (FF.recentImports || []).slice();

  function emailOf(acc) {
    acc = acc || (window.FFAuth && FFAuth.currentAccount && FFAuth.currentAccount());
    return String((acc && acc.email) || 'anon').toLowerCase();
  }
  function keyFor(acc) { return KEY + '::' + emailOf(acc); }

  function load(acc) {
    try {
      const raw = JSON.parse(localStorage.getItem(keyFor(acc))) || [];
      raw.forEach((e) => { if (e.activity && e.activity.date) e.activity.date = new Date(e.activity.date); });
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
      const list = load(acc);
      list.unshift({ activity, meta: metaRow || null });
      saveList(acc, list);
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

    /* wipe a user's imports (e.g. on account deletion) */
    clear(acc) {
      try { localStorage.removeItem(keyFor(acc)); } catch (e) { /* noop */ }
      FF.recentImports = (acc && acc.demo) ? SEED_RECENT.slice() : [];
    },

    count(acc) { return load(acc).length; },
  };

  window.FFImports = FFImports;
})();
