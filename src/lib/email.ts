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

export function complaintReceivedEmail(input: ComplaintEmail & { submittedAt: string }) {
  return {
    subject: "Maintenance Request Received – KLG Campus Residence",
    text: `Dear ${input.reporterName?.trim() || "Resident"},

We have successfully received your maintenance request.

Complaint No.: ${input.complaintNo}
Room: ${input.roomNo}
Issue: ${input.description}
Submitted Date & Time: ${input.submittedAt}

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
Scheduled Date: ${input.appointmentDate}
Scheduled Time: ${input.appointmentTime}
Maintenance Attendance Time: ${input.attendedAt}

Please contact the KLG Campus Residence Management Office to arrange a new maintenance date and time.

Thank you for your cooperation.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
  };
}

export function jobCompletedEmail(input: CompletedJobEmail) {
  return {
    subject: "Maintenance Request Completed – KLG Campus Residence",
    text: `Dear ${input.reporterName?.trim() || "Resident"},

Your maintenance request has been completed.

Complaint No.: ${input.complaintNo}
Room / Area: ${input.roomNo}
Issue: ${input.description}
Completed On: ${input.completedAt}

We would appreciate your feedback on the service provided.

Rate our service from 1 to 5 stars:
${input.ratingUrl}

Thank you for your feedback and cooperation.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
  };
}

/** Best-effort server-side delivery. Transactional workflows never depend on email delivery. */
export async function sendTransactionalEmail(to: string | null | undefined, message: { subject: string; text: string }) {
  if (!to?.trim()) return { sent: false as const, reason: "disabled_or_missing_recipient" as const };
  const gmailEndpoint = process.env.KLGCR_GMAIL_WEB_APP_URL;
  const gmailSecret = process.env.KLGCR_GMAIL_WEB_APP_SECRET;
  if (gmailEndpoint && gmailSecret) {
    try {
      const response = await fetch(gmailEndpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: gmailSecret, to: to.trim(), subject: message.subject, text: message.text }),
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
      body: JSON.stringify({ from, to: [to.trim()], subject: message.subject, text: message.text }),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
    return { sent: true as const };
  } catch (error) {
    console.error("Transactional email delivery failed", error);
    return { sent: false as const, reason: "delivery_failed" as const };
  }
}
