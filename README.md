# Hearth

A self-hosted, Skylight-style family wall display that runs as a Home Assistant add-on. Put any tablet on the wall and get:

- **Calendar**: day, week, and month views of your Home Assistant calendars, color-coded per family member, with weather in the week header and tonight's dinner under each day. Add events from the screen.
- **Chores**: a per-person chore chart with stars, streaks, and a celebration when someone finishes everything.
- **Lists**: your HA to-do lists (Shopping List, Local To-do, Todoist, and others): add, check off, clear.
- **Meals**: a weekly breakfast, lunch, and dinner planner.
- **Photos and screensaver**: upload photos from your phone. After a set idle time the screen turns into a photo frame with the clock, weather, and what's next today.

Family members, chores, meals, and settings are stored in the add-on's `/data` folder. Photos are stored in `/media/hearth`. Nothing leaves your network.

## Install in Home Assistant

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fslinky34%2Fhearth-ha)

1. Click the button above, or in HA go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories** and add `https://github.com/slinky34/hearth-ha`.
2. Refresh the Add-on Store.
3. Install **Hearth**, start it, and turn on **Show in sidebar**.
4. Open it, go to **Settings**, add your family, and link each person to their calendars.

**Without GitHub:** copy the `hearth` folder into `/addons/hearth` on your HA box (with the Samba or SSH add-on). Then go to **Add-on Store → ⋮ → Check for updates** and it appears under *Local add-ons*.

### Using it on a wall tablet

- **Simplest:** sign in to HA on the tablet and open Hearth from the sidebar (it uses ingress, so it's protected by your HA login). A kiosk browser like Fully Kiosk works well.
- **Kiosk without an HA login:** in the add-on's **Network** settings, set a host port for `8099/tcp`, then open `http://<ha-ip>:<port>`. Anyone on your LAN can then use it, but only the calendar, to-do, and weather actions Hearth allows.

## Develop locally

```bash
cd hearth
npm install
npm run dev
```

Open http://localhost:5173. With no HA configured it runs in **demo mode** with sample calendars, lists, and weather. To use your real HA:

```bash
HA_URL=http://homeassistant.local:8123 HA_TOKEN=<long-lived token> npm run dev
```

Create the token from your HA profile → Security → Long-lived access tokens. For a production-style local run: `npm run build && npm start` (serves on :8099).

## How it's built

- `hearth/src`: React + TypeScript + Vite UI. All URLs are relative so it works under ingress.
- `hearth/server`: a dependency-free Node server. It serves the UI, proxies an allowlist of HA REST calls (calendars, `todo.*`, `calendar.create_event`, `weather.get_forecasts`) with the Supervisor token, stores the JSON data, and manages photos. `mock.js` is the demo-mode stand-in for HA.
- `hearth/Dockerfile`: builds the UI in a Node stage and runs it on the HA base image.

Inspired by [Beacon](https://github.com/asachs01/beacon).
