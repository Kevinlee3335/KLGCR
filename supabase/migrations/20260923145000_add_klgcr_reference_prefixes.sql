begin;

alter table public.complaints
  alter column complaint_no set default (
    'KLGCR-CMP-' || extract(year from current_date)::text || '-' ||
    lpad(nextval('public.complaint_number_seq')::text, 4, '0')
  );

alter table public.maintenance_jobs
  alter column job_no set default (
    'KLGCR-JOB-' || extract(year from current_date)::text || '-' ||
    lpad(nextval('public.job_number_seq')::text, 4, '0')
  );

alter table public.material_requests
  alter column request_no set default (
    'KLGCR-MR-' || extract(year from current_date)::text || '-' ||
    lpad(nextval('public.material_request_number_seq')::text, 4, '0')
  );

alter table public.checkout_rooms
  alter column reference_no set default (
    'KLGCR-COR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  );

update public.complaints
set complaint_no = 'KLGCR-' || complaint_no
where complaint_no not like 'KLGCR-%';

update public.maintenance_jobs
set job_no = 'KLGCR-' || job_no
where job_no not like 'KLGCR-%';

update public.material_requests
set request_no = 'KLGCR-' || request_no
where request_no not like 'KLGCR-%';

update public.checkout_rooms
set reference_no = 'KLGCR-' || reference_no
where reference_no is not null
  and btrim(reference_no) <> ''
  and reference_no not like 'KLGCR-%';

update public.inventory_items
set item_code = 'KLGCR-' || item_code
where item_code not like 'KLGCR-%';

update public.compliance_records
set reference_no = 'KLGCR-' || reference_no
where reference_no is not null
  and btrim(reference_no) <> ''
  and reference_no not like 'KLGCR-%';

commit;