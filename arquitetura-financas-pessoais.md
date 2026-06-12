# Sistema de Gestão Financeira Pessoal — Documento de Arquitetura

**Dono:** Felipe · Codó/MA
**Data:** Junho/2026
**Status:** Arquitetura aprovada em entrevista — pronto para implementação

---

## 1. Objetivo

Dar clareza total sobre os gastos pessoais, identificar os gargalos que impedem sobra de dinheiro, e maximizar o aporte mensal rumo às metas financeiras.

**Meta central da V1:** R$ 5.000 de reserva de emergência em 12 meses → **aporte necessário: ~R$ 417/mês**. Esse número é a régua do sistema inteiro: toda análise, alerta e relatório responde à pergunta *"isso está me aproximando ou me afastando dos R$ 417?"*.

**Meta secundária:** zerar o uso do cartão Nubank (fatura corrente, centenas de reais, sem dívida/rotativo) e consolidar a vida financeira em BB + Mercado Pago. O sistema acompanha a fatura Nubank caindo até zero.

**Contexto de renda:** CLT afastado, recebendo auxílio-doença (renda fixa e reduzida — controle de gasto é crítico agora).

---

## 2. Escopo e Regras de Classificação do Dinheiro

### Dentro do escopo
Finanças pessoais do Felipe, alimentadas semanalmente.

### Fora do escopo
Quasar Barber (tem banco e gastos próprios) e finanças independentes da Yulae.

### As 4 regras de ouro da classificação

Todo lançamento que entra no sistema recebe uma natureza. Errar isso distorce a análise de gargalo — por isso essas regras são o coração do parser:

| Natureza | O que é | Tratamento |
|---|---|---|
| **Gasto pessoal** | Despesa sua de verdade | Conta na análise, nas categorias e na projeção |
| **Trânsito interno** | Transferência BB → Mercado Pago | Anulada automaticamente (não é gasto nem renda) |
| **Quasar-reembolso** | Despesa da Quasar paga no cartão pessoal, reembolsada com dinheiro da Quasar | Marcada, excluída do gasto pessoal, acompanhada até o reembolso cair |
| **Compartilhada (Yulae)** | Conta conjunta paga integralmente por você | Split 50/50 por padrão (ajustável por lançamento). Só sua parte conta como gasto. Parte dela vira "a receber" até o pix cair |
| **Repasse familiar** | Cartões 100% usados por terceiros: Caixa (pai) e Neon (irmã). Eles mandam o dinheiro, você paga a fatura | Não entra no pipeline de lançamentos. Acompanhamento simplificado por fatura: valor fechado → recebido → pago. Zero impacto no gasto pessoal |

### Regra especial: a conta BB é mista

No BB convivem o auxílio (pessoal), a transferência de saída pro Mercado Pago (trânsito) e o dinheiro da Quasar. Por isso:

- **Mercado Pago = conta pessoal primária.** Tudo nela é pessoal por padrão.
- **BB = conta mista.** O parser identifica como pessoal apenas: entrada do auxílio, transferência de saída pro MP e pagamentos pessoais reconhecidos. Todo o resto é marcado **Quasar** por padrão e excluído da análise pessoal (com revisão possível na fila de pendências).

### Regra especial: cartões de repasse familiar (Caixa e Neon)

Cartões no nome do Felipe, 100% usados pelo pai (Caixa) e pela irmã (Neon). O sistema **não lê essas faturas linha a linha** — acompanha apenas três números por ciclo:

1. **Fatura fechou:** valor e vencimento registrados (manual ou alerta recorrente)
2. **Dinheiro recebido:** pix do pai/irmã caiu no extrato → conciliação automática
3. **Fatura paga:** pagamento aparece no extrato → ciclo fechado ✓

O risco real desse arranjo é vigiado pelo agente: **se o pix deles não cair antes do vencimento, é o caixa do Felipe que cobre.** Alerta no WhatsApp: "fatura Caixa vence em 3 dias — pix do seu pai ainda não caiu". O pagamento dessas faturas no extrato é classificado como repasse (não é gasto pessoal).

---



**Ritmo:** alimentação semanal, no fim de semana. Tolerante a atraso por design (ver §8).

1. **Extratos em PDF:** Banco do Brasil (conta corrente) e Mercado Pago
2. **Faturas de cartão:** BB, Mercado Pago e Nubank — PDF quando disponível (preferencial), print/imagem com OCR quando não
3. **Lançamentos manuais:** dinheiro vivo, pix avulso, contas avulsas com data de vencimento
4. **Cadastro de contas recorrentes** (uma vez só): energia, internet, faturas de cartão etc., com dia de vencimento e valor estimado
5. **Metas financeiras:** nome, valor-alvo, prazo, prioridade

---

## 4. Pipeline de Processamento

