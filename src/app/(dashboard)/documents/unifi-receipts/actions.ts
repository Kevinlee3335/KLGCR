'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { matchUnifiReceiptToInvoice, unifiReceiptsPath } from '@/lib/unifi-receipts';

export async function linkUnifiPaymentReceipt(form: FormData) {
  const actor = await requireRole(['admin']);
  const parsed = z.object({receipt:z.string().uuid(),invoice:z.string().uuid()}).safeParse({receipt:form.get('receipt'),invoice:form.get('invoice')});
  if (!parsed.success) redirect(`${unifiReceiptsPath}?error=Choose%20an%20invoice.`);
  try { await matchUnifiReceiptToInvoice(parsed.data.receipt,parsed.data.invoice,actor.id); }
  catch (error) { redirect(`${unifiReceiptsPath}?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unable to link receipt.')}`); }
  revalidatePath('/admin'); revalidatePath('/admin/unifi-invoices'); revalidatePath(`/admin/unifi-invoices/${parsed.data.invoice}`);
  revalidatePath(unifiReceiptsPath); redirect(`${unifiReceiptsPath}?saved=1`);
}
