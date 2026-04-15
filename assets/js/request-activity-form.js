/**
 * Request a new recurring activity: builds an activities[]-shaped payload, optional images,
 * Web Share or ZIP + mailto (same pattern as event-submit-form.js).
 */
(function () {
  var WEEKDAYS_ORDER = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  var REQUEST_IMAGE_INPUT_IDS = [
    "mmhp-request-image-feature",
    "mmhp-request-image-extra-1",
    "mmhp-request-image-extra-2",
    "mmhp-request-image-extra-3",
    "mmhp-request-image-extra-4",
  ];

  var MMHP_IMAGE_MAX_SINGLE_BYTES = 4 * 1024 * 1024;
  var MMHP_IMAGE_MAX_TOTAL_BYTES = 16 * 1024 * 1024;

  var __mmhpRequestSizeModalKeyHandler = null;
  var __mmhpRequestSubmitNoticeKeyHandler = null;

  function buildMailtoHref(email, subject, body) {
    var addr = String(email || "").replace(/^mailto:/i, "").trim();
    var h = "mailto:" + addr;
    var params = [];
    if (subject) params.push("subject=" + encodeURIComponent(subject));
    if (body) params.push("body=" + encodeURIComponent(body));
    if (params.length) h += "?" + params.join("&");
    return h;
  }

  function sortWeekdays(days) {
    var set = {};
    for (var i = 0; i < days.length; i++) set[days[i]] = true;
    var out = [];
    for (var j = 0; j < WEEKDAYS_ORDER.length; j++) {
      if (set[WEEKDAYS_ORDER[j]]) out.push(WEEKDAYS_ORDER[j]);
    }
    return out;
  }

  function parseKeywords(raw) {
    return String(raw || "")
      .split(",")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function fileDateStamp() {
    var n = new Date();
    return n.getFullYear() + "-" + pad2(n.getMonth() + 1) + "-" + pad2(n.getDate());
  }

  function formatBytesShort(bytes) {
    var num = Number(bytes);
    if (!isFinite(num) || num < 0) return "0 MB";
    var mb = num / (1024 * 1024);
    if (mb >= 1) return mb.toFixed(mb >= 10 ? 0 : 1) + " MB";
    var kb = num / 1024;
    return kb.toFixed(0) + " KB";
  }

  function collectRequestImageFiles() {
    var out = [];
    for (var i = 0; i < REQUEST_IMAGE_INPUT_IDS.length; i++) {
      var el = document.getElementById(REQUEST_IMAGE_INPUT_IDS[i]);
      if (el && el.files && el.files[0]) out.push(el.files[0]);
    }
    return out;
  }

  function getRequestImageStats() {
    var items = [];
    var total = 0;
    var maxSingle = 0;
    for (var i = 0; i < REQUEST_IMAGE_INPUT_IDS.length; i++) {
      var el = document.getElementById(REQUEST_IMAGE_INPUT_IDS[i]);
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

  function sanitizeZipEntryName(name) {
    var n = String(name || "image").replace(/[/\\]/g, "_").replace(/\.\.+/g, ".");
    n = n.replace(/^\.+/, "") || "image";
    if (n.length > 100) n = n.slice(-100);
    return n;
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

  function closeRequestSizeModal() {
    var modal = document.getElementById("mmhp-request-size-modal");
    var backdrop = document.getElementById("mmhp-request-size-modal-backdrop");
    var btnOk = document.getElementById("mmhp-request-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-request-size-modal-continue");
    var btnBack = document.getElementById("mmhp-request-size-modal-back");
    if (backdrop) backdrop.onclick = null;
    if (btnOk) btnOk.onclick = null;
    if (btnContinue) btnContinue.onclick = null;
    if (btnBack) btnBack.onclick = null;
    if (__mmhpRequestSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpRequestSizeModalKeyHandler);
      __mmhpRequestSizeModalKeyHandler = null;
    }
    if (modal) modal.hidden = true;
  }

  function populateRequestSizeModalBody(stats, forSubmitStep) {
    var body = document.getElementById("mmhp-request-size-modal-body");
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

  function showRequestSizeModalAfterFilePick() {
    var stats = getRequestImageStats();
    if (!imageSelectionOverRecommendedLimit(stats)) return;

    var modal = document.getElementById("mmhp-request-size-modal");
    var btnOk = document.getElementById("mmhp-request-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-request-size-modal-continue");
    var btnBack = document.getElementById("mmhp-request-size-modal-back");
    var backdrop = document.getElementById("mmhp-request-size-modal-backdrop");
    if (!modal || !btnOk || !btnContinue || !btnBack || !backdrop) return;

    if (__mmhpRequestSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpRequestSizeModalKeyHandler);
      __mmhpRequestSizeModalKeyHandler = null;
    }
    backdrop.onclick = null;
    btnOk.onclick = null;
    btnContinue.onclick = null;
    btnBack.onclick = null;

    populateRequestSizeModalBody(stats, false);
    btnOk.hidden = false;
    btnContinue.hidden = true;
    btnBack.hidden = true;
    modal.hidden = false;

    __mmhpRequestSizeModalKeyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRequestSizeModal();
      }
    };
    document.addEventListener("keydown", __mmhpRequestSizeModalKeyHandler);

    btnOk.onclick = function () {
      closeRequestSizeModal();
    };
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) closeRequestSizeModal();
    };

    try {
      btnOk.focus();
    } catch (f) {}
  }

  function showRequestSizeModalBeforeSubmit(onContinue) {
    var stats = getRequestImageStats();
    var modal = document.getElementById("mmhp-request-size-modal");
    var btnOk = document.getElementById("mmhp-request-size-modal-ok");
    var btnContinue = document.getElementById("mmhp-request-size-modal-continue");
    var btnBack = document.getElementById("mmhp-request-size-modal-back");
    var backdrop = document.getElementById("mmhp-request-size-modal-backdrop");
    if (!modal || !btnOk || !btnContinue || !btnBack || !backdrop) {
      if (typeof onContinue === "function") onContinue();
      return;
    }

    if (__mmhpRequestSizeModalKeyHandler) {
      document.removeEventListener("keydown", __mmhpRequestSizeModalKeyHandler);
      __mmhpRequestSizeModalKeyHandler = null;
    }
    backdrop.onclick = null;
    btnOk.onclick = null;
    btnContinue.onclick = null;
    btnBack.onclick = null;

    populateRequestSizeModalBody(stats, true);
    btnOk.hidden = true;
    btnContinue.hidden = false;
    btnBack.hidden = false;
    modal.hidden = false;

    __mmhpRequestSizeModalKeyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRequestSizeModal();
      }
    };
    document.addEventListener("keydown", __mmhpRequestSizeModalKeyHandler);

    btnContinue.onclick = function () {
      closeRequestSizeModal();
      if (typeof onContinue === "function") onContinue();
    };
    btnBack.onclick = function () {
      closeRequestSizeModal();
      var feat = document.getElementById("mmhp-request-image-feature");
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

  function closeSubmitNoticeModal() {
    var modal = document.getElementById("mmhp-request-submit-notice-modal");
    var backdrop = document.getElementById("mmhp-request-submit-notice-modal-backdrop");
    var btnCancel = document.getElementById("mmhp-request-submit-notice-cancel");
    var btnContinue = document.getElementById("mmhp-request-submit-notice-continue");
    if (backdrop) backdrop.onclick = null;
    if (btnCancel) btnCancel.onclick = null;
    if (btnContinue) btnContinue.onclick = null;
    if (__mmhpRequestSubmitNoticeKeyHandler) {
      document.removeEventListener("keydown", __mmhpRequestSubmitNoticeKeyHandler);
      __mmhpRequestSubmitNoticeKeyHandler = null;
    }
    if (modal) modal.hidden = true;
  }

  function showSubmitNoticeModal(onContinue) {
    var modal = document.getElementById("mmhp-request-submit-notice-modal");
    var backdrop = document.getElementById("mmhp-request-submit-notice-modal-backdrop");
    var btnCancel = document.getElementById("mmhp-request-submit-notice-cancel");
    var btnContinue = document.getElementById("mmhp-request-submit-notice-continue");
    if (!modal || !backdrop || !btnCancel || !btnContinue) {
      if (typeof onContinue === "function") onContinue();
      return;
    }

    if (__mmhpRequestSubmitNoticeKeyHandler) {
      document.removeEventListener("keydown", __mmhpRequestSubmitNoticeKeyHandler);
      __mmhpRequestSubmitNoticeKeyHandler = null;
    }
    backdrop.onclick = null;
    btnCancel.onclick = null;
    btnContinue.onclick = null;

    modal.hidden = false;

    __mmhpRequestSubmitNoticeKeyHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSubmitNoticeModal();
      }
    };
    document.addEventListener("keydown", __mmhpRequestSubmitNoticeKeyHandler);

    btnCancel.onclick = function () {
      closeSubmitNoticeModal();
    };
    btnContinue.onclick = function () {
      closeSubmitNoticeModal();
      if (typeof onContinue === "function") onContinue();
    };
    backdrop.onclick = function (ev) {
      if (ev.target === backdrop) closeSubmitNoticeModal();
    };

    try {
      btnContinue.focus();
    } catch (f) {}
  }

  function wireRequestImageSizeWarningOnChange() {
    for (var i = 0; i < REQUEST_IMAGE_INPUT_IDS.length; i++) {
      var inp = document.getElementById(REQUEST_IMAGE_INPUT_IDS[i]);
      if (!inp) continue;
      inp.addEventListener("change", function () {
        window.setTimeout(showRequestSizeModalAfterFilePick, 0);
      });
    }
  }

  function buildActivityRequestZipBlob(textBody, stamp, imageFiles) {
    if (typeof JSZip === "undefined") return Promise.reject(new Error("JSZip not loaded"));
    var zip = new JSZip();
    zip.file("mmhp-activity-request-" + stamp + ".txt", textBody);
    for (var i = 0; i < imageFiles.length; i++) {
      var f = imageFiles[i];
      var prefix = i === 0 ? "featured" : "extra-" + i;
      zip.file(prefix + "-" + sanitizeZipEntryName(f.name), f);
    }
    return zip.generateAsync({ type: "blob" });
  }

  function openMailtoActivityRequest(coordinatorEmail, subject, body, statusEl, leadNotice) {
    var notice = leadNotice != null ? String(leadNotice).trim() : "";
    var fullBody;
    if (notice) {
      fullBody =
        "READ FIRST — ATTACHMENT\r\n" +
        notice +
        "\r\n\r\n————————————————————————————\r\n\r\n" +
        body;
    } else {
      fullBody = body;
    }
    window.location.href =
      "mailto:" +
      coordinatorEmail +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(fullBody);
    if (statusEl) {
      statusEl.textContent =
        "Opened email to " +
        coordinatorEmail +
        ". Attach the downloaded file(s) if prompted, then send.";
      statusEl.hidden = false;
    }
  }

  function deliverActivityRequest(coordinatorEmail, subject, mailtoBodyShort, fullTextForZip, statusEl, stamp) {
    return new Promise(function (resolve, reject) {
      coordinatorEmail =
        coordinatorEmail && String(coordinatorEmail).trim()
          ? String(coordinatorEmail).trim()
          : typeof mmhpGetCoordinatorEmail === "function"
            ? mmhpGetCoordinatorEmail()
            : "";

      var shareHint =
        "Recipient: " + coordinatorEmail + " — set as To: if your app did not.";
      var txtBlob = new Blob([fullTextForZip], { type: "text/plain;charset=utf-8" });
      var txtFile = new File([txtBlob], "mmhp-activity-request-" + stamp + ".txt", { type: "text/plain;charset=utf-8" });
      var imageFiles = collectRequestImageFiles();
      var allFiles = [txtFile].concat(imageFiles);

      function afterDownloadMailto(footer) {
        window.setTimeout(function () {
          openMailtoActivityRequest(coordinatorEmail, subject, mailtoBodyShort, statusEl, footer);
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
                "Shared request text and images. Address to " +
                coordinatorEmail +
                " if your app did not set the recipient.";
              statusEl.hidden = false;
            }
            resolve();
          })
          .catch(function () {
            tryZipOrFallback();
          });
        return;
      }

      tryZipOrFallback();

      function tryZipOrFallback() {
        buildActivityRequestZipBlob(fullTextForZip, stamp, imageFiles)
          .then(function (zipBlob) {
            var zipName = "mmhp-activity-request-" + stamp + ".zip";
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
                      "Shared request ZIP. Address to " + coordinatorEmail + " if needed.";
                    statusEl.hidden = false;
                  }
                  resolve();
                })
                .catch(function () {
                  downloadBlob(zipBlob, zipName);
                  afterDownloadMailto(
                    "A ZIP was downloaded (" +
                      zipName +
                      "). Attach it to this email (it contains the full request text and images).\r\n"
                  );
                });
            } else {
              downloadBlob(zipBlob, zipName);
              afterDownloadMailto(
                "A ZIP was downloaded (" +
                  zipName +
                  "). Attach it to this email (it contains the full request text and images).\r\n"
              );
            }
          })
          .catch(function () {
            downloadBlob(
              new Blob([fullTextForZip], { type: "text/plain;charset=utf-8" }),
              "mmhp-activity-request-" + stamp + ".txt"
            );
            afterDownloadMailto(
              "A text file was downloaded. Attach it and your activity photos manually.\r\n"
            );
          });
      }
    });
  }

  function init() {
    var form = document.getElementById("mmhp-request-activity-form");
    if (!form) return;

    var locPreset = document.getElementById("mmhp-request-location-preset");
    var locOtherWrap = document.getElementById("mmhp-request-location-other-wrap");
    var locOther = document.getElementById("mmhp-request-location-other");
    var statusEl = document.getElementById("mmhp-request-activity-status");

    if (locPreset && locOtherWrap && locOther) {
      function syncLoc() {
        var v = locPreset.value;
        if (v === "__other__") {
          locOtherWrap.hidden = false;
          locOther.removeAttribute("readonly");
          locOther.removeAttribute("tabindex");
          locOther.required = true;
        } else {
          locOtherWrap.hidden = true;
          locOther.setAttribute("readonly", "readonly");
          locOther.setAttribute("tabindex", "-1");
          locOther.required = false;
          locOther.value = "";
        }
      }
      locPreset.addEventListener("change", syncLoc);
      syncLoc();
    }

    wireRequestImageSizeWarningOnChange();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (statusEl) {
        statusEl.textContent = "";
        statusEl.hidden = true;
      }

      var name = String(document.getElementById("mmhp-request-activityName").value || "").trim();
      var description = String(document.getElementById("mmhp-request-description").value || "").trim();
      var rtEl = document.getElementById("mmhp-request-recurrenceType");
      var recurrenceType =
        rtEl && rtEl.value ? String(rtEl.value).trim() : "Recurring";

      var location = "";
      if (locPreset) {
        if (locPreset.value === "__other__") {
          location = String(locOther ? locOther.value : "").trim();
        } else {
          location = String(locPreset.value || "").trim();
        }
      }

      var weekdays = [];
      var boxes = form.querySelectorAll('input[name="mmhp-request-weekday"]:checked');
      for (var i = 0; i < boxes.length; i++) {
        weekdays.push(boxes[i].value);
      }
      weekdays = sortWeekdays(weekdays);

      var startTimeEl = document.getElementById("mmhp-request-startTime");
      var startTime = startTimeEl ? String(startTimeEl.value || "").trim() : "";
      if (startTimeEl && startTimeEl.type === "time" && startTime.length >= 5) {
        startTime = startTime.slice(0, 5);
      }

      var featImg = document.getElementById("mmhp-request-image-feature");

      if (!name) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please enter an activity name.";
        }
        return;
      }
      if (!description) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please enter a description.";
        }
        return;
      }
      if (!location) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please choose or enter a location.";
        }
        return;
      }
      if (weekdays.length === 0) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please select at least one day of the week for this recurring activity.";
        }
        return;
      }
      if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(startTime)) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please enter a valid start time (24-hour, e.g. 13:00).";
        }
        return;
      }
      if (!featImg || !featImg.files || !featImg.files[0]) {
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Please choose a featured image.";
        }
        try {
          featImg.focus({ preventScroll: true });
        } catch (f) {
          try {
            featImg.focus();
          } catch (f2) {}
        }
        return;
      }

      function finishSubmitAfterNotice() {
        var keywords = parseKeywords(document.getElementById("mmhp-request-keywords").value);
        var imagePath = featImg.files[0].name;

        var recurrenceDetails =
          weekdays.length > 0
            ? {
                weekdays: weekdays,
                startTime: startTime,
              }
            : {};

        var activityPayload = {
          activityName: name,
          description: description,
          location: location,
          recurrenceType: recurrenceType,
          recurrenceDetails: recurrenceDetails,
          keywords: keywords,
          imagePath: imagePath,
        };

        var proposerName = String(document.getElementById("mmhp-request-proposer-name").value || "").trim();
        var proposerPhone = String(document.getElementById("mmhp-request-proposer-phone").value || "").trim();
        var proposerEmail = String(document.getElementById("mmhp-request-proposer-email").value || "").trim();

        var jsonBlock = JSON.stringify(activityPayload, null, 2);
        var fullTextBody =
          "Please review this request to add a recurring activity to the site calendar (activities in mmhp-master-data.json).\r\n\r\n" +
          "The coordinator should assign id, contactResidentId, and chairpersonId when adding the row.\r\n\r\n" +
          "--- Suggested JSON object (merge into activities[]) ---\r\n" +
          jsonBlock +
          "\r\n\r\n" +
          "--- Submitter (not part of JSON) ---\r\n" +
          "Name: " +
          (proposerName || "—") +
          "\r\n" +
          "Phone: " +
          (proposerPhone || "—") +
          "\r\n" +
          "Email: " +
          (proposerEmail || "—") +
          "\r\n";

        var mailtoBodyShort =
          "Full activity request (JSON + submitter details + photo filenames) is in the attached file(s) or ZIP.\r\n\r\n" +
          "Activity name: " +
          name +
          "\r\n" +
          "Featured image filename (hint for imagePath): " +
          imagePath +
          "\r\n\r\n" +
          "Open mmhp-activity-request-*.txt inside the ZIP, or use the shared text file, then merge the JSON into activities[] in mmhp-master-data.json.\r\n";

        var email =
          typeof mmhpGetCoordinatorEmail === "function" ? mmhpGetCoordinatorEmail() : "";
        if (!email) {
          window.alert("Coordinator email is not configured.");
          return;
        }

        var subject = "Request new recurring activity: " + name;
        var stamp = fileDateStamp();

        function runDeliver() {
          deliverActivityRequest(email, subject, mailtoBodyShort, fullTextBody, statusEl, stamp).catch(function () {
            if (statusEl) {
              statusEl.textContent =
                "Could not finish Share or download. Check your connection, allow downloads, or try another browser.";
              statusEl.hidden = false;
            }
          });
        }

        var stats = getRequestImageStats();
        if (imageSelectionOverRecommendedLimit(stats)) {
          showRequestSizeModalBeforeSubmit(runDeliver);
        } else {
          runDeliver();
        }
      }

      showSubmitNoticeModal(finishSubmitAfterNotice);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
