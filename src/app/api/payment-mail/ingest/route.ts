import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {authenticatePaymentMailImporter} from '@/lib/payment-mail/connections';
import {ingestPaymentMail, paymentMailIngestSchema} from '@/lib/payment-mail/ingest';
import {PaymentMailError} from '@/lib/payment-mail/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';
export const maxDuration = 60;

function json(value: unknown, status = 200) {
  return NextResponse.json(value, {status, headers: {'Cache-Control': 'no-store'}});
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization?.match(/^Bearer [a-f0-9]{64}$/)) return json({error: 'Invalid installation key'}, 401);
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return json({error: 'Send import metadata as JSON'}, 415);
    }
    const db = createAdminClient();
    const connection = await authenticatePaymentMailImporter(db, authorization);
    const body = await request.text();
    if (Buffer.byteLength(body) > 900_000) return json({error: 'Import metadata is too large'}, 413);
    const input = paymentMailIngestSchema.parse(JSON.parse(body));
    return json(await ingestPaymentMail(db, connection, input));
  } catch (error) {
    if (error instanceof PaymentMailError) return json({error: error.message}, error.status);
    if (error instanceof SyntaxError || error instanceof z.ZodError) return json({error: 'Invalid import metadata'}, 400);
    console.error('Payment email import failed', error instanceof Error ? error.name : 'database or storage error');
    return json({error: 'Payment email import could not finish. Retry this mailbox check.'}, 503);
  }
}
