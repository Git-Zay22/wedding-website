(function () {
  const form = document.getElementById("rsvp-form");
  if (!form) return;

  const statusEl = document.querySelector("[data-status]");
  const submitBtn = form.querySelector("[data-submit]");
  const findBtn = form.querySelector("[data-find-rsvp]");
  const editToggle = form.querySelector("[data-edit-toggle]");
  const detailsEl = form.querySelector("[data-rsvp-details]");
  const eventsField = form.querySelector("[data-events-field]");
  const loadingEl = document.querySelector("[data-rsvp-loading]");
  const loadingTextEl = document.querySelector("[data-rsvp-loading-text]");
  const eventsSelect = form.events;
  const skipEmail = form.querySelector("[data-skip-email]");
  const skipPhone = form.querySelector("[data-skip-phone]");
  const emailReq = form.querySelector("[data-email-req]");
  const phoneReq = form.querySelector("[data-phone-req]");
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
  let pinnedNotice = null;
  let renderedNoticeKey = "";
  let warningDismissed = false;
  let nameGuideDismissed = false;
  let nameGuideRequested = true;
  let editGuideDismissed = false;
  let rsvpInView = false;
  let rsvpSectionVisible = false;
  let footerInView = false;
  let sectionLeaveTimer = null;
  let noticeDeadline = 0;
  let noticePaused = false;
  let noticeRemain = 0;
  const NOTICE_MS = 10000;
  const nameGuideBtn = form.querySelector("[data-name-guide]");

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

  function oneContactSkipped() {
    return Boolean(skipEmail && skipEmail.checked) !== Boolean(skipPhone && skipPhone.checked);
  }

  function desiredNotice() {
    if (pinnedNotice) return pinnedNotice;
    if (oneContactSkipped() && !warningDismissed) {
      return {
        type: "warning",
        kind: "contact",
        message:
          "If you do not have an email address or a mobile number, please turn on the switch beside that field. When you find or edit your RSVP, please turn on the switch for any contact you left out.",
      };
    }
    if (nameGuideRequested && !nameGuideDismissed) {
      return { type: "guide", kind: "name" };
    }
    if (editMode && !editLoaded && !editGuideDismissed) {
      return { type: "guide", kind: "edit" };
    }
    return null;
  }

  function noticeKey(notice) {
    if (!notice) return "";
    if (notice.items && notice.items.length) {
      return notice.type + "|" + notice.message + "|" + notice.items.map((item) => item.label + ":" + item.detail).join("|");
    }
    return notice.type + "|" + (notice.kind || "") + "|" + (notice.message || "");
  }

  function appendStrong(parent, text) {
    const strong = document.createElement("strong");
    strong.textContent = text;
    parent.appendChild(strong);
  }

  function buildNameGuide() {
    const wrap = document.createElement("div");
    wrap.className = "name-guide";
    wrap.id = "guestName-hint";

    const lead = document.createElement("p");
    lead.className = "name-guide__lead";
    lead.textContent = "Please use your real name when you register. Capitalization does not matter.";
    wrap.appendChild(lead);

    const list = document.createElement("ul");
    list.className = "name-guide__list";
    [
      ["Two given names", "JUAN MIGUEL DELA CRUZ"],
      ["A suffix, written without a period", "JUAN DELA CRUZ JR"],
    ].forEach((pair) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.className = "name-guide__label";
      label.textContent = pair[0];
      const example = document.createElement("span");
      example.className = "name-guide__example";
      example.textContent = pair[1];
      li.append(label, example);
      list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function buildEditGuide() {
    const wrap = document.createElement("div");
    wrap.className = "rsvp-edit-instructions";

    const title = document.createElement("p");
    title.className = "rsvp-edit-instructions__title";
    title.textContent = "How to edit your RSVP";
    wrap.appendChild(title);

    const list = document.createElement("ol");
    list.className = "rsvp-edit-instructions__list";

    const steps = [
      (li) => {
        li.append("Enter your real full name. Capitalization does not matter. Include both given names if you have two, and write a suffix without a period.");
      },
      (li) => {
        li.append("Enter the email ");
        appendStrong(li, "or");
        li.append(" mobile number from your original RSVP.");
      },
      (li) => {
        li.append("Tap ");
        appendStrong(li, "Find my RSVP");
        li.append(" to load your reply.");
      },
      (li) => {
        li.append("Change any details you need, then tap ");
        appendStrong(li, "Resend RSVP");
        li.append(".");
      },
    ];

    steps.forEach((fill) => {
      const li = document.createElement("li");
      fill(li);
      list.appendChild(li);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function syncNameGuideButton() {
    if (!nameGuideBtn) return;
    const open =
      nameGuideRequested &&
      !nameGuideDismissed &&
      statusEl &&
      !statusEl.hidden &&
      renderedNoticeKey.indexOf("guide|name") === 0;
    nameGuideBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function syncNoticeBar() {
    if (!statusEl || !noticeDeadline || noticePaused) return;
    const bar = statusEl.querySelector(".form-status__bar > span");
    if (!bar) return;
    const remain = Math.max(0, noticeDeadline - Date.now());
    const scale = Math.min(1, remain / NOTICE_MS);
    bar.style.transition = "none";
    bar.style.transform = "scaleX(" + scale + ")";
    void bar.offsetWidth;
    if (remain > 0) {
      bar.style.transition = "transform " + remain + "ms linear";
      bar.style.transform = "scaleX(0)";
    }
  }

  function scheduleNoticeEnd() {
    const remain = Math.max(0, noticeDeadline - Date.now());
    statusFadeTimer = setTimeout(() => {
      if (!statusEl || statusEl.hidden) return;
      statusEl.classList.add("is-timing-out");
    }, remain);
    statusHideTimer = setTimeout(() => {
      if (statusEl) statusEl.classList.remove("is-timing-out");
      dismissCurrentNotice();
    }, remain + 420);
  }

  function pauseNoticeTimer() {
    if (!statusEl || statusEl.hidden || !noticeDeadline || noticePaused) return;
    noticeRemain = Math.max(0, noticeDeadline - Date.now());
    noticePaused = true;
    clearStatusTimers();
    statusEl.classList.remove("is-timing-out");
    const bar = statusEl.querySelector(".form-status__bar > span");
    if (!bar) return;
    const transform = getComputedStyle(bar).transform;
    bar.style.transition = "none";
    if (transform && transform !== "none") bar.style.transform = transform;
  }

  function resumeNoticeTimer() {
    if (!noticePaused || !statusEl || statusEl.hidden) return;
    noticePaused = false;
    noticeDeadline = Date.now() + noticeRemain;
    statusEl.classList.remove("is-timing-out");
    syncNoticeBar();
    scheduleNoticeEnd();
  }

  function armNoticeTimer() {
    clearStatusTimers();
    noticePaused = false;
    noticeDeadline = Date.now() + NOTICE_MS;
    if (statusEl) statusEl.classList.remove("is-timing-out");
    syncNoticeBar();
    scheduleNoticeEnd();
    if (statusEl && statusEl.matches(":hover")) pauseNoticeTimer();
  }

  function hideNotice() {
    if (!statusEl) return;
    if (sectionLeaveTimer) {
      clearTimeout(sectionLeaveTimer);
      sectionLeaveTimer = null;
    }
    statusEl.hidden = true;
    statusEl.classList.remove("is-error", "is-success", "is-warning", "is-guide", "is-flash", "is-fading", "is-timing-out", "is-offsection");
    statusEl.replaceChildren();
    renderedNoticeKey = "";
    noticeDeadline = 0;
    noticePaused = false;
    noticeRemain = 0;
    syncNameGuideButton();
  }

  function concealForSection() {
    if (!statusEl || statusEl.hidden) return;
    statusEl.classList.add("is-offsection");
    if (sectionLeaveTimer) clearTimeout(sectionLeaveTimer);
    sectionLeaveTimer = setTimeout(() => {
      sectionLeaveTimer = null;
      if (rsvpInView) return;
      statusEl.hidden = true;
    }, 420);
  }

  function slideNoticeIn() {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.classList.add("is-offsection");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (rsvpInView) {
          statusEl.classList.remove("is-offsection");
          syncNoticeBar();
        }
      });
    });
  }

  function paintNotice(notice) {
    if (!statusEl) return;
    const key = noticeKey(notice);
    const offscreen = statusEl.hidden || statusEl.classList.contains("is-offsection");
    if (key === renderedNoticeKey && !offscreen && !statusEl.classList.contains("is-fading")) return;
    if (key === renderedNoticeKey && offscreen) {
      slideNoticeIn();
      return;
    }

    statusEl.hidden = false;
    statusEl.classList.remove("is-error", "is-success", "is-warning", "is-guide", "is-flash", "is-fading", "is-timing-out");
    statusEl.classList.add("is-" + notice.type);
    statusEl.replaceChildren();

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "form-status__close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      dismissCurrentNotice();
    });
    statusEl.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "form-status__body";

    if (notice.type === "guide" && notice.kind === "name") {
      body.appendChild(buildNameGuide());
    } else if (notice.type === "guide" && notice.kind === "edit") {
      body.appendChild(buildEditGuide());
    } else if (notice.items && notice.items.length) {
      const title = document.createElement("p");
      title.className = "form-status__title";
      title.textContent = notice.message || "Please complete the required fields:";
      body.appendChild(title);

      const list = document.createElement("ul");
      list.className = "form-status__list";
      notice.items.forEach((item) => {
        const li = document.createElement("li");
        const label = typeof item === "string" ? item : item.label;
        const detail = typeof item === "string" ? "is required" : item.detail;
        li.append(document.createTextNode(label + " "));

        const star = document.createElement("span");
        star.className = "form-status__req";
        star.setAttribute("aria-hidden", "true");
        star.textContent = "*";
        li.appendChild(star);

        if (detail) li.append(document.createTextNode(" — " + detail));
        list.appendChild(li);
      });
      body.appendChild(list);
    } else {
      body.textContent = notice.message || "";
    }

    statusEl.appendChild(body);

    const bar = document.createElement("div");
    bar.className = "form-status__bar";
    bar.setAttribute("aria-hidden", "true");
    const barFill = document.createElement("span");
    bar.appendChild(barFill);
    statusEl.appendChild(bar);

    renderedNoticeKey = key;
    if (offscreen) slideNoticeIn();
    else statusEl.classList.remove("is-offsection");
    armNoticeTimer();
    syncNameGuideButton();

    if (notice.type === "success") {
      statusEl.classList.remove("is-flash");
      void statusEl.offsetWidth;
      statusEl.classList.add("is-flash");
    }
  }

  function refreshNotice() {
    const notice = desiredNotice();
    if (!notice) {
      hideNotice();
      return;
    }
    if (!rsvpInView) {
      concealForSection();
      return;
    }
    paintNotice(notice);
  }

  function clearStatus() {
    pinnedNotice = null;
    nameGuideRequested = false;
    clearStatusTimers();
    renderedNoticeKey = "";
    refreshNotice();
  }

  function fadeThenRefresh() {
    clearStatusTimers();
    renderedNoticeKey = "";
    refreshNotice();
  }

  function dismissCurrentNotice() {
    const notice = desiredNotice();
    if (!notice) return;
    if (notice.type === "error" || notice.type === "success") pinnedNotice = null;
    else if (notice.type === "warning") warningDismissed = true;
    else if (notice.kind === "edit") editGuideDismissed = true;
    else {
      nameGuideDismissed = true;
      nameGuideRequested = false;
    }
    if (notice.type === "warning" || notice.kind === "edit") nameGuideDismissed = true;
    fadeThenRefresh();
  }

  function dismissStatus() {
    pinnedNotice = null;
    fadeThenRefresh();
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
    if (!statusEl || statusEl.hidden || !flash) return;
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
    pinnedNotice = {
      type: type || "error",
      kind: type || "error",
      message: message,
      items: items || null,
    };
    renderedNoticeKey = "";
    refreshNotice();
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
    const contact = contactValues();
    return JSON.stringify({
      guestName: form.guestName.value.trim(),
      email: contact.email,
      phone: contact.phone,
      noEmail: contact.noEmail,
      noPhone: contact.noPhone,
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
    if (!editMode) editGuideDismissed = false;

    form.commute.required = !pending;
    const yesRadio = form.querySelector('input[name="attendance"][value="Yes"]');
    if (yesRadio) yesRadio.required = !pending;
    if (eventsSelect) {
      eventsSelect.required = !pending && form.attendance.value !== "No";
    }

    syncContactSkips();
    syncButtonState();
    refreshNotice();
  }

  function resetEditState(keepName) {
    const keptName = keepName ? form.guestName.value : "";
    editLoaded = false;
    originalGuestName = "";
    originalEmail = "";
    originalPhone = "";
    baselineSnapshot = "";
    form.reset();
    delete form.email.dataset.kept;
    delete form.phone.dataset.kept;
    if (editToggle) editToggle.checked = editMode;
    if (keepName) form.guestName.value = keptName;
    setAttendanceValue("");
    syncEventsField();
    syncEditUi();
  }

  function fillFormFromRecord(record) {
    form.guestName.value = record.guestName || "";
    delete form.email.dataset.kept;
    delete form.phone.dataset.kept;
    form.email.value = record.email || "";
    form.phone.value = record.phone || "";
    if (skipEmail) skipEmail.checked = !String(record.email || "").trim();
    if (skipPhone) skipPhone.checked = !String(record.phone || "").trim();
    if (skipEmail && skipPhone && skipEmail.checked && skipPhone.checked) {
      skipEmail.checked = false;
      skipPhone.checked = false;
    }
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
    syncEventsField();
    syncEditUi();
    baselineSnapshot = getFormSnapshot();
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

  function contactValues() {
    const noEmail = Boolean(skipEmail && skipEmail.checked);
    const noPhone = Boolean(skipPhone && skipPhone.checked);
    return {
      noEmail: noEmail,
      noPhone: noPhone,
      email: noEmail ? "" : form.email.value.trim().toLowerCase(),
      phone: noPhone ? "" : form.phone.value.trim(),
    };
  }

  function applyContactField(input, reqEl, skipped, pending, placeholder, skippedPlaceholder) {
    const field = input.closest(".field");
    if (skipped) {
      if (input.value) input.dataset.kept = input.value;
      input.value = "";
      input.disabled = true;
      input.required = false;
      input.placeholder = skippedPlaceholder;
      if (field) field.classList.add("is-skipped");
      if (reqEl) reqEl.hidden = true;
    } else {
      input.disabled = false;
      if (input.dataset.kept) {
        input.value = input.dataset.kept;
        delete input.dataset.kept;
      }
      input.required = !pending;
      input.placeholder = placeholder;
      if (field) field.classList.remove("is-skipped");
      if (reqEl) reqEl.hidden = false;
    }
  }

  function syncContactSkips() {
    const pending = editMode && !editLoaded;
    applyContactField(
      form.email,
      emailReq,
      Boolean(skipEmail && skipEmail.checked),
      pending,
      "you@email.com",
      "No email address"
    );
    applyContactField(
      form.phone,
      phoneReq,
      Boolean(skipPhone && skipPhone.checked),
      pending,
      "09XXXXXXXXX",
      "No mobile number"
    );
    refreshNotice();
  }

  function onSkipChange(changed, other) {
    if (changed && changed.checked && other) other.checked = false;
    warningDismissed = false;
    if (pinnedNotice && pinnedNotice.type === "error") {
      pinnedNotice = null;
      renderedNoticeKey = "";
    }
    syncContactSkips();
    if (editMode && editLoaded) syncButtonState();
  }

  function validateFindFields() {
    const name = form.guestName.value.trim();
    const contact = contactValues();
    const email = contact.email;
    const phone = contact.phone;
    const digits = phoneDigits(phone);
    const issues = [];
    let focusEl = null;

    if (!name) {
      issues.push({ label: "Full name", detail: "is required" });
      focusEl = focusEl || form.guestName;
    }

    const hasEmail = Boolean(email);
    const hasPhone = digits.length >= 10;

    if (contact.noEmail && contact.noPhone) {
      issues.push({
        label: "Email or Mobile",
        detail: "keep at least one contact",
      });
      focusEl = focusEl || form.email;
    } else if (!hasEmail && !hasPhone) {
      issues.push({
        label: contact.noEmail ? "Mobile" : contact.noPhone ? "Email" : "Email or Mobile",
        detail: contact.noEmail || contact.noPhone
          ? "is required"
          : "enter at least one from your original RSVP",
      });
      focusEl = focusEl || (contact.noEmail ? form.phone : form.email);
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
    const contact = contactValues();
    const email = contact.email;
    const phone = contact.phone;
    const digits = phoneDigits(phone);
    const issues = [];
    let focusEl = null;

    if (!name) {
      issues.push({ label: "Full name", detail: "is required" });
      focusEl = focusEl || form.guestName;
    }

    if (contact.noEmail && contact.noPhone) {
      issues.push({ label: "Email or Mobile", detail: "keep at least one" });
      focusEl = focusEl || form.email;
    } else {
      if (!contact.noEmail) {
        if (!email) {
          issues.push({ label: "Email", detail: "is required" });
          focusEl = focusEl || form.email;
        } else if (!isValidEmail(email)) {
          issues.push({ label: "Email", detail: "needs a valid address" });
          focusEl = focusEl || form.email;
        }
      }

      if (!contact.noPhone) {
        if (!phone) {
          issues.push({ label: "Mobile", detail: "is required" });
          focusEl = focusEl || form.phone;
        } else if (digits.length < 10) {
          issues.push({ label: "Mobile", detail: "needs a valid number" });
          focusEl = focusEl || form.phone;
        }
      }
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
    const contact = contactValues();
    const email = contact.email;
    const phone = contact.phone;

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
      if (form.email.disabled) form.phone.focus();
      else form.email.focus();
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
        editGuideDismissed = false;
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

  function showNameGuide() {
    pinnedNotice = null;
    clearStatusTimers();
    nameGuideRequested = true;
    nameGuideDismissed = false;
    renderedNoticeKey = "";
    readRsvpPresence();
    refreshNotice();
  }

  if (nameGuideBtn) {
    nameGuideBtn.addEventListener("click", (event) => {
      event.preventDefault();
      showNameGuide();
    });
  }

  if (statusEl) {
    statusEl.addEventListener("pointerenter", pauseNoticeTimer);
    statusEl.addEventListener("pointerleave", resumeNoticeTimer);
  }

  form.guestName.addEventListener("keydown", onFindEnter);
  form.email.addEventListener("keydown", onFindEnter);
  form.phone.addEventListener("keydown", onFindEnter);

  if (skipEmail) {
    skipEmail.addEventListener("change", () => onSkipChange(skipEmail, skipPhone));
  }
  if (skipPhone) {
    skipPhone.addEventListener("change", () => onSkipChange(skipPhone, skipEmail));
  }

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

  const rsvpSection = document.getElementById("rsvp");
  const siteFooter = document.querySelector(".site-footer");

  function updateRsvpPresence() {
    const visible = rsvpSectionVisible && !footerInView;
    if (visible === rsvpInView) return;
    rsvpInView = visible;
    refreshNotice();
  }

  function readRsvpPresence() {
    const vh = window.innerHeight || 0;
    if (rsvpSection) {
      const section = rsvpSection.getBoundingClientRect();
      rsvpSectionVisible = section.bottom > vh * 0.12 && section.top < vh;
    } else {
      rsvpSectionVisible = true;
    }
    if (siteFooter) {
      const footer = siteFooter.getBoundingClientRect();
      // A sliver of the footer can show while the form is still on screen.
      // Fade only once the footer has moved well into the page.
      footerInView = footer.top < vh * 0.55 && footer.bottom > 0;
    } else {
      footerInView = false;
    }
    updateRsvpPresence();
  }

  if (rsvpSection || siteFooter) {
    let presenceFrame = 0;
    function schedulePresence() {
      if (presenceFrame) return;
      presenceFrame = window.requestAnimationFrame(function () {
        presenceFrame = 0;
        readRsvpPresence();
      });
    }
    window.addEventListener("scroll", schedulePresence, { passive: true });
    window.addEventListener("resize", schedulePresence);
    window.addEventListener("load", readRsvpPresence);
    readRsvpPresence();
    // Hash links can land on the form after the first measurement.
    requestAnimationFrame(readRsvpPresence);
  } else {
    rsvpInView = true;
    refreshNotice();
  }

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
      setStatus("Thank you. We have received your RSVP.", "success");
      editMode = false;
      if (editToggle) editToggle.checked = false;
      resetEditState(false);
      return;
    }

    const attending = form.attendance.value === "Yes";
    const contact = contactValues();
    const payload = {
      action: editMode ? "update" : "create",
      guestName: form.guestName.value.trim(),
      originalGuestName: editMode ? originalGuestName || form.guestName.value.trim() : undefined,
      originalEmail: editMode ? originalEmail : undefined,
      originalPhone: editMode ? originalPhone : undefined,
      email: contact.email,
      phone: contact.phone,
      noEmail: contact.noEmail,
      noPhone: contact.noPhone,
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
          ? "Thank you. Your RSVP has been updated."
          : "Thank you. We have received your RSVP.",
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
