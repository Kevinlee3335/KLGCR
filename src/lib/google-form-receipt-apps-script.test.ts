import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildEmailContent, MANAGEMENT_EMAIL } from './email-layout';
import { COMMON_EMAIL_FOOTER } from './email';

const source = readFileSync(resolve(process.cwd(), 'docs/google-form-receipt-apps-script.gs'), 'utf8');

function loadScript() {
  const sendEmail = vi.fn();
  const newTrigger = vi.fn();
  const context = { MailApp: { sendEmail }, ScriptApp: { newTrigger } };
  runInNewContext(source, context);
  return { context, sendEmail, newTrigger };
}

describe('live Google Form receipt template', () => {
  it('uses the exact website layout, footer and reply contact for the existing form event', () => {
    const { context, sendEmail, newTrigger } = loadScript();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(newTrigger).not.toHaveBeenCalled();
    Object.assign(context, { event: { namedValues: {
      'EMAIL ADDRESS': [' resident@example.test '], NAME: ['Aisha'], BLOCK: ['A'],
      'ROOM NUMBER / COMMON AREA': ['425'], 'REPORT DESCRIPTION': ['Leaking tap'],
    } } });
    runInNewContext('sendComplaintReceipt(event)', context);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0];
    expect(message).toMatchObject({ to: 'resident@example.test', name: 'KLG Campus Residence', replyTo: MANAGEMENT_EMAIL });
    expect(message.body).toContain('Block: A\nRoom / Area: 425\nIssue: Leaking tap');
    expect(message.body).toContain(COMMON_EMAIL_FOOTER);
    const plainText = message.body.slice(0, message.body.indexOf('\n\nFor any enquiries, simply reply'));
    const expected = buildEmailContent({ subject: message.subject, text: plainText });
    expect(message.body).toBe(expected.text);
    expect(message.htmlBody).toBe(expected.html);
    expect(message.htmlBody).not.toContain('48 working hours');
    expect(newTrigger).not.toHaveBeenCalled();
  });

  it('keeps the legacy aliases and escapes form values in HTML', () => {
    const { context, sendEmail } = loadScript();
    Object.assign(context, { event: { namedValues: {
      'Email Address': ['resident@example.test'], Name: ['A & B'], Block: ['B'],
      'Room Number / Common Area': ['Lobby'], Description: ['<img src=x onerror=alert(1)>'],
    } } });
    runInNewContext('sendComplaintReceipt(event)', context);
    const message = sendEmail.mock.calls[0][0];
    expect(message.htmlBody).toContain('Dear A &amp; B');
    expect(message.htmlBody).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(message.htmlBody).not.toContain('<img');
  });

  it('does not send when no email address was collected', () => {
    const { context, sendEmail } = loadScript();
    Object.assign(context, { event: { namedValues: { NAME: ['Aisha'] } } });
    runInNewContext('sendComplaintReceipt(event)', context);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
