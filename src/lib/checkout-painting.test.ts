import {expect,it} from 'vitest';
import {isPaintingDefect,paintingArea} from './checkout-painting';
it('includes both room and bathroom paint candidates without treating every dirty fixture as paint work',()=>{
 for(const d of ['Room · Wall · Moldy','Bathroom · Ceiling · Mouldy','Bathroom · Wall · Wall Stain','Room · Wall · Dirty','Repaint bathroom'])expect(isPaintingDefect(d)).toBe(true);
 for(const d of ['Room · Curtain · Dirty','Bathroom · Toilet Seat · Dirty','No Defect','Bathroom · Pipe · Leaking'])expect(isPaintingDefect(d)).toBe(false);
 expect(paintingArea('Bathroom · Ceiling · Moldy')).toBe('Bathroom');expect(paintingArea('Room · Wall · Dirty')).toBe('Room');
});
