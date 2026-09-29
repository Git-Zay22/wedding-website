(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = form.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const findBtn = form.querySelector("[data-find-rsvp]");
  const editToggle = form.querySelector("[data-edit-toggle]");
  const detailsEl = form.querySelector("[data-rsvp-details]");
  const eventsField = form.querySelector("[data-events-field]");
  const eventsSelect = form.events;
  const config = window.RSVP_CONFIG || {};

  let editMode = false;
  let editLoaded = false;
  let originalGuestName = "";

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
    const declining = form.attendance.value === "No";
    if (eventsField) eventsField.hidden = declining;
    if (eventsSelect) {
      eventsSelect.required = !declining;
      if (declining) eventsSelect.value = "";
    }
  }

  function setSelectValue(select, value) {
    if (!select) return;
    const next = String(value || "");
    const hasOption = Array.from(select.options).some((opt) => opt.value === next);
    if (hasOption) {
      select.value = next;
    } else {
      select.value = "";
    }
  }

  function setAttendanceValue(value) {
    const match = String(value || "");
    form.querySelectorAll('input[name="attendance"]').forEach((input) => {
      input.checked = input.value === match;
    });
    syncEventsField();
  }

  function syncEditUi() {
    form.classList.toggle("is-edit-mode", editMode);
    form.classList.toggle("is-edit-pending", editMode && !editLoaded);
    form.classList.toggle("is-edit-loaded", editMode && editLoaded);

    const pending = editMode && !editLoaded;
    if (detailsEl) detailsEl.hidden = pending;

    form.email.required = !pending;
    form.phone.required = !pending;
    form.commute.required = !pending;
    const yesRadio = form.querySelector('input[name="attendance"][value="Yes"]');
    if (yesRadio) yesRadio.required = !pending;
    if (eventsSelect) {
      eventsSelect.required = !pending && form.attendance.value !== "No";
    }

    if (findBtn) findBtn.hidden = !pending;
    if (submitBtn) {
      submitBtn.hidden = pending;
      submitBtn.textContent = editMode ? "Resend RSVP" : "Send RSVP";
    }
  }

  function resetEditState(keepName) {
    const keptName = keepName ? form.guestName.value : "";
    editLoaded = false;
    originalGuestName = "";
    form.reset();
    if (editToggle) editToggle.checked = editMode;
    if (keepName) form.guestName.value = keptName;
    setAttendanceValue("");
    syncEventsField();
    syncEditUi();
  }

  function fillFormFromRecord(record) {
    form.guestName.value = record.guestName || "";
    form.email.value = record.email || "";
    form.phone.value = record.phone || "";
    setAttendanceValue(record.attendance === "No" ? "No" : record.attendance === "Yes" ? "Yes" : "");
    const eventsValue =
      record.events && record.events !== "Not attending" ? record.events : "";
    setSelectValue(form.events, eventsValue);
    setSelectValue(form.commute, record.commute || "");
    form.allergies.value = record.allergies || "";
    form.message.value = record.message || "";
    originalGuestName = record.guestName || form.guestName.value.trim();
    editLoaded = true;
    syncEventsField();
    syncEditUi();
  }

  function isValidEmail(value) {
    const email = String(value || "").trim();
    if (!email || email.length > 160) return false;
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
      focusEl = focusEl || form.querySelector('input[name="attendance"]');
    }

    if (form.attendance.value !== "No" && !form.events.value) {
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

  async function parseJsonResponse(response) {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
    if (!response.ok || data.ok === false) {
      const fallback =
        text && /<!DOCTYPE|<html/i.test(text)
          ? "Could not reach the RSVP server. Please try again in a moment."
          : (text && text.slice(0, 160)) ||
            "Something went wrong. Please try again.";
      throw new Error(data.error || fallback);
    }
    return data;
  }

  async function postAction(payload) {
    const response = await fetch(config.scriptUrl, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return parseJsonResponse(response);
  }

  async function lookupByName(guestName) {
    const url = new URL(config.scriptUrl);
    url.searchParams.set("action", "lookup");
    url.searchParams.set("guestName", guestName);

    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      redirect: "follow",
    });
    return parseJsonResponse(response);
  }

  async function lookupRsvp() {
    clearStatus();
    const guestName = form.guestName.value.trim();
    if (!guestName) {
      setStatus("Please complete the required fields:", "error", [
        { label: "Full name", detail: "is required" },
      ]);
      form.guestName.focus();
      return;
    }

    if (findBtn) findBtn.disabled = true;
    setStatus("Looking up your RSVP…");

    try {
      if (!isConfigured()) {
        await new Promise((r) => setTimeout(r, 500));
        throw new Error(
          "Lookup needs your live Apps Script URL. Deploy the updated Code.gs, then try again."
        );
      }

      const data = await lookupByName(guestName);

      // Old Apps Script deployments ignore ?action=lookup and only return the health message.
      if (data && data.message && !data.record) {
        throw new Error(
          "Lookup is not active on the server yet. In Apps Script: Deploy → Manage deployments → Edit → New version → Deploy, then try again."
        );
      }

      if (!data.record) {
        throw new Error("No RSVP found for that name.");
      }

      fillFormFromRecord(data.record);
      setStatus("We found your RSVP — update anything below, then Resend RSVP.", "success");
      form.email.focus();
    } catch (err) {
      console.error(err);
      editLoaded = false;
      syncEditUi();
      setStatus(err.message || "Could not find that RSVP.", "error");
    } finally {
      if (findBtn) findBtn.disabled = false;
    }
  }

  if (editToggle) {
    editToggle.addEventListener("change", () => {
      editMode = Boolean(editToggle.checked);
      clearStatus();
      if (editMode) {
        resetEditState(true);
        setStatus("Enter the full name on your RSVP, then tap Find my RSVP.");
        form.guestName.focus();
      } else {
        resetEditState(false);
      }
    });
  }

  if (findBtn) {
    findBtn.addEventListener("click", () => {
      lookupRsvp();
    });
  }

  form.guestName.addEventListener("keydown", (event) => {
    if (editMode && !editLoaded && event.key === "Enter") {
      event.preventDefault();
      lookupRsvp();
    }
  });

  form.querySelectorAll('input[name="attendance"]').forEach((input) => {
    input.addEventListener("change", syncEventsField);
  });
  syncEventsField();
  syncEditUi();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (editMode && !editLoaded) {
      lookupRsvp();
      return;
    }

    if (!validateClient()) return;

    // Honeypot
    if (form.website && form.website.value.trim() !== "") {
      setStatus("Thanks — your RSVP was received.", "success");
      editMode = false;
      if (editToggle) editToggle.checked = false;
      resetEditState(false);
      return;
    }

    const attending = form.attendance.value === "Yes";
    const payload = {
      action: editMode ? "update" : "create",
      guestName: form.guestName.value.trim(),
      originalGuestName: editMode ? originalGuestName || form.guestName.value.trim() : undefined,
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
    setStatus(editMode ? "Updating your RSVP…" : "Sending…");

    try {
      if (!isConfigured()) {
        await new Promise((r) => setTimeout(r, 700));
        console.info("[RSVP demo]", payload);
        setStatus(
          "Demo mode: RSVP captured in the browser console. Set your Apps Script URL in js/config.js to go live.",
          "success"
        );
        editMode = false;
        if (editToggle) editToggle.checked = false;
        resetEditState(false);
        return;
      }

      await postAction(payload);

      setStatus(
        editMode
          ? "Thank you — your RSVP has been updated."
          : "Thank you — your RSVP is on its way to us.",
        "success"
      );
      editMode = false;
      if (editToggle) editToggle.checked = false;
      resetEditState(false);
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Could not send RSVP. Please try again later.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
