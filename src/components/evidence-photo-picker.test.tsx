import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';
import { EvidencePhotoPicker } from './evidence-photo-picker';
beforeAll(() => { URL.createObjectURL=vi.fn(()=> 'blob:test'); URL.revokeObjectURL=vi.fn(); });
function Harness(){const [photos,setPhotos]=useState<File[]>([]);return <EvidencePhotoPicker photos={photos} onChange={setPhotos}/>;}
const file=(i:number)=>new File([`photo${i}`],`photo${i}.jpg`,{type:'image/jpeg'});
it('keeps seven successive camera shots, adds gallery photos through 20, and supports removing and re-adding',()=>{
 render(<Harness/>);
 const camera=screen.getByLabelText('Take Photo'),gallery=screen.getByLabelText('Upload Photos');
 expect(gallery).toHaveAttribute('multiple');expect(gallery).not.toHaveAttribute('capture');
 for(let i=0;i<7;i++)fireEvent.change(camera,{target:{files:[file(i)]}});
 expect(screen.getByRole('status')).toHaveTextContent('7 / 20');
 expect(screen.getAllByRole('img')).toHaveLength(7);
 fireEvent.change(gallery,{target:{files:Array.from({length:13},(_,i)=>file(i+7))}});
 expect(screen.getByRole('status')).toHaveTextContent('20 / 20');
 expect(camera).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'Remove photo 1'}));
 expect(screen.getByRole('status')).toHaveTextContent('19 / 20');
 expect(camera).not.toBeDisabled();
 fireEvent.change(gallery,{target:{files:[file(21),file(22)]}});
 expect(screen.getByRole('alert')).toHaveTextContent('1 and 20');
 expect(screen.getByRole('status')).toHaveTextContent('19 / 20');
});
