import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Service — Drive Music",
  description: "The terms for using Drive Music.",
};

const LAST_UPDATED = "August 1, 2026";
const REPO_URL = "https://github.com/ChakkritGit/drive-music";
const SUPPORT_URL = `${REPO_URL}/issues`;

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <div className="w-[4.5rem]" />
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          <p className="text-xs text-zinc-400">Last updated: {LAST_UPDATED}</p>

          <section className="space-y-2">
            <p>
              Drive Music is a free, independently-run personal project — not a company or a
              commercial product. By signing in and using it, you agree to the following.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              What the service is
            </h2>
            <p>
              Drive Music lets you browse and play audio files from your own Google Drive, with
              optional offline caching, playlists, and playback features, entirely through your
              own Google account&apos;s Drive access. It does not host, index, or provide any
              audio content of its own.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Your responsibilities
            </h2>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                You&apos;re responsible for the files in your own Google Drive and for having
                the rights to store and listen to them.
              </li>
              <li>
                You won&apos;t use Drive Music for anything illegal, or in a way that violates
                Google&apos;s own terms of service for your account or the Drive API.
              </li>
              <li>
                You&apos;re responsible for keeping your Google account secure — Drive Music
                relies entirely on Google&apos;s sign-in for authentication.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              No warranty
            </h2>
            <p>
              Drive Music is provided <strong className="text-zinc-800 dark:text-zinc-100">as is</strong>, free of charge, as a hobby project
              maintained in spare time. There&apos;s no guarantee it will always be available,
              bug-free, or maintained indefinitely. Features (including the ones described in
              the Privacy Policy) may change or be removed at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Limitation of liability
            </h2>
            <p>
              To the fullest extent permitted by law, Drive Music and its developer aren&apos;t
              liable for any loss or damage arising from your use of the service — including
              lost data, playback issues, or account access problems — beyond what applicable
              law requires.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Third-party services
            </h2>
            <p>
              Drive Music depends on Google (sign-in and Drive access), Vercel (hosting), and
              Cloudflare/PartyKit (optional real-time sync). Your use of those underlying
              services is also governed by their own terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Ending your use
            </h2>
            <p>
              You can stop using Drive Music at any time. Signing out ends your local session;
              revoking access from{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                your Google Account permissions
              </a>{" "}
              fully disconnects it. See the{" "}
              <Link href="/privacy" className="text-emerald-600 hover:underline dark:text-emerald-400">
                Privacy Policy
              </Link>{" "}
              for how to erase locally stored data as well.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Changes to these terms
            </h2>
            <p>
              If these terms change, this page will be updated and the date above will change
              accordingly. Continued use after a change means you accept the updated terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Contact</h2>
            <p>
              Drive Music is open-source at{" "}
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="text-emerald-600 hover:underline dark:text-emerald-400"
              >
                github.com/ChakkritGit/drive-music
              </a>
              . Questions about these terms can be raised via{" "}
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
