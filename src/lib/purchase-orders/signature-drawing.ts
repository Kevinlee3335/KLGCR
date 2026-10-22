import type {Signature} from './signature';
type Point=Signature['strokes'][number][number];
// Rounded midpoint curves suppress pointer jitter. The same points are saved,
// previewed and printed, so the PDF does not straighten the signature again.
export function smoothSignatureStroke(raw:Point[]):Point[]{
 const points=raw.length>280?Array.from({length:280},(_,i)=>raw[Math.round(i*(raw.length-1)/279)]):raw;
 if(points.length<3)return points.map(p=>[...p] as Point);
 const result:Point[]=[[...points[0]]];let start=points[0];
 for(let i=1;i<points.length;i++){
  const control=points[i-1],end:Point=[(control[0]+points[i][0])/2,(control[1]+points[i][1])/2];
  for(const t of [0.5,1])result.push([(1-t)**2*start[0]+2*(1-t)*t*control[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*control[1]+t*t*end[1]]);
  start=end;
 }
 result.push([...points.at(-1)!]);return result;
}
export function signaturePoint(clientX:number,clientY:number,rect:{left:number;top:number;width:number;height:number},border=0):Point{
 return [Math.max(0,Math.min(1,(clientX-rect.left-border)/Math.max(1,rect.width-2*border))),Math.max(0,Math.min(1,(clientY-rect.top-border)/Math.max(1,rect.height-2*border)))];
}
