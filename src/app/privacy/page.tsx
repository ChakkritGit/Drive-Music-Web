import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Drive Music",
  description: "How Drive Music accesses, stores, and handles your data.",
};

const LAST_UPDATED = "August 6, 2026";
const GOOGLE_USER_DATA_POLICY_URL =
  "https://developers.google.com/terms/api-services-user-data-policy";
const REPO_URL = "https://github.com/ChakkritGit/drive-music";
const SUPPORT_URL = `${REPO_URL}/issues`;
const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="mb-6 grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-500 hover:underline dark:text-zinc-400"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="truncate text-center text-base font-medium text-zinc-900 sm:text-lg dark:text-zinc-50">
            Privacy Policy
          </h1>
          <div className="w-[4.5rem]" />
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <p className="text-xs text-zinc-400">Last updated: {LAST_UPDATED}</p>

          <section className="space-y-2">
            <p>
              Drive Music is a personal, independently-run web app that plays audio files
              straight from your own Google Drive, with optional offline caching in your
              browser. This page explains what it accesses, what it stores, and where — in
              plain terms, matching what the code actually does.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              What Drive Music accesses via Google Sign-In
            </h2>
            <p>Signing in with Google grants Drive Music exactly two things:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Your basic profile (name, email address, profile picture) — used only to show
                who&apos;s signed in and to key your own data (see below).
              </li>
              <li>
                <strong className="text-zinc-800 dark:text-zinc-100">Read-only</strong> access
                to your Google Drive (the <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">drive.readonly</code>{" "}
                scope). Drive Music can list folders and download audio files you choose to
                open — it cannot create, edit, move, or delete anything in your Drive, and it
                never requests access to files you haven&apos;t browsed to.
              </li>
            </ul>
          </section>

          {/* Required disclosure: `drive.readonly` is a restricted scope, so Google's OAuth
              verification expects this policy to affirm the Limited Use requirements
              explicitly (and to link the policy it's affirming). */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Limited Use of Google user data
            </h2>
            <p>
              Drive Music&apos;s use and transfer of information received from Google APIs
              adheres to the{" "}
              <a
                href={GOOGLE_USER_DATA_POLICY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Specifically, data obtained from your
              Google account is used only to provide and improve the features described here —
              never for advertising, never sold or transferred to others (except as needed to
              provide the app, to comply with the law, or as part of a merger or acquisition),
              and never read by humans, unless you explicitly ask for support, the law requires
              it, or it is needed for security purposes.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Where your data actually lives
            </h2>
            <p>
              Drive Music doesn&apos;t have a database of its own. Almost everything it keeps
              is stored locally, in your browser:
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong className="text-zinc-800 dark:text-zinc-100">Downloaded tracks, playlists, favorites, listening history, and your
                personal recommendation model</strong> — stored in your browser&apos;s
                IndexedDB, on your device only. None of this is ever uploaded anywhere.
              </li>
              <li>
                <strong className="text-zinc-800 dark:text-zinc-100">Your sign-in session</strong> — a token that lets Drive Music call the
                Google Drive API on your behalf, held in an encrypted session cookie in your
                browser.
              </li>
              <li>
                <strong className="text-zinc-800 dark:text-zinc-100">&quot;Listen together&quot; sync</strong> — if you turn this on, a
                small real-time message (which track, play/pause, playback position) is
                relayed between your own devices signed into the same Google account, through a
                private, token-gated room. It exists only for the live connection and isn&apos;t
                written to any database; other people can&apos;t see or join your room.
              </li>
              <li>
                <strong className="text-zinc-800 dark:text-zinc-100">Anonymous performance metrics</strong> — page-load timing via Vercel
                Speed Insights, which doesn&apos;t identify you personally.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              What Drive Music does not do
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Doesn&apos;t sell, rent, or share your data with third parties.</li>
              <li>Doesn&apos;t run ads or ad-tracking of any kind.</li>
              <li>Doesn&apos;t read, modify, or delete files in your Drive beyond playing audio you open.</li>
              <li>Doesn&apos;t keep a copy of your files on any server it controls.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Deleting your data
            </h2>
            <p>
              Settings → Clear all data wipes everything Drive Music has stored in your
              browser — downloads, playlists, listening history, and your recommendation
              model — instantly and permanently.
            </p>
            <p>
              Signing out ends your local session but doesn&apos;t revoke Drive access on
              Google&apos;s side. To fully revoke Drive Music&apos;s access to your Google
              account, remove it from{" "}
              <a
                href={GOOGLE_PERMISSIONS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                your Google Account permissions
              </a>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Third-party services involved
            </h2>
            <p>
              Drive Music runs on Vercel (hosting), uses Google&apos;s APIs for sign-in and
              Drive access, and Cloudflare/PartyKit for the optional real-time sync described
              above. Each is bound by its own privacy policy for the infrastructure it
              provides.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Children&apos;s privacy
            </h2>
            <p>
              Drive Music isn&apos;t directed at children under 13, and doesn&apos;t knowingly
              collect data from them.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Changes to this policy
            </h2>
            <p>
              If what Drive Music accesses or stores changes, this page will be updated and
              the date above will change accordingly.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
            <p>
              Drive Music is an open-source personal project — the code is public at{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                github.com/ChakkritGit/drive-music
              </a>
              . Questions or concerns about this policy can be raised via{" "}
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                GitHub Issues
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
