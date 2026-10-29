// @vitest-environment node
import {expect,it} from 'vitest';
import {isPaintingDefect} from './painting-eligibility';
it.each(['No Defect','Room · Door Handle · Loose','Ceiling gap','Bathroom · Door Knob · Loose','Sink trap loose','Bathroom · Water Tap / Sink Tap · Slow Pressure','Shower head low pressure','Curtain · Dirty','Toilet Seat · Dirty'])('excludes non-painting defect %s',description=>expect(isPaintingDefect({description,status:'open'})).toBe(false));
it.each(['Room · Wall · Mouldy','Ceiling moldy','Wall & ceiling stain','Wall stain','Room · Wall · Water Seepage','Wall dirty','Ceiling watermark','Door needs painting'])('includes painting defect %s',description=>expect(isPaintingDefect({description,status:'open'})).toBe(true));
it('excludes repaired painting defects',()=>expect(isPaintingDefect({description:'Wall stain',status:'rectified'})).toBe(false));
