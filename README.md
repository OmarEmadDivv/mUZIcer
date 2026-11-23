# Muzicer

An offline music player for iPhone. It's a web app (PWA) that you install to your home screen.

## Features
- Import audio from the Files app (mp3, m4a, aac, wav, flac, aiff). It reads the title, artist, album and cover art from the files.
- Your library is stored on the phone (IndexedDB), so it works offline.
- Songs, Liked and Playlists tabs, plus search and sorting.
- Mini player and a full-screen Now Playing view (swipe down to close).
- Shuffle, repeat all or one, play next, add to queue, and an Up Next view.
- Controls on the lock screen and in Control Center, with cover art.
- Remembers your queue and where you were in a song.

## Put it on your iPhone
It has to be served over **HTTPS** to install properly. Free options:

**Netlify Drop (easiest)**
1. Go to https://app.netlify.com/drop
2. Drag the whole `Muzicer` folder onto the page.
3. Open the URL it gives you in **Safari** on your iPhone.
4. Tap **Share → Add to Home Screen**.

**GitHub Pages**: push this folder to a repo, then turn on Pages under Settings → Pages.

## Try it on your PC
```
npx serve .
```
Then open http://localhost:3000.

## Notes
- Songs are stored inside the app's storage. If you delete the home-screen app, they're deleted too.
- After changing files, bump `CACHE` in `sw.js` so phones pick up the new version.
