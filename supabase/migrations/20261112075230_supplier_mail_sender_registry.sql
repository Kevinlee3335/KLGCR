-- Preserve existing archive and storage access. Additional sender rules are populated privately.
create table public.supplier_mail_suppliers (
 id text primary key check(length(id) <= 48 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(length(btrim(name)) between 1 and 120)
);
alter table public.supplier_mail_suppliers enable row level security;
revoke all on public.supplier_mail_suppliers from public, anon, authenticated, service_role;
grant select on public.supplier_mail_suppliers to authenticated, service_role;
create policy "management reads supplier registry" on public.supplier_mail_suppliers
 for select to authenticated using(public.is_management());

create table public.supplier_mail_sender_rules (
 rule text primary key check(length(rule) <= 254 and (rule = 'sigmamy.com' or rule ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$')),
 supplier_id text not null references public.supplier_mail_suppliers(id)
);
alter table public.supplier_mail_sender_rules enable row level security;
revoke all on public.supplier_mail_sender_rules from public, anon, authenticated, service_role;
grant select on public.supplier_mail_sender_rules to service_role;

insert into public.supplier_mail_suppliers (id, name) values ('sigma', 'Sigma'), ('mfe', 'MFE');
insert into public.supplier_mail_sender_rules (rule, supplier_id) values ('sigmamy.com', 'sigma'), ('mfetsb@gmail.com', 'mfe');

alter table public.supplier_emails drop constraint supplier_emails_company_check,
 add constraint supplier_emails_company_fkey foreign key (company) references public.supplier_mail_suppliers(id);
alter table public.supplier_mail_documents drop constraint supplier_mail_documents_company_check,
 drop constraint supplier_mail_documents_folder_check,
 add constraint supplier_mail_documents_company_fkey foreign key (company) references public.supplier_mail_suppliers(id),
 add constraint supplier_mail_documents_folder_check check (folder in ('Quotation', 'Invoice', 'Service Report', 'Agreement', 'Other Documents'));
alter table public.supplier_mail_connections add column last_checked_at timestamptz;
