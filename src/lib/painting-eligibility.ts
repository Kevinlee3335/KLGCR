// Painting work requires a recorded surface defect, not just any room defect.
export function isPaintingDefect(defect:{description:string;status:string}){
 if(defect.status!=='open')return false;
 return /\bpaint(?:ing)?\b|\bmou?ld(?:y)?\b|\b(?:wall|ceiling)\b.*(?:stain|dirty|peel|damp|water\s*mark|seepage)|(?:stain|dirty|peel|damp|water\s*mark|seepage).*\b(?:wall|ceiling)\b/i.test(defect.description);
}

export function pendingPaintingRooms<T extends {id:string;status:string;defects:{description:string;status:string}[]}>(rooms:T[],tasks:{status:string;room:{id:string}|null}[]):T[]{
 const active=new Set(tasks.filter(t=>['assigned','in_progress'].includes(t.status)).map(t=>t.room?.id));
 return rooms.filter(r=>r.status!=='ready_for_occupancy'&&!active.has(r.id)&&r.defects.some(isPaintingDefect));
}
