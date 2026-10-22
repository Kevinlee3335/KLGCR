import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe,it,expect,vi } from "vitest";
import { updateDocumentCategories } from "@/app/(dashboard)/documents/actions";
import { DocumentsPanel } from "./documents-panel";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/(dashboard)/documents/actions",()=>({prepareDocument:vi.fn(),saveDocument:vi.fn(),documentUrl:vi.fn(),deleteDocument:vi.fn(),updateDocumentCategories:vi.fn()}));
const documents=[{id:"1",file_name:"Block A Level 2 Floor Plan.pdf",size_bytes:1024,created_at:"2026-10-12T00:00:00Z"},{id:"2",file_name:"Pump Manual.docx",size_bytes:1024,created_at:"2026-10-12T00:00:00Z"}];
describe("Documents",()=>{
 it("saves a selected category and shows success",async()=>{
  vi.mocked(updateDocumentCategories).mockResolvedValueOnce(undefined);
  render(<DocumentsPanel documents={documents} canManage/>);
  fireEvent.change(screen.getByLabelText(`Category for ${documents[0].file_name}`),{target:{value:"Clinic Plans"}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Category saved successfully"));
  expect(updateDocumentCategories).toHaveBeenCalledWith(["1"],"Clinic Plans");
  fireEvent.click(screen.getByRole("button",{name:/Clinic Plans/}));
  expect(screen.getByText(documents[0].file_name)).toBeInTheDocument();
 });
 it("reports failed saves without changing the category",async()=>{
  vi.mocked(updateDocumentCategories).mockRejectedValueOnce(new Error("Save failed"));
  render(<DocumentsPanel documents={documents} canManage/>);
  fireEvent.change(screen.getByLabelText(`Category for ${documents[0].file_name}`),{target:{value:"Clinic Plans"}});
  await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Save failed"));
  fireEvent.click(screen.getByRole("button",{name:/Clinic Plans/}));
  expect(screen.queryByText(documents[0].file_name)).toBeNull();
 });
 it("combines category, block, level and type filters and clears them",()=>{
  const files=[...documents,{id:"3",file_name:"Block D (Approved Bomba Plan) - Level 4 - 6.pdf",size_bytes:1024,created_at:"2026-10-12T00:00:00Z"}];
  render(<DocumentsPanel documents={files} canManage={false}/>);
  fireEvent.click(screen.getByRole("button",{name:/Bomba Approved Plans/}));
  fireEvent.change(screen.getByLabelText("Block"),{target:{value:"D"}});
  fireEvent.change(screen.getByLabelText("Level"),{target:{value:"5"}});
  expect(screen.getByText(files[2].file_name)).toBeInTheDocument();
  expect(screen.queryByText(files[0].file_name)).toBeNull();
  fireEvent.change(screen.getByLabelText("File type"),{target:{value:"Excel"}});
  expect(screen.getByText("No matching documents.")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Clear filters"));
  expect(screen.getAllByText("Download")).toHaveLength(3);
 });
 it("uses saved categories instead of filename detection",()=>{
  render(<DocumentsPanel documents={[{...documents[0],category:"Clinic Plans"}]} canManage={false}/>);
  fireEvent.click(screen.getByRole("button",{name:/Clinic Plans/}));
  expect(screen.getByText(documents[0].file_name)).toBeInTheDocument();
 });
 it("matches combined filename keywords and keeps original names",()=>{render(<DocumentsPanel documents={documents} canManage={false}/>);fireEvent.change(screen.getByLabelText("Search Documents"),{target:{value:"floor A"}});expect(screen.getByText(documents[0].file_name)).toBeInTheDocument();expect(screen.queryByText(documents[1].file_name)).toBeNull();expect(screen.queryByText("Upload")).toBeNull();expect(screen.queryByText("Delete")).toBeNull();});
 it("offers management upload and delete, previews supported files only",()=>{render(<DocumentsPanel documents={documents} canManage/>);expect(screen.getByText("Upload")).toBeInTheDocument();expect(screen.getAllByText("Delete")).toHaveLength(2);expect(screen.getAllByText("Preview")).toHaveLength(1);expect(screen.getAllByText("Download")).toHaveLength(2);});
});
