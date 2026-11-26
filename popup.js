const DEFAULTS = {
  enabled: true,
  hour12: false,
  dstHints: true,
  home: 'auto',
  zones: [
    { tz: 'America/Los_Angeles', label: '' },
    { tz: 'America/Chicago', label: '' },
    { tz: 'America/New_York', label: '' },
  ],
};

const $ = (id) => document.getElementById(id);
const allZones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
if (!allZones.includes('UTC')) allZones.push('UTC');
const POPULAR = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Toronto',
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Sao_Paulo',
  'America/Argentina/Buenos_Aires', 'America/Montevideo', 'Europe/London', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Rome', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Moscow', 'Africa/Cairo',
  'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Shanghai',
  'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
];
const LEGACY = new Set(['Asia/Calcutta', 'Asia/Katmandu', 'Asia/Saigon', 'Asia/Rangoon', 'Asia/Thimbu', 'Asia/Ulan_Bator', 'Asia/Dacca', 'Asia/Macao', 'Asia/Ujung_Pandang', 'America/Buenos_Aires', 'America/Indianapolis', 'America/Louisville', 'America/Godthab', 'Europe/Kiev', 'Pacific/Samoa']);
const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

let settings = { ...DEFAULTS };

function save() {
  chrome.storage.sync.set(settings);
}

function nowIn(tz, hour12) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      hourCycle: hour12 ? 'h12' : 'h23',
      weekday: 'short',
    }).format(new Date());
  } catch (e) {
    return '';
  }
}

const pretty = (tz) => tz.replace(/_/g, ' ');

// Resolve "london", "Los Angeles", "America/Chicago", "montevideo" ... to an IANA id.
function resolveZone(input) {
  const q = input.trim().toLowerCase().replace(/\s+/g, '_');
  if (!q) return null;
  const exact = allZones.find((z) => z.toLowerCase() === q);
  if (exact) return exact;
  const byCity = allZones.filter((z) => z.split('/').pop().toLowerCase() === q);
  if (byCity.length === 1) return byCity[0];
  const partial = allZones.filter((z) => z.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return partial.find((z) => z.split('/').pop().toLowerCase().startsWith(q)) || partial[0];
  return null;
}

function renderHomeSelect() {
  const sel = $('home');
  sel.textContent = '';
  const auto = document.createElement('option');
  auto.value = 'auto';
  auto.textContent = `Auto (${pretty(browserTz)})`;
  sel.appendChild(auto);
  for (const z of allZones) {
    const o = document.createElement('option');
    o.value = z;
    o.textContent = pretty(z);
    sel.appendChild(o);
  }
  sel.value = allZones.includes(settings.home) ? settings.home : 'auto';
}

function renderZones() {
  const ul = $('zones');
  ul.textContent = '';
  $('empty').hidden = settings.zones.length > 0;

  settings.zones.forEach((z, i) => {
    const li = document.createElement('li');

    const label = document.createElement('input');
    label.className = 'label';
    label.placeholder = 'auto';
    label.value = z.label || '';
    label.maxLength = 6;
    label.title = 'Column heading (leave empty for the automatic abbreviation)';
    label.addEventListener('change', () => {
      settings.zones[i].label = label.value.trim();
      save();
    });

    const name = document.createElement('div');
    name.className = 'name';
    name.innerHTML = '<b></b><span></span>';
    name.firstChild.textContent = pretty(z.tz);
    name.lastChild.textContent = nowIn(z.tz, settings.hour12);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const mk = (txt, title, cls, fn, disabled) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `icon ${cls || ''}`;
      b.textContent = txt;
      b.title = title;
      b.disabled = !!disabled;
      b.addEventListener('click', fn);
      return b;
    };
    const move = (d) => () => {
      const j = i + d;
      [settings.zones[i], settings.zones[j]] = [settings.zones[j], settings.zones[i]];
      save();
      renderZones();
    };
    actions.append(
      mk('↑', 'Move left', '', move(-1), i === 0),
      mk('↓', 'Move right', '', move(1), i === settings.zones.length - 1),
      mk('✕', 'Remove', 'remove', () => {
        settings.zones.splice(i, 1);
        save();
        renderZones();
      })
    );

    li.append(label, name, actions);
    ul.appendChild(li);
  });
}

