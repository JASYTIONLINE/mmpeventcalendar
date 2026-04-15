/**
 * Replaces mmhp-master-data.json "features" from assets/data/csv/featured-events.csv.
 * Run from repo root: node scripts/build-features-from-csv.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const csvPath = path.join(root, "assets", "data", "csv", "featured-events.csv");
const jsonPath = path.join(root, "assets", "data", "json", "mmhp-master-data.json");

const LISTING_SEP = " — ";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\r") continue;
    if (c === "\n") {
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function formatCardLine3FromIso(ymd) {
  const p = String(ymd || "")
    .trim()
    .split("-");
  if (p.length !== 3) return "";
  const y = parseInt(p[0], 10);
  const mo = parseInt(p[1], 10) - 1;
  const d = parseInt(p[2], 10);
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return "";
  const dt = new Date(y, mo, d);
  return dt
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "7:00 PM" -> "19:00", "7:30 AM" -> "07:30" */
function parseTimeTo24h(s) {
  const t = String(s || "").trim();
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
  if (!m) return "19:00";
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return String(h).padStart(2, "0") + ":" + min;
}

function parseBoolCell(val, defaultVal) {
  const s = String(val != null ? val : "").trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return defaultVal;
}

function deriveListingTitle(cardLine1, cardLine2) {
  const c1 = String(cardLine1 || "").trim();
  const c2 = String(cardLine2 || "").trim();
  if (!c1 && !c2) return "";
  if (!c1) return c2;
  if (!c2) return c1;
  return c1 + LISTING_SEP + c2;
}

/** Relative to assets/images. CSV Image may be "event-flyer/x.jpg" or "x.jpg". */
function resolveImagePath(cardLine1, cardLine2, imageCell) {
  let raw = String(imageCell != null ? imageCell : "").trim();
  if (raw) {
    if (!raw.includes("/")) raw = "event-flyer/" + raw.replace(/^\/+/, "");
    return raw;
  }
  const c1 = String(cardLine1 || "").trim();
  const c2 = String(cardLine2 || "").trim();
  if (c1 === "Karaoke" && c2 === "Karaoke") return "event-flyer/karaoke.png";
  if (c1 === "DJ Dance" && c2 === "DJ Karaoke") return "event-flyer/djdance.png";
  return "";
}

function rowsToObjects(header, body) {
  const h = header.map((x) => String(x || "").trim());
  const objects = [];
  for (const cells of body) {
    const o = {};
    for (let i = 0; i < h.length; i++) {
      o[h[i]] = cells[i] != null ? String(cells[i]).trim() : "";
    }
    objects.push(o);
  }
  return objects;
}

function main() {
  const text = fs.readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/);
  const dataLines = lines
    .filter((ln) => {
      const s = ln.trim();
      return s.length > 0 && !s.startsWith("#");
    })
    .join("\n");

  const table = parseCsv(dataLines);
  if (table.length < 2) {
    console.error("No data rows in featured-events.csv");
    process.exit(1);
  }

  const header = table[0].map((c) => String(c || "").trim());
  const required = ["Date", "Time", "Event", "Activity"];
  for (const col of required) {
    if (!header.includes(col)) {
      console.error("Missing column:", col);
      process.exit(1);
    }
  }

  const body = table.slice(1);
  const objectRows = rowsToObjects(header, body);
  const features = [];

  let n = 1;
  for (const o of objectRows) {
    const date = String(o.Date || "").trim();
    if (!date) continue;
    const timeRaw = String(o.Time || "").trim();
    const cardLine1 = String(o.Event || "").trim();
    const cardLine2 = String(o.Activity || "").trim();
    if (!cardLine1 || !cardLine2) {
      console.warn("Skipping row missing Event or Activity:", o);
      continue;
    }

    const desc = String(o.Description || "").trim();
    const location = String(o.Location || "").trim() || "Hall A";
    const isFeatured = parseBoolCell(o.isFeatured, true);

    const numStr = String(n);
    const padded = numStr.length < 4 ? "0".repeat(4 - numStr.length) + numStr : numStr;
    const featureId = "fe" + padded;
    n++;

    const startTime = parseTimeTo24h(timeRaw);
    const eventName = deriveListingTitle(cardLine1, cardLine2);
    const cardLine3 = formatCardLine3FromIso(date);

    const row = {
      featureId,
      id: featureId,
      date,
      startTime,
      endTime: "",
      location,
      isActive: true,
      isFeatured,
      cardLine1,
      cardLine2,
      cardLine3,
      eventName,
    };
    if (desc) row.description = desc;
    const imagePath = resolveImagePath(cardLine1, cardLine2, o.Image);
    if (imagePath) row.imagePath = imagePath;
    features.push(row);
  }

  const master = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  master.features = features;
  fs.writeFileSync(jsonPath, JSON.stringify(master, null, 2) + "\n", "utf8");
  console.log("Wrote", features.length, "features to", path.relative(root, jsonPath));
}

main();
