import { describe,it,expect } from 'vitest';
import { supplierForSender,inImportRange,classifyAttachment } from './rules';
describe('supplier mail scope',()=>{
 it('only matches verified exact senders, never display names or lookalike domains',()=>{
  expect(supplierForSender('Sigma <CUSTOMERCARE.MY@sigmamy.com>')).toBe('sigma');
  expect(supplierForSender('Intan <Intan.Nursyuhada@sigmamy.com>')).toBe('sigma');
  expect(supplierForSender('mfe trading sdn bhd <mfetsb@gmail.com>')).toBe('mfe');
  for(const sender of ['Sigma <other@example.com>','customercare.my@sigmamy.com.evil.com','sigma.robby@gmail.com','mfetsb@gmail.com.evil.com','enquiry@klgresidence.com']) expect(supplierForSender(sender)).toBeNull();
 });
 it('includes MYT 2023 midnight and rejects earlier records and invalid dates',()=>{
  expect(inImportRange('2022-12-31T16:00:00Z')).toBe(true);
  expect(inImportRange('2022-12-31T15:59:59Z')).toBe(false);
  expect(inImportRange('invalid')).toBe(false);
 });
 it('uses file evidence before subject and leaves unknown PDFs unclassified',()=>{
  expect(classifyAttachment('SVRReportMultiple_2026-Oct-21.pdf','SIGMA Elevator Monthly Servicing Report')).toBe('Service Report');
  expect(classifyAttachment('K-HOTEL_SQ2026-10009MFE.pdf','Quotation To Replace Manual Call Point')).toBe('Quotation');
  expect(classifyAttachment('Invoice 123.pdf','Re: Quotation')).toBe('Invoice');
  expect(classifyAttachment('4TH,5TH_K HOTEL.pdf','November 2026 Confirmation For Fire Fighting System Servicing')).toBe('Other Documents');
  expect(classifyAttachment('contract.pdf','Agreement')).toBe('Other Documents');
 });
});
