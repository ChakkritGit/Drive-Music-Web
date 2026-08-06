import Image from "next/image";
import clsx from "clsx";

// The app icon — the same artwork the iOS app ships (drive-music-ios' AppIcon), so the web
// app, the installed PWA and the iOS app all read as one product. It carries its own dark
// background, so it needs no theme variant: it looks the same in light and dark mode.
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
      // Rounded like an iOS app icon rather than a full circle — a circle crops into the
      // note glyph, which sits close to the artwork's left edge.
      className={clsx("rounded-[22.5%]", className)}
      priority
    />
  );
}
