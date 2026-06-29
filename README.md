# Line Dance Library — Web (PWA)

A lightweight web version of the **Line Dance Library** app — a personal line-dance song
library you can browse, tag, and jump straight into Spotify. Built as an installable PWA so it
works from the home screen on any phone, today, while the native iOS App Store version is in
review.

It is a deliberate sibling of the native app: it uses the **same JSON export schema**, so a
library built here imports cleanly into the iOS app later (`Export library` here → `Import` there).

## What it does

- Browse, search, and filter (difficulty / status) a song library
- Tag each song with a **difficulty** (Novice / Intermediate / Advanced) and a **status**
  (Yup / Practicing / Nope)
- **Open in Spotify** — exact track links (opens the Spotify app), with Apple Music search as a
  secondary option
- Add / edit / delete songs by hand
- Export / import the library as JSON (no-overwrite merge; learning status stays private)
- Works offline once installed; album art is pulled from Spotify's public oEmbed when available

## What it does not do (yet)

Live one-tap song recognition (ShazamKit) is a native-only feature and arrives in the App Store
version.

## Tech

Plain HTML/CSS/JS, no build step. Deployed as a static site. Data lives in `localStorage`.

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

## Notes

- The "Happy Birthday, Ana!" banner is gated behind `SHOW_BIRTHDAY` at the top of `app.js`.
  Set it to `false` to remove it.
- Seed data lives in `seed.js` (generated from the source CSV, with exact Spotify track links).
