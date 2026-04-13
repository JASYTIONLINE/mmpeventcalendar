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

  var FALLBACK_IMAGES = ["rec-hall.png", "dinner.png", "park-banner.png"];

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

  /** Left sidebar slot: line 1 = event name, line 2 = time + location. */
  function sidebarSlotTitleAndMeta(name, hhmm, location) {
    var n = String(name || "").trim();
    var t = formatSlotTime(hhmm);
    var loc = String(location || "").trim();
    var meta = [t, loc].filter(Boolean).join(" ");
    return { title: n || "—", meta: meta };
  }

  function appendSidebarScheduleSlot(li, slot) {
    var titleEl = document.createElement("span");
    titleEl.className = "sidebar-schedule-line__title";
    titleEl.textContent = slot.title;
    li.appendChild(titleEl);
    if (slot.meta) {
      var metaEl = document.createElement("span");
      metaEl.className = "sidebar-schedule-line__meta";
      metaEl.textContent = slot.meta;
      li.appendChild(metaEl);
    }
    li.setAttribute("aria-label", slot.meta ? slot.title + ", " + slot.meta : slot.title);
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
   * Split event title into line1 (name / headliner) and line2 (what the act is).
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

  /** Max lengths for card lines (matches Google Form validation guidance on Submit page). */
  var CARD_LINE_MAX = { 1: 36, 2: 48, 3: 32 };

  function clampCardLineDisplay(str, maxLen) {
    var s = String(str || "").trim();
    if (!maxLen || s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + "\u2026";
  }

  /** Line 1–3 for featured cards: prefer ev.cardLine1/2/3; else derive from title + date. */
  function getFeaturedCardLines(ev, act, dt) {
    var name = eventTitle(ev) || "Event";
    var actHint = act && act.activityName ? String(act.activityName).trim() : "";
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

  function activityById(activities) {
    var map = {};
    for (var i = 0; i < activities.length; i++) {
      var a = activities[i];
      if (a && a.id != null) {
        var id = String(a.id).trim();
        if (id) map[id] = a;
      }
    }
    return map;
  }

  function lookupActivity(map, rawActivityId) {
    if (!map) return undefined;
    var id = String(rawActivityId != null ? rawActivityId : "").trim();
    return id ? map[id] : undefined;
  }

  function activityHintFromListingTitle(listingTitle) {
    var t = String(listingTitle || "").trim();
    var idx = t.lastIndexOf(LISTING_TITLE_SEP);
    if (idx === -1) return "";
    return t.slice(idx + LISTING_TITLE_SEP.length).trim();
  }

  function isRecurringActivity(act) {
    return act && String(act.recurrenceType || "").trim() === "Recurring";
  }

  function isOneOffActivity(act) {
    return act && !isRecurringActivity(act);
  }

  function getMasterJsonUrl() {
    var u = document.body.getAttribute("data-mmhp-master-json");
    if (u) return u;
    var aside = document.querySelector("aside.site-sidebar-left[data-mmhp-master-json]");
    return aside ? aside.getAttribute("data-mmhp-master-json") : null;
  }

  function assetsImagesDir(jsonUrl) {
    if (!jsonUrl) return "assets/images";
    return jsonUrl.indexOf("../") === 0 ? "../assets/images" : "assets/images";
  }

  function learnMoreHref() {
    return /contents[/\\]/i.test(window.location.pathname) ? "learn-more.html" : "contents/learn-more.html";
  }

  var MAX_FEATURED_CARDS = 2;

  var HOME_WIDE_MIN_PX = 1101;
  /** Must match --mmhp-calendar-embed-max-height in style.css */
  var MMHP_HOME_CALENDAR_MAX_PX = 1440;
  /** Cap main column height from viewport so it stays in line with the CSS embed max + heading + featured */
  var MMHP_HOME_MAIN_VIEWPORT_CAP_PX = MMHP_HOME_CALENDAR_MAX_PX + 480;

  function isHomeWideLayout() {
    return (
      document.body.classList.contains("page-home") &&
      window.matchMedia("(min-width: " + HOME_WIDE_MIN_PX + "px)").matches
    );
  }

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

  /**
   * Vertical space from the top of the three-column layout to the bottom of the visual viewport.
   * Used so the center column can grow taller than the left sidebar — otherwise the Google Calendar
   * iframe is capped at sidebar height and month view only shows the first week or two.
   */
  function homeMainMinHeightFromViewportPx() {
    var layout = document.querySelector("body.page-home .site-layout");
    if (!layout) return 0;
    var rect = layout.getBoundingClientRect();
    /* Past ~one row of scroll the row is moving off-screen; don't keep inflating main to (vh - negativeTop). */
    if (rect.top < -12) return 0;
    var vv = window.visualViewport;
    var vh = vv && vv.height ? vv.height : window.innerHeight;
    return Math.max(0, Math.floor(vh - rect.top - 8));
  }

  function syncHomeMainHeight() {
    if (!document.body.classList.contains("page-home")) return;
    var main = document.querySelector("body.page-home .site-main");
    var left = document.querySelector(".site-sidebar-left");
    if (!main || !left) return;
    if (!isHomeWideLayout()) {
      main.style.height = "";
      return;
    }
    var leftH = Math.max(left.offsetHeight, 0);
    var viewRaw = homeMainMinHeightFromViewportPx();
    var viewH = viewRaw > 0 ? Math.min(viewRaw, MMHP_HOME_MAIN_VIEWPORT_CAP_PX) : 0;
    main.style.height = Math.max(leftH, viewH) + "px";
  }

  function buildEnrichedFeatured(data) {
    var acts = activityById(data.activities || []);
    var events = (data.events || []).filter(function (ev) {
      if (ev.isActive === false) return false;
      return isFeaturedEvent(ev, acts);
    });

    var today = startOfTodayLocal();
    var enriched = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var dt = parseISODateLocal(ev.date);
      if (!dt || dt < today) continue;
      enriched.push({
        ev: ev,
        dt: dt,
        act: lookupActivity(acts, ev.activityId),
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
    var linkHref = learnMoreHref();

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

      var a = document.createElement("a");
      a.className = "featured-card-link";
      a.href = linkHref;

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

  function fitHomeFeaturedCards(data, grid, jsonUrl) {
    if (!grid) return;
    var main = document.querySelector("body.page-home .site-main");
    var left = document.querySelector(".site-sidebar-left");
    if (!main || !left) return;

    var enriched = buildEnrichedFeatured(data);
    var maxN = enriched.length;

    if (!isHomeWideLayout()) {
      main.style.height = "";
      var capNarrow = Math.min(maxN, 24);
      renderFeaturedFromEnriched(enriched.slice(0, capNarrow), grid, jsonUrl, 0);
      return;
    }

    var n;
    syncHomeMainHeight();
    for (n = maxN; n >= 0; n--) {
      syncHomeMainHeight();
      renderFeaturedFromEnriched(enriched.slice(0, n), grid, jsonUrl, 0);
      syncHomeMainHeight();
      if (main.scrollHeight <= main.clientHeight + 2) break;
    }
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

  /** Prefer explicit isFeatured; else infer from linked activity when unset (legacy one-offs). */
  function isFeaturedEvent(ev, acts) {
    if (ev.isFeatured === true) return true;
    if (ev.isFeatured === false) return false;
    var act = lookupActivity(acts, ev.activityId);
    return isOneOffActivity(act);
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
   * Optional activity schedule when there are no dated events yet.
   * recurrenceDetails.slots: [ { weekday: "Wednesday", startTime: "09:00" }, ... ]
   * Or recurrenceDetails.weekdays: [ "Monday", "Wednesday" ] + startTime: "14:00"
   */
  function mergeRecurrenceFromActivity(buckets, act) {
    if (!isRecurringActivity(act)) return;
    var name = (act.activityName || "").trim();
    if (!name || /^unknown$/i.test(name)) return;

    var rd = act.recurrenceDetails || {};
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
      var minutes = parseTimeToMinutes(st);
      var dedupeKey = st + "\t" + name + "\t" + loc;
      if (!buckets[di].has(dedupeKey)) {
        buckets[di].set(dedupeKey, {
          minutes: minutes,
          title: slot.title,
          meta: slot.meta,
        });
      }
    }
  }

  function renderRecurringSchedule(data, list) {
    if (!list) return;

    var acts = activityById(data.activities || []);
    var events = (data.events || []).filter(function (ev) {
      return ev.isActive !== false;
    });

    var buckets = [];
    for (var b = 0; b < 7; b++) buckets.push(new Map());

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var act = lookupActivity(acts, ev.activityId);
      if (!isRecurringActivity(act)) continue;

      var dt = parseISODateLocal(ev.date);
      if (!dt) continue;
      var name = eventTitle(ev);
      if (!name) continue;

      var idx = mondayFirstIndex(dt.getDay());
      var st = eventStartTime(ev);
      var loc = eventLocation(ev, act);
      var dedupeKey = st + "\t" + name + "\t" + loc;
      var minutes = parseTimeToMinutes(st);
      var slot = sidebarSlotTitleAndMeta(name, st, loc);

      if (!buckets[idx].has(dedupeKey)) {
        buckets[idx].set(dedupeKey, {
          minutes: minutes,
          title: slot.title,
          meta: slot.meta,
        });
      }
    }

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
        placeholder.textContent = "—";
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
    var acts = activityById(data.activities || []);
    var events = data.events || [];
    var candidates = [];
    var targetMs = dayStart.getTime();
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.isActive === false) continue;
      if (!isFeaturedEvent(ev, acts)) continue;
      var dt = parseISODateLocal(ev.date);
      if (!dt || dt.getTime() !== targetMs) continue;
      candidates.push({
        ev: ev,
        dt: dt,
        act: lookupActivity(acts, ev.activityId),
        minutes: parseTimeToMinutes(eventStartTime(ev)),
      });
    }
    candidates.sort(function (a, b) {
      return a.minutes - b.minutes;
    });
    return candidates.length ? candidates[0] : null;
  }

  /** Any active featured event with date in [windowStart, windowEnd] (inclusive, local dates). */
  function anyFeaturedInDateWindow(data, windowStart, windowEnd) {
    var acts = activityById(data.activities || []);
    var events = data.events || [];
    var lo = windowStart.getTime();
    var hi = windowEnd.getTime();
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      if (ev.isActive === false) continue;
      if (!isFeaturedEvent(ev, acts)) continue;
      var dt = parseISODateLocal(ev.date);
      if (!dt) continue;
      var t = dt.getTime();
      if (t >= lo && t <= hi) return true;
    }
    return false;
  }

  /**
   * Home right rail: this calendar week’s Wednesday and Saturday (week starts Sunday).
   * Only shows a card when that day is still upcoming or today and within the next 6 days from today
   * (inclusive: today through today+6). If no featured events exist anywhere in that window, both slots empty.
   */
  function weekSpotlightWednesdaySaturdayItems(data) {
    var today = startOfTodayLocal();
    var windowEnd = addDaysLocal(today, 6);
    var sundayThisWeek = addDaysLocal(today, -today.getDay());
    var dWed = addDaysLocal(sundayThisWeek, 3);
    var dSat = addDaysLocal(sundayThisWeek, 6);

    if (!anyFeaturedInDateWindow(data, today, windowEnd)) {
      return { wed: null, sat: null };
    }

    var wed = null;
    var sat = null;
    var lo = today.getTime();
    var hi = windowEnd.getTime();
    if (dWed.getTime() >= lo && dWed.getTime() <= hi) wed = findFeaturedOnDate(data, dWed);
    if (dSat.getTime() >= lo && dSat.getTime() <= hi) sat = findFeaturedOnDate(data, dSat);
    return { wed: wed, sat: sat };
  }

  function renderWeekSpotlightCardInto(host, item, imageOffset, jsonUrl, emptyWeekdayName) {
    if (!host) return;
    host.textContent = "";
    var imagesDir = assetsImagesDir(jsonUrl);
    var linkHref = learnMoreHref();

    var article = document.createElement("article");
    article.className = "site-card featured-card week-spotlight-card";

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
    a.href = linkHref;

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
    var wedHost = document.getElementById("mmhp-week-spotlight-wednesday");
    var satHost = document.getElementById("mmhp-week-spotlight-saturday");
    if (!wedHost || !satHost) return;

    var pair = weekSpotlightWednesdaySaturdayItems(data);

    renderWeekSpotlightCardInto(wedHost, pair.wed, 0, jsonUrl, "Wednesday");
    renderWeekSpotlightCardInto(satHost, pair.sat, 1, jsonUrl, "Saturday");
  }

  function init() {
    var url = getMasterJsonUrl();
    var list = document.querySelector("aside.site-sidebar-left .recurring-events-list");
    var homeFeaturedGrid = document.querySelector(".page-home-featured-grid");
    var rightGrid = document.querySelector("aside.site-sidebar-right .featured-events-grid");

    if (!url || (!list && !homeFeaturedGrid && !rightGrid)) return;

    var dataRef = null;

    function runHomeFit() {
      if (homeFeaturedGrid && dataRef) fitHomeFeaturedCards(dataRef, homeFeaturedGrid, url);
    }

    var debouncedHomeFit = debounce(runHomeFit, 180);

    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then(function (data) {
        dataRef = data;
        if (list) renderRecurringSchedule(data, list);
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
          var wedHost = document.getElementById("mmhp-week-spotlight-wednesday");
          var satHost = document.getElementById("mmhp-week-spotlight-saturday");
          if (
            wedHost &&
            satHost &&
            document.body.classList.contains("page-home")
          ) {
            function errCard(msg) {
              var art = document.createElement("article");
              art.className = "site-card featured-card";
              var p = document.createElement("p");
              p.className = "featured-card-caption";
              p.textContent = msg;
              art.appendChild(p);
              return art;
            }
            wedHost.textContent = "";
            satHost.textContent = "";
            wedHost.appendChild(errCard("Could not load this week’s events."));
            satHost.appendChild(errCard("Could not load this week’s events."));
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
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
