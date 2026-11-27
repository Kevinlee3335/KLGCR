import { checkoutPdfPhotoCaption } from "@/lib/checkout-pdf-import";
import { signEvidencePhotos } from "@/lib/evidence-urls";
import type { createClient } from "@/lib/supabase/server";

type Props = { db: Awaited<ReturnType<typeof createClient>>; id: string };

export async function RoomEvidence({ db, id }: Props) {
  const { data, error } = await db.from("checkout_photos").select("id,kind,storage_path,created_at,utmspace_pdf_source")
    .eq("checkout_room_id", id).order("created_at");
  const photos = await signEvidencePhotos(db, "checkout-evidence", data ?? []);
  return <section className="panel checkout-evidence">
    <h3>Photo evidence</h3>
    {error && <p className="error">Unable to load room photos. Please refresh.</p>}
    <div className="photo-grid">{photos.map(photo => photo.url
      ? <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}>
          <img loading="lazy" decoding="async" src={photo.url} alt={checkoutPdfPhotoCaption(photo)}/><span>{checkoutPdfPhotoCaption(photo)}</span>
        </a>
      : <p className="error" key={photo.id}>Unable to load {photo.kind} photo. Please refresh.</p>
    )}</div>
    {!error && !photos.length && <p className="subtle">No evidence uploaded yet.</p>}
  </section>;
}

export async function RoomHistory({ db, id }: Props) {
  const { data: events, error } = await db.from("checkout_history").select("id,action,notes,created_at,actor:profiles!actor_id(full_name)")
    .eq("checkout_room_id", id).order("created_at", { ascending: false });
  if (error) return <p className="error">Unable to load room history.</p>;
  return <section className="panel"><h3>History</h3>
    <div className="history-list">{events?.map(event => <div key={event.id}>
      <strong>{event.action.replaceAll("_"," ")}</strong>
      <span>{(event.actor as unknown as {full_name: string} | null)?.full_name} · {new Date(event.created_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</span>
      {event.notes && <p>{event.notes}</p>}
    </div>)}</div>
  </section>;
}
