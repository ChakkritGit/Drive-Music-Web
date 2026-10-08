# Party Play v2

All signed-in tabs/devices for an account join its authenticated room, including idle devices. Each websocket has its own device ID. The main player owns its audio, queue, position, playing state, shuffle and repeat. Party Play mirrors actual output reports and routes explicit controls from other devices. Local output controls execute immediately without a websocket round trip. Natural track changes remain entirely local.

Modern clients advertise `commands: true` in `hello`. The worker forwards a targeted `player-command` with `outputGeneration` and a command `revision`; it does not reduce the playback mirror first. The output executes each command once against its current local state, then reports the committed result with `commandRevision` and `outputGeneration`. Stale acknowledgements and previous-output reports are rejected. The command sequence resets on each output grant. Commands received during handoff are queued until the target is granted output. Older tabs without command support retain snapshot controls until they reload.

Room snapshots hydrate a new output once. Subsequent room publishes, heartbeats, device changes and playback reports never seek, reload or pause that output. Controllers display the reported track/state and extrapolate its time between reports.

## Output handoff

The room first clears its output and announces the pending device. A connected old output cancels previews/fades, mutes and pauses both audio elements, then acknowledges the revision. The room activates the new output after that acknowledgement or immediately when the old socket closes/errors. If the old connection remains open but cannot acknowledge, the room waits for its outstanding session lease to expire (at most 90 seconds). Clients renew every 2.5 seconds and reply immediately to server heartbeat requests. Delayed heartbeats cannot extend a lease because the deadline uses the client's original monotonic send timestamp. The lease governs Party membership and command routing; it does not schedule a cutoff of the main audio graph.

Handoffs preserve the queue, playback intent and position. A socket close/error immediately removes that device and clears its Party output reservation. If a handoff is pending, its target takes over immediately; otherwise the room pauses its mirror with its queue intact. The disconnected output continues standalone local playback. Reconnection does not overwrite or pause that local player; the user can explicitly rejoin Party through device selection. When no live Party output exists, selection adopts the continuing player's actual snapshot. A pagehide event still stops the old page's audio and closes its socket before refresh/navigation. A late close from a replaced socket cannot evict its replacement. A room restart restores its durable playback snapshot paused.

Browsers can require a local interaction before allowing audio. Local controls resume the AudioContext within the user gesture; if autoplay is rejected on a remotely selected device, that device displays “Tap Play on this device to allow audio.” Remote Party controls require a worker connection; local main-player controls remain usable without one. A refreshed page can select itself immediately and press Play.

## Main-player separation (2026-10-08)

Seek uses the loaded local source directly and waits for metadata when the target is still loading. A pending seek cannot change the outgoing song or be overwritten by an older play promise. Pause during download/metadata loading preserves the latest intent rather than autoplaying when loading finishes. Prepared transitions switch audio-slot ownership synchronously before React renders, so a simultaneous seek/pause addresses the incoming song and its source remains intact.

Regression checks cover the real player under controlled media/Web Audio events, the React Party command bridge, worker command routing, stale reports, queued handoffs and continued local playback after disconnect. These checks do not measure sound on physical audio hardware.

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

## Playback continuity fixes (2026-10-08)

Natural end-of-track pause events no longer publish a paused queue while the next track is starting. Events from a demoted audio slot are ignored, and a completed crossfade cannot start preparing the outgoing track again before React promotes the incoming slot. Pending preparation is invalidated on track changes, and local playback reports wait until the selected file is loaded.

The optional `positionRevision` changes on seeks, track commands and output handoffs. Play/pause commands preserve the output's real clock without resetting its decoder to an older room position. Clients still apply a missed seek when several commands arrive together. The seek sliders hold a local draft while scrubbing and send one command on release. Superseded asynchronous play attempts cannot overwrite newer pause/seek state.

Regression checks exercise the real React player with controlled media events and Web Audio stubs, plus pointer/keyboard seek gestures. Four targeted tests fail against the preceding player implementation and pass with these changes. Physical audio hardware is not simulated by these tests.

## Queue continuity update (2026-10-07)

The room now includes an optional `transportRevision`, advanced by play/pause/seek/skip and output handoffs. Queue insertion/removal, shuffle and repeat change the general revision only. The output applies those edits without seeking, restarting or reloading the current audio, and remaps any prepared transition by track identity. A queued transport command still applies if its snapshot was coalesced with a later queue edit. Older workers fall back to full reconciliation until upgraded.

Desktop Now Playing inserts the queue to the right in the same content layout, with no modal backdrop. The mobile drawer is unchanged. Regression validation: 224 tests, app/worker TypeScript, production Webpack build and Chromium checks of zero active-audio seek/pause/reload events during insertion/removal, desktop non-overlap and the mobile drawer.

## Now Playing and reconnect update (2026-10-07)

Now Playing uses the app's zinc palette and orange accent, with artwork and transport controls side by side on wide screens. The queue occupies an animated grid column inside a rounded panel. Smaller screens keep the vertical player and mobile drawer. The artwork halo still uses the shared analyser when the visualizer setting is enabled. Reduced motion disables layout transitions and the halo animation. Playback stops initiated by Party Play now record the handoff/lease/shared-pause reason in the existing Analytics log.

Worker publishes preserve an already scheduled alarm: output reports sent every two seconds previously kept postponing the 2.5-second alarm. Heartbeat requests and dead-output recovery now run even while playback reports continue.

Validation: 231 unit/worker tests, app and worker TypeScript, ESLint (one existing DataSettings warning), production Webpack build, and Chromium checks with browser heartbeat intervals disabled and a simulated 12-second websocket outage. Reconnection, queue insertion and removal produced zero active-audio pause/seek/reload events; three-device controls, one audible output, live output handoff and Mix preview were exercised. Light/dark, mobile and 1024px/1440px layouts were inspected. Authentication and audio fixtures were simulated; physical mobile background/lock-screen behavior remains outside these browser checks.
