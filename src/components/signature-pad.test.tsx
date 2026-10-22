import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,afterEach} from 'vitest';
import {SignaturePad} from './signature-pad';
afterEach(()=>vi.restoreAllMocks());
it('loads an existing signature and prevents saving an empty replacement',async()=>{
 const fetcher=vi.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({signature:{strokes:[[[0.1,0.2],[0.7,0.6]]]}})} as Response);
 render(<SignaturePad/>);
 expect(await screen.findByRole('img',{name:'Your saved signature'})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Change Signature'}));
 fireEvent.click(screen.getByRole('button',{name:'Save My Signature'}));
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Draw your signature first'));
 expect(fetcher).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}));
 expect(screen.getByRole('img',{name:'Your saved signature'})).toBeInTheDocument();
});
