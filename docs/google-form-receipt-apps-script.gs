// Existing standalone Google Form receipt project.
// Save in Code.gs. Its existing Head/on-form-submit trigger uses saved code.
// Do not run setupAutoReply again: the receipt trigger already exists.
// Keep this receipt-only project separate from docs/google-form-apps-script.gs.
function myFunction() {
}

// Preserve the existing RESPONSE_SHEET_URL value when updating the live project.
// The repository copy deliberately omits private Google resource identifiers.
const RESPONSE_SHEET_URL = 'PASTE_EXISTING_RESPONSE_SHEET_URL';

function setupAutoReply() {
  const spreadsheet = SpreadsheetApp.openByUrl(RESPONSE_SHEET_URL);
  ScriptApp.newTrigger('sendComplaintReceipt')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();
}

function sendComplaintReceipt(e) {
  const data = e.namedValues || {};
  const getValue = (...names) => {
    for (const name of names) {
      if (data[name] && data[name][0]) {
        return String(data[name][0]).trim();
      }
    }
    return '';
  };

  const email = getValue('EMAIL ADDRESS', 'Email Address', 'EMAIL');
  if (!email) return;
  const name = getValue('NAME', 'Name') || 'Resident';
  const block = getValue('BLOCK', 'Block');
  const room = getValue('ROOM NUMBER / COMMON AREA', 'Room Number / Common Area');
  const issue = getValue('REPORT DESCRIPTION', 'Report Description', 'Description');
  const subject = 'Maintenance Request Received – KLG Campus Residence';
  const text = `Dear ${name},

We have successfully received your maintenance request.

Block: ${block}
Room / Area: ${room}
Issue: ${issue}

Our maintenance team will review your request and attend to it as soon as possible.

If further information or an appointment is required, our Management Office will contact you.

Thank you for your patience and cooperation.

Best regards,
KLG Campus Residence Management

Management Office Contact
Email: ${MANAGEMENT_EMAIL}
WhatsApp: 012-791 3988

Operating Hours
Monday – Friday: 9:00 AM – 5:00 PM
Saturday: 9:00 AM – 1:00 PM
Sunday & Public Holidays: Closed`;
  const content = buildEmailContent({ subject: subject, text: text });
  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: content.text,
    htmlBody: content.html,
    name: 'KLG Campus Residence',
    replyTo: MANAGEMENT_EMAIL
  });
}

// The shared website layout is appended below; parity is checked in
// src/lib/google-form-receipt-apps-script.test.ts.

const MANAGEMENT_EMAIL = "klgresidenceenquiry@gmail.com";
const REPLY_INSTRUCTIONS = "For any enquiries, simply reply to this email. Your reply will go directly to our Management Office.";
function appendReplyInstructions(text) {
    return `${text}\n\n${REPLY_INSTRUCTIONS} You can also email ${MANAGEMENT_EMAIL}.`;
}
/** Gmail / Outlook safe email body. Printable invoice pages belong in attachments. */
function renderEmailBody(input) {
    const esc = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const p = 'margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#30343b;overflow-wrap:anywhere;word-break:break-word';
    // Never embed browser print documents, SVG templates or their CSS in Gmail.
    const fragment = input.html && !/<!doctype|<(?:html|head|body|style|script|svg|section|iframe|object|form|button)\b/i.test(input.html) ? input.html : null;
    const body = fragment
        ? fragment.replace(/<p>/gi, `<p style="${p}">`).replace(/<img\b/gi, '<img style="max-width:100%;height:auto;border:0"')
        : input.text.trim().split(/\n\s*\n/).map(block => `<p style="${p}">${esc(block).replace(/\n/g, '<br>')}</p>`).join('');
    const title = input.subject.replace(/^\[TEST[^\]]*\]\s*/i, '');
    const isTest = /^\[TEST/i.test(input.subject);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f4f6;border-collapse:collapse"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e4e8;border-collapse:collapse"><tr><td style="padding:24px;background:#171b22;border-top:4px solid #b99a57"><div style="font:11px Arial,Helvetica,sans-serif;letter-spacing:2px;color:#d5b873">K HOTEL SDN BHD</div><div style="margin-top:8px;font:bold 20px Arial,Helvetica,sans-serif;color:#ffffff">KLG Campus Residence</div></td></tr><tr><td style="padding:28px 24px 10px">${isTest ? '<p style="margin:0 0 18px;font:bold 11px Arial,Helvetica,sans-serif;letter-spacing:1px;color:#8a631e">TEST SAMPLE · FOR REVIEW ONLY</p>' : ''}<h1 style="margin:0 0 24px;font:bold 21px Arial,Helvetica,sans-serif;line-height:1.4;color:#171b22">${esc(title)}</h1>${body}</td></tr><tr><td style="padding:18px 24px;background:#fafafa;border-top:1px solid #e8e8e8;font:11px Arial,Helvetica,sans-serif;line-height:1.7;color:#727780">KLG Campus Residence · Management Office<br>Sent from klgcr.noreply@gmail.com<br>${REPLY_INSTRUCTIONS}<br><a href="mailto:${MANAGEMENT_EMAIL}" style="color:#544018">${MANAGEMENT_EMAIL}</a> · 012-791 3988</td></tr></table></td></tr></table>`;
}
function buildEmailContent(message) {
    return {
        text: appendReplyInstructions(message.text),
        html: renderEmailBody(message),
    };
}
