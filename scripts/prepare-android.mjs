// Run once after `npx cap add android`.
// Adds the app icon, splash screen, status-bar colour and the fixed signing key.
// Everything here is best effort: a step that does not match the generated project is skipped with a warning.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const res = path.join(androidDir, "app", "src", "main", "res");
const src = path.join(root, "resources", "android", "res");

const log = (m) => console.log("[prepare] " + m);
const warn = (m) => console.log("::warning::[prepare] " + m);

if (!fs.existsSync(res)) {
  console.error("[prepare] android/ project not found. Run `npx cap add android` first.");
  process.exit(1);
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

function copy(rel) {
  const to = path.join(res, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(src, rel), to);
}

const step = (name, fn) => {
  try {
    fn();
  } catch (e) {
    warn(name + " skipped: " + e.message);
  }
};

// 1) launcher icons (PNG sets + adaptive icon xml)
step("icons", () => {
  let n = 0;
  for (const rel of listFiles(src)) {
    const p = rel.split(path.sep).join("/");
    if (p.startsWith("mipmap-")) {
      copy(rel);
      n++;
    }
  }
  log("icons: " + n + " files");
});

// 2) icon background colour: change the existing definition, or add one if the project has none
step("icon background", () => {
  const valuesDir = path.join(res, "values");
  fs.mkdirSync(valuesDir, { recursive: true });
  const color = "#134F5D";
  let found = false;
  for (const f of fs.readdirSync(valuesDir).filter((x) => x.endsWith(".xml"))) {
    const p = path.join(valuesDir, f);
    const t = fs.readFileSync(p, "utf8");
    const re = /(<color\s+name="ic_launcher_background"\s*>)[^<]*(<\/color>)/;
    if (re.test(t)) {
      fs.writeFileSync(p, t.replace(re, "$1" + color + "$2"));
      found = true;
      log("icon background set in values/" + f);
    }
  }
  if (!found) {
    copy(path.join("values", "ic_launcher_background.xml"));
    log("icon background added");
  }
});

// 3) splash: remove the default bitmaps and use a centred logo on a solid colour
step("splash", () => {
  let removed = 0;
  for (const d of fs.readdirSync(res).filter((x) => x.startsWith("drawable"))) {
    for (const f of fs.readdirSync(path.join(res, d))) {
      if (/^splash\.(png|jpg|jpeg|webp|xml)$/i.test(f)) {
        fs.rmSync(path.join(res, d, f));
        removed++;
      }
    }
  }
  copy(path.join("drawable", "splash.xml"));
  copy(path.join("drawable-nodpi", "ndgs_splash_logo.png"));
  log("splash: removed " + removed + " default image(s), added the NDGS splash");
});

// 4) status bar / navigation bar colour on Android 14 and older (newer versions draw edge to edge)
step("status bar colour", () => {
  const p = path.join(res, "values", "styles.xml");
  if (!fs.existsSync(p)) throw new Error("styles.xml not found");
  let t = fs.readFileSync(p, "utf8");
  if (t.includes("ndgs-bars")) return log("status bar colour already set");
  let n = 0;
  t = t.replace(/(<style\s+name="AppTheme(?:\.NoActionBar)?"[^>]*>)/g, (m) => {
    n++;
    return (
      m +
      '\n        <item name="android:statusBarColor">#0C3441</item>' +
      '\n        <item name="android:navigationBarColor">#0C3441</item>'
    );
  });
  if (!n) throw new Error("AppTheme style not found");
  t = t.replace("</resources>", "    <!-- ndgs-bars -->\n</resources>");
  fs.writeFileSync(p, t);
  log("status bar colour set in " + n + " style(s)");
});

// 5) fixed signing key, so a new build can be installed over the previous one
step("signing", () => {
  const ks = path.join(root, "keystore", "ndgs-debug.keystore").split(path.sep).join("/");
  if (!fs.existsSync(ks)) throw new Error("keystore not found");
  const gradle = `// Signs debug builds with the project key, so every build can update the app installed on the phone.
allprojects {
    plugins.withId('com.android.application') {
        android {
            signingConfigs {
                ndgs {
                    storeFile file('${ks}')
                    storePassword 'ndgs-report'
                    keyAlias 'ndgs'
                    keyPassword 'ndgs-report'
                }
            }
            buildTypes {
                debug {
                    signingConfig signingConfigs.ndgs
                }
            }
        }
    }
}
`;
  fs.writeFileSync(path.join(androidDir, "ndgs-signing.init.gradle"), gradle);
  log("signing init script written");
});

log("done");
