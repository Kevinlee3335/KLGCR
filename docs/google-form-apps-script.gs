// Attach this script to the EXISTING KLG MAINTENANCE REPORT - 2026 response spreadsheet.
// Add Script Properties: KLGCR_WEBHOOK_URL and KLGCR_WEBHOOK_SECRET.
// Then create an installable trigger for onFormSubmit: From spreadsheet -> On form submit.
function onFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('KLGCR_WEBHOOK_URL');
  const secret = props.getProperty('KLGCR_WEBHOOK_SECRET');
  if (!url || !secret) throw new Error('Missing KLGCR webhook configuration');

  const payload = {};
  Object.keys(e.namedValues || {}).forEach(function (key) {
    const value = e.namedValues[key];
    payload[key] = Array.isArray(value) ? value.join(', ') : value;
  });

  const sheet = e.range.getSheet();
  payload.source_reference = [SpreadsheetApp.getActive().getId(), sheet.getSheetId(), e.range.getRow()].join(':');

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-klgcr-form-secret': secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error('KLGCR webhook failed: ' + response.getResponseCode() + ' ' + response.getContentText());
  }
}
