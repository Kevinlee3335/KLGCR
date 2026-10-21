import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { securityAccess } from '@/lib/waste/server';
import { WASTE_BUCKET, validDate } from '@/lib/waste/shared';
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const access = await securityAccess();
  if (!access) return NextResponse.json({ error: 'Please reopen your Security link.' }, { status: 401 });
  const db = createAdminClient(); const paths: string[] = [];
  try {
    const form = await request.formData();
    const id = String(form.get('requestId') || '');
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid submission. Refresh this page.');
    const { data: existing, error: existingError } = await db.from('waste_collections').select('id').eq('id', id).eq('security_link_id', access.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ ok: true });
    const date = String(form.get('date')), time = String(form.get('time')), bins = Number(form.get('bins'));
    const actual = new Date(`${date}T${time}:00+08:00`);
    if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !Number.isFinite(actual.getTime()) || actual > new Date() || !Number.isInteger(bins) || bins < 1 || bins > 999) throw new Error('Enter a valid date, time (not in the future) and bin count.');
    const scheduleId = String(form.get('scheduleId') || '') || null;
    if (scheduleId) {
      const { data: schedule, error } = await db.from('waste_schedule_dates').select('collection_date,review_status').eq('id', scheduleId).single();
      if (error || !schedule || schedule.review_status === 'cancelled' || schedule.collection_date > date) throw new Error('Select a scheduled date on or before the collection date.');
    }
    const files = form.getAll('photos').filter((file): file is File => file instanceof File && file.size > 0);
    if (!files.length || files.length > 5 || files.some(file => file.type !== 'image/jpeg' || file.size > 700_000)) throw new Error('Upload 1–5 photos, each under 700 KB.');
    for (const file of files) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) throw new Error('Invalid photo. Please take a new photo.');
      const path = `photos/${id}/${crypto.randomUUID()}.jpg`;
      const { error } = await db.storage.from(WASTE_BUCKET).upload(path, buffer, { contentType: 'image/jpeg' });
      if (error) throw error; paths.push(path);
    }
    const { error } = await db.from('waste_collections').insert({ id, schedule_id: scheduleId, security_link_id: access.id, guard_name: access.guard_name, collected_at: actual.toISOString(), bins, photos: paths, remarks: String(form.get('remarks') || '').trim().slice(0, 1000) });
    if (error) {
      if (error.code === '23505') {
        await db.storage.from(WASTE_BUCKET).remove(paths);
        const { data: saved } = await db.from('waste_collections').select('id').eq('id', id).eq('security_link_id', access.id).maybeSingle();
        if (saved) return NextResponse.json({ ok: true });
        throw new Error('This scheduled collection already has a record. Refresh the page.');
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (cause) {
    if (paths.length) await db.storage.from(WASTE_BUCKET).remove(paths);
    console.error('Waste submission failed', cause);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : 'Could not save. Please retry.' }, { status: 400 });
  }
}
