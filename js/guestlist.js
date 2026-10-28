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
  const progressEl = root.querySelector("[data-guestlist-progress]");
  const invitedEl = root.querySelector("[data-guestlist-invited]");
  const registeredEl = root.querySelector("[data-guestlist-registered]");
  const pendingEl = root.querySelector("[data-guestlist-pending]");
  const trackEl = root.querySelector("[data-guestlist-track]");
  const fillEl = root.querySelector("[data-guestlist-fill]");
  const bodyEl = root.querySelector("[data-guestlist-body]");
  const invitedBodyEl = root.querySelector("[data-guestlist-invited-body]");
  const repliesTableEl = root.querySelector('[data-guestlist-table="replies"]');
  const invitedTableEl = root.querySelector('[data-guestlist-table="invited"]');
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
  const groupsEl = document.createElement("div");
  groupsEl.className = "guestlist__groups";
  groupsEl.hidden = true;
  const groupsNote = document.createElement("p");
  groupsNote.className = "guestlist__groups-note";
  groupsNote.textContent =
    "Select people who belong together, then save the group. When any of those names is typed on the RSVP, the others are suggested.";
  const groupsBar = document.createElement("div");
  groupsBar.className = "guestlist__groups-bar";
  const selectPageEl = document.createElement("button");
  selectPageEl.type = "button";
  selectPageEl.textContent = "Select page";
  const saveGroupEl = document.createElement("button");
  saveGroupEl.type = "button";
  saveGroupEl.textContent = "Save group";
  saveGroupEl.disabled = true;
  const groupsStatusEl = document.createElement("p");
  groupsStatusEl.className = "guestlist__groups-status";
  groupsStatusEl.setAttribute("role", "status");
  const groupsListEl = document.createElement("ul");
  groupsListEl.className = "guestlist__groups-list";
  groupsBar.append(selectPageEl, saveGroupEl, groupsStatusEl);
  groupsEl.append(groupsNote, groupsBar, groupsListEl);
  const toolsEl = root.querySelector(".guestlist__tools");
  if (toolsEl && toolsEl.parentNode) toolsEl.parentNode.insertBefore(groupsEl, toolsEl.nextSibling);

  let rows = [];
  let invitedNames = [];
  let invitedReady = false;
  let invitedError = "";
  let view = "replies";
  let invitedTotal = null;
  let query = "";
  let statusFilter = "all";
  let sortKey = "submittedAt";
  let sortDir = "desc";
  let pageSize = 15;
  let page = 0;
  const GROUPS_KEY = "cz-guest-groups";
  const picked = new Set();
  let groups = [];
  let groupsStatus = "";

  function guestKey(name) {
    return String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function replyByName() {
    const map = new Map();
    rows.forEach((row) => {
      const key = guestKey(row.guestName);
      if (key && !map.has(key)) map.set(key, row);
    });
    return map;
  }

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

  function publishGuests() {
    document.dispatchEvent(
      new CustomEvent("cz-guestlist-rows", {
        detail: { rows: rows.slice(), invitedCount: invitedTotal },
      })
    );
  }

  function invitedRows() {
    const replies = replyByName();
    const needle = query.trim().toLowerCase();
    const list = invitedNames.map((name) => {
      const reply = replies.get(guestKey(name));
      return {
        guestName: name,
        rsvp: reply ? "Registered" : "Not yet",
      };
    });
    const byStatus =
      statusFilter === "registered"
        ? list.filter((row) => row.rsvp === "Registered")
        : statusFilter === "pending"
          ? list.filter((row) => row.rsvp !== "Registered")
          : list;
    const matched = needle
      ? byStatus.filter(
          (row) =>
            row.guestName.toLowerCase().indexOf(needle) !== -1 ||
            row.rsvp.toLowerCase().indexOf(needle) !== -1
        )
      : byStatus;
    const key = sortKey === "rsvp" ? "rsvp" : "guestName";
    matched.sort((a, b) => {
      const left = String(a[key] || "").toLowerCase();
      const right = String(b[key] || "").toLowerCase();
      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return a.guestName.toLowerCase() < b.guestName.toLowerCase() ? -1 : a.guestName.toLowerCase() > b.guestName.toLowerCase() ? 1 : 0;
    });
    return matched;
  }

  function syncView() {
    root.querySelectorAll("[data-guestlist-view]").forEach((button) => {
      const selected = button.getAttribute("data-guestlist-view") === view;
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    if (repliesTableEl) repliesTableEl.hidden = view !== "replies";
    if (invitedTableEl) invitedTableEl.hidden = view !== "invited";
    if (searchEl) {
      searchEl.placeholder = view === "invited" ? "Name" : "Name, email, mobile, hashtag…";
    }
    root.querySelectorAll("[data-guestlist-stat]").forEach((button) => {
      const selected = view === "invited" && button.getAttribute("data-guestlist-stat") === statusFilter;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    if (groupsEl) groupsEl.hidden = !(view === "invited" && statusFilter === "pending");
  }

  function renderInvited() {
    if (!invitedBodyEl) return;
    syncView();
    const list = invitedReady ? invitedRows() : [];
    const pages = Math.max(1, Math.ceil(list.length / pageSize) || 1);
    if (page > pages - 1) page = pages - 1;
    if (page < 0) page = 0;
    const start = list.length ? page * pageSize : 0;
    const visible = list.slice(start, start + pageSize);
    invitedBodyEl.replaceChildren();

    if (!invitedReady) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.className = "guestlist__empty";
      td.textContent = invitedError || "Loading the invited list…";
      tr.appendChild(td);
      invitedBodyEl.appendChild(tr);
    } else if (!invitedNames.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.className = "guestlist__empty";
      td.textContent = "No invited guests yet.";
      tr.appendChild(td);
      invitedBodyEl.appendChild(tr);
    } else if (!list.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2;
      td.className = "guestlist__empty";
      td.textContent = query.trim()
        ? "No guests match that search."
        : "No guests match that filter.";
      tr.appendChild(td);
      invitedBodyEl.appendChild(tr);
    } else {
      visible.forEach((row) => {
        const tr = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.setAttribute("data-col", "guestName");
        const key = guestKey(row.guestName);
        if (statusFilter === "pending") {
          const pick = document.createElement("label");
          pick.className = "guestlist__pick";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.checked = picked.has(key);
          box.setAttribute("aria-label", "Select " + row.guestName);
          box.addEventListener("change", () => {
            if (box.checked) picked.add(key);
            else picked.delete(key);
            renderGroups();
          });
          const text = document.createElement("span");
          text.textContent = row.guestName;
          pick.append(box, text);
          nameCell.appendChild(pick);
          if (groupOf(key)) {
            const tag = document.createElement("span");
            tag.className = "guestlist__group-tag";
            tag.textContent = "Grouped";
            nameCell.appendChild(tag);
          }
        } else {
          nameCell.textContent = row.guestName;
        }
        const statusCell = document.createElement("td");
        statusCell.setAttribute("data-col", "rsvp");
        const badge = document.createElement("span");
        badge.className = "guestlist__rsvp " + (row.rsvp === "Registered" ? "guestlist__rsvp--yes" : "guestlist__rsvp--no");
        badge.textContent = row.rsvp;
        statusCell.appendChild(badge);
        tr.appendChild(nameCell);
        tr.appendChild(statusCell);
        invitedBodyEl.appendChild(tr);
      });
    }

    const total = invitedReady ? list.length : 0;
    const from = total ? start + 1 : 0;
    const to = total ? start + visible.length : 0;
    countEl.textContent = !invitedReady
      ? "Loading invited guests…"
      : invitedNames.length === 1
        ? "1 invited guest"
        : invitedNames.length + " invited guests";
    if (rangeEl) {
      rangeEl.textContent = !invitedReady
        ? "Showing 0 of 0"
        : query.trim() || statusFilter !== "all"
          ? "Showing " + from + " to " + to + " of " + total + " matches"
          : "Showing " + from + " to " + to + " of " + total;
    }
    if (prevEl) prevEl.disabled = page <= 0 || !total;
    if (nextEl) nextEl.disabled = page >= pages - 1 || !total;
    renderProgress();
    publishGuests();
    renderGroups();
  }

  function render() {
    if (view === "invited") {
      renderInvited();
      return;
    }
    syncView();
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
    renderProgress();
    publishGuests();
  }

  function rememberInvited(result) {
    if (result && Object.prototype.hasOwnProperty.call(result, "invitedCount") && result.invitedCount != null && result.invitedCount !== "") {
      const fromApi = Number(result.invitedCount);
      if (Number.isFinite(fromApi) && fromApi >= 0) {
        invitedTotal = fromApi;
        return;
      }
    }
    const fallback = Number(config.invitedCount);
    if (Number.isFinite(fallback) && fallback >= 0) invitedTotal = fallback;
  }

  function renderProgress() {
    if (!progressEl) return;
    const registered = rows.length;
    const known = typeof invitedTotal === "number";
    const invited = known ? invitedTotal : 0;
    const pending = known ? Math.max(0, invited - registered) : 0;
    const pct = known && invited > 0 ? Math.min(100, (registered / invited) * 100) : 0;
    if (invitedEl) invitedEl.textContent = known ? String(invited) : "—";
    if (registeredEl) registeredEl.textContent = String(registered);
    if (pendingEl) pendingEl.textContent = known ? String(pending) : "—";
    if (fillEl) fillEl.style.width = pct + "%";
    if (trackEl) {
      trackEl.setAttribute("aria-valuemax", String(known ? invited : 0));
      trackEl.setAttribute("aria-valuenow", String(known ? Math.min(registered, invited) : 0));
      trackEl.setAttribute(
        "aria-valuetext",
        known ? registered + " of " + invited + " registered" : registered + " registered"
      );
    }
    progressEl.hidden = false;
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
      if (view === "invited" && key !== "guestName" && key !== "rsvp") return;
      if (view === "replies" && key === "rsvp") return;
      if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = key === "submittedAt" ? "desc" : "asc";
      }
      render();
    });
  });

  root.querySelectorAll("[data-guestlist-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-guestlist-view");
      if (next !== "replies" && next !== "invited") return;
      if (view === next) return;
      view = next;
      page = 0;
      if (view === "invited") {
        sortKey = "guestName";
        sortDir = "asc";
      } else if (sortKey === "rsvp") {
        sortKey = "submittedAt";
        sortDir = "desc";
      }
      render();
    });
  });

  root.querySelectorAll("[data-guestlist-stat]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-guestlist-stat");
      statusFilter = next === "registered" || next === "pending" ? next : "all";
      view = "invited";
      page = 0;
      if (sortKey !== "guestName" && sortKey !== "rsvp") {
        sortKey = "guestName";
        sortDir = "asc";
      }
      render();
    });
  });

  if (searchEl) {
    let seen = searchEl.value || "";
    let watch = 0;
    const applySearch = () => {
      const next = searchEl.value || "";
      if (next === seen) return;
      seen = next;
      query = next;
      page = 0;
      render();
    };
    ["input", "keyup", "change", "search", "compositionend"].forEach((type) => {
      searchEl.addEventListener(type, applySearch);
    });
    searchEl.addEventListener("focus", () => {
      if (watch) return;
      watch = window.setInterval(applySearch, 120);
    });
    searchEl.addEventListener("blur", () => {
      window.clearInterval(watch);
      watch = 0;
      window.setTimeout(applySearch, 80);
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
  let invitedKey = "";
  let pollTimer = 0;
  let refreshTimer = 0;
  let lastCheck = 0;
  let refreshing = false;

  if (!url) {
    countEl.textContent = "Guestlist is not configured.";
    return;
  }

  function readStoredGroups() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function normalizeGroups(source) {
    const seen = new Set();
    const next = [];
    (Array.isArray(source) ? source : []).forEach((group) => {
      const names = [];
      ((group && group.names) || []).forEach((name) => {
        const text = String(name || "").trim().replace(/\s+/g, " ");
        const key = guestKey(text);
        if (!key || seen.has(key)) return;
        seen.add(key);
        names.push(text);
      });
      if (names.length < 2) return;
      const id = String((group && group.id) || "").replace(/[^\w-]/g, "").slice(0, 40) || "g" + (next.length + 1);
      next.push({ id: id, names: names });
    });
    return next.slice(0, 80);
  }

  groups = normalizeGroups(readStoredGroups());

  function writeGroupsLocal() {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
    } catch (e) {}
  }

  function groupOf(key) {
    return groups.find((group) => group.names.some((name) => guestKey(name) === key)) || null;
  }

  function renderGroups() {
    saveGroupEl.disabled = picked.size < 2;
    groupsStatusEl.textContent = groupsStatus;
    groupsListEl.replaceChildren();
    groups.forEach((group) => {
      const item = document.createElement("li");
      const names = document.createElement("span");
      names.textContent = group.names.join(", ");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Ungroup";
      remove.addEventListener("click", () => {
        groups = groups.filter((entry) => entry.id !== group.id);
        writeGroupsLocal();
        pushGroups();
        render();
      });
      item.append(names, remove);
      groupsListEl.appendChild(item);
    });
  }

  function postGroups(action, groupList) {
    const body = { action: action };
    if (groupList) body.groups = groupList;
    return fetch(url, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    })
      .then(async (response) => {
        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = {};
        }
        if (!response.ok || !data || data.ok === false || !Array.isArray(data.groups)) return null;
        return data;
      })
      .catch(() => null);
  }

  let pushingGroups = false;

  function pushGroups() {
    writeGroupsLocal();
    groupsStatus = "Saving group…";
    renderGroups();
    pushingGroups = true;
    return postGroups("groupssave", groups)
      .then((data) => {
        if (data && Array.isArray(data.groups)) {
          groups = normalizeGroups(data.groups);
          writeGroupsLocal();
          groupsStatus = groups.length
            ? "Saved. Typing any name in a group on the RSVP suggests the others."
            : "Saved.";
        } else {
          groupsStatus =
            "Saved on this browser. Deploy the latest Apps Script so the RSVP form can suggest these names.";
        }
        renderGroups();
      })
      .finally(() => {
        pushingGroups = false;
      });
  }

  function pullGroups() {
    return postGroups("groupsload").then((data) => {
      if (!data || pushingGroups) return;
      const remote = normalizeGroups(data.groups);
      if (!remote.length && groups.length) {
        pushGroups();
        return;
      }
      groups = remote;
      writeGroupsLocal();
      if (view === "invited") render();
      else renderGroups();
    });
  }

  selectPageEl.addEventListener("click", () => {
    const list = invitedRows();
    const pages = Math.max(1, Math.ceil(list.length / pageSize) || 1);
    const safe = Math.min(Math.max(page, 0), pages - 1);
    const keys = list.slice(safe * pageSize, safe * pageSize + pageSize).map((row) => guestKey(row.guestName));
    const allOn = keys.length > 0 && keys.every((key) => picked.has(key));
    keys.forEach((key) => {
      if (allOn) picked.delete(key);
      else picked.add(key);
    });
    render();
  });

  saveGroupEl.addEventListener("click", () => {
    const names = [];
    picked.forEach((key) => {
      const official = invitedNames.find((name) => guestKey(name) === key);
      if (official) names.push(official);
    });
    if (names.length < 2) return;
    const chosen = new Set(names.map((name) => guestKey(name)));
    groups = groups
      .map((group) => ({
        id: group.id,
        names: group.names.filter((name) => !chosen.has(guestKey(name))),
      }))
      .filter((group) => group.names.length >= 2);
    groups.push({ id: "g" + Date.now().toString(36), names: names });
    groups = normalizeGroups(groups);
    picked.clear();
    pushGroups();
    render();
  });

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
        return {
          ok: true,
          rows: data.rows,
          invitedCount: Object.prototype.hasOwnProperty.call(data, "invitedCount") ? data.invitedCount : undefined,
        };
      })
      .catch(() => ({ ok: false, error: "" }));
  }

  function requestInvited() {
    return fetch(url, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "invited" }),
    })
      .then(async (response) => {
        const text = await response.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = {};
        }
        if (!response.ok || !data || data.ok === false || !Array.isArray(data.names)) {
          return { ok: false, error: data && data.error ? data.error : "" };
        }
        return { ok: true, names: data.names };
      })
      .catch(() => ({ ok: false, error: "" }));
  }

  function rememberInvitedNames(result) {
    if (!result || !result.ok) {
      invitedReady = false;
      invitedError = "Could not load the invited list.";
      return;
    }
    invitedNames = result.names
      .map((name) => String(name || "").trim())
      .filter(Boolean);
    invitedReady = true;
    invitedError = "";
    invitedTotal = invitedNames.length;
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
    Promise.all([requestList(), requestInvited()]).then((results) => {
      const result = results[0];
      const invitedResult = results[1];
      if (!result.ok) {
        if (invitedResult.ok) rememberInvitedNames(invitedResult);
        schedulePoll();
        return;
      }
      const nextKey = rosterKey(result.rows);
      const nextInvitedKey = invitedResult.ok ? invitedResult.names.join("\u001e") : "";
      const invitedChanged = invitedResult.ok && nextInvitedKey !== invitedKey;
      if ((!shownKey || nextKey === shownKey) && !invitedChanged) {
        schedulePoll();
        return;
      }
      refreshing = true;
      setTableLoading(view === "replies" || view === "invited");
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        rows = result.rows;
        rememberInvited(result);
        if (invitedResult.ok) rememberInvitedNames(invitedResult);
        shownKey = nextKey;
        if (invitedResult.ok) invitedKey = nextInvitedKey;
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

  pullGroups();
  Promise.all([requestList(), requestInvited()]).then((results) => {
    const result = results[0];
    const invitedResult = results[1];
    rememberInvitedNames(invitedResult);
    if (invitedResult.ok) invitedKey = invitedResult.names.join("\u001e");
    if (!result.ok) {
      showLoadError(result.error);
      if (view === "invited") render();
      return;
    }
    rows = result.rows;
    rememberInvited(result);
    if (invitedResult.ok) invitedTotal = invitedNames.length;
    shownKey = rosterKey(rows);
    setStatus("");
    render();
    schedulePoll();
  });
})();
