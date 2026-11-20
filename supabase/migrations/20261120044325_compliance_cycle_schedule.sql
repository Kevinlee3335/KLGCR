-- Planned visits belong to a cycle and never change its due date or completion state.
alter table public.compliance_cycles
 add column scheduled_on date,
 add column scheduled_time time without time zone,
 add column schedule_notes text,
 add column schedule_updated_at timestamptz,
 add column schedule_updated_by uuid references public.profiles(id),
 add column schedule_history jsonb not null default '[]'::jsonb,
 add constraint compliance_cycle_schedule_date check(scheduled_on is not null or (scheduled_time is null and schedule_notes is null)),
 add constraint compliance_cycle_schedule_notes check(length(schedule_notes)<=2000),
 add constraint compliance_cycle_schedule_history check(jsonb_typeof(schedule_history)='array');

create function public.schedule_compliance_cycle(
 p_actor_id uuid,p_record_id uuid,p_cycle_id uuid,p_scheduled_on date,p_scheduled_time time without time zone,p_notes text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.compliance_cycles; actor_name text; entry jsonb;
begin
 actor_name:=public.compliance_admin_username(p_actor_id);
 if actor_name is null then raise exception 'Admin account required';end if;
 if length(coalesce(p_notes,''))>2000 or (p_scheduled_on is null and (p_scheduled_time is not null or nullif(btrim(p_notes),'') is not null)) then raise exception 'Enter a valid schedule date and notes';end if;
 select * into c from public.compliance_cycles where id=p_cycle_id and record_id=p_record_id for update;
 if not found or c.status<>'open' then raise exception 'The compliance cycle is closed or unavailable';end if;
 if c.performed_on is not null then raise exception 'Work is already recorded. Keep the actual work date for this cycle';end if;
 if p_scheduled_on is null and c.scheduled_on is null then return c.id;end if;
 if c.scheduled_on is not distinct from p_scheduled_on and c.scheduled_time is not distinct from p_scheduled_time and c.schedule_notes is not distinct from nullif(btrim(p_notes),'') then return c.id;end if;
 entry:=jsonb_build_object('action',case when p_scheduled_on is null then 'cancelled' when c.scheduled_on is null then 'scheduled' else 'rescheduled' end,
  'scheduled_on',p_scheduled_on,'scheduled_time',p_scheduled_time,'notes',nullif(btrim(p_notes),''),
  'previous_date',c.scheduled_on,'previous_time',c.scheduled_time,'actor_id',p_actor_id,'actor_username',actor_name,'updated_at',clock_timestamp());
 update public.compliance_cycles set scheduled_on=p_scheduled_on,scheduled_time=p_scheduled_time,schedule_notes=nullif(btrim(p_notes),''),
  schedule_updated_at=now(),schedule_updated_by=p_actor_id,schedule_history=schedule_history||jsonb_build_array(entry)
 where id=c.id;
 return c.id;
end;$$;
revoke all on function public.schedule_compliance_cycle(uuid,uuid,uuid,date,time without time zone,text) from public,anon,authenticated;
grant execute on function public.schedule_compliance_cycle(uuid,uuid,uuid,date,time without time zone,text) to service_role;
