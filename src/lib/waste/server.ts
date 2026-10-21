import 'server-only';
import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
export const WASTE_COOKIE = 'klgcr-waste-access';
export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export async function securityAccess(token?: string) {
  const value = token ?? (await cookies()).get(WASTE_COOKIE)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const { data, error } = await createAdminClient().from('waste_security_links').select('id,guard_name').eq('token_hash', hashToken(value)).eq('is_active', true).maybeSingle();
  if (error) throw new Error('Security access is temporarily unavailable. Please try again.');
  return data;
}
