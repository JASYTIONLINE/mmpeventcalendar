/**
 * Master JSON-driven UI: recurring sidebar, featured cards, exports, and path-aware deep links.
 *
 * Why one large module: Every page that embeds the calendar shell needs the same fetch/parse/render
 * pipeline without duplicating URL math for assets (root vs contents/ vs activity-flyer/). Keeping
 * schedule rendering beside export and featured-card code ensures filters such as isActive stay
 * aligned—students can grep one file to see how JSON fields become DOM.
 *
 * How it works: The loader reads body[data-mmhp-master-json], normalizes activities into weekday
 * buckets from recurrenceDetails, skips isActive:false rows, and filters seasonal activities by
 * activeFrom/activeTo (local date, MM-DD wrap) for display and exports. Optional recurrenceDetails.weekOfMonth
 * (1–5) marks an nth-weekday-of-month pattern (e.g. third Sunday) for sidebar labels and exports. Featured
 * regions sort dated features, hydrate cards with images from assets/images/, and adjust hrefs
 * based on location.pathname so the same script runs on index.html and nested flyer paths.
 * Recurring exports (TXT/CSV) use one row per activity: comma-separated weekday abbreviations
 * (e.g. mon,wed,thur), time, season start/end from activeFrom/activeTo (two columns), and location.
 */
