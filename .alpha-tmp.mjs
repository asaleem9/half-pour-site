import sharp from "sharp";
for (const f of process.argv.slice(2)) {
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4));
  let opaque = 0, clear = 0, partial = 0, confetti = null;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a === 255) { opaque++; if (!confetti && Math.hypot(x - 540, y - 540) > 330) confetti = [x, y]; } else if (a === 0) clear++; else partial++;
  }
  console.log(f.split("/").pop(), `${info.width}x${info.height} ch=${info.channels}`, "corner(2,2)=", px(2, 2), "centre(540,540)=", px(540, 540), "confetti", confetti, confetti ? px(confetti[0] + 6, confetti[1] + 6) : null, `opaque=${opaque} clear=${clear} partial=${partial}`);
}
