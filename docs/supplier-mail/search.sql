alter table public.supplier_mail_documents add column if not exists content_text text not null default '';
alter table public.supplier_mail_documents add column if not exists text_extraction_status text not null default 'pending' check(text_extraction_status in ('pending','ready','needs_ocr','failed'));
create or replace function public.search_supplier_documents(p_company text,p_folder text,p_query text)
returns table(id uuid) language sql stable security invoker set search_path='' as $$
with terms as (
select distinct regexp_replace(lower(t), '^(norzel|nozel|nozzel|norzzle)$','nozzle') term
from regexp_split_to_table(left(lower(coalesce(p_query,'')),200),'[^[:alnum:]]+') t where length(t)>0
), searchable as (
select d.id,lower(d.file_name||' '||d.content_text||' '||coalesce(string_agg(e.subject||' '||e.body_text,' '),'')) haystack
from public.supplier_mail_documents d
left join public.supplier_mail_attachments a on a.document_id=d.id
left join public.supplier_emails e on e.id=a.message_id
where public.is_management() and d.company=p_company and d.folder=p_folder
group by d.id
)
select s.id from searchable s where not exists(select 1 from terms t where position(t.term in s.haystack)=0);
$$;
revoke all on function public.search_supplier_documents(text,text,text) from public,anon;
grant execute on function public.search_supplier_documents(text,text,text) to authenticated;
