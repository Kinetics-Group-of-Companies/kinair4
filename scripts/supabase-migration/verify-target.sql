-- Read-only post-migration checks for the NEW company Supabase project.

select 'auth_users' as check_name, count(*)::text as value from auth.users
union all
select 'public_tables', count(*)::text from pg_tables where schemaname='public'
union all
select 'submittal_tables', count(*)::text from pg_tables where schemaname='public' and tablename like 'submittal%'
union all
select 'storage_buckets', count(*)::text from storage.buckets
union all
select 'storage_objects', count(*)::text from storage.objects;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
order by id;

select bucket_id,count(*) as object_count,
       coalesce(sum((metadata->>'size')::bigint),0) as total_bytes
from storage.objects
group by bucket_id
order by bucket_id;

select jobname,schedule,active
from cron.job
where jobname in ('kinair-lpo-daily-delay-alerts','kinair-lpo-daily-deepak-summary')
order by jobname;

select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'submittal%'
order by c.relname;

select count(*) as submittal_policies_without_feature_guard
from pg_policies
where schemaname='public'
  and tablename like 'submittal\_%' escape '\'
  and coalesce(qual,'') || ' ' || coalesce(with_check,'') not like '%can_access_submittal%';

select policyname,cmd,
       (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%can_access_submittal%' as feature_guarded
from pg_policies
where schemaname='storage' and tablename='objects'
  and policyname like 'tenant members % submittal files'
order by policyname;
