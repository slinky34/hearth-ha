# Hearth

Open Hearth from the sidebar, then go to **Settings**:

1. **Family**: add each person, pick a color, and tap the calendars that belong to them. Calendars not linked to anyone are treated as shared and always shown.
2. **Lists**: choose which to-do lists to show (none selected shows all).
3. **Display**: pick the weather entity, theme, screensaver delay, and so on.

**Photo folder** (Configuration tab): the folder Hearth shows photos from, including subfolders. It can be anywhere under `/media` or `/share`, for example `/media/Photos/Family`. The default is `/media/hearth`. Restart the add-on after changing it.

Adding events works for calendars that support it in HA (Local Calendar, Google, CalDAV). Subscribed ICS feeds are read-only.

To use Hearth on a tablet that isn't signed in to HA, set a host port for `8099/tcp` under Network. Anyone on your LAN can reach that port.
