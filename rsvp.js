(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = form.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const config = window.RSVP_CONFIG || {};

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("is-error", "is-success");
    if (type) statusEl.classList.add(`is-${type}`);
  }

  function isConfigured() {
    const url = (config.scriptUrl || "").trim();
    return url && url !== "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL" && !config.demoMode;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    if (!form.reportValidity()) {
      setStatus("Please fill in the required fields.", "error");
      return;
    }

    // Honeypot
    if (form.website && form.website.value.trim() !== "") {
      setStatus("Thanks — your RSVP was received.", "success");
      form.reset();
      return;
    }

    const payload = {
      guestName: form.guestName.value.trim(),
      email: form.email.value.trim(),
      attendance: form.attendance.value,
      guests: form.guests.value,
      commute: form.commute.value,
      message: form.message.value.trim(),
      submittedAt: new Date().toISOString(),
      source: window.location.href,
    };

    submitBtn.disabled = true;
    setStatus("Sending…");

    try {
      if (!isConfigured()) {
        // Local / pre-deploy demo so XAMPP testing still feels complete
        await new Promise((r) => setTimeout(r, 700));
        console.info("[RSVP demo]", payload);
        setStatus(
          "Demo mode: RSVP captured in the browser console. Set your Apps Script URL in js/config.js to go live.",
          "success"
        );
        form.reset();
        return;
      }

      // text/plain avoids CORS preflight with Apps Script while still posting JSON
      const response = await fetch(config.scriptUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error || "Something went wrong. Please try again.");
      }

      setStatus("Thank you — your RSVP is on its way to us.", "success");
      form.reset();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not send RSVP. Please try again later.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
