// Renders the HyperFrames motion pieces under hyperframes/ and publishes them for the site.
//   node scripts/build-media.mjs
//   ONLY=loop-kudos,burst-badge node scripts/build-media.mjs     rebuilds just those and keeps the rest of media.json
//
// Loops (1080 x 1080, six seconds, seamless) are published three ways: the composition itself in
// public/compositions/<name>/ for the live player, an H.264 fallback, and a poster.
// Bursts (1080 x 1080, 2.4 s, no ground) are published as video with an alpha channel: VP9 WebM for
// Chromium and Firefox, HEVC with alpha in MP4 for Safari, and a PNG of the peak frame.
//
// Needs ffmpeg with libx264, libvpx-vp9 and hevc_videotoolbox (macOS), and Chrome via the HyperFrames CLI.
// This Mac's ffmpeg cannot write WebP, so stills go PNG -> sharp. The repo lives in iCloud Drive, so every
// output is overwritten in place and every list of files is spelled out here: nothing is deleted, no folder
// is listed.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";

const HF = "hyperframes@0.9.32";
const root = process.cwd();
const project = (name) => resolve(root, "hyperframes", name);
const artDir = resolve(root, "public/art");
const mediaDir = resolve(root, "public/media");
const compDir = resolve(root, "public/compositions");
const generated = resolve(root, "src/lib/generated/media.json");

// Every file a composition carries in its own assets/ folder, and where it comes from.
const GSAP = ["node_modules/gsap/dist/gsap.min.js", "gsap.min.js"];
const FREDOKA = ["public/fonts/Fredoka.woff2", "fonts/Fredoka.woff2"];
const art = (file) => [join("public/art", file), file];

// `ground` is the colour the composition paints its square; `posterAt` is the moment the poster shows,
// which is also where the live player picks the loop up.
const loops = [
  { name: "loop-lock-screen", ground: "#15122E", posterAt: 1.9, assets: [GSAP, FREDOKA, art("web-phone-960.webp")] },
  { name: "loop-water-round", ground: "#221E45", posterAt: 3.95, assets: [GSAP, FREDOKA, art("pourie-water-960.webp")] },
  { name: "loop-nothing-resets", ground: "#FFF6E5", posterAt: 4.35, assets: [GSAP, FREDOKA, art("pourie-trophy-960.webp")] },
  {
    name: "loop-kudos",
    ground: "#FFB02E",
    posterAt: 0.95,
    assets: [GSAP, FREDOKA, art("pourie-bust-partyhat-400.webp"), art("pourie-bust-shades-400.webp"), art("pourie-bust-straw-400.webp")],
  },
];
const bursts = [
  { name: "burst-badge", peakAt: 0.9, assets: [GSAP, art("badge-closed-the-tab-400.webp")] },
  {
    name: "burst-cheer",
    peakAt: 0.7,
    assets: [GSAP, ...[1, 2, 3, 4, 5, 6].map((frame) => art(`web-sheet-cheer-${frame}-720.webp`))],
  },
];
// The player needs the HyperFrames runtime inside the composition's frame. It is served from here, never from a CDN.
const RUNTIME = ["node_modules/@hyperframes/core/dist/hyperframe.runtime.iife.js", "runtime/hyperframe.runtime.iife.js"];

const only = process.env.ONLY ? process.env.ONLY.split(",").map((name) => name.trim()).filter(Boolean) : null;
const wants = (name) => !only || only.includes(name);
const known = [...loops, ...bursts].map((item) => item.name);
for (const name of only ?? []) if (!known.includes(name)) throw new Error(`unknown piece "${name}"; choose from ${known.join(", ")}`);

function run(cmd, args, cwd = root) {
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
}
function hyperframes(args, cwd) {
  run("npx", ["--yes", HF, ...args], cwd);
}
function copy(from, to) {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}
function probe(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "csv=p=0", file])
    .toString().trim().split(/[\n,]/);
  const [num, den] = out[2].split("/").map(Number);
  return { width: Number(out[0]), height: Number(out[1]), fps: Math.round(num / den), duration: Number(Number(out[3]).toFixed(2)) };
}
const kb = (file) => Math.round(statSync(file).size / 1024);

/** Copies the composition's assets in from the site, then makes sure it passes the HyperFrames check. */
function prepare(item) {
  const dir = project(item.name);
  for (const [from, to] of item.assets) copy(resolve(root, from), join(dir, "assets", to));
  mkdirSync(join(dir, "renders"), { recursive: true });
  hyperframes(["check"], dir);
  return dir;
}

/** One exact frame of the composition as a PNG. `--keep` adds to the folder instead of clearing it. */
function still(dir, at) {
  hyperframes(["snapshot", "--at", String(at), "--no-end", "--describe", "false", "--keep", "-o", "renders/poster"], dir);
  const file = join(dir, "renders/poster", `at-${Number(at)}s.png`);
  if (!existsSync(file)) throw new Error(`snapshot did not write ${file}`);
  return file;
}

