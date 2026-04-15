/**
 * Data admin only: coordinator email → confirm modal → download patched mmhp-coordinator-config.js for repo replace.
 */
(function () {
  if (!document.getElementById("mmhp-coordinator-settings")) return;

  var input = document.getElementById("mmhp-coordinator-email-input");
  var btnUpdate = document.getElementById("mmhp-coordinator-email-update");
  var statusEl = document.getElementById("mmhp-coordinator-email-status");
  var fileDefaultEl = document.getElementById("mmhp-coordinator-email-file-default");

  var modal = document.getElementById("mmhp-coordinator-confirm-modal");
  var modalBackdrop = document.getElementById("mmhp-coordinator-confirm-backdrop");
  var modalCancel = document.getElementById("mmhp-coordinator-confirm-cancel");
  var modalOk = document.getElementById("mmhp-coordinator-confirm-ok");
  var modalPreview = document.getElementById("mmhp-coordinator-confirm-preview");

  var pendingEmail = "";

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.hidden = !msg;
    statusEl.classList.toggle("data-admin-coordinator-status--error", !!isError);
  }

  function refreshForm() {
    if (input && typeof window.mmhpGetCoordinatorEmail === "function") {
      input.value = window.mmhpGetCoordinatorEmail();
    }
    if (fileDefaultEl && typeof window.mmhpGetCoordinatorEmailDefault === "function") {
      fileDefaultEl.textContent = window.mmhpGetCoordinatorEmailDefault();
    }
  }

  function openModal(email) {
    pendingEmail = email;
    if (modalPreview) modalPreview.textContent = email;
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    pendingEmail = "";
    if (modal) modal.hidden = true;
  }

  function escapeForJsDoubleQuotedString(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "")
      .replace(/\n/g, "");
  }

  function downloadPatchedConfigFile(email) {
    var url = "../assets/js/mmhp-coordinator-config.js";
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("fetch");
        return r.text();
      })
      .then(function (text) {
        var escaped = escapeForJsDoubleQuotedString(email);
        var next = text.replace(
          /(var MMHP_COORDINATOR_EMAIL_DEFAULT = )"[^"]*";/,
          '$1"' + escaped + '";'
        );
        var blob = new Blob([next], { type: "text/javascript;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "mmhp-coordinator-config.js";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        setStatus(
          "Downloaded mmhp-coordinator-config.js. Replace assets/js/mmhp-coordinator-config.js in the project and deploy so the new coordinator address is live for everyone.",
          false
        );
      })
      .catch(function () {
        setStatus(
          "Could not fetch the config file to patch (try http(s) instead of file://). Edit MMHP_COORDINATOR_EMAIL_DEFAULT in assets/js/mmhp-coordinator-config.js manually.",
          true
        );
      });
  }

  function onConfirmOk() {
    var email = pendingEmail;
    closeModal();
    if (!email || typeof window.mmhpValidateCoordinatorEmail !== "function") return;
    if (!window.mmhpValidateCoordinatorEmail(email)) {
      setStatus("That email address is not valid.", true);
      return;
    }
    downloadPatchedConfigFile(email);
    refreshForm();
  }

  if (btnUpdate && input) {
    btnUpdate.addEventListener("click", function () {
      setStatus("", false);
      var v = String(input.value || "").trim();
      if (typeof window.mmhpValidateCoordinatorEmail !== "function" || !window.mmhpValidateCoordinatorEmail(v)) {
        setStatus("Enter a valid email address.", true);
        return;
      }
      openModal(v);
    });
  }

  if (modalCancel) modalCancel.addEventListener("click", closeModal);
  if (modalOk) modalOk.addEventListener("click", onConfirmOk);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  refreshForm();
})();
