# Changelog

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
