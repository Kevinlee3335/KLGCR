import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {PaymentMailError} from '@/lib/payment-mail/queries';
import {loadReceiptList} from '@/lib/payment-mail/receipt-list';

export const dynamic = 'force-dynamic';
export const preferredRegion = 'sin1';

const params = z.object({
  page: z.coerce.number().int().min(1).max(40_001).default(1),
  q: z.string().trim().max(200).refine(value => !/\p{Cc}/u.test(value)).default(''),
});

export async function GET(req: NextRequest) {
  const headers = {'Cache-Control': 'private, no-store'};
  try {
    const filter = params.parse(Object.fromEntries(req.nextUrl.searchParams));
    return NextResponse.json(await loadReceiptList(filter), {headers});
  } catch (error) {
    if (error instanceof PaymentMailError) {
      return NextResponse.json({error: error.message}, {status: error.status, headers});
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({error: 'Check the Receipt List page number and search text.'}, {status: 400, headers});
    }
    return NextResponse.json({error: 'Unable to load the Receipt List. Please try again.'}, {status: 503, headers});
  }
}
