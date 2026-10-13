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
  const modelResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  const modelData = await modelResponse.json();
  const models = (modelData.models || []).filter(model => model.supportedGenerationMethods?.includes('generateContent')).map(model => model.name).filter(name => /^models\/gemini-[a-z0-9.-]+$/.test(name));
  if (!models.length) { state = `probe_model_list_${modelResponse.status}`; throw new Error('NO_MODELS'); }
  state = `available_models:${models.filter(name => name.includes('flash')).slice(0, 15).join(',')}`;
  console.log(`AI_AVAILABLE_MODELS=${models.filter(name => name.includes('flash')).slice(0, 15).join(',')}`);
  const chosen = ['models/gemini-3.5-flash-lite', 'models/gemini-3.1-flash-lite', 'models/gemini-3.6-flash'].find(name => models.includes(name));
  if (!chosen) throw new Error('NO_FLASH_MODEL');
  const [complaints, jobs, tasks, inventory] = await Promise.all([
    db('complaints?select=status&limit=500'),
    db('maintenance_jobs?select=status&limit=500'),
    db('admin_daily_tasks?select=task_date,status&limit=500'),
    db('inventory_items?select=balance_qty,reorder_level&is_active=eq.true&limit=1000'),
  ]);
  const totals = { complaints: complaints.length, maintenanceJobs: jobs.length, dailyTasks: tasks.length, inventoryItems: inventory.length, lowStock: inventory.filter(row => Number(row.balance_qty) <= Number(row.reorder_level)).length };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${chosen}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `Read-only verification. Return only the exact JSON object supplied here, with numeric values unchanged: ${JSON.stringify(totals)}` }] }], generationConfig: { maxOutputTokens: 256 } }), signal: AbortSignal.timeout(30000),
  });
  const json = await res.json(); usage = json.usageMetadata || {};
  const status = String(json.error?.status || 'UNKNOWN').replace(/[^A-Z_]/g, '').slice(0, 50);
  const reason = String(json.error?.details?.find(detail => detail.reason)?.reason || '').replace(/[^A-Z_]/g, '').slice(0, 60);
  const answer = json.candidates?.[0]?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('') || '';
  let matches = false;
  try { const returned = JSON.parse(answer.match(/\{[\s\S]*\}/)?.[0] || 'null'); matches = returned && Object.entries(totals).every(([name, value]) => returned[name] === value); } catch {}
  state = res.ok && matches ? `probe_data_ok:${chosen}` : `probe_${res.status}_${status}_${reason}:${chosen}`;
  console.log(`AI_CONNECTION_CHECK=${state}`);
} catch { console.log('AI_CONNECTION_CHECK=probe_transport_or_accounting_error'); }
finally {
  if (reservation?.id) {
    try { await db('rpc/klgcr_ai_finish', { p_id: reservation.id, p_prompt: usage.promptTokenCount || 0, p_output: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), p_total: usage.totalTokenCount || 0, p_state: state }); } catch { console.log('AI_PROBE_RESERVATION_RETAINED'); }
  }
}
