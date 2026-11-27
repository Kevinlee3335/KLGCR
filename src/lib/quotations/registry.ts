import { createClient } from '@/lib/supabase/server';
import { initialRegistry, type Registry } from './model';

export async function loadQuotationRegistry(): Promise<Registry> {
  const db = await createClient();
  const row = () => db.from('quotation_registry').select('value').eq('id', 1).maybeSingle();
  const existing = await row();
  if (existing.error) throw Error('Quotation storage is unavailable');
  if (existing.data) return existing.data.value as Registry;

  const seed = await db.from('quotation_registry').insert({ id: 1, value: initialRegistry() });
  if (seed.error && seed.error.code !== '23505') throw Error('Unable to initialize quotations');
  const initialized = await row();
  if (initialized.error || !initialized.data) throw Error('Unable to load quotations');
  return initialized.data.value as Registry;
}
