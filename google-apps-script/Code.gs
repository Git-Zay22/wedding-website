/**
 * Wedding RSVP → Google Sheets
 *
 * After editing this file in Apps Script:
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy
 *
 * Tab name: RSVPs
 * Headers:
 * Timestamp | Name | Email | Phone | Attendance | Events | Guests | Commute | Allergies | Message | Source
 *
 * POST actions:
 * - create (default): append a new RSVP
 * - lookup: { action: "lookup", guestName }
 * - update: { action: "update", guestName, originalGuestName?, email, phone, ... }
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
  "Guests",
  "Commute",
  "Allergies",
  "Message",
  "Source",
];

/**
 * Optional: paste a spreadsheet ID here to force a specific sheet.
 * Leave blank to use the bound spreadsheet, Script Properties, or auto-create.
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
    const action = String(params.action || "")
      .trim()
      .toLowerCase();

    if (action === "lookup") {
      return lookupByName_({ guestName: params.guestName || "" });
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

  sheet.appendRow(buildRowValues_(data, guestName, email));
  return json_({ ok: true });
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

  const guestsKeep = sheet.getRange(found.rowIndex, 7).getValue();
  sheet
    .getRange(found.rowIndex, 1, 1, 11)
    .setValues([
      buildRowValues_(data, guestName, email, phoneRaw, guestsKeep),
    ]);

  return json_({ ok: true, updated: true });
}

function buildRowValues_(data, guestName, email, phoneRaw, guestsKeep) {
  return [
    data.submittedAt || new Date().toISOString(),
    guestName.slice(0, 120),
    email.slice(0, 160),
    String(phoneRaw != null ? phoneRaw : data.phone || "")
      .trim()
      .slice(0, 40),
    String(data.attendance || "").trim().slice(0, 20),
    String(data.events || "").slice(0, 40),
    String(guestsKeep != null ? guestsKeep : data.guests || "").slice(0, 10),
    String(data.commute || data.ownCar || "").slice(0, 40),
    String(data.allergies || "").slice(0, 200),
    String(data.message || "").slice(0, 500),
    String(data.source || "").slice(0, 300),
  ];
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

function findRowByName_(sheet, nameKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || !nameKey) return null;

  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var match = null;

  for (var i = 0; i < values.length; i++) {
    if (normalizeName_(values[i][0]) === nameKey) {
      var rowIndex = i + 2;
      var row = sheet.getRange(rowIndex, 1, 1, 11).getValues()[0];
      match = {
        rowIndex: rowIndex,
        record: {
          guestName: String(row[1] || "").trim(),
          email: String(row[2] || "").trim(),
          phone: String(row[3] || "").trim(),
          attendance: String(row[4] || "").trim(),
          events: String(row[5] || "").trim(),
          guests: String(row[6] || "").trim(),
          commute: String(row[7] || "").trim(),
          allergies: String(row[8] || "").trim(),
          message: String(row[9] || "").trim(),
        },
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
  // 1) Script bound to a Google Sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var props = PropertiesService.getScriptProperties();

  // 2) Hardcoded spreadsheet ID (if set above)
  var configuredId = String(SPREADSHEET_ID || "").trim();
  if (configuredId) {
    ss = SpreadsheetApp.openById(configuredId);
    props.setProperty(PROP_SPREADSHEET_ID, configuredId);
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
