// Turns the illustration originals into web images.
//   node scripts/build-art.mjs [name ...]        (no names: everything that exists)
// Originals are the 1024 px renders in the app repo (HALFPOUR_APP_DIR, default ../half-pour) under
// Tools/art/out. Each is trimmed, given the same sticker treatment as the app (gaps inside the outline
// filled with cream, a cream die-cut edge), and written as AVIF and WebP at two widths into public/art.
// Animation sheets (six frames in a 3 x 2 grid) are cut into frames first.
// Names come from the two manifests, never from a folder listing, and files are overwritten in place.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const appDir = resolve(root, process.env.HALFPOUR_APP_DIR || "../half-pour");
const sourceDir = join(appDir, "Tools/art/out");
const outDir = join(root, "public/art");
mkdirSync(outDir, { recursive: true });

const CREAM = [0xff, 0xf6, 0xe5];
const appManifest = JSON.parse(readFileSync(join(appDir, "Tools/art/manifest.json"), "utf8"));
const webManifest = JSON.parse(readFileSync(join(root, "art/manifest.json"), "utf8"));

// What each group is exported as: the longest side of the two sizes.
const plans = {
  pourie: [480, 960],
  "web-pourie": [480, 960],
  moods: [160, 320],
  avatars: [200, 400],
  badges: [200, 400],
  drinks: [160, 320],
  plan: [120, 240],
  guides: [240, 480],
  "web-props": [200, 400],
  "web-sheets": [360, 720],
};

const entries = [...appManifest.images, ...webManifest.images].filter((entry) => plans[entry.group]);
const only = process.argv.slice(2);
const selected = only.length ? entries.filter((entry) => only.includes(entry.name)) : entries;

/** Bounding box of everything with alpha above the threshold. */
function bounds(data, width, height, threshold = 6) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * The sticker pass on a straight-alpha RGBA buffer that already has `edge` + 2 px of empty margin:
 * anything not reachable from the border through near-transparent pixels is inside the sticker and is
 * flattened onto cream; a cream edge of `edge` px is then grown around the shape.
 */
function sticker(data, width, height, edge) {
  const size = width * height;
  const outside = new Uint8Array(size);
  const stack = [];
  const push = (index) => {
    if (!outside[index] && data[index * 4 + 3] < 40) {
      outside[index] = 1;
      stack.push(index);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const index = stack.pop();
    const x = index % width;
    if (x > 0) push(index - 1);
    if (x < width - 1) push(index + 1);
    if (index >= width) push(index - width);
    if (index < size - width) push(index + width);
  }

  // Chamfer distance (3-4) from the shape, for the edge and its soft rim.
  const INF = 1e9;
  const dist = new Float32Array(size);
  for (let i = 0; i < size; i++) dist[i] = outside[i] ? INF : 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[i - 1] + 3);
      if (y > 0) {
        d = Math.min(d, dist[i - width] + 3);
        if (x > 0) d = Math.min(d, dist[i - width - 1] + 4);
        if (x < width - 1) d = Math.min(d, dist[i - width + 1] + 4);
      }
      dist[i] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x < width - 1) d = Math.min(d, dist[i + 1] + 3);
      if (y < height - 1) {
        d = Math.min(d, dist[i + width] + 3);
        if (x < width - 1) d = Math.min(d, dist[i + width + 1] + 4);
        if (x > 0) d = Math.min(d, dist[i + width - 1] + 4);
      }
      dist[i] = d;
    }
  }

  const out = Buffer.alloc(size * 4);
  for (let i = 0; i < size; i++) {
    const o = i * 4;
    if (!outside[i]) {
      const a = data[o + 3] / 255;
      out[o] = Math.round(data[o] * a + CREAM[0] * (1 - a));
      out[o + 1] = Math.round(data[o + 1] * a + CREAM[1] * (1 - a));
      out[o + 2] = Math.round(data[o + 2] * a + CREAM[2] * (1 - a));
      out[o + 3] = 255;
    } else {
      const d = dist[i] / 3; // pixels from the shape
      const cover = Math.max(0, Math.min(1, edge + 0.5 - d));
      // Keep whatever faint antialiasing the original had under the new edge.
      const a = data[o + 3] / 255;
      out[o] = Math.round(data[o] * a + CREAM[0] * (1 - a));
      out[o + 1] = Math.round(data[o + 1] * a + CREAM[1] * (1 - a));
      out[o + 2] = Math.round(data[o + 2] * a + CREAM[2] * (1 - a));
      out[o + 3] = Math.round(Math.max(cover, a * cover) * 255);
    }
  }
  return out;
}

