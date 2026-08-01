const FALLBACK_COLOR = "rgb(120, 120, 120)";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for color sampling"));
    img.src = src;
  });
}

/** Downscales an image to a tiny canvas and averages its pixels into a single `rgb(...)` color, for an ambient glow effect. */
export async function getAverageColor(dataUrl: string): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    const size = 16;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return FALLBACK_COLOR;

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count++;
    }

    if (count === 0) return FALLBACK_COLOR;
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  } catch {
    return FALLBACK_COLOR;
  }
}
