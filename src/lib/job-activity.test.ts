import { describe, expect, it } from "vitest";
import { buildJobActivity, formatMalaysiaActivity } from "./job-activity";

const job = {
  assigned_at: "2026-01-17T01:30:00Z",
  started_at: "2026-01-17T02:00:00Z",
  completed_at: "2026-01-17T05:00:00Z",
  assignee: { full_name: "Ali Staff" },
  complaint: {
    submitted_at: "2026-01-16T23:45:00Z",
    reviewed_at: "2026-01-17T01:25:00Z",
    reviewer: { full_name: "Admin Lee" },
  },
};

describe("job activity timeline", () => {
  it("combines lifecycle, appointment, status, and material records chronologically", () => {
    const events = buildJobActivity({
      job,
      appointments: [{ id: "a1", appointment_date: "2026-01-17", appointment_time: "11:00:00", status: "confirmed", remarks: "Call first", staff: { full_name: "Ali Staff" } }],
      history: [
        { id: 1, previous_status: "assigned", new_status: "in_progress", note: null, created_at: "2026-01-17T02:00:01Z", actor: { full_name: "Ali Staff" } },
        { id: 2, previous_status: "in_progress", new_status: "pending_material", note: "Need valve", created_at: "2026-01-17T02:15:00Z", actor: { full_name: "Ali Staff" } },
        { id: 3, previous_status: "pending_material", new_status: "in_progress", note: null, created_at: "2026-01-17T04:00:00Z", actor: { full_name: "Ali Staff" } },
        { id: 4, previous_status: "in_progress", new_status: "completed", note: "Valve fitted", created_at: "2026-01-17T05:00:01Z", actor: { full_name: "Ali Staff" } },
      ],
      materials: [{
        id: "m1", request_no: "MR-001", status: "issued", note: "Need valve", rejection_reason: null,
        created_at: "2026-01-17T02:16:00Z", reviewed_at: "2026-01-17T03:00:00Z", issued_at: "2026-01-17T03:30:00Z",
        requester: { full_name: "Ali Staff" }, reviewer: { full_name: "Admin Lee" }, issuer: { full_name: "Admin Lee" },
        items: [{ requested_qty: 2, approved_qty: 2, issued_qty: 2, item: { item_code: "VAL-1", description: "Valve", unit: "pcs" } }],
      }],
    });

    expect(events.map(({ action }) => action)).toEqual([
      "Complaint Submitted", "Admin Reviewed / Approved", "Job Assigned", "Start Job / In Progress",
      "Pending Material", "Material Requested", "Maintenance Appointment Scheduled", "Material Approved",
      "Material Issued", "Resume Work / In Progress", "Completed",
    ]);
    expect(events.find(({ action }) => action === "Material Issued")?.remarks).toContain("VAL-1 · Valve — 2 pcs");
    expect(events.filter(({ action }) => action === "Start Job / In Progress")).toHaveLength(1);
  });

  it("does not create events for absent optional timestamps", () => {
    const events = buildJobActivity({ job: { ...job, started_at: null, completed_at: null, complaint: null }, history: [], materials: [], appointments: [] });
    expect(events.map(({ action }) => action)).toEqual(["Job Assigned"]);
  });

  it("identifies subsequent monitoring records as updates with their stored remarks", () => {
    const events = buildJobActivity({
      job: { ...job, started_at: null, completed_at: null }, appointments: [], materials: [],
      history: [
        { id: 1, previous_status: "in_progress", new_status: "under_monitoring", note: "Observe leak", created_at: "2026-01-17T02:00:00Z", actor: { full_name: "Ali Staff" } },
        { id: 2, previous_status: "under_monitoring", new_status: "under_monitoring", note: "No leak after one hour", created_at: "2026-01-17T03:00:00Z", actor: { full_name: "Ali Staff" } },
      ],
    });
    expect(events.slice(-2).map(({ action, remarks }) => [action, remarks])).toEqual([
      ["Under Monitoring", "Observe leak"], ["Monitoring Update", "No leak after one hour"],
    ]);
  });

  it("formats database timestamps in Malaysia time", () => {
    expect(formatMalaysiaActivity("2026-01-16T23:45:00Z")).toEqual({ date: "17 Jan 2026", time: "07:45:00 am" });
  });
});
