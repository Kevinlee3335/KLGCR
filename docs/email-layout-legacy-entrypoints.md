# Standard layout for existing Apps Script mail senders

Received, Completed and Tenant Not Available in the website already go through
`sendTransactionalEmail` and the shared `src/lib/email-layout.ts` renderer.
Updating the website alone does not change a separate Google Form or Sheet
script that calls `MailApp.sendEmail` directly.

The Received screenshot supplied on 23 November 2026 contains the legacy
48-working-hours wording and lacks the complaint number and submission time
that the current website receipt includes. The associated complaint uses the
`gform-v2` source-reference format. These are evidence of an older sender path;
the live Apps Script source still needs to be inspected to identify its handler.

## Prepared update

`public/email-layout/standard-email.gs` is generated from the exact renderer
used by the website. It formats an existing message without sending it,
changing its recipient or creating another notification.

In the existing Apps Script project, add this helper as a separate source file.
Preserve all existing files, credentials, triggers, integration logic and delivery
deduplication. Inspect the actual Received and Tenant Not Available handlers.
For an existing object-form send, wrap its existing message options:

```js
MailApp.sendEmail(KLGCR_STANDARD_EMAIL.options({
  to: existingRecipient,
  subject: existingSubject,
  body: existingPlainTextBody
}));
```

The variable names above are placeholders for those already used in the live
handler. Existing attachments, CC and other MailApp options may remain in the
object. For positional send calls, move the same existing recipient, subject,
body and options into that object, preserving every original option. Do not
add another send call or rerun a real form submission as a test.

Existing branded website messages must keep their HTML. The helper recognizes
the current standard header and preserves already formatted messages without
wrapping them twice.

Saving a bound form-submit script changes subsequent trigger executions. If
the updated path is in a versioned Web App, update that existing deployment to
the new version while retaining its current execution account, audience and URL.

## Verification and current limit

Run `node scripts/build-standard-mail-apps-script.mjs --check` and the email
tests. The Apps Script tests compare all three email types byte-for-byte with
the website HTML, exercise escaping and confirm that formatting never sends.

The Google sign-in request was cancelled during this task. The live form script
has not been edited or redeployed, and no sample emails have been sent. The
helper is prepared for installation; its presence in this repository does not
mean the legacy sending path has been updated.

Regenerate the helper whenever the shared renderer changes:

```sh
node scripts/build-standard-mail-apps-script.mjs
```
