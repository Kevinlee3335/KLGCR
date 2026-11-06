export type PaintingListRoom={block:string;room:string;date:string;notes?:string|null;reasons?:string[]};
export function generatePaintingList(rows:PaintingListRoom[],pic:string){
 const blocks=new Map<string,Set<string>>();
 for(const row of rows){
  const block=row.block.trim().toUpperCase();
  const raw=row.room.trim().toUpperCase().replace(/[-\s]/g,'');
  const room=raw.startsWith(block)?raw:`${block}${raw}`;
  if(!blocks.has(block))blocks.set(block,new Set());
  blocks.get(block)!.add(room);
 }
 return [...blocks.entries()].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([block,rooms])=>{
  const lines=[...rooms].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})).map((room,i)=>`${i+1}. ${room}`);
  return `🎨🔴 Room with painting work - Block ${block} (PIC ${pic.trim()})\n\n${lines.join('\n')}`;
 }).join('\n\n');
}
