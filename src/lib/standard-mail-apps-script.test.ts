// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { renderEmailBody } from './email-layout';
import { complaintReceivedEmail, jobCompletedEmail, tenantNotAvailableEmail } from './email';

type Mail = { subject: string; body: string; htmlBody?: string; [key: string]: unknown };
function helper() {
  const sendEmail = vi.fn();
  const context = { MailApp: { sendEmail }, KLGCR_STANDARD_EMAIL: undefined as unknown as {
    options: (message: Mail) => Mail; render: typeof renderEmailBody;
  } };
  runInNewContext(readFileSync('public/email-layout/standard-email.gs', 'utf8'), context);
  expect(sendEmail).not.toHaveBeenCalled();
  return context.KLGCR_STANDARD_EMAIL;
}

const complaint = { reporterName: 'Sample Resident', complaintNo: 'SAMPLE-001', roomNo: 'B118', description: 'Bathroom door cannot close & lock' };
const messages = [
  complaintReceivedEmail({ ...complaint, submittedAt: '2026-11-23T05:00:00Z' }),
  jobCompletedEmail({ ...complaint, completedAt: '2026-11-23T05:00:00Z' }),
  tenantNotAvailableEmail({ ...complaint, appointmentDate: '2026-11-23', appointmentTime: '13:00', attendedAt: '2026-11-23T05:00:00Z' }),
];

describe('legacy Apps Script email layout', () => {
  it.each(messages)('formats $subject exactly like the website Completed renderer', message => {
    const mail = helper().options({ to: 'example@example.test', subject: message.subject, body: message.text });
    expect(mail.htmlBody).toBe(renderEmailBody(message));
    expect(mail.htmlBody).toContain('border-top:4px solid #b99a57');
    expect(mail.replyTo).toBe('klgresidenceenquiry@gmail.com');
    expect(mail.name).toBe('KLG Campus Residence');
    expect(mail.htmlBody?.match(/KLG Campus Residence Management(?=<)/g)).toHaveLength(1);
  });
  it('escapes legacy form answers without changing the recipient, subject or attachments', () => {
    const attachment = { name: 'original.pdf' };
    const message = { to: 'example@example.test', cc: 'copy@example.test', subject: 'Received <sample>', body: 'Dear A & B,\n\nIssue: <script>unsafe</script>', attachments: [attachment] };
    const mail = helper().options(message);
    expect(mail.to).toBe(message.to); expect(mail.cc).toBe(message.cc); expect(mail.subject).toBe(message.subject);
    expect(mail.attachments).toBe(message.attachments);
    expect(mail.htmlBody).toContain('A &amp; B'); expect(mail.htmlBody).toContain('&lt;script&gt;');
    expect(mail.htmlBody).not.toContain('<script>');
  });
  it('does not wrap an already branded email a second time', () => {
    const standard = helper();
    const first = standard.options({ subject: messages[0].subject, body: messages[0].text });
    const second = standard.options(first);
    expect(second.htmlBody).toBe(first.htmlBody); expect(second.body).toBe(first.body);
  });
  it('does not change the wording or status of a tenant-unavailable notice', () => {
    const message = messages[2];
    const mail = helper().options({ subject: message.subject, body: message.text });
    expect(mail.htmlBody).toContain('Maintenance Visit – Tenant Not Available');
    expect(mail.htmlBody).toContain('no one was available');
    expect(mail.htmlBody).not.toContain('Your maintenance request has been completed.');
  });
});
