revoke execute on function public.can_access_lpo(uuid) from anon;
revoke execute on function public.update_lpo_email_schedule(boolean, text, smallint, time, text) from anon;

grant execute on function public.can_access_lpo(uuid) to authenticated, service_role;
grant execute on function public.update_lpo_email_schedule(boolean, text, smallint, time, text) to authenticated, service_role;
