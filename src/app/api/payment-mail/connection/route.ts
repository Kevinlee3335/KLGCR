import {randomBytes} from 'node:crypto';
import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {loadBillingAccountDirectory} from '@/lib/billing-document-queries';
import {createAdminClient} from '@/lib/supabase/admin';
import {hashPaymentMailToken, loadPaymentMailSenders} from '@/lib/payment-mail/connections';
import {PaymentMailError, requirePaymentMailAdmin} from '@/lib/payment-mail/queries';
import {connectionReady, PAYMENT_MAILBOX} from '@/lib/payment-mail/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const fields = 'id,created_at,enabled_from,last_received_at,last_checked_at,last_error,revoked_at';
const mutation = z.discriminatedUnion('action', [
  z.object({action: z.literal('create'), lookbackDays: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)])}),
  z.object({action: z.literal('revoke'), id: z.string().uuid()}),
]);

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {status, headers: {'Cache-Control': 'no-store'}});
}

function failure(error: unknown) {
  if (error instanceof PaymentMailError) return json({error: error.message}, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error: 'Invalid installation request'}, 400);
  return json({error: 'Unable to check or change the email connection. Please retry.'}, 503);
}

export async function GET() {
  try {
    await requirePaymentMailAdmin();
    const db = createAdminClient();
    const [connections, senders, rental, utility] = await Promise.all([
      db.from('payment_mail_connections').select(fields).order('created_at', {ascending: false}).limit(50),
      loadPaymentMailSenders(db), loadBillingAccountDirectory('rental'), loadBillingAccountDirectory('utility'),
    ]);
    if (connections.error) throw new PaymentMailError('Unable to load the payment email connection', 503);
    const active = connections.data.filter(row => !row.revoked_at);
    const ready = active.some(row => connectionReady(row.last_checked_at, row.last_error));
    const status = ready ? 'connected' : active.some(row => row.last_checked_at || row.last_error) ? 'stale' : 'not_connected';
    const names = new Map([...rental, ...utility].map(account => [`${account.kind}:${account.account_key}`, account.account_name]));
    return json({
      mailbox: PAYMENT_MAILBOX, connections: connections.data, ready, status,
      senders: senders.map(sender => ({...sender, accounts: sender.accounts.map(account => ({
        ...account, name: names.get(`${account.kind}:${account.account_key}`) || '',
      }))})),
      scriptUrl: '/payment-mail/sync.gs', manifestUrl: '/payment-mail/appsscript.json',
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requirePaymentMailAdmin();
    if (request.headers.get('origin') !== request.nextUrl.origin) throw new PaymentMailError('Invalid origin', 403);
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      throw new PaymentMailError('Send the connection request as JSON', 415);
    }
    const body = await request.text();
    if (Buffer.byteLength(body) > 1024) throw new PaymentMailError('Connection request is too large', 413);
    const input = mutation.parse(JSON.parse(body));
    const db = createAdminClient();
    const now = new Date();
    if (input.action === 'revoke') {
      const result = await db.from('payment_mail_connections').update({revoked_at: now.toISOString()})
        .eq('id', input.id).is('revoked_at', null);
      if (result.error) throw new PaymentMailError('Unable to revoke the installation key', 503);
      return json({ok: true});
    }
    const token = randomBytes(32).toString('hex');
    const enabledFrom = new Date(now.getTime() - input.lookbackDays * 86_400_000).toISOString();
    const result = await db.from('payment_mail_connections').insert({
      token_hash: hashPaymentMailToken(token), created_by: actor.id, enabled_from: enabledFrom,
    }).select('id').single();
    if (result.error) throw new PaymentMailError('Unable to create the installation key', 503);
    return json({ok: true, token, id: result.data.id, enabledFrom, mailbox: PAYMENT_MAILBOX, origin: request.nextUrl.origin});
  } catch (error) {
    return failure(error);
  }
}
