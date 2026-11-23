-- Fabi Tsunemi · estrutura do banco de dados
-- Cole este texto inteiro no Supabase em "SQL Editor" → "New query" e clique em "Run".

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration_min integer not null check (duration_min > 0),
  price numeric(10,2),
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_phone text,
  service_id uuid references services(id) on delete set null,
  service_name text not null,        -- guardado junto para o histórico não mudar (ex.: "Mão simples + Pé simples")
  services jsonb,                    -- V2: lista dos serviços do agendamento
  duration_min integer not null,     -- duração deste agendamento (pode ser diferente da sugerida)
  price numeric(10,2),               -- valor na data (para o painel financeiro da Etapa 2)
  date date not null,
  start_time text not null,          -- "HH:MM"
  end_time text not null,            -- "HH:MM"
  status text not null default 'scheduled', -- scheduled | cancelled
  created_on date not null,          -- dia em que foi agendado (régua de lembretes)
  sent_confirm boolean not null default false,
  sent_3d boolean not null default false,
  sent_eve boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists appointments_date_idx on appointments (date);

create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time text not null,
  end_time text not null,
  label text not null default 'Almoço',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id integer primary key default 1 check (id = 1),
  data jsonb not null
);

-- Segurança: só quem fez login (a Fabi) pode ler e mexer nos dados.
alter table services enable row level security;
alter table appointments enable row level security;
alter table blocks enable row level security;
alter table settings enable row level security;

drop policy if exists "fabi" on services;
drop policy if exists "fabi" on appointments;
drop policy if exists "fabi" on blocks;
drop policy if exists "fabi" on settings;
create policy "fabi" on services for all to authenticated using (true) with check (true);
create policy "fabi" on appointments for all to authenticated using (true) with check (true);
create policy "fabi" on blocks for all to authenticated using (true) with check (true);
create policy "fabi" on settings for all to authenticated using (true) with check (true);

-- Serviços de teste (podem ser editados no app depois)
insert into services (name, duration_min, color)
select * from (values
  ('Manutenção de unha', 120, '#1f3a68'),
  ('Pé simples', 40, '#c2577a'),
  ('Mão simples', 40, '#3f8f7a')
) v(name, duration_min, color)
where not exists (select 1 from services);
