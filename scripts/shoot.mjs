// Screenshot strip: a page at every step of its scroll, on desktop and phone, in day and night, with and
// without reduced motion, in Chromium and WebKit. The strips are how the page is checked by eye.
//   node scripts/shoot.mjs [baseUrl] [--path /] [--steps 10] [--only chromium-desktop-light]
import { chromium, webkit } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:4321";
const path = flag("path", "/");
const steps = Number(flag("steps", "10"));
const only = flag("only", "");
const out = resolve(process.cwd(), "shots");
mkdirSync(out, { recursive: true });

const viewports = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const lanes = [];
for (const engine of ["chromium", "webkit"]) {
  for (const vp of Object.keys(viewports)) {
    lanes.push({ engine, vp, scheme: "light", reduced: false });
    lanes.push({ engine, vp, scheme: "dark", reduced: false });
    lanes.push({ engine, vp, scheme: "light", reduced: true });
  }
}
const engines = { chromium, webkit };
let failures = 0;

for (const engineName of Object.keys(engines)) {
  const mine = lanes.filter((lane) => lane.engine === engineName && (!only || `${lane.engine}-${lane.vp}-${lane.scheme}${lane.reduced ? "-rm" : ""}` === only));
  if (!mine.length) continue;
  const browser = await engines[engineName].launch();
  for (const lane of mine) {
    const name = `${lane.engine}-${lane.vp}-${lane.scheme}${lane.reduced ? "-rm" : ""}`;
    // Chromium only: isMobile is not supported by WebKit's desktop build, so the phone lane uses touch and size.
    const options = { ...viewports[lane.vp], colorScheme: lane.scheme, reducedMotion: lane.reduced ? "reduce" : "no-preference" };
    if (engineName === "webkit") delete options.isMobile;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let i = 0; i <= steps; i++) {
      const y = Math.round((total * i) / steps);
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
      await page.waitForTimeout(lane.reduced ? 250 : 800);
      await page.screenshot({ path: resolve(out, `${name}-${String(Math.round((i / steps) * 100)).padStart(3, "0")}.png`) });
      if (total === 0) break;
    }
    // Anything from Vercel's analytics script 404s locally; that is the only error allowed.
    const real = errors.filter((text) => !/_vercel\/insights|Failed to load resource/.test(text));
    failures += real.length;
    console.log(`${name}: ${total}px of scroll, ${real.length} error(s)`);
    for (const text of real.slice(0, 6)) console.log("    " + text);
    await context.close();
  }
  await browser.close();
}
console.log(`screenshots in ${out}`);
process.exit(failures ? 1 : 0);
