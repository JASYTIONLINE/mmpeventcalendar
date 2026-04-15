/**
 * Single source for the event coordinator email used by mailto flows and the submit form.
 * Override for one browser: Data admin → Coordinator email (localStorage).
 * Change the default for everyone: edit MMHP_COORDINATOR_EMAIL_DEFAULT below or replace this file from the admin download.
 */
(function (global) {
  var STORAGE_KEY = "mmhp-coordinator-email-override";

  var MMHP_COORDINATOR_EMAIL_DEFAULT = "johnbarkle@msn.com";

  function basicEmailCheck(s) {
    s = String(s || "").trim();
    if (!s || s.length > 254) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function mmhpGetCoordinatorEmailDefault() {
    return MMHP_COORDINATOR_EMAIL_DEFAULT;
  }

  function mmhpGetCoordinatorEmail() {
    try {
      var o = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (o) {
        o = String(o).trim();
        if (basicEmailCheck(o)) return o;
      }
    } catch (e1) {}
    var raw = document.body && document.body.getAttribute("data-mmhp-coordinator-email");
    var v = raw != null ? String(raw).trim() : "";
    if (v) return v;
    return MMHP_COORDINATOR_EMAIL_DEFAULT;
  }

  function mmhpSetCoordinatorEmailOverride(email) {
    email = String(email || "").trim();
    if (!basicEmailCheck(email)) return false;
    try {
      global.localStorage.setItem(STORAGE_KEY, email);
    } catch (e2) {
      return false;
    }
    mmhpApplyCoordinatorMailtoLinks(document);
    return true;
  }

  function mmhpClearCoordinatorEmailOverride() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (e3) {}
    mmhpApplyCoordinatorMailtoLinks(document);
  }

  function mmhpCoordinatorEmailOverrideActive() {
    try {
      var o = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return !!(o && basicEmailCheck(String(o).trim()));
    } catch (e4) {
      return false;
    }
  }

  function buildMailtoHref(email, subject, body) {
    var addr = String(email || "").replace(/^mailto:/i, "").trim();
    var h = "mailto:" + addr;
    var params = [];
    if (subject) params.push("subject=" + encodeURIComponent(subject));
    if (body) params.push("body=" + encodeURIComponent(body));
    if (params.length) h += "?" + params.join("&");
    return h;
  }

  function mmhpApplyCoordinatorMailtoLinks(root) {
    root = root || document;
    if (!root || !root.querySelectorAll) return;
    var email = mmhpGetCoordinatorEmail();
    var nodes = root.querySelectorAll("a[data-mmhp-coordinator-mailto]");
    for (var i = 0; i < nodes.length; i++) {
      var a = nodes[i];
      var sub = a.getAttribute("data-mmhp-mailto-subject") || "";
      var bod = a.getAttribute("data-mmhp-mailto-body") || "";
      a.setAttribute("href", buildMailtoHref(email, sub, bod));
    }
  }

  global.MMHP_COORDINATOR_STORAGE_KEY = STORAGE_KEY;
  global.mmhpGetCoordinatorEmailDefault = mmhpGetCoordinatorEmailDefault;
  global.mmhpGetCoordinatorEmail = mmhpGetCoordinatorEmail;
  global.mmhpSetCoordinatorEmailOverride = mmhpSetCoordinatorEmailOverride;
  global.mmhpClearCoordinatorEmailOverride = mmhpClearCoordinatorEmailOverride;
  global.mmhpCoordinatorEmailOverrideActive = mmhpCoordinatorEmailOverrideActive;
  global.mmhpApplyCoordinatorMailtoLinks = mmhpApplyCoordinatorMailtoLinks;
  global.mmhpValidateCoordinatorEmail = basicEmailCheck;

  function onReady() {
    mmhpApplyCoordinatorMailtoLinks(document);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})(typeof window !== "undefined" ? window : this);
