/**
 * Wedding RSVP → Google Sheets
 *
 * After editing this file in Apps Script:
 * Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy
 *
 * Tab name: RSVPs
 * Headers:
 * Timestamp | Name | Email | Phone | Attendance | Events | Guests | Commute | Allergies | Message | Source
 */

const SHEET_NAME = "RSVPs";

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    const guestName = String(data.guestName || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const phone = normalizePhone_(String(data.phone || "").trim());
    const attendance = String(data.attendance || "").trim();

    if (!guestName || !email || !attendance || !phone) {
      return json_({ ok: false, error: "Missing required fields." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json_({ ok: false, error: "Please enter a valid email address." });
    }

    if (phone.length < 10) {
      return json_({ ok: false, error: "Please enter a valid mobile number." });
    }

    const sheet = getSheet_();
    const duplicate = findDuplicate_(sheet, email, phone);
    if (duplicate) {
      return json_({
        ok: false,
        error:
          "This email or mobile number already has an RSVP. If you need to change your reply, please message Caren or Zayrol.",
      });
    }

    sheet.appendRow([
      data.submittedAt || new Date().toISOString(),
      guestName.slice(0, 120),
      email.slice(0, 160),
      String(data.phone || "").trim().slice(0, 40),
      attendance.slice(0, 20),
      String(data.events || "").slice(0, 40),
      String(data.guests || "").slice(0, 10),
      String(data.commute || data.ownCar || "").slice(0, 40),
      String(data.allergies || "").slice(0, 200),
      String(data.message || "").slice(0, 500),
      String(data.source || "").slice(0, 300),
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doGet() {
  return json_({
    ok: true,
    message: "Caren & Zayrol RSVP endpoint is live. Use POST from the wedding site.",
  });
}

function normalizePhone_(value) {
  return String(value || "").replace(/\D/g, "");
}

function findDuplicate_(sheet, email, phone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  // Col C = Email (3), Col D = Phone (4)
  const values = sheet.getRange(2, 3, lastRow - 1, 2).getValues();
  for (var i = 0; i < values.length; i++) {
    const existingEmail = String(values[i][0] || "")
      .trim()
      .toLowerCase();
    const existingPhone = normalizePhone_(values[i][1]);
    if (existingEmail && existingEmail === email) return true;
    if (existingPhone && existingPhone === phone) return true;
  }
  return false;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
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
    ]);
  }
  return sheet;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
