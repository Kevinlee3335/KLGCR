import {describe,it,expect} from 'vitest';
import {classifyDocument} from './document-classification';
describe('document classification',()=>{
 it('keeps approved drawing sets distinct from equipment documents',()=>{
  expect(classifyDocument('Block D (Approved Bomba Plan) - Roof Plan & Lift Motor Room.pdf').category).toBe('Bomba Approved Plans');
  expect(classifyDocument('7. Block A Lift Motor Room & Roof Plan ((Approved Passive Plan).pdf').category).toBe('Approved Passive Plans');
  expect(classifyDocument('KLG Elevator PMA Series Number.pdf').category).toBe('Lift Documents');
  expect(classifyDocument('1. Key, Location & Layout Plan (Approval).pdf').category).toBe('Site Plans & Survey');
  expect(classifyDocument('29. Schematic Details of Main Panels (Approval).pdf').category).toBe('Fire Protection Systems');
 });
 it.each([
  ['Block D (Approved Bomba Plan) - Level 4 - 6.pdf',[4,5,6]],
  ['11. Block B Level 7 to Level 8 Floor Plan (Approved Passive Plan).pdf',[7,8]],
  ['Legend layout for Block A - Level 2, 3, 4 and 5.xlsx',[2,3,4,5]],
  ['Legend layout for Block C - Level 3, 4, 5 & 6.xlsx',[3,4,5,6]],
 ])('recognises all floors in %s',(name,levels)=>{expect(classifyDocument(name).levels).toEqual(levels);});
 it('includes whole-site spreadsheets in each block and handles uppercase extensions',()=>{
  expect(classifyDocument('Block ABCD with Room Numbering and Room Type.xlsx')).toMatchObject({blocks:['A','B','C','D'],format:'Excel',category:'Room Layout & Information'});
  expect(classifyDocument('Mock up for triple sharing - 1.JPG')).toMatchObject({format:'Images',category:'Room Photos & Mock-ups'});
  expect(classifyDocument('New unknown file.docx').category).toBe('Other Documents');
 });
});
