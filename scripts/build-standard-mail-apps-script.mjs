import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

// Build the Apps Script helper from the same renderer used by Completed emails.
// This file does not contain account credentials and does not send any email.
const root = process.cwd();
const input = readFileSync(resolve(root, 'src/lib/email-layout.ts'), 'utf8');
if (/^import\s/m.test(input)) throw new Error('Bundle new renderer dependencies before rebuilding this helper.');
const script = ts.transpileModule(input.replace(/^export\s+/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2019, module: ts.ModuleKind.None },
}).outputText;
const output = `/* Generated from src/lib/email-layout.ts. Run:
 * node scripts/build-standard-mail-apps-script.mjs
 * Add as a separate file in the existing Apps Script project.
 * Keep all existing triggers, integration code and credentials.
 * This helper formats messages only; it never sends mail itself.
 */
var KLGCR_STANDARD_EMAIL = (function () {
${script}
  function options(message) {
    if (!message || typeof message.subject !== 'string' || typeof message.body !== 'string') {
      throw new Error('Email subject and plain-text body are required.');
    }
    var existing = typeof message.htmlBody === 'string' ? message.htmlBody : '';
    var branded = existing.indexOf('K HOTEL SDN BHD') !== -1 &&
      existing.indexOf('border-top:4px solid #b99a57') !== -1;
    var built = branded ? { text: message.body, html: existing } : buildEmailContent({
      subject: message.subject, text: message.body, html: existing || undefined
    });
    return Object.assign({}, message, {
      body: built.text, htmlBody: built.html,
      name: message.name || 'KLG Campus Residence',
      replyTo: message.replyTo || MANAGEMENT_EMAIL
    });
  }
  return { options: options, render: renderEmailBody };
})();
`;
const path = resolve(root, 'public/email-layout/standard-email.gs');
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('Apps Script email layout is out of date. Rebuild it first.');
  process.stdout.write('Apps Script email layout matches the website renderer.\n');
} else {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, output);
  process.stdout.write('Updated public/email-layout/standard-email.gs\n');
}
