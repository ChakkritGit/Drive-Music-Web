// @vitest-environment happy-dom

import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppAccessProvider, useAppAccess } from "./AppAccessContext";
import type { Session } from "next-auth";

const mocks = vi.hoisted(() => ({
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
  data: null as Session | null,
  update: vi.fn(), signOut: vi.fn(), hasCachedTracks: vi.fn(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: mocks.data, status: mocks.status, update: mocks.update }),
  signOut: mocks.signOut,
}));
vi.mock("@/lib/db", () => ({ hasCachedTracks: mocks.hasCachedTracks }));

const KEY = "drive-music-explicit-signout";
const signedIn: Session = { expires: "2099-01-01", user: { email: "user@example.com", name: "User" } };
let root: Root;
let container: HTMLDivElement;
let access: ReturnType<typeof useAppAccess>;
let onLine: ReturnType<typeof vi.spyOn>;
let worker: EventTarget;

function Probe() {
  const value = useAppAccess();
  useLayoutEffect(() => { access = value; });
  return createElement("span", null, value.localOnly ? "Downloaded library" : value.canAccessApp ? "Online app" : "Sign in");
}
async function render() {
  await act(async () => { root.render(createElement(AppAccessProvider, null, createElement(Probe))); });
}
async function online() {
  onLine.mockReturnValue(true);
  await act(async () => { window.dispatchEvent(new Event("online")); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  mocks.status = "unauthenticated";
  mocks.data = null;
  mocks.hasCachedTracks.mockReset().mockResolvedValue(true);
  mocks.update.mockReset().mockResolvedValue(null);
  mocks.signOut.mockReset().mockImplementation(async () => { mocks.status = "unauthenticated"; mocks.data = null; });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  worker = new EventTarget();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: worker });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Local app access", () => {
  it("opens downloaded music after an offline reload without inventing a session", async () => {
    await render();
    expect(access.canAccessApp).toBe(true);
    expect(access.localOnly).toBe(true);
    expect(access.session).toBeNull();
    expect(access.status).toBe("unauthenticated");
    expect(container.textContent).toBe("Downloaded library");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not wait for a session loading forever while offline", async () => {
    mocks.status = "loading";
    await render();
    expect(access.status).toBe("loading");
    expect(access.canAccessApp).toBe(true);
    expect(access.localOnly).toBe(true);
  });

  it("does not claim offline music is available when no tracks are downloaded", async () => {
    mocks.hasCachedTracks.mockResolvedValue(false);
    await render();
    expect(access.isOffline).toBe(true);
    expect(access.canAccessApp).toBe(false);
  });

  it("opens downloads when the network request fails even if the OS reports online", async () => {
    onLine.mockReturnValue(true);
    vi.mocked(fetch).mockRejectedValue(new TypeError("Network unavailable"));
    await render();
    expect(access.isOffline).toBe(true);
    expect(access.canAccessApp).toBe(true);
  });

  it("bounds an unresponsive connectivity check and unlocks local music", async () => {
    vi.useFakeTimers();
    onLine.mockReturnValue(true);
    mocks.status = "loading";
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options!.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    await render();
    expect(access.canAccessApp).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(3001); });
    expect(access.isOffline).toBe(true);
    expect(access.canAccessApp).toBe(true);
  });

  it("reacts to a failed auth fetch reported by the service worker", async () => {
    onLine.mockReturnValue(true);
    await render();
    expect(access.canAccessApp).toBe(false);
    await act(async () => {
      worker.dispatchEvent(new MessageEvent("message", { data: { type: "drive-music-connectivity", online: false } }));
    });
    expect(access.canAccessApp).toBe(true);
    expect(access.session).toBeNull();
  });

  it("keeps downloads visible while genuine session recovery is still pending", async () => {
    let resolveUpdate!: () => void;
    mocks.update.mockImplementation(() => new Promise<void>(resolve => { resolveUpdate = resolve; }));
    await render();
    await online();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(access.canAccessApp).toBe(true);
    expect(access.localOnly).toBe(true);
    mocks.status = "authenticated";
    mocks.data = signedIn;
    await act(async () => { resolveUpdate(); });
    await render();
    expect(access.canAccessApp).toBe(true);
    expect(access.localOnly).toBe(false);
    expect(access.session).toBe(signedIn);
  });

  it("does not let a late successful probe undo a newer session failure", async () => {
    let respond!: (response: Response) => void;
    onLine.mockReturnValue(true);
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { respond = resolve; }));
    await render();
    await act(async () => {
      worker.dispatchEvent(new MessageEvent("message", { data: { type: "drive-music-connectivity", online: false } }));
    });
    expect(access.canAccessApp).toBe(true);
    await act(async () => { respond({ ok: true } as Response); });
    expect(access.isOffline).toBe(true);
    expect(access.canAccessApp).toBe(true);
  });

  it("returns to sign-in after online recovery confirms there is no session", async () => {
    await render();
    await online();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(access.isOffline).toBe(false);
    expect(access.canAccessApp).toBe(false);
    expect(access.session).toBeNull();
  });

  it("closes local access immediately for explicit offline logout and sends logout on reconnect", async () => {
    mocks.status = "authenticated";
    mocks.data = signedIn;
    await render();
    expect(access.canAccessApp).toBe(true);
    await act(async () => { await access.signOut(); });
    expect(access.isSignedOut).toBe(true);
    expect(access.canAccessApp).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("pending");
    expect(mocks.signOut).not.toHaveBeenCalled();
    await online();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
    expect(localStorage.getItem(KEY)).toBe("complete");
    expect(access.canAccessApp).toBe(false);
    expect(mocks.hasCachedTracks).toHaveBeenCalled();
  });

  it("does not let an offline reload undo completed logout", async () => {
    localStorage.setItem(KEY, "complete");
    await render();
    expect(access.canAccessApp).toBe(false);
    expect(access.isSignedOut).toBe(true);
    expect(access.localOnly).toBe(false);
  });

  it("allows a later authenticated login and removes the completed logout marker", async () => {
    localStorage.setItem(KEY, "complete");
    mocks.status = "authenticated";
    mocks.data = signedIn;
    await render();
    expect(access.canAccessApp).toBe(true);
    expect(access.isSignedOut).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("applies an explicit logout from another tab", async () => {
    await render();
    localStorage.setItem(KEY, "pending");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: KEY })); });
    expect(access.canAccessApp).toBe(false);
    expect(access.isSignedOut).toBe(true);
  });
});
