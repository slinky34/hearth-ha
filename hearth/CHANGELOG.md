# Changelog

## 0.15.1
- **Recipes meal plan:** meals you removed or replaced on the Meals screen no longer show under Recipes → Meal plan.
- **New lists show up:** if you've picked specific lists in Settings, lists added to Home Assistant later (like a new AnyList list) appear in a "Not shown" row at the top of Lists. Tap one to add it.

## 0.15.0
- **Frigate live view:** Frigate's own cameras appear on the Cameras screen and stream live straight from Frigate, which is smoother than going through Home Assistant. With no cameras chosen, every Frigate camera shows.
- **Live camera on Today:** a camera column on Today with live video and the latest detections. Tap the video for full screen, or a detection for its snapshot. Choose the camera, or turn it off, under Settings → Cameras → Today screen.
- **Doorbell:** Frigate cameras can be picked as the doorbell camera, and the pop-up now plays live video instead of a still that refreshes every second.
- **Grocy detection:** Hearth now finds Grocy's sensors through Home Assistant's entity registry, so renamed or translated sensors work. It also checks installed integrations in a way that works from inside the add-on.
- Video streams pause while the screen is hidden.

## 0.14.2
- **Frigate is found automatically.** If the Frigate address doesn't answer, or isn't set, Hearth looks for a running Frigate add-on (regular, Full Access, or Beta) and connects to it. The Frigate address is now only needed when Frigate runs on another machine.
- Settings → Integrations shows which Frigate address Hearth is using, and clearer help when it can't connect.
- The add-on can now read basic Supervisor info, which it uses to find Frigate.

## 0.14.1
- **Remove meals:** tap a planned meal to open it, then tap **Remove**, or change it and tap **Save**. Empty slots still let you type straight in.
- Mealie and Grocy meals can be removed too. This hides them in Hearth; delete them in Mealie or Grocy to remove them everywhere. You can also replace them with something else.
- Tap anywhere on a Mealie meal to open it. Tapping the recipe name still opens the recipe.

## 0.14.0
- **Redesigned phone layout:** a proper phone app instead of a squeezed tablet screen.
  - A bottom bar with Today, Calendar, Tasks, and Lists. Everything else is under **More**.
  - A compact header that stays put. The family filter scrolls sideways.
  - Today and Tasks stack each person top to bottom, instead of columns you swipe sideways.
  - Calendar offers Day, Schedule, and Month on phones.
  - Meals shows one card per day.
  - Pop-ups open as bottom sheets that fit the screen.
- The status bar color matches the app, and iPhone no longer zooms in when you tap a text field.

## 0.13.0
- **Cameras screen:** live snapshots from any Home Assistant cameras (Frigate, UniFi Protect, Reolink, and others). Tap a camera for full-screen live video.
- **Frigate detections:** a feed of recent person, car, package, and animal detections with thumbnails. Set the new **frigate_url** add-on option (for example `http://ccab4aaf-frigate:5000`).
- Frigate in Settings → Integrations.
- Frigate "person occupancy" sensors can trigger the doorbell pop-up.
- The sidebar fits better with many screens.

