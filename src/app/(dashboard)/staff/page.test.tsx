import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn().mockResolvedValue({id:"staff",role:"maintenance_staff",full_name:"Staff Member",blocks:[{code:"A"}]}) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({children}:{children:React.ReactNode}) => <main>{children}</main> }));
vi.mock("@/components/dashboard", () => ({ Dashboard: () => <div>Dashboard loaded</div> }));
vi.mock("@/components/phase2-ui", () => ({ JobList: ({rows}:{rows:unknown[]}) => <div>{rows.length} jobs</div> }));
function query(result:unknown){const b={select:vi.fn(),order:vi.fn(),limit:vi.fn(),eq:vi.fn(),not:vi.fn(),in:vi.fn(),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(result).then(resolve)}; for(const k of ["select","order","limit","eq","not","in"] as const)b[k].mockReturnValue(b);return b;}
const jobQueries=[query({data:[{status:"assigned"}],error:null}),query({data:[{id:"j1",job_no:"JOB-1",complaint:{id:"c1"}}],error:null})];
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn().mockResolvedValue({from:vi.fn((table:string)=>table==="maintenance_jobs"?jobQueries.shift():query({data:[],error:null}))})}));
import StaffPage from "./page";
describe("staff dashboard",()=>{it("loads without selecting complaints.appointment_required",async()=>{const page=await StaffPage();expect(renderToStaticMarkup(page)).toContain("Dashboard loaded");for(const q of jobQueries) expect(q.select.mock.calls.flat().join()).not.toContain("appointment_required");});});
