# Chrome Web Store listing: World Time for Google Calendar

Copy each block into the matching field of the developer dashboard.

## Store listing tab

**Name** (from manifest): World Time for Google Calendar

**Summary** (from manifest, max 132 chars):
See several timezones beside the Google Calendar time grid. Hover to compare hours and get daylight saving notices.

**Category:** Productivity  **Language:** English

**Detailed description**

World Time adds extra timezone columns to the left of the Google Calendar time grid, so you can see what time it is for your teammates and customers without leaving your calendar or doing the maths.

• Add as many timezones as you like, reorder them and rename the headings (PST, GMT, JST...)
• Columns stay perfectly lined up with Google's own hour labels, through scrolling, the all-day row, sidebar changes and week navigation
• Hover a row and that hour lights up across every timezone while the others fade, with an optional thin line marking the hour across the calendar grid
• A current-time marker follows Google's red "now" line
• Daylight saving notices: when a clock changes during the week you are viewing, a dashed amber line marks the first affected day and a chip tells you how much the times shift (for example "PDT, CDT, EDT: -1h"). The same flag appears at the edge of the week before the change, labelled "NEXT WEEK". You can turn the notices off.
• A heads-up in the popup if Google Calendar is set to a different timezone than the one the extension assumes, with one-click suggestions
• 12 or 24-hour clock, light and dark mode, works on Day and Week views

Private by design: World Time does not collect or send any calendar data. It only reads the page you are looking at to line its columns up, and it only runs on calendar.google.com. Your timezone choices are saved in your Chrome profile (and sync through Chrome sync if you use it).

World Time for Google Calendar is an independent extension and is not affiliated with or endorsed by Google.

**Screenshots** (640x400 PNG, in this folder, upload in this order; the store allows up to 5):
1. `screenshot-1-hover.png`: hover a row to compare one hour across timezones
2. `screenshot-2-dst-midweek.png`: daylight saving change inside the week
3. `screenshot-3-dst-next-week.png`: "next week" heads-up at the edge of the week before a change
4. `screenshot-4-settings.png`: the popup, where you add timezones and set preferences

**Icon:** 128x128 `icons/icon128.png` (already inside the package).
Heads-up: the current icon uses the shape of Google's Calendar logo. The store's branding and impersonation rules can reject icons that resemble a Google product, so if the review flags it, swap in an original icon (`icons/source.svg` + `./make_icons.py`) and resubmit.

Optional, not prepared: small promo tile (440x280) and marquee (1400x560).

## Privacy practices tab

**Single purpose description**
Show additional timezone columns next to the time grid in Google Calendar so users can compare hours across timezones.

**Permission justifications**

- `storage`: saves the user's chosen timezones, column headings and display preferences (24-hour clock, daylight saving notices, calendar timezone) via chrome.storage.sync so they follow the user's Chrome profile. Nothing else is stored.
- Host access (content script match `https://calendar.google.com/*`): the extension has to read the position of Google Calendar's hour labels and day headers on the page in order to draw the extra columns exactly beside them. It runs only on this site and makes no network requests.

**Remote code:** No. All code ships inside the package; no remote scripts, no `eval`.

**Data usage disclosures**
- The extension reads page content (hour labels, day numbers, the current-time line) locally in order to position its columns. This content is not stored, not transmitted and not shared.
- It does not collect personally identifiable information, health, financial, authentication, location or communications data, web history or user activity.
- Certify: data is not sold, not used for unrelated purposes, and not used for creditworthiness or lending.

**Privacy policy URL:** not required when no user data is collected or transmitted. If the dashboard insists, host a one-paragraph policy (a GitHub Pages page or a public gist) that says: "World Time for Google Calendar does not collect, transmit or share any user data. Settings are stored in your browser via chrome.storage.sync."

## Before you submit

1. A Google developer account with the one-time Chrome Web Store registration fee.
2. Upload `dist/world-time-for-google-calendar-<version>.zip` (build it with `./package.sh`).
3. For each update, bump `version` in `manifest.json` and rebuild; the store rejects a repeated version number.
4. Reviews for extensions that run on Google properties can take a few days.
