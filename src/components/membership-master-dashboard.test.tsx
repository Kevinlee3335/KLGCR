import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {MembershipMasterDashboard} from './membership-master-dashboard';
beforeAll(()=>{HTMLDialogElement.prototype.showModal=vi.fn();HTMLDialogElement.prototype.close=vi.fn();});
const data={months:['2026-09','2026-10','2026-11'],records:[{id:5,name:'Kevin',originalName:'Kevin (KLGCR / 123)',serial:'2026-01',reference:'A-10',status:'ACTIVE',fees:{'2026-10':40,'2026-11':40}},{id:6,name:'Mary',originalName:'Mary',serial:'2026-02',reference:'GYM01',status:'REFUNDED',fees:{'2026-09':40}}]};
describe('membership master workspace',()=>{
 it('filters the current month, searches notes and opens annual history',()=>{
 render(<MembershipMasterDashboard data={data} initialMonth="2026-10"/>);
 fireEvent.click(screen.getByRole('button',{name:'Payment recorded 1'}));expect(screen.queryByRole('button',{name:'View Mary'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Search members'),{target:{value:'123'}});fireEvent.click(screen.getByRole('button',{name:'View Kevin'}));
 const dialog=screen.getByRole('dialog',{hidden:true});expect(within(dialog).getByText('RM 80.00')).toBeInTheDocument();expect(within(dialog).getByText('Kevin (KLGCR / 123)')).toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('Close member details'));expect(screen.queryByRole('dialog',{hidden:true})).not.toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('Clear search'));fireEvent.change(screen.getByLabelText('Membership month'),{target:{value:'2026-09'}});expect(screen.getByRole('button',{name:'View Mary'})).toBeInTheDocument();expect(screen.queryByRole('button',{name:'View Kevin'})).not.toBeInTheDocument();
 });
});
