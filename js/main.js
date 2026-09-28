(function () {
  const PROPOSALS_UNLOCK_KEY = "cz-proposals-unlock";
  const PROPOSALS_NAMES = new Set(["zayrol", "caren"]);

  const isProposalsUnlocked = () => {
    try {
      return sessionStorage.getItem(PROPOSALS_UNLOCK_KEY) === "1";
    } catch (e) {
      return false;
    }
  };

  const applyProposalsVisibility = () => {
    if (isProposalsUnlocked()) {
      document.documentElement.classList.add("proposals-unlocked");
    }
  };

  applyProposalsVisibility();

  const unlockTrigger = document.querySelector("[data-proposals-unlock]");
  const gateDialog = document.querySelector("[data-proposals-gate]");
  const gateForm = document.querySelector("[data-proposals-gate-form]");
  const gateInput = document.querySelector("[data-proposals-gate-input]");
  const gateError = document.querySelector("[data-proposals-gate-error]");
  const gateCancel = document.querySelector("[data-proposals-gate-cancel]");

  const openProposalsGate = () => {
    if (!gateDialog || isProposalsUnlocked()) return;
    if (gateError) {
      gateError.hidden = true;
      gateError.textContent = "";
    }
    if (gateInput) {
      gateInput.value = "";
    }
    if (typeof gateDialog.showModal === "function") {
      gateDialog.showModal();
      window.setTimeout(() => gateInput && gateInput.focus(), 50);
    }
  };

  const closeProposalsGate = () => {
    if (gateDialog && gateDialog.open) gateDialog.close();
  };

  const verifyProposalsGate = (raw) => {
    const normalized = String(raw || "")
      .trim()
      .toLowerCase();
    return PROPOSALS_NAMES.has(normalized);
  };

  if (unlockTrigger) {
    unlockTrigger.addEventListener("click", (event) => {
      event.preventDefault();
      if (isProposalsUnlocked()) {
        try {
          sessionStorage.removeItem(PROPOSALS_UNLOCK_KEY);
        } catch (e) {}
        const base = window.location.pathname + window.location.search;
        window.location.href = base || "/";
        window.location.reload();
        return;
      }
      if (gateDialog) openProposalsGate();
    });
  }

  if (gateCancel) {
    gateCancel.addEventListener("click", closeProposalsGate);
  }

  if (gateForm) {
    gateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!gateInput) return;

      if (verifyProposalsGate(gateInput.value)) {
        try {
          sessionStorage.setItem(PROPOSALS_UNLOCK_KEY, "1");
        } catch (e) {}
        closeProposalsGate();
        const base = window.location.pathname + window.location.search;
        window.location.href = base + "#owners";
        window.location.reload();
        return;
      }

      if (gateError) {
        gateError.textContent = "That name does not match. Please try again.";
        gateError.hidden = false;
      }
      gateInput.focus();
      gateInput.select();
    });
  }

  // Legacy hash support
  if (window.location.hash === "#proposals" && isProposalsUnlocked()) {
    history.replaceState(null, "", window.location.pathname + window.location.search + "#owners");
  }

  const header = document.querySelector("[data-header]");
  const nav = document.querySelector("[data-nav]");
  const toggle = document.querySelector("[data-nav-toggle]");

  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (toggle && nav && header) {
    const isMobileNav = () => window.matchMedia("(max-width: 720px)").matches;

    const blockPageScroll = (event) => {
      if (!nav.classList.contains("is-open")) return;
      // Allow scrolling inside the drawer if it overflows
      if (nav.contains(event.target) && nav.scrollHeight > nav.clientHeight) {
        return;
      }
      event.preventDefault();
    };

    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      // Do not toggle overflow/position on body — that jumps scroll on mobile Safari
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    document.addEventListener("touchmove", blockPageScroll, { passive: false });
    document.addEventListener(
      "wheel",
      (event) => {
        if (nav.classList.contains("is-open") && isMobileNav()) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    window.addEventListener(
      "resize",
      () => {
        if (!isMobileNav()) setOpen(false);
      },
      { passive: true }
    );
  }

  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  // Wedding day: 27 Nov 2026, 1:30 PM Asia/Manila (UTC+8)
  const countdownRoot = document.querySelector("[data-countdown]");
  if (countdownRoot) {
    const target = new Date("2026-11-27T13:30:00+08:00").getTime();
    const units = {
      days: countdownRoot.querySelector("[data-days]"),
      hours: countdownRoot.querySelector("[data-hours]"),
      mins: countdownRoot.querySelector("[data-mins]"),
      secs: countdownRoot.querySelector("[data-secs]"),
    };
    const labelEl = countdownRoot.querySelector(".countdown__label");
    const pad = (n) => String(Math.max(0, n)).padStart(2, "0");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const setFlip = (el, value) => {
      if (!el) return;
      const span = el.querySelector("span") || el;
      if (span.textContent === value) return;
      span.textContent = value;
      if (reduceMotion) return;
      el.classList.remove("is-flipping");
      // force reflow for restart
      void el.offsetWidth;
      el.classList.add("is-flipping");
    };

    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setFlip(units.days, pad(days));
      setFlip(units.hours, pad(hours));
      setFlip(units.mins, pad(mins));
      setFlip(units.secs, pad(secs));

      if (diff === 0 && labelEl) {
        labelEl.textContent = "Today is the day";
      }
    };

    tick();
    setInterval(tick, 1000);
  }

  // RSVP deadline: 31 Oct 2026 end of day, Asia/Manila (UTC+8)
  const rsvpDeadline = document.querySelector("[data-rsvp-deadline]");
  if (rsvpDeadline) {
    const daysEl = rsvpDeadline.querySelector("[data-rsvp-days]");
    const labelEl = rsvpDeadline.querySelector("[data-rsvp-days-label]");
    const closeAt = new Date("2026-10-31T23:59:59+08:00").getTime();

    const updateRsvpDays = () => {
      const remaining = Math.max(0, closeAt - Date.now());
      const days = Math.ceil(remaining / 86400000);

      if (days <= 0) {
        rsvpDeadline.textContent = "RSVP is now closed.";
        return;
      }

      if (daysEl) daysEl.textContent = String(days);
      if (labelEl) labelEl.textContent = days === 1 ? "day" : "days";
    };

    updateRsvpDays();
    setInterval(updateRsvpDays, 60000);
  }

  // Proposals slider — 10s autoplay, pause on hover
  const proposalsRoot = document.querySelector("[data-proposals]");
  if (proposalsRoot) {
    const slides = Array.from(proposalsRoot.querySelectorAll("[data-proposal-slide]"));
    const dotsWrap = proposalsRoot.querySelector("[data-proposal-dots]");
    const prevBtn = proposalsRoot.querySelector("[data-proposal-prev]");
    const nextBtn = proposalsRoot.querySelector("[data-proposal-next]");
    const progress = proposalsRoot.querySelector("[data-proposal-progress]");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const INTERVAL = 10000;
    let index = Math.max(0, slides.findIndex((s) => s.classList.contains("is-active")));
    let timer = null;
    let paused = false;

    if (index < 0) index = 0;

    const dots = slides.map((_, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "proposals__dot" + (i === index ? " is-active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", "Show proposal " + (i + 1));
      btn.addEventListener("click", () => goTo(i, true));
      if (dotsWrap) dotsWrap.appendChild(btn);
      return btn;
    });

    const setProgress = (running) => {
      if (!progress) return;
      progress.classList.remove("is-running");
      void progress.offsetWidth;
      if (running && !reduceMotion) progress.classList.add("is-running");
    };

    const show = (nextIndex) => {
      if (!slides.length) return;
      const prev = slides[index];
      index = (nextIndex + slides.length) % slides.length;
      const next = slides[index];

      slides.forEach((slide, i) => {
        slide.classList.remove("is-active", "is-leaving");
        if (i === index) {
          slide.hidden = false;
          slide.classList.add("is-active");
        } else if (slide === prev && prev !== next) {
          slide.hidden = false;
          slide.classList.add("is-leaving");
          window.setTimeout(() => {
            if (!slide.classList.contains("is-active")) {
              slide.hidden = true;
              slide.classList.remove("is-leaving");
            }
          }, 700);
        } else {
          slide.hidden = true;
        }
      });

      dots.forEach((dot, i) => {
        dot.classList.toggle("is-active", i === index);
      });

      setProgress(!paused && !reduceMotion);
    };

    const stopTimer = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = () => {
      stopTimer();
      if (paused || reduceMotion || slides.length < 2) return;
      timer = window.setTimeout(() => {
        show(index + 1);
        schedule();
      }, INTERVAL);
      setProgress(true);
    };

    const goTo = (i, userDriven) => {
      show(i);
      if (userDriven) schedule();
    };

    const pause = () => {
      paused = true;
      proposalsRoot.classList.add("is-paused");
      stopTimer();
      if (progress) progress.classList.remove("is-running");
    };

    const resume = () => {
      paused = false;
      proposalsRoot.classList.remove("is-paused");
      schedule();
    };

    if (prevBtn) prevBtn.addEventListener("click", () => goTo(index - 1, true));
    if (nextBtn) nextBtn.addEventListener("click", () => goTo(index + 1, true));

    proposalsRoot.addEventListener("mouseenter", pause);
    proposalsRoot.addEventListener("mouseleave", resume);
    proposalsRoot.addEventListener("focusin", pause);
    proposalsRoot.addEventListener("focusout", (event) => {
      if (!proposalsRoot.contains(event.relatedTarget)) resume();
    });

    // Touch: pause while finger is down
    proposalsRoot.addEventListener("touchstart", pause, { passive: true });
    proposalsRoot.addEventListener("touchend", resume, { passive: true });

    show(index);
    schedule();
  }
})();