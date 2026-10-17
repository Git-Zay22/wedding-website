/**
 * Wedding RSVP → Google Sheets
 *
 * After editing this file in Apps Script:
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy
 *
 * Tab name: RSVPs
 * Headers:
 * Timestamp | Name | Email | Phone | Attendance | Events | Commute | Allergies | Message | Source | Hashtag
 * Older sheets may also have Guests after Events. Hashtag is added as a new
 * last column, so existing cells stay in place.
 *
 * GET actions:
 * - health (no action)
 *
 * POST actions:
 * - create / update / lookup / list / invited / suggest / seatingload / seatingsave
 * list returns every saved RSVP and is for the owners page only.
 * suggest returns a few invited names that closely match what was typed.
 * seatingload / seatingsave keep the planner tables for the owners page.
 *
 * SECURITY: Keep SPREADSHEET_ID, GUEST_LIST, and RSVP_TOKEN only in Apps Script
 * (and RSVP_TOKEN also in Cloudflare Worker secrets). Do not commit real values to GitHub.
 * Local backups (gitignored): secrets.local.gs / Code.paste.local.gs
 * When updating Apps Script, copy logic from this file but keep your private
 * SPREADSHEET_ID + GUEST_LIST + RSVP_TOKEN already in the editor.
 */

const SHEET_NAME = "RSVPs";
const SPREADSHEET_NAME = "Caren & Zayrol RSVPs";
const PROP_SPREADSHEET_ID = "RSVP_SPREADSHEET_ID";
const HEADERS = [
  "Timestamp",
  "Name",
  "Email",
  "Phone",
  "Attendance",
  "Events",
  "Commute",
  "Allergies",
  "Message",
  "Source",
  "Hashtag",
];

/**
 * Shared secret — set ONLY in the Apps Script editor.
 * Must match the Cloudflare Worker secret RSVP_TOKEN.
 * Leave empty in the public GitHub template.
 */
const RSVP_TOKEN = "";

/**
 * Paste your Google Sheet ID in the Apps Script editor only (not in GitHub).
 * From: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 * Leave empty in the public repo template.
 */
const SPREADSHEET_ID = "";

/**
 * Invited names allowlist — maintain only in Apps Script (case-insensitive full-name match).
 * "RESERVED" placeholders should be excluded. Leave empty in the public repo template.
 */
const GUEST_LIST = [
  // "FULL NAME HERE",
];

var GUEST_LIST_MAP_ = null;

function getGuestListMap_() {
  if (GUEST_LIST_MAP_) return GUEST_LIST_MAP_;
  GUEST_LIST_MAP_ = {};
  for (var i = 0; i < GUEST_LIST.length; i++) {
    var official = String(GUEST_LIST[i] || "").trim();
    var key = normalizeName_(official);
    if (!key || key === "reserved") continue;
    GUEST_LIST_MAP_[key] = official;
  }
  return GUEST_LIST_MAP_;
}

function resolveInvitedGuestName_(guestName) {
  var key = normalizeName_(guestName);
  if (!key) return null;
  return getGuestListMap_()[key] || null;
}

function foldName_(value) {
  return normalizeName_(value).replace(/ñ/g, "n");
}

function suggestWords_(value) {
  var folded = foldName_(value);
  return folded ? folded.split(" ") : [];
}

