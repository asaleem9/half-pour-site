// Guards the repo before and after a build.
//   node scripts/check-repo.mjs source   checks src/, public/, scripts/, art/ and hyperframes/
//   node scripts/check-repo.mjs built    checks the built pages
// It fails on: duplicate "name 2.ext" files (iCloud Drive makes them when a folder is rewritten),
// words the brand never uses, and tool or vendor references that do not belong in this repo.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const root = process.cwd();
const mode = process.argv[2] ?? "source";
const builtDir = existsSync(join(root, "dist")) && process.env.VERCEL ? "dist" : "dist.nosync";
const roots = mode === "built" ? [builtDir] : ["src", "public", "scripts", "art", "hyperframes"];
const skipDirs = new Set(["node_modules", ".git", ".astro", ".vercel", "renders", ".hyperframes", "_astro"]);
const textTypes = new Set([".astro", ".ts", ".js", ".mjs", ".css", ".html", ".md", ".json", ".txt", ".svg", ".xml"]);

// Words Half Pour never says, in copy or as a joke. Matched as whole words.
const voice = ["sober", "sobriety", "relapse", "relapsed", "alcoholic", "alcoholics", "addict", "day 1", "day one", "you failed", "bac"];
// The one exception: a badge in the app is really called this, and the site shows badges by their real names.
const allowed = [/sober-ish october/gi];
// Names that must not appear anywhere in the repo.
const stray = [["cl", "aude"], ["anth", "ropic"]].map((parts) => parts.join(""));

const problems = [];
const wordPattern = (word) => new RegExp(`(^|[^a-z0-9])${word.replace(/ /g, "[ -]")}([^a-z0-9]|$)`, "i");

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const path = join(dir, name);
    const rel = relative(root, path);
    if (/ \d+(\.[^.]+)?$/.test(name)) problems.push(`duplicate file: ${rel}`);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      walk(path);
      continue;
    }
    if (!textTypes.has(extname(name)) || stat.size > 2_000_000) continue;
    const text = readFileSync(path, "utf8");
    const self = rel === join("scripts", "check-repo.mjs");
    if (!self) {
      for (const word of stray) if (text.toLowerCase().includes(word)) problems.push(`stray reference "${word}": ${rel}`);
    }
    // Voice applies to what visitors read: pages, components, copy and built HTML. The app's help
    // resources name a condition in the standard disclaimer, which is allowed.
    const isCopy = mode === "built" ? extname(name) === ".html" : /^src\/(pages|components|lib)\//.test(rel) && !rel.startsWith(join("src", "lib", "generated"));
    if (isCopy && !self) {
      let visible = extname(name) === ".html" ? text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ") : text;
      for (const phrase of allowed) visible = visible.replace(phrase, " ");
      for (const word of voice) if (wordPattern(word).test(visible)) problems.push(`voice: "${word}" in ${rel}`);
    }
  }
}

for (const dir of roots) if (existsSync(join(root, dir))) walk(join(root, dir));

if (problems.length) {
  console.error(`check-repo (${mode}) found ${problems.length} problem(s):`);
  for (const problem of problems) console.error("  " + problem);
  process.exit(1);
}
console.log(`check-repo (${mode}): clean`);
