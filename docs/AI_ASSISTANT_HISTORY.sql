-- New isolated chat storage only. No operational tables or records are changed.
create table public.ai_assistant_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null,
 title text not null check (char_length(title) between 1 and 100),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create table public.ai_assistant_turns (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null,
 user_id uuid not null,
 question text not null check(char_length(question) between 1 and 1500),
 answer text not null check(char_length(answer) between 1 and 50000),
 captured_at timestamptz not null,
 created_at timestamptz not null default now(),
 foreign key(conversation_id,user_id) references public.ai_assistant_conversations(id,user_id)
);
create index ai_assistant_conversations_owner_time on public.ai_assistant_conversations(user_id,updated_at desc,id);
create index ai_assistant_turns_owner_thread_time on public.ai_assistant_turns(user_id,conversation_id,created_at desc,id);
alter table public.ai_assistant_conversations enable row level security;
alter table public.ai_assistant_turns enable row level security;
revoke all on public.ai_assistant_conversations,public.ai_assistant_turns from public,anon,authenticated;
grant select on public.ai_assistant_conversations,public.ai_assistant_turns to authenticated;
grant select,insert,update on public.ai_assistant_conversations,public.ai_assistant_turns to service_role;
create policy ai_conversations_read_own on public.ai_assistant_conversations for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.deleted_at is null and p.role::text in ('admin','management_viewer'))
);
create policy ai_turns_read_own on public.ai_assistant_turns for select to authenticated using (
 user_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active and p.deleted_at is null and p.role::text in ('admin','management_viewer'))
);
