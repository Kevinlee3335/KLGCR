import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth",()=>({requireRole:vi.fn().mockResolvedValue({id:"staff",role:"maintenance_staff",full_name:"Assigned Staff",blocks:[]})}));
vi.mock("@/components/app-shell",()=>({AppShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
function query(result:unknown){const b={select:vi.fn(),order:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)};b.select.mockReturnValue(b);b.order.mockReturnValue(b);return b;}
const appointments=query({data:[{id:"a1",job_id:"j1",appointment_date:"2026-09-12",appointment_time:"10:00:00",status:"confirmed",remarks:"Call first",complaint:{complaint_no:"CMP-1",room_no:"101",complainant_name:"Tenant",complainant_contact:"0123",room_access_permission:"no",block:{code:"A"}},staff:{full_name:"Assigned Staff"}}],error:null});
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn().mockResolvedValue({from:vi.fn(()=>appointments)})}));
import StaffAppointments from "./page";
describe("staff appointments",()=>{it("shows assigned appointment details and job link",async()=>{const html=renderToStaticMarkup(await StaffAppointments());expect(html).toContain('href="/staff/jobs/j1"');expect(html).toContain("CMP-1");expect(html).toContain("Call first");expect(appointments.select.mock.calls[0][0]).not.toContain("appointment_required");});});
