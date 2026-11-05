// @vitest-environment node
import {expect,it} from 'vitest';
import {isPaintingDefect,pendingPaintingRooms} from './painting-eligibility';
it.each(['No Defect','Room · Door Handle · Loose','Ceiling gap','Bathroom · Door Knob · Loose','Sink trap loose','Bathroom · Water Tap / Sink Tap · Slow Pressure','Shower head low pressure','Curtain · Dirty','Toilet Seat · Dirty'])('excludes non-painting defect %s',description=>expect(isPaintingDefect({description,status:'open'})).toBe(false));
it.each(['Room · Wall · Mouldy','Ceiling moldy','Wall & ceiling stain','Wall stain','Room · Wall · Water Seepage','Wall dirty','Ceiling watermark','Door needs painting'])('includes painting defect %s',description=>expect(isPaintingDefect({description,status:'open'})).toBe(true));
it('excludes repaired painting defects',()=>expect(isPaintingDefect({description:'Wall stain',status:'rectified'})).toBe(false));

it('shows newly inspected painting rooms until assigned and permits new defects after old completed work',()=>{
 const rooms=['new','assigned','old','no-paint','ready'].map(id=>({id,status:id==='ready'?'ready_for_occupancy':'second_inspection',defects:[{description:id==='no-paint'?'Door handle loose':'Wall stain',status:'open'}]}));
 const tasks=[{status:'assigned',room:{id:'assigned'}},{status:'completed',room:{id:'old'}}];
 expect(pendingPaintingRooms(rooms,tasks).map(r=>r.id)).toEqual(['new','old']);
});
