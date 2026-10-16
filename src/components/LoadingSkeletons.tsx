import { AppLogo } from "@/components/AppLogo";
import { PolicyLinks } from "@/components/PolicyLinks";
import { PAGE, PageHeader } from "@/components/ui";

function Block({ className = "" }: { className?: string }) {
  return <div className={`skeleton-block rounded-md bg-zinc-200/70 dark:bg-zinc-800 ${className}`} />;
}

/** Match the 40px covers and 56px row height used by folders and TrackRow. */
export function TrackListSkeleton({ folders = false }: { folders?: boolean }) {
  return (
    <div role="status" aria-label={folders ? "Loading folders and tracks" : "Loading tracks"} aria-busy="true">
      <div aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 py-1.5">
            <Block className="h-10 w-10 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Block className={`h-3.5 ${i % 3 === 0 ? "w-3/5" : "w-2/5"}`} />
              {(!folders || i > 1) && <Block className="h-2.5 w-1/3" />}
            </div>
            {(!folders || i > 1) && <Block className="h-3 w-8 shrink-0" />}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your music…</span>
    </div>
  );
}

function MediaGridSkeleton() {
  return (
    <div role="status" aria-label="Loading playlists" aria-busy="true">
      <div aria-hidden="true" className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Block className="aspect-square w-full rounded-xl" />
            <Block className="h-3.5 w-3/4" />
            <Block className="h-2.5 w-1/2" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading your playlists…</span>
    </div>
  );
}

export type LoadingView = "home" | "browse" | "library" | "playlists" | "playlist" | "settings" | "admin";

export function loadingView(pathname: string): LoadingView {
  if (pathname.startsWith("/playlists/")) return "playlist";
  for (const view of ["browse", "library", "playlists", "settings", "admin"] as const) {
    if (pathname === `/${view}` || pathname.startsWith(`/${view}/`)) return view;
  }
  return "home";
}

export function MusicPageSkeleton({ view }: { view: LoadingView }) {
  const title = { home: "Home", browse: "My Drive", library: "Library", playlists: "Playlists", playlist: "Playlist", settings: "Settings", admin: "Analytics" }[view];
  return (
    <div className={PAGE} aria-busy="true">
      <PageHeader title={title} eyebrow={view === "browse" ? "Google Drive" : view === "library" ? "Offline" : undefined}
        cover={view === "playlist" ? <div aria-hidden="true" className="h-full"><Block className="h-full w-full" /></div> : undefined} />
      {view === "home" && <div aria-hidden="true" className="mb-8 rounded-2xl bg-zinc-50 p-6 sm:p-8 dark:bg-zinc-900/50">
        <Block className="mb-4 h-3 w-24" /><Block className="mb-3 h-8 w-3/4 sm:w-1/2" />
        <Block className="mb-6 h-3 w-1/2" /><Block className="h-10 w-28 rounded-full" />
      </div>}
      {(view === "library" || view === "playlists" || view === "playlist") &&
        <div aria-hidden="true" className="mb-6 flex max-w-md gap-2"><Block className="h-10 flex-1 rounded-full" /><Block className="h-10 w-24 rounded-full" /></div>}
      {view === "home" || view === "playlists" ? <MediaGridSkeleton />
        : view === "settings" || view === "admin" ? <div role="status" aria-label={`Loading ${title.toLowerCase()}`}>
          <div aria-hidden="true" className="space-y-4"><Block className="h-24 w-full" /><Block className="h-32 w-full" /><Block className="h-24 w-full" /></div>
        </div> : <TrackListSkeleton folders={view === "browse"} />}
    </div>
  );
}

/** Keep the public app description and policy links in the server-rendered session gate. */
export function SessionSkeleton({ pathname }: { pathname: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-2.5"><AppLogo size={28} /><span className="text-base font-semibold">Drive Music</span></div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">A personal audio player for the music files in your Google Drive.</p>
          <PolicyLinks />
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <MusicPageSkeleton view={loadingView(pathname)} />
      </main>
    </div>
  );
}
