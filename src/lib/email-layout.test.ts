import {describe,it,expect} from 'vitest';
import {renderEmailBody} from './email-layout';
describe('email body compatibility',()=>{
 it('keeps browser invoice SVG and print controls out of Gmail',()=>{
  const html=renderEmailBody({subject:'Utilities invoice',text:'Dear Accounts Team,\n\nInvoice: SAMPLE-001\nAmount: RM 128.50\n\nPlease see the attachment.',html:'<!doctype html><html><style>svg{width:100%}</style><button>Print</button><svg><text>COLLAPSED INVOICE</text></svg></html>'});
  expect(html).not.toMatch(/<svg|<style|<button|COLLAPSED INVOICE/);
  expect(html).toContain('Invoice: SAMPLE-001<br>Amount: RM 128.50');
  expect(html).toContain('max-width:640px');
 });
 it('escapes user text and keeps paragraphs separate',()=>{
  const html=renderEmailBody({subject:'Receipt <test>',text:'Dear A & B,\n\n<script>alert(1)</script>'});
  expect(html).toContain('A &amp; B');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<script>');
 });
 it('preserves membership links and QR images in a simple HTML fragment',()=>{
  const html=renderEmailBody({subject:'Gym approved',text:'Approved',html:'<p>Approved</p><p><a href="https://example.com/member">Membership card</a></p><img src="https://example.com/qr.png" alt="QR">'});
  expect(html).toContain('https://example.com/member');expect(html).toContain('https://example.com/qr.png');expect(html).toContain('max-width:100%');
 });
 it('shows test label only on sample emails',()=>{
  expect(renderEmailBody({subject:'[TEST V2 16/16] Utilities invoice',text:'Sample'})).toContain('TEST SAMPLE');
  expect(renderEmailBody({subject:'Utilities invoice',text:'Approved'})).not.toContain('TEST SAMPLE');
 });
});
