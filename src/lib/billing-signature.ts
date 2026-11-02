import type {Verification} from './document-review';
import {signaturePhotoBounds} from './signature-image-layout';
import {companySealDataUrl} from './company-seal';
import type {BillingSnapshot} from './billing-preview';
import {BILLING_APPROVER_ID} from './billing-approval';
import {signatureSchema} from './purchase-orders/signature';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function billingSignatureSvg(snapshot:BillingSnapshot,box?:{x:number;y:number;width:number;height:number},verifications?:Verification[]){
 const approval=snapshot.approval,parsed=signatureSchema.safeParse(approval?.signature);
 const approved=approval?.approved_by_user===BILLING_APPROVER_ID&&Number.isFinite(Date.parse(approval.approved_at))&&parsed.success;
 if(!approved&&verifications===undefined)return '';
 if(approval?.verifications?.length===2||verifications!==undefined){
   const verified=approved?approval?.verifications||[]:verifications||[];
   const slots=[{name:'Verified by Fikri',date:verified[0]?.verified_at,signature:verified[0]?.signature},{name:'Verified by Kevin',date:verified[1]?.verified_at,signature:verified[1]?.signature},{name:'Approved by James',date:approved?approval?.approved_at:undefined,signature:approved&&parsed.success?parsed.data:undefined}];
   const blocks=slots.map((slot,i)=>{
     const valid=signatureSchema.safeParse(slot.signature);
     const x=i*600;
     if(!valid.success)return `<text x="${x}" y="30" font-family="Arial" font-size="26">${esc(slot.name)}</text><text x="${x}" y="145" font-family="Arial" font-size="22">Pending</text><path d="M${x} 205H${x+565}" fill="none" stroke="#333" stroke-width="1.5"/>`;
     const sig=valid.data;
     const bounds=sig.imageDataUrl?signaturePhotoBounds(sig.imageDataUrl):null;
     const ink=sig.imageDataUrl&&bounds?`<svg x="${x}" y="55" width="420" height="140" viewBox="${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}" preserveAspectRatio="xMidYMid meet"><image href="${esc(sig.imageDataUrl)}" width="${bounds.imageWidth}" height="${bounds.imageHeight}"/></svg>`:sig.strokes.map(stroke=>`<polyline points="${stroke.map(([px,py])=>`${x+px*420},${55+py*140}`).join(' ')}" fill="none" stroke="black" stroke-width="2.4"/>`).join('');
     return `<text x="${x}" y="30" font-family="Arial" font-size="26">${esc(slot.name)}</text>${ink}<path d="M${x} 205H${x+565}" fill="none" stroke="#333" stroke-width="1.5"/><text x="${x}" y="235" font-family="Arial" font-size="22">${esc(new Date(slot.date!).toLocaleDateString('en-GB',{timeZone:'Asia/Kuala_Lumpur'}))}</text>${i===2&&approved?`<image href="${companySealDataUrl}" x="${x+430}" y="55" width="135" height="135"/>`:''}`;
   }).join('');
   const position=box?`x="${Math.max(25,box.x-330)}" y="${box.y}" width="${box.width+330}" height="${Math.max(60,box.height)}"`:'style="display:block;width:100%;height:100%"';
   return `<svg xmlns="http://www.w3.org/2000/svg" ${position} viewBox="0 0 1800 250" role="img" aria-label="Fikri and Kevin verification, James approval">${blocks}</svg>`;
 }
 if(!parsed.success)return '';
 const sig=parsed.data,content=sig.imageDataUrl?`<image href="${esc(sig.imageDataUrl)}" x="0" y="0" width="600" height="180" preserveAspectRatio="xMidYMid meet"/>`:sig.strokes.map(s=>`<polyline points="${s.map(([x,y])=>`${x*600},${y*180}`).join(' ')}" fill="none" stroke="#17212c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
 const position=box?`x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"`:'style="display:block;width:100%;height:100%"';
 return `<svg xmlns="http://www.w3.org/2000/svg" ${position} viewBox="0 0 790 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="James approval signature">${content}<image href="${companySealDataUrl}" x="610" width="175" height="175"/></svg>`;
}
// Original Excel signature lines, in the source SVG's A4 coordinate system.
const lines:Record<string,[number,number,number]>={
 'bungalow-l3':[342.39,695.5688,173.17],umart:[363.329,659.9198,180.358],
 laundrette:[370.378,715.9428,177.854],'mmf-cafe':[359.635,615.3458,171.024],
 'bungalow-l2':[356.197,659.5978,174.747],norhenany:[359.635,615.3458,171.024],
 'emma-omar':[364.268,659.9198,183.787]
};
export function utilitySignatureOverlay(id:string,snapshot:BillingSnapshot,verifications?:Verification[]){
 const original=lines[id];
 if(original){const [x,y,width]=original;return billingSignatureSvg(snapshot,{x:x+4,y:y-43,width:width-8,height:40},verifications);}
 // The three original statement sheets have no signature block. Match the invoice block in their unused footer.
 const x=360,y=680,width=174;
 return `<g class="billing-statement-signature"><text x="${x}" y="620" font-family="Arial" font-size="8" font-weight="bold">K HOTEL SDN BHD</text><path d="M${x} ${y}H${x+width}" fill="none" stroke="black" stroke-width=".6"/><text x="${x+36}" y="692" font-family="Arial" font-size="8" font-weight="bold">(Authorised Signature)</text></g>`+billingSignatureSvg(snapshot,{x:x+4,y:y-43,width:width-8,height:40});
}
