import {render,screen} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
const db=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>db}));
vi.mock('./supplier-document-button',()=>({SupplierDocumentButton:({id}:{id:string})=><button data-document={id}>Open PDF</button>}));
import {SupplierPriceHistory} from './supplier-price-history';
it('shows the three most recent item prices with the corresponding document buttons',async()=>{
 const docs=[2023,2024,2025,2026].map((year,i)=>({
  id:'doc'+i,company:'mfe',folder:'Quotation',file_name:'file.pdf',
  content_text:`Our Ref. :SQ${year} Date : 01.02.${year}\n1. Hose Reel Nozzle 2 NO RM ${50+i}.00 RM ${100+i*2}.00`,
  supplier_mail_attachments:[{supplier_emails:{received_at:year+'-02-02'}}]
 }));
 db.rpc.mockResolvedValue({data:docs.map(d=>({id:d.id})),error:null});
 db.from.mockReturnValue({select:()=>({in:async()=>({data:docs,error:null})})});
 render(await SupplierPriceHistory({company:'mfe',query:'norzel'}));
 const buttons=screen.getAllByRole('button',{name:'Open PDF'});
 expect(buttons.map(b=>b.getAttribute('data-document'))).toEqual(['doc3','doc2','doc1']);
 expect(screen.getAllByText('RM 53.00 / unit')).toHaveLength(1);
 expect(screen.queryByText(/SQ2023/)).toBeNull();
 expect(screen.getByText(/Latest 3/)).toBeTruthy();
});
