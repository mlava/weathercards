Weathercards
============

Weathercards inserts a compact weather summary and a multi‑day forecast as styled cards.

Overview
--------
- Fetches current conditions and daily forecast from OpenWeather (One Call 3.0).
- Inserts a header block (location + update time) and child cards for each day.
- Supports metric or imperial units.
- Optional alert pill: when an alert exists, a small “Alert” pill appears; hover shows the alert text as a tooltip.
- Includes CSS to render the cards in a 3‑column grid with background images by condition.

Setup
-----
1) Install the extension.
2) Add your OpenWeather API key.
3) Set a default location (e.g., `melbourne,au`).
4) Choose units (metric or imperial).
5) Choose how many days to show (Today Only, or 2‑8).

Usage
-----
- Command Palette: run “Weathercards”.
- SmartBlock: use `<%WEATHERCARDS%>`.
- Hotkey: assign one in Roam Research Settings > Hotkeys.

Settings
--------
- API Key: your OpenWeather key.
- Location: city and country (e.g., `berlin,de`).
- Units: `metric` or `imperial`.
- How Many Days: Today Only, or 2‑8.

Notes
-----
- The grid and card styling live in `extension.css`.
- Weathercards is an update of David Eaton’s original Weather Forecast SmartBlock. Archived instructions are at:
  https://github.com/dvargas92495/SmartBlocks/issues/211
