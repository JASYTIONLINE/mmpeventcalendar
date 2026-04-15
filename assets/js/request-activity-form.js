/**
 * Request a new recurring activity: builds an activities[]-shaped payload and opens mailto to the coordinator.
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

      var keywords = parseKeywords(document.getElementById("mmhp-request-keywords").value);
      var imagePath = String(document.getElementById("mmhp-request-imagePath").value || "").trim();

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
      var body =
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

      var email =
        typeof mmhpGetCoordinatorEmail === "function" ? mmhpGetCoordinatorEmail() : "";
      if (!email) {
        window.alert("Coordinator email is not configured.");
        return;
      }

      window.location.href = buildMailtoHref(
        email,
        "Request new recurring activity: " + name,
        body
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
