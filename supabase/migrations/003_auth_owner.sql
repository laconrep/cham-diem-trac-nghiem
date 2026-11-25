-- Migration 003: tài khoản giáo viên (spec v2, bác chốt 20/11).
-- Chạy bằng SQL Editor hoặc psql với quyền DDL; service key không chạy DDL được.
--
-- Mỗi phiên chấm thuộc về 1 tài khoản GV (owner_id = auth.users.id).
-- Admin (gagabux95@gmail.com, xác định theo email trong code — lib/auth.ts)
-- thấy tất cả phiên; GV thường chỉ thấy phiên mình tạo (lọc trong code).
-- Phiên "10" đã có từ trước khi có tài khoản: gán cho tài khoản admin.
alter table public.cdtn_sessions
  add column if not exists owner_id uuid;

create index if not exists cdtn_sessions_owner_idx
  on public.cdtn_sessions (owner_id, created_at);

update public.cdtn_sessions
  set owner_id = 'c4bf4d7c-2664-4abb-bf60-4037cd89af5d'
  where id = '89ed533c-e125-4292-ae19-3fb38a2624c7'
    and owner_id is null;