/** Crops to the art (or to a fixed cell), pads, runs the sticker pass, returns a sharp instance and its size. */
async function prepare(input, cell) {
  let image = sharp(input).ensureAlpha();
  if (cell) image = image.extract(cell);
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  let { width, height } = info;
  let buffer = data;
  if (!cell) {
    const box = bounds(data, width, height);
    if (!box) throw new Error("empty image");
    const cropped = await sharp(data, { raw: { width, height, channels: 4 } })
      .extract({ left: box.x0, top: box.y0, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    buffer = cropped.data;
    width = cropped.info.width;
    height = cropped.info.height;
  }
  const edge = Math.max(4, Math.round(Math.max(width, height) * 0.016));
  const pad = edge + 2;
  const padded = await sharp(buffer, { raw: { width, height, channels: 4 } })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const done = sticker(padded.data, padded.info.width, padded.info.height, edge);
  return { buffer: done, width: padded.info.width, height: padded.info.height };
}

async function write(name, prepared, sizes) {
  const { buffer, width, height } = prepared;
  const longest = Math.max(width, height);
  for (const size of sizes) {
    const scale = Math.min(1, size / longest);
    const w = Math.round(width * scale);
    const base = sharp(buffer, { raw: { width, height, channels: 4 } }).resize({ width: w, kernel: "lanczos3" });
    await base.clone().avif({ quality: 62, effort: 5 }).toFile(join(outDir, `${name}-${size}.avif`));
    await base.clone().webp({ quality: 84, effort: 5 }).toFile(join(outDir, `${name}-${size}.webp`));
  }
  return { width, height };
}

const indexPath = join(root, "src/lib/generated/art.json");
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, "utf8")) : {};
let made = 0;
const missing = [];

for (const entry of selected) {
  const input = join(sourceDir, `${entry.name}.png`);
  if (!existsSync(input)) {
    missing.push(entry.name);
    continue;
  }
  const sizes = plans[entry.group];
  try {
    if (entry.group === "web-sheets") {
      const meta = await sharp(input).metadata();
      const cellW = Math.floor(meta.width / 3);
      const cellH = Math.floor(meta.height / 2);
      for (let frame = 0; frame < 6; frame++) {
        const cell = { left: (frame % 3) * cellW, top: Math.floor(frame / 3) * cellH, width: cellW, height: cellH };
        const prepared = await prepare(input, cell);
        const size = await write(`${entry.name}-${frame + 1}`, prepared, sizes);
        index[`${entry.name}-${frame + 1}`] = { ...size, sizes, group: entry.group };
      }
    } else {
      const prepared = await prepare(input);
      const size = await write(entry.name, prepared, sizes);
      index[entry.name] = { ...size, sizes, group: entry.group };
    }
    made++;
  } catch (error) {
    console.error(`failed ${entry.name}: ${error.message}`);
  }
}

mkdirSync(join(root, "src/lib/generated"), { recursive: true });
const sorted = Object.fromEntries(Object.keys(index).sort().map((key) => [key, index[key]]));
writeFileSync(indexPath, JSON.stringify(sorted, null, 2) + "\n");
console.log(`art: ${made} processed, ${missing.length} not generated yet${missing.length ? ` (${missing.join(", ")})` : ""}`);
