# James-approved billing email

Sender: klgcr.noreply@gmail.com. To: account1@keanlenggroup.com.
CC: klgcr.kevin@gmail.com, klgcr.fikri@gmail.com.

Approval creates a durable dispatch row in the same transaction. The approval API then attempts delivery. No message is sent before a valid James approval and signature exist. Sender/CC capability checks happen before delivery; this workflow does not fall back to another mailbox or provider. The immutable delivery key is reused for all retries, including recovery of an interrupted response.

The attachment is the original signed invoice pack as a self-contained HTML file, including the logo, signature and stored meter evidence. It can be viewed in a browser and printed/saved as PDF. It is not a server-generated PDF attachment.

## Existing Gmail gateway upgrade

Use the existing standalone Gmail gateway Apps Script project signed in as klgcr.noreply@gmail.com. Update only its `doPost` handler and add the constants and helper functions from `public/billing-mail/gateway.gs`. Preserve any form-submit handlers, other functions, project files and installed triggers. Do not overwrite a combined form-intake project wholesale.

The Script Property `KLGCR_GMAIL_WEB_APP_SECRET` must equal the existing Vercel value of the same name. Retain the current shared secret; do not paste it into chat, commit it or expose it in the browser. The update file deliberately contains no secret.

Authorize MailApp sending and account-email access under klgcr.noreply@gmail.com. In Manage deployments, edit the current Web App deployment, choose a new version, Execute as Me (klgcr.noreply@gmail.com), access Anyone. Keep the existing /exec URL so current resident/member mail workflows continue to use it.

Billing → Invoice history → Check Gmail connection checks identity, CC, attachment and duplicate-prevention support without sending a test email. Existing transactional requests (`to`, `subject`, `text`, optional `html`) are supported by the new handler.

Do not substitute a `from` label, Reply-To value, or arbitrary Resend sender for Gmail authorization. The gateway checks the executing Google account before it will send.

## Delivery status

- pending: queued, or delivery has not started.
- blocked: gateway authorization/version is not ready; approval remains valid.
- sending: claimed by an in-flight delivery; stale claims can be checked after two minutes.
- sent: gateway returned a receipt for the exact sender, To, CC and delivery key.
- failed: preparation/rejection prevented a confirmed send.
- uncertain: response interrupted or gateway execution stopped. Use Send / check email to recover the existing receipt, not a new delivery key.

The gateway records `started` before sending and `sent` after success. A stored `started` record is never automatically resent. If it remains uncertain, the operator must inspect the noreply account's Sent mail and Apps Script execution history before any manual repair. Do not delete delivery records blindly.

No old approvals are emailed by the migration. An administrator may explicitly send an already-approved pack from its history row. No real recipient email is sent by the test suite.
