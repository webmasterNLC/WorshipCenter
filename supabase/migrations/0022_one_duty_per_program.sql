-- 0022_one_duty_per_program.sql
-- Each band member can hold AT MOST ONE role on a given program (playlist).
-- The previous unique on (playlist_id, role, member_id) still allowed the
-- same person across multiple roles on one Sunday — too permissive.
--
-- This migration drops later duplicates (earliest assignment wins per
-- (playlist, member)) and then enforces the stricter unique.

delete from service_assignments sa
using (
  select id
  from (
    select id,
           row_number() over (
             partition by playlist_id, member_id
             order by created_at
           ) as rn
    from service_assignments
  ) ranked
  where ranked.rn > 1
) dup
where sa.id = dup.id;

alter table service_assignments
  drop constraint service_assignments_playlist_id_role_member_id_key;

alter table service_assignments
  add constraint service_assignments_playlist_id_member_id_key
  unique (playlist_id, member_id);
