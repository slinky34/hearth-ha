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

**Photos from Immich:** set **Immich address** (for example `http://192.168.1.20:2283`) and an **Immich API key** (in Immich: Account settings → API keys) on the Configuration tab, then restart. Choose albums in Hearth under Settings → Photos.
