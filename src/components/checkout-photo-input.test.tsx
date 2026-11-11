import {act,render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {afterEach,beforeEach,it,expect,vi} from "vitest";
const state=vi.hoisted(()=>({prepare:vi.fn(),adminPrepare:vi.fn(),upload:vi.fn()}));
vi.mock("@/app/(dashboard)/staff/checkouts/actions",()=>({prepareCheckoutEvidence:state.prepare}));
vi.mock("@/app/(dashboard)/admin/checkouts/actions",()=>({prepareAdminInspectionEvidence:state.adminPrepare}));
vi.mock("@/lib/supabase/client",()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:state.upload})}})}));
import {CheckoutCompletionForm} from "./checkout-photo-input";
beforeEach(()=>{
 URL.createObjectURL=vi.fn(()=>"blob:photo");URL.revokeObjectURL=vi.fn();
 const uploads=Array.from({length:7},(_,i)=>({path:"room/completion/photo"+i,token:"token"+i}));
 state.prepare.mockReset().mockResolvedValue({uploads});state.adminPrepare.mockReset().mockResolvedValue({uploads});state.upload.mockReset().mockResolvedValue({error:null});
});
afterEach(cleanup);
function seven(){fireEvent.change(screen.getByLabelText("Upload Photos"),{target:{files:Array.from({length:7},(_,i)=>new File(["photo"],"photo"+i+".jpg",{type:"image/jpeg"}))}})}
it("uploads maintenance photos in bounded batches and submits paths in selection order", async () => {
  let finishFirst!: (result: { error: null }) => void;
  const first = new Promise<{ error: null }>(resolve => { finishFirst = resolve; });
  state.upload.mockImplementation((path: string) => path.endsWith("0") ? first : Promise.resolve({ error: null }));
  const action = vi.fn<(data: FormData) => Promise<void>>(async () => {});
  render(<CheckoutCompletionForm roomId="room" kind="completion" action={action} buttonLabel="Update this defect"><input name="rectifiedDefects" defaultValue="fan"/></CheckoutCompletionForm>);
  seven();
  fireEvent.submit(screen.getByRole("button", { name: "Update this defect" }).closest("form")!);
  await screen.findByText("Uploaded 2 of 7 photos…");
  expect(state.upload).toHaveBeenCalledTimes(3);
  expect(action).not.toHaveBeenCalled();
  await act(async () => { finishFirst({ error: null }); });
  await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  expect(state.upload).toHaveBeenCalledTimes(7);
  expect(action.mock.calls[0][0].getAll("photoPaths")).toEqual(Array.from({ length: 7 }, (_, i) => `room/completion/photo${i}`));
  expect(action.mock.calls[0][0].get("rectifiedDefects")).toBe("fan");
});
it("waits for in-flight photos before enabling a retry and skips the next batch after a failure", async () => {
  let finishFirst!: (result: { error: null }) => void;
  const first = new Promise<{ error: null }>(resolve => { finishFirst = resolve; });
  state.upload.mockImplementation((path: string) => {
    if (path.endsWith("0")) return first;
    return Promise.resolve({ error: path.endsWith("1") ? { message: "Network offline" } : null });
  });
  const action = vi.fn<(data: FormData) => Promise<void>>(async () => {});
  render(<CheckoutCompletionForm roomId="room" kind="completion" action={action} buttonLabel="Update this defect"><label>Notes <textarea name="notes"/></label></CheckoutCompletionForm>);
  const notes = screen.getByRole("textbox", { name: "Notes" });
  fireEvent.change(notes, { target: { value: "Fan replaced" } });
  seven();
  fireEvent.submit(screen.getByRole("button", { name: "Update this defect" }).closest("form")!);
  await screen.findByText("Uploaded 1 of 7 photos…");
  expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await act(async () => { finishFirst({ error: null }); });
  expect(await screen.findByRole("alert")).toHaveTextContent("Photo 2 could not upload");
  expect(screen.getByRole("button", { name: "Update this defect" })).toBeEnabled();
  expect(notes).toHaveValue("Fan replaced");
  expect(state.upload).toHaveBeenCalledTimes(3);
  expect(action).not.toHaveBeenCalled();
});
it("never marks the defect completed when the seventh upload fails, and keeps all selected photos",async()=>{
 state.upload.mockImplementation(async(path:string)=>({error:path.endsWith("6")?{message:"Network offline"}:null}));
 const action=vi.fn<(data:FormData)=>Promise<void>>(async()=>{});
 render(<CheckoutCompletionForm roomId="room" kind="completion" action={action} buttonLabel="Update this defect"><input name="rectifiedDefects" defaultValue="fan"/></CheckoutCompletionForm>);
 seven();fireEvent.submit(screen.getByRole("button",{name:"Update this defect"}).closest("form")!);
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Photo 7 could not upload"));
 expect(action).not.toHaveBeenCalled();expect(screen.getByRole("status")).toHaveTextContent("7 / 20");
});
it("allows an optional empty Admin inspection gallery and uses the Admin authorization path",async()=>{
 const action=vi.fn<(data:FormData)=>Promise<void>>(async()=>{});state.adminPrepare.mockResolvedValue({uploads:[]});
 render(<CheckoutCompletionForm roomId="room" kind="inspection" action={action} buttonLabel="Complete inspection"><input name="assignee" defaultValue="tech"/></CheckoutCompletionForm>);
 fireEvent.submit(screen.getByRole("button",{name:"Complete inspection"}).closest("form")!);
 await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));expect(state.adminPrepare).toHaveBeenCalledWith("room",[]);expect(state.prepare).not.toHaveBeenCalled();
});
