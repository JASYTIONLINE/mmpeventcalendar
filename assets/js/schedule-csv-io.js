(function () {
  var CSV_COLUMNS = [
    "recordType",
    "id",
    "activityName",
    "description",
    "location",
    "recurrenceType",
    "recurrenceWeekdays",
    "recurrenceStartTime",
    "recurrenceSlotsJson",
    "keywords",
    "contactResidentId",
    "chairpersonId",
    "imagePath",
    "featureId",
    "eventDate",
    "eventStartTime",
    "eventEndTime",
    "eventIsActive",
    "eventLocation",
    "eventName",
    "eventCardLine1",
    "eventCardLine2",
    "eventCardLine3",
    "isFeatured",
  ];

  var UNLOCK_STORAGE_KEY = "mmhp_schedule_io_unlocked";

  function getMasterJsonUrl() {
    var u = document.body.getAttribute("data-mmhp-master-json");
    if (u) return u;
    var aside = document.querySelector("aside.site-sidebar-left[data-mmhp-master-json]");
    return aside ? aside.getAttribute("data-mmhp-master-json") : null;
  }

  /** Same folder depth as master JSON: .../json/file.json → .../doc/syuper-secret-squirrel */
  function scheduleSecretUrlFromMaster(masterUrl) {
    if (!masterUrl) return null;
    return masterUrl.replace(/json\/[^/?#]+$/i, "doc/syuper-secret-squirrel");
  }

  function fetchExpectedPassword(secretUrl) {
    return fetch(secretUrl, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (t) {
      return String(t || "").trim();
    });
  }

  function isScheduleIoUnlocked() {
    try {
      return sessionStorage.getItem(UNLOCK_STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function setScheduleIoUnlocked() {
    try {
      sessionStorage.setItem(UNLOCK_STORAGE_KEY, "1");
    } catch (e) {}
  }

  /**
   * Prompt once per browser tab session; compares to trimmed contents of doc/super-secret-squirrel.
   */
  function ensureScheduleIoUnlocked(secretUrl, statusEl) {
    if (isScheduleIoUnlocked()) return Promise.resolve(true);
    if (!secretUrl) {
      setStatus(statusEl, "Secret file path could not be resolved.", true);
      return Promise.resolve(false);
    }
    var entered = window.prompt("Enter password to use schedule export/import:");
    if (entered == null) {
      setStatus(statusEl, "Cancelled.");
      return Promise.resolve(false);
    }
    return fetchExpectedPassword(secretUrl)
      .then(function (expected) {
        if (String(entered).trim() !== expected) {
          setStatus(statusEl, "Incorrect password.", true);
          return false;
        }
        setScheduleIoUnlocked();
        setStatus(statusEl, "");
        return true;
      })
      .catch(function () {
        setStatus(statusEl, "Could not load password file (assets/data/doc/syuper-secret-squirrel).", true);
        return false;
      });
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function fileDateStamp() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  function csvEscape(val) {
    if (val == null || val === undefined) return "";
    var t = String(val);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function rowToCsvLine(cells) {
    var parts = [];
    for (var i = 0; i < cells.length; i++) parts.push(csvEscape(cells[i]));
    return parts.join(",");
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [];
    var row = [];
    var cur = "";
    var i = 0;
    var inQuote = false;
    while (i < text.length) {
      var c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cur += '"';
            i += 2;
            continue;
          }
          inQuote = false;
          i++;
          continue;
        }
        cur += c;
        i++;
        continue;
      }
      if (c === '"') {
        inQuote = true;
        i++;
        continue;
      }
      if (c === ",") {
        row.push(cur);
        cur = "";
        i++;
        continue;
      }
      if (c === "\r") {
        i++;
        continue;
      }
      if (c === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        i++;
        continue;
      }
      cur += c;
      i++;
    }
    row.push(cur);
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
    return rows;
  }

  function rowsToObjects(header, rows) {
    var idx = {};
    for (var h = 0; h < header.length; h++) idx[header[h]] = h;
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var line = rows[r];
      if (line.every(function (c) { return String(c).trim() === ""; })) continue;
      var o = {};
      for (var k = 0; k < header.length; k++) {
        var key = header[k];
        var j = idx[key];
        o[key] = j != null && j < line.length ? line[j] : "";
      }
      out.push(o);
    }
    return out;
  }

  function splitPipe(s) {
    if (!s || !String(s).trim()) return [];
    return String(s)
      .split("|")
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }

  function parseBoolCell(s, defaultVal) {
    if (s == null || String(s).trim() === "") return defaultVal;
    var v = String(s).trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
    return defaultVal;
  }

  function parseOptionalBool(s) {
    if (s == null || String(s).trim() === "") return undefined;
    var v = String(s).trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
    return undefined;
  }

  function buildRecurrenceDetails(o) {
    var slotsRaw = (o.recurrenceSlotsJson || "").trim();
    if (slotsRaw) {
      try {
        var parsed = JSON.parse(slotsRaw);
        if (Array.isArray(parsed)) return { slots: parsed };
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.slots)) return { slots: parsed.slots };
      } catch (e) {
        throw new Error("Invalid recurrenceSlotsJson for activity " + (o.id || ""));
      }
    }
    var days = splitPipe(o.recurrenceWeekdays);
    var st = (o.recurrenceStartTime || "").trim();
    if (days.length && st) return { weekdays: days, startTime: st };
    return {};
  }

  function rowToActivity(o) {
    var kw = splitPipe(o.keywords);
    return {
      id: String(o.id || "").trim(),
      activityName: String(o.activityName || "").trim(),
      description: String(o.description || "").trim(),
      location: String(o.location || "").trim(),
      recurrenceType: String(o.recurrenceType || "").trim(),
      recurrenceDetails: buildRecurrenceDetails(o),
      keywords: kw,
      contactResidentId: String(o.contactResidentId || "").trim(),
      chairpersonId: String(o.chairpersonId || "").trim(),
      imagePath: String(o.imagePath || "").trim(),
    };
  }

  function rowToFeature(o) {
    var fromFid = String(o.featureId || "").trim();
    var legacyCol = String(o.eventActivityId || "").trim();
    var eid = String(o.id || "").trim();
    if (!eid && fromFid) eid = fromFid;
    if (!eid && legacyCol && /^(fe|ev)\d+$/i.test(legacyCol)) eid = legacyCol;
    var fid = fromFid || eid;
    if (!fid && eid) fid = eid;
    var name = String(o.eventName || "").trim();
    var ev = {
      id: eid,
      featureId: fid || eid,
      date: String(o.eventDate || "").trim(),
      startTime: String(o.eventStartTime || "").trim(),
      endTime: String(o.eventEndTime || "").trim(),
      isActive: parseBoolCell(o.eventIsActive, true),
      location: String(o.eventLocation || "").trim(),
      eventName: name,
    };
    var sp = parseOptionalBool(o.isFeatured);
    if (sp === undefined) sp = parseOptionalBool(o.isSpecialEvent);
    if (sp !== undefined) ev.isFeatured = sp;
    ev.cardLine1 = String(o.eventCardLine1 || "").trim();
    ev.cardLine2 = String(o.eventCardLine2 || "").trim();
    ev.cardLine3 = String(o.eventCardLine3 || "").trim();
    return ev;
  }

  function activityToRow(act) {
    var rd = act.recurrenceDetails || {};
    var weekdays = Array.isArray(rd.weekdays) ? rd.weekdays.join("|") : "";
    var startTime = rd.startTime != null ? String(rd.startTime) : rd.time != null ? String(rd.time) : "";
    var slotsJson = "";
    if (Array.isArray(rd.slots) && rd.slots.length > 0) {
      try {
        slotsJson = JSON.stringify(rd.slots);
      } catch (e) {
        slotsJson = "";
      }
    }
    var kw = Array.isArray(act.keywords) ? act.keywords.join("|") : "";
    return [
      "activity",
      act.id || "",
      act.activityName || "",
      act.description || "",
      act.location || "",
      act.recurrenceType || "",
      weekdays,
      startTime,
      slotsJson,
      kw,
      act.contactResidentId || "",
      act.chairpersonId || "",
      act.imagePath || "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];
  }

  function featureToRow(ev) {
    var title = ev.eventName != null ? ev.eventName : ev.title != null ? ev.title : "";
    var c1 = ev.cardLine1 != null ? String(ev.cardLine1) : "";
    var c2 = ev.cardLine2 != null ? String(ev.cardLine2) : "";
    var c3 = ev.cardLine3 != null ? String(ev.cardLine3) : "";
    if (ev.times && ev.times.start) {
      return [
        "feature",
        ev.id || "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        ev.featureId || ev.id || "",
        ev.date || "",
        ev.times.start || "",
        ev.times.end != null ? ev.times.end : "",
        ev.isActive === false ? "false" : "true",
        ev.location || "",
        title,
        c1,
        c2,
        c3,
        ev.isFeatured === true ? "true" : ev.isFeatured === false ? "false" : "",
      ];
    }
    return [
      "feature",
      ev.id || "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      ev.featureId || ev.id || "",
      ev.date || "",
      ev.startTime || "",
      ev.endTime || "",
      ev.isActive === false ? "false" : "true",
      ev.location || "",
      title,
      c1,
      c2,
      c3,
      ev.isFeatured === true ? "true" : ev.isFeatured === false ? "false" : "",
    ];
  }

  function buildCsvFromData(data) {
    var lines = [];
    lines.push(rowToCsvLine(CSV_COLUMNS));
    var acts = data.activities || [];
    var feats = data.features || [];
    for (var i = 0; i < acts.length; i++) lines.push(rowToCsvLine(activityToRow(acts[i])));
    for (var j = 0; j < feats.length; j++) lines.push(rowToCsvLine(featureToRow(feats[j])));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
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

  function importFromRows(objectRows) {
    var activities = [];
    var features = [];
    for (var i = 0; i < objectRows.length; i++) {
      var o = objectRows[i];
      var rt = String(o.recordType || "").trim().toLowerCase();
      if (rt === "activity") {
        if (!String(o.id || "").trim()) continue;
        activities.push(rowToActivity(o));
      } else if (rt === "feature" || rt === "event") {
        var impEv = rowToFeature(o);
        if (!String(impEv.id || "").trim()) continue;
        features.push(impEv);
      }
    }
    return { activities: activities, features: features };
  }

  function fetchMasterData(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function setStatus(el, msg, isError) {
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("sidebar-schedule-io-status--error", !!isError);
  }

  function init() {
    var exportBtn = document.getElementById("mmhp-export-schedule-csv");
    var importBtn = document.getElementById("mmhp-import-schedule-csv");
    var fileInput = document.getElementById("mmhp-import-schedule-file");
    var statusEl = document.getElementById("mmhp-schedule-io-status");
    if (!exportBtn || !importBtn || !fileInput) return;

    var jsonUrl = getMasterJsonUrl();
    if (!jsonUrl) {
      setStatus(statusEl, "No data URL on page.", true);
      return;
    }

    var secretUrl = scheduleSecretUrlFromMaster(jsonUrl);

    exportBtn.addEventListener("click", function () {
      ensureScheduleIoUnlocked(secretUrl, statusEl).then(function (ok) {
        if (!ok) return;
        setStatus(statusEl, "Exporting…");
        fetchMasterData(jsonUrl)
          .then(function (data) {
            var csv = buildCsvFromData(data);
            downloadText("mmhp-schedule-" + fileDateStamp() + ".csv", csv, "text/csv;charset=utf-8");
            setStatus(statusEl, "CSV downloaded.");
          })
          .catch(function () {
            setStatus(statusEl, "Could not load JSON for export.", true);
          });
      });
    });

    importBtn.addEventListener("click", function () {
      ensureScheduleIoUnlocked(secretUrl, statusEl).then(function (ok) {
        if (!ok) return;
        fileInput.value = "";
        fileInput.click();
      });
    });

    fileInput.addEventListener("change", function () {
      if (!isScheduleIoUnlocked()) {
        setStatus(statusEl, "Session not unlocked. Use Import CSV again.", true);
        return;
      }
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      setStatus(statusEl, "Reading CSV…");
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var text = String(reader.result || "");
          var table = parseCsv(text);
          if (table.length < 2) throw new Error("CSV has no data rows.");
          var header = table[0].map(function (h) { return String(h || "").trim(); });
          var body = table.slice(1);
          var missing = CSV_COLUMNS.filter(function (c) {
            if (header.indexOf(c) >= 0) return false;
            if (c === "isFeatured" && header.indexOf("isSpecialEvent") >= 0) return false;
            if (c === "featureId" && header.indexOf("eventActivityId") >= 0) return false;
            return true;
          });
          if (missing.length) throw new Error("Missing columns: " + missing.join(", "));
          var objectRows = rowsToObjects(header, body);
          var imported = importFromRows(objectRows);
          fetchMasterData(jsonUrl)
            .then(function (data) {
              data.activities = imported.activities;
              data.features = imported.features;
              var out = JSON.stringify(data, null, 2) + "\n";
              downloadText("mmhp-master-data.json", out, "application/json;charset=utf-8");
              setStatus(
                statusEl,
                "JSON downloaded. Replace assets/data/json/mmhp-master-data.json in the repo, then publish."
              );
            })
            .catch(function () {
              setStatus(statusEl, "Could not load master JSON to merge.", true);
            });
        } catch (err) {
          setStatus(statusEl, err.message || "Import failed.", true);
        }
      };
      reader.onerror = function () {
        setStatus(statusEl, "Could not read file.", true);
      };
      reader.readAsText(f, "UTF-8");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
