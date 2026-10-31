/** Gmail / Outlook safe email body. Printable invoice pages belong in attachments. */
export function renderEmailBody(input: {subject:string;text:string;html?:string}) {
  const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
  const p='margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#30343b;overflow-wrap:anywhere;word-break:break-word';
  // Never embed browser print documents, SVG templates or their CSS in Gmail.
  const fragment=input.html&&!/<!doctype|<(?:html|head|body|style|script|svg|section|iframe|object|form|button)\b/i.test(input.html)?input.html:null;
  const body=fragment
    ?fragment.replace(/<p>/gi,`<p style="${p}">`).replace(/<img\b/gi,'<img style="max-width:100%;height:auto;border:0"')
    :input.text.trim().split(/\n\s*\n/).map(block=>`<p style="${p}">${esc(block).replace(/\n/g,'<br>')}</p>`).join('');
  const title=input.subject.replace(/^\[TEST[^\]]*\]\s*/i,'');
  const isTest=/^\[TEST/i.test(input.subject);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f3f4f6;border-collapse:collapse"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e2e4e8;border-collapse:collapse"><tr><td style="padding:24px;background:#171b22;border-top:4px solid #b99a57"><div style="font:11px Arial,Helvetica,sans-serif;letter-spacing:2px;color:#d5b873">K HOTEL SDN BHD</div><div style="margin-top:8px;font:bold 20px Arial,Helvetica,sans-serif;color:#ffffff">KLG Campus Residence</div></td></tr><tr><td style="padding:28px 24px 10px">${isTest?'<p style="margin:0 0 18px;font:bold 11px Arial,Helvetica,sans-serif;letter-spacing:1px;color:#8a631e">TEST SAMPLE · FOR REVIEW ONLY</p>':''}<h1 style="margin:0 0 24px;font:bold 21px Arial,Helvetica,sans-serif;line-height:1.4;color:#171b22">${esc(title)}</h1>${body}</td></tr><tr><td style="padding:18px 24px;background:#fafafa;border-top:1px solid #e8e8e8;font:11px Arial,Helvetica,sans-serif;line-height:1.7;color:#727780">KLG Campus Residence · Management Office<br>Sent from klgcr.noreply@gmail.com<br>For enquiries: klgresidenceenquiry@gmail.com · 012-791 3988</td></tr></table></td></tr></table>`;
}
