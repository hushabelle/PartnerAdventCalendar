-- Run once in the Supabase SQL Editor after reviewing SETUP-SUPABASE.md.
-- This script creates no users and never stores passwords.
create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon, authenticated;
create table if not exists calendar_private.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('organiser', 'partner'))
);
alter table calendar_private.members enable row level security;
revoke all on calendar_private.members from anon, authenticated;
create or replace function calendar_private.is_member(wanted_role text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from calendar_private.members m where m.user_id = (select auth.uid()) and (wanted_role is null or m.role = wanted_role));
$$;
revoke all on function calendar_private.is_member(text) from public;
grant usage on schema calendar_private to authenticated;
grant execute on function calendar_private.is_member(text) to authenticated;

create table if not exists public.calendar_days (
  day integer primary key check (day between 1 and 25),
  unlock_at timestamptz not null,
  type text not null default 'message',
  title text not null,
  message text not null default '',
  media_path text,
  spotify_url text
);
create table if not exists public.calendar_opens (
  day integer primary key references public.calendar_days(day),
  opened_by uuid not null references auth.users(id),
  opened_at timestamptz not null default now()
);
create table if not exists public.calendar_uploads (
  id bigint generated always as identity primary key,
  day integer not null references public.calendar_days(day),
  uploaded_by uuid not null references auth.users(id),
  path text not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_days enable row level security;
alter table public.calendar_opens enable row level security;
alter table public.calendar_uploads enable row level security;
revoke all on public.calendar_days, public.calendar_opens, public.calendar_uploads from anon, authenticated;
grant select on public.calendar_days to authenticated;
grant select, insert on public.calendar_opens, public.calendar_uploads to authenticated;
grant usage, select on sequence public.calendar_uploads_id_seq to authenticated;
grant insert, update, delete on public.calendar_days to authenticated;
create policy "members read available days" on public.calendar_days for select to authenticated using (
  calendar_private.is_member('organiser') or (calendar_private.is_member('partner') and unlock_at <= now())
);
create policy "organiser manages days" on public.calendar_days for all to authenticated using (calendar_private.is_member('organiser')) with check (calendar_private.is_member('organiser'));
create policy "members read opens" on public.calendar_opens for select to authenticated using (calendar_private.is_member());
create policy "partner opens available day" on public.calendar_opens for insert to authenticated with check (
  calendar_private.is_member('partner') and opened_by = (select auth.uid()) and exists (select 1 from public.calendar_days d where d.day = calendar_opens.day and d.unlock_at <= now())
);
create policy "members read uploads" on public.calendar_uploads for select to authenticated using (calendar_private.is_member());
create policy "partner records upload" on public.calendar_uploads for insert to authenticated with check (
  calendar_private.is_member('partner') and uploaded_by = (select auth.uid())
  and path like ('uploads/' || (select auth.uid())::text || '/' || day::text || '/%')
  and exists (select 1 from public.calendar_days d where d.day = calendar_uploads.day and d.unlock_at <= now())
);
-- Media layout: surprises/<day>/<filename>, uploads/<partner user id>/<day>/<filename>.
create policy "members read private calendar media" on storage.objects for select to authenticated using (
  bucket_id = 'calendar-media' and (
    calendar_private.is_member('organiser') or (
      calendar_private.is_member('partner') and (
        ((storage.foldername(name))[1] = 'uploads' and (storage.foldername(name))[2] = (select auth.uid())::text)
        or ((storage.foldername(name))[1] = 'surprises' and exists (select 1 from public.calendar_days d where d.day::text = (storage.foldername(name))[2] and d.unlock_at <= now()))
      )
    )
  )
);
create policy "partner uploads to own available day" on storage.objects for insert to authenticated with check (
  bucket_id = 'calendar-media' and calendar_private.is_member('partner')
  and (storage.foldername(name))[1] = 'uploads' and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (select 1 from public.calendar_days d where d.day::text = (storage.foldername(name))[3] and d.unlock_at <= now())
);
-- Uploading a surprise is allowed only to the organiser.
create policy "organiser manages private calendar media" on storage.objects for all to authenticated using (bucket_id = 'calendar-media' and calendar_private.is_member('organiser')) with check (bucket_id = 'calendar-media' and calendar_private.is_member('organiser'));

-- Editable placeholder content. Existing days are preserved if this insert is run again.
insert into public.calendar_days (day, unlock_at, type, title, message) values
(1, make_timestamptz(2026, 12, 1, 0, 0, 0, 'Europe/London'), 'image', 'A little memory', 'A favourite moment of us. Replace this with your own memory.'),
(2, make_timestamptz(2026, 12, 2, 0, 0, 0, 'Europe/London'), 'voucher', 'A cosy cup for you', 'This voucher is good for one hot chocolate, made just for you.'),
(3, make_timestamptz(2026, 12, 3, 0, 0, 0, 'Europe/London'), 'video', 'Remember this?', 'A little moment to play back whenever you like.'),
(4, make_timestamptz(2026, 12, 4, 0, 0, 0, 'Europe/London'), 'song', 'A song for today', 'A little soundtrack for your day.'),
(5, make_timestamptz(2026, 12, 5, 0, 0, 0, 'Europe/London'), 'image', 'One of my favourites', 'Tell the story behind this photo here.'),
(6, make_timestamptz(2026, 12, 6, 0, 0, 0, 'Europe/London'), 'message', 'A note for you', 'Write something lovely here. It can be as long as you like.'),
(7, make_timestamptz(2026, 12, 7, 0, 0, 0, 'Europe/London'), 'image', 'A moment together', 'Add a favourite memory here.'),
(8, make_timestamptz(2026, 12, 8, 0, 0, 0, 'Europe/London'), 'video', 'Press play', 'A little video from us.'),
(9, make_timestamptz(2026, 12, 9, 0, 0, 0, 'Europe/London'), 'song', 'Your festive bop', 'Turn this one up!'),
(10, make_timestamptz(2026, 12, 10, 0, 0, 0, 'Europe/London'), 'image', 'A happy day', 'What made this day special?'),
(11, make_timestamptz(2026, 12, 11, 0, 0, 0, 'Europe/London'), 'voucher', 'A treat, on me', 'Redeem for your favourite drink or snack, whenever you like.'),
(12, make_timestamptz(2026, 12, 12, 0, 0, 0, 'Europe/London'), 'message', 'Something I love about you', 'Write your message here.'),
(13, make_timestamptz(2026, 12, 13, 0, 0, 0, 'Europe/London'), 'video', 'A little throwback', 'Another favourite moment.'),
(14, make_timestamptz(2026, 12, 14, 0, 0, 0, 'Europe/London'), 'image', 'Us, always', 'Add a memory to go with this picture.'),
(15, make_timestamptz(2026, 12, 15, 0, 0, 0, 'Europe/London'), 'song', 'A song for us', 'A little festive listening.'),
(16, make_timestamptz(2026, 12, 16, 0, 0, 0, 'Europe/London'), 'poem', 'A little poem', 'Write your poem here.
A line for every lovely thing.
A little love for every day,
And all the joy that you bring.'),
(17, make_timestamptz(2026, 12, 17, 0, 0, 0, 'Europe/London'), 'video', 'A moving memory', 'Add a video you love.'),
(18, make_timestamptz(2026, 12, 18, 0, 0, 0, 'Europe/London'), 'image', 'Remember when', 'A little moment worth keeping.'),
(19, make_timestamptz(2026, 12, 19, 0, 0, 0, 'Europe/London'), 'message', 'A longer love note', 'There is so much I want to say to you. Start writing here.'),
(20, make_timestamptz(2026, 12, 20, 0, 0, 0, 'Europe/London'), 'gift', 'Come find me', 'There is a little gift waiting for you. Come and get it!'),
(21, make_timestamptz(2026, 12, 21, 0, 0, 0, 'Europe/London'), 'song', 'A Christmas tune', 'One more song to get us feeling festive.'),
(22, make_timestamptz(2026, 12, 22, 0, 0, 0, 'Europe/London'), 'video', 'Just one more memory', 'A moment to revisit together.'),
(23, make_timestamptz(2026, 12, 23, 0, 0, 0, 'Europe/London'), 'image', 'One more favourite', 'Add a photo and the story behind it.'),
(24, make_timestamptz(2026, 12, 24, 0, 0, 0, 'Europe/London'), 'message', 'Christmas Eve', 'A little message for the night before Christmas.'),
(25, make_timestamptz(2026, 12, 25, 0, 0, 0, 'Europe/London'), 'image', 'Merry Christmas, my love', 'A little peek at your Christmas gift!')
on conflict (day) do nothing;
create or replace function public.my_calendar_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from calendar_private.members where user_id = (select auth.uid());
$$;
revoke all on function public.my_calendar_role() from public, anon;
grant execute on function public.my_calendar_role() to authenticated;
