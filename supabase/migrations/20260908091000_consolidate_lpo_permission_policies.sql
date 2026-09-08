drop policy if exists "Users can view own LPO permissions" on public.user_lpo_permissions;
drop policy if exists "Admins can view tenant LPO permissions" on public.user_lpo_permissions;
drop policy if exists "Admins can manage tenant LPO permissions" on public.user_lpo_permissions;

create policy "Users and admins can view LPO permissions"
on public.user_lpo_permissions for select to authenticated
using (
  user_id = (select auth.uid())
  or public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
);

create policy "Admins can insert tenant LPO permissions"
on public.user_lpo_permissions for insert to authenticated
with check (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
);

create policy "Admins can update tenant LPO permissions"
on public.user_lpo_permissions for update to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
)
with check (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
);

create policy "Admins can delete tenant LPO permissions"
on public.user_lpo_permissions for delete to authenticated
using (
  public.is_super_admin((select auth.uid()))
  or (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    and exists (
      select 1 from public.profiles target
      where target.user_id = user_lpo_permissions.user_id
        and target.tenant_id = public.get_user_tenant_id((select auth.uid()))
    )
  )
);
