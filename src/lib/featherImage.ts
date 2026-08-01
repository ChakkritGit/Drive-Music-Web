import { loadImage } from "@/lib/color";

// Output resolution — big enough to stay sharp at the artwork's largest on-screen size
// (~320px, plus retina headroom) without ballooning canvas/memory cost.
const OUTPUT_SIZE = 480;
// The gradient's inner/outer radius as a fraction of the canvas — inside the inner radius the
// image stays fully opaque; between inner and outer it fades to fully transparent.
const FADE_INNER = 0.32;
const FADE_OUTER = 0.5;

/**
 * Draws `dataUrl` onto a square canvas (cropped to fill it, like CSS `object-fit: cover`),
 * then erases a soft radial ring at the edges so the image's own pixels fade to real
 * transparency there — not a color overlay on top, actual alpha in the bitmap — so whatever
 * sits behind the element on screen shows through smoothly, the same way a CSS mask-image
 * would (used instead of one because mask-image didn't render reliably in testing). Falls back
 * to returning `dataUrl` unchanged if decoding or canvas access fails.
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
    // is opaque, scaled by its alpha — painting a black-to-transparent radial gradient here
    // multiplies the image's alpha down to 0 out toward the edges.
    ctx.globalCompositeOperation = "destination-in";
    const center = OUTPUT_SIZE / 2;
    const gradient = ctx.createRadialGradient(
      center,
      center,
      OUTPUT_SIZE * FADE_INNER,
      center,
      center,
      OUTPUT_SIZE * FADE_OUTER,
    );
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    return canvas.toDataURL();
  } catch {
    return dataUrl;
  }
}
