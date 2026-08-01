import { loadImage } from "@/lib/color";

// Output resolution — big enough to stay sharp at the artwork's largest on-screen size
// (~320px, plus retina headroom) without ballooning canvas/memory cost.
const OUTPUT_SIZE = 480;
// Corner radius and edge-blur amount, as fractions of the canvas, for the rounded-square
// feather mask — kept proportionally close to the artwork container's own `rounded-2xl`.
const CORNER_RADIUS = OUTPUT_SIZE * 0.14;
const FEATHER_BLUR = OUTPUT_SIZE * 0.06;

/**
 * Draws `dataUrl` onto a square canvas (cropped to fill it, like CSS `object-fit: cover`),
 * then erases a soft blurred ring around a rounded-rect near the edges so the image's own
 * pixels fade to real transparency there — not a color overlay on top, actual alpha in the
 * bitmap — so whatever sits behind the element on screen shows through smoothly, the same way
 * a CSS mask-image would (used instead of one because mask-image didn't render reliably in
 * testing). The mask follows a rounded-square shape (matching the artwork container) rather
 * than a circle, so the artwork itself doesn't fade to a circle well before reaching its
 * corners. Falls back to returning `dataUrl` unchanged if decoding or canvas access fails.
 */
export async function featherImageEdges(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    const scale = Math.max(OUTPUT_SIZE / img.width, OUTPUT_SIZE / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    ctx.drawImage(
      img,
      (OUTPUT_SIZE - drawWidth) / 2,
      (OUTPUT_SIZE - drawHeight) / 2,
      drawWidth,
      drawHeight,
    );

    // "destination-in" keeps the existing (already-drawn) pixels only where this next shape
    // is opaque, scaled by its alpha — filling a blurred rounded-rect here fades the image's
    // alpha to 0 only near its true rounded-square boundary (the blur softens just that edge),
    // instead of a radial gradient eating into it from the center in a circle.
    ctx.globalCompositeOperation = "destination-in";
    ctx.filter = `blur(${FEATHER_BLUR}px)`;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(
      FEATHER_BLUR,
      FEATHER_BLUR,
      OUTPUT_SIZE - FEATHER_BLUR * 2,
      OUTPUT_SIZE - FEATHER_BLUR * 2,
      CORNER_RADIUS,
    );
    ctx.fill();

    return canvas.toDataURL();
  } catch {
    return dataUrl;
  }
}
