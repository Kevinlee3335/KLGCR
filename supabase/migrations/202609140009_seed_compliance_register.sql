-- Initial servicing and certificates/licences register transcribed from the 2026 paper schedules.
-- Dates remain editable by Admin. Existing records are never duplicated.

with admin_profile as (
  select id from public.profiles where role = 'admin' order by created_at limit 1
),
records(record_type,title,frequency,provider,reference_no,next_due_date,notes,contact_name,contact_phone,contact_email) as (
 values
 ('servicing','Yearly Service of Standby Genset','Yearly','C.S Machinery',null,date '2026-04-01','Two inspections recorded in Apr and Aug 2026.','Mr Chandran','019-716 9616','c.s.machinery@hotmail.com'),
 ('servicing','Fire Fighting Equipment Inspection','Quarterly','MFE Services',null,date '2026-11-01','Quarterly inspection schedule: Feb, May, Aug, Nov.','MFE Office','017-328 0555','mfe.srg@gmail.com'),
 ('servicing','Lift Homing Inspection','Quarterly','MFE Services / SIGMA',null,date '2026-11-01','Quarterly inspection schedule.','Mr Hazlimi Chellapiah','012-623 9531',null),
 ('servicing','WTP Preventive Maintenance','Monthly','E3 Information',null,date '2026-09-01','Monthly servicing.','Mr Eugene','016-746 4003',null),
 ('servicing','Inspection of TNB Substation – PE45 & PE46','Monthly','Megapower Consultants',null,date '2026-09-01','Monthly inspection and servicing on TBC.','Mr Zamrie','019-795 8585',null),
 ('servicing','Water Testing Block C & D','Yearly','Allied Chemists',null,date '2027-04-15','Result received by email on 30/05/2026 – passed.','En Haqim','017-284 6698',null),
 ('servicing','Portable Water Testing','Yearly','LW Geotech Engineering',null,date '2026-11-01',null,'Mr Lee','019-777 3441',null),
 ('servicing','Gas Pipe Inspection Kitchen Block C & Block D','Quarterly','K Hotel',null,date '2026-11-01','Block A & B postponed due to malfunction machine.','Mr Lee',null,null),
 ('servicing','Fogging Activity','Monthly','K Hotel',null,date '2026-09-01','Fogging on 06/08/2026 – Marathon.',null,null,null),
 ('servicing','Pest Control Activity','Monthly','K Hotel',null,date '2026-09-01','Done on 06/08/2026 (C & D) – CSlin / Branch 330.',null,null,null),
 ('servicing','Fridge Cleaning Block A & Block B','Monthly','HK Team',null,date '2026-09-01','Done on 10/09/2026.',null,null,null),
 ('servicing','Routine Fire Fighting Inspection','Monthly','K Hotel',null,date '2026-09-01','Awaiting MFE to proceed work.',null,null,null),
 ('servicing','Fire Hydrant Chamber','Every 2 months','Mr Faiz',null,date '2026-09-01','No light (black), good condition; red unit needs servicing.','Mr Faiz',null,null),
 ('servicing','Lift Motor Room Lighting Indicator','Monthly','Maintenance Team',null,date '2026-09-01','Inspection completed for Blocks A, B, C and D.',null,null,null),
 ('servicing','Emergency Exit Signage (KELUAR)','Monthly','Ms Nouril / Ms Syafiqah',null,date '2026-09-01','Inspection completed for Blocks A, B, C and D.',null,null,null),
 ('servicing','Fire Extinguisher & Hose Reel Room','Monthly','Ms Nouril / Ms Syafiqah',null,date '2026-09-01','Inspection completed for Blocks A, B, C and D.',null,null,null),
 ('servicing','Main Entrance Signage','Monthly','Mr Kevin / Mr Fikri',null,date '2026-09-01','All LED lights are working.','Mr Kevin',null,null),
 ('servicing','Water Heater Inspection (Common Bathroom)','Every 2 months','K Hotel',null,date '2026-09-01','Inspection recorded for Blocks A–D.',null,null,null),
 ('servicing','Changing of Passcode for EM Lock','Monthly','Mr Kevin / Mr Fikri',null,date '2026-09-01','Done inspection on 01/07/2026.',null,null,null),
 ('servicing','Spotlight, Street Light & Solar Light Inspection','Monthly','Mr Kevin / Mr Fikri',null,date '2026-09-01','KLG compound inspection; done 02/09/2026 and status updated 11/09/2026.',null,null,null),
 ('servicing','Grass Cutting & General Upkeep','Monthly','Mr Fikri',null,date '2026-09-01','Blocks C & D; works completed on 16/08/2026.',null,null,null),
 ('servicing','Herbicide Application for Four Blocks and Manhole','Quarterly','Mr Fikri',null,date '2026-09-01','Inspection and clearing at canteen Blocks C & D and commercial centre.',null,null,null),
 ('servicing','Grease Trap Cleaning','Every 2 months','Mr Kevin',null,date '2026-09-01','Canteen Block C, D & commercial centre.',null,null,null),
 ('certificate_license','Business License','Yearly','MBIP',null,date '2026-12-31','Renew yearly; cleaning agreement and Sijil Sisa Pepejal needed for renewal.',null,null,null),
 ('certificate_license','Fire Business Registration Certificate','Yearly','UTM',null,date '2027-10-08',null,null,null,null),
 ('certificate_license','Emergency Response Team Certificate (ERT)','Yearly','BOMBA',null,date '2026-10-14','Available date updated 14/09/2026–16/09/2026 for attendance.',null,null,null),
 ('certificate_license','Fire Extinguisher Certification','Yearly','MFE Services',null,date '2027-08-18','Includes fire extinguisher units across Blocks A–D, lift motor room and chemical rooms.','Puan Azura','017-328 0555','mfe.srg@gmail.com'),
 ('certificate_license','TNB Substation Relay Protection Certificate','Yearly','JCME Engrg Svs',null,date '2026-11-25','Status still in progress.',null,null,null),
 ('certificate_license','Insurance Building','Yearly','Amtran Insurance',null,date '2027-06-15','Policy received on 25/07/2026.',null,null,null),
 ('certificate_license','SPKA Block A & Block B','One-time / Contract','Fire & Alrite Sdn Bhd',null,date '2026-10-14','Awaiting MFE to proceed installation work before 14 October 2026.',null,'03-3699 6722','azrul@firealrite.com'),
 ('certificate_license','SPKA Block C & Block D','One-time / Contract','Fire & Alrite Sdn Bhd',null,date '2026-10-14','Awaiting MFE to proceed installation work before 14 October 2026.',null,'03-3699 6722','azrul@firealrite.com'),
 ('certificate_license','Jabatan Tenaga Kerja UTM – Perakuan Penggunaan','Yearly','JTK',null,date '2027-03-10','Renew two months before expiry.',null,null,null),
 ('certificate_license','Surrendering Tenaga Lesen Gas Persendirian Block C','Yearly','Suruhanjaya Tenaga',null,date '2027-06-27','Outstation renewal has been signed on 21/05/2026.','Mr Lee','019-777 3441','lw_eng@yahoo.com'),
 ('certificate_license','Fortigate Renewal Block D','Yearly','E3 Information',null,date '2027-04-24','Warranty.', 'Mr Eugene','016-746 4003',null),
 ('certificate_license','Domain Name & Web Hosting','Yearly','Estan Creations',null,date '2026-12-14','Rental agreement / renewal contract.','Martin Tian','017-727 2388','martin@estancreations.com'),
 ('certificate_license','Xerox DC V2 2025 CPF Printing Machine','One-time / Contract','KIM POOK',null,date '2027-01-17','New monthly rental rate: RM111.00 starting from 17/01/2026.','KIM POOK','+60 12-516 1713',null)
)
insert into public.compliance_records(record_type,title,frequency,provider,reference_no,next_due_date,notes,contact_name,contact_phone,contact_email,created_by)
select r.record_type,r.title,r.frequency,r.provider,r.reference_no,r.next_due_date,r.notes,r.contact_name,r.contact_phone,r.contact_email,a.id
from records r cross join admin_profile a
where not exists (
  select 1 from public.compliance_records existing
  where existing.record_type=r.record_type and existing.title=r.title
);