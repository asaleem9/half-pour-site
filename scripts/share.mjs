// Photographs /dev/share into public/brand/share.png (1200 x 630), the card link previews show.
//   npm run build && npm run preview &   then   npm run share
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:4321";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`${base}/dev/share`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.locator("[data-share-card]").screenshot({ path: "public/brand/share.png" });
await browser.close();
console.log("wrote public/brand/share.png");
