// One-off deployment check, manually invoked in Preview. Never print secrets or user records.
if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'feature/ai-assistant-v1') {
  console.log('AI_PROBE_SKIPPED_OUTSIDE_TEST_BRANCH'); process.exit(0);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SB_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.GEMINI_API_KEY;
if (!url || !service || !key) { console.log('AI_PROBE_MISSING_CONFIGURATION'); process.exit(0); }
async function db(path, body) {
  const res = await fetch(`${url}/rest/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('ACCOUNTING_UNAVAILABLE'); return res.json();
}
let reservation;
let state = 'probe_failed';
let usage = {};
try {
  const profiles = await db('profiles?select=id&role=eq.admin&is_active=eq.true&deleted_at=is.null&limit=1');
  if (!profiles[0]?.id) throw new Error('NO_ADMIN');
  reservation = await db('rpc/klgcr_ai_reserve', { p_user_id: profiles[0].id });
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply only OK in English.' }] }], generationConfig: { maxOutputTokens: 16, thinkingConfig: { thinkingBudget: 0 } } }), signal: AbortSignal.timeout(30000),
  });
  const json = await res.json(); usage = json.usageMetadata || {};
  const status = String(json.error?.status || 'UNKNOWN').replace(/[^A-Z_]/g, '').slice(0, 50);
  const reason = String(json.error?.details?.find(detail => detail.reason)?.reason || '').replace(/[^A-Z_]/g, '').slice(0, 60);
  state = res.ok && json.candidates?.[0]?.content?.parts?.some(part => part.text?.includes('OK')) ? 'probe_ok' : `probe_${res.status}_${status}_${reason}`;
  console.log(`AI_CONNECTION_CHECK=${state}`);
} catch { console.log('AI_CONNECTION_CHECK=probe_transport_or_accounting_error'); }
finally {
  if (reservation?.id) {
    try { await db('rpc/klgcr_ai_finish', { p_id: reservation.id, p_prompt: usage.promptTokenCount || 0, p_output: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), p_total: usage.totalTokenCount || 0, p_state: state }); } catch { console.log('AI_PROBE_RESERVATION_RETAINED'); }
  }
}
