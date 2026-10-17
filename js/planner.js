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
    if (!gateDialog) return;
    if (gateError) {
      gateError.hidden = true;
      gateError.textContent = "";
    }
    if (gateInput) gateInput.value = "";
    if (typeof gateDialog.showModal === "function") {
      if (!gateDialog.open) gateDialog.showModal();
    } else {
      gateDialog.setAttribute("open", "");
    }
  };

  if (ownersLevel() !== "all") openGate();

  if (gateCancel) {
    gateCancel.addEventListener("click", () => {
      window.location.href = "index.html#top";
    });
  }

  const rememberOwners = () => {
    try {
      sessionStorage.setItem(UNLOCK_KEY, "all");
    } catch (e) {}
    try {
      document.cookie = "cz-owners-unlock=all; Path=/; SameSite=Lax";
    } catch (e) {}
  };

  let latestAnswer = "";
  if (gateInput) {
    gateInput.addEventListener("input", () => {
      latestAnswer = gateInput.value;
    });
  }

  const readGateAnswer = (event) => {
    let raw = latestAnswer || (gateInput ? gateInput.value : "");
    const form = event && event.target && event.target.elements ? event.target : gateForm;
    if (form && typeof FormData === "function") {
      try {
        const fromForm = new FormData(form).get("answer");
        if (fromForm) raw = String(fromForm);
      } catch (e) {}
    }
    if (!raw && gateInput) raw = gateInput.value || latestAnswer;
    return raw;
  };

  const submitGate = (event) => {
    if (event) event.preventDefault();
    if (!gateInput) return;
    if (document.activeElement === gateInput) gateInput.blur();
    window.setTimeout(() => {
      const normalized = String(readGateAnswer(event) || "")
        .normalize("NFKC")
        .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      if (FULL_NAMES.has(normalized)) {
        rememberOwners();
        window.setTimeout(() => {
          window.location.reload();
        }, 40);
        return;
      }
      if (gateError) {
        gateError.textContent = "That name does not match. Please try again.";
        gateError.hidden = false;
      }
    }, 0);
  };

  if (gateForm) {
    gateForm.addEventListener("submit", submitGate);
  }
  const gateConfirm = document.querySelector("[data-proposals-gate-confirm]");
  if (gateConfirm) {
    gateConfirm.addEventListener("click", submitGate);
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
