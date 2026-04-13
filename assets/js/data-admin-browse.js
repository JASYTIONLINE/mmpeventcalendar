(function () {
  /** Only the latest initBrowseApp completion may wire UI (avoids duplicate/racy loads). */
  var __dataAdminBrowseInitGen = 0;
  /** Ignore rapid repeat clicks on Add event. */
  var __dataAdminLastAddEventMs = 0;
  /** Ignore rapid repeat clicks on Purge before today. */
  var __dataAdminLastPurgePastMs = 0;

  var ADMIN_UNLOCK_STORAGE_KEY = "mmhp_data_admin_unlocked";
  var MASTER_JSON_REL_PATH_STORAGE_KEY = "mmhp-master-json-rel-path";
  var DEFAULT_MASTER_JSON_REL_PATH =
    "mmpeventcalendar\\assets\\data\\json\\mmhp-master-data.json";

  function getMasterJsonRelativePathHint() {
    try {
      var fromLs = localStorage.getItem(MASTER_JSON_REL_PATH_STORAGE_KEY);
      if (fromLs && fromLs.trim()) return fromLs.trim();
    } catch (e) {}
    var attr = document.body && document.body.getAttribute("data-mmhp-master-rel-path");
    if (attr && attr.trim()) return attr.trim();
    return DEFAULT_MASTER_JSON_REL_PATH;
  }

  function setMasterJsonRelativePathHint(path) {
    try {
      if (path && String(path).trim()) {
        localStorage.setItem(MASTER_JSON_REL_PATH_STORAGE_KEY, String(path).trim());
      }
    } catch (e) {}
  }

  function refreshMasterJsonPathHintElements() {
    var hint = getMasterJsonRelativePathHint();
    var pathEl = document.getElementById("mmhp-save-confirm-path");
    if (pathEl) pathEl.textContent = hint;
  }

  /** Same as schedule-csv-io: .../json/file.json → .../doc/syuper-secret-squirrel */
  function scheduleSecretUrlFromMaster(masterUrl) {
    if (!masterUrl) return null;
    return masterUrl.replace(/json\/[^/?#]+$/i, "doc/syuper-secret-squirrel");
  }

  var DATA_ADMIN_BEFOREUNLOAD_REGISTERED = false;

  /** In-memory master data differs from last disk save; warn on tab close / navigation. */
  function ensureDataAdminBeforeUnloadListener() {
    if (DATA_ADMIN_BEFOREUNLOAD_REGISTERED) return;
    DATA_ADMIN_BEFOREUNLOAD_REGISTERED = true;
    window.addEventListener("beforeunload", function (e) {
      if (!window.__mmhpDataAdminUnsaved) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  function setDataAdminUnsaved(on) {
    window.__mmhpDataAdminUnsaved = !!on;
  }

  var RECURRENCE_WEEKDAY_NAMES = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  var RECURRENCE_WEEKDAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function csvEscape(val) {
    if (val == null || val === undefined) return "";
    var t = String(val);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function fileDateStamp() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  /** Local calendar date as YYYY-MM-DD (for comparisons with event `date` fields). */
  function todayIsoLocal() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function collectColumns(rows) {
    var set = {};
    for (var i = 0; i < rows.length; i++) {
      var o = rows[i];
      if (!o || typeof o !== "object" || Array.isArray(o)) continue;
      for (var k in o) {
        if (Object.prototype.hasOwnProperty.call(o, k)) set[k] = true;
      }
    }
    var cols = Object.keys(set);
    cols.sort(function (a, b) {
      if (a === "id") return -1;
      if (b === "id") return 1;
      return a.localeCompare(b);
    });
    return cols;
  }

  /** Puts startTime immediately before endTime, both right after `date` when present (events grid). */
  function orderDataAdminTableColumns(collectionKey, columns) {
    if (collectionKey !== "events") return columns;
    var cols = columns.slice();
    var si = cols.indexOf("startTime");
    var ei = cols.indexOf("endTime");
    var st = si >= 0 ? cols.splice(si, 1)[0] : null;
    ei = cols.indexOf("endTime");
    var et = ei >= 0 ? cols.splice(ei, 1)[0] : null;
    var di = cols.indexOf("date");
    var insertAt = di >= 0 ? di + 1 : cols.indexOf("activityId") + (cols.indexOf("activityId") >= 0 ? 1 : 0);
    if (insertAt <= 0 && cols.indexOf("id") === 0) insertAt = 1;
    if (insertAt < 0) insertAt = cols.length;
    if (st) cols.splice(insertAt, 0, st);
    if (et) cols.splice(insertAt + (st ? 1 : 0), 0, et);
    return cols;
  }

  /** Normalize stored time (e.g. 19:00 or 9:05) to HH:MM for input[type=time]. */
  function toHtmlTimeValue(s) {
    var t = String(s == null ? "" : s).trim();
    if (!t) return "";
    var m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(t);
    if (!m) return "";
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return "";
    return pad2(h) + ":" + pad2(min);
  }

  /** 24h "HH:MM" → { h: 1–12, m: 0–59, pm }. Empty → default 7:00 PM for picker seed. */
  function parseTimeTo12Parts(s) {
    var t24 = toHtmlTimeValue(s);
    if (!t24) return { h: 7, m: 0, pm: true };
    var p = t24.split(":");
    var H = parseInt(p[0], 10);
    var M = parseInt(p[1], 10);
    var pm = H >= 12;
    var h12 = H % 12;
    if (h12 === 0) h12 = 12;
    return { h: h12, m: M, pm: pm };
  }

  /** Up/down columns for hour, minute, AM/PM; stored value via get24() as "HH:MM" (24h). */
  function createTimeSpinner12(initial24h) {
    var seed = parseTimeTo12Parts(initial24h);
    var state = { h: seed.h, m: seed.m, pm: seed.pm };

    function to24() {
      var H;
      if (state.pm) {
        H = state.h === 12 ? 12 : state.h + 12;
      } else {
        H = state.h === 12 ? 0 : state.h;
      }
      return pad2(H) + ":" + pad2(state.m);
    }

    var root = document.createElement("div");
    root.className = "data-admin-time-spinner";

    function addCol(title, kind) {
      var c = document.createElement("div");
      c.className = "data-admin-time-spinner__col";
      var ttl = document.createElement("span");
      ttl.className = "data-admin-time-spinner__col-title";
      ttl.textContent = title;
      var up = document.createElement("button");
      up.type = "button";
      up.className = "data-admin-time-spinner__ud";
      up.innerHTML = "&#9650;";
      up.setAttribute("aria-label", "Increase " + title);
      var disp = document.createElement("div");
      disp.className = "data-admin-time-spinner__val";
      var dn = document.createElement("button");
      dn.type = "button";
      dn.className = "data-admin-time-spinner__ud";
      dn.innerHTML = "&#9660;";
      dn.setAttribute("aria-label", "Decrease " + title);
      function sync() {
        if (kind === "h") disp.textContent = String(state.h);
        else if (kind === "m") disp.textContent = pad2(state.m);
        else disp.textContent = state.pm ? "PM" : "AM";
      }
      up.addEventListener("click", function () {
        if (kind === "h") state.h = state.h >= 12 ? 1 : state.h + 1;
        else if (kind === "m") state.m = (state.m + 1) % 60;
        else state.pm = !state.pm;
        sync();
      });
      dn.addEventListener("click", function () {
        if (kind === "h") state.h = state.h <= 1 ? 12 : state.h - 1;
        else if (kind === "m") state.m = state.m <= 0 ? 59 : state.m - 1;
        else state.pm = !state.pm;
        sync();
      });
      c.appendChild(ttl);
      c.appendChild(up);
      c.appendChild(disp);
      c.appendChild(dn);
      sync();
      return c;
    }

    root.appendChild(addCol("Hour", "h"));
    root.appendChild(addCol("Min", "m"));
    root.appendChild(addCol("AM / PM", "ampm"));

    return {
      el: root,
      get24: function () {
        return to24();
      },
      setDimmed: function (on) {
        root.classList.toggle("data-admin-time-spinner--dimmed", !!on);
        var btns = root.querySelectorAll("button");
        for (var bi = 0; bi < btns.length; bi++) btns[bi].disabled = !!on;
      },
    };
  }

  function cellValue(v) {
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  }

  function arrayToCsv(rows, columns) {
    var lines = [];
    var headerCells = [];
    for (var h = 0; h < columns.length; h++) headerCells.push(csvEscape(columns[h]));
    lines.push(headerCells.join(","));

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      for (var j = 0; j < columns.length; j++) {
        cells.push(csvEscape(cellValue(row[columns[j]])));
      }
      lines.push(cells.join(","));
    }
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  /** Google Calendar import CSV — headers and row rules match scripts/export-events-google-calendar-csv.py */
  var GOOGLE_CAL_HEADERS = [
    "Subject",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "All Day Event",
    "Description",
    "Location",
    "Private",
  ];
  var GOOGLE_CAL_DEFAULT_DURATION_H = 1;

  function parseHHMMForGoogleExport(s) {
    s = String(s == null ? "" : s).trim();
    if (!s) return null;
    var parts = s.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
    return { h: h, m: m };
  }

  function to12hGoogle(h, m) {
    var period = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + pad2(m) + " " + period;
  }

  function isoYmdToMmddYyyy(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso).trim());
    if (!m) return null;
    return m[2] + "/" + m[3] + "/" + m[1];
  }

  function utcMsFromYmdHourMin(y, mo, d, h, mi) {
    return Date.UTC(y, mo - 1, d, h, mi, 0);
  }

  function utcYmdhmFromMs(ms) {
    var dt = new Date(ms);
    return {
      y: dt.getUTCFullYear(),
      mo: dt.getUTCMonth() + 1,
      d: dt.getUTCDate(),
      h: dt.getUTCHours(),
      mi: dt.getUTCMinutes(),
    };
  }

  function formatMmddYyyyUtc(y, mo, d) {
    return pad2(mo) + "/" + pad2(d) + "/" + y;
  }

  function googleCalendarRowForEvent(ev) {
    if (!ev || typeof ev !== "object") return null;
    var dateRaw = ev.date;
    if (dateRaw == null || !String(dateRaw).trim()) return null;
    var start_d = isoYmdToMmddYyyy(dateRaw);
    if (!start_d) return null;

    var st = parseHHMMForGoogleExport(ev.startTime);
    if (!st) return null;
    var sh = st.h;
    var sm = st.m;
    var start_t = to12hGoogle(sh, sm);
    var startMin = sh * 60 + sm;

    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateRaw).trim());
    if (!dm) return null;
    var y = parseInt(dm[1], 10);
    var mo = parseInt(dm[2], 10);
    var dday = parseInt(dm[3], 10);

    var end_raw = ev.endTime != null ? String(ev.endTime).trim() : "";
    var end_d;
    var end_t;

    if (end_raw) {
      var et = parseHHMMForGoogleExport(end_raw);
      if (!et) {
        end_raw = "";
      } else {
        var eh = et.h;
        var em = et.m;
        var endMin = eh * 60 + em;
        if (endMin > startMin) {
          end_d = start_d;
          end_t = to12hGoogle(eh, em);
        } else if (endMin < startMin) {
          var ms0 = utcMsFromYmdHourMin(y, mo, dday, 0, 0);
          var msNext = ms0 + 86400000 + (eh * 60 + em) * 60000;
          var pN = utcYmdhmFromMs(msNext);
          end_d = formatMmddYyyyUtc(pN.y, pN.mo, pN.d);
          end_t = to12hGoogle(eh, em);
        } else {
          var msS = utcMsFromYmdHourMin(y, mo, dday, sh, sm);
          var msE = msS + GOOGLE_CAL_DEFAULT_DURATION_H * 3600000;
          var pE = utcYmdhmFromMs(msE);
          end_d = formatMmddYyyyUtc(pE.y, pE.mo, pE.d);
          end_t = to12hGoogle(pE.h, pE.mi);
        }
      }
    }

    if (!end_raw || !parseHHMMForGoogleExport(end_raw)) {
      var msS2 = utcMsFromYmdHourMin(y, mo, dday, sh, sm);
      var msE2 = msS2 + GOOGLE_CAL_DEFAULT_DURATION_H * 3600000;
      var pE2 = utcYmdhmFromMs(msE2);
      end_d = formatMmddYyyyUtc(pE2.y, pE2.mo, pE2.d);
      end_t = to12hGoogle(pE2.h, pE2.mi);
    }

    var subject = (ev.eventName != null ? String(ev.eventName).trim() : "") || "(no title)";
    subject = subject.split(/\r\n|\r|\n/).join(" ").trim() || "(no title)";
    var desc =
      "mmhp event id: " +
      (ev.id != null ? String(ev.id) : "") +
      "; activityId: " +
      (ev.activityId != null ? String(ev.activityId) : "");
    desc = desc.split(/\r\n|\r|\n/).join(" ");
    var loc = ev.location != null ? String(ev.location).trim() : "";
    loc = loc.split(/\r\n|\r|\n/).join(" ");

    return [subject, start_d, start_t, end_d, end_t, "False", desc, loc, "False"];
  }

  function buildGoogleCalendarCsvString(events) {
    var lines = [];
    var hc = [];
    for (var hi = 0; hi < GOOGLE_CAL_HEADERS.length; hi++) hc.push(csvEscape(GOOGLE_CAL_HEADERS[hi]));
    lines.push(hc.join(","));
    var written = 0;
    var skipped = 0;
    for (var gi = 0; gi < events.length; gi++) {
      var ev = events[gi];
      if (!ev || ev.isActive === false) continue;
      var row = googleCalendarRowForEvent(ev);
      if (!row) {
        skipped++;
        continue;
      }
      var cells = [];
      for (var gj = 0; gj < row.length; gj++) cells.push(csvEscape(row[gj]));
      lines.push(cells.join(","));
      written++;
    }
    return { text: lines.join("\r\n") + "\r\n", written: written, skipped: skipped };
  }

  function buildObjectEntries(val) {
    var objectEntries = [];
    for (var ri = 0; ri < val.length; ri++) {
      var o = val[ri];
      if (o && typeof o === "object" && !Array.isArray(o)) objectEntries.push({ idx: ri, obj: o });
    }
    return objectEntries;
  }

  function eventRowIsoDate(obj) {
    var d = obj && obj.date != null ? String(obj.date).trim() : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }

  /** Valid ISO event date is strictly before today (local). These rows are treated as archived. */
  function isArchivedPastEvent(obj) {
    var d = eventRowIsoDate(obj);
    if (!d) return false;
    return d < todayIsoLocal();
  }

  function compareDisplayEventEntries(a, b) {
    var da = eventRowIsoDate(a.obj);
    var db = eventRowIsoDate(b.obj);
    if (da && db) {
      if (da !== db) return da < db ? -1 : 1;
    } else if (da && !db) return -1;
    else if (!da && db) return 1;
    var ta = a.obj && a.obj.startTime != null ? String(a.obj.startTime).trim() : "";
    var tb = b.obj && b.obj.startTime != null ? String(b.obj.startTime).trim() : "";
    if (ta !== tb) return ta < tb ? -1 : ta > tb ? 1 : 0;
    return a.idx - b.idx;
  }

  /**
   * Events: sorted by date then start time. If hidePastEvents, only rows with date on or after today (local).
   * Other collections: original order.
   */
  function buildObjectEntriesForDisplay(val, collectionKey, hidePastEvents) {
    var all = buildObjectEntries(val);
    if (collectionKey !== "events") return all;
    if (hidePastEvents) {
      var ymd = todayIsoLocal();
      var upcoming = [];
      for (var ui = 0; ui < all.length; ui++) {
        var d = eventRowIsoDate(all[ui].obj);
        if (d && d >= ymd) upcoming.push(all[ui]);
      }
      all = upcoming;
    }
    var sorted = all.slice();
    sorted.sort(compareDisplayEventEntries);
    return sorted;
  }

  /** Data page section order: events → activities → everything else A–Z */
  function sortMasterDataCollectionKeys(keys) {
    function rank(name) {
      if (name === "events") return 0;
      if (name === "activities") return 1;
      return 2;
    }
    return keys.slice().sort(function (a, b) {
      var ra = rank(a);
      var rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });
  }

  function clearDomChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function sortObjectKeysForForm(keys) {
    return keys.slice().sort(function (a, b) {
      if (a === "id") return -1;
      if (b === "id") return 1;
      return a.localeCompare(b);
    });
  }

  /** Matches submit.html card line 3 style: "Jan 6 2027" (no comma). */
  function formatEventCardLine3FromIso(ymd) {
    var p = (ymd || "").trim().split("-");
    if (p.length !== 3) return "";
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return "";
    var dt = new Date(y, mo, d);
    return dt
      .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function activityByIdFromMaster(masterData, id) {
    var acts = masterData && Array.isArray(masterData.activities) ? masterData.activities : [];
    var sid = id != null ? String(id).trim() : "";
    for (var i = 0; i < acts.length; i++) {
      if (acts[i] && String(acts[i].id).trim() === sid) return acts[i];
    }
    return null;
  }

  function deriveEventName(cardLine1, activityId, masterData) {
    var act = activityByIdFromMaster(masterData, activityId);
    var an = act && act.activityName != null ? String(act.activityName).trim() : "";
    var c1 = cardLine1 != null ? String(cardLine1).trim() : "";
    if (!c1 && !an) return "";
    if (!c1) return an;
    if (!an) return c1;
    return c1 + " — " + an;
  }

  /** Matches deriveEventName separator; activity name is the segment after the last separator. */
  function activityNameFromListingTitle(listingTitle) {
    var t = String(listingTitle || "").trim();
    var sep = " — ";
    var idx = t.lastIndexOf(sep);
    if (idx === -1) return "";
    return t.slice(idx + sep.length).trim();
  }

  function finalizeEventRow(parsed, masterData) {
    if (!parsed || typeof parsed !== "object") return;
    if (Object.prototype.hasOwnProperty.call(parsed, "isSpecialEvent")) {
      if (parsed.isFeatured === undefined) {
        if (parsed.isSpecialEvent === true) parsed.isFeatured = true;
        else if (parsed.isSpecialEvent === false) parsed.isFeatured = false;
      }
      delete parsed.isSpecialEvent;
    }
    var aid = parsed.activityId != null ? String(parsed.activityId).trim() : "";
    if (aid) parsed.activityId = aid;
    var c1 = parsed.cardLine1 != null ? String(parsed.cardLine1).trim() : "";
    parsed.eventName = deriveEventName(c1, aid, masterData || {});
    var act = activityByIdFromMaster(masterData, aid);
    var line2 = act && act.activityName != null ? String(act.activityName).trim() : "";
    if (!line2) line2 = activityNameFromListingTitle(parsed.eventName);
    if (line2) parsed.cardLine2 = line2;
    else delete parsed.cardLine2;
    if (isArchivedPastEvent(parsed)) {
      parsed.isActive = false;
    }
  }

  function computeNextEventId(events) {
    if (!Array.isArray(events)) return "ev0001";
    var max = 0;
    for (var i = 0; i < events.length; i++) {
      var id = events[i] && events[i].id;
      if (id == null) continue;
      var m = /^ev(\d+)$/i.exec(String(id).trim());
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n)) max = Math.max(max, n);
      }
    }
    var used = {};
    for (var u = 0; u < events.length; u++) {
      var eid = events[u] && events[u].id;
      if (eid != null) used[String(eid).trim()] = true;
    }
    var next = max + 1;
    var candidate;
    do {
      var numStr = String(next);
      while (numStr.length < 4) numStr = "0" + numStr;
      candidate = "ev" + numStr;
      next++;
    } while (used[candidate]);
    return candidate;
  }

  function firstActivityIdForNewEvent(masterData) {
    var acts = masterData && Array.isArray(masterData.activities) ? masterData.activities : [];
    for (var i = 0; i < acts.length; i++) {
      if (acts[i] && acts[i].id != null && String(acts[i].id).trim()) {
        return String(acts[i].id).trim();
      }
    }
    return "";
  }

  function isoDateLocalYmd() {
    return todayIsoLocal();
  }

  function buildNewEventRow(masterData) {
    var events = masterData && Array.isArray(masterData.events) ? masterData.events : [];
    var aid = firstActivityIdForNewEvent(masterData);
    var loc = "Hall A";
    var act = activityByIdFromMaster(masterData, aid);
    if (act && act.location != null && String(act.location).trim()) {
      loc = String(act.location).trim();
    }
    var row = {
      id: computeNextEventId(events),
      activityId: aid,
      date: isoDateLocalYmd(),
      startTime: "19:00",
      endTime: "",
      isActive: true,
      isFeatured: false,
      location: loc,
      cardLine1: "New event",
    };
    finalizeEventRow(row, masterData || {});
    row.cardLine3 = formatEventCardLine3FromIso(row.date);
    return row;
  }

  function validateEventRow(ev) {
    if (!ev || typeof ev !== "object") return "Invalid event row.";
    if (isArchivedPastEvent(ev)) return "";
    var req = ["id", "activityId", "date", "startTime", "cardLine1", "eventName", "location"];
    for (var i = 0; i < req.length; i++) {
      var k = req[i];
      var v = ev[k];
      if (v == null || (typeof v === "string" && !String(v).trim())) {
        return "Events require a non-empty " + k + ".";
      }
    }
    if (ev.isActive === undefined || ev.isActive === null) {
      return "Events require isActive (true or false).";
    }
    return "";
  }

  var DATA_ADMIN_DUPLICATE_SLOT_PREFIX =
    "Two active events overlap in time at the same location";

  /** When endTime is blank, assume this span for venue conflict checks (typical 7–10pm hall use). */
  var DATA_ADMIN_DEFAULT_EVENT_DURATION_MIN = 180;

  function isDataAdminDuplicateSlotMessage(msg) {
    var s = String(msg || "");
    if (s.indexOf(DATA_ADMIN_DUPLICATE_SLOT_PREFIX) !== -1) return true;
    return s.indexOf("Two active events share the same date, start time, and location") !== -1;
  }

  function stripDuplicateSlotAlertStyle(el) {
    if (!el) return;
    if (el.__dataAdminDupFlashT) {
      window.clearTimeout(el.__dataAdminDupFlashT);
      el.__dataAdminDupFlashT = 0;
    }
    el.classList.remove("data-admin-duplicate-slot-alert", "data-admin-duplicate-slot-alert--flash");
  }

  function flashDuplicateSlotAlert(el) {
    if (!el) return;
    el.classList.add("data-admin-duplicate-slot-alert");
    el.classList.remove("data-admin-duplicate-slot-alert--flash");
    void el.offsetWidth;
    el.classList.add("data-admin-duplicate-slot-alert--flash");
    if (el.__dataAdminDupFlashT) window.clearTimeout(el.__dataAdminDupFlashT);
    el.__dataAdminDupFlashT = window.setTimeout(function () {
      el.classList.remove("data-admin-duplicate-slot-alert--flash");
      el.__dataAdminDupFlashT = 0;
    }, 1100);
  }

  /** Normalize HH:MM for duplicate slot checks (e.g. 9:05 → 09:05). */
  function normalizeEventSlotTime(raw) {
    var s = String(raw || "").trim();
    var m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return s;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(min)) return s;
    return pad2(h) + ":" + pad2(min);
  }

  function parseHHMMToMinutes(raw) {
    var st = normalizeEventSlotTime(raw);
    var m = /^(\d{2}):(\d{2})$/.exec(st);
    if (!m) return NaN;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(min) || h > 23 || min > 59) return NaN;
    return h * 60 + min;
  }

  function formatMinutesRangeLabel(startMin, endMin) {
    var sh = Math.floor(startMin / 60);
    var sm = startMin % 60;
    var eh = Math.floor(endMin / 60);
    var em = endMin % 60;
    return pad2(sh) + ":" + pad2(sm) + "–" + pad2(eh) + ":" + pad2(em);
  }

  /**
   * Same calendar date + location: interval [startMin, endMin) from start/endTime.
   * Blank or invalid endTime uses DATA_ADMIN_DEFAULT_EVENT_DURATION_MIN after start.
   */
  function getEventVenueInterval(ev) {
    if (!ev || typeof ev !== "object") return null;
    var d = ev.date != null ? String(ev.date).trim() : "";
    var loc = ev.location != null ? String(ev.location).trim().replace(/\s+/g, " ") : "";
    var stRaw = ev.startTime != null ? String(ev.startTime).trim() : "";
    if (!d || !loc || !stRaw) return null;
    var startMin = parseHHMMToMinutes(stRaw);
    if (isNaN(startMin)) return null;
    var endRaw = ev.endTime != null ? String(ev.endTime).trim() : "";
    var endMin = endRaw ? parseHHMMToMinutes(endRaw) : NaN;
    if (!isNaN(endMin) && endMin > startMin) {
      return { date: d, loc: loc, locKey: loc.toLowerCase(), startMin: startMin, endMin: endMin };
    }
    return {
      date: d,
      loc: loc,
      locKey: loc.toLowerCase(),
      startMin: startMin,
      endMin: startMin + DATA_ADMIN_DEFAULT_EVENT_DURATION_MIN,
    };
  }

  function venueIntervalsOverlap(a, b) {
    return a.startMin < b.endMin && b.startMin < a.endMin;
  }

  /**
   * Only Hall B and Hall C are single-booking venues (one active event per date/time slot).
   * Clubhouse, Hall A, Rec Hall, etc. may host multiple concurrent events at the same location string.
   */
  function isDataAdminExclusiveVenueLocKey(locKey) {
    var k = String(locKey || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    return k === "hall b" || k === "hall c";
  }

  /**
   * Block two scheduling-active events that overlap in time at the same date and location.
   * Past-dated (archived) and inactive rows are skipped.
   * @param replaceIndex If >= 0, row at this index is treated as replacementEv for the check (edit / Apply).
   */
  function validateEventsNoDuplicateDateTimeLocation(evs, replaceIndex, replacementEv) {
    if (!Array.isArray(evs)) return "";
    var slots = [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (replaceIndex >= 0 && i === replaceIndex && replacementEv) ev = replacementEv;
      if (!ev || typeof ev !== "object") continue;
      if (isArchivedPastEvent(ev)) continue;
      if (ev.isActive === false) continue;
      var it = getEventVenueInterval(ev);
      if (!it) continue;
      var lid = ev.id != null ? String(ev.id).trim() : "row " + i;
      slots.push({ it: it, lid: lid });
    }
    for (var a = 0; a < slots.length; a++) {
      for (var b = a + 1; b < slots.length; b++) {
        var ia = slots[a].it;
        var ib = slots[b].it;
        if (ia.date !== ib.date || ia.locKey !== ib.locKey) continue;
        if (!isDataAdminExclusiveVenueLocKey(ia.locKey)) continue;
        if (!venueIntervalsOverlap(ia, ib)) continue;
        return (
          DATA_ADMIN_DUPLICATE_SLOT_PREFIX +
          " (" +
          ia.date +
          " " +
          ia.loc +
          "): " +
          slots[a].lid +
          " (" +
          formatMinutesRangeLabel(ia.startMin, ia.endMin) +
          ") and " +
          slots[b].lid +
          " (" +
          formatMinutesRangeLabel(ib.startMin, ib.endMin) +
          ")."
        );
      }
    }
    return "";
  }

  function validateActivityRow(a) {
    if (!a || typeof a !== "object") return "Invalid activity row.";
    if (a.id == null || !String(a.id).trim()) return "Activities require id.";
    if (a.activityName == null || !String(a.activityName).trim()) return "Activities require activityName.";
    return "";
  }

  function validateMasterDataBeforeSave(data) {
    if (!data || typeof data !== "object") return "No data to save.";
    var evs = data.events;
    if (Array.isArray(evs)) {
      for (var ei = 0; ei < evs.length; ei++) {
        var emsg = validateEventRow(evs[ei]);
        if (emsg) return "events[" + ei + "] " + (evs[ei] && evs[ei].id ? "(" + evs[ei].id + ") " : "") + emsg;
      }
      var dupSlot = validateEventsNoDuplicateDateTimeLocation(evs, -1, null);
      if (dupSlot) return dupSlot;
    }
    var acts = data.activities;
    if (Array.isArray(acts)) {
      for (var ai = 0; ai < acts.length; ai++) {
        var amsg = validateActivityRow(acts[ai]);
        if (amsg) return "activities[" + ai + "] " + (acts[ai] && acts[ai].id ? "(" + acts[ai].id + ") " : "") + amsg;
      }
    }
    return "";
  }

  function isDataAdminMobileEnvironment() {
    var ua = navigator.userAgent || "";
    if (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
    if (/iPad/i.test(ua) && /Mobile|Safari/i.test(ua)) return true;
    try {
      if (window.matchMedia("(max-width: 720px)").matches && window.matchMedia("(pointer: coarse)").matches) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function buildActivitySelectOptions(masterData) {
    var acts = masterData && Array.isArray(masterData.activities) ? masterData.activities : [];
    var list = [];
    for (var ai = 0; ai < acts.length; ai++) {
      var a = acts[ai];
      if (!a || a.id == null) continue;
      var id = String(a.id).trim();
      var name = String(a.activityName != null ? a.activityName : id).trim() || id;
      list.push({ id: id, name: name });
    }
    list.sort(function (x, y) {
      return x.name.localeCompare(y.name);
    });
    return list;
  }

  function fieldLabelForForm(collectionKey, key) {
    if (collectionKey === "events") {
      if (key === "activityId") return "Activity (sets activity id; card line 2 on the site uses this activity name)";
      if (key === "cardLine1")
        return "Short description of event (max 48 characters; card line 1 — featured cards)";
      if (key === "cardLine2") return "Short description (max 48 characters; card line 2)";
      if (key === "cardLine3") return "Date line on card (card line 3; often auto from date)";
      if (key === "date") return "Event date (also drives card line 3 text when synced)";
      if (key === "startTime") return "Start & end time";
      if (key === "isFeatured")
        return "Featured (home: center strip, right Wed/Sat, left schedule when dated)";
    }
    return key;
  }

  var EVENT_FORM_KEY_ORDER = [
    "cardLine1",
    "activityId",
    "date",
    "startTime",
    "endTime",
    "location",
    "isActive",
    "isFeatured",
  ];

  function sortEventFormKeys(keys) {
    var hasId = keys.indexOf("id") !== -1;
    var rest = keys.filter(function (k) {
      return k !== "id";
    });
    rest.sort(function (a, b) {
      var ia = EVENT_FORM_KEY_ORDER.indexOf(a);
      var ib = EVENT_FORM_KEY_ORDER.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
    if (hasId) rest.push("id");
    return rest;
  }

  function buildEditFormFields(fieldsForm, obj, collectionKey, masterData) {
    masterData = masterData || {};
    clearDomChildren(fieldsForm);
    var keys = sortObjectKeysForForm(Object.keys(obj || {}));
    if (collectionKey === "events") {
      keys = keys.filter(function (k) {
        return k !== "cardLine3" && k !== "cardLine2" && k !== "eventName";
      });
      if (keys.indexOf("date") === -1) keys.push("date");
      if (keys.indexOf("cardLine1") === -1) keys.push("cardLine1");
      var hasST = keys.indexOf("startTime") !== -1;
      var hasET = keys.indexOf("endTime") !== -1;
      if (hasET && !hasST) keys.push("startTime");
      if (hasST && keys.indexOf("endTime") === -1) keys.push("endTime");
      if (keys.indexOf("isFeatured") === -1) keys.push("isFeatured");
      keys = sortEventFormKeys(keys);
    }
    for (let i = 0; i < keys.length; i++) {
      let key = keys[i];
      if (collectionKey === "activities" && key === "recurrenceDetails") continue;
      if (collectionKey === "events" && key === "endTime") continue;
      let val = obj[key];
      if (collectionKey === "events" && key === "isFeatured" && val !== true && val !== false) {
        val = false;
      }
      if (collectionKey === "events" && key === "cardLine1" && (val === undefined || val === null)) {
        val = "";
      }
      let row = document.createElement("div");
      row.className = "data-admin-edit-field-row";
      row.dataset.editFieldKey = key;

      let lbl = document.createElement("div");
      lbl.className = "data-admin-edit-field-label";
      lbl.textContent = fieldLabelForForm(collectionKey, key);
      row.appendChild(lbl);

      if (key === "id") {
        let origId = obj.id;
        let roInp = document.createElement("input");
        roInp.type = "text";
        roInp.readOnly = true;
        roInp.className = "data-admin-edit-field-input data-admin-edit-field--readonly";
        roInp.value = origId != null ? String(origId) : "";
        roInp.title = "Id is assigned when the row is created and cannot be changed here.";
        row.appendChild(roInp);
        row.__readField = function () {
          return origId;
        };
        fieldsForm.appendChild(row);
        continue;
      }

      if (collectionKey === "events" && key === "activityId") {
        let sel = document.createElement("select");
        sel.className = "data-admin-edit-field-select";
        sel.setAttribute("aria-label", "Activity");
        let optBlank = document.createElement("option");
        optBlank.value = "";
        optBlank.textContent = "— Select activity —";
        sel.appendChild(optBlank);
        let actOpts = buildActivitySelectOptions(masterData);
        let curAct = val != null && val !== undefined ? String(val).trim() : "";
        let foundAct = false;
        for (let ao = 0; ao < actOpts.length; ao++) {
          let opt = document.createElement("option");
          opt.value = actOpts[ao].id;
          opt.textContent = actOpts[ao].name;
          sel.appendChild(opt);
          if (actOpts[ao].id === curAct) foundAct = true;
        }
        if (curAct && !foundAct) {
          let optOr = document.createElement("option");
          optOr.value = curAct;
          optOr.textContent = "Other (id: " + curAct + ")";
          sel.appendChild(optOr);
        }
        sel.value = curAct;
        row.appendChild(sel);
        row.dataset.mmhpRowKind = "activityId";
        let actHint = document.createElement("p");
        actHint.className = "data-admin-edit-field-hint";
        actHint.textContent =
          "Card line 2 on the public site is the activity name from this choice (not stored on the event).";
        row.appendChild(actHint);
        row.__readField = function () {
          var v = String(sel.value || "").trim();
          if (!v) throw new Error("activityId: choose an activity from the list.");
          return v;
        };
        fieldsForm.appendChild(row);
        continue;
      }

      if (collectionKey === "events" && key === "date") {
        let dateInp = document.createElement("input");
        dateInp.type = "date";
        dateInp.className = "data-admin-edit-field-input data-admin-edit-field-input--date";
        let iso = String(obj.date != null ? obj.date : "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) dateInp.value = iso;
        let preview = document.createElement("p");
        preview.className = "data-admin-edit-field-hint";
        function updateDatePreview() {
          var ymd = String(dateInp.value || "").trim();
          if (!ymd) {
            preview.textContent = "Choose a date — card line 3 updates automatically.";
            return;
          }
          preview.textContent =
            "Card line 3: " + formatEventCardLine3FromIso(ymd) + " (max 32 characters on submit form; auto-formatted here).";
        }
        dateInp.addEventListener("input", updateDatePreview);
        dateInp.addEventListener("change", updateDatePreview);
        updateDatePreview();
        row.appendChild(dateInp);
        row.appendChild(preview);
        delete row.dataset.editFieldKey;
        row.__readFields = function () {
          var ymd = String(dateInp.value || "").trim();
          if (!ymd) throw new Error("date: choose an event date.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("date: use the calendar to set a valid date.");
          return { date: ymd, cardLine3: formatEventCardLine3FromIso(ymd) };
        };
        fieldsForm.appendChild(row);
        continue;
      }

      if (collectionKey === "events" && key === "startTime") {
        lbl.textContent = "Start & end time";
        let timePair = document.createElement("div");
        timePair.className = "data-admin-edit-field-time-pair";
        let idSuffix = String(obj.id != null ? obj.id : "row").replace(/[^a-zA-Z0-9_-]/g, "-");

        let stWrap = document.createElement("div");
        stWrap.className = "data-admin-edit-field-time-item";
        let stLab = document.createElement("div");
        stLab.className = "data-admin-edit-field-time-label";
        stLab.textContent = "Start";
        let startSeed =
          String(obj.startTime != null ? obj.startTime : "").trim() || "19:00";
        let startSp = createTimeSpinner12(startSeed);
        stWrap.appendChild(stLab);
        stWrap.appendChild(startSp.el);

        let etWrap = document.createElement("div");
        etWrap.className = "data-admin-edit-field-time-item";
        let etLab = document.createElement("div");
        etLab.className = "data-admin-edit-field-time-label";
        etLab.textContent = "End";
        let endHasValue = !!toHtmlTimeValue(obj.endTime);
        let noEndChk = document.createElement("input");
        noEndChk.type = "checkbox";
        noEndChk.id = "data-admin-ev-noend-" + idSuffix;
        let noEndLbl = document.createElement("label");
        noEndLbl.className = "data-admin-edit-field-noend";
        noEndLbl.htmlFor = noEndChk.id;
        noEndLbl.appendChild(noEndChk);
        noEndLbl.appendChild(document.createTextNode(" No end time"));
        let endSp = createTimeSpinner12(endHasValue ? obj.endTime : startSeed);
        function syncEndSpinner() {
          endSp.setDimmed(noEndChk.checked);
        }
        noEndChk.checked = !endHasValue;
        noEndChk.addEventListener("change", syncEndSpinner);
        syncEndSpinner();
        etWrap.appendChild(etLab);
        etWrap.appendChild(noEndLbl);
        etWrap.appendChild(endSp.el);

        timePair.appendChild(stWrap);
        timePair.appendChild(etWrap);
        row.appendChild(timePair);
        let timeHint = document.createElement("p");
        timeHint.className = "data-admin-edit-field-hint";
        timeHint.textContent =
          "Use the up and down buttons for hour, minutes, and AM/PM. Values are saved as 24-hour HH:MM. Uncheck No end time to set an end.";
        row.appendChild(timeHint);
        delete row.dataset.editFieldKey;
        row.__readFields = function () {
          return {
            startTime: startSp.get24(),
            endTime: noEndChk.checked ? "" : endSp.get24(),
          };
        };
        fieldsForm.appendChild(row);
        continue;
      }

      if (typeof val === "boolean") {
        let g = document.createElement("div");
        g.className = "data-admin-field-bool-group";
        let t = document.createElement("button");
        let f = document.createElement("button");
        t.type = "button";
        f.type = "button";
        t.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        f.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        t.textContent = "True";
        f.textContent = "False";
        function setBool(v) {
          t.setAttribute("aria-pressed", v ? "true" : "false");
          f.setAttribute("aria-pressed", v ? "false" : "true");
        }
        t.addEventListener("click", function () {
          setBool(true);
        });
        f.addEventListener("click", function () {
          setBool(false);
        });
        setBool(val);
        g.appendChild(t);
        g.appendChild(f);
        row.appendChild(g);
        row.__readField = function () {
          return t.getAttribute("aria-pressed") === "true";
        };
        if (collectionKey === "events" && key === "isFeatured") {
          let hintSp = document.createElement("p");
          hintSp.className = "data-admin-edit-field-hint";
          hintSp.textContent =
            "Turn On so this instance is featured: center “Upcoming Featured Events”, right Wed/Sat spotlight, and the left recurring-by-day list. Off = not featured unless the activity is a one-off (then it is treated as featured when this flag is unset).";
          row.appendChild(hintSp);
        }
      } else if (typeof val === "number" && !isNaN(val)) {
        let inp = document.createElement("input");
        inp.type = "number";
        inp.className = "data-admin-edit-field-input";
        inp.step = "any";
        inp.value = String(val);
        row.appendChild(inp);
        row.__readField = function () {
          var s = String(inp.value || "").trim();
          if (s === "") {
            throw new Error(key + ": enter a number (or use Raw JSON to remove the field).");
          }
          var n = Number(s);
          if (isNaN(n)) {
            throw new Error(key + ": not a valid number.");
          }
          return n;
        };
      } else if (val === null) {
        let g2 = document.createElement("div");
        g2.className = "data-admin-field-bool-group";
        let bNull = document.createElement("button");
        let bText = document.createElement("button");
        bNull.type = "button";
        bText.type = "button";
        bNull.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        bText.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        bNull.textContent = "Null";
        bText.textContent = "Text";
        let inpS = document.createElement("input");
        inpS.type = "text";
        inpS.className = "data-admin-edit-field-input data-admin-edit-field-input--null-text";
        function setNullMode(isNull) {
          bNull.setAttribute("aria-pressed", isNull ? "true" : "false");
          bText.setAttribute("aria-pressed", isNull ? "false" : "true");
          inpS.style.display = isNull ? "none" : "block";
          if (isNull) inpS.value = "";
        }
        bNull.addEventListener("click", function () {
          setNullMode(true);
        });
        bText.addEventListener("click", function () {
          setNullMode(false);
        });
        setNullMode(true);
        g2.appendChild(bNull);
        g2.appendChild(bText);
        row.appendChild(g2);
        row.appendChild(inpS);
        row.__readField = function () {
          if (bNull.getAttribute("aria-pressed") === "true") return null;
          return String(inpS.value || "");
        };
      } else if (typeof val === "string") {
        let long =
          val.length > 100 ||
          /[\r\n]/.test(val) ||
          (collectionKey === "events" && key === "cardLine1");
        let sinp;
        if (long) {
          sinp = document.createElement("textarea");
          sinp.rows = Math.min(10, Math.max(3, val.split("\n").length));
          sinp.className = "data-admin-edit-field-textarea";
        } else {
          sinp = document.createElement("input");
          sinp.type = "text";
          sinp.className = "data-admin-edit-field-input";
        }
        if (collectionKey === "events" && key === "cardLine1") {
          row.dataset.mmhpRowKind = "cardLine1";
          sinp.maxLength = 48;
        }
        sinp.value = val;
        row.appendChild(sinp);
        row.__readField = function () {
          return String(sinp.value || "");
        };
      } else {
        let jta = document.createElement("textarea");
        jta.className = "data-admin-edit-field-textarea data-admin-edit-field-textarea--json";
        jta.setAttribute("spellcheck", "false");
        jta.value = JSON.stringify(val, null, 2);
        let lines = String(jta.value).split("\n").length;
        jta.rows = Math.min(14, Math.max(3, lines));
        row.appendChild(jta);
        row.__readField = function () {
          var raw = String(jta.value || "").trim();
          if (raw === "") {
            throw new Error(key + ": JSON field is empty.");
          }
          try {
            return JSON.parse(raw);
          } catch (ex) {
            throw new Error(key + ": invalid JSON — " + (ex.message || String(ex)));
          }
        };
      }

      fieldsForm.appendChild(row);
    }

    if (collectionKey === "events") {
      var actRow = fieldsForm.querySelector('[data-mmhp-row-kind="activityId"]');
      var c1Row = fieldsForm.querySelector('[data-mmhp-row-kind="cardLine1"]');
      var selEl = actRow ? actRow.querySelector("select") : null;
      var c1El = c1Row ? c1Row.querySelector("textarea, input") : null;
      if (selEl || c1El) {
        var evNRow = document.createElement("div");
        evNRow.className = "data-admin-edit-field-row";
        var evNLbl = document.createElement("div");
        evNLbl.className = "data-admin-edit-field-label";
        evNLbl.textContent = "Listing title (auto: short description of event + activity)";
        var evNDisp = document.createElement("input");
        evNDisp.type = "text";
        evNDisp.readOnly = true;
        evNDisp.className = "data-admin-edit-field-input data-admin-edit-field--readonly";
        evNDisp.title = "Saved as eventName when you click Apply.";
        function syncListingTitlePreview() {
          var aid = selEl ? String(selEl.value || "").trim() : "";
          var c1 = c1El ? String(c1El.value || "").trim() : "";
          evNDisp.value = deriveEventName(c1, aid, masterData);
        }
        if (selEl) selEl.addEventListener("change", syncListingTitlePreview);
        if (c1El) c1El.addEventListener("input", syncListingTitlePreview);
        syncListingTitlePreview();
        evNRow.appendChild(evNLbl);
        evNRow.appendChild(evNDisp);
        evNRow.dataset.mmhpRowKind = "listingTitle";
        fieldsForm.insertBefore(evNRow, fieldsForm.firstChild);
      }
    }
  }

  function readEditFormFields(fieldsForm) {
    var out = {};
    var rows = fieldsForm.children;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (typeof row.__readFields === "function") {
        var chunk = row.__readFields();
        for (var ek in chunk) {
          if (Object.prototype.hasOwnProperty.call(chunk, ek)) out[ek] = chunk[ek];
        }
        continue;
      }
      if (typeof row.__readField !== "function") continue;
      var k = row.dataset.editFieldKey;
      if (!k) continue;
      out[k] = row.__readField();
    }
    return out;
  }

  function ensureEditModal(setStatus) {
    var existing = document.getElementById("data-admin-edit-modal");
    if (existing) return existing;

    var backdrop = document.createElement("div");
    backdrop.id = "data-admin-edit-modal";
    backdrop.className = "data-admin-modal";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "data-admin-edit-modal-title");
    backdrop.hidden = true;

    var panel = document.createElement("div");
    panel.className = "data-admin-modal__panel";

    var title = document.createElement("h3");
    title.id = "data-admin-edit-modal-title";
    title.className = "data-admin-modal__title";

    var hint = document.createElement("p");
    hint.className = "data-admin-modal__hint";
    hint.textContent =
      "Edit fields below. Booleans and null use the same toggle style as weekdays. Apply updates this row in memory.";

    var fieldsForm = document.createElement("div");
    fieldsForm.className = "data-admin-edit-fields";
    fieldsForm.setAttribute("role", "group");
    fieldsForm.setAttribute("aria-label", "Row fields");

    var recurrencePanel = document.createElement("div");
    recurrencePanel.className = "data-admin-recurrence-panel";
    recurrencePanel.hidden = true;

    var recurrenceTitle = document.createElement("div");
    recurrenceTitle.className = "data-admin-recurrence-title";
    recurrenceTitle.textContent = "Recurrence (weekdays + start time)";
    recurrencePanel.appendChild(recurrenceTitle);

    var recurrenceHelp = document.createElement("p");
    recurrenceHelp.className = "data-admin-recurrence-help";
    recurrenceHelp.textContent =
      "Toggle each day that applies. Set time in 24-hour form (HH:MM). This updates recurrenceDetails on Apply.";
    recurrencePanel.appendChild(recurrenceHelp);

    var recurrenceDaysRow = document.createElement("div");
    recurrenceDaysRow.className = "data-admin-recurrence-days";
    recurrencePanel.appendChild(recurrenceDaysRow);

    var recurrenceDayButtons = [];
    for (var di = 0; di < 7; di++) {
      var dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "data-admin-recurrence-day-btn";
      dayBtn.textContent = RECURRENCE_WEEKDAY_ABBR[di];
      dayBtn.dataset.weekday = RECURRENCE_WEEKDAY_NAMES[di];
      dayBtn.setAttribute("aria-pressed", "false");
      dayBtn.setAttribute("aria-label", RECURRENCE_WEEKDAY_NAMES[di]);
      (function (btn) {
        btn.addEventListener("click", function () {
          var on = btn.getAttribute("aria-pressed") === "true";
          btn.setAttribute("aria-pressed", on ? "false" : "true");
        });
      })(dayBtn);
      recurrenceDayButtons.push(dayBtn);
      recurrenceDaysRow.appendChild(dayBtn);
    }

    var recurrenceTimeRow = document.createElement("div");
    recurrenceTimeRow.className = "data-admin-recurrence-time-row";
    var recurrenceTimeLabel = document.createElement("label");
    recurrenceTimeLabel.className = "data-admin-recurrence-time-label";
    recurrenceTimeLabel.htmlFor = "data-admin-recurrence-time-input";
    recurrenceTimeLabel.textContent = "Start time";
    var recurrenceTimeInput = document.createElement("input");
    recurrenceTimeInput.id = "data-admin-recurrence-time-input";
    recurrenceTimeInput.type = "text";
    recurrenceTimeInput.className = "data-admin-recurrence-time-input";
    recurrenceTimeInput.setAttribute("inputmode", "numeric");
    recurrenceTimeInput.setAttribute("autocomplete", "off");
    recurrenceTimeInput.placeholder = "13:00";
    recurrenceTimeRow.appendChild(recurrenceTimeLabel);
    recurrenceTimeRow.appendChild(recurrenceTimeInput);
    recurrencePanel.appendChild(recurrenceTimeRow);

    var ta = document.createElement("textarea");
    ta.className = "data-admin-modal__textarea";
    ta.setAttribute("spellcheck", "false");

    var advanced = document.createElement("details");
    advanced.className = "data-admin-edit-advanced";
    var advancedSum = document.createElement("summary");
    advancedSum.className = "data-admin-edit-advanced-summary";
    advancedSum.textContent = "Raw JSON (advanced)";
    advanced.appendChild(advancedSum);
    advanced.appendChild(ta);

    advanced.addEventListener("toggle", function () {
      if (!advanced.open) return;
      if (ctx.rowIndex < 0 || !ctx.collectionKey) return;
      try {
        var partial = readEditFormFields(fieldsForm);
        if (!recurrencePanel.hidden) {
          var sel = [];
          for (var sj = 0; sj < recurrenceDayButtons.length; sj++) {
            if (recurrenceDayButtons[sj].getAttribute("aria-pressed") === "true") {
              sel.push(recurrenceDayButtons[sj].dataset.weekday);
            }
          }
          var st0 = String(recurrenceTimeInput.value || "").trim();
          if (sel.length === 0) partial.recurrenceDetails = {};
          else partial.recurrenceDetails = { weekdays: sel, startTime: st0 };
        }
        ta.value = JSON.stringify(partial, null, 2);
        err.textContent = "";
      } catch (ex) {
        err.textContent = "Fix the form above first: " + (ex.message || String(ex));
        advanced.open = false;
      }
    });

    var err = document.createElement("p");
    err.className = "data-admin-modal__error";
    err.setAttribute("role", "alert");

    var actions = document.createElement("div");
    actions.className = "data-admin-modal__actions";

    var btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "btn site-button";
    btnCancel.textContent = "Cancel";

    var btnApply = document.createElement("button");
    btnApply.type = "button";
    btnApply.className = "btn site-button";
    btnApply.textContent = "Apply";

    actions.appendChild(btnCancel);
    actions.appendChild(btnApply);

    panel.appendChild(title);
    panel.appendChild(hint);
    panel.appendChild(fieldsForm);
    panel.appendChild(recurrencePanel);
    panel.appendChild(advanced);
    panel.appendChild(err);
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    var ctx = { collectionKey: "", rowIndex: -1, onApplied: null, masterDataRef: null };

    function close() {
      backdrop.hidden = true;
      stripDuplicateSlotAlertStyle(err);
      err.textContent = "";
      ctx.onApplied = null;
      ctx.masterDataRef = null;
    }

    btnCancel.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });

    btnApply.addEventListener("click", function () {
      stripDuplicateSlotAlertStyle(err);
      err.textContent = "";
      if (ctx.rowIndex < 0 || !ctx.collectionKey) {
        err.textContent = "Internal error: lost row context.";
        return;
      }
      var parsed;
      if (advanced.open) {
        var text = String(ta.value || "").trim();
        try {
          parsed = JSON.parse(text);
        } catch (ex) {
          err.textContent = "Invalid JSON: " + (ex.message || String(ex));
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          err.textContent = "Root value must be a JSON object (not an array or primitive).";
          return;
        }
      } else {
        try {
          parsed = readEditFormFields(fieldsForm);
        } catch (ex) {
          err.textContent = ex.message || String(ex);
          return;
        }
      }
      if (!recurrencePanel.hidden) {
        var selected = [];
        for (var si = 0; si < recurrenceDayButtons.length; si++) {
          if (recurrenceDayButtons[si].getAttribute("aria-pressed") === "true") {
            selected.push(recurrenceDayButtons[si].dataset.weekday);
          }
        }
        var st = String(recurrenceTimeInput.value || "").trim();
        if (selected.length > 0 && !st) {
          err.textContent =
            "Set a start time (HH:MM, e.g. 13:00) when one or more weekdays are selected.";
          return;
        }
        if (selected.length === 0) {
          parsed.recurrenceDetails = {};
        } else {
          parsed.recurrenceDetails = { weekdays: selected, startTime: st };
        }
      }
      if (ctx.collectionKey === "events") {
        finalizeEventRow(parsed, ctx.masterDataRef || {});
        var evErr = validateEventRow(parsed);
        if (evErr) {
          err.textContent = evErr;
          return;
        }
        var evs0 = ctx.masterDataRef && Array.isArray(ctx.masterDataRef.events) ? ctx.masterDataRef.events : [];
        var dupSlot = validateEventsNoDuplicateDateTimeLocation(evs0, ctx.rowIndex, parsed);
        if (dupSlot) {
          err.textContent = dupSlot;
          flashDuplicateSlotAlert(err);
          return;
        }
      }
      if (typeof ctx.onApplied === "function") {
        ctx.onApplied(ctx.collectionKey, ctx.rowIndex, parsed);
      }
      close();
      setStatus("Row updated in " + ctx.collectionKey + ". Export CSV to download changes.");
    });

    backdrop.__openEdit = function (collectionKey, rowIndex, obj, onApplied, masterData) {
      ctx.collectionKey = collectionKey;
      ctx.rowIndex = rowIndex;
      ctx.onApplied = onApplied;
      ctx.masterDataRef = masterData || {};
      title.textContent = "Edit row — " + collectionKey + " [" + rowIndex + "]";
      ta.value = JSON.stringify(obj, null, 2);
      stripDuplicateSlotAlertStyle(err);
      err.textContent = "";
      advanced.open = false;

      buildEditFormFields(fieldsForm, obj, collectionKey, masterData);

      var showRecurrence = collectionKey === "activities";
      recurrencePanel.hidden = !showRecurrence;
      panel.classList.toggle("data-admin-modal__panel--wide", showRecurrence || fieldsForm.children.length > 4);
      if (showRecurrence) {
        hint.textContent =
          "Use the field list below. Weekdays and start time apply to recurrenceDetails (same toggle style as True/False). Open Raw JSON only if you need the full document.";
        var rd = obj.recurrenceDetails || {};
        var wd = Array.isArray(rd.weekdays) ? rd.weekdays : [];
        var inSet = {};
        for (var wi = 0; wi < wd.length; wi++) {
          inSet[String(wd[wi]).trim()] = true;
        }
        for (var bi = 0; bi < recurrenceDayButtons.length; bi++) {
          var nm = recurrenceDayButtons[bi].dataset.weekday;
          recurrenceDayButtons[bi].setAttribute("aria-pressed", inSet[nm] ? "true" : "false");
        }
        recurrenceTimeInput.value = rd.startTime != null ? String(rd.startTime).trim() : "";
      } else {
        hint.textContent =
          "Edit fields below (toggles for booleans and null). Nested objects use a JSON box per field. Open Raw JSON to paste the whole row.";
      }

      backdrop.hidden = false;
      var firstFocus = fieldsForm.querySelector(
        "textarea:not([readonly]), input:not([readonly]), select, button.data-admin-recurrence-day-btn, button.data-admin-field-bool-btn"
      );
      if (firstFocus) firstFocus.focus();
      else ta.focus();
    };

    return backdrop;
  }

  function renderTable(
    parent,
    columns,
    objectEntries,
    collectionKey,
    masterData,
    setStatus,
    refreshSection
  ) {
    var wrap = document.createElement("div");
    wrap.className = "data-admin-table-wrap";
    var table = document.createElement("table");
    table.className = "data-admin-table";

    var modal = ensureEditModal(setStatus);

    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    var thEdit = document.createElement("th");
    thEdit.className = "data-admin-table__col-edit";
    thEdit.textContent = "Edit";
    trh.appendChild(thEdit);
    for (var c = 0; c < columns.length; c++) {
      var th = document.createElement("th");
      th.textContent = columns[c];
      trh.appendChild(th);
    }
    var thDel = document.createElement("th");
    thDel.className = "data-admin-table__col-delete";
    thDel.textContent = "Delete";
    trh.appendChild(thDel);
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var maxRows = Math.min(objectEntries.length, 500);
    for (var r = 0; r < maxRows; r++) {
      var tr = document.createElement("tr");
      var entry = objectEntries[r];
      var tdBtn = document.createElement("td");
      tdBtn.className = "data-admin-table__col-edit";
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn site-button data-admin-edit-row-btn";
      editBtn.textContent = "Edit";
      (function (key, idx, obj) {
        editBtn.addEventListener("click", function () {
          modal.__openEdit(key, idx, obj, function (k, rowIdx, parsed) {
            masterData[k][rowIdx] = parsed;
            setDataAdminUnsaved(true);
            refreshSection();
          }, masterData);
        });
      })(collectionKey, entry.idx, entry.obj);
      tdBtn.appendChild(editBtn);
      tr.appendChild(tdBtn);

      for (var cc = 0; cc < columns.length; cc++) {
        var td = document.createElement("td");
        td.textContent = cellValue(entry.obj[columns[cc]]);
        tr.appendChild(td);
      }

      var tdDel = document.createElement("td");
      tdDel.className = "data-admin-table__col-delete";
      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn site-button data-admin-delete-row-btn";
      delBtn.textContent = "Delete";
      (function (key, idx, label) {
        delBtn.addEventListener("click", function () {
          var msg =
            "Remove this row from \"" + key + "\"? Index " + idx + (label ? " (" + label + ")" : "") + ". This cannot be undone except by refreshing.";
          if (!window.confirm(msg)) return;
          masterData[key].splice(idx, 1);
          setDataAdminUnsaved(true);
          refreshSection();
          setStatus("Removed 1 row from " + key + ". Export CSV to save; refresh page to reload JSON from disk.");
        });
      })(
        collectionKey,
        entry.idx,
        entry.obj && entry.obj.id != null ? String(entry.obj.id) : ""
      );
      tdDel.appendChild(delBtn);
      tr.appendChild(tdDel);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    parent.appendChild(wrap);

    if (objectEntries.length > maxRows) {
      var note = document.createElement("p");
      note.className = "data-admin-section-meta";
      note.textContent =
        "Showing first " + maxRows + " of " + objectEntries.length + " rows. Export CSV includes all rows.";
      parent.appendChild(note);
    }
  }

  function initBrowseApp(jsonPath) {
    var root = document.getElementById("data-admin-browse-root");
    var status = document.getElementById("data-admin-browse-status");
    if (!root || !jsonPath) return;

    var loadGen = ++__dataAdminBrowseInitGen;

    var masterData = null;

    function setStatus(msg, isError) {
      if (!status) return;
      stripDuplicateSlotAlertStyle(status);
      status.textContent = msg || "";
      status.classList.toggle("data-admin-status--error", !!isError);
      if (isError && isDataAdminDuplicateSlotMessage(msg)) {
        flashDuplicateSlotAlert(status);
      }
    }

    function renderSection(section, key, val) {
      var hidePast = key === "events" && !!section._mmhpEventsHidePast;
      var objectEntries = buildObjectEntriesForDisplay(val, key, hidePast);

      var rowCountEl = section.querySelector(".data-admin-section-rowcount");
      if (rowCountEl) {
        if (key === "events" && hidePast) {
          var totalEv = Array.isArray(val) ? val.length : 0;
          var shownEv = objectEntries.length;
          if (shownEv === totalEv) {
            rowCountEl.textContent = totalEv + " row(s)";
          } else {
            rowCountEl.textContent =
              shownEv + " shown (today or later), " + (totalEv - shownEv) + " past hidden — " + totalEv + " total";
          }
        } else {
          rowCountEl.textContent = val.length + " row(s)";
        }
      }

      var body = section.querySelector(".data-admin-section-body");
      if (body) body.remove();

      body = document.createElement("div");
      body.className = "data-admin-section-body";
      section.appendChild(body);
      if (objectEntries.length === 0) {
        var empty = document.createElement("p");
        empty.className = "data-admin-section-meta";
        if (key === "events" && hidePast && Array.isArray(val) && val.length > 0) {
          empty.textContent =
            "No events on or after today in this view. Use \"Show all events\" above to see past rows.";
        } else {
          empty.textContent = "No object rows.";
        }
        body.appendChild(empty);
        return;
      }

      var columns = orderDataAdminTableColumns(
        key,
        collectColumns(objectEntries.map(function (e) { return e.obj; }))
      );

      function refreshSection() {
        renderSection(section, key, masterData[key]);
      }

      renderTable(body, columns, objectEntries, key, masterData, setStatus, refreshSection);
    }

    function refreshSectionByKey(collectionKey) {
      var sectionId = "collection-" + collectionKey.replace(/[^a-zA-Z0-9_-]/g, "-");
      var section = document.getElementById(sectionId);
      if (!section || !masterData) return;
      var arr = masterData[collectionKey];
      if (!Array.isArray(arr)) return;
      renderSection(section, collectionKey, arr);
    }

    setStatus("Loading JSON…");

    fetch(jsonPath)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (loadGen !== __dataAdminBrowseInitGen) {
          return;
        }
        ensureDataAdminBeforeUnloadListener();
        masterData = data;
        setDataAdminUnsaved(false);
        root.textContent = "";
        setStatus("Load complete. Use Save changes to master JSON (under the header) to write to disk, or export CSV per table.");

        refreshMasterJsonPathHintElements();

        var editPathBtn = document.getElementById("mmhp-edit-master-path-hint");
        if (editPathBtn) {
          editPathBtn.onclick = function () {
            var cur = getMasterJsonRelativePathHint();
            var next = window.prompt(
              "Relative path to mmhp-master-data.json (from your usual parent folder). Use \\ or /:",
              cur
            );
            if (next === null) return;
            var t = next.trim();
            if (t) setMasterJsonRelativePathHint(t);
            refreshMasterJsonPathHintElements();
          };
        }

        var saveBtn = document.getElementById("mmhp-save-master-json");
        if (saveBtn) {
          function runMasterJsonSaveToDisk() {
            if (Array.isArray(masterData.events)) {
              for (var fi = 0; fi < masterData.events.length; fi++) {
                finalizeEventRow(masterData.events[fi], masterData);
              }
            }
            var blockMsg = validateMasterDataBeforeSave(masterData);
            if (blockMsg) {
              setStatus("Cannot save: " + blockMsg, true);
              return;
            }
            var text = JSON.stringify(masterData, null, 2) + "\n";
            var blob = new Blob([text], { type: "application/json;charset=utf-8" });

            if (typeof window.showSaveFilePicker === "function") {
              window
                .showSaveFilePicker({
                  suggestedName: "mmhp-master-data.json",
                  types: [
                    {
                      description: "JSON",
                      accept: { "application/json": [".json"] },
                    },
                  ],
                })
                .then(function (handle) {
                  return handle.createWritable();
                })
                .then(function (writable) {
                  var w = writable;
                  return w.write(blob).then(function () {
                    return w.close();
                  });
                })
                .then(function () {
                  setDataAdminUnsaved(false);
                  setStatus(
                    "Saved — mmhp-master-data.json was written to the path you chose. Usual relative path: " +
                      getMasterJsonRelativePathHint()
                  );
                })
                .catch(function (err) {
                  if (err && err.name === "AbortError") {
                    setStatus("Save cancelled.");
                    return;
                  }
                  setStatus(
                    "Save dialog failed: " + (err && err.message ? err.message : String(err)) + " — downloading a copy.",
                    true
                  );
                  downloadText("mmhp-master-data.json", text, "application/json;charset=utf-8");
                  setDataAdminUnsaved(false);
                });
            } else {
              downloadText("mmhp-master-data.json", text, "application/json;charset=utf-8");
              setDataAdminUnsaved(false);
              setStatus(
                "Downloaded mmhp-master-data.json — place it at " + getMasterJsonRelativePathHint() + " (or merge manually)."
              );
            }
          }

          function openSaveConfirmModal() {
            var modal = document.getElementById("mmhp-save-confirm-modal");
            var pathEl = document.getElementById("mmhp-save-confirm-path");
            var cancelBtn = document.getElementById("mmhp-save-confirm-cancel");
            var okBtn = document.getElementById("mmhp-save-confirm-ok");
            var backdrop = document.getElementById("mmhp-save-confirm-backdrop");
            if (!modal || !pathEl || !cancelBtn || !okBtn) {
              if (window.confirm("Save ALL edits to mmhp-master-data.json?\n\nPath: " + getMasterJsonRelativePathHint())) {
                runMasterJsonSaveToDisk();
              } else {
                setStatus("Save cancelled.");
              }
              return;
            }

            pathEl.textContent = getMasterJsonRelativePathHint();
            modal.hidden = false;
            okBtn.focus();

            function cleanupModalUi() {
              modal.hidden = true;
              cancelBtn.onclick = null;
              okBtn.onclick = null;
              if (backdrop) backdrop.onclick = null;
              document.removeEventListener("keydown", onKey);
            }

            function onKey(e) {
              if (e.key === "Escape") {
                cleanupModalUi();
                setStatus("Save cancelled.");
              }
            }

            cancelBtn.onclick = function () {
              cleanupModalUi();
              setStatus("Save cancelled.");
            };

            okBtn.onclick = function () {
              cleanupModalUi();
              runMasterJsonSaveToDisk();
            };

            if (backdrop) {
              backdrop.onclick = function (e) {
                if (e.target === backdrop) {
                  cleanupModalUi();
                  setStatus("Save cancelled.");
                }
              };
            }

            document.addEventListener("keydown", onKey);
          }

          saveBtn.onclick = function () {
            if (!masterData) {
              setStatus("No data loaded.", true);
              return;
            }
            openSaveConfirmModal();
          };
        }

        var addEventBtn = document.getElementById("mmhp-add-event-btn");
        if (addEventBtn) {
          addEventBtn.onclick = function () {
            var nowMs = Date.now();
            if (nowMs - __dataAdminLastAddEventMs < 900) {
              return;
            }
            __dataAdminLastAddEventMs = nowMs;
            if (!masterData) {
              setStatus("No data loaded.", true);
              return;
            }
            if (!document.getElementById("collection-events")) {
              setStatus(
                "Cannot add an event: this JSON has no events collection. Add an events array to the file and reload.",
                true
              );
              return;
            }
            if (!Array.isArray(masterData.events)) masterData.events = [];
            var nu = buildNewEventRow(masterData);
            masterData.events.push(nu);
            setDataAdminUnsaved(true);
            refreshSectionByKey("events");
            var modal = ensureEditModal(setStatus);
            var newIdx = masterData.events.length - 1;
            modal.__openEdit(
              "events",
              newIdx,
              masterData.events[newIdx],
              function (k, rowIdx, parsed) {
                masterData[k][rowIdx] = parsed;
                setDataAdminUnsaved(true);
                refreshSectionByKey(k);
              },
              masterData
            );
            setStatus(
              "Added event " +
                nu.id +
                ". Complete the form and click Apply, then use Save changes to the Master Data File."
            );
          };
        }

        var purgePastBtn = document.getElementById("mmhp-purge-past-events-btn");
        if (purgePastBtn) {
          purgePastBtn.onclick = function () {
            var nowMs = Date.now();
            if (nowMs - __dataAdminLastPurgePastMs < 900) {
              return;
            }
            __dataAdminLastPurgePastMs = nowMs;
            if (!masterData) {
              setStatus("No data loaded.", true);
              return;
            }
            if (!document.getElementById("collection-events")) {
              setStatus(
                "Cannot purge events: this JSON has no events collection.",
                true
              );
              return;
            }
            if (!Array.isArray(masterData.events)) masterData.events = [];
            var today = todayIsoLocal();
            var evs = masterData.events;
            var toRemove = 0;
            for (var pi = 0; pi < evs.length; pi++) {
              var ds = String(evs[pi] && evs[pi].date != null ? evs[pi].date : "").trim();
              if (ds.length === 10 && ds < today) toRemove++;
            }
            if (toRemove === 0) {
              setStatus("No events dated before " + today + " to remove.");
              return;
            }
            var msg =
              "Remove " +
              toRemove +
              " event(s) dated before " +
              today +
              " (this browser's local calendar date)?\n\nRows stay in memory until you save or reload.";
            if (!window.confirm(msg)) {
              setStatus("Purge cancelled.");
              return;
            }
            var kept = [];
            for (var pj = 0; pj < evs.length; pj++) {
              var d2 = String(evs[pj] && evs[pj].date != null ? evs[pj].date : "").trim();
              if (d2.length === 10 && d2 < today) continue;
              kept.push(evs[pj]);
            }
            masterData.events = kept;
            setDataAdminUnsaved(true);
            refreshSectionByKey("events");
            setStatus(
              "Removed " + toRemove + " past event(s). " + kept.length + " remain. Save to write the Master Data File."
            );
          };
        }

        var googleCalBtn = document.getElementById("mmhp-export-google-calendar-csv-btn");
        var googleCalModal = document.getElementById("mmhp-google-cal-export-modal");
        var googleCalBackdrop = document.getElementById("mmhp-google-cal-export-backdrop");
        var googleCalCancel = document.getElementById("mmhp-google-cal-export-cancel");
        var googleCalOk = document.getElementById("mmhp-google-cal-export-ok");

        function runGoogleCalendarCsvDownload() {
          if (!masterData || !Array.isArray(masterData.events)) {
            setStatus("No events loaded.", true);
            return;
          }
          var r = buildGoogleCalendarCsvString(masterData.events);
          var fn = "mmhp-google-calendar-import-" + fileDateStamp() + ".csv";
          var text = r.text;
          var blob = new Blob([text], { type: "text/csv;charset=utf-8" });

          function finishStatus(savedViaPicker) {
            var msg =
              (savedViaPicker ? "Saved " : "Downloaded ") +
              fn +
              " (" +
              r.written +
              " active events). ";
            msg += savedViaPicker
              ? "Import in Google Calendar → Settings → Import & export."
              : "Move it to assets/data/csv/export/ if needed, then import in Google Calendar → Settings → Import & export.";
            if (r.skipped) msg += " Skipped " + r.skipped + " row(s) with bad date or start time.";
            setStatus(msg);
          }

          if (typeof window.showSaveFilePicker === "function") {
            window
              .showSaveFilePicker({
                suggestedName: fn,
                types: [
                  {
                    description: "CSV",
                    accept: { "text/csv": [".csv"] },
                  },
                ],
              })
              .then(function (handle) {
                return handle.createWritable();
              })
              .then(function (writable) {
                var w = writable;
                return w.write(blob).then(function () {
                  return w.close();
                });
              })
              .then(function () {
                finishStatus(true);
              })
              .catch(function (err) {
                if (err && err.name === "AbortError") {
                  setStatus("Google Calendar export save cancelled.");
                  return;
                }
                setStatus(
                  "Save dialog failed: " + (err && err.message ? err.message : String(err)) + " — saving via download.",
                  true
                );
                downloadText(fn, text, "text/csv;charset=utf-8");
                finishStatus(false);
              });
          } else {
            downloadText(fn, text, "text/csv;charset=utf-8");
            finishStatus(false);
          }
        }

        function openGoogleCalExportModal() {
          if (!googleCalModal || !googleCalOk || !googleCalCancel) {
            runGoogleCalendarCsvDownload();
            return;
          }

          googleCalModal.hidden = false;
          googleCalOk.focus();

          function cleanupGoogleCalModalUi() {
            googleCalModal.hidden = true;
            googleCalOk.onclick = null;
            googleCalCancel.onclick = null;
            if (googleCalBackdrop) googleCalBackdrop.onclick = null;
            document.removeEventListener("keydown", onGoogleCalKey);
          }

          function onGoogleCalKey(e) {
            if (e.key === "Escape") {
              cleanupGoogleCalModalUi();
              setStatus("Google Calendar export cancelled.");
            }
          }

          googleCalCancel.onclick = function () {
            cleanupGoogleCalModalUi();
            setStatus("Google Calendar export cancelled.");
          };

          googleCalOk.onclick = function () {
            cleanupGoogleCalModalUi();
            runGoogleCalendarCsvDownload();
          };

          if (googleCalBackdrop) {
            googleCalBackdrop.onclick = function (e) {
              if (e.target === googleCalBackdrop) {
                cleanupGoogleCalModalUi();
                setStatus("Google Calendar export cancelled.");
              }
            };
          }

          document.addEventListener("keydown", onGoogleCalKey);
        }

        if (googleCalBtn) {
          googleCalBtn.onclick = function () {
            if (!masterData || !Array.isArray(masterData.events)) {
              setStatus("No events loaded.", true);
              return;
            }
            openGoogleCalExportModal();
          };
        }

        var keys = sortMasterDataCollectionKeys(
          Object.keys(data).filter(function (k) {
            return Array.isArray(data[k]);
          })
        );
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var val = data[key];

          var section = document.createElement("section");
          section.className = "data-admin-browse-section";
          section.id = "collection-" + key.replace(/[^a-zA-Z0-9_-]/g, "-");

          var h2 = document.createElement("h2");
          h2.textContent = key;
          section.appendChild(h2);

          var meta = document.createElement("p");
          meta.className = "data-admin-section-meta data-admin-section-rowcount";
          meta.textContent = val.length + " row(s)";
          section.appendChild(meta);

          var toolbar = document.createElement("div");
          toolbar.className = "data-admin-section-toolbar";

          if (key === "events") {
            section._mmhpEventsHidePast = false;
            var displayToggleBtn = document.createElement("button");
            displayToggleBtn.type = "button";
            displayToggleBtn.className = "btn site-button data-admin-events-display-toggle";
            displayToggleBtn.setAttribute(
              "aria-label",
              "Toggle between showing all events and hiding events before today"
            );
            function syncEventsDisplayToggleLabel() {
              displayToggleBtn.textContent = section._mmhpEventsHidePast ? "Show all events" : "Hide past events";
            }
            syncEventsDisplayToggleLabel();
            displayToggleBtn.addEventListener("click", function () {
              section._mmhpEventsHidePast = !section._mmhpEventsHidePast;
              syncEventsDisplayToggleLabel();
              if (!masterData || !Array.isArray(masterData.events)) return;
              renderSection(section, "events", masterData.events);
            });
            toolbar.appendChild(displayToggleBtn);
          }

          var exportBtn = document.createElement("button");
          exportBtn.type = "button";
          exportBtn.className = "btn site-button";
          exportBtn.textContent = "Export " + key + " to CSV";

          (function (collectionKey, rows) {
            exportBtn.addEventListener("click", function () {
              var objects = rows.filter(function (row) {
                return row && typeof row === "object" && !Array.isArray(row);
              });
              if (objects.length === 0) {
                setStatus("No objects to export for " + collectionKey + ".", true);
                return;
              }
              var columns = collectColumns(objects);
              var csv = arrayToCsv(objects, columns);
              var fn = "mmhp-" + collectionKey + "-" + fileDateStamp() + ".csv";
              downloadText(fn, csv, "text/csv;charset=utf-8");
              setStatus("Downloaded " + fn + ".");
            });
          })(key, val);

          toolbar.appendChild(exportBtn);
          section.appendChild(toolbar);

          renderSection(section, key, val);
          root.appendChild(section);
        }

        if (!root.children.length) {
          setStatus("No array collections found in JSON.", true);
        }
      })
      .catch(function () {
        if (loadGen !== __dataAdminBrowseInitGen) return;
        setStatus(
          "Could not load " + jsonPath + ". Use a local server (e.g. npx serve) or open from hosting; file:// often blocks fetch.",
          true
        );
      });
  }

   function runDataAdminGate() {
    if (isDataAdminMobileEnvironment()) {
      try {
        sessionStorage.setItem("mmhp_data_admin_mobile_redirect", "1");
      } catch (eM) {}
      window.location.replace("../index.html?mmhp=desktop-data-admin");
      return;
    }

    var app = document.getElementById("data-admin-app");
    var denied = document.getElementById("data-admin-denied");
    var deniedMsg = document.getElementById("data-admin-denied-msg");

    if (!app || !denied) {
      var fallbackPath =
        document.body.getAttribute("data-mmhp-master-json") ||
        "../assets/data/json/mmhp-master-data.json";
      initBrowseApp(fallbackPath);
      return;
    }

    function showDenied(msg) {
      if (deniedMsg && msg) deniedMsg.textContent = msg;
      denied.hidden = false;
      app.hidden = true;
    }

    function showApp() {
      denied.hidden = true;
      app.hidden = false;
    }

    var masterUrl = document.body.getAttribute("data-mmhp-master-json");
    if (!masterUrl) {
      showDenied("Missing data-mmhp-master-json on page.");
      return;
    }

    try {
      if (sessionStorage.getItem(ADMIN_UNLOCK_STORAGE_KEY) === "1") {
        showApp();
        initBrowseApp(masterUrl);
        return;
      }
    } catch (e0) {}

    if (deniedMsg) deniedMsg.textContent = "Checking access…";

    var secretUrl = scheduleSecretUrlFromMaster(masterUrl);
    denied.hidden = true;
    var entered = window.prompt("Enter admin password:");
    if (entered == null) {
      showDenied("Cancelled.");
      return;
    }
    if (!secretUrl) {
      showDenied("Could not resolve password file path.");
      return;
    }

    fetch(secretUrl, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .then(function (expected) {
        if (String(entered).trim() !== String(expected).trim()) {
          showDenied("Incorrect password.");
          return;
        }
        try {
          sessionStorage.setItem(ADMIN_UNLOCK_STORAGE_KEY, "1");
        } catch (e1) {}
        showApp();
        initBrowseApp(masterUrl);
      })
      .catch(function () {
        showDenied("Could not load password file (assets/data/doc/syuper-secret-squirrel).");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runDataAdminGate);
  } else {
    runDataAdminGate();
  }
})();
