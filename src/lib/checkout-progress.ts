import type { CheckoutRoom, CheckoutStatus } from "./checkouts";

export const checkoutProgressStatuses = {
  painting_only: { label: "Awaiting Maintenance · Painting Work Only", tone: "painting" },
  awaiting_maintenance: { label: "Awaiting Maintenance", tone: "awaiting" },
  rectification: { label: "Rectification in Progress", tone: "repairing" },
  no_defect_cleaner: { label: "No Defect · Assign Cleaner", tone: "noDefect" },
  repair_complete_cleaner: { label: "Repair Completed · Assign Cleaner", tone: "repairComplete" },
  cleaning: { label: "Cleaning", tone: "painting" },
  verification: { label: "Admin verification", tone: "neutral" },
  second_inspection: { label: "Second inspection", tone: "neutral" },
  ready_for_occupancy: { label: "Ready for Occupancy", tone: "ready" },
} as const;

export type CheckoutProgressStatus = keyof typeof checkoutProgressStatuses;
export type CheckoutProgressFilters = { block: string; status: string; room: string };
export type CheckoutProgressPagination = {
  filters: CheckoutProgressFilters;
  blocks: string[];
  page: number;
  hasNext: boolean;
};

export type LegacyCheckoutProgressRow = CheckoutRoom & {
  defects: { description: string; status: string }[];
  painting: { status: string }[];
};

export type CheckoutProgressRow = {
  id: string;
  reference_no: string;
  room_no: string;
  status: CheckoutStatus;
  assigned_to: string | null;
  cleaner_id: string | null;
  created_at: string;
  block_code: string;
  maintenance_name: string | null;
  cleaner_name: string | null;
  defect_count: number;
  remaining_count: number;
  painting_status: "assigned" | "in_progress" | "completed" | null;
  progress_status: CheckoutProgressStatus;
  can_assign_cleaner: boolean;
  can_assign_maintenance: boolean;
  can_assign_painting: boolean;
};

export function parseCheckoutProgressFilters(query: Record<string, string | string[] | undefined>): CheckoutProgressFilters {
  const { block, status, room } = query;
  return {
    block: typeof block === "string" && /^[A-D]$/.test(block) ? block : "all",
    status: typeof status === "string" && Object.hasOwn(checkoutProgressStatuses, status) ? status : "",
    room: typeof room === "string" ? room.slice(0, 80) : "",
  };
}

export function checkoutProgressHref({ block, status, room }: CheckoutProgressFilters, page = 1) {
  const params = new URLSearchParams();
  if (block !== "all") params.set("block", block);
  if (status) params.set("status", status);
  if (room) params.set("room", room);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/checkouts?${query}` : "/admin/checkouts";
}
