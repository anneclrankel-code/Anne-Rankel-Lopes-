-- Fabi Tsunemi · atualização para a V2
-- Só precisa rodar se o banco já tinha sido criado com o schema.sql da V1.
-- Supabase → SQL Editor → New query → cole tudo → Run.

-- Agendamentos com mais de um serviço
alter table appointments add column if not exists services jsonb;

-- Manutenção de unha: duração sugerida passa a ser 2h
update services set duration_min = 120 where name = 'Manutenção de unha' and duration_min = 165;
