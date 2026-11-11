// One full-page screenshot, for looking at a single page or state while building.
//   node scripts/snap.mjs /dev/rig shots/rig.png [--dark] [--width 1440] [--phone]
import { chromium } from "playwright";
const [path = "/", out = "shots/snap.png", ...rest] = process.argv.slice(2);
const width = rest.includes("--width") ? Number(rest[rest.indexOf("--width") + 1]) : rest.includes("--phone") ? 390 : 1440;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height: rest.includes("--phone") ? 844 : 900 },
  deviceScaleFactor: rest.includes("--phone") ? 2 : 1,
  colorScheme: rest.includes("--dark") ? "dark" : "light",
});
const page = await context.newPage();
page.on("pageerror", (error) => console.log("pageerror:", error.message));
await page.goto((process.env.BASE || "http://localhost:4321") + path, { waitUntil: "networkidle" });
await page.waitForTimeout(Number(process.env.WAIT || 800));
await page.screenshot({ path: out, fullPage: !rest.includes("--viewport") });
await browser.close();
console.log("wrote", out);
