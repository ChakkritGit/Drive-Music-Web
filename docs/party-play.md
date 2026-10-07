# Party Play v2

All signed-in tabs/devices for an account join its authenticated room, including idle devices. Each websocket has its own device ID. The room stores one queue, position, playing state, shuffle order, repeat mode and selected output. UI transport and queue actions are reduced by the room in arrival order. Only the selected output reports actual playback and automatic transitions; reports from older command revisions are ignored.

## Output handoff

The room first clears its output and announces the pending device. The old output cancels previews/fades, mutes and pauses both audio elements, then acknowledges the revision. The room activates the new output after that acknowledgement. If the old device cannot acknowledge, the room waits for its last 9-second lease to expire. Clients renew every 2.5 seconds and schedule a final output-gain cutoff on the audio thread as well as a JS timer. Delayed heartbeats cannot extend a lease because the deadline uses the client's original monotonic send timestamp.

Handoffs preserve the queue, playback intent and position. Closing an output leaves the room paused with its queue intact; another connected device can be selected. Reconnecting controllers receive the current room state without uploading a stale local session. A room restart restores its durable playback snapshot paused.

Browsers can require a local interaction before allowing audio. Local controls resume the AudioContext within the user gesture; if autoplay is rejected on a remotely selected device, that device displays “Tap Play on this device to allow audio.” Party controls require a worker connection; on connection loss the output is silenced to avoid conflicting outputs.

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
