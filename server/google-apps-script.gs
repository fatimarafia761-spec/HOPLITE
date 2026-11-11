/**
 * Google Sheets order inbox for the Electro Phone landing page.
 * Setup:
 *  1. Create a Google Sheet. Extensions → Apps Script → paste this file.
 *  2. Project Settings → Script properties → add SECRET = a long random string (same as SHEETS_SECRET on Netlify).
 *  3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → copy the URL.
 *  4. Put that URL in Netlify env var SHEETS_WEBHOOK_URL.
 */
var COLS = ["ref", "created_at", "status", "name", "phone", "city", "address", "notes", "product", "quantity",
  "unit_price", "subtotal", "delivery_fee", "total", "currency",
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "ttclid"];

function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var d = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
    if (!secret || d.secret !== secret) return out({ ok: false, error: "unauthorized" });
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    try {
      var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("Orders");
      if (sh.getLastRow() === 0) sh.appendRow(COLS);
      // prefix with ' so Sheets never runs a value as a formula
      sh.appendRow(COLS.map(function (k) { var v = d[k] == null ? "" : d[k]; return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }));
    } finally { lock.releaseLock(); }
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}
