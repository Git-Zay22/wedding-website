(function () {
  const STORAGE_KEY = "cz-seating-plan";
  const root = document.querySelector("[data-seating]");
  if (!root) return;

  let seatingUnlocked = false;
  try {
    seatingUnlocked = sessionStorage.getItem("cz-owners-unlock") === "all";
  } catch (e) {
    seatingUnlocked = false;
  }
  if (!seatingUnlocked) return;

  const listEl = root.querySelector("[data-seating-list]");
  const kindsEl = root.querySelector("[data-seating-kinds]");
  const addBtn = root.querySelector("[data-seating-add]");
  const pickerEl = root.querySelector("[data-seating-picker]");
  const confirmEl = root.querySelector("[data-seating-confirm]");
  const searchEl = root.querySelector("[data-seating-search]");
  const optionsEl = root.querySelector("[data-seating-options]");
  const selectedEl = root.querySelector("[data-seating-selected]");
  const saveBtn = root.querySelector("[data-seating-save]");
  const confirmYes = root.querySelector("[data-seating-confirm-yes]");
  const confirmNo = root.querySelector("[data-seating-confirm-no]");
  const confirmTitle = root.querySelector("[data-seating-confirm-title]");
  const confirmCopy = root.querySelector("[data-seating-confirm-copy]");
  const confirmNames = root.querySelector("[data-seating-confirm-names]");
  const pickerTitle = root.querySelector("[data-seating-picker-title]");
  const pickerMeta = root.querySelector("[data-seating-picker-meta]");
  const pickerStatus = root.querySelector("[data-seating-picker-status]");

  let guests = [];
  let invitedState = "loading";
  let plan = loadPlan();
  let pickerTableId = "";
  let pickerQuery = "";
  let selectedOrder = [];
  let confirmMode = "";

  function capacity(kind) {
    if (kind === "long") return 20;
    if (kind === "couple") return 2;
    return 9;
  }

  function tableLabel(table) {
    if (table.kind === "couple") return "Groom & Bride";
    return (table.kind === "long" ? "Long Table #" : "Table #") + table.number;
  }

  function guestKey(row) {
    return String(row.guestName || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function seatCovers(seatKey, key) {
    return seatKey === key || seatKey.indexOf(key + "\n") === 0;
  }

  function guestName(row) {
    const name = String(row.guestName || "")
      .trim()
      .replace(/\s+/g, " ");
    return name || "Guest";
  }

  let planVersion = 0;

  function cleanSeats(table, kind) {
    const seats = (Array.isArray(table.seats) ? table.seats : []).slice(0, capacity(kind)).map((seat) => {
      if (!seat) return null;
      const key = String(seat.key || seat.name || "").trim();
      if (!key) return null;
      return { key: key, name: String(seat.name || seat.key || "Guest") };
    });
    while (seats.length < capacity(kind)) seats.push(null);
    return seats;
  }

  function normalizePlan(raw) {
    const source = raw && Array.isArray(raw.tables) ? raw.tables : [];
    const tables = [];
    const coupleSeats = [];
    source.forEach((table) => {
      if (!table) return;
      const kind = table.kind === "long" || table.kind === "normal" || table.kind === "couple" ? table.kind : "";
      if (!kind || !Array.isArray(table.seats)) return;
      const seats = cleanSeats(table, kind);
      if (kind === "couple") {
        seats.forEach((seat) => {
          if (coupleSeats.length < 2) coupleSeats.push(seat);
        });
        return;
      }
      const id = String(table.id || "");
      const number = Number(table.number) || 0;
      if (!id || number <= 0) return;
      tables.push({ id: id, kind: kind, number: number, seats: seats });
    });
    while (coupleSeats.length < 2) coupleSeats.push(null);
    tables.unshift({ id: "couple", kind: "couple", number: 1, seats: coupleSeats.slice(0, 2) });
    ["normal", "long"].forEach((kind) => {
      let number = 1;
      tables.forEach((table) => {
        if (table.kind === kind) table.number = number++;
      });
    });
    return { tables: tables };
  }

  function loadPlan() {
    try {
      return normalizePlan(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch (e) {
      return normalizePlan({ tables: [] });
    }
  }

  function writeLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
    } catch (e) {}
  }

  function postPlan(action, bodyPlan) {
    const config = window.RSVP_CONFIG || {};
    if (!config.scriptUrl || config.demoMode) return Promise.resolve(null);
    const body = { action: action };
    if (bodyPlan) body.plan = bodyPlan;
    return fetch(config.scriptUrl, {
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
        if (!response.ok || !data || data.ok === false) return null;
        return data;
      })
      .catch(() => null);
  }

  function pushPlan(version) {
    postPlan("seatingsave", plan).then((data) => {
      if (version !== planVersion || !data || !data.plan) return;
    });
  }

  function pullPlan() {
    const version = planVersion;
    postPlan("seatingload").then((data) => {
      if (version !== planVersion || !data || !data.plan || !Array.isArray(data.plan.tables)) return;
      if (!data.plan.tables.length) {
        if (plan.tables.length) pushPlan(planVersion);
        return;
      }
      plan = normalizePlan(data.plan);
      writeLocal();
      renderTables();
    });
  }

  function savePlan() {
    planVersion += 1;
    writeLocal();
    pushPlan(planVersion);
  }

  function assignedKeys() {
    const taken = new Set();
    plan.tables.forEach((table) => {
      table.seats.forEach((seat) => {
        if (seat && seat.key) taken.add(seat.key);
      });
    });
    return taken;
  }

  function nextNumber(kind) {
    let max = 0;
    plan.tables.forEach((table) => {
      if (table.kind === kind && table.number > max) max = table.number;
    });
    return max + 1;
  }

  function renumberKind(kind) {
    let number = 1;
    plan.tables.forEach((table) => {
      if (table.kind === kind) table.number = number++;
    });
  }

  function openCount(table) {
    return table.seats.filter((seat) => !seat || !seat.key).length;
  }

  function findTable(id) {
    return plan.tables.find((table) => table.id === id) || null;
  }

  function guestRecords() {
    const seen = new Set();
    const list = [];
    guests.forEach((row) => {
      const key = guestKey(row);
      if (!String(row.guestName || "").trim() || seen.has(key)) return;
      seen.add(key);
      list.push({ key: key, name: guestName(row) });
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  const addSlot = root.querySelector("[data-seating-add-slot]");

  function renderTables() {
    listEl.replaceChildren();
    if (!plan.tables.length) {
      const empty = document.createElement("p");
      empty.className = "seating__empty";
      empty.textContent = "No tables yet.";
      listEl.appendChild(empty);
      if (addSlot) listEl.appendChild(addSlot);
      renderCounts();
      return;
    }

    plan.tables.forEach((table) => {
      const card = document.createElement("article");
      card.className = "seating-card" + (table.kind === "long" ? " seating-card--long" : "") + (table.kind === "couple" ? " seating-card--couple" : "");

      const head = document.createElement("div");
      head.className = "seating-card__head";
      const title = document.createElement("h3");
      title.className = "seating-card__title";
      title.textContent = tableLabel(table);
      const actions = document.createElement("div");
      actions.className = "seating-card__actions";

      const addGuests = document.createElement("button");
      addGuests.type = "button";
      addGuests.className = "btn btn--primary seating-card__add";
      addGuests.textContent = "Add guests";
      addGuests.disabled = openCount(table) === 0;
      addGuests.addEventListener("click", () => openPicker(table.id));
      actions.appendChild(addGuests);

      if (table.kind !== "couple") {
        const removeTable = document.createElement("button");
        removeTable.type = "button";
        removeTable.className = "btn btn--ghost-ink seating-card__delete";
        removeTable.textContent = "Delete table";
        removeTable.addEventListener("click", () => openDelete(table.id));
        actions.appendChild(removeTable);
      }
      head.append(title, actions);

      const grid = document.createElement("table");
      grid.className = "seating-card__table";
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      ["Seat", "Guest"].forEach((text) => {
        const th = document.createElement("th");
        th.textContent = text;
        headRow.appendChild(th);
      });
      const actionTh = document.createElement("th");
      actionTh.className = "seating-card__action-col";
      actionTh.textContent = "Actions";
      headRow.appendChild(actionTh);
      thead.appendChild(headRow);

      const tbody = document.createElement("tbody");
      table.seats.forEach((seat, index) => {
        const tr = document.createElement("tr");
        const number = document.createElement("td");
        number.textContent = String(index + 1) + ".";
        const name = document.createElement("td");
        if (seat && seat.name) {
          name.textContent = seat.name;
        } else if (seat && seat.key) {
          name.textContent = "Guest";
        } else {
          name.textContent = "Empty";
          name.className = "is-empty";
        }
        const action = document.createElement("td");
        if (seat && seat.key) {
          const remove = document.createElement("button");
          remove.type = "button";
          remove.className = "seating-card__remove";
          remove.setAttribute("aria-label", "Remove");
          const label = document.createElement("span");
          label.className = "seating-card__remove-label";
          label.textContent = "Remove";
          const icon = document.createElement("span");
          icon.className = "seating-card__remove-icon";
          icon.setAttribute("aria-hidden", "true");
          icon.textContent = "\u2212";
          remove.append(label, icon);
          remove.addEventListener("click", () => {
            table.seats[index] = null;
            savePlan();
            renderTables();
          });
          action.appendChild(remove);
        }
        tr.append(number, name, action);
        tbody.appendChild(tr);
      });

      grid.append(thead, tbody);
      card.append(head, grid);
      listEl.appendChild(card);
    });
    if (addSlot) listEl.appendChild(addSlot);
    renderCounts();
  }

  function addTable(kind) {
    const type = kind === "long" ? "long" : "normal";
    plan.tables.push({
      id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: type,
      number: nextNumber(type),
      seats: Array.from({ length: capacity(type) }, () => null),
    });
    savePlan();
    kindsEl.hidden = true;
    renderTables();
    const cards = listEl.querySelectorAll(".seating-card");
    const card = cards[cards.length - 1];
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function optionRow(guest, checked, open) {
    const row = document.createElement("label");
    row.className = "seating-option" + (checked ? " is-selected" : "");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.disabled = !checked && selectedOrder.length >= open;
    input.addEventListener("change", () => {
      if (input.checked) {
        if (selectedOrder.length >= open || selectedOrder.indexOf(guest.key) !== -1) return;
        selectedOrder.push(guest.key);
      } else {
        selectedOrder = selectedOrder.filter((key) => key !== guest.key);
      }
      renderPicker();
    });
    const name = document.createElement("span");
    name.textContent = guest.name;
    row.append(input, name);
    return row;
  }

  function renderPicker() {
    const table = findTable(pickerTableId);
    if (!table || !optionsEl) return;
    const open = openCount(table);
    if (pickerTitle) pickerTitle.textContent = tableLabel(table);
    if (pickerMeta) pickerMeta.textContent = open + (open === 1 ? " seat open" : " seats open");

    const taken = [];
    plan.tables.forEach((table) => {
      table.seats.forEach((seat) => {
        if (seat && seat.key) taken.push(seat.key);
      });
    });
    const available = guestRecords().filter(
      (guest) => !taken.some((seatKey) => seatCovers(seatKey, guest.key))
    );
    const selectedSet = new Set(selectedOrder);
    const needle = pickerQuery.trim().toLowerCase();
    const selectedGuests = selectedOrder
      .map((key) => available.find((guest) => guest.key === key))
      .filter(Boolean);
    const shown = available.filter(
      (guest) => !needle || guest.name.toLowerCase().indexOf(needle) !== -1
    );
    const listScroll = optionsEl.scrollTop;

    optionsEl.replaceChildren();
    if (selectedEl) {
      selectedEl.replaceChildren();
      selectedEl.hidden = selectedGuests.length === 0;
      if (selectedGuests.length) {
        const selectedLabel = document.createElement("p");
        selectedLabel.className = "seating-dialog__group";
        selectedLabel.textContent = "Selected";
        selectedEl.appendChild(selectedLabel);
        selectedGuests.forEach((guest) => selectedEl.appendChild(optionRow(guest, true, open)));
      }
    }
    if (!guests.length) {
      const empty = document.createElement("p");
      empty.className = "seating-dialog__empty";
      empty.textContent =
        invitedState === "loading"
          ? "The guest list is still loading."
          : "The full guest list is not available yet. Deploy the latest Apps Script, then reload.";
      optionsEl.appendChild(empty);
    } else if (!available.length && !selectedGuests.length) {
      const empty = document.createElement("p");
      empty.className = "seating-dialog__empty";
      empty.textContent = "Every guest on the list is already seated.";
      optionsEl.appendChild(empty);
    } else {
      const listLabel = document.createElement("p");
      listLabel.className = "seating-dialog__group";
      listLabel.textContent = "Guestlist";
      optionsEl.appendChild(listLabel);
      if (!shown.length) {
        const empty = document.createElement("p");
        empty.className = "seating-dialog__empty";
        empty.textContent = needle ? "No guests match that search." : "No guests left to add.";
        optionsEl.appendChild(empty);
      } else {
        shown.forEach((guest) => optionsEl.appendChild(optionRow(guest, selectedSet.has(guest.key), open)));
      }
    }
    optionsEl.scrollTop = listScroll;
    requestAnimationFrame(() => {
      optionsEl.scrollTop = listScroll;
    });

    if (pickerStatus) {
      pickerStatus.textContent = selectedOrder.length ? selectedOrder.length + " selected" : "";
    }
    if (saveBtn) saveBtn.disabled = selectedOrder.length === 0;
  }

  function openPicker(tableId) {
    const table = findTable(tableId);
    if (!table || openCount(table) === 0) return;
    pickerTableId = tableId;
    pickerQuery = "";
    selectedOrder = [];
    if (searchEl) searchEl.value = "";
    searchSeen = "";
    renderPicker();
    if (pickerEl.showModal) pickerEl.showModal();
    const touchUi = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (searchEl && !touchUi) searchEl.focus();
  }

  function fillConfirm(title, copy, names, yesLabel) {
    if (confirmTitle) confirmTitle.textContent = title;
    if (confirmCopy) confirmCopy.textContent = copy;
    if (confirmYes) confirmYes.textContent = yesLabel;
    if (confirmNames) {
      confirmNames.replaceChildren();
      names.forEach((name) => {
        const item = document.createElement("li");
        item.textContent = name;
        confirmNames.appendChild(item);
      });
    }
    if (confirmEl.showModal) confirmEl.showModal();
  }

  function openSaveConfirm() {
    const table = findTable(pickerTableId);
    if (!table || !selectedOrder.length) return;
    const byKey = new Map(guestRecords().map((guest) => [guest.key, guest.name]));
    const names = selectedOrder.map((key) => byKey.get(key)).filter(Boolean);
    confirmMode = "save";
    fillConfirm("Save seating", "Seat these guests at " + tableLabel(table) + "?", names, "Confirm");
  }

  function openDelete(tableId) {
    const table = findTable(tableId);
    if (!table || table.kind === "couple") return;
    pickerTableId = tableId;
    confirmMode = "delete";
    fillConfirm("Delete table", "Remove " + tableLabel(table) + " and return its guests to the list?", [], "Delete");
  }

  function applyConfirm() {
    const table = findTable(pickerTableId);
    if (confirmMode === "delete" && table) {
      plan.tables = plan.tables.filter((item) => item.id !== table.id);
      renumberKind(table.kind);
      savePlan();
      renderTables();
      pickerTableId = "";
    } else if (confirmMode === "save" && table) {
      const byKey = new Map(guestRecords().map((guest) => [guest.key, guest.name]));
      selectedOrder.forEach((key) => {
        const index = table.seats.findIndex((seat) => !seat || !seat.key);
        if (index === -1) return;
        table.seats[index] = { key: key, name: byKey.get(key) || "Guest" };
      });
      savePlan();
      renderTables();
      if (pickerEl.open) pickerEl.close();
      pickerTableId = "";
      selectedOrder = [];
    }
    confirmMode = "";
    if (confirmEl.open) confirmEl.close();
  }

  const panels = document.querySelectorAll("[data-planner-panel]");
  const tabs = document.querySelectorAll("[data-planner-tab]");

  function showTab(name) {
    tabs.forEach((tab) => {
      const on = tab.getAttribute("data-planner-tab") === name;
      tab.classList.toggle("is-active", on);
      if (on) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    panels.forEach((panel) => {
      panel.hidden = panel.getAttribute("data-planner-panel") !== name;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", (event) => {
      event.preventDefault();
      const name = tab.getAttribute("data-planner-tab") === "seating" ? "seating" : "guestlist";
      const hash = name === "seating" ? "#seating" : "#guestlist";
      if (location.hash !== hash) {
        history.replaceState(null, "", location.pathname + location.search + hash);
      }
      showTab(name);
      const panel = document.querySelector('[data-planner-panel="' + name + '"]');
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  window.addEventListener("hashchange", () => {
    const hash = location.hash;
    if (hash === "#seating" || hash === "#guestlist" || hash === "#planner") {
      showTab(hash === "#seating" ? "seating" : "guestlist");
    }
  });

  showTab(location.hash === "#seating" ? "seating" : "guestlist");

  addBtn.addEventListener("click", () => {
    kindsEl.hidden = !kindsEl.hidden;
  });

  root.querySelectorAll("[data-seating-kind]").forEach((button) => {
    button.addEventListener("click", () => addTable(button.getAttribute("data-seating-kind")));
  });

  let searchSeen = "";
  if (searchEl) {
    let watch = 0;
    const applySearch = () => {
      const next = searchEl.value || "";
      if (next === searchSeen) return;
      searchSeen = next;
      pickerQuery = next;
      renderPicker();
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
  if (saveBtn) saveBtn.addEventListener("click", openSaveConfirm);
  root.querySelector("[data-seating-picker-cancel]").addEventListener("click", () => {
    if (pickerEl.open) pickerEl.close();
  });
  if (confirmYes) confirmYes.addEventListener("click", applyConfirm);
  if (confirmNo) {
    confirmNo.addEventListener("click", () => {
      if (confirmMode === "delete") pickerTableId = "";
      confirmMode = "";
      if (confirmEl.open) confirmEl.close();
    });
  }

  function loadInvited() {
    const config = window.RSVP_CONFIG || {};
    if (!config.scriptUrl || config.demoMode) {
      invitedState = "unavailable";
      return;
    }
    fetch(config.scriptUrl, {
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
          invitedState = "unavailable";
          guests = [];
          return;
        }
        invitedState = "ready";
        guests = data.names.map((name) => ({ guestName: name }));
      })
      .catch(() => {
        invitedState = "unavailable";
        guests = [];
      })
      .then(() => {
        if (pickerEl.open) renderPicker();
      });
  }

  const totalEl = root.querySelector("[data-seating-total]");
  const registeredEl = root.querySelector("[data-seating-registered]");
  const unregisteredEl = root.querySelector("[data-seating-unregistered]");
  const seatedEl = root.querySelector("[data-seating-seated]");
  const unseatedEl = root.querySelector("[data-seating-unseated]");
  const seatsEl = root.querySelector("[data-seating-seats]");
  const normalEl = root.querySelector("[data-seating-normal]");
  const longEl = root.querySelector("[data-seating-long]");
  let guestDetail = null;

  function renderCounts(detail) {
    if (detail) guestDetail = detail;
    const source = guestDetail;
    const registered = source && Array.isArray(source.rows) ? source.rows.length : null;
    const invitedRaw = source && source.invitedCount != null && source.invitedCount !== "" ? Number(source.invitedCount) : NaN;
    const invited = Number.isFinite(invitedRaw) && invitedRaw >= 0 ? invitedRaw : null;
    let seated = 0;
    let maxSeats = 0;
    let normalCount = 0;
    let longCount = 0;
    plan.tables.forEach((table) => {
      maxSeats += table.seats.length;
      if (table.kind === "normal") normalCount += 1;
      if (table.kind === "long") longCount += 1;
      table.seats.forEach((seat) => {
        if (seat && seat.key) seated += 1;
      });
    });
    if (totalEl) totalEl.textContent = invited == null ? "—" : String(invited);
    if (registeredEl) registeredEl.textContent = registered == null ? "—" : String(registered);
    if (unregisteredEl) {
      unregisteredEl.textContent =
        invited == null || registered == null ? "—" : String(Math.max(0, invited - registered));
    }
    if (seatedEl) seatedEl.textContent = String(seated);
    if (unseatedEl) unseatedEl.textContent = invited == null ? "—" : String(Math.max(0, invited - seated));
    if (seatsEl) seatsEl.textContent = String(maxSeats);
    if (normalEl) normalEl.textContent = String(normalCount);
    if (longEl) longEl.textContent = String(longCount);
  }

  document.addEventListener("cz-guestlist-rows", (event) => {
    renderCounts(event.detail || {});
  });

  loadInvited();
  renderTables();
  pullPlan();
})();
