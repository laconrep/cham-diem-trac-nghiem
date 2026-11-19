-- Migration 001: app chấm điểm trắc nghiệm + tự luận (cham-diem-trac-nghiem)
-- Chạy trên project Supabase dùng chung với thaoluannhom
-- (https://cvoznfqnuoajesvorydr.supabase.co).
-- LƯU Ý: chạy bằng SQL Editor hoặc psql với quyền DDL; service key không chạy DDL được.

-- Phiên chấm: tiêu chí chấm đã duyệt (answer_key) + barem tự luận nằm trong answer_key.essayBarem.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  answer_key jsonb,
  criteria jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- Bài nộp của học sinh: 1 dòng = 1 bài (nhóm 2-3 ảnh).
-- status: queued (đang chờ chấm) / grading (đang chấm) / done (đã chấm xong) / error (lỗi)
-- job_id: job chấm đang xử lý bài này (để bài tải sau tự vào hàng chờ job đang chạy).
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  student_name text not null default 'Học sinh',
  files jsonb not null default '[]'::jsonb,
  status text not null default 'queued',
  job_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists submissions_session_idx on public.submissions (session_id, created_at);
create index if not exists submissions_job_idx on public.submissions (job_id);

-- Job chấm (hàng chờ chấm ngầm cho MCP worker).
create table if not exists public.grade_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  status text not null default 'queued',
  total int not null default 0,
  completed int not null default 0,
  progress int not null default 0,
  stage text,
  worker_id text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists grade_jobs_session_idx on public.grade_jobs (session_id, created_at);

-- Kết quả chấm: 1 dòng = 1 bài đã chấm (hoặc lỗi).
-- per_question: { exam_code, items: [{q, part, student, correct, is_correct, points}],
--                 essay_steps: [{step, points, awarded, note}], errors: [], note: "" }
-- graded_at: thời gian chấm xong — danh sách kết quả sắp xếp theo graded_at TĂNG DẦN
-- (bài chấm trước nằm đầu, chấm sau nằm tiếp theo).
create table if not exists public.grade_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.grade_jobs(id) on delete set null,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  score_mcq numeric,
  score_essay numeric,
  score_total numeric,
  per_question jsonb,
  feedback text,
  annotated_image_url text,
  status text not null default 'ready',
  approved boolean not null default false,
  graded_at timestamptz
);
create index if not exists grade_results_job_idx on public.grade_results (job_id);
create index if not exists grade_results_submission_idx on public.grade_results (submission_id);
create index if not exists grade_results_graded_idx on public.grade_results (graded_at);

-- Bucket lưu ảnh bài làm + ảnh đã chấm (đọc công khai để hiển thị <img>).
-- Tải lên chỉ qua API route phía server (service key), không mở ghi công khai.
insert into storage.buckets (id, name, public)
values ('cham-diem', 'cham-diem', true)
on conflict (id) do nothing;
