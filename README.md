# World Time for Google Calendar

A Chrome extension that adds extra timezone columns to the left of the Google Calendar
time grid (Day / Week views), laid out like Notion Calendar. Your calendar's own timezone
column stays Google's.

```
 PST   CST   EST  │ MVD
20:00 22:00 23:00 │ 01:00
21:00 23:00 00:00 │ 02:00
```

## Features

- **Any number of timezones**, reorderable, with editable headings (auto-abbreviated: PST/PDT, BST, JST …).
- **Aligned to Google's own hour labels** through scrolling, the all-day row, sidebar toggling,
  density changes and week navigation. Works in light and dark mode.
- **Row hover:** hover a row and its times brighten across every column while the others fade.
- **Current-time pill** anchored to Google's red "now" line.
- **Daylight-saving hints:** in a week where a zone's clock changes, a dashed amber line marks the
  first affected day, with a chip like `PDT, CDT, EDT: -1h`, and the affected zone headings turn amber.
  When the change lands on the day right after the visible week, the same flag appears at the right
  edge with a "NEXT WEEK" eyebrow. Toggle it in the popup.
- **Timezone mismatch warning:** the popup compares Google's red now-line with the clock in the timezone
  the extension assumes. If your Google Calendar timezone differs from your computer's, a chip says so
  and offers one-click fixes.
- 12/24-hour clock, optional calendar-timezone override, enable/disable switch.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** and select this folder.
3. Reload any open Google Calendar tab, then click the extension icon to add timezones.

## How it works

Google Calendar's class names are obfuscated and change often, so nothing depends on them.
The content script finds the hour-label column by content (a run of ~23 consecutive hours),
measures each label's real on-screen position every frame while the layout is moving, and draws
the extra columns at exactly those positions. The calendar is shifted with a CSS rule on
`<html class="gtz-on">` so a freshly rendered grid is shifted from its first paint.

## Known limits

- Calendar has one gutter per week, so a week that crosses a DST change shows the conversion in
  force at the start of the week; the amber line and chip mark where it changes.
- "Calendar timezone: Auto" means your browser's timezone. If Google Calendar's own timezone setting
  differs, the popup shows a warning chip (it needs today's red now-line on screen to check) with
  suggested timezones; pick the right one there or in the dropdown.

## Troubleshooting

If something is misaligned after a Google Calendar update, open the popup on a Calendar tab and click
**Copy diagnostics**. It copies page structure and positions only (no event data), which makes the
detection in `content.js` (`findLabels`, `findTzCaption`, `findDayHeaders`) easy to adjust.

## Development

- `test/popup-test.html` renders the real popup with a faked `chrome.*` API (same server, `/test/popup-test.html`).
- `test/mock2.html` is a stand-in page for exercising the content script without Google Calendar
  (serve the folder with `python3 -m http.server` and open `/test/mock2.html`).
- `make_icons.py` regenerates the icons (standard library only).
