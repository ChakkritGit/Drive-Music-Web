# Drive Music

A personal music player that streams and caches audio straight from your own Google Drive, with a full Web Audio processing chain, an on-device recommendation model, and cross-device sync — no server-side database, no ads, no tracking.

**Live:** [drive-music.chakkritton.com](https://drive-music.chakkritton.com)

## Features

**Playback & queue**
- Plays audio straight from Google Drive (read-only access)
- Offline downloads (per-track or bulk) cached in IndexedDB
- Weighted shuffle, driven by the on-device recommendation model
- Loop modes: off / repeat all / repeat one
- Play next / Up Next queue
- Session restore across reloads (without auto-play)
- Spacebar play/pause shortcut

**Audio engine**
- Crossfade between tracks (0–12s, adjustable)
- Volume normalization (boosts quiet tracks, not just attenuates loud ones)
- 3-band equalizer (bass / mid / treble, ±12dB)
- Spatial audio — convolver-based stereo widening
- Now Playing visualizer reacting to live audio
- Volume/mute controls

**Library & organization**
- Playlists and Favorites
- Drive folder browser with breadcrumbs
- Offline library with search
- Installable, offline-capable app shell (service worker); [offline listening](docs/offline-listening.md) works after reload without a network session check

**Personalization**
- A small neural net trained on-device from actual listening behavior
- "Made For You" / "Recently Added" / "Shuffle All" shelves on Home
- Analytics dashboard (`/admin`) with a live model visualization and JSON export

**Social**
- "Listen together": Spotify Connect-style control across your own devices (pick the device that plays, control it and its volume from any other)
- "Playing on [device]" line when the sound is on another device

**Settings & data**
- Eight themes — Light, Dark, Retro, Ocean, Sakura, Horror, Synthwave, Terminal — plus "System"
- Full settings page for every audio feature above
- Clear-all-data (local wipe, doesn't sign you out of Google)
- Public Privacy Policy (`/privacy`) and Terms of Service (`/terms`)

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- Web Audio API (dual `<audio>` element graph for crossfade, EQ, normalization, spatial audio, analyser)
- IndexedDB for all local data — no server-side database
- Google OAuth via NextAuth, `drive.readonly` scope only
- PartySocket WebSockets to a self-hosted sync service (Bun + Elysia, runs `party/index.ts`) for cross-device controls
- Vitest for tests

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
GOOGLE_CLIENT_ID=          # Google OAuth web client
GOOGLE_CLIENT_SECRET=
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=           # random secret, e.g. `openssl rand -base64 32`
PARTY_TOKEN_SECRET=        # optional — enables "Listen together" sync
NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:8788
```

The sync service lives in the Thai-Weather repo (`deploy/apps/services`). To run it locally with the same secret:

```bash
cd ../Thai-Weather/deploy/apps/services
scripts/vendor-drive-music.sh ../../../../drive-music-player   # copies party/index.ts + src/lib/party.ts
PARTY_TOKEN_SECRET=… SYNC_DB=./data/sync.db bun src/sync.ts     # ws://127.0.0.1:8788
```

Production: https://drive-music.chakkritton.com/parties/… on the VPS; a push to `main` deploys the app and the sync service.

### Other scripts

```bash
npm run lint          # eslint
npm run test           # vitest
```

## License

Personal project — see [Terms of Service](https://drive-music.chakkritton.com/terms) for usage terms.
