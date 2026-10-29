import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn(),upload:vi.fn()}));
vi.mock('@/app/(dashboard)/staff/jobs/actions',()=>({prepareCompletionUpload:mocks.prepare,completeJob:mocks.complete}));
vi.mock('@/lib/supabase/client',()=>({createClient:()=>({storage:{from:()=>({uploadToSignedUrl:mocks.upload})}})}));
import { CompleteJobForm } from './complete-job-form';
beforeAll(()=>{URL.createObjectURL=vi.fn(()=> 'blob:test');URL.revokeObjectURL=vi.fn();});
beforeEach(()=>{vi.clearAllMocks();mocks.prepare.mockImplementation(async()=>({path:crypto.randomUUID(),token:'token'}));mocks.upload.mockResolvedValue({error:null});mocks.complete.mockResolvedValue({error:'Test saved'});});
function addAndSubmit(count:number){render(<CompleteJobForm jobId="job" returnTo="/staff/tasks"/>);fireEvent.change(screen.getByLabelText('Upload Photos'),{target:{files:Array.from({length:count},(_,i)=>new File(['data'],`${i}.jpg`,{type:'image/jpeg'}))}});fireEvent.change(screen.getByRole('textbox'),{target:{value:'Completed repair'}});fireEvent.submit(screen.getByRole('button',{name:'Confirm completion'}).closest('form')!);}
it('uploads all 20 images and submits all 20 paths for Admin',async()=>{addAndSubmit(20);await waitFor(()=>expect(mocks.complete).toHaveBeenCalledTimes(1));expect(mocks.upload).toHaveBeenCalledTimes(20);const data=mocks.complete.mock.calls[0][1] as FormData;expect(data.getAll('completionPhotoPaths')).toHaveLength(20);expect(new Set(data.getAll('completionPhotoPaths')).size).toBe(20);expect(data.getAll('completionPhotos')).toHaveLength(0);});
it('keeps all selected photos and does not complete when any upload fails',async()=>{mocks.upload.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{message:'Network lost'}});addAndSubmit(7);await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Network lost'));expect(mocks.complete).not.toHaveBeenCalled();expect(screen.getByText('7 / 20 photos selected')).toBeInTheDocument();});
