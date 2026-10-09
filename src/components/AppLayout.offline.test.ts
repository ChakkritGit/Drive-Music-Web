// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";

const access = vi.hoisted(() => ({
  session: null as { user: { name: string; email: string } } | null,
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
  canAccessApp: true, localOnly: true, isOffline: true, isSignedOut: false, signOut: vi.fn(),
}));
vi.mock("@/components/AppAccessContext", () => ({ useAppAccess: () => access }));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/browse" }));
vi.mock("next/link", () => ({ default: ({ children }: { children: unknown }) => children }));
vi.mock("@/components/Sidebar", () => ({ Sidebar: () => null }));
vi.mock("@/components/TopBar", () => ({ TopBar: () => null }));
vi.mock("@/components/LibraryView", () => ({ LibraryView: () => "Downloaded tracks" }));

let root: Root;
let container: HTMLDivElement;
async function render() {
  await act(async () => { root.render(createElement(AppLayout, null, createElement("p", null, "Google Drive content"))); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(access, { session: null, status: "unauthenticated", canAccessApp: true, localOnly: true, isOffline: true, isSignedOut: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  vi.unstubAllGlobals();
});

describe("Offline app shell", () => {
  it("shows downloaded tracks instead of Google sign-in when auth fetch cannot run", async () => {
    await render();
    expect(container.textContent).toContain("Downloaded tracks");
    expect(container.textContent).toContain("Connection unavailable");
    expect(container.textContent).not.toContain("Sign in with Google");
    expect(container.textContent).not.toContain("Google Drive content");
  });

  it("opens local music while NextAuth is still loading", async () => {
    access.status = "loading";
    await render();
    expect(container.textContent).toContain("Downloaded tracks");
    expect(container.querySelector('[aria-label="Loading"]')).toBeNull();
  });

  it("requires sign-in after an explicit offline logout", async () => {
    access.canAccessApp = false;
    access.localOnly = false;
    access.isSignedOut = true;
    await render();
    expect(container.textContent).toContain("Sign in with Google");
    expect(container.textContent).not.toContain("Downloaded tracks");
    expect(container.querySelector("button")?.disabled).toBe(true);
  });

  it("returns to the real route content after authentication recovers", async () => {
    access.status = "authenticated";
    access.session = { user: { name: "User", email: "user@example.com" } };
    access.localOnly = false;
    access.isOffline = false;
    await render();
    expect(container.textContent).toContain("Google Drive content");
    expect(container.textContent).not.toContain("Downloaded tracks");
  });
});
