import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { checkoutProgress, isRepairDefect } from "./checkouts";
import type { CheckoutProgressFilters, CheckoutProgressRow, LegacyCheckoutProgressRow } from "./checkout-progress";

const PAGE_SIZE = 50;
const LEGACY_COLUMNS = "id,reference_no,room_no,utmspace_defects,inspection_notes,status,assigned_to,cleaner_id,created_at,ready_at,block:blocks!block_id(code),assignee:profiles!assigned_to(full_name),cleaner:profiles!cleaner_id(full_name),defects:checkout_defects(description,status),painting:checkout_paint_tasks(status)";

function viewUnavailable(error: PostgrestError | null) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function checkoutProgressPageNumber(value: string | string[] | undefined) {
  const page = typeof value === "string" ? Number(value) : 1;
  return page > 0 && Number.isInteger(page) && Number.isSafeInteger(page * PAGE_SIZE) ? page : 1;
}

export async function loadCheckoutProgressPage(db: SupabaseClient, filters: CheckoutProgressFilters, page: number) {
  const offset = (page - 1) * PAGE_SIZE;
  let query = db.from("checkout_room_progress").select("id,reference_no,room_no,status,assigned_to,cleaner_id,created_at,block_code,maintenance_name,cleaner_name,defect_count,remaining_count,painting_status,progress_status,can_assign_cleaner,can_assign_maintenance,can_assign_painting");
  if (filters.block !== "all") query = query.eq("block_code", filters.block);
  if (filters.status) query = query.eq("progress_status", filters.status);
  const search = filters.room.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-D]/.test(search)) query = query.like("search_room", `%${search}%`);
  else if (search) query = query.or(`search_room.like.%${search}%,search_room_number.like.%${search}%`);
  const result = await query.order("status_rank").order("block_code").order("sort_room_prefix").order("sort_room_number").order("reference_no").order("id").range(offset, offset + PAGE_SIZE);
  if (viewUnavailable(result.error)) {
    const legacy = await db.from("checkout_rooms").select(LEGACY_COLUMNS).is("deleted_at", null).order("updated_at", { ascending: false });
    return { rows: (legacy.data || []) as unknown as LegacyCheckoutProgressRow[], error: legacy.error, paginated: false, hasNext: false };
  }
  const rows = (result.data || []) as CheckoutProgressRow[];
  return { rows: rows.slice(0, PAGE_SIZE), error: result.error, paginated: true, hasNext: rows.length > PAGE_SIZE };
}

export type CheckoutOverviewRoom = {
  id: string;
  room_no: string;
  block_code: string;
  defect_count: number;
  can_assign_cleaner: boolean;
  can_assign_maintenance: boolean;
};

export async function loadCheckoutOverviewRooms(db: SupabaseClient) {
  const rooms: CheckoutOverviewRoom[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("checkout_room_progress")
      .select("id,room_no,block_code,defect_count,can_assign_cleaner,can_assign_maintenance").order("id").range(offset, offset + 999);
    if (viewUnavailable(error)) return loadLegacyCheckoutOverviewRooms(db);
    if (error) return { rooms: [], error };
    rooms.push(...data as CheckoutOverviewRoom[]);
    if (data.length < 1000) return { rooms, error: null };
  }
}

async function loadLegacyCheckoutOverviewRooms(db: SupabaseClient) {
  const { data, error } = await db.from("checkout_rooms")
    .select("id,room_no,status,utmspace_defects,assigned_to,cleaner_id,block:blocks!block_id(code),defects:checkout_defects(description,status)")
    .is("deleted_at", null);
  const rooms = (data || []) as unknown as LegacyCheckoutProgressRow[];
  return {
    rooms: rooms.map(room => {
      const { total, remaining } = checkoutProgress(room.defects);
      return {
        id: room.id,
        room_no: room.room_no,
        block_code: room.block?.code ?? "",
        defect_count: total,
        can_assign_maintenance: room.status === "second_inspection" && !room.assigned_to && total > 0,
        can_assign_cleaner: !room.cleaner_id && ((room.status === "verification" && remaining === 0)
          || (room.status === "second_inspection" && total === 0 && !isRepairDefect({ description: room.utmspace_defects }))),
      };
    }),
    error,
  };
}
