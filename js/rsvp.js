(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = form.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const findBtn = form.querySelector("[data-find-rsvp]");
  const editToggle = form.querySelector("[data-edit-toggle]");
  const editInstructions = form.querySelector("[data-edit-instructions]");
  const findHint = form.querySelector("[data-find-hint]");
  const detailsEl = form.querySelector("[data-rsvp-details]");
  const eventsField = form.querySelector("[data-events-field]");
  const loadingEl = document.querySelector("[data-rsvp-loading]");
  const loadingTextEl = document.querySelector("[data-rsvp-loading-text]");
  const eventsSelect = form.events;
  const config = window.RSVP_CONFIG || {};

  let editMode = false;
  let editLoaded = false;
  let originalGuestName = "";
  let originalEmail = "";
  let originalPhone = "";
  let baselineSnapshot = "";
  let lookupBusy = false;
  let submitBusy = false;
  let scrollLocked = false;
  const requestQueue = [];
  let queueRunning = false;
  let statusHideTimer = null;
  let statusFadeTimer = null;

  function clearStatusTimers() {
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = null;
    }
    if (statusFadeTimer) {
      clearTimeout(statusFadeTimer);
      statusFadeTimer = null;
    }
  }

  function clearStatus() {
    if (!statusEl) return;
    clearStatusTimers();
    statusEl.hidden = true;
    statusEl.classList.remove("is-error", "is-success", "is-flash", "is-fading");
    statusEl.replaceChildren();
  }

  function dismissStatus() {
    if (!statusEl || statusEl.hidden) return;
    clearStatusTimers();
    statusEl.classList.add("is-fading");
    statusFadeTimer = setTimeout(() => {
      clearStatus();
    }, 450);
  }

  function blockBackgroundScroll(event) {
    if (!scrollLocked) return;
    event.preventDefault();
  }

  function showLoading(message) {
    if (loadingTextEl) {
      loadingTextEl.textContent = message || "Sending your RSVP…";
    }
    if (loadingEl) loadingEl.hidden = false;
    document.documentElement.classList.add("is-rsvp-loading");
    document.body.classList.add("is-rsvp-loading");
    if (!scrollLocked) {
      scrollLocked = true;
      document.addEventListener("touchmove", blockBackgroundScroll, { passive: false });
      document.addEventListener("wheel", blockBackgroundScroll, { passive: false });
    }
  }

  function hideLoading() {
    if (loadingEl) loadingEl.hidden = true;
    document.documentElement.classList.remove("is-rsvp-loading");
    document.body.classList.remove("is-rsvp-loading");
    if (scrollLocked) {
      scrollLocked = false;
      document.removeEventListener("touchmove", blockBackgroundScroll);
      document.removeEventListener("wheel", blockBackgroundScroll);
    }
  }

  /** Run RSVP network work one-at-a-time so Apps Script / Worker are not flooded. */
  function enqueueRsvp(task) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ task, resolve, reject });
      drainRsvpQueue();
    });
  }

  async function drainRsvpQueue() {
    if (queueRunning) return;
    queueRunning = true;
    while (requestQueue.length) {
      const job = requestQueue.shift();
      try {
        job.resolve(await job.task());
      } catch (err) {
        job.reject(err);
      }
    }
    queueRunning = false;
  }

  function scrollToStatus(flash) {
    if (!statusEl || statusEl.hidden) return;
    statusEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!flash) return;
    statusEl.classList.remove("is-flash");
    void statusEl.offsetWidth;
    statusEl.classList.add("is-flash");
  }

  function setStatus(message, type, items) {
    if (!statusEl) return;

    if (!message && !(items && items.length)) {
      clearStatus();
      return;
    }

    clearStatusTimers();
    statusEl.hidden = false;
    statusEl.classList.remove("is-error", "is-success", "is-flash", "is-fading");
    if (type) statusEl.classList.add(`is-${type}`);
    statusEl.replaceChildren();

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "form-status__close";
    closeBtn.setAttribute("aria-label", "Dismiss message");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      dismissStatus();
    });
    statusEl.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "form-status__body";

    if (items && items.length) {
      const title = document.createElement("p");
      title.className = "form-status__title";
      title.textContent = message || "Please complete the required fields:";
      body.appendChild(title);

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

      body.appendChild(list);
    } else {
      body.textContent = message;
    }

    statusEl.appendChild(body);

    const preferCenter = type === "success" || type === "error";
    statusEl.scrollIntoView({
      behavior: "smooth",
      block: preferCenter ? "center" : "nearest",
    });
    if (type === "success") {
      statusEl.classList.remove("is-flash");
      void statusEl.offsetWidth;
      statusEl.classList.add("is-flash");
      statusHideTimer = setTimeout(() => {
        dismissStatus();
      }, 10000);
    }
  }

  function isConfigured() {
    const url = String((config && config.scriptUrl) || "").trim();
    if (!url) return false;
    if (url.indexOf("YOUR_GOOGLE_APPS_SCRIPT") !== -1) return false;
    if (url.indexOf("script.google.com") !== -1) return true;
    if (url.indexOf(".workers.dev") !== -1) return true;
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

  function getFormSnapshot() {
    return JSON.stringify({
      guestName: form.guestName.value.trim(),
      email: form.email.value.trim().toLowerCase(),
      phone: form.phone.value.trim(),
      attendance: form.attendance.value || "",
      events: form.events.value || "",
      commute: form.commute.value || "",
      allergies: form.allergies.value.trim(),
      message: form.message.value.trim(),
    });
  }

  function hasFormChanges() {
    return Boolean(editLoaded && baselineSnapshot && getFormSnapshot() !== baselineSnapshot);
  }

  function syncButtonState() {
    const busy = lookupBusy || submitBusy;
    if (findBtn) {
      findBtn.hidden = false;
      findBtn.disabled = !editMode || busy;
    }

    if (submitBtn) {
      submitBtn.hidden = false;
      if (!editMode) {
        submitBtn.textContent = "Send RSVP";
        submitBtn.disabled = busy;
      } else {
        submitBtn.textContent = "Resend RSVP";
        submitBtn.disabled = busy || !editLoaded || !hasFormChanges();
      }
    }
  }

  function syncEditUi() {
    form.classList.toggle("is-edit-mode", editMode);
    form.classList.toggle("is-edit-pending", editMode && !editLoaded);
    form.classList.toggle("is-edit-loaded", editMode && editLoaded);

    const pending = editMode && !editLoaded;
    if (detailsEl) detailsEl.hidden = pending;
    if (editInstructions) editInstructions.hidden = !editMode;
    if (findHint) findHint.hidden = !pending;

    // During find, HTML5 must not require both contacts — one of email/phone is enough
    form.email.required = !pending;
    form.phone.required = !pending;
    form.commute.required = !pending;
    const yesRadio = form.querySelector('input[name="attendance"][value="Yes"]');
    if (yesRadio) yesRadio.required = !pending;
    if (eventsSelect) {
      eventsSelect.required = !pending && form.attendance.value !== "No";
    }

    syncButtonState();
  }

  function resetEditState(keepName) {
    const keptName = keepName ? form.guestName.value : "";
    editLoaded = false;
    originalGuestName = "";
    originalEmail = "";
    originalPhone = "";
    baselineSnapshot = "";
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
    originalEmail = String(record.email || "")
      .trim()
      .toLowerCase();
    originalPhone = String(record.phone || "").trim();
    editLoaded = true;
    baselineSnapshot = getFormSnapshot();
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

  function phoneDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function validateFindFields() {
    const name = form.guestName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const digits = phoneDigits(phone);
    const issues = [];
    let focusEl = null;

    if (!name) {
      issues.push({ label: "Full name", detail: "is required" });
      focusEl = focusEl || form.guestName;
    }

    const hasEmail = Boolean(email);
    const hasPhone = digits.length >= 10;

    if (!hasEmail && !hasPhone) {
      issues.push({
        label: "Email or Mobile",
        detail: "enter at least one from your original RSVP",
      });
      focusEl = focusEl || form.email;
    } else {
      if (hasEmail && !isValidEmail(email)) {
        issues.push({ label: "Email", detail: "needs a valid address" });
        focusEl = focusEl || form.email;
      }
      if (phone && !hasPhone) {
        issues.push({ label: "Mobile", detail: "needs a valid number" });
        focusEl = focusEl || form.phone;
      }
    }

    if (issues.length) {
      setStatus("Please complete the required fields:", "error", issues);
      if (focusEl) focusEl.focus();
      return false;
    }

    return true;
  }

  function validateClient() {
    const name = form.guestName.value.trim();
    const email = form.email.value.trim();
    const phone = form.phone.value.trim();
    const digits = phoneDigits(phone);
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
      issues.push({ label: "Mobile", detail: "is required" });
      focusEl = focusEl || form.phone;
    } else if (digits.length < 10) {
      issues.push({ label: "Mobile", detail: "needs a valid number" });
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
          ? "Could not reach the RSVP server. Redeploy Apps Script as a Web app with access set to Anyone, then try again."
          : (text && text.slice(0, 160)) ||
            "Something went wrong. Please try again.";
      throw new Error(data.error || fallback);
    }
    return data;
  }

  async function sendAction(payload) {
    return enqueueRsvp(async () => {
      const token = String((config && config.rsvpToken) || "").trim();
      if (token) payload.token = token;

      // All actions (create / update / lookup) use POST so PII is not in the URL.
      const response = await fetch(config.scriptUrl, {
        method: "POST",
        mode: "cors",
        redirect: "follow",
        cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      });
      return parseJsonResponse(response);
    });
  }

  async function lookupRsvp() {
    if (!editMode || lookupBusy) return;

    clearStatus();
    if (!validateFindFields()) return;

    const guestName = form.guestName.value.trim();
    const email = form.email.value.trim().toLowerCase();
    const phone = form.phone.value.trim();

    lookupBusy = true;
    syncButtonState();
    clearStatus();
    showLoading("Finding your RSVP…");

    try {
      if (!isConfigured()) {
        await new Promise((r) => setTimeout(r, 500));
        throw new Error(
          "Lookup needs your live Apps Script URL. Deploy the updated Code.gs, then try again."
        );
      }

      const data = await sendAction({
        action: "lookup",
        guestName: guestName,
        email: email,
        phone: phone,
      });

      if (data && data.message && !data.record) {
        throw new Error(
          "Lookup is not active on the server yet. In Apps Script: Deploy → Manage deployments → Edit → New version → Deploy, then try again."
        );
      }

      if (!data.record) {
        throw new Error("No RSVP found for those details.");
      }

      hideLoading();
      fillFormFromRecord(data.record);
      setStatus("We found your RSVP — update anything below, then Resend RSVP.", "success");
      requestAnimationFrame(() => scrollToStatus(true));
      form.email.focus();
    } catch (err) {
      console.error(err);
      hideLoading();
      editLoaded = false;
      baselineSnapshot = "";
      syncEditUi();
      setStatus(err.message || "Could not find that RSVP.", "error");
      requestAnimationFrame(() => scrollToStatus(false));
    } finally {
      hideLoading();
      lookupBusy = false;
      syncButtonState();
    }
  }

  if (editToggle) {
    editToggle.addEventListener("change", () => {
      editMode = Boolean(editToggle.checked);
      clearStatus();
      if (editMode) {
        resetEditState(true);
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

  function onFindEnter(event) {
    if (editMode && !editLoaded && event.key === "Enter") {
      event.preventDefault();
      lookupRsvp();
    }
  }

  form.guestName.addEventListener("keydown", onFindEnter);
  form.email.addEventListener("keydown", onFindEnter);
  form.phone.addEventListener("keydown", onFindEnter);

  form.addEventListener("input", () => {
    if (editMode && editLoaded) syncButtonState();
  });
  form.addEventListener("change", () => {
    if (editMode && editLoaded) syncButtonState();
  });

  form.querySelectorAll('input[name="attendance"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncEventsField();
      if (editMode && editLoaded) syncButtonState();
    });
  });
  syncEventsField();
  syncEditUi();

  // Warm Apps Script / Worker so the first Find/Send is less likely to cold-start hang.
  // Goes through the same queue so warm never overlaps a Find/Send.
  function warmRsvpEndpoint() {
    const url = String((config && config.scriptUrl) || "").trim();
    if (!url || !isConfigured()) return;
    if (lookupBusy || submitBusy || requestQueue.length || queueRunning) return;
    enqueueRsvp(async () => {
      await fetch(url, { method: "GET", mode: "cors", cache: "no-store" }).catch(
        function () {}
      );
    }).catch(function () {});
  }
  warmRsvpEndpoint();
  const rsvpSection = document.getElementById("rsvp");
  if (rsvpSection && "IntersectionObserver" in window) {
    const warmOnce = new IntersectionObserver(
      function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        warmRsvpEndpoint();
        warmOnce.disconnect();
      },
      { rootMargin: "200px" }
    );
    warmOnce.observe(rsvpSection);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();

    if (editMode && !editLoaded) {
      lookupRsvp();
      return;
    }

    if (editMode && !hasFormChanges()) {
      setStatus("No changes to save. Update a field before Resend RSVP.", "error");
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
      originalEmail: editMode ? originalEmail : undefined,
      originalPhone: editMode ? originalPhone : undefined,
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

    submitBusy = true;
    syncButtonState();
    clearStatus();
    showLoading(editMode ? "Updating your RSVP…" : "Sending your RSVP…");

    try {
      if (!isConfigured()) {
        await new Promise((r) => setTimeout(r, 700));
        console.info("[RSVP demo]", payload);
        hideLoading();
        setStatus(
          "Demo mode: RSVP captured in the browser console. Set your Apps Script URL in js/config.js to go live.",
          "success"
        );
        editMode = false;
        if (editToggle) editToggle.checked = false;
        resetEditState(false);
        requestAnimationFrame(() => scrollToStatus(true));
        return;
      }

      const result = await sendAction(payload);
      if (!result.saved) {
        throw new Error(
          "RSVP did not save to the sheet. Paste the latest Code.gs, set SPREADSHEET_ID to your sheet ID, then Deploy → New version."
        );
      }

      hideLoading();
      setStatus(
        editMode
          ? "Thank you — your RSVP has been updated."
          : "Thank you — your RSVP is on its way to us.",
        "success"
      );
      editMode = false;
      if (editToggle) editToggle.checked = false;
      resetEditState(false);
      requestAnimationFrame(() => scrollToStatus(true));
    } catch (err) {
      console.error(err);
      hideLoading();
      setStatus(err.message || "Could not send RSVP. Please try again later.", "error");
      requestAnimationFrame(() => scrollToStatus(false));
    } finally {
      hideLoading();
      submitBusy = false;
      syncButtonState();
    }
  });
})();
