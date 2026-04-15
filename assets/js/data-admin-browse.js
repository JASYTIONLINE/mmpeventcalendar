(function () {
  /** Only the latest initBrowseApp completion may wire UI (avoids duplicate/racy loads). */
  var __dataAdminBrowseInitGen = 0;
  /** Ignore rapid repeat clicks on Add feature. */
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

  /** Local calendar date as YYYY-MM-DD (for comparisons with feature `date` fields). */
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

  /** Keys hidden in browse tables only (still in JSON, CSV export, and edit modal). */
  function isDataAdminTechnicalIdColumn(key) {
    if (key === "id" || key === "_id" || key === "uuid") return true;
    return /Id$/.test(key);
  }

  /** Browse grid only; cardLine1–3 stay in edit modal, JSON, and CSV. */
  function filterDisplayColumnsForBrowse(columns) {
    var out = [];
    for (var i = 0; i < columns.length; i++) {
      var k = columns[i];
      if (isDataAdminTechnicalIdColumn(k)) continue;
      if (k === "cardLine1" || k === "cardLine2" || k === "cardLine3") continue;
      out.push(k);
    }
    return out;
  }

  /** Puts startTime immediately before endTime, both right after `date` when present (features grid). */
  function orderDataAdminTableColumns(collectionKey, columns) {
    if (collectionKey === "activities") {
      return ["activityName", "__scheduleSummary", "description", "location"];
    }
    if (collectionKey !== "features") return columns;
    var cols = columns.slice();
    var si = cols.indexOf("startTime");
    var ei = cols.indexOf("endTime");
    var st = si >= 0 ? cols.splice(si, 1)[0] : null;
    ei = cols.indexOf("endTime");
    var et = ei >= 0 ? cols.splice(ei, 1)[0] : null;
    var di = cols.indexOf("date");
    var insertAt = di >= 0 ? di + 1 : cols.indexOf("featureId") + (cols.indexOf("featureId") >= 0 ? 1 : 0);
    if (insertAt <= 0 && cols.indexOf("id") === 0) insertAt = 1;
    if (insertAt < 0) insertAt = cols.length;
    if (st) cols.splice(insertAt, 0, st);
    if (et) cols.splice(insertAt + (st ? 1 : 0), 0, et);
    var evNameIdx = cols.indexOf("eventName");
    if (evNameIdx >= 0) {
      cols.splice(evNameIdx, 1);
      cols.unshift("eventName");
    }
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

  /** Human-readable schedule for activities browse column (not stored on JSON). */
  function formatActivityRecurrenceBrowse(act) {
    if (!act || typeof act !== "object") return "";
    var rd = act.recurrenceDetails || {};
    if (Array.isArray(rd.slots) && rd.slots.length > 0) {
      var parts = [];
      for (var si = 0; si < rd.slots.length; si++) {
        var sl = rd.slots[si] || {};
        var w = String(sl.weekday || sl.day || "").trim();
        var st = String(sl.startTime || sl.time || "").trim();
        if (w && st) parts.push(w.slice(0, 3) + " " + st);
      }
      return parts.length ? parts.join("; ") : "";
    }
    var days = rd.weekdays || rd.daysOfWeek || [];
    var stOne = String(rd.startTime || rd.time || "").trim();
    if (!Array.isArray(days) || days.length === 0 || !stOne) {
      if (String(act.recurrenceType || "").trim() === "Recurring") return "(no weekday/time set)";
      return "—";
    }
    var dlist = [];
    for (var di = 0; di < days.length; di++) {
      dlist.push(String(days[di]).trim());
    }
    return dlist.join(", ") + " · " + stOne;
  }

  function dataAdminBrowseColumnDisplay(collectionKey, obj, columnKey) {
    if (collectionKey === "activities" && columnKey === "__scheduleSummary") {
      return formatActivityRecurrenceBrowse(obj);
    }
    return cellValue(obj[columnKey]);
  }

  function getOrInitTableState(section) {
    if (!section._mmhpTableState) {
      section._mmhpTableState = { sortCol: null, sortDir: 1, filters: {}, searchText: "" };
    } else if (section._mmhpTableState.searchText === undefined) {
      section._mmhpTableState.searchText = "";
    }
    return section._mmhpTableState;
  }

  function pruneTableStateForColumns(tableState, columns) {
    if (tableState.sortCol && columns.indexOf(tableState.sortCol) < 0) {
      tableState.sortCol = null;
      tableState.sortDir = 1;
    }
    var f = tableState.filters;
    if (!f) return;
    for (var k in f) {
      if (Object.prototype.hasOwnProperty.call(f, k) && columns.indexOf(k) < 0) {
        delete f[k];
      }
    }
  }

  function compareDataAdminDisplayValues(a, b) {
    var sa = String(a);
    var sb = String(b);
    if (/^\d{4}-\d{2}-\d{2}$/.test(sa) && /^\d{4}-\d{2}-\d{2}$/.test(sb)) {
      if (sa < sb) return -1;
      if (sa > sb) return 1;
      return 0;
    }
    var na = Number(sa);
    var nb = Number(sb);
    if (sa !== "" && sb !== "" && isFinite(na) && isFinite(nb) && !isNaN(na) && !isNaN(nb)) {
      if (na < nb) return -1;
      if (na > nb) return 1;
      return 0;
    }
    return sa.localeCompare(sb, undefined, { sensitivity: "base", numeric: true });
  }

  function applyTableViewState(entries, columns, state, collectionKey) {
    var ck = collectionKey || "";
    var rows = entries.slice();
    var filters = state && state.filters;
    if (filters) {
      for (var fk = 0; fk < columns.length; fk++) {
        var colKey = columns[fk];
        var allowed = filters[colKey];
        if (allowed === undefined || allowed === null) continue;
        if (allowed.length === 0) {
          rows = [];
          break;
        }
        var set = {};
        for (var si = 0; si < allowed.length; si++) set[allowed[si]] = true;
        rows = rows.filter(function (e) {
          return set[dataAdminBrowseColumnDisplay(ck, e.obj, colKey)];
        });
      }
    }
    var needle =
      state && state.searchText != null ? String(state.searchText).trim() : "";
    if (needle !== "") {
      var low = needle.toLowerCase();
      rows = rows.filter(function (e) {
        for (var ti = 0; ti < columns.length; ti++) {
          if (dataAdminBrowseColumnDisplay(ck, e.obj, columns[ti]).toLowerCase().indexOf(low) >= 0) return true;
        }
        return false;
      });
    }
    if (state && state.sortCol && columns.indexOf(state.sortCol) >= 0) {
      var sc = state.sortCol;
      var dir = state.sortDir >= 0 ? 1 : -1;
      rows.sort(function (a, b) {
        var c = compareDataAdminDisplayValues(
          dataAdminBrowseColumnDisplay(ck, a.obj, sc),
          dataAdminBrowseColumnDisplay(ck, b.obj, sc)
        );
        if (c !== 0) return c * dir;
        return a.idx - b.idx;
      });
    }
    return rows;
  }

  function uniqueColumnValues(entries, col, collectionKey) {
    var ck = collectionKey || "";
    var m = {};
    for (var i = 0; i < entries.length; i++) {
      var s = dataAdminBrowseColumnDisplay(ck, entries[i].obj, col);
      m[s] = true;
    }
    var arr = Object.keys(m);
    arr.sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
    });
    return arr;
  }

  function closeAnyDataAdminFilterPanel() {
    var ex = document.querySelector(".data-admin-filter-panel");
    if (ex && ex.parentNode) ex.parentNode.removeChild(ex);
    document.removeEventListener("click", dataAdminFilterBackdropClose, true);
  }

  function dataAdminFilterBackdropClose(ev) {
    if (ev.target.closest(".data-admin-filter-panel")) return;
    if (ev.target.closest(".data-admin-th-filter-btn")) return;
    closeAnyDataAdminFilterPanel();
  }

  function openColumnFilterPanel(colName, baseEntries, tableState, refreshSection, anchorBtn, collectionKey) {
    closeAnyDataAdminFilterPanel();
    var ck = collectionKey || "";
    var uniques = uniqueColumnValues(baseEntries, colName, ck);
    var colTitle =
      ck === "activities" && colName === "__scheduleSummary" ? "Schedule (weekdays · time)" : colName;
    var panel = document.createElement("div");
    panel.className = "data-admin-filter-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Filter column " + colTitle);

    var head = document.createElement("div");
    head.className = "data-admin-filter-panel__head";
    head.textContent = "Filter: " + colTitle;
    panel.appendChild(head);

    var list = document.createElement("div");
    list.className = "data-admin-filter-panel__list";

    var current = tableState.filters[colName];
    var selected = {};
    if (current && current.length) {
      for (var i = 0; i < current.length; i++) selected[current[i]] = true;
    } else {
      for (var u = 0; u < uniques.length; u++) selected[uniques[u]] = true;
    }

    var checks = [];
    for (var j = 0; j < uniques.length; j++) {
      var val = uniques[j];
      var row = document.createElement("label");
      row.className = "data-admin-filter-panel__row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!selected[val];
      var span = document.createElement("span");
      span.className = "data-admin-filter-panel__val";
      span.textContent = val === "" ? "(blank)" : val;
      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
      checks.push({ cb: cb, val: val });
    }
    panel.appendChild(list);

    var actions = document.createElement("div");
    actions.className = "data-admin-filter-panel__actions";

    var btnAll = document.createElement("button");
    btnAll.type = "button";
    btnAll.className = "btn site-button data-admin-filter-panel__btn";
    btnAll.textContent = "Select all";
    btnAll.addEventListener("click", function () {
      for (var ai = 0; ai < checks.length; ai++) checks[ai].cb.checked = true;
    });

    var btnNone = document.createElement("button");
    btnNone.type = "button";
    btnNone.className = "btn site-button data-admin-filter-panel__btn";
    btnNone.textContent = "Clear";
    btnNone.addEventListener("click", function () {
      for (var zi = 0; zi < checks.length; zi++) checks[zi].cb.checked = false;
    });

    var btnOk = document.createElement("button");
    btnOk.type = "button";
    btnOk.className = "btn site-button data-admin-filter-panel__btn data-admin-filter-panel__btn--primary";
    btnOk.textContent = "Apply";
    btnOk.addEventListener("click", function () {
      var allowed = [];
      for (var bi = 0; bi < checks.length; bi++) {
        if (checks[bi].cb.checked) allowed.push(checks[bi].val);
      }
      if (allowed.length === 0) {
        tableState.filters[colName] = [];
      } else if (allowed.length === uniques.length) {
        delete tableState.filters[colName];
      } else {
        tableState.filters[colName] = allowed;
      }
      closeAnyDataAdminFilterPanel();
      refreshSection();
    });

    var btnCancel = document.createElement("button");
    btnCancel.type = "button";
    btnCancel.className = "btn site-button data-admin-filter-panel__btn";
    btnCancel.textContent = "Cancel";
    btnCancel.addEventListener("click", function () {
      closeAnyDataAdminFilterPanel();
    });

    actions.appendChild(btnAll);
    actions.appendChild(btnNone);
    actions.appendChild(btnCancel);
    actions.appendChild(btnOk);
    panel.appendChild(actions);

    document.body.appendChild(panel);
    var r = anchorBtn.getBoundingClientRect();
    var pw = panel.offsetWidth;
    var left = r.left;
    if (left + pw > window.innerWidth - 12) left = Math.max(8, window.innerWidth - pw - 12);
    panel.style.left = left + "px";
    panel.style.top = r.bottom + 4 + "px";

    window.setTimeout(function () {
      document.addEventListener("click", dataAdminFilterBackdropClose, true);
    }, 0);
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

  function buildObjectEntries(val) {
    var objectEntries = [];
    for (var ri = 0; ri < val.length; ri++) {
      var o = val[ri];
      if (o && typeof o === "object" && !Array.isArray(o)) objectEntries.push({ idx: ri, obj: o });
    }
    return objectEntries;
  }

  function featureRowIsoDate(obj) {
    var d = obj && obj.date != null ? String(obj.date).trim() : "";
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  }

  /** Valid ISO feature date is strictly before today (local). These rows are treated as archived. */
  function isArchivedPastEvent(obj) {
    var d = featureRowIsoDate(obj);
    if (!d) return false;
    return d < todayIsoLocal();
  }

  function compareDisplayFeatureEntries(a, b) {
    var da = featureRowIsoDate(a.obj);
    var db = featureRowIsoDate(b.obj);
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
    if (collectionKey !== "features") return all;
    if (hidePastEvents) {
      var ymd = todayIsoLocal();
      var upcoming = [];
      for (var ui = 0; ui < all.length; ui++) {
        var d = featureRowIsoDate(all[ui].obj);
        if (d && d >= ymd) upcoming.push(all[ui]);
      }
      all = upcoming;
    }
    var sorted = all.slice();
    sorted.sort(compareDisplayFeatureEntries);
    return sorted;
  }

  /** Data page section order: features → activities → everything else A–Z */
  function sortMasterDataCollectionKeys(keys) {
    function rank(name) {
      if (name === "features") return 0;
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

  function deriveListingTitle(cardLine1, cardLine2) {
    var c2 = cardLine2 != null ? String(cardLine2).trim() : "";
    var c1 = cardLine1 != null ? String(cardLine1).trim() : "";
    if (!c1 && !c2) return "";
    if (!c1) return c2;
    if (!c2) return c1;
    return c1 + " — " + c2;
  }

  /** Matches deriveListingTitle separator; second segment is the part after the last separator. */
  function activityNameFromListingTitle(listingTitle) {
    var t = String(listingTitle || "").trim();
    var sep = " — ";
    var idx = t.lastIndexOf(sep);
    if (idx === -1) return "";
    return t.slice(idx + sep.length).trim();
  }

  function finalizeFeatureRow(parsed, masterData) {
    if (!parsed || typeof parsed !== "object") return;
    if (Object.prototype.hasOwnProperty.call(parsed, "activityId")) {
      delete parsed.activityId;
    }
    if (Object.prototype.hasOwnProperty.call(parsed, "isSpecialEvent")) {
      if (parsed.isFeatured === undefined) {
        if (parsed.isSpecialEvent === true) parsed.isFeatured = true;
        else if (parsed.isSpecialEvent === false) parsed.isFeatured = false;
      }
      delete parsed.isSpecialEvent;
    }
    var sid = parsed.id != null ? String(parsed.id).trim() : "";
    var sfid = parsed.featureId != null ? String(parsed.featureId).trim() : "";
    if (sid && !sfid) parsed.featureId = sid;
    if (sfid && !sid) parsed.id = sfid;
    if (parsed.id != null) parsed.id = String(parsed.id).trim();
    if (parsed.featureId != null) parsed.featureId = String(parsed.featureId).trim();
    var c1 = parsed.cardLine1 != null ? String(parsed.cardLine1).trim() : "";
    var c2 = parsed.cardLine2 != null ? String(parsed.cardLine2).trim() : "";
    if (!c2 && parsed.eventName != null && String(parsed.eventName).trim()) {
      c2 = activityNameFromListingTitle(parsed.eventName);
    }
    if (c2) parsed.cardLine2 = c2;
    else delete parsed.cardLine2;
    parsed.eventName = deriveListingTitle(c1, c2);
    if (isArchivedPastEvent(parsed)) {
      parsed.isActive = false;
    }
  }

  function computeNextFeatureId(featureRows) {
    if (!Array.isArray(featureRows)) return "fe0001";
    var max = 0;
    function bumpId(raw) {
      if (raw == null) return;
      var s = String(raw).trim();
      var m = /^fe(\d+)$/i.exec(s);
      if (m) {
        var n = parseInt(m[1], 10);
        if (!isNaN(n)) max = Math.max(max, n);
        return;
      }
      m = /^ev(\d+)$/i.exec(s);
      if (m) {
        var n2 = parseInt(m[1], 10);
        if (!isNaN(n2)) max = Math.max(max, n2);
      }
    }
    for (var i = 0; i < featureRows.length; i++) {
      var r = featureRows[i];
      if (!r) continue;
      bumpId(r.id);
      bumpId(r.featureId);
    }
    var used = {};
    for (var u = 0; u < featureRows.length; u++) {
      var r2 = featureRows[u];
      if (!r2) continue;
      if (r2.id != null) used[String(r2.id).trim()] = true;
      if (r2.featureId != null) used[String(r2.featureId).trim()] = true;
    }
    var next = max + 1;
    var candidate;
    do {
      var numStr = String(next);
      while (numStr.length < 4) numStr = "0" + numStr;
      candidate = "fe" + numStr;
      next++;
    } while (used[candidate]);
    return candidate;
  }

  function isoDateLocalYmd() {
    return todayIsoLocal();
  }

  function buildNewFeatureRow(masterData) {
    var featureRows = masterData && Array.isArray(masterData.features) ? masterData.features : [];
    var fid = computeNextFeatureId(featureRows);
    var row = {
      featureId: fid,
      id: fid,
      date: isoDateLocalYmd(),
      startTime: "19:00",
      endTime: "",
      isActive: true,
      isFeatured: false,
      location: "Hall A",
      cardLine1: "New feature",
      cardLine2: "",
    };
    finalizeFeatureRow(row, masterData || {});
    row.cardLine3 = formatEventCardLine3FromIso(row.date);
    return row;
  }

  function validateFeatureRow(ev) {
    if (!ev || typeof ev !== "object") return "Invalid feature row.";
    if (isArchivedPastEvent(ev)) return "";
    var req = ["id", "date", "startTime", "cardLine1", "cardLine2", "eventName", "location"];
    for (var i = 0; i < req.length; i++) {
      var k = req[i];
      var v = ev[k];
      if (v == null || (typeof v === "string" && !String(v).trim())) {
        return "Features require a non-empty " + k + ".";
      }
    }
    if (ev.isActive === undefined || ev.isActive === null) {
      return "Features require isActive (true or false).";
    }
    return "";
  }

  var DATA_ADMIN_DUPLICATE_SLOT_PREFIX =
    "Two active features overlap in time at the same location";

  /** When endTime is blank, assume this span for venue conflict checks (typical 7–10pm hall use). */
  var DATA_ADMIN_DEFAULT_EVENT_DURATION_MIN = 180;

  function isDataAdminDuplicateSlotMessage(msg) {
    var s = String(msg || "");
    if (s.indexOf(DATA_ADMIN_DUPLICATE_SLOT_PREFIX) !== -1) return true;
    if (s.indexOf("Two active features share the same date, start time, and location") !== -1) return true;
    if (s.indexOf("Two active events overlap in time at the same location") !== -1) return true;
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
   * Only Hall B and Hall C are single-booking venues (one active feature per date/time slot).
   * Hall A, Rec Hall, etc. may host multiple concurrent features at the same location string.
   */
  function isDataAdminExclusiveVenueLocKey(locKey) {
    var k = String(locKey || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    return k === "hall b" || k === "hall c";
  }

  /**
   * Block two scheduling-active features that overlap in time at the same date and location.
   * Past-dated (archived) and inactive rows are skipped.
   * @param replaceIndex If >= 0, row at this index is treated as replacementEv for the check (edit / Apply).
   */
  function validateFeaturesNoDuplicateDateTimeLocation(evs, replaceIndex, replacementEv) {
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
    var evs = data.features;
    if (Array.isArray(evs)) {
      for (var ei = 0; ei < evs.length; ei++) {
        var emsg = validateFeatureRow(evs[ei]);
        if (emsg) return "features[" + ei + "] " + (evs[ei] && evs[ei].id ? "(" + evs[ei].id + ") " : "") + emsg;
      }
      var dupSlot = validateFeaturesNoDuplicateDateTimeLocation(evs, -1, null);
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

  function fieldLabelForForm(collectionKey, key) {
    if (collectionKey === "features") {
      if (key === "cardLine1")
        return "Short description of feature (max 48 characters; card line 1 — featured cards)";
      if (key === "cardLine2") return "Category / subtitle (max 48 characters; card line 2)";
      if (key === "cardLine3") return "Date line on card (card line 3; often auto from date)";
      if (key === "date") return "Event date (also drives card line 3 text when synced)";
      if (key === "startTime") return "Start & end time";
      if (key === "isFeatured")
        return "Featured (home: center strip, right Wed/Sat)";
    }
    if (collectionKey === "activities") {
      if (key === "activityName") return "Activity name (short title; left sidebar)";
      if (key === "description") return "Description (long)";
      if (key === "location") return "Location";
      if (key === "recurrenceType") return "Recurrence type";
    }
    return key;
  }

  var EVENT_FORM_KEY_ORDER = [
    "cardLine1",
    "cardLine2",
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
    if (collectionKey === "features") {
      keys = keys.filter(function (k) {
        return k !== "cardLine3" && k !== "eventName";
      });
      if (keys.indexOf("date") === -1) keys.push("date");
      if (keys.indexOf("cardLine1") === -1) keys.push("cardLine1");
      if (keys.indexOf("cardLine2") === -1) keys.push("cardLine2");
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
      if (collectionKey === "features" && key === "endTime") continue;
      let val = obj[key];
      if (collectionKey === "features" && key === "isFeatured" && val !== true && val !== false) {
        val = false;
      }
      if (collectionKey === "features" && key === "cardLine1" && (val === undefined || val === null)) {
        val = "";
      }
      if (collectionKey === "features" && key === "cardLine2" && (val === undefined || val === null)) {
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

      if (collectionKey === "features" && key === "date") {
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
          if (!ymd) throw new Error("date: choose a feature date.");
          if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error("date: use the calendar to set a valid date.");
          return { date: ymd, cardLine3: formatEventCardLine3FromIso(ymd) };
        };
        fieldsForm.appendChild(row);
        continue;
      }

      if (collectionKey === "features" && key === "startTime") {
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
        if (collectionKey === "features" && key === "isFeatured") {
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
          (collectionKey === "features" && (key === "cardLine1" || key === "cardLine2"));
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
        if (collectionKey === "features" && key === "cardLine1") {
          row.dataset.mmhpRowKind = "cardLine1";
          sinp.maxLength = 48;
        }
        if (collectionKey === "features" && key === "cardLine2") {
          row.dataset.mmhpRowKind = "cardLine2";
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

    if (collectionKey === "features") {
      var c1Row = fieldsForm.querySelector('[data-mmhp-row-kind="cardLine1"]');
      var c2Row = fieldsForm.querySelector('[data-mmhp-row-kind="cardLine2"]');
      var c1El = c1Row ? c1Row.querySelector("textarea, input") : null;
      var c2El = c2Row ? c2Row.querySelector("textarea, input") : null;
      if (c1El || c2El) {
        var evNRow = document.createElement("div");
        evNRow.className = "data-admin-edit-field-row";
        var evNLbl = document.createElement("div");
        evNLbl.className = "data-admin-edit-field-label";
        evNLbl.textContent = "Listing title (auto: card line 1 + card line 2)";
        var evNDisp = document.createElement("input");
        evNDisp.type = "text";
        evNDisp.readOnly = true;
        evNDisp.className = "data-admin-edit-field-input data-admin-edit-field--readonly";
        evNDisp.title = "Saved as eventName when you click Apply.";
        function syncListingTitlePreview() {
          var c1 = c1El ? String(c1El.value || "").trim() : "";
          var c2 = c2El ? String(c2El.value || "").trim() : "";
          evNDisp.value = deriveListingTitle(c1, c2);
        }
        if (c1El) c1El.addEventListener("input", syncListingTitlePreview);
        if (c2El) c2El.addEventListener("input", syncListingTitlePreview);
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
      if (ctx.collectionKey === "features") {
        finalizeFeatureRow(parsed, ctx.masterDataRef || {});
        var evErr = validateFeatureRow(parsed);
        if (evErr) {
          err.textContent = evErr;
          return;
        }
        var evs0 = ctx.masterDataRef && Array.isArray(ctx.masterDataRef.features) ? ctx.masterDataRef.features : [];
        var dupSlot = validateFeaturesNoDuplicateDateTimeLocation(evs0, ctx.rowIndex, parsed);
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
    viewEntries,
    baseEntries,
    collectionKey,
    masterData,
    setStatus,
    refreshSection,
    tableState
  ) {
    var wrap = document.createElement("div");
    wrap.className = "data-admin-table-wrap";
    var table = document.createElement("table");
    table.className = "data-admin-table";

    var modal = ensureEditModal(setStatus);

    var thead = document.createElement("thead");
    var trh = document.createElement("tr");
    var thSelect = document.createElement("th");
    thSelect.className = "data-admin-table__col-select";
    var selectAllCb = document.createElement("input");
    selectAllCb.type = "checkbox";
    selectAllCb.className = "data-admin-select-all";
    selectAllCb.title = "Select all visible rows in this table (up to 500)";
    selectAllCb.setAttribute("aria-label", "Select all visible rows");
    thSelect.appendChild(selectAllCb);
    trh.appendChild(thSelect);
    var thEdit = document.createElement("th");
    thEdit.className = "data-admin-table__col-edit";
    thEdit.textContent = "Edit";
    trh.appendChild(thEdit);
    for (var c = 0; c < columns.length; c++) {
      (function (colName) {
        var th = document.createElement("th");
        th.className = "data-admin-th-sortable";

        var uniquesForCol = uniqueColumnValues(baseEntries, colName, collectionKey);
        var hasActiveFilter =
          tableState.filters[colName] != null &&
          tableState.filters[colName].length > 0 &&
          tableState.filters[colName].length < uniquesForCol.length;
        if (hasActiveFilter) th.classList.add("data-admin-th--filtered");

        var inner = document.createElement("div");
        inner.className = "data-admin-th-inner";

        var sortBtn = document.createElement("button");
        sortBtn.type = "button";
        sortBtn.className = "data-admin-th-sort-btn";
        sortBtn.title = "Sort column (click: ascending, descending, then default order)";
        var sortText = document.createElement("span");
        sortText.className = "data-admin-th-text";
        sortText.textContent =
          collectionKey === "activities" && colName === "__scheduleSummary"
            ? "Schedule (weekdays · time)"
            : colName;
        var sortInd = document.createElement("span");
        sortInd.className = "data-admin-th-sort-ind";
        if (tableState.sortCol === colName) {
          sortInd.textContent = tableState.sortDir >= 0 ? " ▲" : " ▼";
          th.classList.add("data-admin-th--sorted");
        } else {
          sortInd.textContent = "";
        }
        sortBtn.appendChild(sortText);
        sortBtn.appendChild(sortInd);
        sortBtn.addEventListener("click", function () {
          if (tableState.sortCol !== colName) {
            tableState.sortCol = colName;
            tableState.sortDir = 1;
          } else if (tableState.sortDir === 1) {
            tableState.sortDir = -1;
          } else {
            tableState.sortCol = null;
            tableState.sortDir = 1;
          }
          refreshSection();
        });

        var filterBtn = document.createElement("button");
        filterBtn.type = "button";
        filterBtn.className = "data-admin-th-filter-btn";
        filterBtn.innerHTML = "&#9660;";
        filterBtn.title = "Filter this column";
        filterBtn.setAttribute(
          "aria-label",
          "Filter " +
            (collectionKey === "activities" && colName === "__scheduleSummary"
              ? "Schedule (weekdays · time)"
              : colName)
        );
        filterBtn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          openColumnFilterPanel(colName, baseEntries, tableState, refreshSection, filterBtn, collectionKey);
        });

        inner.appendChild(sortBtn);
        inner.appendChild(filterBtn);
        th.appendChild(inner);
        trh.appendChild(th);
      })(columns[c]);
    }
    var thDel = document.createElement("th");
    thDel.className = "data-admin-table__col-delete";
    thDel.textContent = "Delete";
    trh.appendChild(thDel);
    thead.appendChild(trh);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var maxRows = Math.min(viewEntries.length, 500);

    function syncBulkBar() {
      var rowCbs = tbody.querySelectorAll("input.data-admin-row-select");
      var n = rowCbs.length;
      var checked = 0;
      for (var si = 0; si < n; si++) {
        if (rowCbs[si].checked) checked++;
      }
      if (n === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checked === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checked === n) {
        selectAllCb.checked = true;
        selectAllCb.indeterminate = false;
      } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = true;
      }
      bulkDel.disabled = checked === 0;
      bulkCount.textContent = checked ? checked + " selected" : "";
      if (n === 0) {
        bulkToggle.disabled = true;
        bulkToggle.textContent = "Select all";
        bulkToggle.title = "No rows to select";
        bulkToggle.setAttribute("aria-label", "Select all visible rows");
      } else if (checked > 0) {
        bulkToggle.disabled = false;
        bulkToggle.textContent = "Deselect all";
        bulkToggle.title = "Uncheck every row in this table (visible rows only)";
        bulkToggle.setAttribute("aria-label", "Deselect all visible rows");
      } else {
        bulkToggle.disabled = false;
        bulkToggle.textContent = "Select all";
        bulkToggle.title = "Check every row in this table (visible rows only)";
        bulkToggle.setAttribute("aria-label", "Select all visible rows");
      }
    }

    var bulkBar = document.createElement("div");
    bulkBar.className = "data-admin-bulk-bar";
    var bulkDel = document.createElement("button");
    bulkDel.type = "button";
    bulkDel.className = "btn site-button data-admin-bulk-delete-btn";
    bulkDel.textContent = "Delete selected";
    bulkDel.disabled = true;
    bulkDel.title = "Delete all rows that are checked in this table";
    var bulkToggle = document.createElement("button");
    bulkToggle.type = "button";
    bulkToggle.className = "btn site-button data-admin-bulk-toggle-btn";
    bulkToggle.textContent = "Select all";
    bulkToggle.title = "Check every row in this table (visible rows only)";
    bulkToggle.setAttribute("aria-label", "Select all visible rows");
    var bulkCount = document.createElement("span");
    bulkCount.className = "data-admin-bulk-count";
    bulkCount.setAttribute("aria-live", "polite");
    var bulkClear = document.createElement("button");
    bulkClear.type = "button";
    bulkClear.className = "btn site-button data-admin-bulk-clear-btn";
    bulkClear.textContent = "Clear selection";
    bulkClear.title = "Uncheck all rows in this table";
    bulkBar.appendChild(bulkDel);
    bulkBar.appendChild(bulkToggle);
    bulkBar.appendChild(bulkCount);
    bulkBar.appendChild(bulkClear);
    parent.appendChild(bulkBar);

    for (var r = 0; r < maxRows; r++) {
      var tr = document.createElement("tr");
      var entry = viewEntries[r];
      var tdSel = document.createElement("td");
      tdSel.className = "data-admin-table__col-select";
      var rowCb = document.createElement("input");
      rowCb.type = "checkbox";
      rowCb.className = "data-admin-row-select";
      rowCb.dataset.mmhpRowIndex = String(entry.idx);
      rowCb.setAttribute(
        "aria-label",
        "Select row " + (entry.obj && entry.obj.id != null ? String(entry.obj.id) : "index " + entry.idx)
      );
      rowCb.addEventListener("change", syncBulkBar);
      tdSel.appendChild(rowCb);
      tr.appendChild(tdSel);
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
        td.textContent = dataAdminBrowseColumnDisplay(collectionKey, entry.obj, columns[cc]);
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
    if (maxRows === 0 && baseEntries.length > 0) {
      var trEmpty = document.createElement("tr");
      var tdEmpty = document.createElement("td");
      tdEmpty.colSpan = columns.length + 3;
      tdEmpty.className = "data-admin-table-empty-filtered";
      tdEmpty.textContent =
        "No rows match the current column filters or Filter rows text. Adjust ▼ column filters, clear the search box, or both.";
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);

    selectAllCb.addEventListener("change", function () {
      var rowCbs = tbody.querySelectorAll("input.data-admin-row-select");
      var want = !!selectAllCb.checked;
      for (var ai = 0; ai < rowCbs.length; ai++) rowCbs[ai].checked = want;
      selectAllCb.indeterminate = false;
      syncBulkBar();
    });

    bulkClear.addEventListener("click", function () {
      var rowCbs = tbody.querySelectorAll("input.data-admin-row-select");
      for (var ci = 0; ci < rowCbs.length; ci++) rowCbs[ci].checked = false;
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
      syncBulkBar();
    });

    bulkToggle.addEventListener("click", function () {
      var rowCbs = tbody.querySelectorAll("input.data-admin-row-select");
      var anyChecked = false;
      for (var ti = 0; ti < rowCbs.length; ti++) {
        if (rowCbs[ti].checked) {
          anyChecked = true;
          break;
        }
      }
      var want = !anyChecked;
      for (var tj = 0; tj < rowCbs.length; tj++) rowCbs[tj].checked = want;
      selectAllCb.checked = want && rowCbs.length > 0;
      selectAllCb.indeterminate = false;
      syncBulkBar();
    });

    bulkDel.addEventListener("click", function () {
      var rowCbs = tbody.querySelectorAll("input.data-admin-row-select:checked");
      if (rowCbs.length === 0) return;
      var indices = [];
      for (var di = 0; di < rowCbs.length; di++) {
        var ix = parseInt(rowCbs[di].dataset.mmhpRowIndex, 10);
        if (!isNaN(ix)) indices.push(ix);
      }
      indices.sort(function (a, b) {
        return b - a;
      });
      var uniq = [];
      for (var ui = 0; ui < indices.length; ui++) {
        if (ui === 0 || indices[ui] !== indices[ui - 1]) uniq.push(indices[ui]);
      }
      var msg =
        "Remove " +
        uniq.length +
        ' row(s) from "' +
        collectionKey +
        '"? This cannot be undone except by refreshing without saving.';
      if (!window.confirm(msg)) return;
      for (var ri = 0; ri < uniq.length; ri++) {
        masterData[collectionKey].splice(uniq[ri], 1);
      }
      setDataAdminUnsaved(true);
      refreshSection();
      setStatus(
        "Removed " +
          uniq.length +
          " row(s) from " +
          collectionKey +
          ". Export CSV or save master JSON; refresh page to reload from disk.",
        false
      );
    });

    syncBulkBar();

    parent.appendChild(wrap);

    if (viewEntries.length > maxRows) {
      var note = document.createElement("p");
      note.className = "data-admin-section-meta";
      note.textContent =
        "Showing first " +
        maxRows +
        " of " +
        viewEntries.length +
        " row(s) in this view. Export CSV includes all rows in the collection (not filtered).";
      parent.appendChild(note);
    } else if (viewEntries.length < baseEntries.length) {
      var noteF = document.createElement("p");
      noteF.className = "data-admin-section-meta";
      noteF.textContent =
        "Filtered view: " +
        viewEntries.length +
        " of " +
        baseEntries.length +
        " row(s). Clear column filters to see all rows in this section.";
      parent.appendChild(noteF);
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
      var hidePast = key === "features" && !!section._mmhpFeaturesHidePast;
      var objectEntries = buildObjectEntriesForDisplay(val, key, hidePast);

      var rowCountEl = section.querySelector(".data-admin-section-rowcount");
      if (rowCountEl) {
        if (key === "features" && hidePast) {
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
        if (key === "features" && hidePast && Array.isArray(val) && val.length > 0) {
          empty.textContent =
            "No features on or after today in this view. Use \"Show all features\" above to see past rows.";
        } else {
          empty.textContent = "No object rows.";
        }
        body.appendChild(empty);
        return;
      }

      var tableState = getOrInitTableState(section);
      var columns = filterDisplayColumnsForBrowse(
        orderDataAdminTableColumns(
          key,
          collectColumns(objectEntries.map(function (e) { return e.obj; }))
        )
      );
      pruneTableStateForColumns(tableState, columns);
      var viewEntries = applyTableViewState(objectEntries, columns, tableState, key);

      function refreshSection() {
        renderSection(section, key, masterData[key]);
      }

      renderTable(
        body,
        columns,
        viewEntries,
        objectEntries,
        key,
        masterData,
        setStatus,
        refreshSection,
        tableState
      );
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
        setStatus(
          "Message center: Load complete. Use Save changes to master JSON (under the header) to write to disk, or export CSV per table."
        );

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
            if (Array.isArray(masterData.features)) {
              for (var fi = 0; fi < masterData.features.length; fi++) {
                finalizeFeatureRow(masterData.features[fi], masterData);
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

        var addFeatureBtn = document.getElementById("mmhp-add-feature-btn");
        if (addFeatureBtn) {
          addFeatureBtn.onclick = function () {
            var nowMs = Date.now();
            if (nowMs - __dataAdminLastAddEventMs < 900) {
              return;
            }
            __dataAdminLastAddEventMs = nowMs;
            if (!masterData) {
              setStatus("No data loaded.", true);
              return;
            }
            if (!document.getElementById("collection-features")) {
              setStatus(
                "Cannot add a feature: this JSON has no features collection. Add a features array to the file and reload.",
                true
              );
              return;
            }
            if (!Array.isArray(masterData.features)) masterData.features = [];
            var nu = buildNewFeatureRow(masterData);
            masterData.features.push(nu);
            setDataAdminUnsaved(true);
            refreshSectionByKey("features");
            var modal = ensureEditModal(setStatus);
            var newIdx = masterData.features.length - 1;
            modal.__openEdit(
              "features",
              newIdx,
              masterData.features[newIdx],
              function (k, rowIdx, parsed) {
                masterData[k][rowIdx] = parsed;
                setDataAdminUnsaved(true);
                refreshSectionByKey(k);
              },
              masterData
            );
            setStatus(
              "Added feature " +
                nu.id +
                ". Complete the form and click Apply, then use Save changes to the Master Data File."
            );
          };
        }

        var purgePastBtn = document.getElementById("mmhp-purge-past-features-btn");
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
            if (!document.getElementById("collection-features")) {
              setStatus(
                "Cannot purge features: this JSON has no features collection.",
                true
              );
              return;
            }
            if (!Array.isArray(masterData.features)) masterData.features = [];
            var today = todayIsoLocal();
            var evs = masterData.features;
            var toRemove = 0;
            for (var pi = 0; pi < evs.length; pi++) {
              var ds = String(evs[pi] && evs[pi].date != null ? evs[pi].date : "").trim();
              if (ds.length === 10 && ds < today) toRemove++;
            }
            if (toRemove === 0) {
              setStatus("No features dated before " + today + " to remove.");
              return;
            }
            var msg =
              "Remove " +
              toRemove +
              " feature(s) dated before " +
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
            masterData.features = kept;
            setDataAdminUnsaved(true);
            refreshSectionByKey("features");
            setStatus(
              "Removed " + toRemove + " past feature(s). " + kept.length + " remain. Save to write the Master Data File."
            );
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
          if (key === "features") {
            h2.textContent = "Featured & dated features";
          } else if (key === "activities") {
            h2.textContent = "Recurring activities (left sidebar)";
          } else {
            h2.textContent = key;
          }
          section.appendChild(h2);

          var meta = document.createElement("p");
          meta.className = "data-admin-section-meta data-admin-section-rowcount";
          meta.textContent = val.length + " row(s)";
          section.appendChild(meta);

          var toolbar = document.createElement("div");
          toolbar.className = "data-admin-section-toolbar";

          getOrInitTableState(section);
          var searchWrap = document.createElement("div");
          searchWrap.className = "data-admin-section-search";
          var searchLabel = document.createElement("label");
          searchLabel.className = "data-admin-section-search-label";
          searchLabel.htmlFor = section.id + "-row-filter";
          searchLabel.textContent = "Filter rows";
          var searchInput = document.createElement("input");
          searchInput.type = "search";
          searchInput.id = section.id + "-row-filter";
          searchInput.className = "data-admin-section-search-input";
          searchInput.placeholder = "Contains text…";
          searchInput.setAttribute("autocomplete", "off");
          searchInput.setAttribute(
            "title",
            "Show rows where any displayed column contains this text (after column filters)"
          );
          searchInput.value = section._mmhpTableState.searchText || "";
          searchInput.addEventListener("input", function () {
            section._mmhpTableState.searchText = searchInput.value;
            renderSection(section, key, masterData[key]);
          });
          searchWrap.appendChild(searchLabel);
          searchWrap.appendChild(searchInput);
          toolbar.appendChild(searchWrap);

          if (key === "features") {
            section._mmhpFeaturesHidePast = false;
            var displayToggleBtn = document.createElement("button");
            displayToggleBtn.type = "button";
            displayToggleBtn.className = "btn site-button data-admin-features-display-toggle";
            displayToggleBtn.setAttribute(
              "aria-label",
              "Toggle between showing all features and hiding features before today"
            );
            function syncFeaturesDisplayToggleLabel() {
              displayToggleBtn.textContent = section._mmhpFeaturesHidePast ? "Show all features" : "Hide past features";
            }
            syncFeaturesDisplayToggleLabel();
            displayToggleBtn.addEventListener("click", function () {
              section._mmhpFeaturesHidePast = !section._mmhpFeaturesHidePast;
              syncFeaturesDisplayToggleLabel();
              if (!masterData || !Array.isArray(masterData.features)) return;
              renderSection(section, "features", masterData.features);
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
