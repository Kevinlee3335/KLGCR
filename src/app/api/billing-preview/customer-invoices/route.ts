import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {getSessionProfile} from '@/lib/auth';
import {billingPreviewEnabled, monthSchema} from '@/lib/billing-preview';
import {
  CustomerInvoiceError, customerInvoiceDraftSchema, deleteCustomerInvoiceDraft, dispatchCustomerInvoice,
  loadCustomerInvoiceCatalog, maxCustomerInvoiceUpload, openCustomerInvoicePdf, saveCustomerInvoiceDraft,
} from '@/lib/billing-customer-invoices';

export const runtime = 'nodejs';
export const maxDuration = 60;

const idSchema = z.string().uuid();
const requestSchema = z.object({action: z.enum(['send', 'discard']), id: idSchema});
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const json = (data: unknown, status = 200) => NextResponse.json(data, {status, headers});

async function requireAdmin() {
  const profile = await getSessionProfile();
  if (!billingPreviewEnabled() || profile?.role !== 'admin') throw new CustomerInvoiceError('Administrator access required.', 403);
  return profile;
}

function errorResponse(error: unknown) {
  if (error instanceof CustomerInvoiceError) return json({error: error.message}, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({error: 'Check the selected invoices, page numbers and company email.'}, 400);
  console.error('Customer invoice package request failed', error);
  return json({error: 'Unable to process the customer invoice package. Check the saved package list before retrying.'}, 503);
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const params = req.nextUrl.searchParams;
    if (params.has('pdf')) {
      const link = await openCustomerInvoicePdf(idSchema.parse(params.get('pdf')));
      return NextResponse.redirect(link, {headers});
    }
    return json(await loadCustomerInvoiceCatalog(monthSchema.parse(params.get('period'))));
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    if (req.headers.get('origin') !== req.nextUrl.origin) throw new CustomerInvoiceError('Invalid origin.', 403);
    if (req.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const size = Number(req.headers.get('content-length') || 0);
      if (size > maxCustomerInvoiceUpload + 50_000) throw new CustomerInvoiceError('Keep the Accounts PDF upload under 4 MB.', 413);
      const data = await req.formData();
      const first = data.get('source');
      const second = data.get('utilitySource');
      if (!(first instanceof File) || !first.size) throw new CustomerInvoiceError('Choose the Accounts PDF.');
      const input = customerInvoiceDraftSchema.parse(JSON.parse(String(data.get('mapping'))));
      return json(await saveCustomerInvoiceDraft(input, first, second instanceof File && second.size ? second : null, admin.id), 201);
    }
    const {action, id} = requestSchema.parse(await req.json());
    if (action === 'discard') {
      await deleteCustomerInvoiceDraft(id);
      return json({ok: true});
    }
    return json(await dispatchCustomerInvoice(id, admin.id));
  } catch (error) { return errorResponse(error); }
}
