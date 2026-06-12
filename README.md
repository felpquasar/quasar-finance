# Sistema de Gestão Financeira Pessoal

Implementação da arquitetura descrita em `arquitetura-financas-pessoais.md`.

**Status atual: Fase 1 — Fundação**
Schema Supabase + RLS · upload de extratos PDF (BB e Mercado Pago) · deduplicação ·
classificação de natureza (trânsito BB→MP, conta mista BB) · lançamento manual ·
CRUD de categorias · fila de pendências · regras aprendidas das correções.

## Estrutura

```
supabase/migrations/  Schema SQL (rodar no Supabase)
backend/              API Node.js + Express (porta 3001)
frontend/             React + Vite, UI dark (porta 5173)
```

## Setup (uma vez só)

### 1. Supabase
1. Crie um projeto em https://supabase.com
2. SQL Editor → cole e execute `supabase/migrations/001_init.sql`
3. Settings → API: copie a URL, a `anon key` e a `service_role key`

### 2. Backend
```
cd backend
copy .env.example .env     # preencha SUPABASE_URL, SERVICE_ROLE_KEY e SEED_PASSWORD
npm install
npm run seed               # cria usuário, contas, categorias e metas iniciais
npm run dev                # API em http://localhost:3001
```

### 3. Frontend
```
cd frontend
copy .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev                # http://localhost:5173
```

Login: e-mail e senha definidos no seed (`SEED_EMAIL` / `SEED_PASSWORD`).

## Fluxo semanal

1. Baixar extratos PDF do BB e do Mercado Pago
2. "Subir extratos" → processar (dedup automática; pode repetir arquivo)
3. Revisar "Pendências" (linhas que o parser não entendeu)
4. Em "Lançamentos", corrigir natureza/categoria dos marcados "revisar" —
   cada correção vira regra permanente
5. Conferir a "Visão geral": sobra do mês vs. régua de R$ 417

## Importante: calibração dos parsers

Os parsers de BB e Mercado Pago foram escritos sobre o layout típico desses
PDFs, mas **precisam ser calibrados com extratos reais**. Na primeira
importação, é esperado que parte das linhas caia em pendências. Guarde um
extrato real de cada banco para ajustarmos os regex — nada se perde no
processo (princípio do pipeline: linha não entendida → fila de pendências).

## Próximas fases

- **Fase 2:** categorização IA (Claude), parser de faturas de cartão, OCR de
  prints, motor de parcelas, split Yulae + a_receber
- **Fase 3:** motor de metas, projeção de fluxo, resumo de domingo e alertas
  no WhatsApp, chat reativo
- **Fase 4:** padrões de comportamento, WhatsApp bidirecional
