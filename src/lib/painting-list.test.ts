// @vitest-environment node
import {expect,it} from 'vitest';
import {generatePaintingList} from './painting-list';
it('groups by block, sorts rooms without dates, and removes duplicate room numbers',()=>{
 const result=generatePaintingList([
  {block:'B',room:'B-110',date:'2026-11-05',reasons:['Moldy']},
  {block:'A',room:'A-510',date:'2026-11-05'},
  {block:'A',room:'107',date:'2026-11-06'},
  {block:'A',room:'a107',date:'2026-11-05'},
  {block:'B',room:'105',date:'2026-11-06'},
 ],'Kevin');
 expect(result).toBe(`🎨🔴 Room with painting work - Block A (PIC Kevin)

1. A107
2. A510

🎨🩵 Room with painting work - Block B (PIC Kevin)

1. B105
2. B110`);
});