mkdirSync(mediaDir, { recursive: true });
mkdirSync(compDir, { recursive: true });
mkdirSync(dirname(generated), { recursive: true });
const media = existsSync(generated) ? JSON.parse(readFileSync(generated, "utf8")) : {};

copy(resolve(root, RUNTIME[0]), join(compDir, RUNTIME[1]));

for (const loop of loops) {
  if (!wants(loop.name)) continue;
  const dir = prepare(loop);
  const master = join(dir, "renders", `${loop.name}.mp4`);
  hyperframes(["render", "--quality", "high", "--fps", "30", "-o", `renders/${loop.name}.mp4`], dir);

  const mp4 = join(mediaDir, `${loop.name}.mp4`);
  run("ffmpeg", ["-v", "error", "-y", "-i", master, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "22",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", mp4]);

  const poster = join(mediaDir, `${loop.name}.webp`);
  await sharp(still(dir, loop.posterAt)).webp({ quality: 84, effort: 5 }).toFile(poster);

  // The bundle the player loads: the page and exactly the assets it names.
  const bundle = join(compDir, loop.name);
  copy(join(dir, "index.html"), join(bundle, "index.html"));
  for (const [, to] of loop.assets) copy(join(dir, "assets", to), join(bundle, "assets", to));

  media[loop.name] = {
    name: loop.name,
    kind: "loop",
    ...probe(mp4),
    ground: loop.ground,
    posterAt: loop.posterAt,
    composition: `/compositions/${loop.name}/index.html`,
    mp4: `/media/${loop.name}.mp4`,
    poster: `/media/${loop.name}.webp`,
  };
  console.log(`${loop.name}: mp4 ${kb(mp4)} KB, poster ${kb(poster)} KB`);
}

for (const burst of bursts) {
  if (!wants(burst.name)) continue;
  const dir = prepare(burst);
  // Both transparent formats come out of HyperFrames: the WebM as a reference, the ProRes 4444 as the master.
  hyperframes(["render", "--format", "webm", "--quality", "high", "--fps", "30", "-o", `renders/${burst.name}.webm`], dir);
  hyperframes(["render", "--format", "mov", "--quality", "high", "--fps", "30", "-o", `renders/${burst.name}.mov`], dir);
  const master = join(dir, "renders", `${burst.name}.mov`);

  // VP9 with alpha, encoded from the master at a web bitrate (the CLI's own WebM is about three times the size).
  const webm = join(mediaDir, `${burst.name}.webm`);
  run("ffmpeg", ["-v", "error", "-y", "-i", master, "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-crf", "34", "-b:v", "0",
    "-row-mt", "1", "-auto-alt-ref", "0", webm]);

  // HEVC with alpha for Safari, through VideoToolbox. The hvc1 tag is what makes Safari accept it.
  const hevc = join(mediaDir, `${burst.name}-hevc.mp4`);
  run("ffmpeg", ["-v", "error", "-y", "-i", master, "-an", "-c:v", "hevc_videotoolbox", "-allow_sw", "1", "-pix_fmt", "bgra",
    "-alpha_quality", "0.75", "-q:v", "55", "-tag:v", "hvc1", "-movflags", "+faststart", hevc]);

  // The peak frame, cut from the master so it keeps its alpha.
  const frame = join(dir, "renders", `${burst.name}-peak.png`);
  run("ffmpeg", ["-v", "error", "-y", "-ss", String(burst.peakAt), "-i", master, "-frames:v", "1", "-pix_fmt", "rgba", frame]);
  const poster = join(mediaDir, `${burst.name}.png`);
  await sharp(frame).png({ compressionLevel: 9, palette: true, quality: 92, effort: 8 }).toFile(poster);

  // Refuse to publish a burst that lost its alpha: a clear corner and a solid pixel somewhere in each file.
  for (const [file, decoder] of [[webm, ["-c:v", "libvpx-vp9"]], [hevc, []]]) {
    const check = join(dir, "renders", `${burst.name}-alpha-check.png`);
    run("ffmpeg", ["-v", "error", "-y", ...decoder, "-ss", String(burst.peakAt), "-i", file, "-frames:v", "1", "-pix_fmt", "rgba", check]);
    const { data, info } = await sharp(check).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let solid = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] === 255) solid++;
    const corner = data[(2 * info.width + 2) * 4 + 3];
    if (corner !== 0 || solid === 0) throw new Error(`${file} lost its alpha channel (corner alpha ${corner}, ${solid} solid pixels)`);
  }

  media[burst.name] = {
    name: burst.name,
    kind: "burst",
    ...probe(hevc),
    webm: `/media/${burst.name}.webm`,
    hevc: `/media/${burst.name}-hevc.mp4`,
    poster: `/media/${burst.name}.png`,
  };
  console.log(`${burst.name}: webm ${kb(webm)} KB, hevc ${kb(hevc)} KB, poster ${kb(poster)} KB`);
}

const ordered = Object.fromEntries(known.filter((name) => media[name]).map((name) => [name, media[name]]));
writeFileSync(generated, JSON.stringify(ordered, null, 2) + "\n");
console.log(`media: ${Object.keys(ordered).join(", ")}`);
