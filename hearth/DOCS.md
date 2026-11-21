# Hearth

Open Hearth from the sidebar, then go to **Settings**:

1. **Family**: add each person, pick a color, and tap the calendars that belong to them. Calendars not linked to anyone are treated as shared and always shown.
2. **Lists**: choose which to-do lists to show (none selected shows all).
3. **Display**: pick the weather entity, theme, screensaver delay, and so on.

**Photo folder** (Configuration tab): the folder Hearth shows photos from, including subfolders. It can be anywhere under `/media` or `/share`, for example `/media/Photos/Family`. The default is `/media/hearth`. Restart the add-on after changing it.

Adding events works for calendars that support it in HA (Local Calendar, Google, CalDAV). Subscribed ICS feeds are read-only.

To use Hearth on a tablet that isn't signed in to HA, set a host port for `8099/tcp` under Network. Anyone on your LAN can reach that port.

**Recipes:** add Home Assistant's **Mealie** integration and your recipes and meal plan show up on the Recipes screen. To see recipe photos, also set **Mealie address** (`mealie_url`, for example `http://192.168.1.20:9000`) on the Configuration tab.

**Music Assistant playlists** only play on Music Assistant's own speaker entities. If a speaker appears twice (for example Sonos and Music Assistant), Hearth automatically sends playlists to the Music Assistant one.

**Cocktails (Bar Assistant):** set **Bar Assistant address** (for example `http://192.168.1.20:3000`), an **API token** (in Bar Assistant: Settings → Personal access tokens), and optionally a **Bar ID** on the Configuration tab, then restart. A Cocktails tab appears under Recipes.

**Event locations:** suggestions come from Photon (photon.komoot.io, OpenStreetMap data) through the add-on. Only the text typed into the Location box is sent.

**Grocy:** with the Grocy integration from HACS, Grocy works on its own. With only the Grocy add-on, create an API key in Grocy (wrench icon → **Manage API keys**), paste it into **Grocy API key** on the Configuration tab, and restart Hearth. Hearth finds the add-on by itself; set **Grocy address** only if Grocy runs elsewhere.

**Photos from Immich:** set **Immich address** (for example `http://192.168.1.20:2283`) and an **Immich API key** (in Immich: Account settings → API keys) on the Configuration tab, then restart. Choose albums in Hearth under Settings → Photos.

## Wall tablet setup (recommended)

- **Tablet:** any 10–15" Android tablet works well (for example a Lenovo Tab or Samsung Galaxy Tab). Older Fire tablets work, but are slower with the busier screensavers.
- **Browser:** [Fully Kiosk Browser](https://www.fully-kiosk.com/) in kiosk mode.
  - Set the Start URL to your Home Assistant address (Hearth in the sidebar), or to Hearth's direct port.
  - Turn on "Keep screen on", "Launch on boot", and "Remote administration".
  - Add HA's **Fully Kiosk Browser** integration. Then pick its "Screen" switch in **Settings → Sleep mode**, so Hearth can turn the screen off at night.
- **Mounting:** a slim VESA or adhesive wall mount, with a right-angle USB-C cable run through the wall or in a paintable cord cover, for the framed look.
- **In Hearth:** turn on **Kiosk mode** on the tablet and set a PIN. Rewards approvals then need that PIN too.

## Magic Import

Magic Import needs an AI provider in Home Assistant (for example OpenAI, Google Gemini, Anthropic, or Ollama) with **AI Task** set up (Settings → Devices & services). Photos are saved briefly to `/media/hearth-import` so the AI can read them, and are deleted after a day.

## Leave-by times

Add the **Waze Travel Time** integration in Home Assistant (any route), then turn on **Settings → Calendar → Leave-by times**.

## Cameras and Frigate

Pick cameras under **Settings → Cameras**; any Home Assistant camera works. Frigate's recent-detections feed connects by itself when Frigate runs as a Home Assistant add-on (regular, Full Access, or Beta). If Frigate runs on another machine, set **Frigate address** on the Configuration tab to `http://<frigate-ip>:5000`, and make sure port 5000 is published (Frigate's login port, 8971, won't work).

## Phone app

1. On the add-on's **Configuration** tab, set a host port for `8099/tcp` (for example 8099) and restart.
2. On your phone, on home Wi-Fi, open `http://<your-HA-IP>:8099`.
3. iPhone: Share → **Add to Home Screen**. Android: ⋮ → **Add to Home screen**.

Away from home, open Hearth from the Home Assistant Companion app's sidebar, or use a VPN like Tailscale.
