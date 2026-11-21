# Hearth

A self-hosted, Skylight-style family wall display that runs as a Home Assistant add-on. Put any tablet on the wall and get:

- **Today**: the home screen. With *Everyone* selected it splits into a column per person (their events and tasks) plus a Family column for shared calendars.
- **Calendar**: five views you can switch between or set as the default: Day, Week (columns), Schedule (day cards), Grid (hour grid, 5 days or the full week), and Month. Shared events get striped colors and avatar badges. Above the calendar are countdown chips ("🌴 Vacation 48 days") and each person's chore progress.
- **Tasks**: Skylight-style per-person columns with Morning / Afternoon / Evening / Chores progress rings, big emoji task cards, stars, and streaks. There's also a Compact layout. Each person can be linked to an HA to-do list, such as a TaskMate child list.
- **Lists**: HA to-do lists (Shopping List, Local To-do, AnyList, Todoist, and others), plus a Grocy shopping list and expiring products. Raw data that other apps write into lists is shown as a short label.
- **Meals**: a weekly planner. The Grocy meal plan fills empty slots.
- **Recipes (Mealie)**: your Mealie meal plan and recipes, cook mode with large step-by-step text, an ingredient checklist, scaling, and one-tap timers for timed steps; add a recipe to the meal plan or its ingredients to a shopping list.
- **Music**: the now-playing pill in the header, full controls (play/pause, skip, volume) for any HA media player, and Music Assistant playlists.
- **Home**: tap tiles for lights, switches, fans, scenes, and scripts, plus sensor readouts. Locks, alarms, and garage doors are intentionally excluded.
- **Timers**: several named timers at once, with presets (Pasta, Oven, Homework…). They're shared across screens, and the alarm chimes and flashes until dismissed.
- **Notifications**: on-screen reminders before events. The add-on can also send event reminders, timer alerts, and a daily "chores left" message to phones through HA notify services.
- **Themes**: Hearth, Skylight, Midnight, Midnight Light, Nord, Dracula, Monokai, Rose, and Forest, with light/dark/automatic appearance.
- **Languages**: English, Deutsch, Español, Français, Italiano, 日本語, 한국어, Nederlands, and Português.
- **Photos and screensaver**: photos from any folder under `/media` or `/share`, including subfolders. The screensaver shows the clock, weather, what's next, and what's playing.

### Integrations

All integrations go through Home Assistant, so there are no extra logins in Hearth:

| Integration | What Hearth uses |
|---|---|
| Any HA calendar (Google, iCloud/CalDAV, Local Calendar, Outlook…) | events, adding events |
| HA to-do lists (Shopping List, Local To-do, AnyList, Todoist…) | Lists screen |
| TaskMate | link a child's to-do list to a person on the Tasks screen |
| Mealie | meal plan, recipe search, cook mode, add to plan |
| Bar Assistant (direct, with an API token) | cocktail recipes and mixing mode |
| Grocy (custom-components/grocy) | shopping list, chores, expiring products, meal plan |
| Media players / Music Assistant | now playing, controls, playlists |
| Weather | current conditions and forecast |
| Lights, switches, fans, scenes, scripts, sensors | Home screen |

Family members, chores, meals, and settings are stored in the add-on's `/data` folder. Photos come from `/media/hearth` by default. Change it with the add-on's **Photo folder** option. Nothing leaves your network.

## Install in Home Assistant

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fslinky34%2Fhearth-ha)

1. Click the button above, or in HA go to **Settings → Add-ons → Add-on Store → ⋮ → Repositories** and add `https://github.com/slinky34/hearth-ha`.
2. Refresh the Add-on Store.
3. Install **Hearth**, start it, and turn on **Show in sidebar**.
4. Open it, go to **Settings**, add your family, and link each person to their calendars.

**Without GitHub:** copy the `hearth` folder into `/addons/hearth` on your HA box (with the Samba or SSH add-on). Then go to **Add-on Store → ⋮ → Check for updates** and it appears under *Local add-ons*.

### Using it on a wall tablet

**Kiosk mode** (Settings → Kiosk mode, or add `?kiosk` to the direct-port address) turns a screen into a locked wall display. It goes fullscreen (hiding HA's sidebar), keeps the screen awake, hides the cursor, and locks Settings, chore editing, and photo deletion. It only applies to that device. To unlock, hold the 🏡 logo for 2 seconds or tap **Locked**, then enter the optional PIN. The PIN is a child lock, not real security.

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
