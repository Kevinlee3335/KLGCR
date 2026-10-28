-- Additive schema; existing documents and business records are untouched.
create table public.supplier_mail_connections (
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 last_received_at timestamptz,
 revoked_at timestamptz
);
alter table public.supplier_mail_connections enable row level security;
revoke all on public.supplier_mail_connections from anon, authenticated;
grant all on public.supplier_mail_connections to service_role;

create table public.supplier_emails (
 id text primary key check(id ~ '^[0-9a-f]{10,40}$'),
 company text not null check(company in ('sigma','mfe')),
 sender text not null,
 subject text not null,
 body_text text not null default '',
 received_at timestamptz not null check(received_at >= '2023-01-01T00:00:00+08:00'),
 created_at timestamptz not null default now()
);
create index supplier_emails_company_date on public.supplier_emails(company,received_at desc,id);
alter table public.supplier_emails enable row level security;
revoke all on public.supplier_emails from anon, authenticated;
grant all on public.supplier_emails to service_role;
grant select on public.supplier_emails to authenticated;
create policy "management reads supplier emails" on public.supplier_emails for select to authenticated using(public.is_management());

create table public.supplier_mail_documents (
 id uuid primary key default gen_random_uuid(),
 company text not null check(company in ('sigma','mfe')),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 file_name text not null check(length(file_name) between 1 and 255),
 folder text not null check(folder in ('Quotation','Invoice','Service Report','Other Documents')),
 storage_path text not null unique,
 size_bytes bigint not null check(size_bytes between 1 and 52428800),
 created_at timestamptz not null default now(),
 unique(company,content_hash)
);
alter table public.supplier_mail_documents enable row level security;
revoke all on public.supplier_mail_documents from anon, authenticated;
grant all on public.supplier_mail_documents to service_role;
grant select on public.supplier_mail_documents to authenticated;
create policy "management reads supplier documents" on public.supplier_mail_documents for select to authenticated using(public.is_management());
create table public.supplier_mail_attachments (
 message_id text not null references public.supplier_emails(id),
 part_id text not null,
 file_name text not null check(length(file_name) between 1 and 255),
 document_id uuid references public.supplier_mail_documents(id),
 issue text,
 primary key(message_id,part_id)
);
alter table public.supplier_mail_attachments enable row level security;
revoke all on public.supplier_mail_attachments from anon, authenticated;
grant all on public.supplier_mail_attachments to service_role;
grant select on public.supplier_mail_attachments to authenticated;
create policy "management reads supplier attachment links" on public.supplier_mail_attachments for select to authenticated using(public.is_management());
create index supplier_mail_attachment_document on public.supplier_mail_attachments(document_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('supplier-mail','supplier-mail',false,52428800,array['application/pdf']);
create policy "management reads private supplier PDFs" on storage.objects for select to authenticated
 using(bucket_id='supplier-mail' and public.is_management());
-- Inserts/updates use service-role routes; no browser receives service-role credentials.
create table public.supplier_email_reads (
 message_id text not null references public.supplier_emails(id),
 user_id uuid not null references public.profiles(id),
 read_at timestamptz not null default now(),
 primary key(user_id,message_id)
);
alter table public.supplier_email_reads enable row level security;
revoke all on public.supplier_email_reads from anon, authenticated;
grant all on public.supplier_email_reads to service_role;
grant select,insert on public.supplier_email_reads to authenticated;
create policy "management reads own email flags" on public.supplier_email_reads for select to authenticated using(public.is_management() and user_id=(select auth.uid()));
create policy "management marks own emails read" on public.supplier_email_reads for insert to authenticated with check(public.is_management() and user_id=(select auth.uid()));
grant update(folder) on public.supplier_mail_documents to authenticated;
create policy "management classifies supplier documents" on public.supplier_mail_documents for update to authenticated
 using(public.is_management()) with check(public.is_management());