```
Upload (PDF/print/manual)
   │
   ▼
[1] PARSER por banco
   • Extração de texto do PDF (layout específico por banco)
   • OCR para prints de fatura
   • Linha ilegível → fila de PENDÊNCIAS (nada é descartado em silêncio)
   │
   ▼
[2] DEDUPLICAÇÃO
   • Chave: data + valor + descrição normalizada
   • Permite subir o mesmo arquivo 2x ou semanas acumuladas sem duplicar
   │
   ▼
[3] CLASSIFICAÇÃO DE NATUREZA
   • Detecta trânsito interno BB→MP e anula
   • Conta BB: pessoal só o reconhecido; resto = Quasar
   • Marca Quasar-reembolso e Compartilhada (por regra ou IA)
   │
   ▼
[4] MOTOR DE PARCELAS
   • Detecta padrão "X/Y" na fatura
   • Agrupa parcelas da mesma compra
   • Cria compromissos futuros (parcelas vincendas) → alimenta projeção
   │
   ▼
[5] CATEGORIZAÇÃO (3 camadas)
   • Camada 1: regras fixas do Felipe (determinístico, roda primeiro)
   • Camada 2: IA (Claude via API) categoriza o resto; marca incertos
   • Camada 3: revisão humana só dos incertos → correção vira regra nova
   │
   ▼
[6] CONCILIAÇÕES AUTOMÁTICAS
   • Conta recorrente vencida × extrato → "pago ✓"
   • "A receber" (Yulae / Quasar) × pix recebido → baixa automática
   │
   ▼
[7] MOTORES DE ANÁLISE
   • Metas: sobra real vs. R$ 417/mês
   • Projeção de fluxo: fechamento estimado do mês em tempo real
     (médias + parcelas comprometidas + recorrentes a vencer)
   • Padrões de comportamento (amadurece com 2-3 meses de histórico)
```

**Princípio inviolável:** o pipeline nunca trava por arquivo ruim. O que não foi entendido vai para pendências e a sessão semanal resolve em segundos.

---

## 5. Categorias

Conjunto inicial (expansível pelo Felipe a qualquer momento):

Moradia · Mercado · Alimentação fora/Delivery · Transporte · Saúde · Lazer · Assinaturas · Vestuário · Educação · Casa (compartilhada) · Quasar-reembolso · Outros

- IA categoriza tudo; **tudo é editável**.
- Correção do Felipe gera regra aprendida (ex: "MERCADO SAO LUIS LTDA = Mercado, sempre").
- O esforço de revisão cai semana a semana.

---

## 6. O Subagente Financeiro

Dois modos, com fronteira clara na V1:

### Modo proativo (ele te procura) — via WhatsApp
- **Todo domingo:** resumo da semana — total gasto, top 3 categorias, comparação com a média, alerta de gargalo ("delivery já está 40% acima do mês passado"), progresso das metas e projeção de fechamento do mês.
- **Alertas de vencimento:** "⚠️ Energia vence em 2 dias — R$ ~180", com confirmação "pago ✓" quando o pagamento aparece no extrato.
- **Cobranças pendentes:** reembolso da Yulae ou da Quasar parado há muito tempo.
- **Semana sem dados:** em vez do relatório, um cutucão gentil pra subir os arquivos.

### Modo reativo (você o procura) — chat dentro do sistema
- Perguntas livres respondidas com consulta aos dados reais no banco: "quanto gastei com mercado esse mês?", "se eu cortar X, em quantos meses chego nos R$ 5.000?"
- WhatsApp bidirecional fica para V2 (complexidade de API oficial não se justifica agora).

---

## 7. Motor de Metas

Estrutura de cada meta: **nome · valor-alvo · prazo · prioridade**.

Para cada meta o sistema mostra três coisas:
1. **Quanto falta** (valor acumulado vs. alvo)
2. **Se o ritmo atual chega lá** (sobra média mensal × meses restantes)
3. **Qual ajuste fecha a conta** (apontando o gargalo específico: "cortar R$ 150 de delivery cobre 36% do que falta no aporte")

Metas iniciais cadastradas:
- **Reserva de emergência:** R$ 5.000 em 12 meses (~R$ 417/mês)
- **Zerar Nubank:** acompanhamento da fatura até R$ 0 e migração total para BB + MP

---

## 8. Casos Extremos e Modos de Falha

