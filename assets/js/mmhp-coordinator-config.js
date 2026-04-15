/**
 * Single source for the event coordinator email used by mailto flows and the submit form.
 * Change the default: edit MMHP_COORDINATOR_EMAIL_DEFAULT below, or use Data admin → download and replace this file.
 * Optional: set data-mmhp-coordinator-email on <body> to override without editing this file (advanced).
 */
(function (global) {
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
    var raw = document.body && document.body.getAttribute("data-mmhp-coordinator-email");
    var v = raw != null ? String(raw).trim() : "";
    if (v) return v;
    return MMHP_COORDINATOR_EMAIL_DEFAULT;
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

  global.mmhpGetCoordinatorEmailDefault = mmhpGetCoordinatorEmailDefault;
  global.mmhpGetCoordinatorEmail = mmhpGetCoordinatorEmail;
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
