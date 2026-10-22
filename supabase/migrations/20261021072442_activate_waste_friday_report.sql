create trigger waste_friday_report before insert on public.report_snapshots for each row execute function public.append_waste_friday_report();
