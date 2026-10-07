/**
 * Turns the stored Google Form response reference into a safe link back to
 * the response sheet. Older imports include the response row; newer webhook
 * records keep the spreadsheet and tab identifiers.
 */
export function googleFormResponseUrl(source?: string | null, sourceReference?: string | null) {
  if (source !== "google_form" || !sourceReference) return null;

  const versionTwo = sourceReference.match(/^gform-v2:([^:]+):(\d+):/);
  const legacy = sourceReference.match(/^([^:]+):(\d+):(\d+)$/);
  const match = versionTwo || legacy;
  if (!match) return null;

  const [, spreadsheetId, sheetId] = match;
  const responseRow = legacy?.[3];
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit#gid=${encodeURIComponent(sheetId)}`;

  return responseRow ? `${sheetUrl}&range=A${encodeURIComponent(responseRow)}` : sheetUrl;
}
