"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { signOut as endSession, useSession } from "next-auth/react";
import { hasCachedTracks } from "@/lib/db";

const SIGN_OUT_KEY = "drive-music-explicit-signout";
const CONNECTIVITY_TIMEOUT_MS = 3000;
type SignOutState = "checking" | "none" | "pending" | "complete";

interface AppAccessValue {
  /** This remains the real NextAuth session; offline access never manufactures credentials. */
  session: ReturnType<typeof useSession>["data"];
  status: ReturnType<typeof useSession>["status"];
  isOffline: boolean;
  isSignedOut: boolean;
  canAccessApp: boolean;
  localOnly: boolean;
  signOut: () => Promise<void>;
}

const AppAccessContext = createContext<AppAccessValue | null>(null);

export function useAppAccess(): AppAccessValue {
  const value = useContext(AppAccessContext);
  if (!value) throw new Error("useAppAccess must be used within AppAccessProvider");
  return value;
}

/** Local library access is independent of a network-only Google session check. */
export function AppAccessProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status, update } = useSession();
  const [isOffline, setIsOffline] = useState(false);
  const [hasDownloads, setHasDownloads] = useState(false);
  const [restoringSession, setRestoringSession] = useState(false);
  const [signOutState, setSignOutState] = useState<SignOutState>("checking");
  const offlineRef = useRef(false);
  const signOutRef = useRef<SignOutState>("checking");
  const signingOutRef = useRef(false);
  const sessionRef = useRef({ status, update });
  useEffect(() => { sessionRef.current = { status, update }; }, [status, update]);

  const setConnectivity = useCallback((online: boolean) => {
    offlineRef.current = !online;
    setIsOffline(!online);
  }, []);

  const rememberSignOut = useCallback((state: "none" | "pending" | "complete") => {
    if (state === "none") localStorage.removeItem(SIGN_OUT_KEY);
    else localStorage.setItem(SIGN_OUT_KEY, state);
    signOutRef.current = state;
    setSignOutState(state);
  }, []);

  const completeSignOut = useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    try {
      // The marker has already closed local access. If offline, this is retried when the
      // connection returns so a retained cookie cannot silently reopen the app.
      await endSession({ redirect: false });
      rememberSignOut("complete");
    } catch {
      setConnectivity(false);
    } finally {
      signingOutRef.current = false;
    }
  }, [rememberSignOut, setConnectivity]);

  const signOut = useCallback(async () => {
    rememberSignOut("pending");
    if (!offlineRef.current) await completeSignOut();
  }, [rememberSignOut, completeSignOut]);

  useEffect(() => {
    const stored = localStorage.getItem(SIGN_OUT_KEY);
    const state = stored === "pending" || stored === "complete" ? stored : "none";
    signOutRef.current = state;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the local access choice after hydration
    setSignOutState(state);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && signOutRef.current === "complete") {
      // A completed logout removed the cookie; an authenticated session now is a new login.
      rememberSignOut("none");
    }
  }, [status, session?.user?.email, rememberSignOut]);

  useEffect(() => {
    let cancelled = false;
    hasCachedTracks().then(found => {
      if (!cancelled) setHasDownloads(found);
    }).catch(() => {
      if (!cancelled) setHasDownloads(false);
    });
    return () => { cancelled = true; };
  }, [isOffline, status]);

  useEffect(() => {
    let stopped = false;
    let generation = 0;
    let controller: AbortController | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function retryLater() {
      clearTimeout(retry);
      if (!stopped && offlineRef.current && navigator.onLine) retry = setTimeout(check, 15000);
    }

    async function restored() {
      if (signOutRef.current === "pending") await completeSignOut();
      else if (sessionRef.current.status !== "authenticated") {
        setRestoringSession(true);
        try { await sessionRef.current.update(); }
        catch { setConnectivity(false); }
        finally { if (!stopped) setRestoringSession(false); }
      }
    }

    async function check() {
      clearTimeout(retry);
      if (!navigator.onLine) {
        setConnectivity(false);
        return;
      }
      const turn = ++generation;
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      const timeout = setTimeout(() => current.abort(), CONNECTIVITY_TIMEOUT_MS);
      const wasOffline = offlineRef.current;
      try {
        // This public NextAuth endpoint bypasses the shell cache and never refreshes a
        // Google token. Its time bound also unlocks downloads on an unusably slow network.
        const response = await fetch("/api/auth/providers", { cache: "no-store", signal: current.signal });
        if (!response.ok) throw new Error("Connection unavailable");
        if (stopped || turn !== generation) return;
        const restoration = wasOffline || signOutRef.current === "pending" ? restored() : null;
        setConnectivity(true);
        await restoration;
      } catch {
        if (!stopped && turn === generation) setConnectivity(false);
      } finally {
        clearTimeout(timeout);
        if (!stopped && turn === generation) retryLater();
      }
    }

    function offline() {
      generation += 1;
      controller?.abort();
      clearTimeout(retry);
      setConnectivity(false);
    }
    function visibility() {
      if (document.visibilityState === "visible") void check();
    }
    function workerMessage(event: MessageEvent) {
      if (event.data?.type !== "drive-music-connectivity") return;
      if (event.data.online === false) {
        generation += 1;
        controller?.abort();
        setConnectivity(false);
        retryLater();
      } else if (event.data.online === true && navigator.onLine) {
        setConnectivity(true);
      }
    }
    function storage(event: StorageEvent) {
      if (event.key !== SIGN_OUT_KEY && event.key !== null) return;
      const value = localStorage.getItem(SIGN_OUT_KEY);
      const next = value === "pending" || value === "complete" ? value : "none";
      signOutRef.current = next;
      setSignOutState(next);
    }

    window.addEventListener("offline", offline);
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    navigator.serviceWorker?.addEventListener("message", workerMessage);
    void check();
    return () => {
      stopped = true;
      controller?.abort();
      clearTimeout(retry);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visibility);
      navigator.serviceWorker?.removeEventListener("message", workerMessage);
    };
  }, [completeSignOut, setConnectivity]);

  const isSignedOut = signOutState === "pending" || signOutState === "complete";
  const localOnly = status !== "authenticated" && (isOffline || restoringSession) && hasDownloads && !isSignedOut;
  const canAccessApp = signOutState !== "checking" && !isSignedOut && (status === "authenticated" || localOnly);
  const value = useMemo<AppAccessValue>(() => ({
    session, status, isOffline, isSignedOut, canAccessApp, localOnly, signOut,
  }), [session, status, isOffline, isSignedOut, canAccessApp, localOnly, signOut]);

  return <AppAccessContext.Provider value={value}>{children}</AppAccessContext.Provider>;
}
