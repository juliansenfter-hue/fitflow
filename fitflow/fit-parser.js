/* FitFlow — client-side FIT / CSV decoder.
   Zero-dependency, runs entirely in the browser. Decodes the binary Garmin/
   ANT FIT format (definition + data messages, incl. compressed-timestamp
   headers) far enough to reconstruct an activity: the `session` summary plus
   the `record` telemetry stream (HR, power, cadence, speed, distance, alt).
   Also a tolerant CSV reader for head-unit / gym CSV exports.

   Exposes window.FitParser.parseFit(ArrayBuffer) and .parseCsv(string), both
   returning a normalised summary:
     { ok, sport, startTime(Date|null), duration(s), distance(m), calories,
       elevation(m), avgHr, maxHr, avgPower, maxPower, np, avgCad, maxCad,
       avgSpeed(m/s), records:[{t,hr,power,cadence,speed,distance,alt}], rows } */
(function () {
  'use strict';

  // seconds between the Unix epoch (1970-01-01) and the FIT epoch (1989-12-31)
  const FIT_EPOCH = 631065600;

  // FIT base type → { size(bytes), signed, float, invalid }
  const BASE = {
    0x00: { size: 1, signed: false, invalid: 0xFF },            // enum
    0x01: { size: 1, signed: true,  invalid: 0x7F },            // sint8
    0x02: { size: 1, signed: false, invalid: 0xFF },            // uint8
    0x83: { size: 2, signed: true,  invalid: 0x7FFF },          // sint16
    0x84: { size: 2, signed: false, invalid: 0xFFFF },          // uint16
    0x85: { size: 4, signed: true,  invalid: 0x7FFFFFFF },      // sint32
    0x86: { size: 4, signed: false, invalid: 0xFFFFFFFF },      // uint32
    0x07: { size: 1, signed: false, invalid: 0x00, str: true }, // string
    0x88: { size: 4, float: true,   invalid: 0xFFFFFFFF },      // float32
    0x89: { size: 8, float: true,   invalid: null },            // float64
    0x0A: { size: 1, signed: false, invalid: 0x00 },            // uint8z
    0x8B: { size: 2, signed: false, invalid: 0x0000 },          // uint16z
    0x8C: { size: 4, signed: false, invalid: 0x00000000 },      // uint32z
    0x0D: { size: 1, signed: false, invalid: 0xFF },            // byte
  };
  const baseOf = (t) => BASE[t] || BASE[t & 0x0F] || { size: 1, signed: false, invalid: 0xFF };

  // FIT sport enum → FitFlow sport bucket
  function mapSport(s) {
    switch (s) {
      case 2: return 'bike';                          // cycling
      case 1: case 11: case 17: return 'run';         // running / walking / hiking
      case 4: case 10: return 'lift';                 // fitness_equipment / training
      default: return null;
    }
  }

  function readNum(view, off, bt, arch) {
    const b = baseOf(bt);
    const le = arch === 0;
    let v;
    switch (b.size) {
      case 1: v = b.signed ? view.getInt8(off) : view.getUint8(off); break;
      case 2: v = b.float ? view.getFloat32(off, le)
                          : (b.signed ? view.getInt16(off, le) : view.getUint16(off, le)); break;
      case 4: v = b.float ? view.getFloat32(off, le)
                          : (b.signed ? view.getInt32(off, le) : view.getUint32(off, le)); break;
      case 8: v = b.float ? view.getFloat64(off, le)
                          : Number((b.signed ? view.getBigInt64(off, le) : view.getBigUint64(off, le))); break;
      default: v = view.getUint8(off);
    }
    if (b.invalid != null && v === b.invalid) return null;
    return v;
  }

  function parseFit(buffer) {
    try {
      const view = new DataView(buffer);
      if (view.byteLength < 14) return { ok: false, error: 'Datei zu klein' };
      const headerSize = view.getUint8(0);
      // sanity: bytes 8..11 should read ".FIT"
      const magic = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      if (magic !== '.FIT') return { ok: false, error: 'Keine gültige FIT-Datei' };
      const dataSize = view.getUint32(4, true);
      let off = headerSize;
      const end = Math.min(view.byteLength, headerSize + dataSize);

      const defs = {};             // localMsgType -> definition
      let lastTs = null;           // for compressed-timestamp headers
      const records = [];
      let session = null, sportMsg = null;

      while (off < end) {
        const rh = view.getUint8(off); off += 1;
        let localType, isDef = false, hasDev = false, compressedOffset = null;
        if (rh & 0x80) {                       // compressed timestamp header (data msg)
          localType = (rh >> 5) & 0x03;
          compressedOffset = rh & 0x1F;
        } else {
          isDef = !!(rh & 0x40);
          hasDev = !!(rh & 0x20);
          localType = rh & 0x0F;
        }

        if (isDef) {
          off += 1;                            // reserved
          const arch = view.getUint8(off); off += 1;
          const globalNum = arch === 0 ? view.getUint16(off, true) : view.getUint16(off, false);
          off += 2;
          const nFields = view.getUint8(off); off += 1;
          const fields = [];
          let total = 0;
          for (let i = 0; i < nFields; i++) {
            const num = view.getUint8(off), size = view.getUint8(off + 1), bt = view.getUint8(off + 2);
            off += 3; fields.push({ num, size, bt }); total += size;
          }
          if (hasDev) {
            const nDev = view.getUint8(off); off += 1;
            for (let i = 0; i < nDev; i++) { const size = view.getUint8(off + 1); off += 3; total += size; fields.push({ dev: true, size }); }
          }
          defs[localType] = { globalNum, arch, fields, total };
          continue;
        }

        const def = defs[localType];
        if (!def) break;                       // stream desync — stop gracefully
        const msg = {};
        let p = off;
        for (const f of def.fields) {
          if (f.dev) { p += f.size; continue; } // developer fields: skip
          const b = baseOf(f.bt);
          if (b.str) {
            let s = '';
            for (let k = 0; k < f.size; k++) { const c = view.getUint8(p + k); if (c) s += String.fromCharCode(c); }
            msg[f.num] = s;
          } else {
            // read first element (scalars); step over any array remainder
            msg[f.num] = readNum(view, p, f.bt, def.arch);
          }
          p += f.size;
        }
        off += def.total;

        if (compressedOffset != null && lastTs != null) {
          lastTs = (lastTs & ~0x1F) + compressedOffset + (((compressedOffset) < (lastTs & 0x1F)) ? 0x20 : 0);
        } else if (msg[253] != null) {
          lastTs = msg[253];
        }

        if (def.globalNum === 20) {            // record
          records.push({
            t: lastTs != null ? lastTs : (msg[253] != null ? msg[253] : null),
            hr: msg[3] != null ? msg[3] : null,
            power: msg[7] != null ? msg[7] : null,
            cadence: msg[4] != null ? msg[4] : null,
            speed: msg[6] != null ? msg[6] / 1000 : null,     // mm/s -> m/s
            distance: msg[5] != null ? msg[5] / 100 : null,   // cm -> m
            alt: msg[2] != null ? msg[2] / 5 - 500 : null,
          });
        } else if (def.globalNum === 18 && !session) { // session (first)
          session = {
            sport: msg[5],
            startTime: msg[2],
            duration: (msg[8] != null ? msg[8] : msg[7]) != null ? (msg[8] != null ? msg[8] : msg[7]) / 1000 : null,
            distance: msg[9] != null ? msg[9] / 100 : null,
            calories: msg[11] != null ? msg[11] : null,
            avgSpeed: msg[14] != null ? msg[14] / 1000 : null,
            maxSpeed: msg[15] != null ? msg[15] / 1000 : null,
            avgHr: msg[16], maxHr: msg[17],
            avgCad: msg[18], maxCad: msg[19],
            avgPower: msg[20], maxPower: msg[21],
            elevation: msg[22] != null ? msg[22] : null,
            np: msg[34] != null ? msg[34] : null,
          };
        } else if (def.globalNum === 12 && sportMsg == null) { // sport
          sportMsg = msg[0];
        }
      }

      return summarise({ records, session, sportEnum: session ? session.sport : sportMsg });
    } catch (e) {
      return { ok: false, error: 'FIT-Datei konnte nicht gelesen werden: ' + e.message };
    }
  }

  // fold records + session into the normalised summary
  function summarise({ records, session, sportEnum }) {
    const S = session || {};
    const col = (k) => records.map((r) => r[k]).filter((v) => v != null);
    const avg = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const max = (a) => a.length ? Math.max.apply(null, a) : null;

    const hrA = col('hr'), pwA = col('power'), cadA = col('cadence'), spA = col('speed'), distA = col('distance');
    const times = col('t');
    let duration = S.duration;
    if (duration == null && times.length > 1) duration = times[times.length - 1] - times[0];
    let distance = S.distance;
    if (distance == null && distA.length) distance = max(distA);

    // normalized power from the stream if the session didn't provide it
    let np = S.np;
    if (np == null && pwA.length > 30) {
      const roll = [];
      for (let i = 29; i < pwA.length; i++) {
        let s = 0; for (let k = i - 29; k <= i; k++) s += pwA[k];
        roll.push(Math.pow(s / 30, 4));
      }
      if (roll.length) np = Math.round(Math.pow(avg(roll), 0.25));
    }

    const startSec = S.startTime != null ? S.startTime : (times.length ? times[0] : null);

    return {
      ok: records.length > 0 || session != null,
      sport: mapSport(sportEnum),
      startTime: startSec != null ? new Date((startSec + FIT_EPOCH) * 1000) : null,
      duration: duration != null ? Math.round(duration) : null,
      distance: distance != null ? Math.round(distance) : null,
      calories: S.calories != null ? Math.round(S.calories) : null,
      elevation: S.elevation != null ? Math.round(S.elevation) : null,
      avgHr: S.avgHr != null ? Math.round(S.avgHr) : (hrA.length ? Math.round(avg(hrA)) : null),
      maxHr: S.maxHr != null ? Math.round(S.maxHr) : (hrA.length ? Math.round(max(hrA)) : null),
      avgPower: S.avgPower != null ? Math.round(S.avgPower) : (pwA.length ? Math.round(avg(pwA)) : null),
      maxPower: S.maxPower != null ? Math.round(S.maxPower) : (pwA.length ? Math.round(max(pwA)) : null),
      np: np != null ? Math.round(np) : null,
      avgCad: S.avgCad != null ? Math.round(S.avgCad) : (cadA.length ? Math.round(avg(cadA)) : null),
      maxCad: S.maxCad != null ? Math.round(S.maxCad) : (cadA.length ? Math.round(max(cadA)) : null),
      avgSpeed: S.avgSpeed != null ? S.avgSpeed : (spA.length ? avg(spA) : null),
      records,
      rows: records.length,
    };
  }

  /* ---- CSV: tolerant column detection (timestamp, hr, power, cadence, speed, distance) ---- */
  function parseCsv(text) {
    try {
      const lines = String(text).split(/\r?\n/).filter((l) => l.trim().length);
      if (lines.length < 2) return { ok: false, error: 'CSV enthält keine Datenzeilen' };
      const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
      const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
      const find = (...names) => head.findIndex((h) => names.some((n) => h.includes(n)));
      const iHr = find('heart', 'hr', 'puls'), iPw = find('power', 'watt', 'leistung');
      const iCad = find('cadence', 'kadenz', 'rpm'), iSp = find('speed', 'geschw'), iDist = find('distance', 'distanz');
      const iTime = find('time', 'zeit', 'timestamp', 'sekunde');
      const num = (s) => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; };
      const records = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(sep);
        records.push({
          t: iTime >= 0 ? num(c[iTime]) : i,
          hr: iHr >= 0 ? num(c[iHr]) : null,
          power: iPw >= 0 ? num(c[iPw]) : null,
          cadence: iCad >= 0 ? num(c[iCad]) : null,
          speed: iSp >= 0 ? num(c[iSp]) : null,
          distance: iDist >= 0 ? num(c[iDist]) : null,
          alt: null,
        });
      }
      const hasStreams = iHr >= 0 || iPw >= 0 || iSp >= 0;
      const sportEnum = iPw >= 0 || iSp >= 0 ? 2 : null; // has power/speed → treat as bike, else unknown (lift)
      const out = summarise({ records: hasStreams ? records : [], session: null, sportEnum });
      out.rows = records.length;
      if (!out.sport) out.sport = 'lift';
      out.ok = true;
      return out;
    } catch (e) {
      return { ok: false, error: 'CSV konnte nicht gelesen werden: ' + e.message };
    }
  }

  window.FitParser = { parseFit, parseCsv };
})();
