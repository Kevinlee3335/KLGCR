import type { JobStatus, Priority } from "@/components/ui/status-badge"

/**
 * ⚠️ PLACEHOLDER PRESENTATION DATA — DESIGN PASS ONLY ⚠️
 *
 * This module exists purely to demonstrate the final visual language of the
 * KLG Operations Management System (dashboards, job cards, job detail). It is
 * NOT a backend and touches no database.
 *
 * When wiring real operations, replace each export below with the equivalent
 * Supabase query (complaints, jobs, tasks, inventory) and delete this file.
 * The UI components are typed against these shapes, so real data that matches
 * the shape will render without any component changes.
 */

export type Complaint = {
  id: string
  ref: string
  block: string
  room: string
  category: string
  description: string
  priority: Priority
  status: JobStatus
  submittedAt: string
}

export type TaskRow = {
  id: string
  staff: string
  block: string
  room: string
  job: string
  status: JobStatus
}

export type Job = {
  id: string
  ref: string
  block: string
  room: string
  category: string
  description: string
  priority: Priority
  status: JobStatus
  scheduledFor: string
  assignedTo: string
}

export type InventoryAlert = {
  id: string
  name: string
  sku: string
  onHand: number
  reorderAt: number
  level: "out" | "low"
}

export const SAMPLE_KPIS = {
  newComplaints: 6,
  todaysJobs: 14,
  inProgress: 5,
  pendingMaterial: 3,
  monitoring: 2,
  completedToday: 9,
}

/** Jobs Overview breakdown (matches the KPIs above). */
export const SAMPLE_JOB_BREAKDOWN: { label: string; value: number; status: JobStatus }[] = [
  { label: "Completed", value: 9, status: "completed" },
  { label: "In Progress", value: 5, status: "in_progress" },
  { label: "Pending", value: 3, status: "pending_material" },
  { label: "Monitoring", value: 2, status: "monitoring" },
]

export const SAMPLE_COMPLAINTS: Complaint[] = [
  {
    id: "c1",
    ref: "CMP-2048",
    block: "Block A",
    room: "A-211",
    category: "Electrical",
    description: "Room light not working",
    priority: "high",
    status: "new",
    submittedAt: "08:42",
  },
  {
    id: "c2",
    ref: "CMP-2047",
    block: "Block C",
    room: "C-104",
    category: "Plumbing",
    description: "Bathroom tap leaking continuously",
    priority: "medium",
    status: "assigned",
    submittedAt: "08:15",
  },
  {
    id: "c3",
    ref: "CMP-2046",
    block: "Block B",
    room: "B-330",
    category: "Aircond",
    description: "Air-conditioner not cooling",
    priority: "high",
    status: "in_progress",
    submittedAt: "07:58",
  },
  {
    id: "c4",
    ref: "CMP-2045",
    block: "Block A",
    room: "A-108",
    category: "Furniture",
    description: "Broken wardrobe hinge",
    priority: "low",
    status: "pending_material",
    submittedAt: "Yesterday",
  },
  {
    id: "c5",
    ref: "CMP-2044",
    block: "Block D",
    room: "D-215",
    category: "Plumbing",
    description: "Water heater intermittent",
    priority: "medium",
    status: "monitoring",
    submittedAt: "Yesterday",
  },
]

export const SAMPLE_TASKS: TaskRow[] = [
  { id: "t1", staff: "Rahman", block: "Block A", room: "A-211", job: "Electrical", status: "in_progress" },
  { id: "t2", staff: "Suresh", block: "Block B", room: "B-330", job: "Aircond", status: "assigned" },
  { id: "t3", staff: "Rahman", block: "Block A", room: "A-108", job: "Furniture", status: "pending_material" },
  { id: "t4", staff: "Lim", block: "Block C", room: "C-104", job: "Plumbing", status: "completed" },
]

export const SAMPLE_INVENTORY_ALERTS: InventoryAlert[] = [
  { id: "i1", name: "LED Tube 18W", sku: "ELE-LED-18", onHand: 0, reorderAt: 12, level: "out" },
  { id: "i2", name: "PVC Pipe 1/2in", sku: "PLM-PVC-12", onHand: 4, reorderAt: 20, level: "low" },
  { id: "i3", name: "Door Hinge (SS)", sku: "FUR-HNG-SS", onHand: 3, reorderAt: 15, level: "low" },
]

/** Staff field-service demo jobs (today's assigned list). */
export const SAMPLE_STAFF_JOBS: Job[] = [
  {
    id: "j-a211",
    ref: "JOB-5120",
    block: "Block A",
    room: "A-211",
    category: "Electrical",
    description: "Room light not working",
    priority: "high",
    status: "in_progress",
    scheduledFor: "Today, 10:00 AM",
    assignedTo: "You",
  },
  {
    id: "j-a108",
    ref: "JOB-5118",
    block: "Block A",
    room: "A-108",
    category: "Furniture",
    description: "Broken wardrobe hinge",
    priority: "low",
    status: "pending_material",
    scheduledFor: "Today, 11:30 AM",
    assignedTo: "You",
  },
  {
    id: "j-b330",
    ref: "JOB-5116",
    block: "Block B",
    room: "B-330",
    category: "Aircond",
    description: "Air-conditioner not cooling",
    priority: "high",
    status: "assigned",
    scheduledFor: "Today, 2:00 PM",
    assignedTo: "You",
  },
  {
    id: "j-c104",
    ref: "JOB-5109",
    block: "Block C",
    room: "C-104",
    category: "Plumbing",
    description: "Bathroom tap leaking continuously",
    priority: "medium",
    status: "completed",
    scheduledFor: "Today, 9:00 AM",
    assignedTo: "You",
  },
]

export type JobHistoryEntry = { at: string; label: string; by: string }

export type JobDetail = Job & {
  complaintDescription: string
  actionTaken: string | null
  materials: { name: string; qty: number; state: "used" | "requested" }[]
  history: JobHistoryEntry[]
}

export function getSampleJobDetail(id: string): JobDetail {
  const base = SAMPLE_STAFF_JOBS.find((j) => j.id === id) ?? SAMPLE_STAFF_JOBS[0]
  return {
    ...base,
    complaintDescription:
      "Resident reports the ceiling light in the room does not turn on. Switch appears functional but the fixture stays off. Requested urgent attention.",
    actionTaken:
      base.status === "in_progress"
        ? "Inspected fixture and confirmed faulty starter. Replacing LED tube and testing circuit."
        : null,
    materials: [
      { name: "LED Tube 18W", qty: 1, state: base.status === "pending_material" ? "requested" : "used" },
      { name: "Electrical Tape", qty: 1, state: "used" },
    ],
    history: [
      { at: "Today, 8:42 AM", label: "Complaint received", by: "System" },
      { at: "Today, 9:05 AM", label: "Assigned to you", by: "Admin" },
      { at: "Today, 10:02 AM", label: "Job started", by: "You" },
    ],
  }
}
