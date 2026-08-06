import Link from "next/link";

// Privacy Policy / Terms links. Google's OAuth branding verification requires both to be
// reachable from the app's homepage, so this renders wherever the homepage can end up —
// including the pre-session loading state, which is the only thing a non-JS fetch of "/" sees.
export function PolicyLinks() {
  return (
    <p className="text-[11px] text-zinc-400">
      <Link href="/privacy" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
        Privacy Policy
      </Link>{" "}
      ·{" "}
      <Link href="/terms" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">
        Terms of Service
      </Link>
    </p>
  );
}
