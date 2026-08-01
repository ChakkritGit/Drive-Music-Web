import { loadImage } from "@/lib/color";

// Output resolution — big enough to stay sharp at the artwork's largest on-screen size
// (~320px, plus retina headroom) without ballooning canvas/memory cost.
const OUTPUT_SIZE = 480;
// Corner radius and edge-feather width, as fractions of the canvas, for the rounded-square
// feather mask — kept proportionally close to the artwork container's own `rounded-2xl`.
const CORNER_RADIUS = OUTPUT_SIZE * 0.14;
const FEATHER_WIDTH = OUTPUT_SIZE * 0.06;

// Signed distance from `(px, py)` (canvas-center-relative) to a rounded rect's boundary —
// negative inside, 0 on the boundary, positive outside. Standard rounded-box SDF.
function roundedRectDistance(
  px: number,
  py: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
) {
  const dx = Math.abs(px) - halfWidth + radius;
  const dy = Math.abs(py) - halfHeight + radius;
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius
  );
}

/**
 * Draws `dataUrl` onto a square canvas (cropped to fill it, like CSS `object-fit: cover`),
 * then fades its own pixels to real transparency in a soft ring around a rounded-rect near the
 * edges — not a color overlay on top, actual alpha in the bitmap — so whatever sits behind the
 * element on screen shows through smoothly, the same way a CSS mask-image would (used instead
 * of one because mask-image didn't render reliably in testing). The fade is computed per-pixel
 * from a rounded-rect signed-distance field rather than via `ctx.filter = 'blur()'`, because
 * that filter is silently a no-op in WebKit for canvas fills — confirmed by direct testing, not
 * assumed — which left the mask's straight edges perfectly sharp while only its corner arcs
 * looked soft. The rounded-square shape (matching the artwork container) also means the artwork
 * doesn't fade to a circle well before reaching its corners, unlike a plain radial gradient.
 * Falls back to returning `dataUrl` unchanged if decoding or canvas access fails.
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

    const imageData = ctx.getImageData(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const { data } = imageData;
    const halfSize = OUTPUT_SIZE / 2 - FEATHER_WIDTH;
    for (let y = 0; y < OUTPUT_SIZE; y++) {
      const py = y - OUTPUT_SIZE / 2;
      for (let x = 0; x < OUTPUT_SIZE; x++) {
        const px = x - OUTPUT_SIZE / 2;
        const distance = roundedRectDistance(px, py, halfSize, halfSize, CORNER_RADIUS);
        const maskAlpha = Math.max(0, Math.min(1, 1 - distance / FEATHER_WIDTH));
        const alphaIndex = (y * OUTPUT_SIZE + x) * 4 + 3;
        data[alphaIndex] *= maskAlpha;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL();
  } catch {
    return dataUrl;
  }
}
