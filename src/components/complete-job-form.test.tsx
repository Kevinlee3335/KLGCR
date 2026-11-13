import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn(),upload:vi.fn(),preparePhotos:vi.fn()}));
vi.mock('@/app/(dashboard)/staff/jobs/actions',()=>({prepareCompletionUploads:mocks.prepare,completeJob:mocks.complete}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:mocks.upload})}})}));
vi.mock('@/lib/operational-evidence-compression',()=>({prepareOperationalEvidencePhotos:mocks.preparePhotos}));
import { CompleteJobForm } from './complete-job-form';
beforeAll(()=>{URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();});
beforeEach(()=>{vi.clearAllMocks();mocks.prepare.mockImplementation(async(_jobId,files:Array<{type:string}>)=>({uploads:files.map((_,i)=>({path:`photo-${i}`,token:'token'}))}));mocks.upload.mockResolvedValue({error:null});mocks.complete.mockResolvedValue({error:'Test saved'});mocks.preparePhotos.mockImplementation(async(files:File[])=>files);});
function addAndSubmit(count:number,onPendingApproval=vi.fn()){render(<CompleteJobForm jobId="job" returnTo="/staff/tasks" onPendingApproval={onPendingApproval}/>);fireEvent.change(screen.getByLabelText('Upload Photos'),{target:{files:Array.from({length:count},(_,i)=>new File(['data'],`${i}.jpg`,{type:'image/jpeg'}))}});fireEvent.change(screen.getByRole('textbox'),{target:{value:'Completed repair'}});fireEvent.submit(screen.getByRole('button',{name:'Confirm completion'}).closest('form')!);}
it('prepares 20 original photos in one action and submits their paths in selection order',async()=>{
  addAndSubmit(20);
  await waitFor(()=>expect(mocks.complete).toHaveBeenCalledTimes(1));
  expect(mocks.prepare).toHaveBeenCalledTimes(1);
  expect(mocks.prepare.mock.calls[0][1]).toHaveLength(20);
  expect(mocks.upload).toHaveBeenCalledTimes(20);
  expect(mocks.upload.mock.calls[19][2]).toMatchObject({name:'19.jpg',size:4,type:'image/jpeg'});
  const data=mocks.complete.mock.calls[0][1] as FormData;
  expect(data.getAll('completionPhotoPaths')).toEqual(Array.from({length:20},(_,i)=>`photo-${i}`));
  expect(data.getAll('completionPhotos')).toHaveLength(0);
});

it('signs and uploads the prepared file while keeping the selected photo for retry',async()=>{
  const prepared = new File(['x'], '0.jpg', {type:'image/jpeg'});
  mocks.preparePhotos.mockResolvedValueOnce([prepared]);
  addAndSubmit(1);
  await waitFor(()=>expect(mocks.complete).toHaveBeenCalledTimes(1));
  expect(mocks.prepare).toHaveBeenCalledWith('job',[{type:'image/jpeg',size:1}]);
  expect(mocks.upload.mock.calls[0][2]).toBe(prepared);
  expect(mocks.preparePhotos.mock.calls[0][0][0]).toMatchObject({name:'0.jpg',size:4});
  expect(screen.getByText('1 / 20 photos selected')).toBeInTheDocument();
});

it('starts three transfers together, waits for active requests, and retains the form on failure',async()=>{
  let finishUpload!: (result: {error: null})=>void;
  mocks.upload.mockResolvedValueOnce({error:null})
    .mockResolvedValueOnce({error:{message:'Network lost'}})
    .mockImplementationOnce(()=>new Promise(resolve=>{finishUpload=resolve;}));
  addAndSubmit(7);
  await waitFor(()=>expect(mocks.upload).toHaveBeenCalledTimes(3));
  expect(screen.getByRole('button',{name:'Completing…'})).toBeDisabled();
  expect(mocks.complete).not.toHaveBeenCalled();
  finishUpload({error:null});
  await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Network lost'));
  expect(mocks.upload).toHaveBeenCalledTimes(3);
  expect(mocks.complete).not.toHaveBeenCalled();
  expect(screen.getByText('7 / 20 photos selected')).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('Completed repair');
});

it.each(['prepare', 'complete'] as const)('reports a pending approval found by %s and keeps the selected evidence', async (step) => {
  const onPendingApproval = vi.fn();
  mocks[step].mockResolvedValueOnce({ pendingApproval: true });
  addAndSubmit(1, onPendingApproval);
  await waitFor(() => expect(onPendingApproval).toHaveBeenCalledTimes(1));
  expect(mocks.upload).toHaveBeenCalledTimes(step === 'prepare' ? 0 : 1);
  expect(mocks.complete).toHaveBeenCalledTimes(step === 'prepare' ? 0 : 1);
  expect(screen.getByRole('button', { name: 'Confirm completion' })).toBeEnabled();
  expect(screen.getByRole('textbox')).toHaveValue('Completed repair');
  expect(screen.getByText('1 / 20 photos selected')).toBeInTheDocument();
});