function suggestMatches_(official, queryWords) {
  var words = suggestWords_(official);
  if (!words.length || !queryWords.length) return false;
  var start = 0;
  for (var q = 0; q < queryWords.length; q++) {
    var found = false;
    for (var w = start; w < words.length; w++) {
      if (words[w].indexOf(queryWords[q]) === 0) {
        start = w + 1;
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

function suggestLastName_(official) {
  var words = String(official || "").trim().split(/\s+/);
  var suffixes = { jr: true, sr: true, ii: true, iii: true, iv: true };
  var end = words.length;
  while (end > 1 && suffixes[String(words[end - 1] || "").toLowerCase().replace(/\./g, "")]) {
    end--;
  }
  return String(words[Math.max(end - 1, 0)] || "").toLowerCase();
}

function suggestRank_(official, queryWords) {
  var folded = suggestWords_(official).join(" ");
  var query = queryWords.join(" ");
  if (folded === query) return 0;
  if (folded.indexOf(query) === 0) return 1;
  var words = folded.split(" ");
  if (words[0].indexOf(queryWords[0]) === 0) return 2;
  return 3;
}

function listInvitedNames_() {
  var seen = {};
  var names = [];
  for (var i = 0; i < GUEST_LIST.length; i++) {
    var official = String(GUEST_LIST[i] || "").trim();
    var key = normalizeName_(official);
    if (!key || key === "reserved" || seen[key]) continue;
    seen[key] = true;
    names.push(official);
  }
  names.sort(function (a, b) {
    return String(a).localeCompare(String(b));
  });
  return json_({ ok: true, names: names });
}

function suggestInvitedNames_(data) {
  var queryWords = suggestWords_(data && data.guestName);
  if (!queryWords.length || queryWords.join(" ").length > 80) {
    return json_({ ok: true, names: [] });
  }
  var seen = {};
  var names = [];
  for (var i = 0; i < GUEST_LIST.length; i++) {
    var official = String(GUEST_LIST[i] || "").trim();
    var key = normalizeName_(official);
    if (!key || key === "reserved" || seen[key]) continue;
    if (!suggestMatches_(official, queryWords)) continue;
    seen[key] = true;
    names.push(official);
  }
  names.sort(function (a, b) {
    var rank = suggestRank_(a, queryWords) - suggestRank_(b, queryWords);
    if (rank) return rank;
    var last = suggestLastName_(a).localeCompare(suggestLastName_(b));
    if (last) return last;
    return String(a).localeCompare(String(b));
  });
  if (names.length > 6) names = names.slice(0, 6);
  return json_({ ok: true, names: names });
}

function assertRsvpToken_(data) {
  var expected = String(RSVP_TOKEN || "").trim();
  if (!expected) return null;
  var got = String((data && data.token) || "").trim();
  if (!got || got !== expected) {
    return json_({
      ok: false,
      error: "Your RSVP couldn't be saved. Please try again.",
    });
  }
  return null;
}

var RATE_LIMIT_WINDOW_SEC = 60;
var RATE_LIMIT_MAX = 10;

function rateLimitKey_(action, data) {
  var name = normalizeName_((data && data.guestName) || "");
  var phone = normalizePhone_((data && data.phone) || "");
  var email = String((data && data.email) || "")
    .trim()
    .toLowerCase();
  return "rl:" + action + ":" + (name || "anon") + ":" + (phone || email || "x");
}

function assertRateLimit_(action, data) {
  var cache = CacheService.getScriptCache();
  var key = rateLimitKey_(action, data);
  var count = Number(cache.get(key) || "0");
  if (count >= RATE_LIMIT_MAX) {
    return json_({
      ok: false,
      error: "Too many requests. Please wait a minute and try again.",
    });
  }
  cache.put(key, String(count + 1), RATE_LIMIT_WINDOW_SEC);
  return null;
}

function seatingSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName("Seating");
  if (!sheet) {
    sheet = ss.insertSheet("Seating");
    sheet.getRange(1, 1).setValue("Plan");
  }
  return sheet;
}

function sanitizeSeatingPlan_(plan) {
  var tables = [];
  var source = plan && plan.tables;
  if (!source || !source.length) return { tables: [] };
  var limit = Math.min(source.length, 40);
  for (var i = 0; i < limit; i++) {
    var table = source[i];
    if (!table) continue;
    var kind =
      table.kind === "long" ? "long" : table.kind === "normal" ? "normal" : table.kind === "couple" ? "couple" : "";
    if (!kind) continue;
    var id = String(table.id || "")
      .replace(/[^\w-]/g, "")
      .slice(0, 40);
    var number = Number(table.number) || 0;
    if (!id || number < 1 || number > 200) continue;
    var cap = kind === "long" ? 20 : kind === "couple" ? 2 : 9;
    var seatsIn = table.seats || [];
    var seats = [];
    for (var s = 0; s < cap; s++) {
      var seat = seatsIn[s];
      if (!seat) {
        seats.push(null);
        continue;
      }
      var key = String(seat.key || seat.name || "")
        .trim()
        .slice(0, 160);
      var name = String(seat.name || seat.key || "")
        .trim()
        .slice(0, 120);
      if (!key) {
        seats.push(null);
        continue;
      }
      seats.push({ key: key, name: name || "Guest" });
    }
    tables.push({ id: id, kind: kind, number: number, seats: seats });
  }
  return { tables: tables };
}

function loadSeatingPlan_() {
  var raw = String(seatingSheet_().getRange(2, 1).getValue() || "");
  var plan = { tables: [] };
  if (raw) {
    try {
      plan = sanitizeSeatingPlan_(JSON.parse(raw));
    } catch (err) {
      plan = { tables: [] };
    }
  }
  return json_({ ok: true, plan: plan });
}

function saveSeatingPlan_(data) {
  var plan = sanitizeSeatingPlan_(data && data.plan);
  var sheet = seatingSheet_();
  sheet.getRange(1, 1).setValue("Plan");
  sheet.getRange(2, 1).setValue(JSON.stringify(plan));
  return json_({ ok: true, saved: true, plan: plan });
}

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);
    const action = String(data.action || "create")
      .trim()
      .toLowerCase();

    var tokenBlocked = assertRsvpToken_(data);
    if (tokenBlocked) return tokenBlocked;

    if (
      action !== "suggest" &&
      action !== "list" &&
      action !== "invited" &&
      action !== "seatingload" &&
      action !== "seatingsave"
    ) {
      var limited = assertRateLimit_(action || "create", data);
      if (limited) return limited;
    }

    if (action === "suggest") {
      return suggestInvitedNames_(data);
    }
    if (action === "list") {
      return listRsvps_();
    }
    if (action === "invited") {
      return listInvitedNames_();
    }
    if (action === "seatingload") {
      return loadSeatingPlan_();
    }
    if (action === "seatingsave") {
      return saveSeatingPlan_(data);
    }
    if (action === "lookup") {
      return lookupByName_(data);
    }
    if (action === "update") {
      return updateByName_(data);
    }

    return createRsvp_(data);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    // Health only. Lookup is POST-only so names/contacts are not placed in URLs.
    return json_({
      ok: true,
      message: "Caren & Zayrol RSVP endpoint is live.",
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function readContact_(data) {
  var noEmail = data && (data.noEmail === true || data.noEmail === "true");
  var noPhone = data && (data.noPhone === true || data.noPhone === "true");
  var email = noEmail
    ? ""
    : String((data && data.email) || "")
        .trim()
        .toLowerCase();
  var phoneRaw = noPhone ? "" : String((data && data.phone) || "").trim();
  var phone = normalizePhone_(phoneRaw);

  if (noEmail && noPhone) {
    return { error: "Please provide an email or a mobile number." };
  }
  if (email && !isValidEmail_(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (phoneRaw && phone.length < 10) {
    return { error: "Please enter a valid mobile number." };
  }
  if (!email && phone.length < 10) {
    return { error: "Please provide an email or a mobile number." };
  }

  return { email: email, phone: phone, phoneRaw: phoneRaw };
}

function createRsvp_(data) {
  const guestNameRaw = String(data.guestName || "").trim();
  const attendance = String(data.attendance || "").trim();
  // Generic on purpose — do not reveal allowlist / already-registered status.
  const errSave =
    "Your RSVP couldn't be saved. Please try again.";

  if (!guestNameRaw || !attendance) {
    return json_({ ok: false, error: "Missing required fields." });
  }

  const contact = readContact_(data);
  if (contact.error) {
    return json_({ ok: false, error: contact.error });
  }
  const email = contact.email;
  const phone = contact.phone;

  const guestName = resolveInvitedGuestName_(guestNameRaw);
  if (!guestName) {
    return json_({ ok: false, error: errSave });
  }

  const sheet = getSheet_();
  const nameKey = normalizeName_(guestName);

  if (findRowByName_(sheet, nameKey)) {
    return json_({ ok: false, error: errSave });
  }

  const duplicate = findDuplicate_(sheet, email, phone, 0);
  if (duplicate) {
    return json_({ ok: false, error: errSave });
  }

  writeRow_(sheet, sheet.getLastRow() + 1, data, guestName, email, contact.phoneRaw);
  return savedJson_(sheet, { ok: true, saved: true });
}

function lookupByName_(data) {
  const guestName = String(data.guestName || "").trim();
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizePhone_(String(data.phone || "").trim());
  // Generic on purpose — do not reveal whether the name exists without matching contact.
  const errFind =
    "We couldn't find a matching RSVP. Check your full name and the email or mobile number used before.";

  if (!guestName) {
    return json_({ ok: false, error: "Please enter your full name." });
  }

  if (!email && phone.length < 10) {
    return json_({
      ok: false,
      error:
        "Enter your full name plus the email or mobile number used on your RSVP.",
    });
  }

  const sheet = getSheet_();
  const found = findRowByName_(sheet, normalizeName_(guestName));
  if (!found) {
    return json_({ ok: false, error: errFind });
  }

  const record = found.record;
  const emailOk =
    Boolean(email) &&
    email === String(record.email || "")
      .trim()
      .toLowerCase();
  const phoneOk =
    phone.length >= 10 && phone === normalizePhone_(record.phone);

  if (!emailOk && !phoneOk) {
    return json_({ ok: false, error: errFind });
  }

  return json_({ ok: true, record: record });
}

function updateByName_(data) {
  const guestNameRaw = String(data.guestName || "").trim();
  const originalGuestName = String(
    data.originalGuestName || data.guestName || ""
  ).trim();
  const attendance = String(data.attendance || "").trim();
  const errUpdate =
    "We couldn't update this RSVP. Find your RSVP with your name and contact details first, then try again.";

  if (!guestNameRaw || !attendance) {
    return json_({ ok: false, error: "Missing required fields." });
  }

  const contact = readContact_(data);
  if (contact.error) {
    return json_({ ok: false, error: contact.error });
  }
  const email = contact.email;
  const phoneRaw = contact.phoneRaw;
  const phone = contact.phone;

  const guestName = resolveInvitedGuestName_(guestNameRaw);
  if (!guestName) {
    return json_({ ok: false, error: errUpdate });
  }

  const sheet = getSheet_();
  const found = findRowByName_(sheet, normalizeName_(originalGuestName));
  if (!found) {
    return json_({ ok: false, error: errUpdate });
  }

  const verifyEmail = String(data.originalEmail || data.verifyEmail || "")
    .trim()
    .toLowerCase();
  const verifyPhone = normalizePhone_(
    String(data.originalPhone || data.verifyPhone || "").trim()
  );
  const currentEmail = String(found.record.email || "")
    .trim()
    .toLowerCase();
  const currentPhone = normalizePhone_(found.record.phone);
  const verifyEmailOk = Boolean(verifyEmail) && verifyEmail === currentEmail;
  const verifyPhoneOk =
    verifyPhone.length >= 10 && verifyPhone === currentPhone;

  if (!verifyEmailOk && !verifyPhoneOk) {
    return json_({ ok: false, error: errUpdate });
  }

  const nameOwner = findRowByName_(sheet, normalizeName_(guestName));
  if (nameOwner && nameOwner.rowIndex !== found.rowIndex) {
    return json_({ ok: false, error: errUpdate });
  }

  const duplicate = findDuplicate_(sheet, email, phone, found.rowIndex);
  if (duplicate) {
    return json_({ ok: false, error: errUpdate });
  }

  writeRow_(sheet, found.rowIndex, data, guestName, email, phoneRaw);
  return savedJson_(sheet, { ok: true, saved: true, updated: true });
}

function sheetHasGuestsColumn_(sheet) {
  return (
    String(sheet.getRange(1, 7).getValue() || "")
      .trim()
      .toLowerCase() === "guests"
  );
}

function formatTimestampPh_(value) {
  var date = value ? new Date(value) : new Date();
  if (isNaN(date.getTime())) date = new Date();
  // Philippine time: 2026-09-29 21:42:05:123
  return Utilities.formatDate(date, "Asia/Manila", "yyyy-MM-dd HH:mm:ss:SSS");
}

function buildRowValues_(data, guestName, email, phoneRaw, includeGuests) {
  const base = [
    formatTimestampPh_(data.submittedAt),
    guestName.slice(0, 120),
    email.slice(0, 160),
    String(phoneRaw != null ? phoneRaw : data.phone || "")
      .trim()
      .slice(0, 40),
    String(data.attendance || "").trim().slice(0, 20),
    String(data.events || "").slice(0, 40),
  ];

  if (includeGuests) {
    base.push("");
  }

  base.push(
    String(data.commute || data.ownCar || "").slice(0, 40),
    String(data.allergies || "").slice(0, 200),
    String(data.message || "").slice(0, 500),
    String(data.source || "").slice(0, 300)
  );

  return base;
}

function headerColumn_(sheet, name) {
  var lastCol = sheet.getLastColumn();
  if (!lastCol) return 0;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var want = String(name || "").trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim().toLowerCase() === want) return i + 1;
  }
  return 0;
}

function ensureHashtagColumn_(sheet) {
  var existing = headerColumn_(sheet, "hashtag");
  if (existing) return existing;
  // Append only. insertColumn would shift existing RSVP cells.
  var col = Math.max(sheet.getLastColumn(), 1) + 1;
  sheet.getRange(1, col).setValue("Hashtag");
  return col;
}

function normalizeHashtag_(value) {
  var text = String(value || "")
    .trim()
    .replace(/\s+/g, "");
  if (!text) return "";
  text = text.replace(/[^#A-Za-z0-9_]/g, "").replace(/^#+/, "");
  if (!text) return "";
  return "#" + text;
}

function writeRow_(sheet, rowIndex, data, guestName, email, phoneRaw) {
  const includeGuests = sheetHasGuestsColumn_(sheet);
  const values = buildRowValues_(data, guestName, email, phoneRaw, includeGuests);
  sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
  const hashtagCol = ensureHashtagColumn_(sheet);
  if (hashtagCol > values.length) {
    sheet.getRange(rowIndex, hashtagCol).setValue(normalizeHashtag_(data.hashtag));
  }
  invalidateSheetCache_(sheet);
}

function normalizePhone_(value) {
  // One key for the same PH mobile: 0917…, 917…, 63 917…, and +63 917….
  var digits = String(value || "").replace(/\D/g, "");
  if (digits.indexOf("00") === 0) digits = digits.slice(2);
  if (digits.indexOf("63") === 0 && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  if (digits.charAt(0) === "0" && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function normalizeName_(value) {
  // Case-insensitive whole-name match: ignore letter case, extra spaces, and punctuation.
  // Partial names do not match (e.g. "Juan" will not find "Juan Dela Cruz").
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\sñÑ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isValidEmail_(email) {
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    email
  );
}

function recordFromRow_(row, hasGuests, hashtagCol) {
  // With Guests: 0..10 = Timestamp, Name, Email, Phone, Attendance, Events, Guests, Commute, Allergies, Message, Source
  // Without:     0..9  = Timestamp, Name, Email, Phone, Attendance, Events, Commute, Allergies, Message, Source
  // Hashtag is appended after Source and is not part of those indexes.
  const commuteIdx = hasGuests ? 7 : 6;
  const hashtagIdx = hashtagCol ? hashtagCol - 1 : -1;
  return {
    guestName: String(row[1] || "").trim(),
    email: String(row[2] || "").trim(),
    phone: String(row[3] || "").trim(),
    attendance: String(row[4] || "").trim(),
    events: String(row[5] || "").trim(),
    commute: String(row[commuteIdx] || "").trim(),
    allergies: String(row[commuteIdx + 1] || "").trim(),
    message: String(row[commuteIdx + 2] || "").trim(),
    hashtag: hashtagIdx >= 0 ? String(row[hashtagIdx] || "").trim() : "",
  };
}

function listRsvps_() {
  var sheet = getSheet_();
  var data = readSheetRows_(sheet);
  var sourceIdx = (data.hasGuests ? 7 : 6) + 3;
  var rows = [];

  for (var i = 0; i < data.rows.length; i++) {
    var row = data.rows[i];
    var record = recordFromRow_(row, data.hasGuests, data.hashtagCol);
    if (!record.guestName && !record.email && !record.phone) continue;
    record.submittedAt = String(row[0] || "").trim();
    record.source = String(row[sourceIdx] || "").trim();
    rows.push(record);
  }

  var invitedCount = Object.keys(getGuestListMap_()).length;
  var pendingCount = invitedCount > rows.length ? invitedCount - rows.length : 0;

  return json_({
    ok: true,
    count: rows.length,
    invitedCount: invitedCount,
    registeredCount: rows.length,
    pendingCount: pendingCount,
    rows: rows,
  });
}

var SHEET_CACHE_TTL_SEC_ = 45;

function sheetCacheKey_(sheet) {
  return "rsvp_rows:v2:" + sheet.getParent().getId() + ":" + sheet.getName();
}

function invalidateSheetCache_(sheet) {
  try {
    CacheService.getScriptCache().remove(sheetCacheKey_(sheet));
  } catch (err) {}
}

function readSheetRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const hasGuests = sheetHasGuestsColumn_(sheet);
  const hashtagCol = headerColumn_(sheet, "hashtag");
  if (lastRow < 2) return { hasGuests: hasGuests, hashtagCol: hashtagCol, rows: [] };

  const width = Math.max(hasGuests ? 11 : 10, hashtagCol || 0);
  // getRange(row, column, numRows, numColumns)
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  return { hasGuests: hasGuests, hashtagCol: hashtagCol, rows: values };
}

function readSheetRowsCached_(sheet) {
  var cache = CacheService.getScriptCache();
  var key = sheetCacheKey_(sheet);
  try {
    var hit = cache.get(key);
    if (hit) return JSON.parse(hit);
  } catch (err) {}

  var data = readSheetRows_(sheet);
  try {
    cache.put(key, JSON.stringify(data), SHEET_CACHE_TTL_SEC_);
  } catch (err) {}
  return data;
}

function findRowByName_(sheet, nameKey) {
  if (!nameKey) return null;

  const data = readSheetRowsCached_(sheet);
  var match = null;

  for (var i = 0; i < data.rows.length; i++) {
    if (normalizeName_(data.rows[i][1]) === nameKey) {
      match = {
        rowIndex: i + 2,
        record: recordFromRow_(data.rows[i], data.hasGuests, data.hashtagCol),
      };
    }
  }

  return match;
}

function findDuplicate_(sheet, email, phone, excludeRow) {
  const data = readSheetRowsCached_(sheet);

  for (var i = 0; i < data.rows.length; i++) {
    var rowIndex = i + 2;
    if (excludeRow && rowIndex === excludeRow) continue;

    const existingEmail = String(data.rows[i][2] || "")
      .trim()
      .toLowerCase();
    const existingPhone = normalizePhone_(data.rows[i][3]);
    if (email && existingEmail === email) return true;
    if (phone.length >= 10 && existingPhone === phone) return true;
  }
  return false;
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;

  // 1) Explicit spreadsheet ID in Code.gs (best — always write here)
  var configuredId = String(SPREADSHEET_ID || "").trim();
  if (configuredId) {
    ss = SpreadsheetApp.openById(configuredId);
    props.setProperty(PROP_SPREADSHEET_ID, configuredId);
    return ss;
  }

  // 2) Script bound to a Google Sheet
  ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) {
    props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
    return ss;
  }

  // 3) Previously created / remembered spreadsheet
  var savedId = props.getProperty(PROP_SPREADSHEET_ID);
  if (savedId) {
    try {
      ss = SpreadsheetApp.openById(savedId);
      if (ss) return ss;
    } catch (err) {
      // Sheet was deleted — create a fresh one below.
    }
  }

  // 4) Create a new spreadsheet when none exists
  ss = SpreadsheetApp.create(SPREADSHEET_NAME);
  props.setProperty(PROP_SPREADSHEET_ID, ss.getId());
  return ss;
}

function sheetInfo_() {
  var sheet = getSheet_();
  var ss = sheet.getParent();
  return json_({
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    rowCount: sheet.getLastRow(),
  });
}

function savedJson_(sheet, extra) {
  var ss = sheet.getParent();
  var payload = {
    ok: true,
    saved: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    spreadsheetName: ss.getName(),
    sheetName: sheet.getName(),
    rowCount: sheet.getLastRow(),
  };
  if (extra) {
    Object.keys(extra).forEach(function (key) {
      payload[key] = extra[key];
    });
  }
  return json_(payload);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }

  var firstCell = String(sheet.getRange(1, 1).getValue() || "")
    .trim()
    .toLowerCase();
  if (!firstCell) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    // Prefer renaming the default first tab when the file is brand new
    var first = ss.getSheets()[0];
    if (
      first &&
      ss.getSheets().length === 1 &&
      first.getLastRow() === 0 &&
      /^sheet\d+$/i.test(first.getName())
    ) {
      first.setName(SHEET_NAME);
      sheet = first;
    } else {
      sheet = ss.insertSheet(SHEET_NAME);
    }
  }

  ensureHeaders_(sheet);
  ensureHashtagColumn_(sheet);
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
