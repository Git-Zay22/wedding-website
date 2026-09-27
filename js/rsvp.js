(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = form.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const eventsField = form.querySelector("[data-events-field]");
  const eventsSelect = form.events;
  const config = window.RSVP_CONFIG || {};

  function setStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove("is-error", "is-success");
    if (type) statusEl.classList.add(`is-${type}`);
  }

  function isConfigured() {
    const url = String((config && config.scriptUrl) || "").trim();
    if (!url) return false;
    if (url.indexOf("YOUR_GOOGLE_APPS_SCRIPT") !== -1) return false;
    if (url.indexOf("script.google.com") !== -1) return true;
    return config.demoMode === false;
  }

  function syncEventsField() {
    const attending = form.attendance.value === "Yes";
    if (eventsField) eventsField.hidden = !attending;
    if (eventsSelect) {
      eventsSelect.required = attending;
      if (!attending) eventsSelect.value = "Both";
    }
  }

  function validateClient() {
    const name = form.guestName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const phoneDigits = phone.replace(/\D/g, "");

    if (!name) {
      setStatus("Please enter your full name.", "error");
      form.guestName.focus();
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus("Please enter a valid email address.", "error");
      form.email.focus();
      return false;
    }

    if (phoneDigits.length < 10) {
      setStatus("Please enter a valid mobile / WhatsApp number.", "error");
      form.phone.focus();
      return false;
    }

    if (!form.attendance.value) {
      setStatus("Please choose your attendance.", "error");
      return false;
    }

    if (form.attendance.value === "Yes" && !form.events.value) {
      setStatus("Please choose ceremony, reception, or both.", "error");
      form.events.focus();
      return false;
    }

    return true;
  }

  form.querySelectorAll('input[name="attendance"]').forEach((input) => {
    input.addEventListener("change", syncEventsField);
  });
  syncEventsField();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("");

    if (!form.reportValidity() || !validateClient()) {
      if (!statusEl.textContent) {
        setStatus("Please fill in the required fields.", "error");
      }
      return;
    }

    // Honeypot
    if (form.website && form.website.value.trim() !== "") {
      setStatus("Thanks — your RSVP was received.", "success");
      form.reset();
      syncEventsField();
      return;
    }

    const attending = form.attendance.value === "Yes";
    const payload = {
      guestName: form.guestName.value.trim(),
      email: form.email.value.trim(),
      phone: form.phone.value.trim(),
      attendance: form.attendance.value,
      events: attending ? form.events.value : "Not attending",
      guests: form.guests.value,
      commute: form.commute.value,
      allergies: form.allergies.value.trim(),
      message: form.message.value.trim(),
      submittedAt: new Date().toISOString(),
      source: window.location.href,
    };

    submitBtn.disabled = true;
    setStatus("Sending…");

    try {
      if (!isConfigured()) {
        await new Promise((r) => setTimeout(r, 700));
        console.info("[RSVP demo]", payload);
        setStatus(
          "Demo mode: RSVP captured in the browser console. Set your Apps Script URL in js/config.js to go live.",
          "success"
        );
        form.reset();
        syncEventsField();
        return;
      }

      const response = await fetch(config.scriptUrl, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(
          data.error || "Something went wrong. Please try again."
        );
      }

      setStatus("Thank you — your RSVP is on its way to us.", "success");
      form.reset();
      syncEventsField();
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not send RSVP. Please try again later.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
