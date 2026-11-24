import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SuperAdminJobForm } from './super-admin-job-form';

it('requires the date only for checkout deferral and allows rescheduling the saved date', () => {
 render(<SuperAdminJobForm action={vi.fn()} status="in_progress" checkoutDate="2026-12-15"/>);
 expect(screen.queryByLabelText('Check-out date *')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Change status'), {target:{value:'waiting_checkout'}});
 expect(screen.getByLabelText(/Check-out date/)).toBeRequired();
 expect(screen.getByLabelText(/Check-out date/)).toHaveValue('2026-12-15');
 expect(screen.queryByLabelText(/Next monitoring review/)).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Change status'), {target:{value:'under_monitoring'}});
 expect(screen.queryByLabelText(/Check-out date/)).not.toBeInTheDocument();
 expect(screen.getByLabelText(/Next monitoring review/)).toBeRequired();
});
