// Paints over small marks in a photo (a logo, a label) by filling each area from the colours
// around it, with a little grain so the patch doesn't look flat. Areas are fractions of the
// image (0–1), so they work at any resolution.
import sharp from "sharp";

/**
 * [left, top, right, bottom] as fractions of the width and height, optionally followed by "h" to
 * fill only from the left and right edges (or "v": top and bottom), for a mark on a band of shading.
 */
export type Area = [number, number, number, number] | [number, number, number, number, "h" | "v"];

const MAX_SIDE = 1600;
const BAND = 3; // pixels averaged just outside each edge
const FEATHER = 6; // pixels blended back to the original along the inside of each edge
const SMOOTH = 8; // edge colours are averaged over this many pixels either side

export async function coverMarks(input: Buffer, areas: Area[]): Promise<Buffer> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const px = (x: number, y: number, c: number) => data[(y * W + x) * 3 + c];

  for (const [l, t, r, b, mode] of areas) {
    const x0 = Math.max(0, Math.floor(l * W));
    const y0 = Math.max(0, Math.floor(t * H));
    const x1 = Math.min(W, Math.ceil(r * W));
    const y1 = Math.min(H, Math.ceil(b * H));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < 2 || h < 2) continue;

    // Average colour of a few pixels just outside the area, per row (left/right) and column (top/bottom).
    const band = (xs: number[], ys: number[]) => {
      const out = [0, 0, 0];
      let n = 0;
      for (const y of ys) for (const x of xs) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        for (let c = 0; c < 3; c++) out[c] += px(x, y, c);
        n++;
      }
      return n ? out.map((v) => v / n) : null;
    };
    const range = (from: number, n: number, step: number) => Array.from({ length: n }, (_, i) => from + i * step);
    let left = range(0, h, 1).map((i) => band(range(x0 - 1, BAND, -1), [y0 + i]));
    let right = range(0, h, 1).map((i) => band(range(x1, BAND, 1), [y0 + i]));
    let top = range(0, w, 1).map((i) => band([x0 + i], range(y0 - 1, BAND, -1)));
    let bottom = range(0, w, 1).map((i) => band([x0 + i], range(y1, BAND, 1)));

    // Edge colours far from the typical surrounding colour (a frame line, a button, a seam) are
    // left out, so they don't streak across the patch.
    const all = [...left, ...right, ...top, ...bottom].filter((v): v is number[] => !!v);
    if (!all.length) continue;
    const median = [0, 1, 2].map((c) => all.map((v) => v[c]).sort((a, z) => a - z)[all.length >> 1]);
    const dist = (v: number[]) => Math.sqrt(v.reduce((s, x, c) => s + (x - median[c]) ** 2, 0) / 3);
    const typical = all.map(dist).sort((a, z) => a - z)[Math.floor(all.length * 0.6)];
    const limit = Math.max(80, typical * 3);
    const keep = (v: number[] | null) => (v && dist(v) <= limit ? v : null);
    [left, right, top, bottom] = [left, right, top, bottom].map((edge) => edge.map(keep));
    // Smooth each edge along its length, so a single stitch or speck doesn't draw a line across.
    // A point left out takes the colour of the nearest kept point on the same edge, so the patch
    // has no stripes; an edge with nothing kept (a frame line along it) isn't used at all.
    const smooth = (raw: (number[] | null)[]) => {
      if (raw.filter(Boolean).length < raw.length / 3) return raw.map(() => null);
      const edge = raw.map((v, i) => {
        if (v) return v;
        for (let d = 1; d < raw.length; d++) {
          const near = raw[i - d] ?? raw[i + d];
          if (near) return near;
        }
        return null;
      });
      return edge.map((v, i) => {
        if (!v) return null;
        const near = edge.slice(Math.max(0, i - SMOOTH), i + SMOOTH + 1).filter((x): x is number[] => !!x);
        return [0, 1, 2].map((c) => near.reduce((s, x) => s + x[c], 0) / near.length);
      });
    };
    [left, right, top, bottom] = [left, right, top, bottom].map(smooth);
    if (mode === "h") [top, bottom] = [top.map(() => null), bottom.map(() => null)];
    if (mode === "v") [left, right] = [left.map(() => null), right.map(() => null)];

    // Grain: the spread of the surrounding pixels that were kept.
    const ring = [...left, ...right, ...top, ...bottom].filter((v): v is number[] => !!v);
    const spread = ring.length ? Math.sqrt(ring.reduce((s, v) => s + dist(v) ** 2, 0) / ring.length) : 0;
    const grain = Math.min(6, spread * 0.25) + 1.5;

    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const u = (i + 0.5) / w;
        const v = (j + 0.5) / h;
        const L = left[j], R = right[j], T = top[i], B = bottom[i];
        // Blend across, then down, weighting each by how close the pixel is to those edges.
        const across = L && R ? L.map((c, k) => c * (1 - u) + R[k] * u) : (L ?? R);
        const down = T && B ? T.map((c, k) => c * (1 - v) + B[k] * v) : (T ?? B);
        const dx = L && R ? Math.min(i, w - 1 - i) : L ? i : w - 1 - i;
        const dy = T && B ? Math.min(j, h - 1 - j) : T ? j : h - 1 - j;
        const wa = across ? 1 / (dx + 1) : 0;
        const wd = down ? 1 / (dy + 1) : 0;
        const noise = (Math.random() + Math.random() + Math.random() - 1.5) * grain;
        // Keep the original near the edges so the patch fades in (not where an edge was left out).
        const edge = Math.min(L ? i : FEATHER, R ? w - 1 - i : FEATHER, T ? j : FEATHER, B ? h - 1 - j : FEATHER);
        const alpha = Math.min(1, edge / FEATHER);
        for (let c = 0; c < 3; c++) {
          const base = wa || wd ? ((across?.[c] ?? 0) * wa + (down?.[c] ?? 0) * wd) / (wa + wd) : median[c];
          const fill = base + noise;
          const k = ((y0 + j) * W + x0 + i) * 3 + c;
          data[k] = Math.max(0, Math.min(255, Math.round(fill * alpha + data[k] * (1 - alpha))));
        }
      }
    }
  }
  return sharp(data, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
