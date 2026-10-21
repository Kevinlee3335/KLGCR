'use server';
import { randomBytes, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { hashToken } from '@/lib/waste/server';
import { scheduleDates, WASTE_BUCKET } from '@/lib/waste/shared';
export type WasteActionState = { error?: string; link?: string; success?: string };
export async function createSecurityLink(_: WasteActionState, form: FormData): Promise<WasteActionState> {
  const profile = await requireRole(['admin']);
  const name = String(form.get('guardName') || '').trim();
  if (!name || name.length > 100) return { error: 'Enter the Security officer / team name (up to 100 characters).' };
  const token = randomBytes(32).toString('hex');
  const { error } = await createAdminClient().from('waste_security_links').insert({ guard_name: name, token_hash: hashToken(token), created_by: profile.id });
  if (error) return { error: 'Could not create Security link. Please retry.' };
  revalidatePath('/admin/waste-collection');
  return { link: `/api/waste/access?token=${token}` };
}
export async function disableSecurityLink(form: FormData) {
  await requireRole(['admin']);
  const { error } = await createAdminClient().from('waste_security_links').update({ is_active: false }).eq('id', String(form.get('id')));
  if (error) redirect('/admin/waste-collection?error=Could+not+disable+link');
  revalidatePath('/admin/waste-collection');
}
export async function saveWasteSchedule(_: WasteActionState, form: FormData): Promise<WasteActionState> {
  await requireRole(['admin']);
  const db = createAdminClient(); let path: string | null = null;
  try {
    const month = String(form.get('month') || '');
    const dates = scheduleDates(month, String(form.get('dates') || ''));
    const deadline = String(form.get('deadline') || '') || null;
    if (deadline && !/^([01]\d|2[0-3]):[0-5]\d$/.test(deadline)) throw new Error('Invalid collection deadline.');
    const file = form.get('schedule');
    if (file instanceof File && file.size) {
      const types: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls' };
      const ext = types[file.type];
      if (!ext || file.size > 3_000_000) throw new Error('Upload PDF, JPG, PNG or Excel under 3 MB.');
      path = `schedules/${month}/${randomUUID()}.${ext}`;
      const { error } = await db.storage.from(WASTE_BUCKET).upload(path, file, { contentType: file.type }); if (error) throw error;
    }
    const client = await createClient();
    const { error } = await client.rpc('save_waste_schedule', { p_month: `${month}-01`, p_dates: dates, p_deadline: deadline, p_source: path, p_name: file instanceof File && file.size ? file.name.slice(0, 200) : null });
    if (error) throw error;
    revalidatePath('/admin/waste-collection'); revalidatePath('/waste-collection');
    return { success: `Schedule saved: ${dates.length} confirmed date(s). Existing dates and records are preserved.` };
  } catch (cause) {
    if (path) await db.storage.from(WASTE_BUCKET).remove([path]);
    return { error: cause instanceof Error ? cause.message : 'Schedule could not be saved.' };
  }
}
export async function reviewWasteSchedule(form: FormData) {
  const profile = await requireRole(['admin']);
  const status = String(form.get('reviewStatus'));
  const note = String(form.get('reviewNote') || '').trim().slice(0, 1000);
  if (!['open', 'confirmed_missed', 'security_missing', 'cancelled'].includes(status) || (status !== 'open' && !note)) redirect('/admin/waste-collection?error=Add+a+confirmation+note');
  const { error } = await createAdminClient().from('waste_schedule_dates').update({ review_status: status, review_note: note, reviewed_by: profile.id, reviewed_at: new Date().toISOString() }).eq('id', String(form.get('id')));
  if (error) redirect('/admin/waste-collection?error=Could+not+save+confirmation');
  revalidatePath('/admin/waste-collection'); revalidatePath('/waste-collection');
}
