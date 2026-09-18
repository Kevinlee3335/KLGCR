/* KLGCR Inventory ↔ Google Sheet
 * Paste this into Extensions > Apps Script in the inventory spreadsheet.
 * Complete the three values below after the KLGCR website update is deployed.
 */
const KLGCR_INVENTORY_CONFIG = {
  appSyncUrl: "https://YOUR-LIVE-URL/api/google-inventory/sync",
  secret: "PASTE_THE_SAME_SECRET_AS_VERCEL",
  // Do not use the hidden combined master page. These are the five live source tabs.
  sourceSheets: [
    "BUILDING - MASTERLIST M.STORE",
    "ELECTRICAL - MASTERLIST M.STORE",
    "CHEMICAL - MASTERLIST M.STORE",
    "PIPPING - MASTERLIST M.STORE",
    "PAINTING - MASTERLIST M.STORE ",
  ],
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu("KLGCR Inventory")
    .addItem("Sync all items to App", "syncAllInventoryToApp")
    .addToUi();
}

// Create this as an installable On edit trigger, not a simple trigger.
function syncEditedInventoryRow(event) {
  const sheet = event && event.range && event.range.getSheet();
  if (!sheet || !KLGCR_INVENTORY_CONFIG.sourceSheets.includes(sheet.getName())) return;
  const item = inventoryRowFromSheet_(sheet, event.range.getRow());
  if (item) postToKlgcr_([item]);
}

function syncAllInventoryToApp() {
  const items = [];
  for (const name of KLGCR_INVENTORY_CONFIG.sourceSheets) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(name);
    if (!sheet) throw new Error(`Source sheet was not found: ${name}`);
    for (let row = 1; row <= sheet.getLastRow(); row++) {
      const item = inventoryRowFromSheet_(sheet, row);
      if (item) items.push(item);
    }
  }
  for (let start = 0; start < items.length; start += 200) postToKlgcr_(items.slice(start, start + 200));
  SpreadsheetApp.getActive().toast(`${items.length} inventory items sent to KLGCR App.`, "KLGCR Inventory", 6);
}

function doPost(event) {
  const body = JSON.parse(event.postData.contents || "{}");
  if (body.secret !== KLGCR_INVENTORY_CONFIG.secret || body.action !== "update_balance") return json_({ ok: false, error: "Unauthorized" });
  const item = body.item;
  if (!item || !item.itemCode) return json_({ ok: false, error: "Invalid update" });
  const target = findItemSheetRow_(String(item.itemCode));
  if (!target) return json_({ ok: false, error: "Item code not found" });
  // Live tab layout: E description, F item code, G stock balance, J minimum stock.
  target.sheet.getRange(target.row, 5).setValue(item.description);
  target.sheet.getRange(target.row, 7).setValue(`${item.balanceQty}${item.unit ? " " + item.unit : ""}`);
  target.sheet.getRange(target.row, 10).setValue(item.reorderLevel);
  return json_({ ok: true, sheet: target.sheet.getName(), row: target.row });
}

function inventoryRowFromSheet_(sheet, row) {
  const values = sheet.getRange(row, 1, 1, Math.max(10, sheet.getLastColumn())).getDisplayValues()[0];
  const itemCode = String(values[5] || "").trim();
  const description = String(values[4] || "").trim();
  if (!itemCode || !description || itemCode.toUpperCase() === "ITEM CODE") return null;
  const rawBalance = String(values[6] || "").trim();
  const lower = rawBalance.toLowerCase();
  const explicitBalance = {
    B00022: 2, // R410A aircond gas: count 2 units as requested.
    P00003: 5, // Jotun Jotaplast: count all 5 drums as requested.
  };
  const match = rawBalance.match(/^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/);
  let balanceQty;
  if (lower.indexOf("out of stock") >= 0 || lower === "n/a") balanceQty = 0;
  else if (/\bused\b|\bhalf\b/.test(lower)) balanceQty = explicitBalance[itemCode] ?? 0.5;
  else balanceQty = match ? Number(match[1]) : NaN;
  if (!Number.isFinite(balanceQty)) return null;
  const unit = match && match[2] ? match[2].toLowerCase() : "";
  const reorderMatch = String(values[9] || "").match(/\d+(?:\.\d+)?/);
  return { itemCode, description, category: categoryFor_(itemCode), movementCategory: movementFor_(values[7], values[8]), balanceQty, reorderLevel: reorderMatch ? Number(reorderMatch[0]) : 0, unit };
}

function findItemRow_(sheet, itemCode) {
  const codes = sheet.getRange(1, 6, sheet.getLastRow(), 1).getDisplayValues();
  for (let index = 0; index < codes.length; index++) if (String(codes[index][0]).trim().toUpperCase() === itemCode.toUpperCase()) return index + 1;
  return null;
}

function findItemSheetRow_(itemCode) {
  const spreadsheet = SpreadsheetApp.getActive();
  for (const name of KLGCR_INVENTORY_CONFIG.sourceSheets) {
    const sheet = spreadsheet.getSheetByName(name);
    const row = sheet && findItemRow_(sheet, itemCode);
    if (row) return { sheet, row };
  }
  return null;
}

function categoryFor_(code) { return code.indexOf("PG") === 0 ? "Piping" : code.indexOf("B") === 0 ? "Building" : code.indexOf("E") === 0 ? "Electrical" : code.indexOf("P") === 0 ? "Painting" : "Chemical"; }
function movementFor_(location, remarks) { const text = `${location} ${remarks}`.toLowerCase(); return text.indexOf("fast moving") >= 0 ? "fast" : (text.indexOf("as needed") >= 0 || text.indexOf("once") >= 0) ? "once_in_a_while" : "slow"; }
function postToKlgcr_(items) { const response = UrlFetchApp.fetch(KLGCR_INVENTORY_CONFIG.appSyncUrl, { method: "post", contentType: "application/json", headers: { "x-klgcr-inventory-secret": KLGCR_INVENTORY_CONFIG.secret }, payload: JSON.stringify({ items }), muteHttpExceptions: true }); if (response.getResponseCode() >= 300) throw new Error(`KLGCR sync failed: ${response.getContentText()}`); }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
