// Downloads the Google Fonts used by the report and stores them inside the app,
// so the fonts (and the PDF export that depends on them) work without internet.
// If anything fails, index.html is left untouched and still loads the fonts online.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const www = path.join(root, "www");
const indexPath = path.join(www, "index.html");
const START = "<!--fonts:start-->";
const END = "<!--fonts:end-->";
// a browser-like User-Agent makes Google return compact woff2 files
const UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const log = (m) => console.log("[fonts] " + m);
const warn = (m) => console.log("::warning::[fonts] " + m);

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
  return res;
}

let html = fs.readFileSync(indexPath, "utf8");
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < 0) {
  warn("font markers not found in www/index.html, skipping");
  process.exit(0);
}
const block = html.slice(a, b + END.length);
if (block.includes('href="fonts/fonts.css"') && fs.existsSync(path.join(www, "fonts", "fonts.css"))) {
  log("fonts are already bundled, nothing to do");
  process.exit(0);
}
const m = block.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/);
if (!m) {
  warn("no font stylesheet link found, skipping");
  process.exit(0);
}

try {
  const cssUrl = m[1].replace(/&amp;/g, "&");
  log("reading " + cssUrl);
  const css = await (await get(cssUrl)).text();
  const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((x) => x[1].trim().replace(/^['"]|['"]$/g, "")))];
  if (!urls.length) throw new Error("the stylesheet has no font files");
  const dir = path.join(www, "fonts");
  fs.mkdirSync(dir, { recursive: true });
  let out = css;
  let bytes = 0;
  for (const u of urls) {
    const ext = ((u.split("?")[0].match(/\.(woff2|woff|ttf|otf)$/i) || [])[1] || "woff2").toLowerCase();
    const name = crypto.createHash("sha1").update(u).digest("hex").slice(0, 12) + "." + ext;
    const buf = Buffer.from(await (await get(u)).arrayBuffer());
    fs.writeFileSync(path.join(dir, name), buf);
    bytes += buf.length;
    out = out.split(u).join(name);
  }
  fs.writeFileSync(path.join(dir, "fonts.css"), out);
  html = html.slice(0, a) + START + '\n<link rel="stylesheet" href="fonts/fonts.css">\n' + END + html.slice(b + END.length);
  fs.writeFileSync(indexPath, html);
  log("saved " + urls.length + " font files (" + Math.round(bytes / 1024) + " KB) into www/fonts");
} catch (e) {
  warn("could not bundle the fonts (" + e.message + "). The app will load them online instead.");
}
