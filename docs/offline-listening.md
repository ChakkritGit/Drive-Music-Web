# Offline listening

Open the app while connected and download tracks from Browse. Playing a track also saves its audio in IndexedDB; Library lists the tracks available on that device. The service worker warms the home and library pages together with their required JavaScript and CSS.

After the app and downloads are ready, an offline reload opens Library even when Google session verification fails or remains pending. Downloaded audio plays from a local blob without fetching a Google token or contacting the Party worker. Google Drive browsing and tracks that have not been downloaded need a connection.

Offline access never creates a Google session or stores authentication responses in the shell cache. Explicit Sign out closes local library access while preserving downloads and completes server logout after reconnecting. Changing Google accounts retains the existing account guard, which clears the previous account's local data.

When connectivity returns, the app retries its real session check. Party reconnection preserves standalone playback until the user explicitly selects an output.

Selecting this device starts available local audio before the previous Party output acknowledges the transfer. An unresponsive old output has a separate two-second transfer deadline. New grants adopt the running local player without replaying an old position; remote controls queued during the transfer run after the grant. See [Party playback](party-play.md).
