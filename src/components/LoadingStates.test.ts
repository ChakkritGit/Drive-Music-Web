// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryView } from "@/components/LibraryView";
import { PlaylistsView } from "@/components/PlaylistsView";
import { SessionSkeleton } from "@/components/LoadingSkeletons";

const state = vi.hoisted(() => ({ libraryLoaded: false, playlistsLoaded: false }));
vi.mock("@/components/PlayerContext", () => ({
  usePlayer: () => ({ cachedTracks: new Map(), libraryLoaded: state.libraryLoaded }),
}));
vi.mock("@/components/PlaylistsContext", () => ({
  FAVORITES_PLAYLIST_NAME: "Favorites",
  usePlaylists: () => ({ playlists: [], playlistsLoaded: state.playlistsLoaded }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/library", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => createElement("a", { href }, children),
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(state, { libraryLoaded: false, playlistsLoaded: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Music loading states", () => {
  it("waits for the local library before declaring that no tracks are downloaded", async () => {
    await act(async () => root.render(createElement(LibraryView)));
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading tracks");
    expect(container.textContent).not.toContain("Nothing downloaded yet");
    state.libraryLoaded = true;
    await act(async () => root.render(createElement(LibraryView)));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("Nothing downloaded yet");
  });

  it("waits for IndexedDB before showing the empty playlists state", async () => {
    const render = () => act(async () => root.render(createElement(PlaylistsView, { onOpen: vi.fn() })));
    await render();
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading playlists");
    expect(container.textContent).not.toContain("No playlists yet");
    state.playlistsLoaded = true;
    await render();
    expect(container.textContent).toContain("No playlists yet");
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it.each([
    ["/", "Home", "Loading playlists"],
    ["/browse", "My Drive", "Loading folders and tracks"],
    ["/library", "Library", "Loading tracks"],
    ["/playlists", "Playlists", "Loading playlists"],
    ["/playlists/example", "Playlist", "Loading tracks"],
  ])("keeps the public description and policy links while loading %s", async (pathname, title, label) => {
    await act(async () => root.render(createElement(SessionSkeleton, { pathname })));
    expect(container.querySelector("h1")?.textContent).toBe(title);
    expect(container.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe(label);
    expect(container.textContent).toContain("A personal audio player");
    expect(container.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(container.querySelector('a[href="/terms"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Sign in with Google");
  });
});
