import {render,screen,fireEvent} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {CameraFileInput} from './camera-file-input';
it('camera selection reaches the existing receipt field and its React handler',()=>{
 const selected=vi.fn();
 render(<CameraFileInput name="receipt" aria-label="Payment receipt" onChange={selected}/>);
 const input=screen.getByLabelText('Payment receipt') as HTMLInputElement;
 Object.defineProperty(input,'files',{value:[],writable:true});
 vi.stubGlobal('DataTransfer',class {files:File[]=[];items={add:(file:File)=>this.files.push(file)}});
 const photo=new File(['photo'],'camera.jpg',{type:'image/jpeg'});
 const camera=screen.getByLabelText('Take photo for Payment receipt');
 expect(camera).toHaveAttribute('capture','environment');
 fireEvent.change(camera,{target:{files:[photo]}});
 expect(input.files?.[0]).toBe(photo);expect(selected).toHaveBeenCalledTimes(1);
 vi.unstubAllGlobals();
});
it('keeps seven consecutive camera selections for a multiple-file field',()=>{
 render(<CameraFileInput aria-label="Documents" multiple/>);
 const input=screen.getByLabelText('Documents') as HTMLInputElement;
 Object.defineProperty(input,'files',{value:[],writable:true});
 vi.stubGlobal('DataTransfer',class {files:File[]=[];items={add:(file:File)=>this.files.push(file)}});
 for(let i=0;i<7;i++)fireEvent.change(screen.getByLabelText('Take photo for Documents'),{target:{files:[new File(['photo'],`${i}.jpg`,{type:'image/jpeg'})]}});
 expect(input.files).toHaveLength(7);
 vi.unstubAllGlobals();
});
