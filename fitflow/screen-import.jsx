/* FitFlow — Import & Sync */
(function () {
  const { createElement: h, useState, useRef, useEffect, Fragment } = React;
  const { Card, Stat, AiInsight, SportIcon } = window.UI;
  const Icon = window.Icon;
  const fmt = FF.fmt;

  const BRAND = {
    strava: { c: '#fc4c02', glyph: 'S' }, health: { c: '#fb3a52', glyph: '♥' },
    garmin: { c: '#0a9bdc', glyph: 'G' }, wahoo: { c: '#1f8efa', glyph: 'W' },
  };

  function Integration({ it, onToggle, busy }) {
    const b = BRAND[it.id];
    const connected = it.status === 'connected';
    return h('div', { style: {
      display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
      background: 'var(--panel-2)', border: '1px solid var(--line)', borderRadius: 12,
    } },
      h('div', { style: { width: 42, height: 42, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `color-mix(in srgb, ${b.c} 18%, transparent)`, color: b.c, fontWeight: 800, fontSize: 19 } }, b.glyph),
      h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
        h('div', { className: 'row center gap-8' },
          h('span', { className: 'strong', style: { fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' } }, it.name),
          connected && h('span', { className: 'row center gap-4', style: { fontSize: 10.5, color: 'var(--good)', fontWeight: 600 } }, h('span', { style: { width: 6, height: 6, borderRadius: 99, background: 'var(--good)' } }), 'Verbunden')),
        h('span', { style: { fontSize: 12, color: 'var(--text-2)' } }, it.detail),
        h('span', { style: { fontSize: 11, color: 'var(--text-4)' } }, it.sub)),
      h('button', { className: 'btn btn--sm ' + (connected ? 'btn--ghost' : 'btn--primary'), onClick: onToggle, disabled: busy },
        busy ? '…' : connected ? 'Trennen' : 'Verbinden'));
  }

  /* statische Anzeige-Beschreibung je Provider; Live-Status kommt aus FFLive */
  const PROVIDER_DESC = {
    strava: 'Auto-Sync \u00b7 Aktivit\u00e4ten & Telemetrie',
    health: 'HRV, Schlaf & Ruhepuls',
    garmin: 'FIT-Dateien & Telemetrie',
    wahoo: 'Power-Trainings importieren',
  };

  function ImportSync({ onOpenActivity }) {
    const Live = window.FFLive;
    const API = window.FitFlowAPI;
    const [, bump] = useState(0);
    useEffect(() => Live.subscribe(() => bump((n) => n + 1)), []);
    const [imports, setImports] = useState(FF.recentImports);
    const [drag, setDrag] = useState(false);
    const [job, setJob] = useState(null); // {name, pct}
    const [busy, setBusy] = useState(null); // integration id mid-connect
    const [lastImported, setLastImported] = useState(null);
    const fileRef = useRef(null);

    // live integration list -> display objects (status/sub derived from the store)
    const integrations = Live.integrations.map((it) => {
      const connected = it.status === 'connected';
      return {
        id: it.id, name: it.name, status: it.status,
        detail: PROVIDER_DESC[it.id] || '',
        sub: connected
          ? (it.syncedCount ? `${it.syncedCount} Aktivit\u00e4ten \u00b7 zuletzt ${Live.syncAgo(it.lastSync)}` : `Aktualisiert ${Live.syncAgo(it.lastSync)}`)
          : 'Nicht verbunden',
      };
    });

    /* Datei-Import l\u00e4uft \u00fcber die Datenschicht: im Mock wird eine plausible
       Aktivit\u00e4t rekonstruiert, im Live-Modus parst das Backend die echte Datei. */
    const startImport = (fileOrName) => {
      const file = fileOrName && fileOrName.name ? fileOrName : null;
      const fname = file ? file.name : (typeof fileOrName === 'string' && fileOrName) ? fileOrName : `aktivitaet_${Date.now()}.fit`;
      setJob({ name: fname, pct: 0 });
      let pct = 0;
      const iv = setInterval(() => {
        pct += 8 + Math.random() * 14;
        if (pct < 100) setJob({ name: fname, pct: Math.min(99, Math.round(pct)) });
      }, 220);
      API.importActivityFile(file, { fileName: fname }).then(({ activity, meta }) => {
        clearInterval(iv); setJob(null);
        setImports((arr) => [{ name: fname, size: meta.size, status: 'done', sport: activity.sport, rows: meta.rows, actId: activity.id }, ...arr]);
        setLastImported(activity);
      }).catch(() => { clearInterval(iv); setJob(null); });
    };
    const onDrop = (e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; startImport(f || null); };

    /* verbinden/trennen \u00fcber die Datenschicht (Live: echter OAuth-Redirect) */
    const toggle = (id) => {
      const it = Live.getIntegration(id);
      if (!it) return;
      setBusy(id);
      const op = it.status === 'connected' ? API.disconnectIntegration(id) : API.connectIntegration(id);
      op.finally(() => setBusy(null));
    };

    return h('div', { className: 'ff-grid', style: { gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }, 'data-imp': true },
      h('div', { className: 'col gap-18' },
        h(Card, { title: 'Aktivität importieren', icon: 'upload', info: 'FIT- oder CSV-Dateien aus deinem Gerät oder Headunit.' },
          h('div', {
            className: 'ff-drop' + (drag ? ' is-drag' : ''),
            onDragOver: (e) => { e.preventDefault(); setDrag(true); }, onDragLeave: () => setDrag(false), onDrop,
            onClick: () => fileRef.current && fileRef.current.click(),
          },
            h('input', { ref: fileRef, type: 'file', accept: '.fit,.csv', style: { display: 'none' }, onChange: (e) => startImport(e.target.files[0] || null) }),
            job
              ? h('div', { className: 'col center gap-12', style: { width: '100%', maxWidth: 360 } },
                h('div', { style: { color: 'var(--accent-bright)' } }, h(Icon, { name: 'refresh', size: 26, className: 'ff-spin' })),
                h('span', { className: 'mono', style: { fontSize: 12, color: 'var(--text-2)' } }, `Verarbeite ${job.name} … ${job.pct}%`),
                h('div', { style: { width: '100%', height: 6, background: 'rgba(255,255,255,.08)', borderRadius: 99, overflow: 'hidden' } },
                  h('div', { style: { width: `${job.pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width .2s' } })))
              : h('div', { className: 'col center gap-10' },
                h('div', { style: { width: 56, height: 56, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent-bright)', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, h(Icon, { name: 'upload', size: 24 })),
                h('span', { className: 'strong', style: { fontSize: 15, fontWeight: 600 } }, 'Datei hierher ziehen'),
                h('span', { style: { fontSize: 12.5, color: 'var(--text-3)' } }, 'oder klicken zum Auswählen · .FIT, .CSV bis 25\u2009MB'),
                h('div', { className: 'row gap-8', style: { marginTop: 6 } },
                  h('span', { className: 'chip' }, h(Icon, { name: 'file', size: 12 }), 'Garmin FIT'),
                  h('span', { className: 'chip' }, h(Icon, { name: 'file', size: 12 }), 'Wahoo FIT'),
                  h('span', { className: 'chip' }, h(Icon, { name: 'file', size: 12 }), 'CSV')))),
          h('div', { className: 'row gap-8', style: { marginTop: 14 } },
            h('button', { className: 'btn btn--ghost btn--sm', onClick: () => startImport('2026-06-06_test.fit') }, h(Icon, { name: 'bolt', size: 14 }), 'Demo-Import starten')),
          lastImported && h('button', { className: 'ff-import-done', onClick: () => onOpenActivity(lastImported.id) },
            h('span', { className: 'ff-import-done-ic' }, h(Icon, { name: 'check', size: 16 })),
            h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0, textAlign: 'left' } },
              h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, `${lastImported.title} importiert`),
              h('span', { style: { fontSize: 12, color: 'var(--text-3)' } }, `${fmt.dur(lastImported.duration)} \u00b7 ${lastImported.tss} TSS \u00b7 jetzt als Einheit in der Diagnostik`)),
            h('span', { className: 'row center gap-5', style: { fontSize: 12.5, fontWeight: 600, color: 'var(--accent-bright)', whiteSpace: 'nowrap' } }, 'In Diagnostik \u00f6ffnen', h(Icon, { name: 'arrowUR', size: 14 })))),

        h(Card, { title: 'Letzte Importe', icon: 'file', pad: false,
          right: h('span', { className: 'mono', style: { fontSize: 11, color: 'var(--text-3)' } }, `${imports.length}`) },
          h('div', { className: 'col', style: { padding: '4px 10px 10px' } }, imports.map((im, i) =>
            h('div', { key: i, className: 'row center gap-12 ff-imp-row' + (im.actId ? ' is-link' : ''), onClick: im.actId ? () => onOpenActivity(im.actId) : undefined, style: { padding: '11px 8px', borderBottom: i < imports.length - 1 ? '1px solid var(--line-soft)' : 'none' } },
              h(SportIcon, { sport: im.sport, size: 34, soft: true }),
              h('div', { className: 'col gap-2', style: { flex: 1, minWidth: 0 } },
                h('span', { className: 'mono', style: { fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, im.name),
                h('span', { style: { fontSize: 11, color: 'var(--text-4)' } }, `${im.size} · ${im.rows}`)),
              im.actId
                ? h(Icon, { name: 'arrowUR', size: 15, style: { color: 'var(--text-4)' } })
                : h('span', { className: 'row center gap-5', style: { fontSize: 11, color: 'var(--good)', fontWeight: 600 } }, h(Icon, { name: 'check', size: 13 }), 'Importiert'))))) ),

      h('div', { className: 'col gap-18' },
        h(Card, { title: 'Integrationen', icon: 'link', tour: 'integrations' },
          h('div', { className: 'col gap-12' }, integrations.map((it) => h(Integration, { key: it.id, it, busy: busy === it.id, onToggle: () => toggle(it.id) })))),
        h(Card, { title: 'Synchronisierte Daten', icon: 'refresh' },
          h('div', { className: 'col gap-10' },
            h(SyncRow, { icon: 'heart', label: 'HRV', src: 'Apple Health', val: `${FF.recovery.hrv.val} ms` }),
            h(SyncRow, { icon: 'moon', label: 'Schlaf', src: 'Apple Health', val: `${fmt.n(FF.recovery.sleep.val, 1)} h` }),
            h(SyncRow, { icon: 'waves', label: 'Ruhepuls', src: 'Apple Health', val: `${FF.recovery.rhr.val} bpm` }),
            h(SyncRow, { icon: 'activity', label: 'Aktivitäten', src: 'Strava', val: '212 gesamt' })),
          h('div', { className: 'rule', style: { margin: '14px 0' } }),
          h(AiInsight, { title: 'Automatische Verarbeitung' }, 'Importierte FIT-Dateien werden automatisch in Telemetrie, Zonenverteilung und Trainingsload (TSS) umgerechnet und in die Leistungsdiagnostik übernommen.'))));
  }

  function SyncRow({ icon, label, src, val }) {
    return h('div', { className: 'row between center', style: { padding: '4px 0' } },
      h('div', { className: 'row center gap-10' },
        h('span', { style: { color: 'var(--text-3)' } }, h(Icon, { name: icon, size: 16 })),
        h('div', { className: 'col' }, h('span', { className: 'strong', style: { fontSize: 13, fontWeight: 600 } }, label), h('span', { style: { fontSize: 11, color: 'var(--text-4)' } }, src))),
      h('span', { className: 'mono', style: { fontSize: 13, color: 'var(--text-2)' } }, val));
  }

  window.Screens = window.Screens || {};
  window.Screens.ImportSync = ImportSync;
})();
