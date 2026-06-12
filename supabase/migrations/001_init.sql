-- =====================================================================
-- Sistema de Gestão Financeira Pessoal — Schema inicial (Fase 1)
-- Rodar no SQL Editor do Supabase (ou via supabase db push)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Contas (BB, Mercado Pago, Nubank...)
-- ---------------------------------------------------------------------
create table public.contas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id),
  nome             text not null,
  tipo             text not null check (tipo in ('corrente', 'cartao')),
  banco            text not null,
  natureza_default text not null default 'pessoal' check (natureza_default in ('pessoal', 'mista')),
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------
create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id),
  nome       text not null,
  criada_por text not null default 'felipe' check (criada_por in ('sistema', 'felipe')),
  criado_em  timestamptz not null default now(),
  unique (user_id, nome)
);

-- ---------------------------------------------------------------------
-- Compras parceladas (agrupador de parcelas da mesma compra)
-- ---------------------------------------------------------------------
create table public.compras_parceladas (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id),
  descricao      text not null,
  valor_total    numeric(12,2),
  parcelas_total int not null,
  data_compra    date,
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Lançamentos (coração do sistema)
-- valor: negativo = saída, positivo = entrada
-- ---------------------------------------------------------------------
create table public.lancamentos (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null default auth.uid() references auth.users(id),
  conta_id               uuid not null references public.contas(id),
  data                   date not null,
  descricao              text not null,
  descricao_normalizada  text not null,
  valor                  numeric(12,2) not null,
  natureza               text not null default 'pessoal'
                         check (natureza in ('pessoal', 'transito', 'quasar', 'compartilhada')),
  categoria_id           uuid references public.categorias(id),
  confianca_ia           numeric(3,2),
  status                 text not null default 'ok' check (status in ('ok', 'pendente')),
  compra_id              uuid references public.compras_parceladas(id),
  parcela_num            int,
  parcela_total          int,
  hash_dedup             text not null,
  origem                 text not null default 'extrato' check (origem in ('extrato', 'fatura', 'manual')),
  criado_em              timestamptz not null default now(),
  unique (user_id, hash_dedup)
);

create index idx_lancamentos_data on public.lancamentos (user_id, data);
create index idx_lancamentos_natureza on public.lancamentos (user_id, natureza);

-- ---------------------------------------------------------------------
-- Compromissos futuros (parcelas vincendas) — alimenta projeção
-- ---------------------------------------------------------------------
create table public.compromissos (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id),
  compra_id uuid not null references public.compras_parceladas(id),
  mes_ref   date not null,  -- primeiro dia do mês
  valor     numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- Regras de classificação (fixas do Felipe + aprendidas das correções)
-- ---------------------------------------------------------------------
create table public.regras (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id),
  padrao_descricao  text not null,  -- substring casada contra descricao_normalizada
  categoria_id      uuid references public.categorias(id),
  natureza          text check (natureza in ('pessoal', 'transito', 'quasar', 'compartilhada')),
  origem            text not null default 'manual' check (origem in ('manual', 'aprendida')),
  criado_em         timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Contas recorrentes (energia, internet, faturas...)
-- ---------------------------------------------------------------------
create table public.recorrentes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id),
  nome            text not null,
  dia_vencimento  int not null check (dia_vencimento between 1 and 31),
  valor_estimado  numeric(12,2),
  ativo           boolean not null default true
);

-- ---------------------------------------------------------------------
-- Contas avulsas com vencimento
-- ---------------------------------------------------------------------
create table public.contas_avulsas (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id),
  nome       text not null,
  vencimento date not null,
  valor      numeric(12,2) not null,
  status     text not null default 'aberta' check (status in ('aberta', 'paga'))
);

-- ---------------------------------------------------------------------
-- A receber (Yulae / Quasar-reembolso)
-- ---------------------------------------------------------------------
create table public.a_receber (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id),
  lancamento_id  uuid references public.lancamentos(id),
  devedor        text not null check (devedor in ('yulae', 'quasar')),
  valor          numeric(12,2) not null,
  status         text not null default 'aberto' check (status in ('aberto', 'recebido')),
  criado_em      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Repasses familiares (cartões Caixa/pai e Neon/irmã — fora do pipeline)
-- ---------------------------------------------------------------------
create table public.repasses_familia (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id),
  cartao         text not null check (cartao in ('caixa_pai', 'neon_irma')),
  mes_ref        date not null,
  valor_fatura   numeric(12,2) not null,
  vencimento     date not null,
  valor_recebido numeric(12,2) not null default 0,
  status         text not null default 'aguardando_pix'
                 check (status in ('aguardando_pix', 'recebido', 'pago'))
);

-- ---------------------------------------------------------------------
-- Splits (compartilhada com Yulae — default 50%)
-- ---------------------------------------------------------------------
create table public.splits (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id),
  lancamento_id      uuid not null references public.lancamentos(id),
  percentual_felipe  numeric(5,2) not null default 50
);

-- ---------------------------------------------------------------------
-- Metas e aportes
-- ---------------------------------------------------------------------
create table public.metas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id),
  nome        text not null,
  valor_alvo  numeric(12,2) not null,
  prazo       date,
  prioridade  int not null default 1,
  status      text not null default 'ativa' check (status in ('ativa', 'concluida', 'pausada'))
);

create table public.aportes (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null default auth.uid() references auth.users(id),
  meta_id  uuid not null references public.metas(id),
  mes_ref  date not null,
  valor    numeric(12,2) not null
);

-- ---------------------------------------------------------------------
-- Conversas com o agente (chat reativo — Fase 3)
-- ---------------------------------------------------------------------
create table public.conversas_agente (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id),
  role      text not null check (role in ('user', 'assistant')),
  conteudo  text not null,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fila de pendências (linhas ilegíveis do parser — nada se perde)
-- ---------------------------------------------------------------------
create table public.pendencias (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id),
  conta_id   uuid references public.contas(id),
  arquivo    text,
  linha_raw  text not null,
  motivo     text not null,
  status     text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  criado_em  timestamptz not null default now()
);

-- =====================================================================
-- RLS: dados financeiros são sensíveis — owner-only em TODAS as tabelas
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'contas', 'categorias', 'compras_parceladas', 'lancamentos',
    'compromissos', 'regras', 'recorrentes', 'contas_avulsas',
    'a_receber', 'repasses_familia', 'splits', 'metas', 'aportes',
    'conversas_agente', 'pendencias'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
