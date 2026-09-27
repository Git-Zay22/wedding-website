(function () {
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
    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    };

    toggle.addEventListener("click", () => {
      setOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    window.addEventListener(
      "resize",
      () => {
        if (window.matchMedia("(min-width: 721px)").matches) {
          setOpen(false);
        }
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

  // Wedding day: 27 Nov 2026, 2:00 PM Asia/Manila (UTC+8)
  const countdownRoot = document.querySelector("[data-countdown]");
  if (countdownRoot) {
    const target = new Date("2026-11-27T14:00:00+08:00").getTime();
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
})();