(function () {
  var WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  /** 1 → "1st" … 5 → "5th" for nth occurrence of a weekday in a month. */
  function ordinalWeekOfMonth(n) {
    var k = parseInt(n, 10);
    if (!isFinite(k) || k < 1 || k > 5) return "";
    if (k === 1) return "1st";
    if (k === 2) return "2nd";
    if (k === 3) return "3rd";
    if (k === 4) return "4th";
    return "5th";
  }

  /** Parse recurrenceDetails.weekOfMonth (1–5); null if absent or invalid. */
  function monthWeekFromRecurrenceDetails(rd) {
    if (!rd || rd.weekOfMonth == null) return null;
    var n = parseInt(rd.weekOfMonth, 10);
    if (!isFinite(n) || n < 1 || n > 5) return null;
    return n;
  }

  /** Three-letter weekday label for sidebar monthly hint. */
  function weekdayShortLabel(weekday) {
    var w = String(weekday || "").trim();
    if (!w) return "";
    return w.length <= 3 ? w : w.slice(0, 3);
  }

  var FALLBACK_IMAGES = ["rec-hall.png", "dinner.png", "park-banner.png"];

  /** Activity id → flyer file under contents/activity-flyer/ (see repo for HTML names). */
  var ACTIVITY_FLYER_FILENAMES = {
    ac0003: "bingo.html",
    ac0004: "pool-8-ball.html",
    ac0006: "arts-and-crafts.html",
    ac0008: "book-club.html",
    ac0010: "bible-study.html",
    ac0011: "vespers.html",
    ac0016: "kitchen-inventory.html",
    ac0023: "martial-arts-training.html",
    ac0024: "horsecollar.html",
    ac0025: "mexican-train-wide.html",
    ac0026: "card-bingo-wide.html",
    ac0027: "swedish-weaving.html",
    ac0036: "stitch-and-bitch.html",
    ac0028: "exercise.html",
    ac0029: "icecream-winter.html",
    ac0030: "icecream-summer.html",
    ac0031: "wood-carving-with-steve.html",
    ac0032: "petanque.html",
    ac0033: "stained-glass-class.html",
    ac0034: "hand-and-foot.html",
    ac0035: "computer-class.html",
    ac0037: "bylaws-committee.html",
    ac0038: "meeting-summer.html",
    ac0039: "meeting-winter.html",
    ac0040: "sewing-circle.html",
    ac0041: "whist.html",
    ac0042: "watercolor-painting.html",
    ac0043: "crafting-workshop-linda.html",
    ac0044: "line-dancing.html",
    ac0045: "garden-flag-painting.html",
  };

  /** Relative href to the activity flyer for the current page path. */
  function activityFlyerPageHref(activityId) {
    var fn = ACTIVITY_FLYER_FILENAMES[activityId];
    if (!fn) return "";
    var path = (window.location.pathname || "").replace(/\\/g, "/");
    if (/\/contents\/activity-flyer\//i.test(path)) {
      return fn;
    }
    if (/\/contents\//i.test(path)) {
      return "activity-flyer/" + fn;
    }
    return "contents/activity-flyer/" + fn;
  }

  function mondayFirstIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function parseISODateLocal(ymd) {
    var p = (ymd || "").trim().split("-");
    if (p.length !== 3) return null;
    var y = parseInt(p[0], 10);
    var mo = parseInt(p[1], 10) - 1;
    var d = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(mo) || isNaN(d)) return null;
    return new Date(y, mo, d);
  }

  function startOfTodayLocal() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  /** Calendar add for local date-only values (no time-of-day drift). */
  function addDaysLocal(dayStart, deltaDays) {
    var d = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate());
    d.setDate(d.getDate() + deltaDays);
    return d;
  }

  function parseTimeToMinutes(t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec((t || "00:00").trim());
    if (!m) return 0;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  function formatSlotTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec((hhmm || "0:00").trim());
    if (!m) return "";
    var h = parseInt(m[1], 10);
    var min = parseInt(m[2], 10);
    var ap = h >= 12 ? "pm" : "am";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    if (min === 0) return h12 + ap;
    return h12 + ":" + (min < 10 ? "0" : "") + min + ap;
  }

  function formatExportDate(ymd) {
    var dt = parseISODateLocal(ymd);
    if (!dt) return String(ymd || "").trim();
    return dt
      .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
      .replace(/,/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function featuredEventExportName(ev) {
    return String(ev.eventName || ev.title || ev.cardLine1 || ev.featureId || ev.id || "Featured event").trim();
  }

  function featuredEventTimeRange(ev) {
    var start = formatSlotTime(ev.startTime || "");
    var endLabel = ev.endTimeLabel != null ? String(ev.endTimeLabel).trim() : "";
    var end = formatSlotTime(ev.endTime || "");
    if (start && endLabel) return start + " \u2013 " + endLabel;
    if (start && end) return start + " - " + end;
    return start || end || "Time TBA";
  }

  function featuredEventExportLine(ev) {
    var date = formatExportDate(ev.date);
    var time = featuredEventTimeRange(ev);
    return featuredEventExportName(ev) + " | " + date + " | " + time;
  }

  function sortedFeaturedEvents(data) {
    var rows = (data.features || []).slice();
    rows.sort(function (a, b) {
      var da = parseISODateLocal(a.date);
      var db = parseISODateLocal(b.date);
      var ams = da ? da.getTime() : 0;
      var bms = db ? db.getTime() : 0;
      if (ams !== bms) return ams - bms;
      return parseTimeToMinutes(a.startTime || "00:00") - parseTimeToMinutes(b.startTime || "00:00");
    });
    return rows;
  }

  function featuredEventsExportText(data) {
    var rows = sortedFeaturedEvents(data);
    var lines = ["McAllen Mobile Park Featured Events", "Event name | Date | Time", ""];
    for (var i = 0; i < rows.length; i++) {
      lines.push(featuredEventExportLine(rows[i]));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function featuredEventsExportCsv(data) {
    var rows = sortedFeaturedEvents(data);
    var lines = [["Event Name", "Date", "Time"].map(csvCell).join(",")];
    for (var i = 0; i < rows.length; i++) {
      var ev = rows[i];
      var time = featuredEventTimeRange(ev);
      lines.push([featuredEventExportName(ev), formatExportDate(ev.date), time].map(csvCell).join(","));
    }
    return lines.join("\r\n") + "\r\n";
  }

  function downloadTextFile(filename, text, mimeType) {
    var blob = new Blob([text], { type: mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function ensureActivitiesExportScopeDialog() {
    var existing = document.getElementById("mmhp-activities-export-scope-dialog");
    if (existing) return existing;

    var dialog = document.createElement("dialog");
    dialog.id = "mmhp-activities-export-scope-dialog";
    dialog.className = "mmhp-export-format-dialog";
    dialog.innerHTML =
      '<div class="mmhp-export-format-panel">' +
      '<h3 id="mmhp-activities-export-scope-title">Export recurring activities</h3>' +
      '<p id="mmhp-activities-export-scope-desc">Choose which rows from the master list to include. <strong>Active only</strong> matches the sidebar for today\'s date (active and in-season). <strong>All activities</strong> includes inactive and off-season recurring rows too.</p>' +
      '<div class="mmhp-export-format-actions">' +
      '<button type="button" class="btn site-button" data-mmhp-export-scope="active">Active only</button>' +
      '<button type="button" class="btn site-button" data-mmhp-export-scope="all">All activities</button>' +
      '<button type="button" class="btn site-button mmhp-export-format-cancel" data-mmhp-export-scope="cancel">Cancel</button>' +
      "</div>" +
      "</div>";
    dialog.setAttribute("aria-labelledby", "mmhp-activities-export-scope-title");
    dialog.setAttribute("aria-describedby", "mmhp-activities-export-scope-desc");
    document.body.appendChild(dialog);
    return dialog;
  }

  function openActivitiesExportScopeDialog(onChooseScope) {
    var dialog = ensureActivitiesExportScopeDialog();
    function onClick(event) {
      var btn = event.target.closest ? event.target.closest("[data-mmhp-export-scope]") : null;
      if (!btn) return;
      var scope = btn.getAttribute("data-mmhp-export-scope");
      dialog.removeEventListener("click", onClick);
      dialog.close();
      if (scope === "active" || scope === "all") onChooseScope(scope);
    }
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", function cleanup() {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", cleanup);
    });
    dialog.showModal();
  }

  function ensureExportFormatDialog() {
    var existing = document.getElementById("mmhp-export-format-dialog");
    if (existing) return existing;

    var dialog = document.createElement("dialog");
    dialog.id = "mmhp-export-format-dialog";
    dialog.className = "mmhp-export-format-dialog";
    dialog.innerHTML =
      '<div class="mmhp-export-format-panel">' +
      '<h3 id="mmhp-export-format-title">Choose export format</h3>' +
      '<p id="mmhp-export-format-desc">Download this export as a plain text file or a CSV for Excel and Google Sheets.</p>' +
      '<div class="mmhp-export-format-actions">' +
      '<button type="button" class="btn site-button" data-mmhp-export-format="txt">Text file</button>' +
      '<button type="button" class="btn site-button" data-mmhp-export-format="csv">CSV file</button>' +
      '<button type="button" class="btn site-button mmhp-export-format-cancel" data-mmhp-export-format="cancel">Cancel</button>' +
      '</div>' +
      '</div>';
    dialog.setAttribute("aria-labelledby", "mmhp-export-format-title");
    dialog.setAttribute("aria-describedby", "mmhp-export-format-desc");
    document.body.appendChild(dialog);
    return dialog;
  }

  function openExportFormatDialog(exporter) {
    var dialog = ensureExportFormatDialog();
    function onClick(event) {
      var btn = event.target.closest ? event.target.closest("[data-mmhp-export-format]") : null;
      if (!btn) return;
      var format = btn.getAttribute("data-mmhp-export-format");
      dialog.removeEventListener("click", onClick);
      dialog.close();
      if (format === "txt" || format === "csv") exporter(format);
    }
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", function cleanup() {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", cleanup);
    });
    dialog.showModal();
  }

  function bindFeaturedExportButton(button, data) {
    if (!button || !data) return;
    button.disabled = false;
    button.addEventListener("click", function () {
      openExportFormatDialog(function (format) {
        if (format === "csv") {
          downloadTextFile("mmhp-featured-events.csv", featuredEventsExportCsv(data), "text/csv;charset=utf-8");
          return;
        }
        downloadTextFile("mmhp-featured-events.txt", featuredEventsExportText(data), "text/plain;charset=utf-8");
      });
    });
  }

  /** Full weekday name → mon…sun for compact exports. */
  function weekdayToExportAbbrev(weekdayFull) {
    var w = String(weekdayFull || "").trim();
    var idx = WEEKDAYS.indexOf(w);
    if (idx < 0) {
      if (!w) return "";
      var low = w.toLowerCase();
      return low.length >= 3 ? low.slice(0, 3) : low;
    }
    return ["mon", "tue", "wed", "thur", "fri", "sat", "sun"][idx];
  }

  function sortExportDayAbbrevs(abbrevs) {
    var order = { mon: 0, tue: 1, wed: 2, thur: 3, fri: 4, sat: 5, sun: 6 };
    return abbrevs.slice().sort(function (a, b) {
      var oa = order[a];
      var ob = order[b];
      oa = oa !== undefined ? oa : 99;
      ob = ob !== undefined ? ob : 99;
      return oa - ob;
    });
  }

  /**
   * One row per activity: comma-separated days (e.g. mon,wed,thu), single time when shared.
   * Nth weekday of month: "4th mon" prefix when recurrenceDetails.weekOfMonth is set.
   */
  function activityExportDaysAndTime(act) {
    var rd = (act && act.recurrenceDetails) || {};
    var monthWeekN = monthWeekFromRecurrenceDetails(rd);

    if (Array.isArray(rd.slots) && rd.slots.length > 0) {
      var timeToDays = {};
      for (var si = 0; si < rd.slots.length; si++) {
        var slot = rd.slots[si] || {};
        var wds = String(slot.weekday || slot.day || "").trim();
        var stS = String(slot.startTime || slot.time || "").trim();
        var ab = weekdayToExportAbbrev(wds);
        var key = stS || "_";
        if (!timeToDays[key]) timeToDays[key] = [];
        if (ab) timeToDays[key].push(ab);
      }
      var keys = Object.keys(timeToDays);
      if (keys.length === 0) {
        return { days: "—", time: "Time TBA" };
      }
      var allAb = [];
      for (var ki = 0; ki < keys.length; ki++) {
        allAb = allAb.concat(timeToDays[keys[ki]]);
      }
      var daysCol = sortExportDayAbbrevs(allAb).join(",");
      if (keys.length === 1) {
        var k0 = keys[0];
        var t0 = k0 === "_" ? "" : k0;
        return {
          days: daysCol || "—",
          time: formatSlotTime(t0) || "Time TBA",
        };
      }
      var timeParts = [];
      for (var kx = 0; kx < keys.length; kx++) {
        var kk = keys[kx];
        var dlist = sortExportDayAbbrevs(timeToDays[kk]).join(",");
        var tshow = formatSlotTime(kk === "_" ? "" : kk) || "Time TBA";
        timeParts.push(dlist + " " + tshow);
      }
      return { days: daysCol || "—", time: timeParts.join("; ") };
    }

    var days = rd.weekdays || rd.daysOfWeek || [];
    var stOne = String(rd.startTime || rd.time || "").trim();
    var abb = [];
    if (Array.isArray(days) && days.length > 0) {
      for (var dj = 0; dj < days.length; dj++) {
        var ax = weekdayToExportAbbrev(String(days[dj] || "").trim());
        if (ax) abb.push(ax);
      }
      abb = sortExportDayAbbrevs(abb);
      if (monthWeekN != null) {
        var ord = ordinalWeekOfMonth(monthWeekN);
        var dayStr = ord && abb.length ? ord + " " + abb.join(",") : abb.join(",");
        return {
          days: dayStr || "—",
          time: formatSlotTime(stOne) || "Time TBA",
        };
      }
      return {
        days: abb.join(",") || "—",
        time: formatSlotTime(stOne) || "Time TBA",
      };
    }

    return { days: "—", time: formatSlotTime(stOne) || "Time TBA" };
  }

  /** Season start and end as separate export cells (annual MM-DD window). */
  function activityExportSeasonStart(act) {
    if (!act) return "—";
    if (isYearRoundActivity(act)) return "Year-round";
    var fromL = mmDdToMonthDayLabel(act.activeFrom);
    return fromL || "—";
  }

  function activityExportSeasonEnd(act) {
    if (!act) return "—";
    if (isYearRoundActivity(act)) return "Year-round";
    var toL = mmDdToMonthDayLabel(act.activeTo);
    return toL || "—";
  }

  function sortedActivities(data) {
    var rows = (data.activities || []).slice();
    rows.sort(function (a, b) {
      var an = String(a.activityName || a.description || "").trim().toLowerCase();
      var bn = String(b.activityName || b.description || "").trim().toLowerCase();
      return an < bn ? -1 : an > bn ? 1 : 0;
    });
    return rows;
  }

  /** scope: "active" = sidebar rules; "all" = every recurring row in master JSON. */
  function activityRowShouldExport(act, scope) {
    if (!isRecurringActivity(act)) return false;
    if (scope === "all") return true;
    if (act.isActive === false) return false;
    if (!activityPassesSeasonFilter(act)) return false;
    return true;
  }

  function activitiesExportText(data, scope) {
    var rows = sortedActivities(data);
    var headerNote =
      scope === "all"
        ? "All recurring activities in master data (includes inactive and off-season)."
        : "Active for today's date — matches the recurring sidebar.";
    var lines = [
      "McAllen Mobile Park Activities",
      headerNote,
      "Activity name | Days | Time | Season start | Season end | Hall/location",
      "",
    ];
    for (var i = 0; i < rows.length; i++) {
      if (!activityRowShouldExport(rows[i], scope)) continue;
      var act = rows[i];
      var dt = activityExportDaysAndTime(act);
      var name = String(act.activityName || act.description || act.id || "Activity").trim();
      var location = String(act.location || "").trim() || "Location TBA";
      var seasonStart = activityExportSeasonStart(act);
      var seasonEnd = activityExportSeasonEnd(act);
      lines.push(
        name +
          " | " +
          dt.days +
          " | " +
          dt.time +
          " | " +
          seasonStart +
          " | " +
          seasonEnd +
          " | " +
          location
      );
    }
    return lines.join("\r\n") + "\r\n";
  }

  function activitiesExportCsv(data, scope) {
    var rows = sortedActivities(data);
    var lines = [
      [
        "Activity Name",
        "Days",
        "Time",
        "Season start",
        "Season end",
        "Hall/Location",
        "Active",
      ]
        .map(csvCell)
        .join(","),
    ];
    for (var i = 0; i < rows.length; i++) {
      if (!activityRowShouldExport(rows[i], scope)) continue;
      var act = rows[i];
      var dt = activityExportDaysAndTime(act);
      var name = String(act.activityName || act.description || act.id || "Activity").trim();
      var seasonStart = activityExportSeasonStart(act);
      var seasonEnd = activityExportSeasonEnd(act);
      var location = String(act.location || "").trim() || "Location TBA";
      var active = act.isActive === false ? "false" : "true";
      lines.push(
        [name, dt.days, dt.time, seasonStart, seasonEnd, location, active]
          .map(csvCell)
          .join(",")
      );
    }
    return lines.join("\r\n") + "\r\n";
  }

  function bindActivitiesExportButton(button, data) {
    if (!button || !data) return;
    button.disabled = false;
    button.addEventListener("click", function () {
      openActivitiesExportScopeDialog(function (scope) {
        openExportFormatDialog(function (format) {
          var base = scope === "all" ? "mmhp-activities-all" : "mmhp-activities-active";
          if (format === "csv") {
            downloadTextFile(base + ".csv", activitiesExportCsv(data, scope), "text/csv;charset=utf-8");
            return;
          }
          downloadTextFile(base + ".txt", activitiesExportText(data, scope), "text/plain;charset=utf-8");
        });
      });
    });
  }

  /** Left sidebar slot: line 1 = event name, line 2 = time + location. */
  function sidebarSlotTitleAndMeta(name, hhmm, location) {
    var n = String(name || "").trim();
    var t = formatSlotTime(hhmm);
    var loc = String(location || "").trim();
    var meta = [t, loc].filter(Boolean).join(" ");
    return { title: n || "—", meta: meta };
  }

  function appendSidebarScheduleSlot(li, slot) {
    var href =
      slot.activityId != null && String(slot.activityId).trim()
        ? activityFlyerPageHref(String(slot.activityId).trim())
        : "";
    var titleEl;
    if (href) {
      titleEl = document.createElement("a");
      titleEl.href = href;
      titleEl.className =
        "sidebar-schedule-line__title sidebar-schedule-line__title--link";
      titleEl.setAttribute(
        "aria-label",
        slot.title + " — open activity flyer"
      );
    } else {
      titleEl = document.createElement("span");
      titleEl.className = "sidebar-schedule-line__title";
    }
    titleEl.textContent = slot.title;
    li.appendChild(titleEl);
    if (slot.meta) {
      var metaEl = document.createElement("span");
      metaEl.className = "sidebar-schedule-line__meta";
      metaEl.textContent = slot.meta;
      li.appendChild(metaEl);
    }
    var lineLabel = slot.meta ? slot.title + ", " + slot.meta : slot.title;
    li.setAttribute("aria-label", lineLabel);
  }

  function eventLocation(ev, act) {
    if (ev && ev.location != null && String(ev.location).trim()) return String(ev.location).trim();
    if (act && act.location != null) return String(act.location).trim();
    return "";
  }

  function formatDisplayDate(dt) {
    if (!dt) return "";
    return dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /**
   * Card line 3 fallback: weekday (short), 2-digit day, short month, 2-digit year — e.g. Wed 08 Apr 26
   */
  function formatFeaturedCardLine3(dt) {
    if (!dt) return "";
    try {
      var fmt = new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "2-digit",
      });
      var parts = fmt.formatToParts(dt);
      var byType = {};
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.type !== "literal") byType[p.type] = p.value;
      }
      var w = byType.weekday || "";
      var d = byType.day || "";
      var m = byType.month || "";
      var y = byType.year || "";
      return [w, d, m, y].join(" ").replace(/\s+/g, " ").trim();
    } catch (e) {
      return "";
    }
  }

  /**
   * Split event title into line1 (card line 1 / short description) and line2 (what the act is).
   * Heuristic: 4+ words → first two words | remainder; 3 words → first | last two; etc.
   */
  function splitEventTitleForCard(name, activityName) {
    var words = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    var fallback = String(activityName || "").trim();
    if (words.length === 0) return ["Event", fallback || "—"];
    if (words.length === 1) return [words[0], fallback || "—"];
    if (words.length === 2) return [words[0], words[1]];
    if (words.length === 3) return [words[0], words[1] + " " + words[2]];
    return [words[0] + " " + words[1], words.slice(2).join(" ")];
  }

  /** Max lengths for card lines (matches submit form field limits on Submit page). */
  var CARD_LINE_MAX = { 1: 48, 2: 48, 3: 32 };

  function clampCardLineDisplay(str, maxLen) {
    var s = String(str || "").trim();
    if (!maxLen || s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "\u2026";
  }

  /** Line 1–3 for featured cards: prefer ev.cardLine1/2/3; else derive from title + date. */
  function getFeaturedCardLines(ev, act, dt) {
    var name = eventTitle(ev) || "Event";
    var actHint = act && act.activityName ? String(act.activityName).trim() : "";
    if (!actHint && ev && ev.cardLine2 != null) actHint = String(ev.cardLine2).trim();
    if (!actHint) actHint = activityHintFromListingTitle(name);
    var pair = splitEventTitleForCard(name, actHint);
    var c1 = ev.cardLine1 != null ? String(ev.cardLine1).trim() : "";
    var c2 = ev.cardLine2 != null ? String(ev.cardLine2).trim() : "";
    var c3 = "";
    if (dt) {
      c3 = formatFeaturedCardLine3(dt);
    }
    if (!c3 && ev.cardLine3 != null) {
      c3 = String(ev.cardLine3).trim();
    }
    if (!c1) c1 = pair[0];
    if (!c2) c2 = actHint || pair[1];
    return [
      clampCardLineDisplay(c1, CARD_LINE_MAX[1]),
      clampCardLineDisplay(c2, CARD_LINE_MAX[2]),
      clampCardLineDisplay(c3, CARD_LINE_MAX[3]),
    ];
  }

  function createFeaturedCaptionElement(ev, act, dt) {
    var cap = document.createElement("div");
    cap.className = "featured-card-caption";
    var lines = getFeaturedCardLines(ev, act, dt);
    var l1 = document.createElement("div");
    l1.className = "featured-card-line featured-card-line--name";
    l1.textContent = lines[0];
    var l2 = document.createElement("div");
    l2.className = "featured-card-line featured-card-line--detail";
    l2.textContent = lines[1];
    var l3 = document.createElement("div");
    l3.className = "featured-card-line featured-card-line--date";
    l3.textContent = lines[2];
    cap.appendChild(l1);
    cap.appendChild(l2);
    cap.appendChild(l3);
    return cap;
  }

  function featuredCardAltText(ev, act, dt) {
    return getFeaturedCardLines(ev, act, dt).join("; ");
  }

  var LISTING_TITLE_SEP = " — ";

  function activityHintFromListingTitle(listingTitle) {
    var t = String(listingTitle || "").trim();
    var idx = t.lastIndexOf(LISTING_TITLE_SEP);
    if (idx === -1) return "";
    return t.slice(idx + LISTING_TITLE_SEP.length).trim();
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** Validate master-data MM-DD; returns canonical MM-DD or null. */
  function parseMmDdToken(s) {
    var m = /^(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    if (!m) return null;
    var mo = parseInt(m[1], 10);
    var da = parseInt(m[2], 10);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return m[1] + "-" + m[2];
  }

  function refDateMmDd(refDate) {
    var d = refDate || startOfTodayLocal();
    return pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  /**
   * Year-round / no season filter: isSeasonal false, or missing isSeasonal with Jan–Dec
   * or missing dates (legacy rows).
   */
  function isYearRoundActivity(act) {
    if (!act) return true;
    if (act.isSeasonal === false) return true;
    if (act.isSeasonal === true) return false;
    var af = String(act.activeFrom || "").trim();
    var at = String(act.activeTo || "").trim();
    if (!af || !at) return true;
    return af === "01-01" && at === "12-31";
  }

  /** Inclusive MM-DD window; if start > end (e.g. 10-01..04-15), season wraps across year boundary. */
  function mmDdInSeasonWindow(todayMmdd, startMmdd, endMmdd) {
    if (startMmdd <= endMmdd) {
      return todayMmdd >= startMmdd && todayMmdd <= endMmdd;
    }
    return todayMmdd >= startMmdd || todayMmdd <= endMmdd;
  }

  /**
   * true = show in sidebar / exports for refDate (default: viewer's local today).
   * isActive === false is handled separately upstream.
   */
  function activityPassesSeasonFilter(act, refDate) {
    if (isYearRoundActivity(act)) return true;
    var start = parseMmDdToken(act.activeFrom);
    var end = parseMmDdToken(act.activeTo);
    if (!start || !end) return false;
    return mmDdInSeasonWindow(refDateMmDd(refDate), start, end);
  }

  function isRecurringActivity(act) {
    return act && String(act.recurrenceType || "").trim() === "Recurring";
  }

  function getMasterJsonUrl() {
    var u = document.body.getAttribute("data-mmhp-master-json");
    if (u) return u;
    var aside = document.querySelector("aside.site-sidebar-left[data-mmhp-master-json]");
    return aside ? aside.getAttribute("data-mmhp-master-json") : null;
  }

  /**
   * Image base dir matching data-mmhp-master-json depth (e.g. contents/ → ../,
   * contents/activity-flyer/ → ../../).
   */
  function assetsImagesDir(jsonUrl) {
    if (!jsonUrl) return "assets/images";
    var u = String(jsonUrl).trim();
    var depth = 0;
    while (u.indexOf("../") === 0) {
      depth++;
      u = u.slice(3);
    }
    if (depth === 0) return "assets/images";
    return new Array(depth + 1).join("../") + "assets/images";
  }

  function isActivityFlyerPagePath(path) {
    return /contents[/\\]activity-flyer[/\\]/i.test(path || "");
  }

  function learnMoreHref() {
    var path = (window.location.pathname || "").replace(/\\/g, "/");
    if (/contents[/\\]/i.test(path)) {
      return isActivityFlyerPagePath(path) ? "../learn-more.html" : "learn-more.html";
    }
    return "contents/learn-more.html";
  }

  function contactHref() {
    var path = (window.location.pathname || "").replace(/\\/g, "/");
    if (/contents[/\\]/i.test(path)) {
      return isActivityFlyerPagePath(path) ? "../contact.html" : "contact.html";
    }
    return "contents/contact.html";
  }

  function submitHref() {
    var path = (window.location.pathname || "").replace(/\\/g, "/");
    if (/contents[/\\]/i.test(path)) {
      return isActivityFlyerPagePath(path) ? "../contact.html?type=event" : "contact.html?type=event";
    }
    return "contents/contact.html?type=event";
  }

  function padHourMinForFilename(h) {
    return h < 10 ? "0" + h : String(h);
  }

  /** HH:MM from feature → HHmm for filenames (e.g. 19:00 → 1900). */
  function fileHmFromStartTime(startTime) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(startTime || "19:00").trim());
    if (!m) return "1900";
    var h = parseInt(m[1], 10);
    return padHourMinForFilename(h) + m[2];
  }

  /** Basename of imagePath without extension, or feature id fallback. */
  function featureImageStem(ev) {
    var raw = ev && ev.imagePath != null ? String(ev.imagePath).trim() : "";
    if (!raw) {
      var fid = ev && ev.featureId ? String(ev.featureId).trim() : "";
      return fid.replace(/[^\w-]+/g, "-") || "event";
    }
    var base = raw.split(/[/\\]/).pop() || "";
    var stem = base.replace(/\.(png|jpe?g|gif|webp)$/i, "");
    return stem || "event";
  }

  /** Static page basename: YYYY-MM-DD-HHmm-stem.html (must match scripts/build-feature-event-pages.mjs). */
  function featureEventPageBasename(ev) {
    if (!ev) return "";
    var date = String(ev.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
    return date + "-" + fileHmFromStartTime(ev.startTime) + "-" + featureImageStem(ev) + ".html";
  }

  /** Link to generated contents/feature-events/<basename>. */
  function featureEventDetailHref(ev) {
    var detailPath = ev && ev.detailPath != null ? String(ev.detailPath).trim().replace(/\\/g, "/").replace(/^\/+/, "") : "";
    var base = detailPath || featureEventPageBasename(ev);
    if (!base) return learnMoreHref();
    var path = (window.location.pathname || "").replace(/\\/g, "/");
    var inFeatureEvents = /feature-events[/\\]/i.test(path);
    var inContents = /contents[/\\]/i.test(path);
    var isFullDetailPath = /^contents\/feature-events\//i.test(base);
    var fileOnly = base.split("/").pop() || base;
    if (inFeatureEvents) return fileOnly;
    if (isActivityFlyerPagePath(path)) return isFullDetailPath ? "../" + base.replace(/^contents\//i, "") : "../feature-events/" + base;
    if (inContents) return isFullDetailPath ? base.replace(/^contents\//i, "") : "feature-events/" + base;
    return isFullDetailPath ? base : "contents/feature-events/" + base;
  }

  function openImagePreview(src, altText) {
    if (!src) return;
    var backdrop = document.createElement("div");
    backdrop.className = "mmhp-image-preview-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Image preview");

    var inner = document.createElement("div");
    inner.className = "mmhp-image-preview-inner";

    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "mmhp-image-preview-close";
    btnClose.textContent = "\u00D7";
    btnClose.setAttribute("aria-label", "Close preview");

    var imgEl = document.createElement("img");
    imgEl.src = src;
    imgEl.alt = altText || "";
    imgEl.className = "mmhp-image-preview-img";

    function onKey(e) {
      if (e.key === "Escape") close();
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    btnClose.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    inner.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    document.addEventListener("keydown", onKey);

    inner.appendChild(btnClose);
    inner.appendChild(imgEl);
    backdrop.appendChild(inner);
    document.body.appendChild(backdrop);
    try {
      btnClose.focus();
    } catch (f) {}
  }

  /**
   * Activity flyer landing pages: same lightbox UX as featured events, but image is sized to 80vw
   * wide with height auto (typical 1920×1080 assets).
   */
  function openActivityLandingImagePreview(src, altText) {
    if (!src) return;
    var backdrop = document.createElement("div");
    backdrop.className = "mmhp-image-preview-backdrop mmhp-image-preview-backdrop--activity";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Flyer preview");

    var inner = document.createElement("div");
    inner.className = "mmhp-image-preview-inner";

    var btnClose = document.createElement("button");
    btnClose.type = "button";
    btnClose.className = "mmhp-image-preview-close";
    btnClose.textContent = "\u00D7";
    btnClose.setAttribute("aria-label", "Close preview");

    var imgEl = document.createElement("img");
    imgEl.src = src;
    imgEl.alt = altText || "";
    imgEl.className = "mmhp-image-preview-img";

    function onKey(e) {
      if (e.key === "Escape") close();
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    btnClose.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });
    inner.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    document.addEventListener("keydown", onKey);

    inner.appendChild(btnClose);
    inner.appendChild(imgEl);
    backdrop.appendChild(inner);
    document.body.appendChild(backdrop);
    try {
      btnClose.focus();
    } catch (f) {}
  }

  function wireActivityFlyerImagePreview() {
    if (!document.body || !document.body.classList.contains("page-activity-flyer")) return;
    var img = document.querySelector(".page-activity-flyer-feature-frame img");
    if (!img || img.getAttribute("data-mmhp-activity-flyer-preview-wired") === "1") return;
    img.setAttribute("data-mmhp-activity-flyer-preview-wired", "1");
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.setAttribute("aria-label", "Enlarge flyer image");
    img.style.cursor = "zoom-in";

    function openFromImg() {
      var src = img.currentSrc || img.src;
      if (!src) return;
      openActivityLandingImagePreview(src, img.alt || "");
    }

    img.addEventListener("click", function (e) {
      e.preventDefault();
      openFromImg();
    });
    img.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromImg();
      }
    });
  }

  var MONTH_NAMES_EN = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  /** MM-DD from master JSON → "Month D" for display (repeats annually). */
  function mmDdToMonthDayLabel(mmdd) {
    var m = /^(\d{2})-(\d{2})$/.exec(String(mmdd || "").trim());
    if (!m) return "";
    var mo = parseInt(m[1], 10) - 1;
    var d = parseInt(m[2], 10);
    if (isNaN(mo) || isNaN(d) || mo < 0 || mo > 11 || d < 1 || d > 31) return "";
    return MONTH_NAMES_EN[mo] + " " + d;
  }

  function formatActivitySeasonRangeForFlyer(act) {
    if (!act) return "";
    if (act.isSeasonal !== true) {
      return "Runs year-round on the calendar (not limited to a season).";
    }
    var fromL = mmDdToMonthDayLabel(act.activeFrom);
    var toL = mmDdToMonthDayLabel(act.activeTo);
    if (!fromL || !toL) {
      return "Seasonal activity—see the main calendar for active dates.";
    }
    return "Season runs " + fromL + " through " + toL + " each year.";
  }

  /** True when this document is an activity flyer with a schedule block we can hydrate. */
  function isActivityFlyerSchedulePage() {
    return !!(
      document.body &&
      document.body.classList.contains("page-activity-flyer") &&
      document.querySelector("main[data-mmhp-activity-id]") &&
      document.querySelector(".page-activity-flyer-schedule")
    );
  }

  function wireActivityFlyerSeasonRange(data) {
    if (!document.body || !document.body.classList.contains("page-activity-flyer")) return;
    var main = document.querySelector("main[data-mmhp-activity-id]");
    if (!main) return;
    var schedule = main.querySelector(".page-activity-flyer-schedule");
    if (!schedule) return;
    var activityId = String(main.getAttribute("data-mmhp-activity-id") || "").trim();
    var el = schedule.querySelector("[data-mmhp-activity-season]");
    if (!el) {
      el = document.createElement("p");
      el.className = "page-activity-flyer-season-range";
      el.setAttribute("data-mmhp-activity-season", "");
      el.setAttribute("aria-live", "polite");
      var h2sched = schedule.querySelector("h2");
      if (h2sched) {
        h2sched.insertAdjacentElement("afterend", el);
      } else {
        schedule.insertBefore(el, schedule.firstChild);
      }
    }
    if (!activityId) {
      el.textContent =
        "Set data-mmhp-activity-id on main to show season from calendar data.";
      return;
    }
    if (!data || !data.activities || !data.activities.length) {
      el.textContent =
        "Could not load calendar data—check the main schedule for season.";
      return;
    }
    var act = null;
    for (var i = 0; i < data.activities.length; i++) {
      if (String(data.activities[i].id || "").trim() === activityId) {
        act = data.activities[i];
        break;
      }
    }
    if (!act) {
      el.textContent = "Season not found in calendar data—see the main schedule.";
      return;
    }
    el.textContent = formatActivitySeasonRangeForFlyer(act);
  }

  var MAX_FEATURED_CARDS = 2;

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, ms);
    };
  }

  function nowMinutesLocal() {
    var n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  }

  /** True if the event is still upcoming in local time (date and start time). */
  function isFeaturedItemUpcoming(item) {
    if (!item || !item.dt) return false;
    var today = startOfTodayLocal();
    if (item.dt < today) return false;
    if (item.dt > today) return true;
    var mins = typeof item.minutes === "number" ? item.minutes : parseTimeToMinutes(eventStartTime(item.ev));
    return mins >= nowMinutesLocal();
  }

  function filterFeaturedItemsUpcoming(items) {
    if (!items || !items.length) return [];
    return items.filter(isFeaturedItemUpcoming);
  }

  function featureItemId(item) {
    if (!item || !item.ev) return "";
    return String(item.ev.featureId || item.ev.id || "").trim();
  }

  function featuredPinOrder(ev) {
    if (!ev) return 0;
    var n = parseInt(ev.featuredPinOrder, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Pinned rows (featuredPinOrder > 0), sorted by pin slot ascending. */
  function getPinnedFeaturedItems(enriched) {
    var pinned = [];
    for (var i = 0; i < enriched.length; i++) {
      if (featuredPinOrder(enriched[i].ev) > 0) pinned.push(enriched[i]);
    }
    pinned.sort(function (a, b) {
      return featuredPinOrder(a.ev) - featuredPinOrder(b.ev);
    });
    return pinned;
  }

  /**
   * Home Future Featured grid: slot 1+ = pinned items, slot 2 = next upcoming unpinned,
   * then current month and fill columns from later months (desktop).
   */
  function buildHomeFeaturedDisplayItems(enriched, groupItems, stateIndex, groups, featuredMobileLayout, grid) {
    var pinned = filterFeaturedItemsUpcoming(getPinnedFeaturedItems(enriched));
    var shown = {};
    var displayItems = [];
    var p, u, m, fill, fillItems, f, id;

    for (p = 0; p < pinned.length; p++) {
      id = featureItemId(pinned[p]);
      if (id && shown[id]) continue;
      displayItems.push(pinned[p]);
      if (id) shown[id] = true;
    }

    for (u = 0; u < enriched.length; u++) {
      id = featureItemId(enriched[u]);
      if (id && shown[id]) continue;
      displayItems.push(enriched[u]);
      if (id) shown[id] = true;
      break;
    }

    var monthUpcoming = filterFeaturedItemsUpcoming(groupItems.slice());
    for (m = 0; m < monthUpcoming.length; m++) {
      id = featureItemId(monthUpcoming[m]);
      if (id && shown[id]) continue;
      displayItems.push(monthUpcoming[m]);
      if (id) shown[id] = true;
    }

    if (!featuredMobileLayout) {
      var minCards = homeFeaturedColumnCount(grid);
      for (fill = stateIndex + 1; displayItems.length < minCards && fill < groups.length; fill++) {
        fillItems = filterFeaturedItemsUpcoming(groups[fill].items.slice());
        for (f = 0; f < fillItems.length; f++) {
          id = featureItemId(fillItems[f]);
          if (id && shown[id]) continue;
          displayItems.push(fillItems[f]);
          if (id) shown[id] = true;
        }
      }
    }

    return displayItems;
  }

  function buildEnrichedFeatured(data, includePast) {
    var features = (data.features || []).filter(function (ev) {
      if (ev.isActive === false) return false;
      return isFeaturedEvent(ev);
    });

    var today = startOfTodayLocal();
    var enriched = [];
    for (var i = 0; i < features.length; i++) {
      var ev = features[i];
      var dt = parseISODateLocal(ev.date);
      if (!dt || (!includePast && dt < today)) continue;
      enriched.push({
        ev: ev,
        dt: dt,
        act: null,
        minutes: parseTimeToMinutes(eventStartTime(ev)),
      });
    }

    enriched.sort(function (a, b) {
      if (a.dt - b.dt !== 0) return a.dt - b.dt;
      return a.minutes - b.minutes;
    });
    return enriched;
  }

  function renderFeaturedFromEnriched(slice, grid, jsonUrl, imageIndexOffset) {
    if (!grid) return;
    imageIndexOffset = imageIndexOffset || 0;
    var imagesDir = assetsImagesDir(jsonUrl);

    grid.textContent = "";

    if (!slice || slice.length === 0) {
      var art = document.createElement("article");
      art.className = "site-card featured-card";
      var emptyCap = document.createElement("div");
      emptyCap.className = "featured-card-caption";
      var el1 = document.createElement("div");
      el1.className = "featured-card-line featured-card-line--name";
      el1.textContent = "No upcoming";
      var el2 = document.createElement("div");
      el2.className = "featured-card-line featured-card-line--detail";
      el2.textContent = "featured events";
      var el3 = document.createElement("div");
      el3.className = "featured-card-line featured-card-line--date";
      el3.textContent = "—";
      emptyCap.appendChild(el1);
      emptyCap.appendChild(el2);
      emptyCap.appendChild(el3);
      art.appendChild(emptyCap);
      grid.appendChild(art);
      return;
    }

    for (var c = 0; c < slice.length; c++) {
      var item = slice[c];
      var ev = item.ev;
      var act = item.act;
      var imageRow = ev.imagePath != null && String(ev.imagePath).trim() ? ev : act;

      var article = document.createElement("article");
      article.className = "site-card featured-card";
      if (featuredPinOrder(ev) > 0) {
        article.classList.add("featured-card--pinned");
      }

      var a = document.createElement("a");
      a.className = "featured-card-link";
      a.href = featureEventDetailHref(ev);
      a.title = "Open featured event details";

      var img = document.createElement("img");
      img.className = "featured-card-image";
      img.src = pickImageUrl(imageRow, imageIndexOffset + c, imagesDir);
      img.alt = featuredCardAltText(ev, act, item.dt);

      var cap = createFeaturedCaptionElement(ev, act, item.dt);

      a.appendChild(img);
      a.appendChild(cap);
      article.appendChild(a);
      grid.appendChild(article);
    }
  }

  function monthKey(dt) {
    return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
  }

  function monthLabel(dt) {
    return dt.toLocaleDateString("en-US", { month: "long" });
  }

  /** Local calendar month as a single comparable number (year×12 + month). */
  function localMonthOrdinal(dt) {
    if (!dt) return 0;
    return dt.getFullYear() * 12 + dt.getMonth();
  }

  function groupFeaturedByMonth(enriched) {
    var groups = [];
    var byKey = {};
    for (var i = 0; i < enriched.length; i++) {
      var item = enriched[i];
      var key = monthKey(item.dt);
      if (!byKey[key]) {
        byKey[key] = {
          key: key,
          label: monthLabel(item.dt),
          imageOffset: i,
          items: [],
        };
        groups.push(byKey[key]);
      }
      byKey[key].items.push(item);
    }
    return groups;
  }

  function ensureHomeFeaturedStepper(grid) {
    var section = grid.closest ? grid.closest(".page-home-featured") : null;
    if (!section) return null;
    var controls = section.querySelector(".page-home-featured-stepper");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "page-home-featured-stepper";

      var monthGroup = document.createElement("div");
      monthGroup.className = "page-home-featured-stepper-group page-home-featured-stepper-group--month";

      var monthPrev = document.createElement("button");
      monthPrev.type = "button";
      monthPrev.className = "btn site-button page-home-featured-stepper-btn page-home-featured-month-prev";
      monthPrev.setAttribute("aria-label", "Previous featured-event month");
      monthPrev.textContent = "↑";

      var monthLabel = document.createElement("div");
      monthLabel.className = "page-home-featured-stepper-label page-home-featured-month-label";
      monthLabel.setAttribute("aria-live", "polite");

      var monthNext = document.createElement("button");
      monthNext.type = "button";
      monthNext.className = "btn site-button page-home-featured-stepper-btn page-home-featured-month-next";
      monthNext.setAttribute("aria-label", "Next featured-event month");
      monthNext.textContent = "↓";

      monthGroup.appendChild(monthPrev);
      monthGroup.appendChild(monthLabel);
      monthGroup.appendChild(monthNext);

      var yearGroup = document.createElement("div");
      yearGroup.className = "page-home-featured-stepper-group page-home-featured-stepper-group--year";

      var yearPrev = document.createElement("button");
      yearPrev.type = "button";
      yearPrev.className = "btn site-button page-home-featured-stepper-btn page-home-featured-year-prev";
      yearPrev.setAttribute("aria-label", "Previous featured-event year");
      yearPrev.textContent = "↑";

      var yearLabel = document.createElement("div");
      yearLabel.className = "page-home-featured-stepper-label page-home-featured-year-label";
      yearLabel.setAttribute("aria-live", "polite");

      var yearNext = document.createElement("button");
      yearNext.type = "button";
      yearNext.className = "btn site-button page-home-featured-stepper-btn page-home-featured-year-next";
      yearNext.setAttribute("aria-label", "Next featured-event year");
      yearNext.textContent = "↓";

      yearGroup.appendChild(yearPrev);
      yearGroup.appendChild(yearLabel);
      yearGroup.appendChild(yearNext);

      controls.appendChild(monthGroup);
      controls.appendChild(yearGroup);
      section.insertBefore(controls, grid);
    }
    return {
      host: controls,
      monthPrev: controls.querySelector(".page-home-featured-month-prev"),
      monthLabel: controls.querySelector(".page-home-featured-month-label"),
      monthNext: controls.querySelector(".page-home-featured-month-next"),
      yearPrev: controls.querySelector(".page-home-featured-year-prev"),
      yearLabel: controls.querySelector(".page-home-featured-year-label"),
      yearNext: controls.querySelector(".page-home-featured-year-next"),
    };
  }

  /** Matches CSS breakpoint for Future Featured mobile treatment (past hidden, vertical month list). */
  function isPageHomeFeaturedMobileLayout() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 768px)").matches;
  }

  function cssLengthToPx(value, contextEl) {
    var raw = String(value || "").trim();
    if (!raw) return 0;
    var n = parseFloat(raw);
    if (!Number.isFinite(n)) return 0;
    if (/rem$/i.test(raw)) {
      var rootFont = parseFloat(window.getComputedStyle(document.documentElement).fontSize);
      return n * (Number.isFinite(rootFont) ? rootFont : 16);
    }
    if (/em$/i.test(raw)) {
      var font = parseFloat(window.getComputedStyle(contextEl || document.body).fontSize);
      return n * (Number.isFinite(font) ? font : 16);
    }
    return n;
  }

  function homeFeaturedColumnCount(grid) {
    var styles = window.getComputedStyle(grid);
    var width = grid.getBoundingClientRect().width || grid.clientWidth || 0;
    var gap = parseFloat(styles.columnGap || styles.gap) || 0;
    var minWidth = cssLengthToPx(styles.getPropertyValue("--home-featured-card-min"), grid);
    if (!width || !minWidth) return 1;
    return Math.max(1, Math.floor((width + gap) / (minWidth + gap)));
  }

  function renderHomeFeaturedMonth(data, grid, jsonUrl) {
    if (!grid) return;
    var main = document.querySelector("body.page-home .site-main");
    if (main) main.style.height = "";

    var featuredMobileLayout = isPageHomeFeaturedMobileLayout();

    var today = startOfTodayLocal();
    var currentYear = today.getFullYear();
    var currentMonthOrdinal = localMonthOrdinal(today);
    /* Do not include features on dates before today (desktop previously passed true and kept e.g. May 2). */
    var enriched = buildEnrichedFeatured(data, false);
    /* Only the current calendar month and future months (drops e.g. April when it is already May). */
    var groups = groupFeaturedByMonth(enriched).filter(function (group) {
      var dt = group.items[0] && group.items[0].dt;
      if (!dt) return false;
      return localMonthOrdinal(dt) >= currentMonthOrdinal;
    });
    var controls = ensureHomeFeaturedStepper(grid);

    if (!groups.length) {
      if (controls) controls.host.hidden = true;
      renderFeaturedFromEnriched([], grid, jsonUrl, 0);
      return;
    }

    if (controls) controls.host.hidden = false;

    var state = grid._mmhpHomeFeaturedState || { index: 0, key: "" };
    if (state.key) {
      var keyMatched = false;
      for (var g = 0; g < groups.length; g++) {
        if (groups[g].key === state.key) {
          state.index = g;
          keyMatched = true;
          break;
        }
      }
      if (!keyMatched) {
        state.key = "";
        state.index = 0;
      }
    }
    state.index = Math.max(0, Math.min(state.index || 0, groups.length - 1));

    function groupYear(index) {
      return groups[index].items[0].dt.getFullYear();
    }

    function findGroupInYear(targetYear, preferredMonth) {
      var fallback = -1;
      for (var y = 0; y < groups.length; y++) {
        var dt = groups[y].items[0].dt;
        if (dt.getFullYear() !== targetYear) continue;
        if (fallback < 0) fallback = y;
        if (dt.getMonth() === preferredMonth) return y;
      }
      return fallback;
    }

    function renderAt(index) {
      state.index = Math.max(0, Math.min(index, groups.length - 1));
      var group = groups[state.index];
      var year = groupYear(state.index);
      state.key = group.key;
      grid._mmhpHomeFeaturedState = state;
      if (controls) {
        controls.monthLabel.textContent = group.label;
        controls.monthPrev.disabled = state.index === 0;
        controls.monthNext.disabled = state.index === groups.length - 1;
        controls.yearLabel.textContent = String(year);
        controls.yearPrev.disabled = year <= currentYear || findGroupInYear(year - 1, group.items[0].dt.getMonth()) < 0;
        controls.yearNext.disabled = findGroupInYear(year + 1, group.items[0].dt.getMonth()) < 0;
      }
      if (featuredMobileLayout) {
        grid.setAttribute(
          "aria-label",
          "Upcoming featured events for " + group.label + " " + String(year)
        );
      } else {
        grid.setAttribute("aria-label", "Featured events for " + group.label);
      }

      var displayItems = buildHomeFeaturedDisplayItems(
        enriched,
        group.items,
        state.index,
        groups,
        featuredMobileLayout,
        grid
      );

      renderFeaturedFromEnriched(displayItems, grid, jsonUrl, group.imageOffset);
    }

    if (controls) {
      controls.monthPrev.onclick = function () {
        renderAt(state.index - 1);
      };
      controls.monthNext.onclick = function () {
        renderAt(state.index + 1);
      };
      controls.yearPrev.onclick = function () {
        var current = groups[state.index].items[0].dt;
        var target = findGroupInYear(current.getFullYear() - 1, current.getMonth());
        if (target >= 0 && current.getFullYear() - 1 >= currentYear) renderAt(target);
      };
      controls.yearNext.onclick = function () {
        var current = groups[state.index].items[0].dt;
        var target = findGroupInYear(current.getFullYear() + 1, current.getMonth());
        if (target >= 0) renderAt(target);
      };
    }

    renderAt(state.index);
  }

  function eventTitle(ev) {
    if (!ev) return "";
    var t = (ev.title != null ? ev.title : ev.eventName);
    return String(t || "").trim();
  }

  function eventStartTime(ev) {
    if (!ev) return "00:00";
    if (ev.times && ev.times.start) return String(ev.times.start).trim();
    return String(ev.startTime || "00:00").trim();
  }

  /** Featured when isFeatured is not false (explicit false hides from featured UIs). */
  function isFeaturedEvent(ev) {
    if (ev.isFeatured === false) return false;
    return true;
  }

  function pickImageUrl(activity, fallbackIndex, imagesDir) {
    var raw = (activity && activity.imagePath) ? String(activity.imagePath).trim() : "";
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    if (raw && raw.charAt(0) === "/") return raw;
    if (raw) return imagesDir.replace(/\/?$/, "/") + "/" + raw.replace(/^\//, "");
    var fn = FALLBACK_IMAGES[fallbackIndex % FALLBACK_IMAGES.length];
    return imagesDir.replace(/\/?$/, "/") + fn;
  }

  /**
   * Optional activity schedule when there are no dated features yet.
   * recurrenceDetails.slots: [ { weekday: "Wednesday", startTime: "09:00" }, ... ]
   * Or recurrenceDetails.weekdays: [ "Monday", "Wednesday" ] + startTime: "14:00"
   * Optional recurrenceDetails.weekOfMonth: 1–5 = nth occurrence of that weekday each month
   * (e.g. weekdays ["Sunday"] + weekOfMonth 3 = third Sunday monthly).
   */
  function mergeRecurrenceFromActivity(buckets, act) {
    if (!isRecurringActivity(act)) return;
    if (act.isActive === false) return;
    if (!activityPassesSeasonFilter(act)) return;
    var name = (act.activityName || "").trim();
    if (!name || /^unknown$/i.test(name)) return;

    var rd = act.recurrenceDetails || {};
    var monthWeekN = monthWeekFromRecurrenceDetails(rd);
    var entries = [];

    if (Array.isArray(rd.slots) && rd.slots.length > 0) {
      for (var i = 0; i < rd.slots.length; i++) {
        var sl = rd.slots[i] || {};
        var w = String(sl.weekday || sl.day || "").trim();
        var st = String(sl.startTime || sl.time || "").trim();
        if (!w || !st) continue;
        entries.push({ weekday: w, startTime: st });
      }
    } else {
      var days = rd.weekdays || rd.daysOfWeek || [];
      var stOne = String(rd.startTime || rd.time || "").trim();
      if (!Array.isArray(days) || days.length === 0 || !stOne) return;
      for (var j = 0; j < days.length; j++) {
        entries.push({ weekday: String(days[j]).trim(), startTime: stOne });
      }
    }

    for (var k = 0; k < entries.length; k++) {
      var e = entries[k];
      var di = WEEKDAYS.indexOf(e.weekday);
      if (di < 0) continue;
      var st = e.startTime.trim();
      var loc = String(act.location || "").trim();
      var slot = sidebarSlotTitleAndMeta(name, st, loc);
      if (monthWeekN != null) {
        slot.title =
          slot.title +
          " (" +
          ordinalWeekOfMonth(monthWeekN) +
          " " +
          weekdayShortLabel(e.weekday) +
          "/mo)";
      }
      var minutes = parseTimeToMinutes(st);
      var dedupeKey =
        st + "\t" + name + "\t" + loc + "\t" + (monthWeekN != null ? "wm" + monthWeekN : "");
      if (!buckets[di].has(dedupeKey)) {
        buckets[di].set(dedupeKey, {
          minutes: minutes,
          title: slot.title,
          meta: slot.meta,
          activityId: act.id != null ? String(act.id).trim() : "",
        });
      }
    }
  }

  function renderRecurringSchedule(data, list) {
    if (!list) return;
    var exportButton = document.getElementById("mmhp-activities-export");

    function appendExportButton() {
      if (!exportButton) return;
      var exportLi = document.createElement("li");
      exportLi.className = "sidebar-schedule-export";
      exportLi.appendChild(exportButton);
      list.appendChild(exportLi);
    }

    var buckets = [];
    for (var b = 0; b < 7; b++) buckets.push(new Map());

    /* Left sidebar recurring slots come only from activities[].recurrenceDetails, not from features. */

    var actList = data.activities || [];
    for (var ai = 0; ai < actList.length; ai++) {
      mergeRecurrenceFromActivity(buckets, actList[ai]);
    }

    list.textContent = "";
    list.classList.add("schedule-by-day");

    var anyBucket = false;
    for (var bi = 0; bi < 7; bi++) {
      if (buckets[bi].size > 0) {
        anyBucket = true;
        break;
      }
    }

    if (!anyBucket) {
      var empty = document.createElement("li");
      empty.className = "recurring-events-item";
      empty.textContent = "No recurring schedule in data.";
      list.appendChild(empty);
      appendExportButton();
      list.setAttribute("aria-busy", "false");
      return;
    }

    /* Always Monday → Sunday; empty days show a placeholder */
    for (var d = 0; d < 7; d++) {
      var map = buckets[d];

      var slots = [];
      map.forEach(function (v) {
        slots.push(v);
      });
      slots.sort(function (a, b) {
        return a.minutes - b.minutes;
      });

      var dayLi = document.createElement("li");
      dayLi.className = "sidebar-schedule-day";

      var dayTitle = document.createElement("div");
      dayTitle.className = "sidebar-schedule-dayname";
      dayTitle.textContent = WEEKDAYS[d];
      dayLi.appendChild(dayTitle);

      var sub = document.createElement("ul");
      sub.className = "sidebar-schedule-slots";

      if (slots.length === 0) {
        var placeholder = document.createElement("li");
        placeholder.className = "sidebar-schedule-line sidebar-schedule-line--empty";
        placeholder.textContent = "No scheduled events";
        sub.appendChild(placeholder);
      } else {
        for (var s = 0; s < slots.length; s++) {
          var slotLi = document.createElement("li");
          slotLi.className = "sidebar-schedule-line";
          appendSidebarScheduleSlot(slotLi, slots[s]);
          sub.appendChild(slotLi);
        }
      }
      dayLi.appendChild(sub);
      list.appendChild(dayLi);
    }

    appendExportButton();
    list.setAttribute("aria-busy", "false");
  }

  function renderFeaturedEvents(data, grid, jsonUrl, maxCount) {
    if (!grid) return;
    var enriched = buildEnrichedFeatured(data);
    var cap =
      maxCount != null && maxCount >= 0 ? maxCount : MAX_FEATURED_CARDS;
    renderFeaturedFromEnriched(enriched.slice(0, cap), grid, jsonUrl, 0);
  }

  /** Best featured event on dayStart (local midnight), by start time; or null. */
  function findFeaturedOnDate(data, dayStart) {
    var features = data.features || [];
    var candidates = [];
    var targetMs = dayStart.getTime();
    for (var i = 0; i < features.length; i++) {
      var ev = features[i];
      if (ev.isActive === false) continue;
      if (!isFeaturedEvent(ev)) continue;
      var dt = parseISODateLocal(ev.date);
      if (!dt || dt.getTime() !== targetMs) continue;
      candidates.push({
        ev: ev,
        dt: dt,
        act: null,
        minutes: parseTimeToMinutes(eventStartTime(ev)),
      });
    }
    candidates.sort(function (a, b) {
      return a.minutes - b.minutes;
    });
    return candidates.length ? candidates[0] : null;
  }

  /**
   * The one date in [today, today+6] (local, inclusive) whose weekday matches js getDay() (0=Sun … 6=Sat).
   * Any 7 consecutive days contain exactly one of each weekday.
   */
  function findWeekdayInRollingSevenDays(todayStart, jsWeekday) {
    for (var k = 0; k <= 6; k++) {
      var d = addDaysLocal(todayStart, k);
      if (d.getDay() === jsWeekday) return d;
    }
    return null;
  }

  /**
   * Home right rail: Wednesday and Saturday in rolling window today…today+6 (local).
   * Returns real featured items when present; render uses placeholders when absent.
   */
  function weekSpotlightWednesdaySaturdayItems(data) {
    var today = startOfTodayLocal();
    var dWed = findWeekdayInRollingSevenDays(today, 3);
    var dSat = findWeekdayInRollingSevenDays(today, 6);
    var wed = dWed ? findFeaturedOnDate(data, dWed) : null;
    var sat = dSat ? findFeaturedOnDate(data, dSat) : null;
    return { wed: wed, sat: sat, dWed: dWed, dSat: dSat };
  }

  /** Re-run spotlight after each local midnight while the tab stays open (no full reload). */
  function scheduleWeekSpotlightMidnightRefresh(onDayTurnover) {
    function arm() {
      var now = new Date();
      var nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
      var ms = Math.max(1000, nextMidnight.getTime() - now.getTime());
      window.setTimeout(function () {
        try {
          onDayTurnover();
        } catch (e) {}
        arm();
      }, ms);
    }
    arm();
  }

  function renderWeekSpotlightCardInto(host, item, imageOffset, jsonUrl, emptyWeekdayName, slotDate) {
    if (!host) return;
    host.textContent = "";
    var imagesDir = assetsImagesDir(jsonUrl);

    var article = document.createElement("article");
    article.className = "site-card featured-card week-spotlight-card";

    if (!item && slotDate) {
      article.classList.add("week-spotlight-card--placeholder");
      var phEv = {
        cardLine1: "Open evening slot",
        cardLine2: "7–10 pm · Hall A",
        eventName: "Open evening slot",
        imagePath: "event-flyer/bookme.png",
      };
      var imgPh = document.createElement("img");
      imgPh.className = "featured-card-image";
      imgPh.src = pickImageUrl(phEv, imageOffset, imagesDir);
      imgPh.alt = featuredCardAltText(phEv, null, slotDate);

      var btnImg = document.createElement("button");
      btnImg.type = "button";
      btnImg.className = "featured-card-image-btn";
      btnImg.setAttribute("aria-label", "Preview flyer image full size");
      btnImg.appendChild(imgPh);
      btnImg.addEventListener("click", function () {
        openImagePreview(imgPh.src, imgPh.alt);
      });

      var aPh = document.createElement("a");
      aPh.className = "featured-card-link featured-card-link--bookme-text";
      aPh.href = submitHref();
      aPh.title =
        "Open evening slot - contact the event coordinator to request this evening (Hall A, 7-10 pm).";
      aPh.setAttribute(
        "aria-label",
        "Open evening slot: contact the event coordinator to book Hall A, 7 to 10 p.m. Opens the one time event form."
      );

      var capPh = createFeaturedCaptionElement(phEv, null, slotDate);
      var hintPh = document.createElement("p");
      hintPh.className = "featured-card-booking-hint";
      hintPh.textContent =
        "No featured event is scheduled yet. Use the coordinator form below to reserve this typical Hall A evening.";

      aPh.appendChild(capPh);
      aPh.appendChild(hintPh);
      article.appendChild(btnImg);
      article.appendChild(aPh);
      host.appendChild(article);
      return;
    }

    if (!item) {
      var day = emptyWeekdayName != null && String(emptyWeekdayName).trim() ? String(emptyWeekdayName).trim() : "week";
      var emptyCap = document.createElement("div");
      emptyCap.className = "featured-card-caption week-spotlight-empty";
      var z1 = document.createElement("div");
      z1.className = "featured-card-line featured-card-line--name";
      z1.textContent = "No upcoming features this " + day + ".";
      var z2 = document.createElement("div");
      z2.className = "featured-card-line featured-card-line--detail";
      z2.textContent = "";
      var z3 = document.createElement("div");
      z3.className = "featured-card-line featured-card-line--date";
      z3.textContent = "";
      emptyCap.appendChild(z1);
      emptyCap.appendChild(z2);
      emptyCap.appendChild(z3);
      article.appendChild(emptyCap);
      host.appendChild(article);
      return;
    }

    var ev = item.ev;
    var act = item.act;
    var imageRow = ev.imagePath != null && String(ev.imagePath).trim() ? ev : act;

    var a = document.createElement("a");
    a.className = "featured-card-link";
    a.href = featureEventDetailHref(ev);
    a.title = "Open featured event details";

    var img = document.createElement("img");
    img.className = "featured-card-image";
    img.src = pickImageUrl(imageRow, imageOffset, imagesDir);
    img.alt = featuredCardAltText(ev, act, item.dt);

    var cap = createFeaturedCaptionElement(ev, act, item.dt);

    a.appendChild(img);
    a.appendChild(cap);
    article.appendChild(a);
    host.appendChild(article);
  }

  function renderWeekSpotlightWednesdaySaturday(data, grid, jsonUrl) {
    if (!grid) return;

    var pair = weekSpotlightWednesdaySaturdayItems(data);

    /** Desktop mounts (aside); mobile mounts duplicate content when present (narrow-only CSS hides one set). */
    var pairs = [
      ["mmhp-week-spotlight-wednesday", "mmhp-week-spotlight-saturday"],
      ["mmhp-week-spotlight-wednesday-mobile", "mmhp-week-spotlight-saturday-mobile"],
    ];

    var ran = false;
    for (var p = 0; p < pairs.length; p++) {
      var wedId = pairs[p][0];
      var satId = pairs[p][1];
      var wedHost = document.getElementById(wedId);
      var satHost = document.getElementById(satId);
      if (!wedHost || !satHost) continue;
      ran = true;
      renderWeekSpotlightCardInto(wedHost, pair.wed, 0, jsonUrl, "Wednesday", pair.dWed);
      renderWeekSpotlightCardInto(satHost, pair.sat, 1, jsonUrl, "Saturday", pair.dSat);
    }

    if (!ran) return;
  }

  function init() {
    wireActivityFlyerImagePreview();
    var url = getMasterJsonUrl();
    var list = document.querySelector("aside.site-sidebar-left .recurring-events-list");
    var homeFeaturedGrid = document.querySelector(".page-home-featured-grid");
    var rightGrid = document.querySelector("aside.site-sidebar-right .featured-events-grid");
    var featuredExportButton = document.getElementById("mmhp-featured-export");
    var activitiesExportButton = document.getElementById("mmhp-activities-export");

    if (
      !url ||
      (!list &&
        !homeFeaturedGrid &&
        !rightGrid &&
        !featuredExportButton &&
        !activitiesExportButton &&
        !isActivityFlyerSchedulePage())
    )
      return;

    var dataRef = null;

    function runHomeFit() {
      if (homeFeaturedGrid && dataRef) renderHomeFeaturedMonth(dataRef, homeFeaturedGrid, url);
    }

    var debouncedHomeFit = debounce(runHomeFit, 180);

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (data) {
        dataRef = data;
        if (featuredExportButton) bindFeaturedExportButton(featuredExportButton, data);
        if (activitiesExportButton) bindActivitiesExportButton(activitiesExportButton, data);
        if (list) renderRecurringSchedule(data, list);
        wireActivityFlyerSeasonRange(data);
        if (homeFeaturedGrid) {
          requestAnimationFrame(function () {
            requestAnimationFrame(runHomeFit);
          });
          window.addEventListener("resize", debouncedHomeFit);
          if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", debouncedHomeFit);
          }
          window.setTimeout(runHomeFit, 350);
        }
        if (rightGrid) {
          if (document.body.classList.contains("page-home")) {
            renderWeekSpotlightWednesdaySaturday(data, rightGrid, url);
            scheduleWeekSpotlightMidnightRefresh(function () {
              if (dataRef) renderWeekSpotlightWednesdaySaturday(dataRef, rightGrid, url);
            });
          } else {
            renderFeaturedEvents(data, rightGrid, url);
          }
        }
      })
      .catch(function () {
        if (list) {
          list.textContent = "";
          list.classList.remove("schedule-by-day");
          var li = document.createElement("li");
          li.className = "recurring-events-item";
          li.textContent = "Could not load schedule.";
          list.appendChild(li);
          list.setAttribute("aria-busy", "false");
        }
        if (homeFeaturedGrid) {
          homeFeaturedGrid.textContent = "";
          var art1 = document.createElement("article");
          art1.className = "site-card featured-card";
          var p1 = document.createElement("p");
          p1.className = "featured-card-caption";
          p1.textContent = "Could not load featured events.";
          art1.appendChild(p1);
          homeFeaturedGrid.appendChild(art1);
        }
        if (rightGrid) {
          if (document.body.classList.contains("page-home")) {
            renderWeekSpotlightWednesdaySaturday({ features: [] }, rightGrid, url);
          } else {
            rightGrid.textContent = "";
            var art2 = document.createElement("article");
            art2.className = "site-card featured-card";
            var p2 = document.createElement("p");
            p2.className = "featured-card-caption";
            p2.textContent = "Could not load featured events.";
            art2.appendChild(p2);
            rightGrid.appendChild(art2);
          }
        }
        if (featuredExportButton) {
          featuredExportButton.disabled = true;
          featuredExportButton.textContent = "Export Unavailable";
        }
        if (activitiesExportButton) {
          activitiesExportButton.disabled = true;
          activitiesExportButton.textContent = "Export Unavailable";
        }
        wireActivityFlyerSeasonRange(null);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