## 0.12.0
- **Faster updates:** Hearth now ships as ready-made images, so updating takes seconds instead of rebuilding on your HA box.
- **Rewards:** a reward shop where kids spend the stars they earn. Grown-ups approve requests (with the kiosk PIN if you've set one), and a request can also notify your phones.
- **Sleep mode:** at night the screen dims to a faint clock or goes black. If you pick a Fully Kiosk "Screen" switch, the add-on turns the tablet screen off at bedtime and on again in the morning.
- **Magic Import:** snap a flyer or paste an email, and Home Assistant's AI Task finds the events for you to check and add.
- **Family notes:** sticky notes on Today, optionally read aloud on a speaker.
- **Who's home:** green or grey dots on each person, from their HA person entity.
- **Doorbell pop-up:** when the doorbell rings, the camera shows on screen.
- **Leave-by times:** drive time and when to leave for events with a location (Waze Travel Time).
- **Birthdays:** automatic countdown chips, plus a celebration banner on the day.
- **Chores:** rotate weekly between kids, or set one-off chores on a date.
- **Profile photos** for each person.
- **Quick add:** the + on Today adds an event, Magic Import, a list item, a meal, or a note.
- **Installable app:** add Hearth to a phone's home screen.
- **Backup and restore** in Settings → About.
- **Sidebar:** hide screens you don't use, and optionally show Rewards inside Tasks.

## 0.11.0
- **Screensaver styles:** Ken Burns, Classic, Floating, Photo Wall, Vintage Prints, Sliding Panels, Flip-up, Reflections, Photo Mobile, or Random (a different one each time).
- New **Settings → Screensaver** section:
  - The style picker and a **Preview** button.
  - Idle time and photo interval.
  - Shuffle or in-order photos.
  - On/off switches for the clock and for the weather/next events/music corner.

## 0.10.0
- **Photos from Immich:**
  - Set the Immich address and API key on the Configuration tab.
  - Pick albums (and optionally your favorites) in Settings → Photos.
  - Those photos join the photo frame and screensaver alongside the local photo folder. Hearth uses Immich's preview-size images and never deletes anything in Immich.
  - Immich also shows in Settings → Integrations, including any connection problem.
- **Song lists** now show the song title first and the artist underneath.

## 0.9.1
- Fixed the countdown and per-person progress chips on Today, whose top edge was cut off.

## 0.9.0
- **Music search:** search your Music Assistant library for songs, albums, playlists, and artists from the Music screen. Tap a song or artist to play it, or an album or playlist to see its songs.
- **Collapsible Tasks:** fold a person's column into a slim strip that still shows their progress.
- **Collapsible Meals:** fold a meal row (for example Breakfast) into a thin bar showing how many are planned.
- Folded columns and rows are remembered on each screen.

## 0.8.2
- **Collapsible lists:** tap a list's header on the Lists screen to fold it down to its name and item count. Each screen remembers which lists are folded.

## 0.8.1
- **Bar Assistant fix:** Hearth now finds the API itself, whether it's at `/api`, `/bar/api` (the usual Docker setup with the Salt Rim web app), or the address as entered. Connection problems now show on the Cocktails tab, in Settings → Integrations, and in the add-on log, instead of the tab just not appearing.
- **Collapsible Settings:** every section folds up, with a short summary when closed. Each screen remembers which sections are open.

## 0.8.0
- **Edit and delete events:** tap an event, then Edit or Delete.
  - Edit reopens the form pre-filled, so you can change the title, time, location, calendars, or who's going.
  - Picking or un-picking calendars adds the event to or removes it from them.
  - Notes in the description are kept.
  - Deleting an event that's in several calendars removes it from all of them.
  - For a repeating event, only that one occurrence changes.
- **Edit list items:** tap ✎ on an item to rename or delete it.

## 0.7.0
- **Bar Assistant cocktails:** set the address and API token on the Configuration tab and a Cocktails tab appears in Recipes, with glass, method, and garnish, the ingredients, and step-by-step mixing mode.
- **New events:**
  - Pick **several calendars** at once, and the event is added to each one.
  - Tag family members under **Who's going?**. It's saved in the event description as a "Who: …" line, so it works on any calendar.
  - The same event in several calendars now shows once, with everyone's colors.
- **Location suggestions** while typing an event location (OpenStreetMap / Photon, favoring places near home).
- **Shuffle and repeat** buttons in the music controls.
- **Settings:**
  - New **Integrations** section showing what's connected and how to set up the rest.
  - Speakers, lists, and home controls now use a compact search picker instead of long rows of buttons.

## 0.6.0
- **Skip back/forward fixed:** when a speaker shows up twice in Home Assistant (its own integration plus Music Assistant), Hearth now treats it as one speaker. Each command (play/pause, skip, volume) goes to whichever of the two supports it, so skip works even if the speaker's own entity can't.
- **Playlists and albums open a song list** instead of playing right away. Use Play all or Shuffle, or tap a song to play from there.
- New **Albums** section from your Music Assistant library.

## 0.5.0
- **Recipes (Mealie):** a new Recipes screen with your Mealie meal plan and searchable recipes. Each recipe shows its photo, ingredients, and steps.
- **Cook mode:** follow a recipe step by step in large text, with an ingredient checklist and ½× / 1× / 2× scaling. When a step mentions a time, there's a one-tap timer for it, and the screen stays on while you cook.
- From a recipe you can add it to the Mealie meal plan, or send its ingredients to any shopping list.
- Mealie meal-plan entries appear in the Meals grid; tap one to open the recipe.
- New optional add-on setting **mealie_url** (your Mealie address), used only to show recipe photos.
- **Music fixes:**
  - When a speaker rejects a command, Hearth now shows the reason instead of silently doing nothing.
  - Controls a speaker doesn't support are hidden or greyed out.
  - Placeholder titles like "Not Provided" are no longer shown as the song name.
  - Playlists play on a Music Assistant player, the only kind that can play them, with a "Play on" picker when there's more than one.

## 0.4.0
- **Timers:** several named timers at once, with presets. They're shared across screens, so a timer started on your phone rings on the wall display. The alarm chimes and flashes until someone dismisses it.
- **Notifications:** on-screen reminders before events. The add-on can also send event reminders, timer alerts, and a daily "chores left" message to phones through Home Assistant notify services.
- **Themes:** Skylight, Midnight, Midnight Light, Nord, Dracula, Monokai, Rose, and Forest, plus Hearth, each with light/dark or automatic appearance.
- **Languages:** English, Deutsch, Español, Français, Italiano, 日本語, 한국어, Nederlands, and Português, with dates in each language.

## 0.3.0
- Calendar views: Day, Week, Schedule, Grid, and Month. Striped shared events with avatar badges, countdown chips, per-person progress, and a family name in the header.
- Tasks: per-person routine columns (Morning / Afternoon / Evening / Chores) with big emoji cards, or a Compact layout.
- Today: the Everyone view splits into a column per person.
- Music (media players and Music Assistant), Home controls, Grocy, and TaskMate.
- Photo folder option (any folder under /media or /share, including subfolders).
- Readable labels for raw data items in to-do lists.

## 0.2.0
- Today home screen; per-device kiosk mode with an optional PIN.

## 0.1.0
- First release: calendar, chores, lists, meals, photos, and screensaver.
