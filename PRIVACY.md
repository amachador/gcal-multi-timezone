# Privacy Policy: World Time for Google Calendar

_Last updated: 26 November 2026_

World Time for Google Calendar ("the extension") adds extra timezone columns to the Google Calendar time grid.
This policy explains what the extension does with data. In short: **it does not collect, transmit, sell or share
any personal data.**

## What the extension reads

On `calendar.google.com` the extension reads the layout of the page you are looking at (the position of the hour
labels, the day headers and the current-time line) so it can draw its columns exactly beside them. It also reads
your browser's timezone to know which timezone to assume for Google Calendar. This happens entirely on your
device. The extension does not read, store or use the titles, descriptions, guests, locations or any other
content of your events.

## What the extension stores

Your settings are saved with `chrome.storage.sync`:

- the timezones you add, their order and any headings you rename
- whether the extension is on, 12 or 24-hour clock, daylight saving notices, the hovered-hour line
- the calendar timezone override, if you choose one

These settings stay in your Chrome profile. If you have Chrome Sync turned on, Chrome syncs them across your
devices through your Google account, under Google's own privacy terms. The extension itself never receives a copy.

## What the extension does not do

- It makes no network requests and sends nothing to the developer or to any third party.
- It has no analytics, tracking, advertising or remote code.
- It does not collect personally identifiable information, health, financial, authentication, location or
  communications data, web history or user activity.
- It runs only on `https://calendar.google.com/*`.

## Permissions

- `storage`: to save the settings listed above.
- Access to `https://calendar.google.com/*`: to position the columns beside Google Calendar's time grid.

## Your choices

You can change or clear your settings in the extension's popup, or remove the extension at any time from
`chrome://extensions`, which deletes its stored settings.

## Changes to this policy

If the extension's data handling ever changes, this policy will be updated and the date above revised.

## Contact

Questions about this policy or the extension: open an issue at
https://github.com/amachador/gcal-multi-timezone/issues

_World Time for Google Calendar is an independent extension and is not affiliated with or endorsed by Google._
