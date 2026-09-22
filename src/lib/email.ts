export const COMMON_EMAIL_FOOTER = `KLG Campus Residence Management

Management Office Contact
Email: klgresidenceenquiry@gmail.com
WhatsApp: 012-791 3988

Operating Hours
Monday – Friday: 9:00 AM – 5:00 PM
Saturday: 9:00 AM – 1:00 PM
Sunday & Public Holidays: Closed`;

type ComplaintEmail = { reporterName?: string | null; complaintNo: string; roomNo: string; description: string };

export type CompletedJobEmail = ComplaintEmail & {
  completedAt: string;
  ratingUrl: string;
};

type TransactionalMessage = { subject: string; text: string; html?: string };

const malaysiaDateFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const malaysiaTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kuala_Lumpur",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatMalaysiaDate(value: string) {
  // A scheduled date has no time zone. Add noon UTC so the calendar date cannot shift.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? value : malaysiaDateFormatter.format(date);
}

function formatMalaysiaTime(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function formatMalaysiaDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : `${malaysiaDateFormatter.format(date)}, ${malaysiaTimeFormatter.format(date)} (Malaysia Time)`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character);
}

export function complaintReceivedEmail(input: ComplaintEmail & { submittedAt: string }) {
  return {
    subject: "Maintenance Request Received – KLG Campus Residence",
    text: `Dear ${input.reporterName?.trim() || "Resident"},

We have successfully received your maintenance request.

Complaint No.: ${input.complaintNo}
Room: ${input.roomNo}
Issue: ${input.description}
Submitted Date & Time: ${formatMalaysiaDateTime(input.submittedAt)}

Our maintenance team will review your request and attend to it as soon as possible.

If further information or an appointment is required, our Management Office will contact you.

Thank you for your patience and cooperation.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
  };
}

export function tenantNotAvailableEmail(input: ComplaintEmail & { appointmentDate: string; appointmentTime: string; attendedAt: string }) {
  return {
    subject: "Maintenance Visit – Tenant Not Available",
    text: `Dear ${input.reporterName?.trim() || "Resident"},

Our maintenance staff attended your room for the scheduled maintenance visit. However, no one was available at the time of attendance.

Complaint No.: ${input.complaintNo}
Room: ${input.roomNo}
Issue: ${input.description}
Scheduled Date: ${formatMalaysiaDate(input.appointmentDate)}
Scheduled Time: ${formatMalaysiaTime(input.appointmentTime)}
Maintenance Attendance Time: ${formatMalaysiaDateTime(input.attendedAt)}

Please contact the KLG Campus Residence Management Office to arrange a new maintenance date and time.

Thank you for your cooperation.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
  };
}

export function jobCompletedEmail(input: CompletedJobEmail) {
  const completedAt = formatMalaysiaDateTime(input.completedAt);
  const starLinks = [1, 2, 3, 4, 5].map((rating) => {
    const href = `${input.ratingUrl}?rating=${rating}`;
    return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 5px 8px 0;padding:10px 13px;border-radius:7px;background:#d4af37;color:#18150d;text-decoration:none;font-size:23px;font-weight:700;line-height:1" aria-label="Rate ${rating} out of 5 stars">${"★".repeat(rating)}<span style="font-size:13px;vertical-align:middle;margin-left:6px">${rating}</span></a>`;
  }).join("");
  return {
    subject: "Maintenance Request Completed – KLG Campus Residence",
    text: `Dear ${input.reporterName?.trim() || "Resident"},

Your maintenance request has been completed.

Complaint No.: ${input.complaintNo}
Room / Area: ${input.roomNo}
Issue: ${input.description}
Completed On: ${completedAt}

We would appreciate your feedback on the service provided.

Please select a rating from 1 to 5 stars in this email.

Thank you for your feedback and cooperation.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
    html: `<div style="font-family:Arial,sans-serif;color:#222;line-height:1.55;max-width:640px">
<p>Dear ${escapeHtml(input.reporterName?.trim() || "Resident")},</p>
<p>Your maintenance request has been completed.</p>
<p><strong>Complaint No.:</strong> ${escapeHtml(input.complaintNo)}<br>
<strong>Room / Area:</strong> ${escapeHtml(input.roomNo)}<br>
<strong>Issue:</strong> ${escapeHtml(input.description)}<br>
<strong>Completed On:</strong> ${escapeHtml(completedAt)}</p>
<p>We would appreciate your feedback on the service provided. Please select a rating below:</p>
<p>${starLinks}</p>
<p style="font-size:13px;color:#666">Clicking a star opens a secure page to confirm and record that rating.</p>
<p>Thank you for your feedback and cooperation.</p>
<p>Best regards,<br>KLG Campus Residence Management</p>
<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;color:#444">${escapeHtml(COMMON_EMAIL_FOOTER)}</pre>
</div>`,
  };
}

/** Best-effort server-side delivery. Transactional workflows never depend on email delivery. */
export async function sendTransactionalEmail(to: string | null | undefined, message: TransactionalMessage) {
  if (!to?.trim()) return { sent: false as const, reason: "disabled_or_missing_recipient" as const };
  const gmailEndpoint = process.env.KLGCR_GMAIL_WEB_APP_URL;
  const gmailSecret = process.env.KLGCR_GMAIL_WEB_APP_SECRET;
  if (gmailEndpoint && gmailSecret) {
    try {
      const response = await fetch(gmailEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: gmailSecret, to: to.trim(), subject: message.subject, text: message.text, html: message.html || null }),
      });
      if (!response.ok) throw new Error(`Gmail gateway returned ${response.status}: ${await response.text()}`);
      return { sent: true as const };
    } catch (error) {
      console.error("Gmail gateway delivery failed", error);
      return { sent: false as const, reason: "delivery_failed" as const };
    }
  }
  if (process.env.KLGCR_EMAIL_ENABLED !== "true") return { sent: false as const, reason: "disabled_or_missing_recipient" as const };
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.KLGCR_EMAIL_FROM;
  if (!apiKey || !from) {
    console.error("Email enabled but RESEND_API_KEY or KLGCR_EMAIL_FROM is missing");
    return { sent: false as const, reason: "missing_configuration" as const };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to.trim()], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
    return { sent: true as const };
  } catch (error) {
    console.error("Transactional email delivery failed", error);
    return { sent: false as const, reason: "delivery_failed" as const };
  }
}
