/** The Malay report remains available without changing the operational English defect. */
export function CheckoutPdfSource({ value }: { value: unknown }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const text = (key: string) => typeof source[key] === "string" ? source[key] as string : "";
  return <details style={{ marginTop: 8 }}>
    <summary>Original UTMSPACE report · {text("sourceId") || "PDF"}</summary>
    <dl style={{ margin: "8px 0", fontSize: "0.9rem", overflowWrap: "anywhere" }}>
      {[["Item", text("originalItem")], ["Finding (Malay)", text("originalFinding")],
        ["Original action / remark", text("originalAction")], ["Report status", text("sourceStatus")],
        ["Inspection reference", text("inspectionId")], ["Reported date", text("reportedDate")],
        ["Source file", text("filename")]].filter(([, content]) => content).map(([label, content]) =>
        <div key={label}><dt style={{ fontWeight: 600 }}>{label}</dt><dd style={{ margin: "0 0 6px" }}>{content}</dd></div>)}
      {Number.isInteger(source.pageNumber) && <div><dt>PDF page</dt><dd style={{ margin: 0 }}>{String(source.pageNumber)}</dd></div>}
    </dl>
  </details>;
}
