import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { createAdminClient } from './supabase/admin';

export const unifiWebmailAddress = 'project@keanlenggroup.com';
export const unifiWebmailHost = 'mail.keanlenggroup.com';
const connectionTable = 'unifi_webmail_connection';

function key() {
  const secret = process.env.UNIFI_WEBMAIL_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw Error('Webmail encryption is not configured.');
  return Buffer.from(hkdfSync('sha256', secret, '', 'klgcr/unifi-webmail/password/v1', 32));
}

export async function saveUnifiWebmailPassword(password: string, actorId: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const sealed = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64');
  const result = await createAdminClient().from(connectionTable).upsert({
    id: true,
    encrypted_password: sealed,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
    last_checked_at: null,
    last_error: null,
  });
  if (result.error) throw Error('Unable to save the Webmail connection.');
}

export async function loadUnifiWebmailPassword() {
  const result = await createAdminClient().from(connectionTable).select('encrypted_password').eq('id', true).maybeSingle();
  if (result.error) throw Error('Unable to read the Webmail connection.');
  if (!result.data) return null;
  const bytes = Buffer.from(result.data.encrypted_password, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}

export async function getUnifiWebmailConnectionStatus() {
  const result = await createAdminClient().from(connectionTable).select('last_checked_at,last_error').eq('id', true).maybeSingle();
  if (result.error) throw Error('Unable to check the Webmail connection.');
  return {
    connected: Boolean(result.data),
    lastCheckedAt: result.data?.last_checked_at as string | null ?? null,
    lastError: result.data?.last_error as string | null ?? null,
  };
}

export async function recordUnifiWebmailCheck(error: string | null, checked: boolean) {
  const result = await createAdminClient().from(connectionTable).update({
    last_error: error,
    ...(checked ? { last_checked_at: new Date().toISOString() } : {}),
  }).eq('id', true);
  if (result.error) throw Error('Unable to save the Webmail sync status.');
}
