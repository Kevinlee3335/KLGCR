"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareDocument, saveDocument, documentUrl, deleteDocument } from "@/app/(dashboard)/documents/actions";
type Document = { id: string; file_name: string; size_bytes: number; created_at: string };
export function DocumentsPanel({ documents, canManage }: { documents: Document[]; canManage: boolean }) {
  const [search,setSearch] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const visible = documents.filter(doc => search.trim().toLowerCase().split(/\s+/).every(word => doc.file_name.toLowerCase().includes(word)));
  async function upload() {
    const files = Array.from(input.current?.files || []);
    if (!files.length) return;
    setBusy(true); setMessage("");
    const failures: string[] = []; let count = 0;
    for (const file of files) {
      setMessage(`Uploading ${count + failures.length + 1}/${files.length}: ${file.name}`);
      try {
        const prepared = await prepareDocument(file.name,file.size);
        const result = await createClient().storage.from("system-documents").uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:file.type || "application/octet-stream"});
        if (result.error) throw result.error;
        await saveDocument(prepared.id,prepared.path,file.name); count++;
      } catch (error) { failures.push(`${file.name}: ${error instanceof Error ? error.message : "Upload failed"}`); }
    }
    setMessage(`${count} file(s) uploaded.${failures.length ? ` Failed: ${failures.join("; ")}` : ""}`);
    if (input.current) input.current.value = "";
    setBusy(false); router.refresh();
  }
  async function open(doc: Document, download: boolean) {
    const tab = window.open("about:blank","_blank");
    setBusy(true);
    try { const url = await documentUrl(doc.id,download); if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url; }
    catch (error) { tab?.close(); setMessage(error instanceof Error ? error.message : "Unable to open file."); }
    finally { setBusy(false); }
  }
  async function remove(doc: Document) {
    if (!window.confirm(`Delete ${doc.file_name}?`)) return;
    setBusy(true);
    try { await deleteDocument(doc.id); setMessage("Document deleted."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to delete file."); }
    finally { setBusy(false); }
  }
  return <div className="documents-panel">
    {canManage && <section className="card"><h2>Upload Documents</h2><p>Original filenames are kept. Select multiple files, up to 50 MB each.</p><div className="document-upload"><input ref={input} type="file" multiple aria-label="Choose documents" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf" disabled={busy}/><button className="button primary" onClick={upload} disabled={busy}>{busy ? "Please wait…" : "Upload"}</button></div></section>}
    {message && <p className="card" role="status">{message}</p>}
    <section className="card"><label htmlFor="document-search">Search Documents</label><input id="document-search" type="search" placeholder="Search filename, e.g. Block A floor plan" value={search} onChange={event => setSearch(event.target.value)}/><p>{visible.length} document(s)</p>
    <div className="document-list">{visible.map(doc => <article className="document-row" key={doc.id}><div><strong>{doc.file_name}</strong><small>{(doc.size_bytes / 1024 / 1024).toFixed(2)} MB · {new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium"}).format(new Date(doc.created_at))}</small></div><div className="document-actions">{ /\.(pdf|png|jpe?g|webp)$/i.test(doc.file_name) && <button className="button" disabled={busy} onClick={() => open(doc,false)}>Preview</button>}<button className="button" disabled={busy} onClick={() => open(doc,true)}>Download</button>{canManage && <button className="button danger" disabled={busy} onClick={() => remove(doc)}>Delete</button>}</div></article>)}</div>
    {!visible.length && <p>{documents.length ? "No matching documents." : "No documents uploaded yet."}</p>}</section>
  </div>;
}
