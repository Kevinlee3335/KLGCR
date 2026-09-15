"use client";

import * as XLSX from "xlsx";
import { useMemo, useState } from "react";

type Entry={block:string;room:string;area:string;item:string;issue:string;exactLocation:string};
type RowIssue={line:number;message:string};

function normalize(value:string){return value.trim().replace(/^block\s*/i,"").toUpperCase();}
function header(value:unknown){return String(value??"").trim().toLowerCase().replace(/[ _-]/g,"");}
function asDefect(entry:Entry){if(!entry.item&&!entry.issue)return "";const parts=[entry.area||"Room",entry.item].filter(Boolean).join(" · ");const issue=entry.issue?" — "+entry.issue:"";const location=entry.exactLocation?" · "+entry.exactLocation:"";return (parts||"Reported defect")+issue+location;}
function entriesFromRows(rows:unknown[][]){
  const first=rows.findIndex((row)=>row.some((cell)=>String(cell??"").trim()));
  if(first<0)return {entries:[] as Entry[],issues:[] as RowIssue[]};
  const headers=rows[first].map(header);
  const blockIndex=headers.indexOf("block"),roomIndex=headers.indexOf("room");
  if(blockIndex<0||roomIndex<0)return {entries:[] as Entry[],issues:[{line:first+1,message:"Excel header must include Block and Room."}]};
  const at=(row:unknown[],name:string)=>{const index=headers.indexOf(name);return index<0?"":String(row[index]??"").trim();};
  const exactIndex=headers.findIndex((value)=>value==="exactlocation"||value==="location");
  const entries:Entry[]=[];const issues:RowIssue[]=[];
  rows.slice(first+1).forEach((row,offset)=>{
    if(!row.some((cell)=>String(cell??"").trim()))return;
    const block=normalize(String(row[blockIndex]??"")),room=String(row[roomIndex]??"").trim().toUpperCase(),line=first+offset+2;
    if(!block||!room){issues.push({line,message:"Block and Room are required."});return;}
    if(!["A","B","C","D"].includes(block)){issues.push({line,message:"Block must be A, B, C, or D."});return;}
    entries.push({block,room,area:at(row,"area"),item:at(row,"item"),issue:at(row,"issue"),exactLocation:exactIndex<0?"":String(row[exactIndex]??"").trim()});
  });
  return {entries,issues};
}
function pastedRows(text:string){return text.split(/\r?\n/).filter(Boolean).map((line)=>line.includes("\t")?line.split("\t"):line.split(","));}

export function BatchCheckoutImport(){
  const [entries,setEntries]=useState<Entry[]>([]);
  const [issues,setIssues]=useState<RowIssue[]>([]);
  const [fileName,setFileName]=useState("");
  const [paste,setPaste]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const result=useMemo(()=>{
    const roomMap=new Map<string,Entry[]>();
    entries.forEach((entry)=>{const key=entry.block+"|"+entry.room;roomMap.set(key,[...(roomMap.get(key)||[]),entry]);});
    const rooms=[...roomMap.entries()].map(([key,values])=>({key,block:values[0].block,room:values[0].room,defects:values.map(asDefect).filter(Boolean)}));
    return {rooms};
  },[entries]);
  async function uploadFile(file?:File){
    if(!file)return;
    setSubmitted(false);setFileName(file.name);setPaste("");
    try{
      const workbook=XLSX.read(await file.arrayBuffer(),{type:"array"});
      const firstSheet=workbook.SheetNames[0];
      if(!firstSheet)throw new Error("The uploaded file has no worksheet.");
      const rows=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet],{header:1,defval:"",raw:false});
      const parsed=entriesFromRows(rows);
      setEntries(parsed.entries);setIssues(parsed.issues);
    }catch(error){setEntries([]);setIssues([{line:0,message:error instanceof Error?error.message:"Unable to read this file."}]);}
  }
  function readPaste(){const parsed=entriesFromRows(pastedRows(paste));setEntries(parsed.entries);setIssues(parsed.issues);setFileName("Pasted data");setSubmitted(false);}
  return <div className="batch-import">
    <input type="hidden" name="batchRowsJson" value={JSON.stringify(entries)}/>
    <div className="batch-import-help"><strong>1. Upload your Excel file</strong><span>Use the KLGCR template. The App reads the first worksheet and checks every row before anything is created.</span></div>
    <label className="file-upload"><span>Choose Excel / CSV file</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(event)=>uploadFile(event.target.files?.[0])}/></label>
    {fileName&&<p className="subtle"><strong>Selected:</strong> {fileName}</p>}
    <details className="batch-import-preview"><summary>Or paste data from Excel instead</summary><textarea value={paste} onChange={(event)=>setPaste(event.target.value)} rows={6} placeholder="Paste the copied rows here"/><button className="button secondary" type="button" onClick={readPaste}>Read pasted data</button></details>
    <div className="batch-import-summary"><span><strong>{result.rooms.length}</strong> rooms</span><span><strong>{result.rooms.reduce((total,room)=>total+room.defects.length,0)}</strong> defects</span><span><strong>{issues.length}</strong> row errors</span></div>
    {!!issues.length&&<div className="error">{issues.slice(0,8).map((issue,index)=><div key={issue.line+"-"+index}>{issue.line?("Line "+issue.line+": "):""}{issue.message}</div>)}</div>}
    {!!result.rooms.length&&<details className="batch-import-preview" open><summary>Preview {result.rooms.length} rooms before creating</summary><div className="table-wrap"><table className="table"><thead><tr><th>Block</th><th>Room</th><th>Defects</th></tr></thead><tbody>{result.rooms.slice(0,50).map((room)=><tr key={room.key}><td>Block {room.block}</td><td>{room.room}</td><td>{room.defects.length?room.defects.join(" | "):"No reported defect — send to second inspection"}</td></tr>)}</tbody></table></div>{result.rooms.length>50&&<p className="subtle">Preview shows the first 50 rooms. All {result.rooms.length} rooms will be created after confirmation.</p>}</details>}
    <button className="button" type="submit" disabled={!result.rooms.length||!!issues.length||submitted} onClick={()=>setSubmitted(true)}>{submitted?"Creating batch…":"Create check-out batch"}</button>
  </div>;
}
