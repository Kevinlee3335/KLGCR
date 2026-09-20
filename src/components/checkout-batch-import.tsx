"use client";

import * as XLSX from "xlsx";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCheckoutBatch, type BatchCheckoutInput } from "@/app/(dashboard)/admin/checkouts/actions";

type Block={id:number;code:string};
type Parsed={rows:BatchCheckoutInput[];defectCount:number};
const key=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const splitDefects=(value:unknown)=>String(value??"").split(/[\n;]+/).map(x=>x.replace(/^[-•\d.)\s]+/,"").trim()).filter(Boolean);

export function CheckoutBatchImport({blocks}:{blocks:Block[]}){
 const router=useRouter();const [pending,startTransition]=useTransition();const [parsed,setParsed]=useState<Parsed|null>(null);const [error,setError]=useState("");const [result,setResult]=useState("");
 const blockMap=useMemo(()=>new Map(blocks.map(b=>[key(b.code),b.id])),[blocks]);
 async function selectFile(file:File|undefined){setError("");setResult("");setParsed(null);if(!file)return;try{
   const book=XLSX.read(await file.arrayBuffer(),{type:"array"});const sheet=book.Sheets[book.SheetNames[0]];if(!sheet)throw new Error("This Excel file has no worksheet.");
   const table=XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:"",raw:false});const headers=(table[0]||[]).map(key);const blockAt=headers.findIndex(h=>h==="block"||h==="blockcode");const roomAt=headers.findIndex(h=>["room","roomno","roomnumber","roomnum"].includes(h));const defectAt=headers.map((h,i)=>h.includes("defect")||h.includes("issue")?i:-1).filter(i=>i>=0);
   if(blockAt<0||roomAt<0||!defectAt.length)throw new Error("Excel first row must include Block, Room and at least one Defect column.");
   const rows:BatchCheckoutInput[]=[];let defectCount=0;table.slice(1).forEach((line,index)=>{const rawBlock=String(line[blockAt]??"").trim();const blockCode=key(rawBlock.replace(/^block\s*/i,""));const roomNo=String(line[roomAt]??"").trim();const defects=[...new Set(defectAt.flatMap(i=>splitDefects(line[i])))];if(!rawBlock&&!roomNo&&!defects.length)return;const blockId=blockMap.get(blockCode);if(!blockId)throw new Error("Row "+(index+2)+': Block "'+rawBlock+'" is not recognised.');if(!roomNo)throw new Error("Row "+(index+2)+": Room is missing.");if(!defects.length)throw new Error("Row "+(index+2)+": Add at least one defect.");rows.push({blockId,roomNo,defects});defectCount+=defects.length;});
   if(!rows.length)throw new Error("No rooms were found in this Excel file.");if(rows.length>1000)throw new Error("Please import a maximum of 1,000 rooms each time.");setParsed({rows,defectCount});
  }catch(cause){setError(cause instanceof Error?cause.message:"Unable to read this Excel file.");}}
 function submit(){if(!parsed)return;setError("");setResult("");startTransition(async()=>{const response=await createCheckoutBatch(parsed.rows);if("error" in response){setError(response.error??"Unable to create the check-out rooms.");return;}setResult("Created "+response.created+" check-out rooms with "+parsed.defectCount+" defects"+(response.skipped?"; "+response.skipped+" existing room(s) skipped":"")+".");setParsed(null);router.refresh();});}
 return <details className="panel checkout-create" open><summary>Bulk import Check-out Rooms from Excel</summary><div className="form-grid"><div className="field field-wide"><label>Excel file (.xlsx)</label><input type="file" accept=".xlsx,.xls" onChange={e=>selectFile(e.target.files?.[0])}/><small className="subtle">Columns needed: <strong>Block</strong>, <strong>Room</strong>, then one or more columns named <strong>Defect</strong>, <strong>Defect 1</strong>, <strong>Defect 2</strong>…</small></div>{parsed&&<div className="field field-wide"><p className="success">Ready: {parsed.rows.length} rooms · {parsed.defectCount} defects</p><button className="button" type="button" onClick={submit} disabled={pending}>{pending?"Creating rooms…":"Create all Check-out Rooms"}</button></div>}{error&&<p className="error field-wide">{error}</p>}{result&&<p className="success field-wide">{result}</p>}</div></details>;
}
