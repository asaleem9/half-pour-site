// Builds the app footage and screenshots the page uses.
//   node scripts/build-footage.mjs
// 1. The rewind clip: four recorded app sequences (check-in, score, logging, plan) from the app repo's
//    launch-film project, stitched into one H.264 file with a keyframe every third frame and no B-frames,
//    so setting currentTime from scroll lands on a frame almost instantly. A poster is written per stop.
// 2. The App Store screenshots in day and night at two widths, for the feature tiles.
// Sources are read from the app repo (HALFPOUR_APP_DIR, default ../half-pour). Outputs overwrite in place.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const appDir = resolve(root, process.env.HALFPOUR_APP_DIR || "../half-pour");
const footageDir = join(appDir, "videos/half-pour-launch/assets/footage");
const mediaDir = join(root, "public/media");
const screensDir = join(root, "public/screens");
mkdirSync(mediaDir, { recursive: true });
mkdirSync(screensDir, { recursive: true });
mkdirSync(join(root, "src/lib/generated"), { recursive: true });

const FPS = 15;
// Each stop of the rewind, in the order the page scrolls through them. `at` is when the moment the
// headline is about happens, in seconds from the start of that stop's footage.
const stops = [
  { name: "checkin", frames: 66, at: 2.75, time: "9:00 AM", theme: "day" },
  { name: "score", frames: 45, at: 1.2, time: "12:00 AM", theme: "night" },
  { name: "logging", frames: 36, at: 1.4, time: "10:30 PM", theme: "night" },
  { name: "plan", frames: 33, at: 1.2, time: "6:00 PM", theme: "dusk" },
];

for (const stop of stops) {
  const last = join(footageDir, stop.name, `${String(stop.frames - 1).padStart(3, "0")}.jpg`);
  if (!existsSync(last)) throw new Error(`missing footage frames for ${stop.name} in ${footageDir}; run record-footage.sh in the launch-film project`);
}

const inputs = stops.flatMap((stop) => ["-framerate", String(FPS), "-start_number", "0", "-i", join(footageDir, stop.name, "%03d.jpg")]);
const trims = stops.map((stop, i) => `[${i}:v]trim=end_frame=${stop.frames},setpts=PTS-STARTPTS,scale=640:1390,setsar=1[v${i}]`).join(";");
const concat = stops.map((_, i) => `[v${i}]`).join("") + `concat=n=${stops.length}:v=1:a=0[out]`;
const clip = join(mediaDir, "rewind.mp4");
execFileSync(
  "ffmpeg",
  ["-v", "error", "-y", ...inputs, "-filter_complex", `${trims};${concat}`, "-map", "[out]", "-r", String(FPS), "-an",
    "-c:v", "libx264", "-preset", "slow", "-crf", "23", "-g", "3", "-keyint_min", "3", "-bf", "0",
    "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", clip],
  { stdio: ["ignore", "inherit", "inherit"] },
);

let cursor = 0;
const segments = [];
for (const stop of stops) {
  const duration = stop.frames / FPS;
  // Posters: the first and the last frame of the stop, for before the clip loads and for reduced motion.
  for (const [suffix, frame] of [["start", 0], ["end", stop.frames - 1]]) {
    await sharp(join(footageDir, stop.name, `${String(frame).padStart(3, "0")}.jpg`))
      .webp({ quality: 80 })
      .toFile(join(mediaDir, `rewind-${stop.name}-${suffix}.webp`));
  }
  segments.push({ name: stop.name, time: stop.time, theme: stop.theme, start: Number(cursor.toFixed(3)), end: Number((cursor + duration).toFixed(3)), at: Number((cursor + stop.at).toFixed(3)) });
  cursor += duration;
}
writeFileSync(
  join(root, "src/lib/generated/rewind.json"),
  JSON.stringify({ src: "/media/rewind.mp4", width: 640, height: 1390, fps: FPS, duration: Number(cursor.toFixed(3)), stops: segments }, null, 2) + "\n",
);

// Screenshots, day and night.
const shots = ["01-tonight-live", "02-plan-tonight", "03-tab-closed", "04-morning-check-in", "05-week", "06-night-detail", "07-insights", "08-trophy-room", "09-guides"];
const shotDir = join(appDir, "docs/screenshots/iPhone-18-Pro-Max");
for (const shot of shots) {
  for (const [theme, dir] of [["light", shotDir], ["dark", join(shotDir, "dark")]]) {
    const input = join(dir, `${shot}.png`);
    if (!existsSync(input)) throw new Error(`missing screenshot ${input}`);
    const name = shot.replace(/^\d+-/, "");
    for (const width of [360, 720]) {
      const base = sharp(input).resize({ width });
      await base.clone().avif({ quality: 55, effort: 5 }).toFile(join(screensDir, `${name}-${theme}-${width}.avif`));
      await base.clone().webp({ quality: 80, effort: 5 }).toFile(join(screensDir, `${name}-${theme}-${width}.webp`));
    }
  }
}
// The launch film, as rendered by the launch-film project, and a poster for it.
const film = join(appDir, "videos/half-pour-launch/renders/video.mp4");
if (existsSync(film)) {
  copyFileSync(film, join(mediaDir, "film.mp4"));
  const frame = join(mediaDir, "film-poster.png");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "9.4", "-i", film, "-frames:v", "1", frame]);
  await sharp(frame).resize({ width: 720 }).webp({ quality: 82 }).toFile(join(mediaDir, "film-poster.webp"));
  rmSync(frame);
} else {
  console.warn("film: no render found at " + film);
}

console.log(`footage: rewind.mp4 (${cursor.toFixed(1)} s, ${stops.length} stops), ${shots.length} screenshots in two themes`);
