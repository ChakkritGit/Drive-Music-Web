/**
 * iOS launch screens: one <link rel="apple-touch-startup-image"> per iPhone screen size and theme
 * (portrait, CSS px × pixel ratio). The images in public/splash/ show the app icon and name.
 */
const IPHONES: [w: number, h: number, dpr: number][] = [
  [440, 956, 3], [420, 912, 3], [402, 874, 3], [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
];

export const STARTUP_IMAGES = IPHONES.flatMap(([w, h, dpr]) =>
  (["light", "dark"] as const).map((theme) => ({
    url: `/splash/${w}x${h}@${dpr}-${theme}.png`,
    media:
      `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) ` +
      `and (orientation: portrait) and (prefers-color-scheme: ${theme})`,
  })),
);
