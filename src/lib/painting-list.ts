export type PaintingListRoom={block:string;room:string;date:string;notes?:string|null;reasons?:string[]};
export function generatePaintingList(rows:PaintingListRoom[],pic:string){
 const blocks=[...new Set(rows.map(r=>r.block))].sort();
 return blocks.map(block=>{
  const blockRows=rows.filter(r=>r.block===block);
  const dates=[...new Set(blockRows.map(r=>r.date))].sort().reverse();
  return [`🎨🔴 Room with painting work - Block ${block} (PIC ${pic.trim()})`,...dates.map(date=>{
   const [year,month,day]=date.split('-');
   const rooms=new Map<string,Set<string>>();
   for(const r of blockRows.filter(r=>r.date===date)){
    const raw=r.room.trim();const code=raw.toUpperCase().startsWith(block.toUpperCase())?raw.replace(/[-\s]/g,''):`${block}${raw.replace(/[-\s]/g,'')}`;
    const notes=rooms.get(code)||new Set<string>();const note=(r.notes?.trim()||r.reasons?.join(', ')||'').replace(/\s+/g,' ');if(note)notes.add(note);rooms.set(code,notes);
   }
   const lines=[...rooms].sort(([a],[b])=>b.localeCompare(a,undefined,{numeric:true})).map(([room,notes],i)=>`${i+1}. ${room}${notes.size?' - '+[...notes].join('; '):''}`);
   return `- ${day}/${month}/${year}\n${lines.join('\n')}`;
  })].join('\n\n');
 }).join('\n\n');
}
