// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { membershipFee, reminderDates, nextPeriod, receiptBytes, hashToken, membershipToken, registrationSchema, memberStatus } from "./membership";
import { openToken, sealToken } from "./membership-secrets";
afterEach(()=>vi.unstubAllEnvs());
it('charges RM10 only on outsider registration',()=>{
 expect(membershipFee('resident',true)).toBe(40);
 expect(membershipFee('outsider',true)).toBe(50);
 expect(membershipFee('outsider',false)).toBe(40);
});
it.each([
 ['2026-10-28T16:00:00Z',true,'2026-11-01'],
 ['2026-10-28T15:59:59Z',false,'2026-11-01'],
 ['2028-02-26T16:00:00Z',true,'2028-03-01'],
 ['2026-02-25T16:00:00Z',true,'2026-03-01'],
 ['2026-12-28T16:00:00Z',true,'2027-01-01'],
])('calculates third-last day in Malaysia including leap years: %s',(now,due,next)=>{
 expect(reminderDates(new Date(now))).toMatchObject({reminderDue:due,nextMonth:next});
});
it('renews the next uncovered calendar month',()=>{
 expect(nextPeriod(null,'2026-10-16')).toBe('2026-10-01');
 expect(nextPeriod('2026-10-31','2026-10-16')).toBe('2026-11-01');
 expect(nextPeriod('2026-09-30','2026-10-16')).toBe('2026-10-01');
 expect(nextPeriod('2026-12-31','2026-10-16')).toBe('2027-01-01');
});
it('requires all registration fields and normalizes email',()=>{
 const input={full_name:' Kevin ',email:'KEVIN@example.com',member_type:'resident',id_type:'IC',identification:'123',gender:'Male',nationality:'Malaysian',room_no:'A421',student_id:'123',address:'UTM'};
 expect(registrationSchema.parse(input).email).toBe('kevin@example.com');
 expect(registrationSchema.safeParse({...input,student_id:''}).success).toBe(false);
});
it('does not trust image MIME labels and enforces file size',async()=>{
 await expect(receiptBytes(new File(['hello'],'fake.png',{type:'image/png'}))).rejects.toThrow('valid');
 await expect(receiptBytes(new File([new Uint8Array(3*1024*1024+1)],'huge.pdf',{type:'application/pdf'}))).rejects.toThrow('3 MB');
 expect((await receiptBytes(new File(['%PDF-1.7'],'receipt.pdf',{type:'application/pdf'}))).type).toBe('application/pdf');
});
it('encrypts management tokens and detects modified ciphertext',()=>{
 vi.stubEnv('KLGCR_MEMBERSHIP_TOKEN_SECRET','a'.repeat(40));
 const token=membershipToken();
 const sealed=sealToken(token);
 expect(sealed).not.toContain(token);
 expect(openToken(sealed)).toBe(token);
 expect(hashToken(token)).not.toBe(token);
 const bytes=Buffer.from(sealed,'base64'); bytes[20]^=1;
 expect(()=>openToken(bytes.toString('base64'))).toThrow();
});
it('flags expiry at the start of the next Malaysia day',()=>{
 expect(memberStatus({status:'active',expires_on:'2026-10-31'},'2026-11-01')).toContain('block');
 expect(memberStatus({status:'active',expires_on:'2026-10-31'},'2026-10-31')).toBe('active');
});
