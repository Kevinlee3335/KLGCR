import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, it, vi} from 'vitest';
import {aggregatePaymentExtractions, extractPaymentText} from './extract';
import {paymentMailIngestSchema} from './ingest';

const mailbox = 'klgresidenceenquiry@gmail.com';
const token = 'a'.repeat(64);
const sender = 'accounts@example.test';
const pdf = Buffer.from('%PDF-1.7 example');
const id = 'e112233';
const setup = {connectionId: 'installation', enabledFrom: '2026-11-10T00:00:00.000Z', senders: [sender]};
const program = readFileSync('public/payment-mail/sync.gs', 'utf8');

function script(settings = setup) {
  const now = Date.parse('2026-11-10T04:00:00.000Z');
  const properties = new Map([
    ['KLGCR_PAYMENT_MAIL_ORIGIN', 'https://klgcr.example.test'], ['KLGCR_PAYMENT_MAIL_TOKEN', token],
  ]);
  const endpoint = vi.fn((input: {op: string}) => {
    if (input.op === 'config') return settings;
    if (input.op === 'prepare') return {uploadUrl: 'https://storage.example.test/upload?token=signature'};
    if (input.op === 'message') return {done: false, finishedPartIds: [] as string[]};
    return {done: true};
  });
  const upload = vi.fn();
  const list = vi.fn(() => ({messages: [{id}]}));
  const get = vi.fn(() => ({
    threadId: 'e223344', internalDate: String(now - 120_000),
    payload: {headers: [{name: 'From', value: `Finance <${sender}>`}, {name: 'Subject', value: 'Payment advice'}],
      parts: [
        {mimeType: 'text/plain', body: {data: Buffer.from('Payment advice attached.').toString('base64url')}},
        {partId: '1', filename: 'proof.pdf', mimeType: 'application/pdf', body: {size: pdf.length, attachmentId: 'part-id'}},
        {partId: '2', filename: 'signature.png', mimeType: 'image/png', headers: [{name: 'Content-Disposition', value: 'inline'}], body: {size: 100}},
      ]},
  }));
  const profile = vi.fn(() => ({emailAddress: mailbox}));
  const trigger = {timeBased: vi.fn(), everyMinutes: vi.fn(), create: vi.fn()};
  trigger.timeBased.mockReturnValue(trigger);
  trigger.everyMinutes.mockReturnValue(trigger);
  const released = vi.fn();
  const context = {
    Date: class extends Date { static now() { return now; } },
    PropertiesService: {getScriptProperties: () => ({
      getProperty: (key: string) => properties.get(key),
      setProperty: (key: string, value: string) => properties.set(key, value),
    })},
    Gmail: {Users: {getProfile: profile, Messages: {list, get}}},
    ScriptApp: {getOAuthToken: () => 'google-read-only', getProjectTriggers: () => [], newTrigger: vi.fn(() => trigger)},
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock: released})},
    Utilities: {
      newBlob: (data: string | number[]) => {
        const blob = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
        return {getBytes: () => [...blob], getDataAsString: () => blob.toString('utf8')};
      },
      base64Decode: (text: string) => [...Buffer.from(text, 'base64')],
      computeDigest: (_type: string, bytes: number[]) => [...createHash('sha256').update(Buffer.from(bytes)).digest()],
      DigestAlgorithm: {SHA_256: 'sha256'},
    },
    UrlFetchApp: {fetch: (url: string, options: {headers: {Authorization?: string}; payload?: string | number[]}) => {
      if (url.startsWith('https://gmail.googleapis.com/')) {
        expect(options.headers.Authorization).toBe('Bearer google-read-only');
        return response(200, {data: pdf.toString('base64url')});
      }
      if (url.startsWith('https://storage.example.test/')) {
        expect(options.headers.Authorization).toBeUndefined();
        upload(Buffer.from(options.payload as number[]));
        return response(200, {});
      }
      expect(url).toBe('https://klgcr.example.test/api/payment-mail/ingest');
      expect(options.headers.Authorization).toBe(`Bearer ${token}`);
      const payload = JSON.parse(options.payload as string);
      expect(paymentMailIngestSchema.safeParse(payload).success).toBe(true);
      return response(200, endpoint(payload));
    }},
  };
  runInNewContext(program, context);
  return {...context as typeof context & {installPaymentMail: () => void; syncPaymentMail: () => void},
    properties, endpoint, upload, list, get, profile, trigger, released};
}

