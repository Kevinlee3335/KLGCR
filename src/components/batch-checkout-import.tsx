"use client";

import { useMemo, useState } from "react";

type Entry={block:string;room:string;area:string;item:string;issue:string;exactLocation:string};
type RowIssue={line:number;message:string};

function splitLine(line:string){return line.includes("\t")?line.split("\t"):line.split(",");}
function normalize(value:string){return value.trim().replace(/^block\s*/i,"").toUpperCase();}
function asDefect(entry:Entry){if(!entry.item&&!entry.issue)return "";const parts=[entry.area||"Room",entry.item].filter(Boolean).join(" · ");const issue=entry.issue?" — "+entry.issue:"";const location=entry.exactLocation?" · "+entry.exactLocation:"";return (parts||"Reported defect")+issue+location;}

export function BatchCheckoutImport(){
  const [text,setText]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const result=useMemo(()=>{
    const entries:Entry[]=[];const issues:RowIssue[]=[];
    const lines=text.split(/\r?\n/).map((line,index)=>({line,index:index+1})).filter(({line})=>line.trim());
    lines.forEach(({line,index})=>{
      const cells=splitLine(line).map((cell)=>cell.trim());
      if(index===1&&normalize(cells[0])==="BLOCK"&&cells[1]?.toLowerCase()==="room")return;
      const [block="",room="",area="",item="",issue="",exactLocation=""]=cells;
      if(!block||!room){issues.push({line:index,message:"Block and Room are required."});return;}
      const cleanBlock=normalize(block);
      if(!["A","B","C","D"].includes(cleanBlock)){issues.push({line:index,message:"Block must be A, B, C, or D."});return;}
      entries.push({block:cleanBlock,room:room.trim().toUpperCase(),area:area.trim(),item:item.trim(),issue:issue.trim(),exactLocation:exactLocation.trim()});
    });
    const roomMap=new Map<string,Entry[]>();
    entries.forEach((entry)=>{const key=entry.block+"|"+entry.room;roomMap.set(key,[...(roomMap.get(key)||[]),entry]);});
    const rooms=[...roomMap.entries()].map(([key,values])=>({key,block:values[0].block,room:values[0].room,defects:values.map(asDefect).filter(Boolean)}));
    return {entries,rooms,issues};
  },[text]);
  return <div className="batch-import">
    <input type="hidden" name="batchRowsJson" value={JSON.stringify(result.entries)}/>
    <div className="batch-import-help"><strong>Paste from Excel</strong><span>Columns: Block, Room, Area, Item, Issue, Exact Location. One line = one defect. Leave the last 4 columns empty for a room with no reported defect.</span></div>
    <textarea name="batchRows" value={text} onChange={(event)=>{setText(event.target.value);setSubmitted(false);}} rows={10} placeholder={"Block\tRoom\tArea\tItem\tIssue\tExact Location\nA\tA101\tRoom\tDoor Handle\tLoose\tNear entrance\nA\tA101\tBathroom\tWater Tap / Sink Tap\tLeaking\tUnder basin\nB\tB201"} />
    <div className="batch-import-summary">
      <span><strong>{result.rooms.length}</strong> rooms</span><span><strong>{result.rooms.reduce((total,room)=>total+room.defects.length,0)}</strong> defects</span><span><strong>{result.issues.length}</strong> row errors</span>
    </div>
    {!!result.issues.length&&<div className="error">{result.issues.slice(0,8).map((issue)=><div key={issue.line+"-"+issue.message}>Line {issue.line}: {issue.message}</div>)}</div>}
    {!!result.rooms.length&&<details className="batch-import-preview"><summary>Preview {result.rooms.length} rooms before creating</summary><div className="table-wrap"><table className="table"><thead><tr><th>Block</th><th>Room</th><th>Defects</th></tr></thead><tbody>{result.rooms.slice(0,50).map((room)=><tr key={room.key}><td>Block {room.block}</td><td>{room.room}</td><td>{room.defects.length?room.defects.join(" | "):"No reported defect — send to second inspection"}</td></tr>)}</tbody></table></div>{result.rooms.length>50&&<p className="subtle">Preview shows the first 50 rooms. All {result.rooms.length} rooms will be created after confirmation.</p>}</details>}
    <button className="button" type="submit" disabled={!result.rooms.length||!!result.issues.length||submitted} onClick={()=>setSubmitted(true)}>{submitted?"Creating batch…":"Create check-out batch"}</button>
  </div>;
}