function showError(msg) {
  const e = $('error');
  e.textContent = msg || '';
  e.hidden = !msg;
}

// Offset (minutes) of a zone right now, from Intl's "GMT-03:00" style name.
function offsetNow(tz) {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    const m = part && /GMT([+\-−])(\d{1,2})(?::(\d{2}))?/.exec(part.value);
    if (!m) return 0; // plain "GMT"
    return (m[1] === '+' ? 1 : -1) * (+m[2] * 60 + +(m[3] || 0));
  } catch (e) {
    return null;
  }
}

const fmtSpan = (min) => {
  const a = Math.abs(min);
  return a % 60 === 0 ? `${a / 60}h` : `${Math.floor(a / 60)}h ${a % 60}m`.replace(/^0h /, '');
};

// Ask the open Calendar tab whether its clock matches the timezone we assume.
async function checkCalendarTz() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const st = await chrome.tabs.sendMessage(tab.id, { type: 'gtz-status' });
    const c = st && st.tzCheck;
    if (!c || c.status !== 'mismatch') return;

    const target = offsetNow(st.home) + c.diffMin;
    const mine = settings.zones.map((z) => z.tz).filter((tz) => offsetNow(tz) === target);
    const known = POPULAR.filter((tz) => offsetNow(tz) === target);
    const others = allZones.filter((tz) => !/^(Etc|Antarctica|SystemV|US\/|Canada\/)/.test(tz) && !LEGACY.has(tz) && offsetNow(tz) === target);
    const picks = [...new Set([...mine, ...known, ...others])].slice(0, 3);

    $('tzwarn-text').textContent =
      `Google Calendar's clock looks ${fmtSpan(c.diffMin)} ${c.diffMin > 0 ? 'ahead of' : 'behind'} ${pretty(st.home)}, ` +
      `so the extra columns may be off. Set your Calendar timezone:`;
    const box = $('tzwarn-actions');
    box.textContent = '';
    picks.forEach((tz) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = pretty(tz.split('/').pop());
      b.title = tz;
      b.addEventListener('click', () => {
        settings.home = tz;
        save();
        renderHomeSelect();
        $('tzwarn').hidden = true;
      });
      box.appendChild(b);
    });
    $('tzwarn').hidden = false;
  } catch (e) {
    /* not a Calendar tab, or the page hasn't loaded the extension */
  }
}

function init() {
  const dl = $('tz-list');
  for (const z of allZones) {
    const o = document.createElement('option');
    o.value = z.replace(/_/g, ' ');
    dl.appendChild(o);
  }

  $('enabled').checked = settings.enabled;
  $('hour24').checked = !settings.hour12;
  $('dst').checked = settings.dstHints !== false;
  renderHomeSelect();
  renderZones();
  checkCalendarTz();

  $('enabled').addEventListener('change', (e) => {
    settings.enabled = e.target.checked;
    save();
  });
  $('hour24').addEventListener('change', (e) => {
    settings.hour12 = !e.target.checked;
    save();
    renderZones();
  });
  $('dst').addEventListener('change', (e) => {
    settings.dstHints = e.target.checked;
    save();
  });
  $('home').addEventListener('change', (e) => {
    settings.home = e.target.value;
    save();
  });
  $('add').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('tz-input');
    const tz = resolveZone(input.value);
    if (!tz) return showError(`Couldn't find "${input.value.trim()}". Try a city name or e.g. Europe/London.`);
    if (settings.zones.some((z) => z.tz === tz)) return showError(`${pretty(tz)} is already added.`);
    showError('');
    settings.zones.push({ tz, label: '' });
    input.value = '';
    save();
    renderZones();
  });


  setInterval(renderZones, 30000);
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = { ...DEFAULTS, ...s };
  init();
});
