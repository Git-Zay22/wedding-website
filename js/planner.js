(function () {
  const UNLOCK_KEY = "cz-owners-unlock";
  const FULL_NAMES = new Set(["groom", "bride"]);

  const ownersLevel = () => {
    try {
      const value = sessionStorage.getItem(UNLOCK_KEY);
      return value === "all" ? "all" : "";
    } catch (e) {
      return "";
    }
  };

  const gateDialog = document.querySelector("[data-proposals-gate]");
  const gateForm = document.querySelector("[data-proposals-gate-form]");
  const gateInput = document.querySelector("[data-proposals-gate-input]");
  const gateError = document.querySelector("[data-proposals-gate-error]");
  const gateCancel = document.querySelector("[data-proposals-gate-cancel]");

  const openGate = () => {
    if (!gateDialog || typeof gateDialog.showModal !== "function") return;
    if (gateError) {
      gateError.hidden = true;
      gateError.textContent = "";
    }
    if (gateInput) gateInput.value = "";
    if (!gateDialog.open) gateDialog.showModal();
    window.setTimeout(() => gateInput && gateInput.focus(), 50);
  };

  if (ownersLevel() !== "all") openGate();

  if (gateCancel) {
    gateCancel.addEventListener("click", () => {
      window.location.href = "index.html#top";
    });
  }

  if (gateForm) {
    gateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!gateInput) return;
      const normalized = String(gateInput.value || "")
        .trim()
        .toLowerCase();
      if (FULL_NAMES.has(normalized)) {
        try {
          sessionStorage.setItem(UNLOCK_KEY, "all");
        } catch (e) {}
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

  const header = document.querySelector("[data-header]");
  const nav = document.querySelector("[data-nav]");
  const toggle = document.querySelector("[data-nav-toggle]");

  if (header) {
    const onScroll = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (toggle && nav && header) {
    const setOpen = (open) => {
      nav.classList.toggle("is-open", open);
      header.classList.toggle("nav-open", open);
      toggle.setAttribute("aria-expanded", String(open));
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      setOpen(!nav.classList.contains("is-open"));
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }
})();
