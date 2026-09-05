/**
 * Apply alternating Saturday Karaoke / Dance schedule starting with karaoke.
 * Skips Saturdays that already have a non-rotation special event booked.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const jsonPath = path.join(root, "assets", "data", "json", "mmhp-master-data.json");
const eventsDir = path.join(root, "contents", "feature-events");

const END_DATE = "2027-03-31";
const START_DATE = "2026-09-05";

const KARAOKE = {
  cardLine1: "Karaoke with DJ Kushman",
  cardLine2: "Sat 7–10 PM · Hall B",
  eventName: "Saturday Karaoke with DJ Kushman",
  adCopy:
    "Saturday karaoke is back for this night with DJ Kushman! Join neighbors in Hall B from 7:00 to 10:00 PM for music, singing, dancing, and friends. Grab the mic, make a request, and enjoy a fun McAllen Mobile Park evening together.",
  imagePath: "event-flyer/dj-kushman-karaoke-sq.png",
  imagePathFlyer: "event-flyer/dj-kushman-karaoke.png",
  stem: "dj-kushman-karaoke",
  invite: "Karaoke with DJ Kushman — everyone is welcome.",
};

const DANCE = {
  cardLine1: "Saturday Dance",
  cardLine2: "Sat 7–10 PM · Hall B",
  eventName: "Saturday Dance with DJ Kushman",
  adCopy:
    "Saturday Dance with DJ Kushman brings neighbors together for a familiar McAllen Mobile Park evening of music, dancing, and friends. This is the Saturday evening dance event used when karaoke is not scheduled; check the date and time for the current scheduled night.",
  imagePath: "event-flyer/djdance-sq.png",
  imagePathFlyer: "event-flyer/djdance.png",
  stem: "djdance",
  invite: "Join neighbors for an evening in the hall - everyone is welcome.",
};

const DATE_TO_FE = {
  "2026-09-05": "fe0046",
  "2026-09-12": "fe0047",
  "2026-09-19": "fe0048",
  "2026-09-26": "fe0050",
  "2026-10-03": "fe0051",
  "2026-10-10": "fe0052",
  "2026-10-17": "fe0053",
  "2026-10-24": "fe0055",
  "2026-11-07": "fe0001",
  "2026-11-14": "fe0002",
  "2026-11-21": "fe0003",
  "2026-11-28": "fe0004",
  "2026-12-05": "fe0005",
  "2026-12-12": "fe0006",
  "2026-12-19": "fe0007",
};

function parseYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(dt) {
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

function addDays(dt, n) {
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
}

function saturdays(from, to) {
  const out = [];
  let cur = parseYmd(from);
  const end = parseYmd(to);
  while (cur <= end) {
    if (cur.getDay() === 6) out.push(formatYmd(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function formatLongDate(ymd) {
  const dt = parseYmd(ymd);
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCardLine3(ymd) {
  const dt = parseYmd(ymd);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];
  return `${months[dt.getMonth()]} ${dt.getDate()} ${dt.getFullYear()}`;
}

function isRotationEvent(ev) {
  const name = String(ev.eventName || "").toLowerCase();
  const c1 = String(ev.cardLine1 || "").toLowerCase();
  if (/canceled|cancelled/.test(name + c1)) return true;
  if (/saturday dance|karaoke with dj kushman|saturday karaoke|karaoke — karaoke|^karaoke$/.test(name + " " + c1)) return true;
  return false;
}

function isBlockedSaturday(date, featuresByDate) {
  const rows = featuresByDate.get(date) || [];
  for (const ev of rows) {
    if (ev.isActive === false) continue;
    if (isRotationEvent(ev)) continue;
    return true;
  }
  return false;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPage({ date, featureId, cfg }) {
  const file = `${date}-1900-${cfg.stem}.html`;
  const detailPath = `contents/feature-events/${file}`;
  const html = `<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(cfg.eventName)} | McAllen Mobile Park Events</title>
  <link rel="icon" type="image/svg+xml" href="../../assets/images/stock-images/favicon.svg" />
  <link rel="stylesheet" href="../../assets/css/style.css">
</head>

<body id="top" class="feature-events-page"
  data-mmhp-master-json="../../assets/data/json/mmhp-master-data.json"
  data-mmhp-feature-id="${escapeHtml(featureId)}">
  <header class="feature-events-banner" aria-label="McAllen Mobile Park">
    <img src="../../assets/images/park-b-roll/park-banner.png" alt="McAllen Mobile Park">
    <div class="feature-events-banner-text">
      <h1>McAllen Mobile Park</h1>
      <p>Community events in the RGV — we’re glad you’re here.</p>
    </div>
  </header>
  <div class="feature-events-wave" aria-hidden="true"></div>

  <nav class="feature-events-actions" aria-label="Featured event actions">
    <a class="feature-events-back" href="../../index.html">← Back To Calendar</a>
  </nav>

  <main class="feature-events-main">
    <h1 class="feature-events-title">${escapeHtml(cfg.eventName)}</h1>

    <div class="feature-events-grid">
      <div class="feature-events-box feature-events-feature-frame">
        <img src="../../assets/images/${escapeHtml(cfg.imagePathFlyer)}" alt="${escapeHtml(cfg.eventName)} flyer">
      </div>

      <section class="feature-events-box feature-events-story" aria-labelledby="feature-event-story-heading">
        <h2 id="feature-event-story-heading">About this featured event</h2>
        <div class="feature-events-about">
          <p>${escapeHtml(cfg.adCopy)}</p>
        </div>
      </section>

      <div class="feature-events-box feature-events-details">
        <h2>When &amp; where</h2>
        <div class="feature-events-when">
          <div class="feature-events-when-actions">
            <button type="button" class="feature-events-ribbon" id="feature-events-save-calendar"
              aria-haspopup="dialog"
              aria-controls="feature-events-ics-help-dialog"
              aria-label="Save The Date: Open Instructions To Add This Event To Your Calendar">
              Save The Date
            </button>
            <a class="feature-events-directions" href="https://maps.app.goo.gl/6st9THqUttarC7vUA" target="_blank" rel="noopener noreferrer">Get Directions</a>
          </div>
          <time datetime="${date}T19:00">${escapeHtml(formatLongDate(date))}</time>
          <p class="feature-events-time-pill" aria-label="Event time">7:00 PM - 10:00 PM · Hall B</p>
          <p class="feature-events-invite">${escapeHtml(cfg.invite)}</p>
        </div>
        <p class="feature-events-loc">
          <strong>Location</strong>
          McAllen Mobile Park · Hall B<br>
          4900 N Mc Coll Rd, McAllen, TX
        </p>
      </div>
    </div>
  </main>

  <footer class="feature-events-footer">
    <address>
      McAllen Mobile Park · 4900 N Mc Coll Rd · McAllen, TX 78504
    </address>
    <a href="../../index.html">Calendar Home</a>
    ·
    <a href="https://maps.app.goo.gl/sVCaEKHYQw5QcqK7A" target="_blank" rel="noopener noreferrer">Directions</a>
    <a href="#top" class="site-footer-back-top" aria-label="Back To Top Of Page">Back To Top</a>
  </footer>

  <script src="../../assets/js/mmhp-coordinator-config.js" defer></script>
  <script src="../../assets/js/feature-events-ics.js" defer></script>
</body>

</html>
`;
  fs.writeFileSync(path.join(eventsDir, file), html, "utf8");
  return detailPath;
}

function applyFeature(f, date, cfg, featureId) {
  f.featureId = featureId;
  f.id = featureId;
  f.date = date;
  f.startTime = "19:00";
  f.endTime = "22:00";
  f.location = "Hall B";
  f.isActive = true;
  f.isFeatured = true;
  f.cardLine1 = cfg.cardLine1;
  f.cardLine2 = cfg.cardLine2;
  f.cardLine3 = formatCardLine3(date);
  f.eventName = cfg.eventName;
  f.adCopy = cfg.adCopy;
  f.description = cfg.adCopy;
  f.imagePath = cfg.imagePath;
  f.imagePathFlyer = cfg.imagePathFlyer;
  f.detailPath = buildPage({ date, featureId, cfg });
}

function main() {
  const master = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const features = master.features || [];
  const byId = new Map(features.map((f) => [String(f.featureId || f.id), f]));
  const byDate = new Map();
  for (const f of features) {
    const d = String(f.date || "").trim();
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(f);
  }

  let nextType = "dance";
  const assignments = [];
  for (const date of saturdays(START_DATE, END_DATE)) {
    if (isBlockedSaturday(date, byDate)) {
      assignments.push({ date, skip: true });
      continue;
    }
    assignments.push({ date, type: nextType });
    nextType = nextType === "karaoke" ? "dance" : "karaoke";
  }

  let nextNewNum = 62;
  const assignedIds = new Set();
  const scheduleLog = [];

  for (const slot of assignments) {
    if (slot.skip) {
      scheduleLog.push(`${slot.date} SKIP (special event booked)`);
      continue;
    }
    const cfg = slot.type === "karaoke" ? KARAOKE : DANCE;
    let featureId = DATE_TO_FE[slot.date];
    if (!featureId) {
      while (byId.has(`fe${String(nextNewNum).padStart(4, "0")}`)) nextNewNum++;
      featureId = `fe${String(nextNewNum).padStart(4, "0")}`;
      nextNewNum++;
      const nf = { featureId, id: featureId };
      features.push(nf);
      byId.set(featureId, nf);
    }
    assignedIds.add(featureId);
    applyFeature(byId.get(featureId), slot.date, cfg, featureId);
    scheduleLog.push(`${slot.date} ${slot.type.toUpperCase()} ${featureId}`);
  }

  // Deactivate old rotation/canceled karaoke rows on future Saturdays not in schedule
  const scheduledDates = new Set(assignments.filter((s) => !s.skip).map((s) => s.date));
  for (const f of features) {
    const date = String(f.date || "").trim();
    if (!date || parseYmd(date).getDay() !== 6) continue;
    if (date < START_DATE || date > END_DATE) continue;
    if (scheduledDates.has(date)) continue;
    if (f.isActive === false) continue;
    if (isRotationEvent(f) || /karaoke canceled|canceled/i.test(String(f.eventName || ""))) {
      f.isActive = false;
    }
  }

  fs.writeFileSync(jsonPath, JSON.stringify(master, null, 2) + "\n", "utf8");
  console.log("Saturday rotation applied:\n" + scheduleLog.join("\n"));
}

main();
