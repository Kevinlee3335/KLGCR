import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {
  loadPaymentMailDetail, loadPaymentMailList, paymentMailProofUrl, PaymentMailError, requirePaymentMailAdmin,
} from '@/lib/payment-mail/queries';
import {paymentMailStatuses} from '@/lib/payment-mail/types';
import {paymentMailActionSchema, rejectPaymentMail, resendPaymentMailReceipt, verifyPaymentMail} from '@/lib/payment-mail/verify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';
export const maxDuration = 60;

const json = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'no-store'}});
function failure(error: unknown) {
  if (error instanceof PaymentMailError) return json({error: error.message}, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error: 'Check the payment details and required confirmations'}, 400);
  return json({error: 'Unable to load or save payment emails. Please retry.'}, 503);
}

export async function GET(req: NextRequest) {
  try {
    await requirePaymentMailAdmin();
    const params = req.nextUrl.searchParams;
    if (params.has('id')) {
      const id = z.string().uuid().parse(params.get('id'));
      if (params.has('proof')) {
        const proofId = z.string().uuid().parse(params.get('proof'));
        return NextResponse.redirect(await paymentMailProofUrl(id, proofId), {headers: {'Cache-Control': 'no-store'}});
      }
      const company = params.has('company') ? z.string().max(254).parse(params.get('company')) : undefined;
      return json(await loadPaymentMailDetail(id, company));
    }
    const filter = z.object({
      status: z.enum(['pending', 'all', ...paymentMailStatuses]).default('pending'),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
    }).parse(Object.fromEntries(params));
    return json(await loadPaymentMailList(filter));
  } catch (error) { return failure(error); }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requirePaymentMailAdmin();
    if (req.headers.get('origin') !== req.nextUrl.origin) throw new PaymentMailError('Invalid origin', 403);
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      throw new PaymentMailError('Send payment verification as JSON', 415);
    }
    const body = await req.text();
    if (Buffer.byteLength(body, 'utf8') > 100_000) throw new PaymentMailError('Payment request is too large', 413);
    const input = paymentMailActionSchema.parse(JSON.parse(body));
    if (input.action === 'verify') return json(await verifyPaymentMail(actor.id, input));
    if (input.action === 'reject') return json(await rejectPaymentMail(actor.id, input.id, input.reason));
    return json(await resendPaymentMailReceipt(input.id));
  } catch (error) { return failure(error); }
}
