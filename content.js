/*
 * World Time for Google Calendar
 *
 * Google Calendar's class names are obfuscated and change often, so nothing
 * here depends on them. Instead we:
 *   1. find the column of hour labels (a vertical run of ~23 labels that read
 *      as consecutive hours) inside [role="main"],
 *   2. push the calendar right by N * COL_W pixels, and
 *   3. draw the extra timezone columns in that freed space, aligned to the
 *      measured y-position of every Google hour label.
 */
(() => {
  'use strict';
  if (window.__gtzLoaded) return;
  window.__gtzLoaded = true;

  const COL_W = 54; // width of one extra timezone column, px
  const ROOT_ID = 'gtz-root';

  const DEFAULTS = {
    enabled: true,
    hour12: false,
    dstHints: true, // daylight-saving line, chip and amber headings
    home: 'auto', // 'auto' = browser timezone (what Google Calendar displays)
    zones: [
      { tz: 'America/Los_Angeles', label: '' },
      { tz: 'America/Chicago', label: '' },
      { tz: 'America/New_York', label: '' },
    ],
  };

  let settings = { ...DEFAULTS };

  /* ------------------------------------------------------------------ *
   * Timezone helpers
   * ------------------------------------------------------------------ */

  const dtfCache = new Map();
  function dtf(tz) {
    let f = dtfCache.get(tz);
    if (!f) {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
      dtfCache.set(tz, f);
    }
    return f;
  }

  function validTz(tz) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch (e) {
      return false;
    }
  }

  function partsOf(tz, ms) {
    const o = {};
    for (const p of dtf(tz).formatToParts(ms)) if (p.type !== 'literal') o[p.type] = p.value;
    return {
      year: +o.year,
      month: +o.month,
      day: +o.day,
      hour: +o.hour % 24,
      minute: +o.minute,
      second: +o.second,
    };
  }

  function offsetMs(tz, ms) {
    const p = partsOf(tz, ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }

  // Wall-clock time in `tz` -> absolute instant (ms since epoch).
  function zonedToInstant(y, m, d, h, min, tz) {
    const guess = Date.UTC(y, m - 1, d, h, min);
    const off1 = offsetMs(tz, guess);
    let t = guess - off1;
    const off2 = offsetMs(tz, t);
    if (off2 !== off1) t = guess - off2;
    return t;
  }

  const pad2 = (n) => String(n).padStart(2, '0');

  function formatTime(tz, ms, hour12, forceMinutes) {
    const p = partsOf(tz, ms);
    if (hour12) {
      const h = p.hour % 12 || 12;
      const suffix = p.hour < 12 ? ' AM' : ' PM';
      return p.minute || forceMinutes ? `${h}:${pad2(p.minute)}${suffix}` : `${h}${suffix}`;
    }
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  }

  // Short names Intl only knows as "GMT-3" etc.
  const ABBR = {
    'America/Montevideo': 'UYT',
    'America/Argentina/Buenos_Aires': 'ART',
    'America/Buenos_Aires': 'ART',
    'America/Sao_Paulo': 'BRT',
    'America/Bogota': 'COT',
    'America/Lima': 'PET',
    'America/Santiago': 'CLT',
    'America/Caracas': 'VET',
    'America/Asuncion': 'PYT',
    'America/La_Paz': 'BOT',
    'America/Guayaquil': 'ECT',
    'Asia/Kolkata': 'IST',
    'Asia/Calcutta': 'IST',
    'Asia/Tokyo': 'JST',
    'Asia/Seoul': 'KST',
    'Asia/Singapore': 'SGT',
    'Asia/Dubai': 'GST',
    'Asia/Hong_Kong': 'HKT',
    'Asia/Shanghai': 'CST',
    'Africa/Johannesburg': 'SAST',
    'Africa/Lagos': 'WAT',
    'Africa/Nairobi': 'EAT',
    'Europe/Moscow': 'MSK',
    'Europe/Istanbul': 'TRT',
  };

  function abbreviation(tz, ms, custom) {
    if (custom && custom.trim()) return custom.trim();
    if (ABBR[tz]) return ABBR[tz];
    for (const loc of ['en-US', 'en-GB', 'en-AU']) {
      try {
        const name = new Intl.DateTimeFormat(loc, { timeZone: tz, timeZoneName: 'short' })
          .formatToParts(ms)
          .find((p) => p.type === 'timeZoneName');
        if (name && !/^(GMT|UTC)[+\-−]/.test(name.value)) return name.value;
      } catch (e) {
        /* try next locale */
      }
    }
    try {
      const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(ms)
        .find((p) => p.type === 'timeZoneName');
      if (name) return name.value;
    } catch (e) {
      /* ignore */
    }
    return tz.split('/').pop().replace(/_/g, ' ');
  }

  function homeTz() {
    if (settings.home && settings.home !== 'auto' && validTz(settings.home)) return settings.home;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  // Date the calendar is showing (from the URL), else today in the home tz.
  function viewDate(home) {
    const m = location.pathname.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$)/);
    if (m) return { y: +m[1], m: +m[2], d: +m[3] };
    const p = partsOf(home, Date.now());
    return { y: p.year, m: p.month, d: p.day };
  }

  /* ------------------------------------------------------------------ *
   * Locating the Google Calendar time grid
   * ------------------------------------------------------------------ */

  // "1 AM", "13:00", "01:00", "1 a. m.", "13 h", ...
  const LABEL_RE = /^(\d{1,2})(?:[:.]\d{2})?\s?(?:h|[ap]\.?\s?m\.?)?$/i;

  function findLabels(main) {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const groups = new Map();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (text.length < 1 || text.length > 9) continue;
      const m = LABEL_RE.exec(text);
      if (!m) continue;
      const el = node.parentElement;
      if (!el) continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const key = Math.round(r.right / 4);
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push({ el, node, num: +m[1], top: r.top, height: r.height, left: r.left, right: r.right });
    }

    let best = null;
    for (const items of groups.values()) {
      if (items.length < 20) continue;
      items.sort((a, b) => a.top - b.top);
      // Consecutive hours (works for 12h and 24h clocks).
      let ok = true;
      for (let i = 1; i < items.length && ok; i++) {
        if ((((items[i].num - items[i - 1].num) % 12) + 12) % 12 !== 1) ok = false;
      }
      if (!ok) continue;
      // Evenly spaced.
      const gaps = [];
      for (let i = 1; i < items.length; i++) gaps.push(items[i].top - items[i - 1].top);
      const spacing = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (spacing < 12 || gaps.some((g) => Math.abs(g - spacing) > 3)) continue;
      const right = Math.max(...items.map((i) => i.right));
      if (!best || right > best.right) best = { items, spacing, right };
    }
    if (!best) return null;

    const items = best.items;
    return {
      items,
      spacing: best.spacing,
      labelRight: best.right,
      firstHour: items[0].num % 12, // first label is 1 AM (or 12 AM => 0)
      scroller: findScroller(items[0].el),
    };
  }

  function findScroller(el) {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
    }
    return null;
  }

  function opaqueBackground(el) {
    for (let n = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const parts = m[1].split(/[ ,/]+/).filter(Boolean);
      const alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
      if (alpha > 0.95) return c;
    }
    return null; // nothing opaque behind us: let the page show through
  }

  /* ------------------------------------------------------------------ *
   * Google's red "now" line (used to place the current-time pill)
   * ------------------------------------------------------------------ */

  function isRed(color) {
    const m = color.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const [r, g, b, a] = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    if (a === 0) return false;
    return r > 200 && g < 160 && b < 150 && r - g > 80;
  }

  let nowEl = null;
  let lastNowScan = 0;

  function findNowLine(scope) {
    if (nowEl && nowEl.isConnected && scope.contains(nowEl)) return nowEl;
    const t = Date.now();
    const hadOne = !!nowEl;
    if (!hadOne && t - lastNowScan < 2000) return null;
    lastNowScan = t;
    nowEl = null;
    for (const el of scope.querySelectorAll('div')) {
      const r = el.getBoundingClientRect();
      if (r.height <= 0 || r.height > 3 || r.width < 20) continue;
      const cs = getComputedStyle(el);
      if (isRed(cs.backgroundColor) || (parseFloat(cs.borderTopWidth) > 0 && isRed(cs.borderTopColor))) {
        nowEl = el;
        break;
      }
    }
    return nowEl;
  }



  /* ------------------------------------------------------------------ *
   * Colour helpers
   * ------------------------------------------------------------------ */

  function luminance(color) {
    const m = color && color.match(/rgba?\(([^)]+)\)/);
    if (!m) return matchMedia('(prefers-color-scheme: dark)').matches ? 0.1 : 0.95;
    const [r, g, b] = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  // Luminance of the text colour decides "bright" for the hover (light text => dark theme).
  const isLightText = (color) => luminance(color) > 0.5;

  /* ------------------------------------------------------------------ *
   * Google's own timezone caption above the gutter ("GMT-03", "MVD", ...)
   * Our headings sit in the same row.
   * ------------------------------------------------------------------ */

  const TZ_CAPTION_RE = /^[A-Za-z]{2,5}(?:[+\-−]\d{1,2}(?::\d{2})?)?$/;

  // Top of the visible hour grid (not the first hour label, which scrolls away).
  function gridTopOf(found, main) {
    let top = Math.max(0, main.getBoundingClientRect().top);
    for (const n of clippingAncestors(found.items[0].el)) {
      const r = n.getBoundingClientRect();
      if (r.height < 100) continue;
      top = Math.max(top, r.top);
    }
    return top;
  }

  let captionCandidates = [];

  // Is this text actually painted where we measured it (not transparent, hidden, clipped or covered)?
  function reallyVisible(node, r) {
    const elm = node.parentElement;
    if (!elm) return false;
    for (let n = elm; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    if (/,\s*0\)$/.test(getComputedStyle(elm).color)) return false;
    const h = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
    return !!h && (elm.contains(h) || h.contains(elm));
  }

  function findTzCaption(found, gridTop) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const minX = Math.min(...found.items.map((i) => i.left)) - 30;
    const maxX = found.labelRight + 16;
    const cands = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (text.length < 2 || text.length > 9 || !TZ_CAPTION_RE.test(text)) continue;
      if (root && root.contains(node)) continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cx = (r.left + r.right) / 2;
      if (cx < minX || cx > maxX) continue;
      if (r.bottom > gridTop + 2 || r.top < gridTop - 400 || r.top < 0) continue;
      cands.push({ node, rect: r, visible: reallyVisible(node, r) });
    }
    captionCandidates = cands.map((c) => ({ text: c.node.nodeValue.trim(), top: Math.round(c.rect.top), h: Math.round(c.rect.height), visible: c.visible }));
    const pool = cands.some((c) => c.visible) ? cands.filter((c) => c.visible) : cands;
    let best = null;
    for (const c of pool) if (!best || c.rect.bottom > best.rect.bottom) best = c;
    return best ? best.node : null;
  }

  /* ------------------------------------------------------------------ *
   * Layout: make room for the columns
   * ------------------------------------------------------------------ */

  // The shift is a CSS rule keyed on <html class="gtz-on"> (see content.css), so a
  // freshly rendered [role="main"] (week change, view change) is shifted from its
  // very first paint instead of jumping once our script catches up.
  const shift = { W: 0, tt: 0 };

  function applyShift(W) {
    const de = document.documentElement;
    if (shift.W === W && de.classList.contains('gtz-on')) return;
    de.style.setProperty('--gtz-w', `${W}px`);
    de.classList.add('gtz-animate', 'gtz-on'); // slide only when enabling / resizing
    clearTimeout(shift.tt);
    shift.tt = setTimeout(() => de.classList.remove('gtz-animate'), 450);
    shift.W = W;
    kick(700);
    window.dispatchEvent(new Event('resize')); // Google may measure widths in JS
  }

  function restoreMain() {
    const de = document.documentElement;
    clearTimeout(shift.tt);
    const was = de.classList.contains('gtz-on');
    de.classList.remove('gtz-on', 'gtz-animate');
    de.style.removeProperty('--gtz-w');
    shift.W = 0;
    if (was) window.dispatchEvent(new Event('resize'));
  }

  /* ------------------------------------------------------------------ *
   * Session state
   *
   * Nothing below assumes which element scrolls. Every pass we measure the
   * real on-screen position of each Google hour label and put our cells at
   * exactly the same y. Visibility follows the ancestors that clip the
   * labels, i.e. exactly where Google itself stops drawing them.
   * ------------------------------------------------------------------ */

  let root = null;
  let S = null;
  let builtKey = '';
  let missCount = 0;

  function el(cls, text, styles) {
    const d = document.createElement('div');
    d.className = cls;
    if (text != null) d.textContent = text;
    if (styles) Object.assign(d.style, styles);
    return d;
  }

  function ensureRoot() {
    if (root && root.isConnected) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="gtz-cells"></div><div class="gtz-heads"></div><div class="gtz-dstl"></div>';
    document.body.appendChild(root);
    builtKey = '';
    S = null;
    return root;
  }

  function teardown() {
    clearTint();
    setHot(-1);
    restoreMain();
    ro.disconnect();
    if (root) {
      root.remove();
      root = null;
    }
    S = null;
    builtKey = '';
    nowEl = null;
    missCount = 0;
  }

  // Ancestors of the labels that clip them (overflow != visible), minus tiny ones.
  function clippingAncestors(elm) {
    const out = [];
    for (let n = elm.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const clips = (v) => v === 'hidden' || v === 'auto' || v === 'scroll' || v === 'clip';
      if (clips(cs.overflowY) || clips(cs.overflowX)) out.push(n);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Daylight saving: which days are visible, and where a zone's clock shifts
   * ------------------------------------------------------------------ */

  const DAY_RE = /^(\d{1,2})(?:\s+\p{L}[\p{L}.]*)?$/u;
  let lastDays = null; // for diagnostics
  let tzCheck = null; // { home, status: 'match'|'mismatch', diffMin, at } from the red now-line

  const addDays = (dt, n) => {
    const t = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  };

  // The row of day numbers above the grid (one per visible day), left to right.
  function findDayHeaders(main, found, gridTop) {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    const groups = new Map();
    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (text.length < 1 || text.length > 8) continue;
      const m = DAY_RE.exec(text);
      if (!m) continue;
      const day = +m[1];
      if (day < 1 || day > 31) continue;
      if (root && root.contains(node)) continue;
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.bottom > gridTop + 2 || r.left < found.labelRight - 4) continue;
      const key = Math.round((r.top + r.bottom) / 2 / 10); // tolerate a 'today' circle
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push({ node, day, cx: (r.left + r.right) / 2 });
    }

    let best = null;
    for (const g of groups.values()) {
      if (g.length < 2 || g.length > 7) continue;
      g.sort((a, b) => a.cx - b.cx);
      let ok = true;
      for (let i = 1; i < g.length && ok; i++) {
        const prev = g[i - 1].day;
        if (!(g[i].day === prev + 1 || (g[i].day === 1 && prev >= 28))) ok = false;
      }
      if (!ok) continue;
      const gaps = [];
      for (let i = 1; i < g.length; i++) gaps.push(g[i].cx - g[i - 1].cx);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (gaps.some((x) => Math.abs(x - mean) > mean * 0.15 + 2)) continue;
      if (!best || g.length > best.length) best = g;
    }
    return best;
  }

  // First visible date, from the day numbers + the date in the URL.
  function firstVisibleDate(days, anchor) {
    const n = days.length;
    for (let j = 0; j < 2 * n; j++) {
      const off = j % 2 ? Math.ceil(j / 2) : -(j / 2); // 0, +1, -1, +2, -2 ...
      for (const sgn of [off]) {
        const s0 = addDays(anchor, sgn);
        let ok = true;
        for (let k = 0; k < n && ok; k++) if (addDays(s0, k).d !== days[k].day) ok = false;
        if (ok) return s0;
      }
    }
    return null;
  }

  // Changes of a zone's offset *relative to the calendar's timezone* between visible days.
  function dstChanges(zones, home, start, n) {
    const noons = [];
    for (let k = 0; k <= n; k++) { // k === n is the day just after the visible range
      const d = addDays(start, k);
      noons.push(zonedToInstant(d.y, d.m, d.d, 12, 0, home));
    }
    const rel = (tz, k) => offsetMs(tz, noons[k]) - offsetMs(home, noons[k]);
    const out = [];
    for (let k = 1; k <= n; k++) {
      const groups = new Map();
      zones.forEach((z, zi) => {
        const dm = Math.round((rel(z.tz, k) - rel(z.tz, k - 1)) / 60000);
        if (!dm) return;
        if (!groups.has(dm)) groups.set(dm, []);
        groups.get(dm).push(zi);
      });
      groups.forEach((zis, dm) => out.push({ col: k, minutes: dm, zones: zis }));
    }
    return out;
  }

  function fmtDelta(min) {
    const sign = min < 0 ? '-' : '+';
    const a = Math.abs(min);
    if (a % 60 === 0) return `${sign}${a / 60}h`;
    return a < 60 ? `${sign}${a}m` : `${sign}${Math.floor(a / 60)}h ${a % 60}m`;
  }

  // Tint the day number of an affected column (undone on every update / teardown).
  let tinted = [];
  function clearTint() {
    tinted.forEach((e) => e.style.removeProperty('color'));
    tinted = [];
  }

  /* ------------------------------------------------------------------ *
   * Full update: (re)detect the grid and rebuild the cells when needed
   * ------------------------------------------------------------------ */

  function update() {
    const zones = (settings.enabled ? settings.zones || [] : []).filter((z) => z && validTz(z.tz));
    const main = document.querySelector('[role="main"]');
    let found = zones.length && main ? findLabels(main) : null;

    if (!found) {
      // Google re-renders the grid during some transitions; don't tear down
      // (and make the page jump) until the grid has been missing for a while.
      if (!zones.length || !main || ++missCount >= 6) {
        teardown();
      } else {
        schedule(200); // keep what's on screen; the grid is mid re-render
      }
      return;
    }
    missCount = 0;

    const W = zones.length * COL_W;
    applyShift(W);

    const rootEl = ensureRoot();
    rootEl.style.visibility = '';
    const home = homeTz();
    const urlDate = viewDate(home);
    const gridTop = gridTopOf(found, main);
    const dayHdr = findDayHeaders(main, found, gridTop);
    const start = dayHdr ? firstVisibleDate(dayHdr, urlDate) : null;
    const date = start || urlDate; // labels use the first visible day's offsets
    const changes = start && settings.dstHints !== false ? dstChanges(zones, home, start, dayHdr.length) : [];
    lastDays = { nums: dayHdr ? dayHdr.map((d) => d.day) : null, start: start || null, changes };
    const labelStyle = getComputedStyle(found.items[0].el);
    const bg = opaqueBackground(found.items[0].el); // null when the page paints none
    const tzNode = findTzCaption(found, gridTop);
    const lightText = isLightText(labelStyle.color);
    const hotColor = lightText ? '#ffffff' : '#000000';
    const warn = lightText ? '#fdd663' : '#b06000';

    rootEl.style.setProperty('--gtz-color', labelStyle.color);
    rootEl.style.setProperty('--gtz-hot', hotColor);
    rootEl.style.setProperty('--gtz-warn', warn);
    rootEl.style.setProperty('--gtz-warn-bg', lightText ? 'rgba(251,188,4,0.18)' : 'rgba(176,96,0,0.12)');
    rootEl.style.setProperty('--gtz-bg', bg || 'transparent');
    rootEl.style.setProperty('--gtz-font', labelStyle.fontFamily);
    rootEl.style.setProperty('--gtz-size', labelStyle.fontSize);
    rootEl.style.setProperty('--gtz-weight', labelStyle.fontWeight);
    rootEl.style.setProperty('--gtz-spacing', labelStyle.letterSpacing);

    const noon = zonedToInstant(date.y, date.m, date.d, 12, 0, home);
    const sig = [offsetMs(home, noon), ...zones.map((z) => offsetMs(z.tz, noon)), ...zones.map((z) => abbreviation(z.tz, noon, z.label))];
    const key = JSON.stringify([zones, settings.hour12, home, sig, found.firstHour, found.items.length, labelStyle.color, labelStyle.fontSize, changes, dayHdr ? dayHdr.length : 0]);

    if (!S || key !== builtKey || S.main !== main) {
      setHot(-1);
      builtKey = key;
      const cellsEl = rootEl.querySelector('.gtz-cells');
      const heads = rootEl.querySelector('.gtz-heads');
      cellsEl.textContent = '';
      heads.textContent = '';

      const headEls = zones.map((z) => {
        const h = el('gtz-head', abbreviation(z.tz, noon, z.label), { width: `${COL_W}px` });
        heads.appendChild(h);
        return h;
      });

      const affected = new Set(changes.flatMap((c) => c.zones));
      headEls.forEach((h, i) => h.classList.toggle('gtz-dst', affected.has(i)));

      const dstLayer = rootEl.querySelector('.gtz-dstl');
      dstLayer.textContent = '';
      const dst = changes.map((c) => {
        const names = c.zones.map((zi) => abbreviation(zones[zi].tz, noon, zones[zi].label));
        const line = el('gtz-dst-line');
        const chip = el('gtz-dst-chip');
        if (dayHdr && c.col === dayHdr.length) chip.appendChild(el('gtz-dst-eyebrow', 'Next week')); // change lands after the visible days
        chip.appendChild(el('gtz-dst-text', `${names.join(', ')}: ${fmtDelta(c.minutes)}`));
        dstLayer.appendChild(line);
        dstLayer.appendChild(chip);
        return { col: c.col, line, chip };
      });

      const rows = found.items.map(() => []);
      found.items.forEach((item, i) => {
        const t = zonedToInstant(date.y, date.m, date.d, found.firstHour + i, 0, home);
        zones.forEach((z) => {
          const cell = el('gtz-cell', formatTime(z.tz, t, settings.hour12, false), { width: `${COL_W}px` });
          cellsEl.appendChild(cell);
          rows[i].push(cell);
        });
      });

      S = { main, W, rows, headEls, cellsEl, dst, hot: -1, geo: '', pill: null, cy: [], vis: [], rowSig: [] };
    }

    Object.assign(S, {
      items: found.items,
      spacing: found.spacing,
      tzNode,
      tzRetry: false,
      firstHour: found.firstHour,
      dayNodes: dayHdr ? dayHdr.map((d) => d.node) : [],
      dayRetry: false,
      hotColor,
      clip: clippingAncestors(found.items[0].el),
    });

    clearTint();
    if (dayHdr) {
      for (const c of new Set(changes.map((x) => x.col))) {
        const holder = dayHdr[c] && dayHdr[c].node.parentElement;
        if (holder) {
          holder.style.setProperty('color', warn, 'important');
          tinted.push(holder);
        }
      }
    }

    ro.disconnect();
    ro.observe(main);
    S.clip.slice(0, 6).forEach((n) => ro.observe(n));
    const gutter = found.items[0].el.parentElement;
    if (gutter) ro.observe(gutter);

    track(true);
  }

  /* ------------------------------------------------------------------ *
   * Tracker: cheap, runs every frame while layout is changing
   * ------------------------------------------------------------------ */

  function visibleBand(mRect) {
    let top = Math.max(0, mRect.top);
    let bottom = Math.min(innerHeight, mRect.bottom);
    for (const n of S.clip) {
      const r = n.getBoundingClientRect();
      if (r.height < 100) continue; // ignore tiny wrappers
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
    if (bottom - top < 50) return { top: Math.max(0, mRect.top), bottom: Math.min(innerHeight, mRect.bottom) };
    return { top, bottom };
  }

  function track(force) {
    if (!S || !root) return;
    const { main } = S;
    if (!main.isConnected || !S.items[0].el.isConnected) {
      rebuildNow(); // Google re-rendered the grid: re-detect right away
      return;
    }

    const mRect = main.getBoundingClientRect();
    const band = visibleBand(mRect);

    // Where Google's labels really are right now.
    const rg = document.createRange();
    const n = S.items.length;
    const cy = new Array(n);
    let labelRight = 0;
    for (let i = 0; i < n; i++) {
      const node = S.items[i].node;
      if (!node.isConnected) {
        rebuildNow();
        return;
      }
      rg.selectNodeContents(node);
      const b = rg.getBoundingClientRect();
      if (!b.height) return; // grid not laid out yet: keep the last good frame
      cy[i] = b.top + b.height / 2;
      if (b.right > labelRight) labelRight = b.right;
    }
    S.spacing = (cy[n - 1] - cy[0]) / (n - 1); // density changes just move the rows

    const freeLeft = mRect.left - S.W;
    const gutterRight = labelRight + 6;

    // Heading row: Google's tz caption if present, else the top of the card.
    let headTop = S.headTop != null ? S.headTop : mRect.top + 12;
    if (S.tzNode && S.tzNode.isConnected) {
      rg.selectNodeContents(S.tzNode);
      const c = rg.getBoundingClientRect();
      if (c.width) headTop = c.top + c.height / 2 - 10;
    } else if (S.tzNode && !S.tzRetry) {
      S.tzRetry = true; // caption node was replaced: re-find it, keep the old position meanwhile
      schedule(60);
    }
    S.headTop = headTop;

    const line = findNowLine(main);
    const lineRect = line ? line.getBoundingClientRect() : null;

    // Is Google Calendar really in the timezone we assume? Today's red line sits at
    // Google's current time; compare it with the clock in our "home" timezone.
    if (lineRect && S.spacing > 0 && (!S.tzAt || performance.now() - S.tzAt > 1000)) {
      S.tzAt = performance.now();
      const homeNow = homeTz();
      const p = partsOf(homeNow, Date.now());
      const homeMin = p.hour * 60 + p.minute + p.second / 60;
      const googleHours = S.firstHour + (lineRect.top + lineRect.height / 2 - cy[0]) / S.spacing;
      let diff = (((googleHours * 60 - homeMin) % 1440) + 1440) % 1440;
      if (diff > 720) diff -= 1440;
      tzCheck = { home: homeNow, status: Math.abs(diff) < 22 ? 'match' : 'mismatch', diffMin: Math.round(diff / 15) * 15, at: Date.now() };
    }

    // Marker lines sit on the left edge of the first day that has the new offset.
    let dstGeo = [];
    let dstTop = 0;
    if (S.dst.length && S.dayNodes.length) {
      const cxs = [];
      dstTop = Infinity;
      for (const node of S.dayNodes) {
        if (!node.isConnected) {
          cxs.length = 0;
          break;
        }
        rg.selectNodeContents(node);
        const b = rg.getBoundingClientRect();
        if (!b.width) {
          cxs.length = 0;
          break;
        }
        cxs.push((b.left + b.right) / 2);
        dstTop = Math.min(dstTop, b.top);
      }
      if (cxs.length === S.dayNodes.length) {
        const n = cxs.length;
        const half = n > 1 ? (cxs[n - 1] - cxs[n - 2]) / 2 : 0;
        dstGeo = S.dst.map((d) => (d.col < n ? (cxs[d.col - 1] + cxs[d.col]) / 2 : cxs[n - 1] + half));
      } else if (!S.dayRetry) {
        S.dayRetry = true; // header row was re-rendered: re-find it
        schedule(60);
      }
    }

    const geo = [Math.round(mRect.left), dstGeo.map(Math.round).join(','), Math.round(dstTop), Math.round(mRect.top), Math.round(mRect.width), Math.round(mRect.height), Math.round(band.top), Math.round(band.bottom), Math.round(headTop), lineRect ? Math.round(lineRect.top) : 'x', cy.map((v) => Math.round(v * 2)).join(',')].join('|');
    if (!force && geo === S.geo) return;
    S.geo = geo;
    S.moved = true;
    S.cy = cy;
    S.geom = { freeLeft, gutterRight, top: band.top, bottom: band.bottom };

    S.headEls.forEach((h, c) => {
      h.style.left = `${freeLeft + c * COL_W}px`;
      h.style.top = `${headTop}px`;
    });

    const chipTop = {};
    S.dst.forEach((d, i) => {
      const x = dstGeo[i];
      const show = x != null;
      d.line.style.display = d.chip.style.display = show ? '' : 'none';
      if (!show) return;
      const top = Math.max(mRect.top, dstTop - 10);
      d.line.style.left = `${x - 1}px`;
      d.line.style.top = `${top}px`;
      d.line.style.height = `${Math.max(0, band.bottom - top)}px`;
      d.chip.style.left = `${x - 6}px`;
      const t = chipTop[d.col] != null ? chipTop[d.col] : band.top + 8;
      d.chip.style.top = `${t}px`;
      chipTop[d.col] = t + (d.chip.offsetHeight || 24) + 4;
    });

    S.vis = cy.map((y) => y >= band.top - 1 && y <= band.bottom + 1);
    for (let i = 0; i < n; i++) {
      const cells = S.rows[i];
      const sig = `${Math.round(cy[i] * 2)}|${S.vis[i] ? 1 : 0}|${Math.round(freeLeft)}`;
      if (S.rowSig[i] === sig) continue;
      S.rowSig[i] = sig;
      for (let c = 0; c < cells.length; c++) {
        const st = cells[c].style;
        st.top = `${cy[i]}px`;
        st.left = `${freeLeft + c * COL_W}px`;
        st.visibility = S.vis[i] ? '' : 'hidden';
      }
    }

    if (!S.shown) {
      S.shown = true;
      const r0 = root;
      requestAnimationFrame(() => requestAnimationFrame(() => r0 && r0.classList.add('gtz-ready')));
    }

    // Current-time pill, anchored to Google's red line.
    let pill = S.pill;
    const lineY = lineRect ? lineRect.top + lineRect.height / 2 : null;
    if (lineY == null || lineY < band.top || lineY > band.bottom) {
      if (pill) {
        S.noLine = S.noLine || performance.now();
        if (performance.now() - S.noLine > 500) {
          pill.remove();
          S.pill = null;
        } else {
          pill.style.visibility = 'hidden';
        }
      }
    } else {
      S.noLine = 0;
      if (!pill) {
        pill = S.pill = el('gtz-pill', '');
        S.cellsEl.appendChild(pill);
      }
      pill.style.visibility = '';
      const text = formatTime(homeTz(), Date.now(), settings.hour12, true);
      if (pill.textContent !== text) pill.textContent = text;
      pill.style.top = `${lineY}px`;
      pill.style.left = `${labelRight + 2 - (pill.offsetWidth || 46)}px`;
    }
  }

  // Keep tracking for a short while after anything that might move the layout.
  let trackUntil = 0;
  let trackRaf = 0;
  function kick(ms = 900) {
    trackUntil = Math.max(trackUntil, performance.now() + ms);
    if (!trackRaf) trackRaf = requestAnimationFrame(tick);
  }
  function tick() {
    trackRaf = 0;
    try {
      track(false);
    } catch (e) {
      console.warn('[World Time] track failed', e);
    }
    // Still moving (an animation of any length)? Keep following it.
    if (S && S.moved) {
      S.moved = false;
      trackUntil = Math.max(trackUntil, performance.now() + 250);
    }
    if (performance.now() < trackUntil) trackRaf = requestAnimationFrame(tick);
  }

  // ResizeObserver callbacks run after layout and before paint in the same frame,
  // so repositioning here means no frame is ever painted with stale positions.
  const ro = new ResizeObserver(() => {
    try {
      track(false);
    } catch (e) {
      console.warn('[World Time] track failed', e);
    }
    kick(300);
  });

  /* ------------------------------------------------------------------ *
   * Hover: brighten the hovered row, fade the others
   * ------------------------------------------------------------------ */

  const DIM = '0.32';
  let ptr = null;
  let hoverRaf = 0;

  function scheduleHover() {
    if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0;
      applyHover();
    });
  }

  function applyHover() {
    if (!S || !S.geom || !ptr) return setHot(-1);
    const g = S.geom;
    if (ptr.x < g.freeLeft || ptr.x > g.gutterRight || ptr.y < g.top || ptr.y > g.bottom) return setHot(-1);
    // nearest visible label row
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < S.cy.length; i++) {
      if (!S.vis[i]) continue;
      const d = Math.abs(S.cy[i] - ptr.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    setHot(bestD <= S.spacing / 2 + 1 ? best : -1);
  }

  function setHot(idx) {
    if (!S || S.hot === idx) return;
    S.hot = idx;
    if (root) root.classList.toggle('gtz-hovering', idx >= 0);
    S.rows.forEach((cells, i) => cells.forEach((c) => c.classList.toggle('gtz-hot', i === idx)));
    // Google's own column (the calendar timezone) takes part too.
    S.items.forEach((item, i) => {
      const st = item.el.style;
      if (idx < 0) {
        st.removeProperty('opacity');
        st.removeProperty('color');
        st.removeProperty('transition');
      } else {
        st.setProperty('transition', 'opacity .12s, color .12s');
        st.setProperty('opacity', i === idx ? '1' : DIM);
        if (i === idx) st.setProperty('color', S.hotColor);
        else st.removeProperty('color');
      }
    });
  }

  document.addEventListener(
    'mousemove',
    (e) => {
      ptr = { x: e.clientX, y: e.clientY };
      if (S) scheduleHover();
    },
    { passive: true }
  );
  document.documentElement.addEventListener('mouseleave', () => {
    ptr = null;
    scheduleHover();
  });

  /* ------------------------------------------------------------------ *
   * Diagnostics (popup -> "Copy diagnostics"): structure only, no event data
   * ------------------------------------------------------------------ */

  function describe(n) {
    const r = n.getBoundingClientRect();
    const cs = getComputedStyle(n);
    return {
      tag: n.tagName.toLowerCase(),
      role: n.getAttribute('role'),
      cls: String(n.className || '').slice(0, 60),
      overflow: `${cs.overflowX}/${cs.overflowY}`,
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
      scroll: [n.scrollTop, n.scrollHeight, n.clientHeight],
    };
  }

  function diagnostics() {
    const main = document.querySelector('[role="main"]');
    const out = { version: 3, url: location.pathname.replace(/\d{4}\/\d+\/\d+/, 'Y/M/D'), viewport: [innerWidth, innerHeight], settings: { zones: (settings.zones || []).map((z) => z.tz), hour12: settings.hour12, home: settings.home } };
    out.main = main ? describe(main) : null;
    out.active = !!S;
    if (S) {
      out.cols = S.W;
      out.items = S.items.length;
      out.cy = S.cy.slice(0, 3).concat(S.cy.slice(-1)).map(Math.round);
      out.band = S.geom ? [S.geom.top, S.geom.bottom].map(Math.round) : null;
      out.visibleRows = S.vis.filter(Boolean).length;
      out.clip = S.clip.slice(0, 6).map(describe);
      out.firstLabel = describe(S.items[0].el);
      out.dstHints = settings.dstHints !== false;
      out.tzCheck = tzCheck;
      out.captionCandidates = captionCandidates;
      out.days = lastDays;
      out.caption = S.tzNode ? { text: S.tzNode.nodeValue.trim(), ...describe(S.tzNode.parentElement) } : null;
      out.nowLine = nowEl && nowEl.isConnected ? describe(nowEl) : null;
      const cell = S.rows[0] && S.rows[0][0];
      out.firstCell = cell ? { top: cell.style.top, left: cell.style.left, vis: cell.style.visibility || 'visible' } : null;
    }
    return out;
  }

  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (msg && msg.type === 'gtz-status') {
        const home = homeTz();
        reply({ home, tzCheck: tzCheck && tzCheck.home === home ? tzCheck : null });
        return;
      }
      if (msg && msg.type === 'gtz-diagnostics') {
        try {
          reply(diagnostics());
        } catch (e) {
          reply({ error: String(e) });
        }
      }
    });
  } catch (e) {
    /* messaging unavailable */
  }

  /* ------------------------------------------------------------------ *
   * Scheduling
   * ------------------------------------------------------------------ */

  // Throttle rather than debounce: Google mutates the DOM constantly while it
  // loads, and a debounce would keep pushing our first render back.
  let timer = 0;
  let timerAt = 0;
  function schedule(delay = 150) {
    const at = performance.now() + delay;
    if (timer && timerAt <= at) return;
    clearTimeout(timer);
    timerAt = at;
    timer = setTimeout(() => {
      timer = 0;
      try {
        update();
      } catch (e) {
        console.warn('[World Time] update failed', e);
      }
    }, delay);
  }

  let rebuilding = false;
  function rebuildNow() {
    if (rebuilding) return schedule(30);
    rebuilding = true;
    try {
      update();
    } catch (e) {
      console.warn('[World Time] rebuild failed', e);
    } finally {
      rebuilding = false;
    }
  }

  const observer = new MutationObserver((records) => {
    if (root && records.every((r) => root.contains(r.target))) return;
    kick(500);
    schedule(200);
  });

  function start() {
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
      kick(500);
      schedule(150);
    });
    window.addEventListener('popstate', () => schedule(100));
    // Scrolling can happen on any element: listen in the capture phase.
    document.addEventListener(
      'scroll',
      () => {
        kick(250);
        scheduleHover();
      },
      true
    );
    document.addEventListener('wheel', () => kick(250), { passive: true, capture: true });
    // Anything that animates layout (sidebar, all-day row, view switch).
    for (const type of ['transitionrun', 'transitionstart', 'animationstart']) {
      document.addEventListener(type, () => kick(900), true);
    }
    document.addEventListener('transitionend', () => kick(150), true);
    document.addEventListener('click', () => kick(900), true);
    setInterval(() => schedule(0), 20000); // keeps headings / DST / date fresh
    setInterval(() => kick(100), 1000); // safety net + keeps the now-pill moving
    schedule(0);
  }

  function loadSettings(cb) {
    try {
      chrome.storage.sync.get(DEFAULTS, (s) => {
        settings = { ...DEFAULTS, ...s };
        cb && cb();
      });
    } catch (e) {
      cb && cb();
    }
  }

  try {
    chrome.storage.onChanged.addListener(() => loadSettings(() => schedule(0)));
  } catch (e) {
    /* storage unavailable */
  }

  loadSettings(start);
})();
