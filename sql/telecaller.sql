-- ═══════════════════════════════════════════════════════════════
-- LAVISTA CRM — TELECALLER MODULE
-- Supabase → SQL Editor me poora file ek baar run karo.
-- Existing tables ko touch nahi karta. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- 1) Telecaller team (round-robin isi list se hota hai)
create table if not exists tc_team (
  user_id          text primary key,          -- CRM username (zeel, vandita, ...)
  name             text not null,
  active           boolean not null default true,
  last_assigned_at timestamptz
);

-- 2) Leads
create table if not exists tc_leads (
  id               bigserial primary key,
  name             text not null,
  phone            text not null,
  phone_norm       text,                       -- last 10 digits, duplicate check ke liye
  source           text default 'Manual',      -- Meta Ad / Website / 99acres / Referral / Walk-in / Manual
  project          text,
  budget           text,
  notes            text,                       -- form answers / extra info
  assigned_to      text,                       -- tc_team.user_id
  assigned_name    text,
  status           text not null default 'new',
     -- new, interested, callback, rnr, site_visit, not_interested, wrong_number, cold, booked
  rnr_count        int  not null default 0,
  next_followup_at timestamptz,
  last_remark      text,
  last_called_at   timestamptz,
  created_by       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tc_leads_assigned_idx on tc_leads (assigned_to, next_followup_at);
create index if not exists tc_leads_phone_idx    on tc_leads (phone_norm);
create index if not exists tc_leads_status_idx   on tc_leads (status);

-- 3) Har call ka log
create table if not exists tc_call_logs (
  id               bigserial primary key,
  lead_id          bigint references tc_leads(id) on delete cascade,
  telecaller_id    text,
  telecaller_name  text,
  outcome          text not null,
  remark           text,
  next_followup_at timestamptz,
  called_at        timestamptz not null default now()
);
create index if not exists tc_logs_lead_idx on tc_call_logs (lead_id, called_at desc);
create index if not exists tc_logs_day_idx  on tc_call_logs (called_at, telecaller_id);

-- 4) Insert se pehle: phone normalize, duplicate merge, round-robin assign
create or replace function tc_before_insert_lead()
returns trigger language plpgsql as $$
declare
  existing tc_leads%rowtype;
  pick     tc_team%rowtype;
begin
  new.phone_norm := right(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), 10);

  -- Duplicate: same number already hai → purane lead me note add karo, naya mat banao
  if length(new.phone_norm) = 10 then
    select * into existing from tc_leads
      where phone_norm = new.phone_norm
      order by created_at desc limit 1;
    if found then
      insert into tc_call_logs (lead_id, telecaller_id, telecaller_name, outcome, remark)
      values (existing.id, 'system', 'System', 'duplicate',
              'Same number se dobara enquiry aayi — ' || coalesce(new.source,'') ||
              coalesce(' / ' || new.project, ''));
      update tc_leads
         set updated_at = now(),
             next_followup_at = least(coalesce(next_followup_at, now()), now()),
             status = case when status in ('not_interested','cold','wrong_number') then 'new' else status end
       where id = existing.id;
      return null;   -- naya row skip
    end if;
  end if;

  -- Round-robin: jis active telecaller ko sabse pehle lead mila tha, usko next
  if new.assigned_to is null then
    select * into pick from tc_team
      where active
      order by last_assigned_at nulls first, user_id
      limit 1
      for update skip locked;
    if found then
      new.assigned_to   := pick.user_id;
      new.assigned_name := pick.name;
      update tc_team set last_assigned_at = now() where user_id = pick.user_id;
    end if;
  end if;

  if new.next_followup_at is null then new.next_followup_at := now(); end if;
  return new;
end $$;

drop trigger if exists tc_leads_before_insert on tc_leads;
create trigger tc_leads_before_insert
  before insert on tc_leads
  for each row execute function tc_before_insert_lead();

-- 5) RLS — baaki CRM tables jaisa hi (CRM apna login khud handle karta hai)
alter table tc_team      enable row level security;
alter table tc_leads     enable row level security;
alter table tc_call_logs enable row level security;
drop policy if exists "crm read/write" on tc_team;
drop policy if exists "crm read/write" on tc_leads;
drop policy if exists "crm read/write" on tc_call_logs;
create policy "crm read/write" on tc_team      for all using (true) with check (true);
create policy "crm read/write" on tc_leads     for all using (true) with check (true);
create policy "crm read/write" on tc_call_logs for all using (true) with check (true);

-- 6) Starting team — jarurat ho to edit karo. Baad me CRM ke admin screen se on/off kar sakte ho.
insert into tc_team (user_id, name) values
  ('zeel', 'Zeel'), ('vandita', 'Vandita'), ('jinal', 'Jinal')
on conflict (user_id) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- META LEAD ADS → TELECALLER
-- Option A (best): apne webhook function me lead aate hi ye insert bhi karo:
--
--   await supabase.from('tc_leads').insert({
--     name, phone, source: 'Meta Ad', project: formName, notes: JSON.stringify(answers)
--   });
--
-- Option B: agar webhook pehle se kisi table me lead save karta hai
-- (maan lo 'meta_leads' with full_name / phone_number / form_name),
-- to niche ka trigger uncomment karke column names match karo:
--
-- create or replace function tc_from_meta() returns trigger language plpgsql as $$
-- begin
--   insert into tc_leads (name, phone, source, project)
--   values (new.full_name, new.phone_number, 'Meta Ad', new.form_name);
--   return new;
-- end $$;
-- drop trigger if exists meta_to_tc on meta_leads;
-- create trigger meta_to_tc after insert on meta_leads
--   for each row execute function tc_from_meta();
-- ═══════════════════════════════════════════════════════════════
