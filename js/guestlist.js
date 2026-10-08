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
    unlocked = sessionStorage.getItem(UNLOCK_KEY) === "1";
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
  if (!url) {
    countEl.textContent = "Guestlist is not configured.";
    return;
  }

  fetch(url, {
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
        countEl.textContent = "Could not load the guestlist.";
        setStatus(
          data.error === "Missing required fields."
            ? "Paste the latest Apps Script, deploy a new version, then reload this page."
            : data.error || "Paste the latest Apps Script, deploy a new version, then reload this page."
        );
        return;
      }
      rows = data.rows;
      setStatus("");
      render();
    })
    .catch(() => {
      countEl.textContent = "Could not load the guestlist.";
      setStatus("The guestlist could not be reached. Please try again.");
    });
})();
