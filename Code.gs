/**
 * Wedding RSVP → Google Sheets
 *
 * SETUP
 * 1. Create a Google Sheet with a tab named "RSVPs"
 * 2. Row 1 headers (exact):
 *    Timestamp | Name | Email | Attendance | Guests | Commute | Message | Source
 * 3. Extensions → Apps Script → paste this file
 * 4. Deploy → New deployment → Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL into js/config.js → scriptUrl
 *    and set demoMode: false
 *
 * Optional: rename Spreadsheet or use SpreadsheetApp.getActiveSpreadsheet()
 * when this script is bound to the Sheet (Extensions → Apps Script from the Sheet).
 */

const SHEET_NAME = "RSVPs";

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    if (!data.guestName || !data.email || !data.attendance) {
      return json_({ ok: false, error: "Missing required fields." });
    }

    // Basic email check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) {
      return json_({ ok: false, error: "Invalid email." });
    }

    const sheet = getSheet_();
    sheet.appendRow([
      data.submittedAt || new Date().toISOString(),
      String(data.guestName).slice(0, 120),
      String(data.email).slice(0, 160),
      String(data.attendance).slice(0, 20),
      String(data.guests || "").slice(0, 10),
      String(data.commute || data.ownCar || "").slice(0, 40),
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

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      "Timestamp",
      "Name",
      "Email",
      "Attendance",
      "Guests",
      "Commute",
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
