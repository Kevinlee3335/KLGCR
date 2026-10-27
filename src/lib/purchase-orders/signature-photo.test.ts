// @vitest-environment node
import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,writeFileSync} from 'node:fs';
import {PDFDocument,PDFDict,PDFName} from 'pdf-lib';
import {sampleSignaturePng} from '@/test/signature-image';
import {signatureSchema} from './signature';
import {purchaseOrderPdf} from './pdf';
import {initialRegistry} from '@/lib/quotations/model';
import {quotationPrintHtml} from '@/lib/quotations/print';
it('accepts bounded PNGs and existing drawings, and rejects empty or executable images',()=>{
 expect(signatureSchema.safeParse({strokes:[],imageDataUrl:sampleSignaturePng}).success).toBe(true);
 expect(signatureSchema.safeParse({strokes:[[[0,0],[1,1]]]}).success).toBe(true);
 for(const input of [{strokes:[]},{strokes:[],imageDataUrl:'data:image/svg+xml,<svg/>'},{strokes:[],imageDataUrl:'https://example.test/image.png'},{strokes:[[[0,0],[1,1]]],imageDataUrl:sampleSignaturePng}])expect(signatureSchema.safeParse(input).success).toBe(false);
});
it('persists PNG signatures and continues validating legacy drawings in Postgres',async()=>{
 const db=new PGlite();try{
 await db.exec('create table user_e_signatures(user_id uuid primary key,signature jsonb,updated_at timestamptz);');
 await db.exec(readFileSync('supabase/migrations/20261027065748_signature_photos.sql','utf8'));
 await db.exec('create trigger validate_e_signature before insert or update on user_e_signatures for each row execute function validate_e_signature();');
 const id=crypto.randomUUID(),drawing={strokes:[[[0,0],[1,1]]]};
 await db.query('insert into user_e_signatures(user_id,signature) values($1,$2)',[id,JSON.stringify(drawing)]);
 await db.query('update user_e_signatures set signature=$1 where user_id=$2',[JSON.stringify({strokes:[],imageDataUrl:sampleSignaturePng}),id]);
 expect((await db.query<{signature:{imageDataUrl:string}}>('select signature from user_e_signatures')).rows[0].signature.imageDataUrl).toBe(sampleSignaturePng);
 await expect(db.query('update user_e_signatures set signature=$1',[JSON.stringify({strokes:[],imageDataUrl:'data:image/png;base64,YmFk'})])).rejects.toThrow('PNG');
 }finally{await db.close();}
});
it('embeds uploaded signatures in PO PDF and both quotation print layouts',async()=>{
 const signature={strokes:[],imageDataUrl:sampleSignaturePng};
 const bytes=await purchaseOrderPdf({id:crypto.randomUUID(),po_no:'TEST-PHOTO',order_date:'2026-10-27',requested_by:'Test User',requested_date:'2026-10-27',approved_by:'Test Approver',approved_date:'2026-10-27',created_at:'2026-10-27T04:00:00Z',approved_at:'2026-10-27T04:00:00Z',requested_signature:signature,approved_signature:signature,items:[{itemId:crypto.randomUUID(),code:'OFF-0001',description:'Test Paper',unit:'RIM',specification:'',quantity:1,location:''}]});
 const pdf=await PDFDocument.load(bytes),images=pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'),PDFDict);expect(images?.keys().length).toBeGreaterThanOrEqual(3);
 const q={...initialRegistry().quotes[0],preparedSignature:signature,approvedSignature:signature};expect(quotationPrintHtml(q)).toContain('<image href="data:image/png;base64,');expect(quotationPrintHtml({...q,items:[...q.items,...q.items]})).toContain('<img src="data:image/png;base64,');
 writeFileSync('/tmp/klgcr-photo-signature-test.pdf',bytes);
});
