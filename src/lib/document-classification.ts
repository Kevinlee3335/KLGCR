export const documentCategories = [
  'Bomba Approved Plans', 'Approved Passive Plans', 'Fire Protection Systems',
  'Room Layout & Information', 'Room Photos & Mock-ups', 'Site Plans & Survey',
  'Furniture & Damage Charges', 'Lift Documents', 'Clinic Plans', 'Other Documents',
] as const;
export type DocumentCategory = typeof documentCategories[number];
export function classifyDocument(name: string) {
  const value = name.toLowerCase();
  let category: DocumentCategory = 'Other Documents';
  if (value.includes('approved bomba plan')) category = 'Bomba Approved Plans';
  else if (value.includes('approved passive plan')) category = 'Approved Passive Plans';
  else if (/key.*location.*layout plan|pelan pra|pengukuran/.test(value)) category = 'Site Plans & Survey';
  else if (/fire alarm|hydrant|hosereel|breaching|water tank.*pump|schematic.*(mrs|main panels)/.test(value)) category = 'Fire Protection Systems';
  else if (/legend layout|floor layout|room numbering|room type/.test(value)) category = 'Room Layout & Information';
  else if (/mock up|mock-up/.test(value)) category = 'Room Photos & Mock-ups';
  else if (/damage or loss|furniture.*charge/.test(value)) category = 'Furniture & Damage Charges';
  else if (/elevator|\bpma\b/.test(value)) category = 'Lift Documents';
  else if (/clinic/.test(value)) category = 'Clinic Plans';
  const blocks = /block\s*abcd\b/.test(value) ? ['A','B','C','D'] : [...value.matchAll(/block\s*([a-d])\b/g)].map(match => match[1].toUpperCase());
  const levels: number[] = [];
  const levelText = value.match(/\blevel\s+(.+?)(?:floor|\.|roof|\(|$)/i)?.[1] || '';
  const range = levelText.match(/(\d+)\s*(?:to|-)\s*(?:level\s*)?(\d+)/);
  if (range) { for(let n = Number(range[1]); n <= Math.min(Number(range[2]),50); n++) levels.push(n); }
  for (const number of levelText.matchAll(/\d+/g)) { const n = Number(number[0]); if (!levels.includes(n)) levels.push(n); }
  const roof = /roof|lift motor room|\bmotor room\b/.test(value);
  const extension = value.split('.').pop() || '';
  const format = extension === 'pdf' ? 'PDF' : /^(xlsx?|csv)$/.test(extension) ? 'Excel' : /^(png|jpe?g|webp)$/.test(extension) ? 'Images' : /^(docx?)$/.test(extension) ? 'Word' : /^(dwg|dxf)$/.test(extension) ? 'CAD' : 'Other';
  return {category, blocks, levels, roof, format};
}
