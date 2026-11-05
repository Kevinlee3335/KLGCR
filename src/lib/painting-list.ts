export type PaintingListRoom={block:string;room:string;date:string;notes?:string|null;reasons?:string[]};
export function generatePaintingList(rows:PaintingListRoom[],pic:string){
 const unique=new Map<string,PaintingListRoom>();
 for(const row of rows){const key=`${row.block.toUpperCase()}:${row.room.toUpperCase().replace(/[-\s]/g,'').replace(new RegExp(`^${row.block}`,'i'),'')}`;const old=unique.get(key);if(!old){unique.set(key,{...row});continue;}const notes=new Set([...(old.notes?.split('; ')||[old.reasons?.join(', ')||'']),row.notes?.trim()||row.reasons?.join(', ')||''].filter(Boolean));unique.set(key,{...old,date:row.date>old.date?row.date:old.date,notes:[...notes].join('; ')});}
 rows=[...unique.values()];
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
