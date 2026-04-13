(function () {
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

  function buildObjectEntries(val) {
    var objectEntries = [];
    for (var ri = 0; ri < val.length; ri++) {
      var o = val[ri];
      if (o && typeof o === "object" && !Array.isArray(o)) objectEntries.push({ idx: ri, obj: o });
    }
    return objectEntries;
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

  function finalizeEventRow(parsed, masterData) {
    if (!parsed || typeof parsed !== "object") return;
    delete parsed.cardLine2;
    var aid = parsed.activityId != null ? String(parsed.activityId).trim() : "";
    var c1 = parsed.cardLine1 != null ? String(parsed.cardLine1).trim() : "";
    parsed.eventName = deriveEventName(c1, aid, masterData || {});
  }

  function validateEventRow(ev) {
    if (!ev || typeof ev !== "object") return "Invalid event row.";
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
      if (key === "cardLine1") return "Event title (card line 1 — shown on featured cards)";
      if (key === "date") return "Event date (card line 3)";
      if (key === "startTime") return "Start & end time";
    }
    return key;
  }

  var EVENT_FORM_KEY_ORDER = [
    "id",
    "activityId",
    "cardLine1",
    "date",
    "startTime",
    "endTime",
    "location",
    "isActive",
  ];

  function sortEventFormKeys(keys) {
    return keys.slice().sort(function (a, b) {
      var ia = EVENT_FORM_KEY_ORDER.indexOf(a);
      var ib = EVENT_FORM_KEY_ORDER.indexOf(b);
      if (ia === -1) ia = 999;
      if (ib === -1) ib = 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b);
    });
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
      keys = sortEventFormKeys(keys);
    }
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (collectionKey === "activities" && key === "recurrenceDetails") continue;
      if (collectionKey === "events" && key === "endTime") continue;
      var val = obj[key];
      if (collectionKey === "events" && key === "cardLine1" && (val === undefined || val === null)) {
        val = "";
      }
      var row = document.createElement("div");
      row.className = "data-admin-edit-field-row";
      row.dataset.editFieldKey = key;

      var lbl = document.createElement("div");
      lbl.className = "data-admin-edit-field-label";
      lbl.textContent = fieldLabelForForm(collectionKey, key);
      row.appendChild(lbl);

      if (key === "id") {
        var origId = obj.id;
        var roInp = document.createElement("input");
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
        var sel = document.createElement("select");
        sel.className = "data-admin-edit-field-select";
        sel.setAttribute("aria-label", "Activity");
        var optBlank = document.createElement("option");
        optBlank.value = "";
        optBlank.textContent = "— Select activity —";
        sel.appendChild(optBlank);
        var actOpts = buildActivitySelectOptions(masterData);
        var curAct = val != null && val !== undefined ? String(val).trim() : "";
        var foundAct = false;
        for (var ao = 0; ao < actOpts.length; ao++) {
          var opt = document.createElement("option");
          opt.value = actOpts[ao].id;
          opt.textContent = actOpts[ao].name;
          sel.appendChild(opt);
          if (actOpts[ao].id === curAct) foundAct = true;
        }
        if (curAct && !foundAct) {
          var optOr = document.createElement("option");
          optOr.value = curAct;
          optOr.textContent = "Other (id: " + curAct + ")";
          sel.appendChild(optOr);
        }
        sel.value = curAct;
        row.appendChild(sel);
        row.dataset.mmhpRowKind = "activityId";
        var actHint = document.createElement("p");
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
        var dateInp = document.createElement("input");
        dateInp.type = "date";
        dateInp.className = "data-admin-edit-field-input data-admin-edit-field-input--date";
        var iso = String(obj.date != null ? obj.date : "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) dateInp.value = iso;
        var preview = document.createElement("p");
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
        var timePair = document.createElement("div");
        timePair.className = "data-admin-edit-field-time-pair";
        var idSuffix = String(obj.id != null ? obj.id : "row").replace(/[^a-zA-Z0-9_-]/g, "-");

        var stWrap = document.createElement("div");
        stWrap.className = "data-admin-edit-field-time-item";
        var stLab = document.createElement("div");
        stLab.className = "data-admin-edit-field-time-label";
        stLab.textContent = "Start";
        var startSeed =
          String(obj.startTime != null ? obj.startTime : "").trim() || "19:00";
        var startSp = createTimeSpinner12(startSeed);
        stWrap.appendChild(stLab);
        stWrap.appendChild(startSp.el);

        var etWrap = document.createElement("div");
        etWrap.className = "data-admin-edit-field-time-item";
        var etLab = document.createElement("div");
        etLab.className = "data-admin-edit-field-time-label";
        etLab.textContent = "End";
        var endHasValue = !!toHtmlTimeValue(obj.endTime);
        var noEndChk = document.createElement("input");
        noEndChk.type = "checkbox";
        noEndChk.id = "data-admin-ev-noend-" + idSuffix;
        var noEndLbl = document.createElement("label");
        noEndLbl.className = "data-admin-edit-field-noend";
        noEndLbl.htmlFor = noEndChk.id;
        noEndLbl.appendChild(noEndChk);
        noEndLbl.appendChild(document.createTextNode(" No end time"));
        var endSp = createTimeSpinner12(endHasValue ? obj.endTime : startSeed);
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
        var timeHint = document.createElement("p");
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
        var g = document.createElement("div");
        g.className = "data-admin-field-bool-group";
        var t = document.createElement("button");
        var f = document.createElement("button");
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
      } else if (typeof val === "number" && !isNaN(val)) {
        var inp = document.createElement("input");
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
        var g2 = document.createElement("div");
        g2.className = "data-admin-field-bool-group";
        var bNull = document.createElement("button");
        var bText = document.createElement("button");
        bNull.type = "button";
        bText.type = "button";
        bNull.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        bText.className = "data-admin-recurrence-day-btn data-admin-field-bool-btn";
        bNull.textContent = "Null";
        bText.textContent = "Text";
        var inpS = document.createElement("input");
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
        var long =
          val.length > 100 ||
          /[\r\n]/.test(val) ||
          (collectionKey === "events" && key === "cardLine1");
        var sinp;
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
        }
        sinp.value = val;
        row.appendChild(sinp);
        row.__readField = function () {
          return String(sinp.value || "");
        };
      } else {
        var jta = document.createElement("textarea");
        jta.className = "data-admin-edit-field-textarea data-admin-edit-field-textarea--json";
        jta.setAttribute("spellcheck", "false");
        jta.value = JSON.stringify(val, null, 2);
        var lines = String(jta.value).split("\n").length;
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
        evNLbl.textContent = "Listing title (auto: event title + activity)";
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
        var anchor = c1Row || actRow;
        if (anchor.nextSibling) anchor.parentNode.insertBefore(evNRow, anchor.nextSibling);
        else anchor.parentNode.appendChild(evNRow);
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
      err.textContent = "";
      ctx.onApplied = null;
      ctx.masterDataRef = null;
    }

    btnCancel.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) close();
    });

    btnApply.addEventListener("click", function () {
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
        "input, textarea, button.data-admin-recurrence-day-btn, button.data-admin-field-bool-btn"
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

    var masterData = null;

    function setStatus(msg, isError) {
      if (!status) return;
      status.textContent = msg || "";
      status.classList.toggle("data-admin-status--error", !!isError);
    }

    function renderSection(section, key, val) {
      var rowCountEl = section.querySelector(".data-admin-section-rowcount");
      if (rowCountEl) rowCountEl.textContent = val.length + " row(s)";

      var body = section.querySelector(".data-admin-section-body");
      if (body) body.remove();

      body = document.createElement("div");
      body.className = "data-admin-section-body";
      section.appendChild(body);

      var objectEntries = buildObjectEntries(val);
      if (objectEntries.length === 0) {
        var empty = document.createElement("p");
        empty.className = "data-admin-section-meta";
        empty.textContent = "No object rows.";
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

    setStatus("Loading JSON…");

    fetch(jsonPath)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        masterData = data;
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
                });
            } else {
              downloadText("mmhp-master-data.json", text, "application/json;charset=utf-8");
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

            function closeModal() {
              modal.hidden = true;
              cancelBtn.removeEventListener("click", onCancel);
              okBtn.removeEventListener("click", onOk);
              if (backdrop) backdrop.removeEventListener("click", onBackdrop);
              document.removeEventListener("keydown", onKey);
            }

            function onCancel() {
              closeModal();
              setStatus("Save cancelled.");
            }

            function onOk() {
              closeModal();
              runMasterJsonSaveToDisk();
            }

            function onBackdrop(e) {
              if (e.target === backdrop) onCancel();
            }

            function onKey(e) {
              if (e.key === "Escape") onCancel();
            }

            cancelBtn.addEventListener("click", onCancel);
            okBtn.addEventListener("click", onOk);
            if (backdrop) backdrop.addEventListener("click", onBackdrop);
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
