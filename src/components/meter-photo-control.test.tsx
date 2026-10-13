import { afterEach,describe,it,expect,vi } from "vitest";
import { render,screen,fireEvent } from "@testing-library/react";
import { MeterPhotoControl } from './meter-photo-control';
afterEach(()=>vi.restoreAllMocks());
describe('desktop meter camera',()=>{
 it('captures a JPG and releases the webcam before handing the photo to upload',async()=>{
  const stop=vi.fn(),onPhoto=vi.fn();
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop}]}))}});
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new Blob(['jpg'],{type:'image/jpeg'})));
  render(<MeterPhotoControl label="Meter" busy={false} onPhoto={onPhoto}/>);
  fireEvent.click(screen.getByRole('button',{name:'Take photo for Meter'}));
  await screen.findByRole('dialog',{name:'Camera for Meter'});
  const video=document.querySelector('video')!;Object.defineProperty(video,'videoWidth',{value:640});Object.defineProperty(video,'videoHeight',{value:480});
  fireEvent.click(screen.getByRole('button',{name:'Capture photo'}));
  await vi.waitFor(()=>expect(onPhoto).toHaveBeenCalledOnce());expect(onPhoto.mock.calls[0][0].type).toBe('image/jpeg');expect(stop).toHaveBeenCalledOnce();
 });
});
