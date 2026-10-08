(function () {
  const UNLOCK_KEY = "cz-owners-unlock";
  const COLUMNS = [
    "submittedAt",
    "guestName",
    "email",
    "phone",
    "attendance",
    "events",
    "commute",
    "allergies",
    "hashtag",
    "message",
  ];
  const DETAIL_FIELDS = [
    ["submittedAt", "Submitted"],
    ["guestName", "Name"],
    ["email", "Email"],
    ["phone", "Mobile"],
    ["attendance", "Attendance"],
    ["events", "Attending"],
    ["commute", "Car"],
    ["allergies", "Allergy"],
    ["hashtag", "Hashtag"],
    ["message", "Message"],
  ];

  const root = document.querySelector("[data-guestlist]");
  if (!root) return;

  let unlocked = false;
  try {
    unlocked = sessionStorage.getItem(UNLOCK_KEY) === "all";
  } catch (e) {
    unlocked = false;
  }
  if (!unlocked) return;

  const countEl = root.querySelector("[data-guestlist-count]");
  const bodyEl = root.querySelector("[data-guestlist-body]");
  const statusEl = root.querySelector("[data-guestlist-status]");
  const searchEl = root.querySelector("[data-guestlist-search]");
  const lengthEl = root.querySelector("[data-guestlist-length]");
  const rangeEl = root.querySelector("[data-guestlist-range]");
  const prevEl = root.querySelector("[data-guestlist-prev]");
  const nextEl = root.querySelector("[data-guestlist-next]");
  const detailEl = document.querySelector("[data-guestlist-detail]");
  const detailNameEl = document.querySelector("[data-guestlist-detail-name]");
  const detailListEl = document.querySelector("[data-guestlist-detail-list]");
  const detailCloseEl = document.querySelector("[data-guestlist-detail-close]");
  const config = window.RSVP_CONFIG || {};

  let rows = [];
  let query = "";
  let sortKey = "submittedAt";
  let sortDir = "desc";
  let pageSize = 15;
  let page = 0;

  function cellText(row, key) {
    return String(row[key] == null ? "" : row[key]);
  }

  function filteredRows() {
    const needle = query.trim().toLowerCase();
    const list = needle
      ? rows.filter((row) =>
          COLUMNS.some((key) => cellText(row, key).toLowerCase().indexOf(needle) !== -1)
        )
      : rows.slice();

    list.sort((a, b) => {
      const left = cellText(a, sortKey).toLowerCase();
      const right = cellText(b, sortKey).toLowerCase();
      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }

  function render() {
    const list = filteredRows();
    const pages = Math.max(1, Math.ceil(list.length / pageSize) || 1);
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;
    const start = list.length ? page * pageSize : 0;
    const visible = list.slice(start, start + pageSize);
    bodyEl.replaceChildren();

    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length + 1;
      td.className = "guestlist__empty";
      td.textContent = "No guests yet.";
      tr.appendChild(td);
      bodyEl.appendChild(tr);
    } else if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length + 1;
      td.className = "guestlist__empty";
      td.textContent = "No replies match that search.";
      tr.appendChild(td);
      bodyEl.appendChild(tr);
    } else {
      visible.forEach((row) => {
        const tr = document.createElement("tr");
        COLUMNS.forEach((key) => {
          const td = document.createElement("td");
          td.setAttribute("data-col", key);
          if (key === "message") {
            const area = document.createElement("textarea");
            area.className = "guestlist__message";
            area.readOnly = true;
            area.value = cellText(row, key);
            area.rows = 3;
            area.setAttribute("aria-label", "Message");
            td.appendChild(area);
          } else {
            td.textContent = cellText(row, key);
          }
          tr.appendChild(td);
        });
        tr.appendChild(actionCell(row));
        bodyEl.appendChild(tr);
      });
    }

    const total = list.length;
    const from = total ? start + 1 : 0;
    const to = total ? start + visible.length : 0;
    countEl.textContent = rows.length === 1 ? "1 reply" : rows.length + " replies";
    if (rangeEl) {
      rangeEl.textContent = query.trim()
        ? "Showing " + from + " to " + to + " of " + total + " matches"
        : "Showing " + from + " to " + to + " of " + total;
    }
    if (prevEl) prevEl.disabled = page <= 0 || !total;
    if (nextEl) nextEl.disabled = page >= pages - 1 || !total;
  }

  function actionCell(row) {
    const td = document.createElement("td");
    td.setAttribute("data-col", "actions");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "guestlist__view";
    button.textContent = "View";
    button.setAttribute("aria-label", "View " + (cellText(row, "guestName") || "guest") + " details");
    button.addEventListener("click", () => openDetails(row));
    td.appendChild(button);
    return td;
  }

  function openDetails(row) {
    if (!detailEl || !detailListEl) return;
    if (detailNameEl) detailNameEl.textContent = cellText(row, "guestName") || "Guest";
    detailListEl.replaceChildren();
    DETAIL_FIELDS.forEach((field) => {
      const label = field[0];
      const title = field[1];
      const dt = document.createElement("dt");
      dt.textContent = title;
      const dd = document.createElement("dd");
      if (label === "message") {
        const area = document.createElement("textarea");
        area.className = "guestlist__message";
        area.readOnly = true;
        area.value = cellText(row, label);
        area.rows = 4;
        area.setAttribute("aria-label", "Message");
        dd.appendChild(area);
      } else {
        dd.textContent = cellText(row, label) || "—";
      }
      detailListEl.appendChild(dt);
      detailListEl.appendChild(dd);
    });
    if (typeof detailEl.showModal === "function" && !detailEl.open) detailEl.showModal();
  }

  function setStatus(message) {
    statusEl.textContent = message || "";
  }

  root.querySelectorAll("[data-guestlist-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-guestlist-sort");
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = key === "submittedAt" ? "desc" : "asc";
      }
      render();
    });
  });

  if (searchEl) {
    searchEl.addEventListener("input", () => {
      query = searchEl.value;
      page = 0;
      render();
    });
  }

  if (lengthEl) {
    lengthEl.addEventListener("change", () => {
      const nextSize = Number(lengthEl.value);
      pageSize = nextSize >= 15 && nextSize <= 50 ? nextSize : 15;
      page = 0;
      render();
    });
  }

  if (prevEl) {
    prevEl.addEventListener("click", () => {
      page -= 1;
      render();
    });
  }

  if (nextEl) {
    nextEl.addEventListener("click", () => {
      page += 1;
      render();
    });
  }

  if (detailCloseEl && detailEl) {
    detailCloseEl.addEventListener("click", () => detailEl.close());
  }

  if (detailEl) {
    detailEl.addEventListener("click", (event) => {
      if (event.target === detailEl) detailEl.close();
    });
  }

  const url = String(config.scriptUrl || "").trim();
  const scrollEl = root.querySelector("[data-guestlist-scroll]");
  const loadingEl = root.querySelector("[data-guestlist-loading]");
  const POLL_MS = 15000;
  const REFRESH_DELAY_MS = 2000;
  let shownKey = "";
  let pollTimer = 0;
  let refreshTimer = 0;
  let lastCheck = 0;
  let refreshing = false;

  if (!url) {
    countEl.textContent = "Guestlist is not configured.";
    return;
  }

  function rosterKey(list) {
    return list
      .map((row) =>
        [row.submittedAt, row.guestName, row.email, row.phone, row.attendance, row.events, row.commute, row.allergies, row.hashtag, row.message].join("\u001f")
      )
      .sort()
      .join("\u001e");
  }

  function placeLoading() {
    if (!loadingEl || !scrollEl || loadingEl.hidden) return;
    const box = scrollEl.getBoundingClientRect();
    const top = Math.max(box.top, 0);
    const bottom = Math.min(box.bottom, window.innerHeight);
    const height = bottom - top;
    if (height < 48 || box.width < 48) {
      loadingEl.style.position = "";
      loadingEl.style.top = "";
      loadingEl.style.left = "";
      loadingEl.style.width = "";
      loadingEl.style.height = "";
      return;
    }
    loadingEl.style.position = "fixed";
    loadingEl.style.top = top + "px";
    loadingEl.style.left = box.left + "px";
    loadingEl.style.width = box.width + "px";
    loadingEl.style.height = height + "px";
  }

  function setTableLoading(on) {
    if (loadingEl) loadingEl.hidden = !on;
    if (scrollEl) scrollEl.setAttribute("aria-busy", on ? "true" : "false");
    window.removeEventListener("scroll", placeLoading, true);
    window.removeEventListener("resize", placeLoading);
    if (!on || !loadingEl) {
      if (loadingEl) loadingEl.style.cssText = "";
      return;
    }
    placeLoading();
    window.addEventListener("scroll", placeLoading, true);
    window.addEventListener("resize", placeLoading);
  }

  function requestList() {
    lastCheck = Date.now();
    return fetch(url, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "list" }),
    })
      .then(async (response) => {
        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = {};
        }
        if (!response.ok || !data || data.ok === false || !Array.isArray(data.rows)) {
          return { ok: false, error: data && data.error ? data.error : "" };
        }
        return { ok: true, rows: data.rows };
      })
      .catch(() => ({ ok: false, error: "" }));
  }

  function showLoadError(error) {
    countEl.textContent = "Could not load the guestlist.";
    setStatus(
      error === "Missing required fields."
        ? "Paste the latest Apps Script, deploy a new version, then reload this page."
        : error || "The guestlist could not be reached. Please try again."
    );
  }

  function schedulePoll() {
    window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(checkForNew, POLL_MS);
  }

  function checkForNew() {
    if (refreshing || document.hidden) {
      schedulePoll();
      return;
    }
    if (Date.now() - lastCheck < 10000) {
      schedulePoll();
      return;
    }
    requestList().then((result) => {
      if (!result.ok) {
        schedulePoll();
        return;
      }
      const nextKey = rosterKey(result.rows);
      if (!shownKey || nextKey === shownKey) {
        schedulePoll();
        return;
      }
      refreshing = true;
      setTableLoading(true);
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        rows = result.rows;
        shownKey = nextKey;
        setStatus("");
        render();
        setTableLoading(false);
        refreshing = false;
        schedulePoll();
      }, REFRESH_DELAY_MS);
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || refreshing) return;
    window.clearTimeout(pollTimer);
    checkForNew();
  });

  requestList().then((result) => {
    if (!result.ok) {
      showLoadError(result.error);
      return;
    }
    rows = result.rows;
    shownKey = rosterKey(rows);
    setStatus("");
    render();
    schedulePoll();
  });
})();
