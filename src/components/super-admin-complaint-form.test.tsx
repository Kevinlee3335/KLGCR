import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SuperAdminComplaintForm } from './super-admin-complaint-form';

it('offers KIV and resuming intake with a required reason', () => {
  render(<SuperAdminComplaintForm action={vi.fn()} status="new" hasJobs={false}/>);
  expect(screen.getByRole('option',{name:/KIV · Keep In View/})).toBeInTheDocument();
  expect(screen.getByRole('option',{name:/New · Resume/})).toBeInTheDocument();
  expect(screen.getByLabelText('Reason / follow-up note')).toBeRequired();
});

it('directs complaints with linked work to their jobs', () => {
  render(<SuperAdminComplaintForm action={vi.fn()} status="assigned" hasJobs/>);
  expect(screen.queryByRole('button',{name:'Save as Super Admin'})).not.toBeInTheDocument();
  expect(screen.getByText(/Open the linked jobs below/)).toBeInTheDocument();
});
