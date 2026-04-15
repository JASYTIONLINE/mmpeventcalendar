/**
 * Generates one static HTML page per row in mmhp-master-data.json "features".
 * Output: contents/feature-events/YYYY-MM-DD-HHmm-<image-stem>.html
 * Template: contents/feature-events/yyyy-mm-dd-1900-bookme.html (literals in name; not a data row)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "assets", "data", "json", "mmhp-master-data.json");
const templatePath = path.join(root, "contents", "feature-events", "yyyy-mm-dd-1900-bookme.html");
const outDir = path.join(root, "contents", "feature-events");

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function fileHm(startTime) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || "19:00").trim());
  if (!m) return "1900";
  const h = parseInt(m[1], 10);
  return pad2(h) + m[2];
}

function imageStem(ev) {
  const raw = ev && ev.imagePath != null ? String(ev.imagePath).trim() : "";
  if (!raw) {
    const fid = ev && ev.featureId ? String(ev.featureId).trim() : "event";
    return fid.replace(/[^\w-]+/g, "-") || "event";
  }
  const base = raw.split(/[/\\]/).pop() || "";
  const stem = base.replace(/\.(png|jpe?g|gif|webp)$/i, "");
  return stem || "event";
}

function pageBasename(ev) {
  const date = String(ev.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}-${fileHm(ev.startTime)}-${imageStem(ev)}.html`;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatLongDate(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime12(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "19:00").trim());
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  if (min === "00") return `${h}:00 ${ap}`;
  return `${h}:${min} ${ap}`;
}

function buildHtmlForFeature(ev, tpl) {
  const eventName =
    String(ev.eventName || "").trim() ||
    `${String(ev.cardLine1 || "").trim()} — ${String(ev.cardLine2 || "").trim()}`.trim() ||
    "Featured event";
  const featureId = String(ev.featureId || ev.id || "").trim();
  const date = String(ev.date || "").trim();
  const startTime = String(ev.startTime || "19:00").trim();
  const dtIso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T${startTime}` : "";
  const [y, mo, d] = date.split("-").map((x) => parseInt(x, 10));
  const dateVisible = Number.isFinite(y) ? formatLongDate(y, mo, d) : "";
  const loc = String(ev.location || "Hall A").trim();
  const timePill = `${formatTime12(startTime)} · ${loc}`;
  const imgPath = String(ev.imagePath || "").trim().replace(/^\//, "");
  const imgSrc = imgPath ? `../../assets/images/${imgPath}` : "../../assets/images/event-flyer/bookme.png";
  const descRaw = String(ev.description || "").trim();
  const descHtml = descRaw
    ? `<p>${escapeHtml(descRaw).replace(/\r\n|\n/g, "<br>")}</p>`
    : `<p>Join us at McAllen Mobile Park for this featured evening.</p>`;

  let html = tpl;
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${escapeHtml(eventName)} | McAllen Mobile Park Events</title>`
  );
  html = html.replace(
    /data-mmhp-feature-id="">/,
    `data-mmhp-feature-id="${escapeHtml(featureId)}">`
  );
  html = html.replace(
    /<h1 class="feature-events-title">[^<]*<\/h1>/,
    `<h1 class="feature-events-title">${escapeHtml(eventName)}</h1>`
  );
  html = html.replace(
    /<time datetime="[^"]*">[^<]*<\/time>/,
    `<time datetime="${escapeHtml(dtIso)}">${escapeHtml(dateVisible)}</time>`
  );
  html = html.replace(
    /<p class="feature-events-time-pill"[^>]*>[^<]*<\/p>/,
    `<p class="feature-events-time-pill" aria-label="Event time">${escapeHtml(timePill)}</p>`
  );
  html = html.replace(
    /<img src="\.\.\/\.\.\/assets\/images\/event-flyer\/[^"]*" alt="Featured event flyer image">/,
    `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(eventName + " flyer")}">`
  );
  html = html.replace(
    /<p class="feature-events-loc">\s*<strong>Location<\/strong>\s*[\s\S]*?<\/p>/,
    `<p class="feature-events-loc">
          <strong>Location</strong>
          McAllen Mobile Park · ${escapeHtml(loc)}<br>
          4900 N Mc Coll Rd, McAllen, TX
        </p>`
  );
  html = html.replace(
    /<div class="feature-events-about">\s*[\s\S]*?<\/div>/,
    `<div class="feature-events-about">\n          ${descHtml}\n        </div>`
  );

  return html;
}

function main() {
  if (!fs.existsSync(templatePath)) {
    console.error("Missing template:", templatePath);
    process.exit(1);
  }
  const tpl = fs.readFileSync(templatePath, "utf8");
  const master = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const features = master.features || [];
  const written = [];
  const skipBasenames = new Set(["yyyy-mm-dd-1900-bookme.html"]);

  for (const ev of features) {
    if (ev.isActive === false) continue;
    const base = pageBasename(ev);
    if (!base) {
      console.warn("Skip feature (bad date):", ev.featureId);
      continue;
    }
    if (skipBasenames.has(base)) continue;
    const html = buildHtmlForFeature(ev, tpl);
    const outPath = path.join(outDir, base);
    fs.writeFileSync(outPath, html, "utf8");
    written.push(base);
  }

  console.log("Wrote", written.length, "feature event pages to", path.relative(root, outDir));
}

main();