function response(code: number, result: object) {
  return {getResponseCode: () => code, getContentText: () => JSON.stringify(result)};
}

describe('payment email importer script', () => {
  it('uses Gmail read-only, checks only registered senders and sends proof bytes directly to private storage', () => {
    const manifest = JSON.parse(readFileSync('public/payment-mail/appsscript.json', 'utf8'));
    expect(manifest.oauthScopes.filter((scope: string) => scope.includes('gmail'))).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);
    const state = script();
    state.installPaymentMail();
    expect(state.trigger.everyMinutes).toHaveBeenCalledWith(15);
    expect(state.list).toHaveBeenCalledWith('me', expect.objectContaining({q: expect.stringContaining(`from:"${sender}"`)}));
    expect(state.endpoint.mock.calls.map(([data]) => data.op)).toEqual(['config', 'message', 'prepare', 'complete', 'finalize', 'heartbeat']);
    expect(state.endpoint).toHaveBeenCalledWith(expect.objectContaining({op: 'message', partIds: ['1']}));
    expect(state.endpoint).toHaveBeenCalledWith(expect.objectContaining({op: 'complete',
      file: expect.objectContaining({mimeType: 'application/pdf', hash: createHash('sha256').update(pdf).digest('hex')}),
    }));
    expect(state.upload).toHaveBeenCalledExactlyOnceWith(pdf);
  });

  it('keeps the cursor after a failed transfer and resumes without fetching an already saved proof', () => {
    const state = script();
    state.upload.mockImplementationOnce(() => { throw new Error('Temporary storage outage'); });
    expect(() => state.syncPaymentMail()).toThrow('Temporary storage outage');
    expect(state.endpoint).not.toHaveBeenCalledWith(expect.objectContaining({op: 'finalize'}));
    const cursor = JSON.parse(state.properties.get('KLGCR_PAYMENT_MAIL_CURSOR')!);
    expect(cursor.senderIndex).toBe(0);
    expect(state.released).toHaveBeenCalledOnce();
    state.endpoint.mockImplementation(input => {
      if (input.op === 'config') return setup;
      if (input.op === 'message') return {done: false, finishedPartIds: ['1']};
      return {done: true};
    });
    state.syncPaymentMail();
    expect(state.upload).toHaveBeenCalledTimes(1);
    expect(state.endpoint).toHaveBeenCalledWith(expect.objectContaining({op: 'finalize', issues: []}));
    expect(state.endpoint).toHaveBeenLastCalledWith(expect.objectContaining({op: 'heartbeat', state: 'ok'}));
  });

  it('starts a November catch-up at the Malaysia-time boundary', () => {
    const enabledFrom = '2026-10-31T16:00:00.000Z';
    const state = script({...setup, enabledFrom});
    state.syncPaymentMail();
    expect(state.list).toHaveBeenCalledWith('me', expect.objectContaining({
      q: expect.stringContaining(`after:${Date.parse(enabledFrom) / 1000 - 1} `),
    }));
    expect(state.endpoint).toHaveBeenCalledWith(expect.objectContaining({op: 'finalize'}));
  });

  it('rejects installation in another Gmail mailbox', () => {
    const state = script();
    state.profile.mockReturnValue({emailAddress: 'other@example.test'});
    expect(() => state.installPaymentMail()).toThrow(`Use ${mailbox}`);
    expect(state.endpoint).not.toHaveBeenCalled();
  });
});

it('extracts unpunctuated reference IDs and never counts a failed transfer as ready', () => {
  const proof = extractPaymentText('Transfer receipt 8 Nov 2026 Status: Success Amount RM 150.00 Reference ID FT1234567');
  expect(proof).toMatchObject({classification: 'payment_proof', amount: 150, paidOn: '2026-11-08', reference: 'FT1234567', bankStatus: 'successful'});
  expect(aggregatePaymentExtractions([proof], 'Please see the payment advice.').status).toBe('pending_verification');
  const failed = extractPaymentText('Transfer receipt 8 Nov 2026 Status: failed Amount RM 150.00 Reference ID FT1234567');
  expect(aggregatePaymentExtractions([failed], 'Please see the payment advice.').status).toBe('needs_review');
  expect(aggregatePaymentExtractions([extractPaymentText('Tax invoice IN-123. Amount due RM 150.00.')], 'Attached invoice.').status).toBe('ignored');
});
