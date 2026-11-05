// @vitest-environment node
import {expect,it} from 'vitest';
import {generatePaintingList} from './painting-list';
it('matches the supplied WhatsApp painting list format',()=>{
 const notes=['Wall damp checked & painting','','Wall damp checked & painting','Wall damp checked','Wall damp checked','Wall damp checked','','Wall damp checked','Wall damp checked'];
 const rooms=['720','528','518','514','507','506','412','405','401'];
 expect(generatePaintingList(rooms.map((room,i)=>({block:'A',room,date:'2026-06-22',notes:notes[i]})),'Kevin')).toBe(`🎨🔴 Room with painting work - Block A (PIC Kevin)

- 22/06/2026
1. A720 - Wall damp checked & painting
2. A528
3. A518 - Wall damp checked & painting
4. A514 - Wall damp checked
5. A507 - Wall damp checked
6. A506 - Wall damp checked
7. A412
8. A405 - Wall damp checked
9. A401 - Wall damp checked`);
});
it('groups blocks and dates and lists a room once per date',()=>{
 const text=generatePaintingList([{block:'A',room:'A-720',date:'2026-06-22',notes:'Room paint'},{block:'A',room:'720',date:'2026-06-22',notes:'Bathroom paint'},{block:'B',room:'101',date:'2026-06-23',reasons:['Moldy']}],'Kevin');
 expect(text).toContain('1. A720 - Room paint; Bathroom paint');expect(text).not.toContain('2. A720');expect(text).toContain('🎨🔴 Room with painting work - Block B (PIC Kevin)\n\n- 23/06/2026\n1. B101 - Moldy');
});
it('includes every room only once even across work dates',()=>{
 const text=generatePaintingList([{block:'A',room:'720',date:'2026-06-21',reasons:['Wall stain']},{block:'A',room:'A720',date:'2026-06-22',reasons:['Moldy']},{block:'B',room:'101',date:'2026-06-20'}],'Kevin');
 expect(text.match(/A720/g)).toHaveLength(1);expect(text).toContain('Wall stain');expect(text).toContain('Moldy');expect(text).toContain('B101');
});
