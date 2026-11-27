import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QuotationPanel } from '@/components/quotation-panel';
import { customerDirectory, initialRegistry } from '@/lib/quotations/model';
import Page from './page';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), read: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.read }) }),
      insert: mocks.insert,
    }),
  }),
}));
vi.mock('@/components/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/components/signature-pad', () => ({ SignaturePad: () => null }));

const registry = initialRegistry();
const initialData = { quotes: registry.quotes, customers: customerDirectory(registry) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireRole.mockResolvedValue({ role: 'admin' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function pageHtml() {
  const { prelude } = await prerender(await Page());
  return new Response(prelude).text();
}

it('checks office access before reading the register and includes existing customers and history in the HTML', async () => {
  mocks.read.mockResolvedValue({ data: { value: registry } });
  const html = await pageHtml();
  expect(mocks.requireRole).toHaveBeenCalledWith(['admin', 'management_viewer']);
  expect(mocks.requireRole.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(html).toContain(registry.quotes[0].number);
  expect(html).toContain(initialData.customers[0].id);
});

it('skips quotation storage when the role check refuses access', async () => {
  mocks.requireRole.mockRejectedValue(Error('Access denied'));
  await expect(Page()).rejects.toThrow('Access denied');
  expect(mocks.read).not.toHaveBeenCalled();
});

it('preserves first-use initialization when another request creates the register concurrently', async () => {
  mocks.read.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: { value: registry } });
  mocks.insert.mockResolvedValue({ error: { code: '23505' } });
  expect(await pageHtml()).toContain(registry.quotes[0].number);
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});

it('reports a failed initial read and lets the user retry without losing form input', async () => {
  mocks.read.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  expect(await pageHtml()).toContain('Unable to load quotations');
  expect(mocks.insert).not.toHaveBeenCalled();
  const request = vi.fn().mockResolvedValue(Response.json(initialData));
  vi.stubGlobal('fetch', request);
  render(<QuotationPanel initialData={null}/>);
  expect(screen.getByRole('button', { name: 'Save Quotation' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Attention'), { target: { value: 'Draft contact' } });
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload quotations' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Quotation' })).toBeEnabled());
  expect(request).toHaveBeenCalledWith('/api/quotations', { cache: 'no-store' });
  expect(screen.getByLabelText('Attention')).toHaveValue('Draft contact');
  expect(screen.queryByText(/Unable to load quotations/)).toBeNull();
});

it('opens and prints the original saved quotation without a client-side register fetch', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  const preview = { document: { title: '', open: vi.fn(), write: vi.fn(), close: vi.fn() } };
  const open = vi.spyOn(window, 'open').mockReturnValue(preview as unknown as Window);
  render(<QuotationPanel initialData={initialData}/>);
  expect(screen.getByLabelText('Select customer')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  expect(screen.getByLabelText('Customer / company name')).toHaveValue(registry.quotes[0].customer);
  fireEvent.click(screen.getByRole('button', { name: 'Print / Save PDF' }));
  expect(open).toHaveBeenCalledWith('', '_blank');
  await waitFor(() => expect(preview.document.write).toHaveBeenCalledWith(expect.stringContaining('QT ' + registry.quotes[0].number)));
  expect(request).not.toHaveBeenCalled();
});
