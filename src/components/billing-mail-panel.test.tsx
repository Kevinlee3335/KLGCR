import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup,act} from '@testing-library/react';
import {BillingMailPanel} from './billing-mail-panel';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals()});
it('immediately acknowledges a click, disables the button while checking and shows success',async()=>{
 let finish!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})));
 render(<BillingMailPanel canManage/>);fireEvent.click(screen.getByRole('button',{name:'Check Gmail connection'}));
 expect(screen.getByRole('button',{name:'Checking…'})).toBeDisabled();expect(screen.getByRole('status')).toHaveTextContent('Checking Gmail connection');
 await act(async()=>finish(new Response(JSON.stringify({ready:true,checkedAt:'2026-10-28T08:00:00Z'}))));
 expect(screen.getByRole('status')).toHaveTextContent('Connected: klgcr.noreply@gmail.com');expect(screen.getByRole('button',{name:'Check Gmail connection'})).toBeEnabled();
});
it('shows the specific gateway error instead of leaving the status unchanged',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ready:false,error:'The website is still reaching an older Gmail gateway.'}))));render(<BillingMailPanel canManage/>);fireEvent.click(screen.getByRole('button',{name:'Check Gmail connection'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('older Gmail gateway'));expect(screen.getByRole('status')).toHaveTextContent('Connection needs attention')});
it('returns a useful message when the session has expired',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'Access denied'}),{status:403})));render(<BillingMailPanel canManage/>);fireEvent.click(screen.getByRole('button',{name:'Check Gmail connection'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('sign in with an Admin account'))});
it('times out a hung browser request and allows another attempt',async()=>{vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn((_url:string,options:RequestInit)=>new Promise((_resolve,reject)=>{options.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))})));render(<BillingMailPanel canManage/>);fireEvent.click(screen.getByRole('button',{name:'Check Gmail connection'}));await act(async()=>{await vi.advanceTimersByTimeAsync(25001)});expect(screen.getByRole('status')).toHaveTextContent('timed out');expect(screen.getByRole('button',{name:'Check Gmail connection'})).toBeEnabled()});
it('does not expose connection controls to read-only users',()=>{render(<BillingMailPanel/>);expect(screen.queryByRole('button',{name:'Check Gmail connection'})).toBeNull()});
