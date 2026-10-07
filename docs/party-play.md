# Party Play v2

All signed-in tabs/devices for an account join its authenticated room, including idle devices. Each websocket has its own device ID. The room stores one queue, position, playing state, shuffle order, repeat mode and selected output. UI transport and queue actions are reduced by the room in arrival order. Only the selected output reports actual playback and automatic transitions; reports from older command revisions are ignored.

## Output handoff

The room first clears its output and announces the pending device. The old output cancels previews/fades, mutes and pauses both audio elements, then acknowledges the revision. The room activates the new output after that acknowledgement or immediately when the old socket closes/errors. If the old connection remains open but cannot acknowledge, the room waits for its outstanding lease to expire (at most 90 seconds). Clients renew every 2.5 seconds and reply immediately to server heartbeat requests, so renewal does not depend solely on background JS timers. They schedule a final output-gain cutoff on the audio thread as well as a JS timer. Delayed heartbeats cannot extend a lease because the deadline uses the client's original monotonic send timestamp. A worker that does not advertise `leaseMs` retains the legacy 9-second deadline.

Handoffs preserve the queue, playback intent and position. A socket close/error immediately removes that device and clears its output reservation. If a handoff is pending, its target takes over immediately; otherwise the room pauses at the current position with its queue intact. Clients revoke their lease and stop both audio slots on close/error. A pagehide event stops audio and closes the socket before refresh/navigation; a page restored from the back/forward cache reconnects. A late close from a replaced socket cannot evict its replacement. Reconnecting controllers receive the current room state without uploading a stale local session. A room restart restores its durable playback snapshot paused.

Browsers can require a local interaction before allowing audio. Local controls resume the AudioContext within the user gesture; if autoplay is rejected on a remotely selected device, that device displays “Tap Play on this device to allow audio.” Party controls require a worker connection. Even a temporary socket disconnect stops playback; a refreshed page can select itself immediately and press Play. Silent network failures can still take time to produce a socket event; the lease deadline remains the fallback for an undetected failure.

## Deployment

The web app and sync worker must be released together: protocol 2 replaces the legacy last-message relay. Existing tabs should reload after release. Deploy the sync worker with `npm run party:deploy` using the existing `PARTY_TOKEN_SECRET`; deploy the web app with its existing `NEXT_PUBLIC_PARTYKIT_HOST` and matching secret. No secret rotation is required.

The status worker integration is in `/Volumes/SSD256GB/WebProfile/portfolio/status`: `musicsync` calls `/health` through the `MUSIC_SYNC` service binding to `drive-music-sync`. Deploy that worker after the new sync worker. Health requires HTTP 200, `status: "ok"`, the expected service name and protocol 2. The public health endpoint reports worker/configuration availability, not Google Drive audio access or an end-to-end websocket round trip.

## Validation (2026-10-06)

- 220 unit/worker tests passed, including three-device membership, remote controls, stale reports, handoff acknowledgement, lease expiry, queue edits, protocol validation and Analytics owner checks.
- 21 status worker tests and its TypeScript check passed.
- App and worker TypeScript checks passed. ESLint has no errors (one existing DataSettings navigation warning).
- Production build passed with `npm run build -- --webpack`. Default Turbopack hit a local sandbox port-binding restriction.
- Chromium smoke test against the production build and a local Wrangler worker passed: three isolated browser contexts, shared Next/Pause, Play next/removal, menu hit testing, mobile output handoff with old audio stopped, right-side queue, profile logout availability, Mix preview Play/Pause and server-side denial of Analytics. No browser page errors. Audio fixtures and authentication were simulated; real Google Drive, physical iOS/Android devices and production deployment were not exercised.

The implementation checks above preceded the production release.

## Queue continuity update (2026-10-07)

The room now includes an optional `transportRevision`, advanced by play/pause/seek/skip and output handoffs. Queue insertion/removal, shuffle and repeat change the general revision only. The output applies those edits without seeking, restarting or reloading the current audio, and remaps any prepared transition by track identity. A queued transport command still applies if its snapshot was coalesced with a later queue edit. Older workers fall back to full reconciliation until upgraded.

Desktop Now Playing inserts the queue to the right in the same content layout, with no modal backdrop. The mobile drawer is unchanged. Regression validation: 224 tests, app/worker TypeScript, production Webpack build and Chromium checks of zero active-audio seek/pause/reload events during insertion/removal, desktop non-overlap and the mobile drawer.

## Now Playing and reconnect update (2026-10-07)

Now Playing uses the app's zinc palette and orange accent, with artwork and transport controls side by side on wide screens. The queue occupies an animated grid column inside a rounded panel. Smaller screens keep the vertical player and mobile drawer. The artwork halo still uses the shared analyser when the visualizer setting is enabled. Reduced motion disables layout transitions and the halo animation. Playback stops initiated by Party Play now record the handoff/lease/shared-pause reason in the existing Analytics log.

Worker publishes preserve an already scheduled alarm: output reports sent every two seconds previously kept postponing the 2.5-second alarm. Heartbeat requests and dead-output recovery now run even while playback reports continue.

Validation: 231 unit/worker tests, app and worker TypeScript, ESLint (one existing DataSettings warning), production Webpack build, and Chromium checks with browser heartbeat intervals disabled and a simulated 12-second websocket outage. Reconnection, queue insertion and removal produced zero active-audio pause/seek/reload events; three-device controls, one audible output, live output handoff and Mix preview were exercised. Light/dark, mobile and 1024px/1440px layouts were inspected. Authentication and audio fixtures were simulated; physical mobile background/lock-screen behavior remains outside these browser checks.
