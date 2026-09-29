/**
 * Wedding RSVP → Google Sheets
 *
 * After editing this file in Apps Script:
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy
 *
 * Tab name: RSVPs
 * Headers:
 * Timestamp | Name | Email | Phone | Attendance | Events | Commute | Allergies | Message | Source
 *
 * GET / POST actions:
 * - create (default): append a new RSVP
 * - lookup: { action: "lookup", guestName }
 * - update: { action: "update", guestName, originalGuestName?, email, phone, ... }
 *
 * Browser calls should use GET ?payload=<json> (most reliable with Apps Script CORS).
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
];

/**
 * Optional: paste your Google Sheet ID here (from the sheet URL).
 * Required if the Apps Script is NOT bound to that sheet.
 * Example URL: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
 */
const SPREADSHEET_ID = "";

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);
    const action = String(data.action || "create")
      .trim()
      .toLowerCase();

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
    const params = (e && e.parameter) || {};
    var data = {};

    // Preferred browser path: ?payload={...json...}
    if (params.payload) {
      data = JSON.parse(params.payload);
    }

    const action = String(
      data.action || params.action || (params.payload ? "create" : "")
    )
      .trim()
      .toLowerCase();

    if (action === "info") {
      return sheetInfo_();
    }
    if (action === "lookup") {
      return lookupByName_({
        guestName: data.guestName || params.guestName || "",
      });
    }
    if (action === "update") {
      return updateByName_(data);
    }
    if (action === "create") {
      return createRsvp_(data);
    }

    return json_({
      ok: true,
      message: "Caren & Zayrol RSVP endpoint is live. Use POST from the wedding site.",
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function createRsvp_(data) {
  const guestName = String(data.guestName || "").trim();
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const phone = normalizePhone_(String(data.phone || "").trim());
  const attendance = String(data.attendance || "").trim();

  if (!guestName || !email || !attendance || !phone) {
    return json_({ ok: false, error: "Missing required fields." });
  }

  if (!isValidEmail_(email)) {
    return json_({ ok: false, error: "Please enter a valid email address." });
  }

  if (phone.length < 10) {
    return json_({ ok: false, error: "Please enter a valid mobile number." });
  }

  const sheet = getSheet_();
  const nameKey = normalizeName_(guestName);

  if (findRowByName_(sheet, nameKey)) {
    return json_({
      ok: false,
      error:
        "This name already has an RSVP. Turn on “Already registered? Edit your RSVP” below to update it.",
    });
  }

  const duplicate = findDuplicate_(sheet, email, phone, 0);
  if (duplicate) {
    return json_({
      ok: false,
      error:
        "This email or mobile number already has an RSVP. Turn on “Already registered? Edit your RSVP” below to update it.",
    });
  }

  writeRow_(sheet, sheet.getLastRow() + 1, data, guestName, email, String(data.phone || "").trim());
  return savedJson_(sheet, { ok: true, saved: true });
}

function lookupByName_(data) {
  const guestName = String(data.guestName || "").trim();
  if (!guestName) {
    return json_({ ok: false, error: "Please enter your full name." });
  }

  const sheet = getSheet_();
  const found = findRowByName_(sheet, normalizeName_(guestName));
  if (!found) {
    return json_({
      ok: false,
      error:
        "No RSVP found for that name. Check the spelling, or turn the edit switch off to send a new RSVP.",
    });
  }

  return json_({ ok: true, record: found.record });
}

function updateByName_(data) {
  const guestName = String(data.guestName || "").trim();
  const originalGuestName = String(
    data.originalGuestName || data.guestName || ""
  ).trim();
  const email = String(data.email || "")
    .trim()
    .toLowerCase();
  const phoneRaw = String(data.phone || "").trim();
  const phone = normalizePhone_(phoneRaw);
  const attendance = String(data.attendance || "").trim();

  if (!guestName || !email || !attendance || !phone) {
    return json_({ ok: false, error: "Missing required fields." });
  }

  if (!isValidEmail_(email)) {
    return json_({ ok: false, error: "Please enter a valid email address." });
  }

  if (phone.length < 10) {
    return json_({ ok: false, error: "Please enter a valid mobile number." });
  }

  const sheet = getSheet_();
  const found = findRowByName_(sheet, normalizeName_(originalGuestName));
  if (!found) {
    return json_({
      ok: false,
      error:
        "No RSVP found for that name. Check the spelling, or turn the edit switch off to send a new RSVP.",
    });
  }

  const nameOwner = findRowByName_(sheet, normalizeName_(guestName));
  if (nameOwner && nameOwner.rowIndex !== found.rowIndex) {
    return json_({
      ok: false,
      error: "Another RSVP already uses that name. Please keep your registered name.",
    });
  }

  const duplicate = findDuplicate_(sheet, email, phone, found.rowIndex);
  if (duplicate) {
    return json_({
      ok: false,
      error:
        "This email or mobile number already belongs to another RSVP. Please use your original contact details or message Caren or Zayrol.",
    });
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

function buildRowValues_(data, guestName, email, phoneRaw, includeGuests) {
  const base = [
    data.submittedAt || new Date().toISOString(),
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

function writeRow_(sheet, rowIndex, data, guestName, email, phoneRaw) {
  const includeGuests = sheetHasGuestsColumn_(sheet);
  const values = buildRowValues_(data, guestName, email, phoneRaw, includeGuests);
  sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeName_(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isValidEmail_(email) {
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(
    email
  );
}

function recordFromRow_(row, hasGuests) {
  // With Guests: 0..10 = Timestamp, Name, Email, Phone, Attendance, Events, Guests, Commute, Allergies, Message, Source
  // Without:     0..9  = Timestamp, Name, Email, Phone, Attendance, Events, Commute, Allergies, Message, Source
  const commuteIdx = hasGuests ? 7 : 6;
  return {
    guestName: String(row[1] || "").trim(),
    email: String(row[2] || "").trim(),
    phone: String(row[3] || "").trim(),
    attendance: String(row[4] || "").trim(),
    events: String(row[5] || "").trim(),
    commute: String(row[commuteIdx] || "").trim(),
    allergies: String(row[commuteIdx + 1] || "").trim(),
    message: String(row[commuteIdx + 2] || "").trim(),
  };
}

function findRowByName_(sheet, nameKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !nameKey) return null;

  const hasGuests = sheetHasGuestsColumn_(sheet);
  const width = hasGuests ? 11 : 10;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var match = null;

  for (var i = 0; i < values.length; i++) {
    if (normalizeName_(values[i][0]) === nameKey) {
      var rowIndex = i + 2;
      var row = sheet.getRange(rowIndex, 1, 1, width).getValues()[0];
      match = {
        rowIndex: rowIndex,
        record: recordFromRow_(row, hasGuests),
      };
    }
  }

  return match;
}

function findDuplicate_(sheet, email, phone, excludeRow) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Col C = Email (3), Col D = Phone (4)
  const values = sheet.getRange(2, 3, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    var rowIndex = i + 2;
    if (excludeRow && rowIndex === excludeRow) continue;

    const existingEmail = String(values[i][0] || "")
      .trim()
      .toLowerCase();
    const existingPhone = normalizePhone_(values[i][1]);
    if (existingEmail && existingEmail === email) return true;
    if (existingPhone && existingPhone === phone) return true;
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
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
