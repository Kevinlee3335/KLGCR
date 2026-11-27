import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validBillingApproval, withBillingApproval, type BillingApproval } from "./billing-approval";
import type { BillingMailState } from "./billing-mail-settings";
import { stripBillingMeterPhotos } from "./billing-meter-photo";
import { configSchema, malaysiaClock, type BillingSnapshot } from "./billing-preview";
import type { BillingMeterPhotosData, BillingOverview, BillingPack, BillingRunSummary } from "./billing-preview-types";
import { ensureUtilityMonth } from "./utility-months";

type BillingClient = Awaited<ReturnType<typeof createClient>>;
type RunFields = Pick<BillingRunSummary, "id" | "kind" | "period" | "issue_date" | "total">;
type RunRow = RunFields & { created_at: string; snapshot: BillingSnapshot };
type VerificationCountRow = { document_id: string; entries: {user_id:string}[] | null };

const runFields = "id,kind,period,issue_date,created_at,total";
const runDetailFields = "id,kind,period,issue_date,created_at,total,snapshot";
const approvalFields = "run_id,approved_by,approved_by_user,approved_at,signature";

async function readSettings(db: BillingClient) {
  const { data, error } = await db.from("billing_preview_settings").select("config,revision").eq("id", 1).single();
  if (error || !data) throw new Error("Billing preview storage is unavailable");
  const parsed = configSchema.safeParse(data.config);
  if (!parsed.success) throw new Error("Billing meter data needs repair. No records were changed.");
  return { config: parsed.data, revision: Number(data.revision) };
}

// Request every setting understood by this version except the photo-bearing meter array.
// The existing scoped RPC retains every account and meter, including registry/termination fields.
const settingKeys = configSchema.keyof().options.filter(key => key !== "utilityAccounts");
const settingsProjection = ["revision", ...settingKeys.map(key => `${key}:config->${key}`)].join(",");

async function readScopedSettings(db: BillingClient, accountId: string | null) {
  const metadata = db.from("billing_preview_settings").select(settingsProjection).eq("id", 1).single();
  const meterRead = async () => {
    const {data, error} = await createAdminClient().rpc("get_utility_meter_photos", {p_account_id: accountId, p_meter_id: null});
    return error ? null : data as {revision: number; period: string; utilityAccounts: unknown[]} | null;
  };
  const [settings, meters] = await Promise.all([metadata, meterRead().catch(() => null)]);
  if (!settings.error && settings.data && meters) {
    const {revision, ...fields} = settings.data as unknown as Record<string, unknown>;
    if (Number.isSafeInteger(revision) && revision === meters.revision && fields.utilityPeriod === meters.period) {
      const parsed = configSchema.safeParse({...fields, utilityAccounts: meters.utilityAccounts});
      if (parsed.success) return {config: parsed.data, revision: meters.revision};
    }
  }
  // Missing RPC, older installations or a concurrent save: read one coherent revision, under the caller's RLS.
  return readSettings(db);
}

async function readRunDetails(db: BillingClient, ids: string[], includeVerificationSignatures = false) {
  const approvals = new Map<string, BillingApproval>();
  const mailById = new Map<string, BillingMailState>();
  const verifiedBy = new Map<string, string[]>();
  if (ids.length) {
    const [approvalRows, mail, verifications] = await Promise.all([
      db.from("billing_run_approvals").select(includeVerificationSignatures ? `${approvalFields},verifications` : approvalFields).in("run_id", ids),
      db.from("billing_mail_dispatch").select("run_id,status,sent_at,error").in("run_id", ids),
      db.from("document_verifications").select("document_id,entries").eq("document_type", "billing").in("document_id", ids),
    ]);
    if (approvalRows.error || mail.error || verifications.error) throw new Error("Billing preview storage is unavailable");
    for (const approval of (approvalRows.data ?? []) as unknown as BillingApproval[]) {
      approvals.set(approval.run_id, approval);
    }
    for (const row of (mail.data ?? []) as BillingMailState[]) mailById.set(row.run_id, row);
    for (const row of (verifications.data ?? []) as VerificationCountRow[]) {
      verifiedBy.set(row.document_id, row.entries?.map(entry => entry.user_id) ?? []);
    }
  }
  return { approvals, mailById, verifiedBy };
}

