/**
 * Featured event landing pages (contents/feature-events/): "Save the date" opens a short help
 * modal, then users download a .ics file (avoids confusion / repeated clicks).
 * Optional body[data-mmhp-feature-id="fe####"] + body[data-mmhp-master-json] loads from JSON features[].
 * Without feature id, uses DOM (.feature-events-title, .feature-events-when time, .feature-events-loc, .feature-events-about).
 */
(function () {
  var DEFAULT_DURATION_MIN = 180;
  var DIALOG_ID = "feature-events-ics-help-dialog";

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function icsEscape(s) {
    return String(s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function icsDtStampUtc() {
    var d = new Date();
    return (
      d.getUTCFullYear() +
      pad2(d.getUTCMonth() + 1) +
      pad2(d.getUTCDate()) +
      "T" +
      pad2(d.getUTCHours()) +
      pad2(d.getUTCMinutes()) +
      pad2(d.getUTCSeconds()) +
      "Z"
    );
  }

  function parseDatetimeAttr(iso) {
    var s = String(iso || "").trim();
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
    if (!m) return null;
    var y = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var d = parseInt(m[3], 10);
    var h = m[4] != null ? parseInt(m[4], 10) : 19;
    var min = m[5] != null ? parseInt(m[5], 10) : 0;
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    return { y: y, m: mo, d: d, h: h, min: min };
  }

  function parseHHMM(t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h: h, min: min };
  }

  function toIcsLocalDT(o) {
    return (
      o.y +
      pad2(o.m) +
      pad2(o.d) +
      "T" +
      pad2(o.h) +
      pad2(o.min) +
      "00"
    );
  }

  function addMinutesLocal(start, addMin) {
    var dt = new Date(start.y, start.m - 1, start.d, start.h, start.min + addMin);
    return {
      y: dt.getFullYear(),
      m: dt.getMonth() + 1,
      d: dt.getDate(),
      h: dt.getHours(),
      min: dt.getMinutes(),
    };
  }

  function foldLine(line) {
    if (line.length <= 75) return line;
    var out = [];
    out.push(line.substring(0, 75));
    var pos = 75;
    while (pos < line.length) {
      out.push(" " + line.substring(pos, pos + 74));
      pos += 74;
    }
    return out.join("\r\n");
  }

  function buildCalendar(lines) {
    return lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function safeFilenamePart(s) {
    return String(s || "")
      .replace(/[^\w\-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 48) || "event";
  }

  function downloadIcs(filename, text) {
    var blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
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

  function textFromEl(sel) {
    var el = document.querySelector(sel);
    return el ? el.innerText.replace(/\s+\n/g, "\n").trim() : "";
  }

  function gatherFromDom() {
    var timeEl = document.querySelector(".feature-events-when time");
    var iso = timeEl ? timeEl.getAttribute("datetime") || "" : "";
    var start = parseDatetimeAttr(iso);
    var title = textFromEl(".feature-events-title") || "McAllen Mobile Park featured event";
    var locBlock = textFromEl(".feature-events-loc");
    var location = locBlock.replace(/^Location\s*\n?/i, "").trim() || "McAllen Mobile Park";
    var desc = textFromEl(".feature-events-about");
    var url = typeof location !== "undefined" && window.location ? window.location.href : "";
    var description = desc + (url ? "\n\n" + url : "");
    return {
      start: start,
      summary: title,
      location: location,
      description: description.trim(),
      uid: "dom-feature-" + safeFilenamePart(title) + "-" + (iso || "nodate"),
    };
  }

  function gatherFromFeature(f) {
    if (!f) return null;
    var dateStr = String(f.date || "").trim();
    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!dm) return null;
    var y = parseInt(dm[1], 10);
    var mo = parseInt(dm[2], 10);
    var d = parseInt(dm[3], 10);
    var st = parseHHMM(f.startTime);
    if (!st) st = { h: 19, min: 0 };
    var start = { y: y, m: mo, d: d, h: st.h, min: st.min };
    var end;
    var et = parseHHMM(f.endTime);
    if (et) {
      end = { y: y, m: mo, d: d, h: et.h, min: et.min };
      var endT = new Date(end.y, end.m - 1, end.d, end.h, end.min);
      var startT = new Date(start.y, start.m - 1, start.d, start.h, start.min);
      if (endT <= startT) end = addMinutesLocal(start, DEFAULT_DURATION_MIN);
    } else {
      end = addMinutesLocal(start, DEFAULT_DURATION_MIN);
    }
    var summary = String(f.eventName || f.cardLine1 || "Featured event").trim();
    var location = [String(f.location || "").trim(), "McAllen Mobile Park · 4900 N Mc Coll Rd, McAllen, TX"]
      .filter(Boolean)
      .join(" · ");
    var desc = String(f.description || "").trim();
    var url = window.location ? window.location.href : "";
    var description = (desc ? desc + "\n\n" : "") + url;
    var uid = String(f.featureId || f.id || summary) + "@mmhp-feature-events";
    return {
      start: start,
      end: end,
      summary: summary,
      location: location,
      description: description.trim(),
      uid: uid,
    };
  }

  function buildIcsPayload(payload) {
    if (!payload || !payload.start) {
      return { error: "Missing or invalid event date and time." };
    }
    var start = payload.start;
    var end = payload.end || addMinutesLocal(start, DEFAULT_DURATION_MIN);
    var dtstart = toIcsLocalDT(start);
    var dtend = toIcsLocalDT(end);
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      "PRODID:-//McAllen Mobile Park//Feature Events//EN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + icsEscape(payload.uid),
      "DTSTAMP:" + icsDtStampUtc(),
      "DTSTART:" + dtstart,
      "DTEND:" + dtend,
      "SUMMARY:" + icsEscape(payload.summary),
      "DESCRIPTION:" + icsEscape(payload.description),
      "LOCATION:" + icsEscape(payload.location),
      "END:VEVENT",
      "END:VCALENDAR",
    ];
    return { text: buildCalendar(lines) };
  }

  function applyFinish(payload) {
    var built = buildIcsPayload(payload);
    if (built.error) throw new Error(built.error);
    var stem = safeFilenamePart(payload.summary);
    var fn = "feature-event-" + stem + "-" + toIcsLocalDT(payload.start).replace(/T/, "-") + ".ics";
    downloadIcs(fn, built.text);
  }

  /**
   * @returns {Promise<void>}
   */
  function performIcsDownload(ribbonBtn, dialogDlBtn) {
    var body = document.body;
    var featureId = (body.getAttribute("data-mmhp-feature-id") || "").trim();
    var jsonUrl = (body.getAttribute("data-mmhp-master-json") || "").trim();

    function setBusy(busy) {
      if (ribbonBtn) ribbonBtn.disabled = busy;
      if (dialogDlBtn) dialogDlBtn.disabled = busy;
    }

    if (featureId && jsonUrl) {
      setBusy(true);
      return fetch(jsonUrl)
        .then(function (r) {
          if (!r.ok) throw new Error("Could not load event data.");
          return r.json();
        })
        .then(function (data) {
          var list = data && data.features ? data.features : [];
          var f = null;
          for (var i = 0; i < list.length; i++) {
            if (list[i].featureId === featureId || list[i].id === featureId) {
              f = list[i];
              break;
            }
          }
          if (f) {
            var p = gatherFromFeature(f);
            if (p) {
              applyFinish(p);
              return;
            }
          }
          applyFinish(gatherFromDom());
        })
        .catch(function () {
          applyFinish(gatherFromDom());
        })
        .finally(function () {
          setBusy(false);
        });
    }

    setBusy(true);
    try {
      applyFinish(gatherFromDom());
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    } finally {
      setBusy(false);
    }
  }

  function ensureIcsHelpStyles() {
    if (document.getElementById("feature-events-ics-help-style")) return;
    var s = document.createElement("style");
    s.id = "feature-events-ics-help-style";
    s.textContent =
      ".feature-events-ics-help-dialog .feature-events-ics-help-intro{margin:0 0 .75rem;font-size:1rem;color:var(--color-text,#2F3A40);line-height:1.45}" +
      ".feature-events-ics-help-dialog ul{margin:0 0 1rem 1.15rem;padding:0;font-size:.95rem;color:var(--color-text-soft,#5F6F77);line-height:1.5}" +
      ".feature-events-ics-help-dialog li{margin-bottom:.5rem}" +
      ".feature-events-ics-help-hint{margin:.75rem 0 0;font-size:.9rem;color:var(--color-text-soft,#5F6F77);font-style:italic;line-height:1.4}" +
      ".feature-events-ics-help-dialog .feature-events-dialog-actions{margin-top:1rem}";
    document.head.appendChild(s);
  }

  function ensureIcsHelpDialog() {
    var existing = document.getElementById(DIALOG_ID);
    if (existing) return existing;

    ensureIcsHelpStyles();

    var dialog = document.createElement("dialog");
    dialog.id = DIALOG_ID;
    dialog.className = "feature-events-dialog feature-events-ics-help-dialog";
    dialog.setAttribute("aria-labelledby", "feature-events-ics-help-title");

    dialog.innerHTML =
      '<div class="feature-events-dialog-panel">' +
      '<h3 id="feature-events-ics-help-title">Add this event to your calendar</h3>' +
      '<p id="feature-events-ics-help-desc" class="feature-events-ics-help-intro">When you continue, your browser will download a small calendar file (it ends in <strong>.ics</strong>). You only need to do this once for this event.</p>' +
      "<ul>" +
      "<li><strong>Phone or tablet:</strong> Open your <strong>Downloads</strong> (or the file bar at the bottom), tap the <strong>.ics</strong> file, then choose <strong>Calendar</strong> or <strong>Add to calendar</strong>.</li>" +
      "<li><strong>Computer:</strong> Open the file from your <strong>Downloads</strong> folder. Your calendar app (Outlook, Apple Calendar, etc.) should offer to add the event.</li>" +
      "<li><strong>Google Calendar on the web:</strong> Use <strong>Settings → Import</strong> and upload the <strong>.ics</strong> file, or open the file on a device that syncs to your Google account.</li>" +
      "</ul>" +
      '<p class="feature-events-ics-help-hint">Nothing pops up? Check your Downloads folder — the file may have saved quietly. You do not need to tap &ldquo;Save the date&rdquo; again unless you lost the file.</p>' +
      '<div class="feature-events-dialog-actions">' +
      '<button type="button" class="feature-events-dialog-cancel" id="feature-events-ics-cancel-btn">Cancel</button>' +
      '<button type="button" class="feature-events-dialog-submit" id="feature-events-ics-download-btn">Download calendar file</button>' +
      "</div>" +
      "</div>";

    document.body.appendChild(dialog);

    var cancelBtn = document.getElementById("feature-events-ics-cancel-btn");
    var downloadBtn = document.getElementById("feature-events-ics-download-btn");

    cancelBtn.addEventListener("click", function () {
      dialog.close();
    });

    downloadBtn.addEventListener("click", function () {
      var ribbonBtn = dialog.__mmhpRibbonBtn;
      performIcsDownload(ribbonBtn, downloadBtn)
        .then(function () {
          dialog.close();
        })
        .catch(function (err) {
          window.alert(err && err.message ? err.message : String(err));
        });
    });

    return dialog;
  }

  function openIcsHelpModal(ribbonBtn) {
    var dlg = ensureIcsHelpDialog();
    dlg.__mmhpRibbonBtn = ribbonBtn;
    dlg.showModal();
    try {
      document.getElementById("feature-events-ics-download-btn").focus();
    } catch (e) {}
  }

  function onSaveRibbonClick(ev) {
    ev.preventDefault();
    openIcsHelpModal(ev.currentTarget);
  }

  function init() {
    var btn = document.getElementById("feature-events-save-calendar");
    if (!btn) return;
    btn.addEventListener("click", onSaveRibbonClick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
