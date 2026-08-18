# Drive Music

A personal music player that streams and caches audio straight from your own Google Drive, with a full Web Audio processing chain, an on-device recommendation model, and cross-device sync — no server-side database, no ads, no tracking.

**Live:** [drive-music-taupe.vercel.app](https://drive-music-taupe.vercel.app)

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
- Installable, offline-capable app shell (service worker)

**Personalization**
- A small neural net trained on-device from actual listening behavior
- "Made For You" / "Recently Added" / "Shuffle All" shelves on Home
- Analytics dashboard (`/admin`) with a live model visualization and JSON export

**Social**
- "Listen together" — real-time playback sync across your own devices
- Passive "Playing on [device]" banner

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
- [PartyKit](https://www.partykit.io) on Cloudflare for cross-device sync
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
NEXT_PUBLIC_PARTYKIT_HOST=127.0.0.1:1999
```

`PARTY_TOKEN_SECRET` must also be set on the PartyKit side: `npx partykit env add PARTY_TOKEN_SECRET`.

### Other scripts

```bash
npm run lint          # eslint
npm run test           # vitest
npm run party:dev      # local PartyKit dev server (sync)
npm run party:deploy   # deploy the PartyKit worker
```

## License

Personal project — see [Terms of Service](https://drive-music-taupe.vercel.app/terms) for usage terms.
