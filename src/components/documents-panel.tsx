"use client";
import { useMemo, useRef, useState } from "react";
import { FolderOpen, UploadCloud, Search, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepareDocument, saveDocument, documentUrl, deleteDocument } from "@/app/(dashboard)/documents/actions";
const documentDateFormatter = new Intl.DateTimeFormat("en-MY",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium"});
type Document = { id: string; file_name: string; size_bytes: number; created_at: string };
export function DocumentsPanel({ documents, canManage }: { documents: Document[]; canManage: boolean }) {
  const [search,setSearch] = useState("");
  const [selected,setSelected] = useState<string[]>([]);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchable = useMemo(() => documents.map(doc => ({doc, name: doc.file_name.toLowerCase()})), [documents]);
  const visible = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/);
    return searchable.filter(({name}) => words.every(word => name.includes(word))).map(({doc}) => doc);
  }, [searchable, search]);
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
    setSelected([]); setBusy(false); router.refresh();
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
    <div className="documents-heading"><div><span className="documents-eyebrow">FILE CENTER</span><h2>Your documents, in one place.</h2><p>Find floor plans, drawings and manuals by filename.</p></div><span className="documents-count"><FolderOpen size={20}/>{documents.length} files</span></div>
    {canManage && <section className="documents-upload-card"><div className="documents-upload-icon"><UploadCloud size={30}/></div><div className="documents-upload-copy"><h3>Upload Documents</h3><p>Keep the original filename. Multiple files · Up to 50 MB each</p><small>PDF, images, Word, Excel and CAD drawings</small></div><div className="document-upload"><input className="documents-file-input" id="documents-files" ref={input} type="file" multiple aria-label="Choose documents" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf" disabled={busy} onChange={event => setSelected(Array.from(event.target.files || []).map(file => file.name))}/><label className={`documents-choose${busy ? " is-disabled" : ""}`} htmlFor="documents-files">Choose files</label><button className="button primary" onClick={upload} disabled={busy || !selected.length}>{busy ? "Please wait…" : "Upload"}</button></div>{selected.length > 0 && <div className="documents-selected">{selected.length} selected · {selected.join(" · ")}</div>}</section>}
    {message && <p className="documents-message" role="status">{message}</p>}
    <section className="documents-library"><div className="documents-toolbar"><div><h3>All Documents</h3><p>{visible.length} document(s)</p></div><div className="documents-search"><Search size={20}/><label className="documents-sr-only" htmlFor="document-search">Search Documents</label><input id="document-search" type="search" placeholder="Search filename, e.g. Block A floor plan" value={search} onChange={event => setSearch(event.target.value)}/></div></div>
    <div className="document-list">{visible.map(doc => <article className="document-row" key={doc.id}><div className="document-info"><span className="document-file-icon"><FileText size={24}/></span><div><strong>{doc.file_name}</strong><small>{(doc.size_bytes / 1024 / 1024).toFixed(2)} MB · {documentDateFormatter.format(new Date(doc.created_at))}</small></div></div><div className="document-actions">{ /\.(pdf|png|jpe?g|webp)$/i.test(doc.file_name) && <button className="button" disabled={busy} onClick={() => open(doc,false)}>Preview</button>}<button className="button" disabled={busy} onClick={() => open(doc,true)}>Download</button>{canManage && <button className="button danger" disabled={busy} onClick={() => remove(doc)}>Delete</button>}</div></article>)}</div>
    {!visible.length && <div className="documents-empty"><span><FolderOpen size={36}/></span><h3>{documents.length ? "No matching documents." : "No documents uploaded yet."}</h3><p>{documents.length ? "Try another filename or keyword." : canManage ? "Choose your files above to add the first document." : "Uploaded documents will appear here."}</p></div>}</section>
  </div>;
}
