"use server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
const managers = ["admin", "management_viewer"] as const;
const bucket = "system-documents";
export async function prepareDocument(name: string, size: number) {
  const profile = await requireRole([...managers]);
  if (!name || name.length > 255 || size <= 0 || size > 50 * 1024 * 1024) throw new Error("Choose a file up to 50 MB.");
  const id = crypto.randomUUID();
  const extension = name.split(".").pop()?.toLowerCase();
  if (!extension || !["pdf","jpg","jpeg","png","webp","doc","docx","xls","xlsx","csv","txt","dwg","dxf"].includes(extension)) throw new Error("Unsupported file type.");
  const path = `${profile.id}/${id}/file.${extension}`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return { id, path, token: data.token };
}
export async function saveDocument(id: string, path: string, name: string) {
  const profile = await requireRole([...managers]);
  if (!/^[0-9a-f-]{36}$/.test(id) || !path.startsWith(`${profile.id}/${id}/file.`) || !name || name.length > 255) throw new Error("Invalid document.");
  const supabase = await createClient();
  const { data: files, error: fileError } = await supabase.storage.from(bucket).list(`${profile.id}/${id}`);
  const file = files?.find(file => path === `${profile.id}/${id}/${file.name}`);
  if (fileError || !file) throw new Error("Upload was not completed. Please retry.");
  const { error } = await supabase.from("system_documents").insert({ id, storage_path: path, file_name: name, size_bytes: file.metadata?.size || 0, uploaded_by: profile.id });
  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    throw new Error(error.message);
  }
  revalidatePath("/documents");
}
export async function documentUrl(id: string, download: boolean) {
  await requireRole(["admin","management_viewer","maintenance_staff","cleaner"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("system_documents").select("storage_path,file_name").eq("id",id).single();
  if (error || !data) throw new Error("Document not found.");
  const result = await supabase.storage.from(bucket).createSignedUrl(data.storage_path, 300, download ? { download: data.file_name } : undefined);
  if (result.error) throw new Error(result.error.message);
  return result.data.signedUrl;
}
export async function deleteDocument(id: string) {
  await requireRole([...managers]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("system_documents").select("storage_path").eq("id",id).single();
  if (error || !data) throw new Error("Document not found.");
  const removed = await supabase.storage.from(bucket).remove([data.storage_path]);
  if (removed.error) throw new Error(removed.error.message);
  const deleted = await supabase.from("system_documents").delete().eq("id",id);
  if (deleted.error) throw new Error(deleted.error.message);
  revalidatePath("/documents");
}
