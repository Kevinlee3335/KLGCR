import { render, screen, fireEvent } from "@testing-library/react";
import { describe,it,expect,vi } from "vitest";
import { DocumentsPanel } from "./documents-panel";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/app/(dashboard)/documents/actions",()=>({prepareDocument:vi.fn(),saveDocument:vi.fn(),documentUrl:vi.fn(),deleteDocument:vi.fn()}));
const documents=[{id:"1",file_name:"Block A Level 2 Floor Plan.pdf",size_bytes:1024,created_at:"2026-10-12T00:00:00Z"},{id:"2",file_name:"Pump Manual.docx",size_bytes:1024,created_at:"2026-10-12T00:00:00Z"}];
describe("Documents",()=>{
 it("matches combined filename keywords and keeps original names",()=>{render(<DocumentsPanel documents={documents} canManage={false}/>);fireEvent.change(screen.getByLabelText("Search Documents"),{target:{value:"floor A"}});expect(screen.getByText(documents[0].file_name)).toBeInTheDocument();expect(screen.queryByText(documents[1].file_name)).toBeNull();expect(screen.queryByText("Upload")).toBeNull();expect(screen.queryByText("Delete")).toBeNull();});
 it("offers management upload and delete, previews supported files only",()=>{render(<DocumentsPanel documents={documents} canManage/>);expect(screen.getByText("Upload")).toBeInTheDocument();expect(screen.getAllByText("Delete")).toHaveLength(2);expect(screen.getAllByText("Preview")).toHaveLength(1);expect(screen.getAllByText("Download")).toHaveLength(2);});
});