function summarizeRun(row: RunFields, details: Awaited<ReturnType<typeof readRunDetails>>): BillingRunSummary {
  return {
    id: row.id,
    kind: row.kind,
    period: row.period,
    issue_date: row.issue_date,
    total: row.total,
    verifiedCount: details.verifiedBy.get(row.id)?.length ?? 0,
    verifiedBy: details.verifiedBy.get(row.id) ?? [],
    approved: validBillingApproval(details.approvals.get(row.id)) !== null,
    mail: details.mailById.get(row.id) ?? null,
  };
}

export async function loadBillingSettings(): Promise<Omit<BillingOverview, "pendingPackCount">> {
  await ensureUtilityMonth();
  const settings = await readScopedSettings(await createClient(), null);
  return {
    config: stripBillingMeterPhotos(settings.config),
    photosLoaded: false,
    revision: settings.revision,
    clock: malaysiaClock(),
  };
}

export async function loadPendingBillingCount() {
  const db = await createClient();
  const {count, error} = await db.from("billing_preview_runs")
    .select("id,billing_run_approvals!left(run_id)", {head: true, count: "exact"})
    .is("billing_run_approvals", null);
  if (error) throw new Error("Billing preview storage is unavailable");
  return count ?? 0;
}

export async function loadBillingOverview(canApprove: boolean): Promise<BillingOverview> {
  const [settings, pendingPackCount] = await Promise.all([loadBillingSettings(), canApprove ? loadPendingBillingCount() : 0]);
  return {...settings, pendingPackCount};
}

export async function loadBillingHistory(): Promise<BillingRunSummary[]> {
  const db = await createClient();
  const { data, error } = await db.from("billing_preview_runs")
    .select(runFields).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error("Billing preview storage is unavailable");
  const runs = (data ?? []) as RunFields[];
  const details = await readRunDetails(db, runs.map(row => row.id));
  return runs.map(row => summarizeRun(row, details));
}

export async function loadBillingPack(selector: { id: string } | { kind: BillingSnapshot["kind"]; period: string }): Promise<BillingPack | null> {
  const db = await createClient();
  const runs = db.from("billing_preview_runs").select(runDetailFields);
  const { data, error } = await ("id" in selector
    ? runs.eq("id", selector.id)
    : runs.eq("kind", selector.kind).eq("period", selector.period)).maybeSingle();
  if (error) throw new Error("Billing preview storage is unavailable");
  if (!data) return null;

  const row = data as RunRow;
  const details = await readRunDetails(db, [row.id], true);
  return {
    ...summarizeRun(row, details),
    snapshot: withBillingApproval(row.snapshot, details.approvals.get(row.id)),
  };
}

export async function loadBillingMeterPhotos(accountId?: string): Promise<BillingMeterPhotosData | null> {
  await ensureUtilityMonth();
  const db = await createClient();
  const { config, revision } = accountId === undefined ? await readSettings(db) : await readScopedSettings(db, accountId);
  const accounts = accountId === undefined ? config.utilityAccounts : config.utilityAccounts.filter(account => account.id === accountId);
  if (accountId !== undefined && accounts.length === 0) return null;
  return {
    accounts: accounts.map(({ id, meters }) => ({
      id,
      meters: meters.map(({ id, photo, previousPhoto }) => ({ id, photo, previousPhoto })),
    })),
    period: config.utilityPeriod,
    revision,
  };
}

// Keep the existing response available for browser tabs that were already open at deployment.
export async function loadBillingPreviewData(photosLoaded = false) {
  await ensureUtilityMonth();
  const db = await createClient();
  const [settings, result] = await Promise.all([
    readSettings(db),
    db.from("billing_preview_runs").select(runDetailFields).order("created_at", { ascending: false }).limit(50),
  ]);
  if (result.error) throw new Error("Billing preview storage is unavailable");
  const runs = (result.data ?? []) as RunRow[];
  const details = await readRunDetails(db, runs.map(row => row.id), true);
  const signedRuns = runs.map(row => ({
    ...row,
    verifiedCount: details.verifiedBy.get(row.id)?.length ?? 0,
    mail: details.mailById.get(row.id) ?? null,
    snapshot: withBillingApproval(row.snapshot, details.approvals.get(row.id)),
  }));
  return {
    config: photosLoaded ? settings.config : stripBillingMeterPhotos(settings.config),
    photosLoaded,
    revision: settings.revision,
    runs: signedRuns,
    clock: malaysiaClock(),
  };
}