| Cenário | Comportamento |
|---|---|
| PDF/print ilegível ou layout mudou | Linhas problemáticas → fila de pendências; o resto processa normalmente |
| Semana(s) pulada(s) | Sobe tudo acumulado; deduplicação garante zero duplicata e zero perda |
| Mesmo arquivo subido 2x | Dedup absorve sem efeito colateral |
| Lançamento categorizado errado pela IA | Felipe edita; correção vira regra permanente |
| Reembolso (Yulae/Quasar) não cai | "A receber" fica aberto; agente cobra no resumo de domingo |
| Pix do pai/irmã não cai antes do vencimento | Alerta WhatsApp antecipado; pagamento marcado como coberto pelo caixa do Felipe até o pix entrar |
| Movimento desconhecido na conta BB | Default = Quasar (excluído), revisável em pendências |

---

## 9. Stack e Arquitetura Técnica

**Princípio:** usar o que o Felipe já domina (stack da Quasar Barber) — zero curva de aprendizado nova na V1.

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend | React + Vite, UI dark | Mesmo padrão do sistema Quasar |
| Banco + Auth | Supabase (PostgreSQL + RLS) | Dados financeiros são sensíveis: RLS obrigatório desde o dia 1 |
| Backend/jobs | Node.js (Express) | Mesmo padrão dos agentes DRE/CRM já construídos |
| Parsing PDF | pdf-parse / pdfjs no Node | Um módulo parser por banco (BB, MP, Nubank) |
| OCR de prints | Claude API com visão (imagem → lançamentos estruturados em JSON) | Mais robusto que Tesseract para fatura fotografada |
| Categorização + agente | Claude API | Saída JSON estruturada com flag de confiança |
| WhatsApp (saída) | Reaproveitar a automação existente do bot da Quasar (Selenium) na V1 | API oficial (Meta/Twilio) fica para V2 |
| Agendamento | Task Scheduler (Windows) ou cron no servidor, padrão já usado no bot diário | Job de domingo (resumo) + job diário (vencimentos) |

### Esquema de dados (Supabase)

```
contas            (id, nome, tipo[corrente|cartao], banco, natureza_default[pessoal|mista])
lancamentos       (id, conta_id, data, descricao, descricao_normalizada, valor,
                   natureza[pessoal|transito|quasar|compartilhada],
                   categoria_id, confianca_ia, status[ok|pendente],
                   compra_id, parcela_num, parcela_total, hash_dedup)
compras_parceladas(id, descricao, valor_total, parcelas_total, data_compra)
compromissos      (id, compra_id, mes_ref, valor)          -- parcelas futuras
categorias        (id, nome, criada_por[sistema|felipe])
regras            (id, padrao_descricao, categoria_id, natureza, origem[manual|aprendida])
recorrentes       (id, nome, dia_vencimento, valor_estimado, ativo)
contas_avulsas    (id, nome, vencimento, valor, status[aberta|paga])
a_receber         (id, lancamento_id, devedor[yulae|quasar], valor, status[aberto|recebido])
repasses_familia  (id, cartao[caixa_pai|neon_irma], mes_ref, valor_fatura, vencimento,
                   valor_recebido, status[aguardando_pix|recebido|pago])
splits            (id, lancamento_id, percentual_felipe)    -- default 50
metas             (id, nome, valor_alvo, prazo, prioridade, status)
aportes           (id, meta_id, mes_ref, valor)
conversas_agente  (id, role, conteudo, criado_em)
```

---

## 10. Fases de Implementação

### Fase 1 — Fundação (semanas 1-3)
Supabase (schema + RLS) · upload de arquivos · parser BB e Mercado Pago (extrato PDF) · dedup · lançamento manual · CRUD de categorias · classificação de natureza (trânsito, conta mista BB)

### Fase 2 — Inteligência (semanas 4-6)
Categorização IA em 3 camadas · fila de pendências · motor de parcelas · parser de faturas (PDF) + OCR de prints via Claude visão · split Yulae + a_receber

### Fase 3 — Agente e Metas (semanas 7-9)
Motor de metas (R$ 417/mês como régua) · projeção de fluxo · resumo de domingo no WhatsApp · alertas de vencimento · conciliação "pago ✓" · chat reativo no sistema

### Fase 4 — Maturação (mês 3+)
Detecção de padrões de comportamento (precisa de histórico) · refinamento das regras aprendidas · avaliação de WhatsApp bidirecional via API oficial · possível inclusão das finanças da casa como módulo

---

## 11. Riscos Conhecidos

1. **Layout de PDF dos bancos muda sem aviso.** Mitigação: parsers modulares por banco + fila de pendências como rede de segurança (nada se perde, no pior caso vira revisão manual).
2. **WhatsApp via Selenium é frágil** (já conhecido do bot da Quasar). Aceitável na V1; migrar para API oficial quando o sistema provar valor.
3. **OCR de print tem taxa de erro maior que PDF.** Mitigação: preferir sempre o PDF da fatura quando o banco oferece; print é fallback.
4. **Disciplina do ritual semanal.** Mitigação: o cutucão de domingo + a sessão de pendências desenhada para durar menos de 5 minutos.
