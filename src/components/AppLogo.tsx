import Image from "next/image";
import clsx from "clsx";

// The app icon: a D whose bowl is a record (docs/brand/logo.svg), the same artwork as the
// favicon, the installed PWA and the Google sign-in consent screen, which must all match. It
// carries its own dark background, so it needs no theme variant.
export function AppLogo({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/icon-512.png"
      alt=""
      width={size}
      height={size}
      // Rounded like an iOS app icon rather than a full circle, which would crop the D.
      className={clsx("rounded-[22.5%]", className)}
      priority
    />
  );
}
