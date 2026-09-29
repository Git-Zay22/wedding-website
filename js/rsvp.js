(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = form.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const eventsField = form.querySelector("[data-events-field]");
  const eventsSelect = form.events;
  const config = window.RSVP_CONFIG || {};

  function clearStatus() {
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.classList.remove("is-error", "is-success");
    statusEl.replaceChildren();
  }

  function setStatus(message, type, items) {
    if (!statusEl) return;

    if (!message && !(items && items.length)) {
      clearStatus();
      return;
    }

    statusEl.hidden = false;
    statusEl.classList.remove("is-error", "is-success");
    if (type) statusEl.classList.add(`is-${type}`);
    statusEl.replaceChildren();

    if (items && items.length) {
      const title = document.createElement("p");
      title.className = "form-status__title";
      title.textContent = message || "Please complete the required fields:";
      statusEl.appendChild(title);

      const list = document.createElement("ul");
      list.className = "form-status__list";

      items.forEach((item) => {
        const li = document.createElement("li");
        const label = typeof item === "string" ? item : item.label;
        const detail = typeof item === "string" ? "is required" : item.detail;
        li.append(document.createTextNode(label + " "));

        const star = document.createElement("span");
        star.className = "form-status__req";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        li.appendChild(star);

        if (detail) {
          li.append(document.createTextNode(" — " + detail));
        }

        list.appendChild(li);
      });

      statusEl.appendChild(list);
    } else {
      statusEl.textContent = message;
    }

    statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email || email.length > 160) return false;
    // Practical check: local@domain.tld with a real TLD (rejects a@b.c-style typos)
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
      email
    );
  }

  function validateClient() {
    const name = form.guestName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const phoneDigits = phone.replace(/\D/g, "");
    const issues = [];
    let focusEl = null;

    if (!name) {
      issues.push({ label: "Full name", detail: "is required" });
      focusEl = focusEl || form.guestName;
    }

    if (!email) {
      issues.push({ label: "Email", detail: "is required" });
      focusEl = focusEl || form.email;
    } else if (!isValidEmail(email)) {
      issues.push({ label: "Email", detail: "needs a valid address" });
      focusEl = focusEl || form.email;
    }

    if (!phone) {
      issues.push({ label: "Mobile / WhatsApp", detail: "is required" });
      focusEl = focusEl || form.phone;
    } else if (phoneDigits.length < 10) {
      issues.push({ label: "Mobile / WhatsApp", detail: "needs a valid number" });
      focusEl = focusEl || form.phone;
    }

    if (!form.attendance.value) {
      issues.push({ label: "Attendance", detail: "is required" });
    }

    if (form.attendance.value === "Yes" && !form.events.value) {
      issues.push({ label: "Attending", detail: "is required" });
      focusEl = focusEl || form.events;
    }

    if (!form.commute.value) {
      issues.push({ label: "Will you bring your own car?", detail: "is required" });
      focusEl = focusEl || form.commute;
    }

    if (issues.length) {
      setStatus("Please complete the required fields:", "error", issues);
      if (focusEl) focusEl.focus();
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
    clearStatus();

    if (!validateClient()) return;

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
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim(),
      attendance: form.attendance.value,
      events: attending ? form.events.value : "Not attending",
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
