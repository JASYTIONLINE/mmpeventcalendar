(function () {
  var LOCATION_PRESET_OTHER = "__other__";
  var KNOWN_HALLS = { "Hall A": true, "Hall B": true, "Hall C": true };
  var LOCATION_OTHER_PLACEHOLDER = "Add other location here";

  var TIME_24H_RE = /^\d{1,2}:\d{2}$/;

  var IMAGE_INPUT_IDS = [
    "mmhp-submit-image-feature",
    "mmhp-submit-image-extra-1",
    "mmhp-submit-image-extra-2",
    "mmhp-submit-image-extra-3",
    "mmhp-submit-image-extra-4",
  ];

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

  /** Conservative vs typical Gmail (~25 MB) / Outlook (~20 MB) outgoing limits (ZIP + overhead). */
  var MMHP_IMAGE_MAX_SINGLE_BYTES = 4 * 1024 * 1024;
  var MMHP_IMAGE_MAX_TOTAL_BYTES = 16 * 1024 * 1024;

  function getCoordinatorEmail() {
    if (typeof window.mmhpGetCoordinatorEmail === "function") {
      return window.mmhpGetCoordinatorEmail();
    }
    var raw = document.body && document.body.getAttribute("data-mmhp-coordinator-email");
    var v = raw != null ? String(raw).trim() : "";
    return v || "johnbarkle@msn.com";
  }

  function getMasterJsonUrl() {
    var u = document.body && document.body.getAttribute("data-mmhp-master-json");
    return u ? String(u).trim() : "";
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayIsoLocal() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

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

  function activityNameFromListingTitle(listingTitle) {
    var t = String(listingTitle || "").trim();
    var sep = " — ";
    var idx = t.lastIndexOf(sep);
    if (idx === -1) return "";
    return t.slice(idx + sep.length).trim();
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

  /** Same style as data-admin card line 3; capped at 32 chars for site cards. */
  function cardLine3FromEventDate(isoYmd) {
    var s = formatEventCardLine3FromIso(isoYmd);
    s = String(s || "").trim();
    if (s.length > 32) s = s.slice(0, 32);
    return s;
  }

  function finalizeFeatureRow(ev) {
    if (!ev || typeof ev !== "object") return;
    if (Object.prototype.hasOwnProperty.call(ev, "activityId")) {
      delete ev.activityId;
    }
    var sid = ev.id != null ? String(ev.id).trim() : "";
    var sfid = ev.featureId != null ? String(ev.featureId).trim() : "";
    if (sid && !sfid) ev.featureId = sid;
    if (sfid && !sid) ev.id = sfid;
    if (ev.id != null) ev.id = String(ev.id).trim();
    if (ev.featureId != null) ev.featureId = String(ev.featureId).trim();
    var c1 = ev.cardLine1 != null ? String(ev.cardLine1).trim() : "";
    var c2 = ev.cardLine2 != null ? String(ev.cardLine2).trim() : "";
    if (!c2 && ev.eventName != null && String(ev.eventName).trim()) {
      c2 = activityNameFromListingTitle(ev.eventName);
    }
    if (c2) ev.cardLine2 = c2;
    else delete ev.cardLine2;
    ev.eventName = deriveListingTitle(c1, c2);
  }

  function validateSubmissionForm(ev) {
    if (!ev || typeof ev !== "object")
      return { message: "Something went wrong. Please reload and try again.", focusEl: null };

    function needStr(v) {
      return v != null && String(v).trim() !== "";
    }

    var el;

    if (!needStr(ev.id))
      return { message: "Feature id is missing.", focusEl: document.getElementById("mmhp-submit-id") };

    el = document.getElementById("mmhp-submit-date");
    if (!needStr(ev.date))
      return { message: "Please choose a date.", focusEl: el };

    el = document.getElementById("mmhp-submit-startTime");
    if (!needStr(ev.startTime))
      return { message: "Please enter a start time.", focusEl: el };
    if (!TIME_24H_RE.test(String(ev.startTime).trim()))
      return { message: "Start time must look like 19:00 (hours:minutes).", focusEl: el };

    el = document.getElementById("mmhp-submit-endTime");
    if (!needStr(ev.endTime))
      return { message: "Please enter an end time.", focusEl: el };
    if (!TIME_24H_RE.test(String(ev.endTime).trim()))
      return { message: "End time must look like 21:00 (hours:minutes).", focusEl: el };

    var presetEl = document.getElementById("mmhp-submit-location-preset");
    if (!presetEl || !String(presetEl.value || "").trim())
      return { message: "Please choose a location.", focusEl: presetEl };

    if (presetEl.value === LOCATION_PRESET_OTHER) {
      el = document.getElementById("mmhp-submit-location-other");
      if (!needStr(ev.location))
        return { message: "Please enter the other location.", focusEl: el };
    } else if (!needStr(ev.location)) {
      return { message: "Please choose a location.", focusEl: presetEl };
    }

    el = document.getElementById("mmhp-submit-cardLine1");
    if (!el || !needStr(el.value))
      return { message: "Please enter the short description of the event (line 1).", focusEl: el };

    el = document.getElementById("mmhp-submit-cardLine2");
    if (!el || !needStr(el.value))
      return { message: "Please enter the short description (line 2).", focusEl: el };

    if (!needStr(ev.eventName))
      return {
        message: "Listing title is missing. Check both short descriptions.",
        focusEl: document.getElementById("mmhp-submit-cardLine1"),
      };

    if (ev.isActive === undefined || ev.isActive === null)
      return {
        message: "Please choose whether the event is active.",
        focusEl: document.getElementById("mmhp-submit-isActive"),
      };

    el = document.getElementById("mmhp-submit-image-feature");
    if (!el || !el.files || !el.files[0])
      return { message: "Please choose a featured image.", focusEl: el };

    return { message: "", focusEl: null };
  }

  function announceIncompleteForm(statusEl, message, focusEl) {
    if (statusEl) {
      statusEl.textContent = message + " Complete the form to continue.";
      statusEl.hidden = false;
    }
    var main = document.getElementById("submission-main");
    var form = document.getElementById("mmhp-event-submit-form");
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#mmhp-event-submit-form"
        );
      } else {
        window.location.hash = "mmhp-event-submit-form";
      }
    } catch (ignore) {}

    window.setTimeout(function () {
      if (main && typeof main.focus === "function") {
        try {
          main.focus({ preventScroll: true });
        } catch (e) {
          try {
            main.focus();
          } catch (e2) {}
        }
      }
      if (focusEl && typeof focusEl.focus === "function") {
        try {
          focusEl.focus({ preventScroll: true });
        } catch (e) {
          try {
            focusEl.focus();
          } catch (e2) {}
        }
      }
      var scrollEl = focusEl || form || main;
      if (scrollEl && scrollEl.scrollIntoView) {
        scrollEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
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

  function eventToScheduleRow(ev) {
    var title = ev.eventName != null ? ev.eventName : ev.title != null ? ev.title : "";
    var c1 = ev.cardLine1 != null ? String(ev.cardLine1) : "";
    var c2 = ev.cardLine2 != null ? String(ev.cardLine2) : "";
    var c3 = ev.cardLine3 != null ? String(ev.cardLine3) : "";
    return [
      "event",
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
      ev.imagePath != null ? String(ev.imagePath) : "",
      ev.featureId || ev.id || "",
      ev.date || "",
      ev.startTime || "",
      ev.endTime != null ? String(ev.endTime) : "",
      ev.isActive === false ? "false" : "true",
      ev.location || "",
      title,
      c1,
      c2,
      c3,
      ev.isFeatured === true ? "true" : ev.isFeatured === false ? "false" : "",
    ];
  }

  function fileDateStamp() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  function eventSummaryPlainText(ev) {
    if (!ev || typeof ev !== "object") return "";
    var lines = [
      "Event submission",
      "",
      "Id: " + (ev.id || ""),
      "Feature id: " + (ev.featureId || ev.id || ""),
      "Listing title: " + (ev.eventName || ""),
      "Date: " + (ev.date || ""),
      "Start: " + (ev.startTime || ""),
      "End: " + (ev.endTime != null ? String(ev.endTime) : ""),
      "Location: " + (ev.location || ""),
      "Card line 1: " + (ev.cardLine1 || ""),
      "Card line 2: " + (ev.cardLine2 || ""),
      "Card line 3: " + (ev.cardLine3 || ""),
      "Active: " + (ev.isActive === false ? "false" : "true"),
      "Featured: " + (ev.isFeatured === true ? "true" : ev.isFeatured === false ? "false" : ""),
      "Image filename hint: " + (ev.imagePath || "(none)"),
    ];
    return lines.join("\r\n");
  }

  function collectImageFilesInOrder() {
    var out = [];
    for (var i = 0; i < IMAGE_INPUT_IDS.length; i++) {
      var el = document.getElementById(IMAGE_INPUT_IDS[i]);
      if (el && el.files && el.files[0]) out.push(el.files[0]);
    }
    return out;
  }

  function sanitizeZipEntryName(name) {
    var n = String(name || "image").replace(/[/\\]/g, "_").replace(/\.\.+/g, ".");
    n = n.replace(/^\.+/, "") || "image";
    if (n.length > 100) n = n.slice(-100);
    return n;
  }

  function buildCsvFile(csvBody, stamp) {
    return new File(["\uFEFF" + csvBody], "mmhp-event-submission-" + stamp + ".csv", {
      type: "text/csv;charset=utf-8",
    });
  }

  function downloadBlob(blob, filename) {
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

  function openMailtoCoordinator(coordinatorEmail, ev, statusEl, leadNotice) {
    var subject = "Event submission: " + (ev.eventName || ev.id || "new event");
    var summary = eventSummaryPlainText(ev);
    var notice = leadNotice != null ? String(leadNotice).trim() : "";
    var body;
    if (notice) {
      body =
        "READ FIRST — ATTACHMENT\r\n" +
        notice +
        "\r\n\r\n————————————————————————————\r\n\r\n" +
        "Event details (same as inside the ZIP where applicable):\r\n\r\n" +
        summary +
        "\r\n\r\n—\r\nCoordinator: " +
        coordinatorEmail +
        "\r\n";
    } else {
      body =
        summary +
        "\r\n\r\n—\r\n" +
        "Attach the CSV and photos from Share, or the downloaded ZIP / CSV, then send.\r\n\r\nTo: " +
        coordinatorEmail +
        "\r\n";
    }
    window.location.href =
      "mailto:" +
      coordinatorEmail +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    if (statusEl) {
      statusEl.textContent =
        "Opened email to " +
        coordinatorEmail +
        ". Attach the downloaded file(s) if prompted, then send.";
      statusEl.hidden = false;
    }
  }

  function buildSubmissionZipBlob(csvBody, stamp, ev, imageFiles) {
    if (typeof JSZip === "undefined") return Promise.reject(new Error("JSZip not loaded"));
    var zip = new JSZip();
    zip.file("mmhp-event-submission-" + stamp + ".csv", "\uFEFF" + csvBody);
    zip.file("event-summary.txt", eventSummaryPlainText(ev));
    for (var i = 0; i < imageFiles.length; i++) {
      var f = imageFiles[i];
      var prefix = i === 0 ? "featured" : "extra-" + i;
      zip.file(prefix + "-" + sanitizeZipEntryName(f.name), f);
    }
    return zip.generateAsync({ type: "blob" });
  }

  /**
   * Delivers CSV + images to the coordinator: Web Share with attachments when supported;
   * otherwise ZIP download + mailto. Coordinator address from mmhp-coordinator-config.js (and optional body data-mmhp-coordinator-email).
   */
  function deliverSubmissionToCoordinator(coordinatorEmail, ev, csvBody, statusEl, stamp) {
    return new Promise(function (resolve, reject) {
      coordinatorEmail =
        coordinatorEmail && String(coordinatorEmail).trim()
          ? String(coordinatorEmail).trim()
          : getCoordinatorEmail();

      var subject = "Event submission: " + (ev.eventName || ev.id || "new event");
      var shareHint =
        "Recipient: " + coordinatorEmail + " — set as To: if your app did not.";
      var csvFile = buildCsvFile(csvBody, stamp);
      var imageFiles = collectImageFilesInOrder();
      var allFiles = [csvFile].concat(imageFiles);

      function afterDownloadMailto(footer) {
        window.setTimeout(function () {
          openMailtoCoordinator(coordinatorEmail, ev, statusEl, footer);
          resolve();
        }, 400);
      }

      var canShareAll = false;
      if (navigator.share && allFiles.length && navigator.canShare) {
        try {
          canShareAll = navigator.canShare({ files: allFiles });
        } catch (err1) {
          canShareAll = false;
        }
      }

      if (canShareAll) {
        navigator
          .share({
            files: allFiles,
            title: subject,
            text: shareHint,
          })
          .then(function () {
            if (statusEl) {
              statusEl.textContent =
                "Shared CSV and images. Address to " +
                coordinatorEmail +
                " if your app did not set the recipient.";
              statusEl.hidden = false;
            }
            resolve();
          })
          .catch(function () {
            tryZipOrCsvFallback();
          });
        return;
      }

      tryZipOrCsvFallback();

      function tryZipOrCsvFallback() {
        buildSubmissionZipBlob(csvBody, stamp, ev, imageFiles)
          .then(function (zipBlob) {
            var zipName = "mmhp-event-submission-" + (ev.id || stamp) + ".zip";
            var zipFile = new File([zipBlob], zipName, { type: "application/zip" });
            var canShareZip = false;
            if (navigator.share && navigator.canShare) {
              try {
                canShareZip = navigator.canShare({ files: [zipFile] });
              } catch (err2) {
                canShareZip = false;
              }
            }
            if (canShareZip) {
              navigator
                .share({
                  files: [zipFile],
                  title: subject,
                  text: shareHint,
                })
                .then(function () {
                  if (statusEl) {
                    statusEl.textContent =
                      "Shared submission ZIP. Address to " + coordinatorEmail + " if needed.";
                    statusEl.hidden = false;
                  }
                  resolve();
                })
                .catch(function () {
                  downloadBlob(zipBlob, zipName);
                  afterDownloadMailto(
                    "A ZIP was downloaded (" +
                      zipName +
                      "). Attach it to this email (it contains the CSV, summary text, and images).\r\n"
                  );
                });
            } else {
              downloadBlob(zipBlob, zipName);
              afterDownloadMailto(
                "A ZIP was downloaded (" +
                  zipName +
                  "). Attach it to this email (it contains the CSV, summary text, and images).\r\n"
              );
            }
          })
          .catch(function () {
            downloadBlob(
              new Blob(["\uFEFF" + csvBody], { type: "text/csv;charset=utf-8" }),
              "mmhp-event-submission-" + stamp + ".csv"
            );
            afterDownloadMailto(
              "A CSV was downloaded. Attach it and your event photos manually.\r\n"
            );
          });
      }
    });
  }

  /** Value stored on the exported event as `location`. When "Other" is chosen, must be the custom text only (never "__other__"). */
  function readLocationFromForm() {
    var presetEl = document.getElementById("mmhp-submit-location-preset");
    var otherEl = document.getElementById("mmhp-submit-location-other");
    if (!presetEl) return "";
    var preset = String(presetEl.value || "").trim();
    if (preset === LOCATION_PRESET_OTHER) {
      return otherEl ? String(otherEl.value || "").trim() : "";
    }
    return preset;
  }

  function syncLocationOtherUi() {
    var presetEl = document.getElementById("mmhp-submit-location-preset");
    var wrap = document.getElementById("mmhp-submit-location-other-wrap");
    var otherEl = document.getElementById("mmhp-submit-location-other");
    var isOther = presetEl && presetEl.value === LOCATION_PRESET_OTHER;
    var presetVal = presetEl ? String(presetEl.value || "").trim() : "";
    if (wrap) wrap.hidden = !isOther;
    if (otherEl) {
      otherEl.required = !!isOther;
           if (isOther) {
        otherEl.readOnly = false;
        otherEl.removeAttribute("readonly");
        otherEl.tabIndex = 0;
        otherEl.setAttribute("placeholder", LOCATION_OTHER_PLACEHOLDER);
      } else {
        otherEl.readOnly = true;
        otherEl.setAttribute("readonly", "readonly");
        otherEl.tabIndex = -1;
        otherEl.removeAttribute("placeholder");
        if (presetVal && KNOWN_HALLS[presetVal]) {
          otherEl.value = presetVal;
        } else {
          otherEl.value = "";
        }
      }
    }
  }

  function readForm(masterData) {
    var fid = String(document.getElementById("mmhp-submit-id").value || "").trim();
    var ev = {
      id: fid,
      featureId: fid,
      date: String(document.getElementById("mmhp-submit-date").value || "").trim(),
      startTime: String(document.getElementById("mmhp-submit-startTime").value || "").trim(),
      endTime: String(document.getElementById("mmhp-submit-endTime").value || "").trim(),
      location: readLocationFromForm(),
      cardLine1: String(document.getElementById("mmhp-submit-cardLine1").value || "").trim(),
      cardLine2: String(document.getElementById("mmhp-submit-cardLine2").value || "").trim(),
      isActive: document.getElementById("mmhp-submit-isActive").checked,
      isFeatured: document.getElementById("mmhp-submit-isFeatured").checked,
    };
    ev.cardLine3 = cardLine3FromEventDate(ev.date);
    var featImg = document.getElementById("mmhp-submit-image-feature");
    if (featImg && featImg.files && featImg.files[0]) {
      ev.imagePath = featImg.files[0].name;
    }
    finalizeFeatureRow(ev);
    return ev;
  }

  function refreshDerivedFields(masterData) {
    var ev = readForm(masterData);
    var enEl = document.getElementById("mmhp-submit-eventName");
    if (enEl) enEl.value = ev.eventName || "";
  }

  function formatBytesShort(bytes) {
    var n = Number(bytes);
    if (!isFinite(n) || n < 0) return "0 MB";
    var mb = n / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(mb >= 10 ? 0 : 1) + " MB";
    var kb = n / 1024;
    return kb.toFixed(0) + " KB";
  }

  function getImageSelectionStats() {
    var items = [];
    var total = 0;
    var maxSingle = 0;
    for (var i = 0; i < IMAGE_INPUT_IDS.length; i++) {
      var el = document.getElementById(IMAGE_INPUT_IDS[i]);
      if (el && el.files && el.files[0]) {
        var f = el.files[0];
        items.push({ name: f.name, size: f.size });
        total += f.size;
        if (f.size > maxSingle) maxSingle = f.size;
      }
    }
    return { items: items, total: total, maxSingle: maxSingle };
  }

  function imageSelectionOverRecommendedLimit(stats) {
    if (!stats || !stats.items.length) return false;
    if (stats.maxSingle > MMHP_IMAGE_MAX_SINGLE_BYTES) return true;
    if (stats.total > MMHP_IMAGE_MAX_TOTAL_BYTES) return true;
    return false;
  }

  var __mmhpSizeModalKeyHandler = null;

  function closeImageSizeModal() {
    var modal = document.getElementById("mmhp-submit-size-modal");
    var backdrop = document.getElementById("mmhp-submit-size-modal-backdrop");
    var btnOk = document.getElementById("mmhp-submit-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-submit-size-modal-continue");
    var btnBack = document.getElementById("mmhp-submit-size-modal-back");
    if (backdrop) backdrop.onclick = null;
    if (btnOk) btnOk.onclick = null;
    if (btnContinue) btnContinue.onclick = null;
    if (btnBack) btnBack.onclick = null;
    if (__mmhpSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpSizeModalKeyHandler);
      __mmhpSizeModalKeyHandler = null;
    }
    if (modal) modal.hidden = true;
  }

  function populateImageSizeModalBody(stats, forSubmitStep) {
    var body = document.getElementById("mmhp-submit-size-modal-body");
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);

    var p0 = document.createElement("p");
    p0.textContent =
      "Gmail and Microsoft Outlook usually limit outgoing messages to about 20–25 MB total (including attachments). " +
      "Very large photos or many megabytes in one ZIP can cause the message to be rejected, bounced, or blocked.";
    body.appendChild(p0);

    var p1 = document.createElement("p");
    p1.textContent =
      "This site suggests each photo stay under about " +
      formatBytesShort(MMHP_IMAGE_MAX_SINGLE_BYTES) +
      " and all photos together under about " +
      formatBytesShort(MMHP_IMAGE_MAX_TOTAL_BYTES) +
      ".";
    body.appendChild(p1);

    if (stats.items.length) {
      var p2 = document.createElement("p");
      p2.textContent = "Your current selection:";
      body.appendChild(p2);
      var ul = document.createElement("ul");
      for (var i = 0; i < stats.items.length; i++) {
        var li = document.createElement("li");
        li.textContent = stats.items[i].name + " — " + formatBytesShort(stats.items[i].size);
        ul.appendChild(li);
      }
      body.appendChild(ul);
      var p3 = document.createElement("p");
      p3.textContent =
        "Combined size: " +
        formatBytesShort(stats.total) +
        " (largest single file: " +
        formatBytesShort(stats.maxSingle) +
        ").";
      body.appendChild(p3);
    }

    var pEnd = document.createElement("p");
    pEnd.textContent = forSubmitStep
      ? "You can go back and choose smaller images, or continue anyway—delivery may still fail."
      : "Consider choosing smaller or compressed photos before sending.";
    body.appendChild(pEnd);
  }

  function showImageSizeModalAfterFilePick() {
    var stats = getImageSelectionStats();
    if (!imageSelectionOverRecommendedLimit(stats)) return;

    var modal = document.getElementById("mmhp-submit-size-modal");
    var btnOk = document.getElementById("mmhp-submit-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-submit-size-modal-continue");
    var btnBack = document.getElementById("mmhp-submit-size-modal-back");
    var backdrop = document.getElementById("mmhp-submit-size-modal-backdrop");
    if (!modal || !btnOk || !btnContinue || !btnBack || !backdrop) return;

    if (__mmhpSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpSizeModalKeyHandler);
      __mmhpSizeModalKeyHandler = null;
    }
    backdrop.onclick = null;
    btnOk.onclick = null;
    btnContinue.onclick = null;
    btnBack.onclick = null;

    populateImageSizeModalBody(stats, false);
    btnOk.hidden = false;
    btnContinue.hidden = true;
    btnBack.hidden = true;
    modal.hidden = false;

    __mmhpSizeModalKeyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeImageSizeModal();
      }
    };
    document.addEventListener("keydown", __mmhpSizeModalKeyHandler);

    btnOk.onclick = function () {
      closeImageSizeModal();
    };
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) closeImageSizeModal();
    };

    try {
      btnOk.focus();
    } catch (f) {}
  }

  function showImageSizeModalBeforeSubmit(onContinue) {
    var stats = getImageSelectionStats();
    var modal = document.getElementById("mmhp-submit-size-modal");
    var btnOk = document.getElementById("mmhp-submit-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-submit-size-modal-continue");
    var btnBack = document.getElementById("mmhp-submit-size-modal-back");
    var backdrop = document.getElementById("mmhp-submit-size-modal-backdrop");
    if (!modal || !btnOk || !btnContinue || !btnBack || !backdrop) {
      if (typeof onContinue === "function") onContinue();
      return;
    }

    if (__mmhpSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpSizeModalKeyHandler);
      __mmhpSizeModalKeyHandler = null;
    }
    backdrop.onclick = null;
    btnOk.onclick = null;
    btnContinue.onclick = null;
    btnBack.onclick = null;

    populateImageSizeModalBody(stats, true);
    btnOk.hidden = true;
    btnContinue.hidden = false;
    btnBack.hidden = false;
    modal.hidden = false;

    __mmhpSizeModalKeyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeImageSizeModal();
      }
    };
    document.addEventListener("keydown", __mmhpSizeModalKeyHandler);

    btnContinue.onclick = function () {
      closeImageSizeModal();
      if (typeof onContinue === "function") onContinue();
    };
    btnBack.onclick = function () {
      closeImageSizeModal();
      var feat = document.getElementById("mmhp-submit-image-feature");
      if (feat && typeof feat.focus === "function") {
        try {
          feat.focus({ preventScroll: true });
        } catch (f) {
          try {
            feat.focus();
          } catch (f2) {}
        }
      }
    };
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) btnBack.onclick();
    };

    try {
      btnBack.focus();
    } catch (f2) {}
  }

  function wireImageSizeWarningOnChange() {
    for (var i = 0; i < IMAGE_INPUT_IDS.length; i++) {
      var inp = document.getElementById(IMAGE_INPUT_IDS[i]);
      if (!inp) continue;
      inp.addEventListener("change", function () {
        window.setTimeout(showImageSizeModalAfterFilePick, 0);
      });
    }
  }

  function init(masterData) {
    var errEl = document.getElementById("mmhp-event-submit-load-err");
    var form = document.getElementById("mmhp-event-submit-form");
    if (!form) return;

    var features = masterData.features || [];
    var nextId = computeNextFeatureId(features);
    document.getElementById("mmhp-submit-id").value = nextId;

    document.getElementById("mmhp-submit-date").value = todayIsoLocal();
    document.getElementById("mmhp-submit-startTime").value = "19:00";
    document.getElementById("mmhp-submit-endTime").value = "21:00";
    document.getElementById("mmhp-submit-isActive").checked = true;
    document.getElementById("mmhp-submit-isFeatured").checked = false;
    for (var ii = 0; ii < IMAGE_INPUT_IDS.length; ii++) {
      var imgIn = document.getElementById(IMAGE_INPUT_IDS[ii]);
      if (imgIn) imgIn.value = "";
    }

    var locPreset = document.getElementById("mmhp-submit-location-preset");
    var locOther = document.getElementById("mmhp-submit-location-other");
    if (locPreset) {
      locPreset.value = "";
      locPreset.dataset.mmhpTouched = "";
    }
    if (locOther) {
      locOther.value = "";
      locOther.dataset.mmhpTouched = "";
    }
    syncLocationOtherUi();
    var c1 = document.getElementById("mmhp-submit-cardLine1");
    c1.value = "";
    var c2 = document.getElementById("mmhp-submit-cardLine2");
    c2.value = "";
    c2.dataset.mmhpTouched = "";
    refreshDerivedFields(masterData);

    if (locPreset) {
      locPreset.addEventListener("change", function () {
        if (locPreset.value === LOCATION_PRESET_OTHER && locOther) {
          locOther.value = "";
        }
        syncLocationOtherUi();
        locPreset.dataset.mmhpTouched = "1";
      });
    }
    if (locOther) {
      locOther.addEventListener("input", function () {
        locOther.dataset.mmhpTouched = "1";
      });
    }
    c2.addEventListener("input", function () {
      c2.dataset.mmhpTouched = "1";
      refreshDerivedFields(masterData);
    });

    c1.addEventListener("input", function () {
      refreshDerivedFields(masterData);
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = document.getElementById("mmhp-event-submit-status");
      var ev = readForm(masterData);
      var presetForLoc = document.getElementById("mmhp-submit-location-preset");
      if (presetForLoc && presetForLoc.value === LOCATION_PRESET_OTHER) {
        var otherForLoc = document.getElementById("mmhp-submit-location-other");
        ev.location = otherForLoc ? String(otherForLoc.value || "").trim() : "";
      }
      var check = validateSubmissionForm(ev);
      if (check.message) {
        announceIncompleteForm(status, check.message, check.focusEl);
        return;
      }
      status.textContent = "";
      status.hidden = true;

      var stamp = fileDateStamp();
      var csvBody = rowToCsvLine(CSV_COLUMNS) + "\r\n" + rowToCsvLine(eventToScheduleRow(ev)) + "\r\n";

      function runDeliver() {
        var coordinatorEmail = getCoordinatorEmail();
        deliverSubmissionToCoordinator(coordinatorEmail, ev, csvBody, status, stamp).catch(function () {
          if (status) {
            status.textContent =
              "Could not finish Share or download. Check your connection, allow downloads, or try another browser.";
            status.hidden = false;
          }
        });
      }

      var stats = getImageSelectionStats();
      if (imageSelectionOverRecommendedLimit(stats)) {
        showImageSizeModalBeforeSubmit(runDeliver);
      } else {
        runDeliver();
      }
    });

    wireImageSizeWarningOnChange();

    if (errEl) errEl.hidden = true;
    form.hidden = false;
  }

  function showLoadError(msg) {
    var errEl = document.getElementById("mmhp-event-submit-load-err");
    var form = document.getElementById("mmhp-event-submit-form");
    if (errEl) {
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    if (form) form.hidden = true;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var url = getMasterJsonUrl();
    if (!url) {
      showLoadError("Missing master data URL (data-mmhp-master-json on body).");
      return;
    }
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(init)
      .catch(function () {
        showLoadError("Could not load master data. Check the path in data-mmhp-master-json and try again.");
      });
  });
})();
