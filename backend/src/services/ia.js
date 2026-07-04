import Anthropic from '@anthropic-ai/sdk';

// Integração com a Claude API (§9 da arquitetura):
// - Categorização (camada 2): o que as regras não pegam, a IA categoriza
//   com flag de confiança. Incertos vão para revisão humana (camada 3).
// - OCR de extratos: PDF sem camada de texto (app do BB) vira lançamentos
//   estruturados direto no fluxo de upload.
//
// Modelo configurável via IA_MODEL no .env (default: claude-opus-4-8).

const MODEL = process.env.IA_MODEL || 'claude-opus-4-8';
const LIMIAR_CONFIANCA = 0.7;

let client = null;

export function iaDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const CONTEXTO_FELIPE = `Você categoriza lançamentos financeiros pessoais do Felipe, morador de Codó-MA, Brasil.
Contexto: ele é dono da barbearia Quasar Barber (gastos da barbearia têm natureza própria e NÃO passam por você),
recebe auxílio-doença, usa Banco do Brasil e Mercado Pago. Yulae é a esposa dele.
Significado das categorias:
- Mercado: supermercado, mercadinho, hortifruti, açougue
- Alimentação fora/Delivery: iFood, restaurantes, lanches, delivery
- Transporte: combustível, Uber, moto (consórcio Honda = Transporte), manutenção de veículo, seguro veicular
- Saúde: farmácia, laboratório, consultas, plano de saúde
- Moradia: aluguel, condomínio, IPTU, reforma
- Casa (compartilhada): contas da casa divididas com a Yulae (energia, água, internet residencial)
- Assinaturas: streaming, telefonia (TIM, Vivo...), apps, mensalidades digitais
- Lazer: passeios, jogos, bares, eventos
- Vestuário: roupas, calçados
- Educação: cursos, faculdade, material de estudo
- Quasar-reembolso: compra claramente da barbearia feita com dinheiro pessoal
- Outros: o que não couber acima
Atribua confianca entre 0 e 1 (1 = certeza). Use confianca abaixo de 0.7 quando a descrição for ambígua.`;

// Camada 2: categoriza lançamentos sem categoria. Recebe [{id, descricao, valor, data}]
// e a lista de categorias do usuário. Retorna [{id, categoria (nome), confianca}].
export async function categorizarComIA({ lancamentos, categorias }) {
  const nomes = categorias.map((c) => c.nome);

  const schema = {
    type: 'object',
    properties: {
      itens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            categoria: { type: 'string', enum: nomes },
            confianca: { type: 'number' },
          },
          required: ['id', 'categoria', 'confianca'],
          additionalProperties: false,
        },
      },
    },
    required: ['itens'],
    additionalProperties: false,
  };

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: CONTEXTO_FELIPE,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [
      {
        role: 'user',
        content: `Categorize cada lançamento (valor negativo = gasto, positivo = entrada):\n${JSON.stringify(
          lancamentos.map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, valor: l.valor }))
        )}`,
      },
    ],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Categorização recusada pela IA');
  }
  const texto = response.content.find((b) => b.type === 'text')?.text;
  return JSON.parse(texto).itens;
}

// Aplica a camada 2 em lançamentos do banco: define categoria_id + confianca_ia;
// incerteza (< 0.7) marca status pendente para a revisão humana (camada 3).
// Nunca lança erro pra fora — pipeline não trava por falha de IA.
export async function aplicarCategorizacaoIA({ supabase, userId, lancamentos }) {
  if (!iaDisponivel() || lancamentos.length === 0) {
    return { categorizados: 0, incertos: 0 };
  }
  try {
    const { data: categorias, error } = await supabase
      .from('categorias')
      .select('id, nome')
      .eq('user_id', userId);
    if (error) throw error;

    const itens = await categorizarComIA({ lancamentos, categorias });
    const idPorNome = Object.fromEntries(categorias.map((c) => [c.nome, c.id]));

    let categorizados = 0;
    let incertos = 0;
    for (const item of itens) {
      const categoriaId = idPorNome[item.categoria];
      if (!categoriaId) continue;
      const incerto = Number(item.confianca) < LIMIAR_CONFIANCA;
      const { error: errUpd } = await supabase
        .from('lancamentos')
        .update({
          categoria_id: categoriaId,
          confianca_ia: Math.max(0, Math.min(1, Number(item.confianca))),
          ...(incerto ? { status: 'pendente' } : {}),
        })
        .eq('id', item.id)
        .eq('user_id', userId);
      if (!errUpd) {
        categorizados++;
        if (incerto) incertos++;
      }
    }
    return { categorizados, incertos };
  } catch (e) {
    console.error('Categorização IA falhou (lançamentos seguem sem categoria):', e.message);
    return { categorizados: 0, incertos: 0, erro: e.message };
  }
}

// OCR: extrai lançamentos de um PDF sem camada de texto (foto/imagem).
// O modelo também extrai saldo anterior/final do extrato; o backend valida
// a soma (saldo_anterior + Σ valores = saldo_final). Se não fechar, devolve
// o erro pro modelo corrigir (1 retry). Falha persistente vira pendência —
// nada entra silenciosamente errado.
// Retorna { lancamentos: [{data, descricao, valor, id_externo}], pendencias: [] }.
export async function ocrExtratoPdf({ pdfBuffer, banco }) {
  const schema = {
    type: 'object',
    properties: {
      lancamentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Data do movimento em YYYY-MM-DD' },
            descricao: { type: 'string', description: 'Histórico + nome/identificador da contraparte, sem horários' },
            valor: { type: 'number', description: 'Negativo para débito (D), positivo para crédito (C)' },
            id_externo: { type: 'string', description: 'Número do documento/ID da operação, se houver' },
          },
          required: ['data', 'descricao', 'valor', 'id_externo'],
          additionalProperties: false,
        },
      },
      saldo_anterior: { type: 'number', description: 'Saldo anterior/inicial impresso no extrato; 0 se ausente' },
      saldo_final: { type: 'number', description: 'Saldo final impresso no extrato; 0 se ausente' },
      observacoes: { type: 'string', description: 'Linhas ilegíveis ou dúvidas; vazio se nenhuma' },
    },
    required: ['lancamentos', 'saldo_anterior', 'saldo_final', 'observacoes'],
    additionalProperties: false,
  };

  const mensagens = [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: `Extraia TODOS os movimentos deste extrato bancário (banco: ${banco}).
Regras:
- Linhas de saldo (Saldo Anterior, S A L D O) NÃO são movimentos — extraia-as em saldo_anterior/saldo_final.
- Ignore seções de limite/empréstimo/CET.
- O SINAL vem EXCLUSIVAMENTE do marcador C/D ao lado do valor na coluna Valor:
  D = débito = valor NEGATIVO; C = crédito = valor POSITIVO.
  NUNCA deduza o sinal pelo texto do histórico — "Pagto cartão crédito" com marcador D é um DÉBITO (negativo).
- descricao: histórico + nome ou CPF/CNPJ da contraparte, sem horários.
- id_externo: número do documento ou ID da operação da linha.
- Não invente movimentos; se uma linha estiver ilegível, registre em observacoes.`,
        },
      ],
    },
  ];

  let dados = null;
  let diferenca = null;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    // Streaming: OCR de extratos longos pode passar do timeout não-streaming
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { format: { type: 'json_schema', schema } },
      messages: mensagens,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') throw new Error('OCR recusado pela IA');

    const texto = response.content.find((b) => b.type === 'text')?.text;
    dados = JSON.parse(texto);

    const soma = dados.lancamentos.reduce((s, l) => s + Number(l.valor), 0);
    diferenca = dados.saldo_anterior + soma - dados.saldo_final;
    if (Math.abs(diferenca) < 0.01) {
      diferenca = 0;
      break;
    }

    // Não fechou: devolve o erro pro modelo reexaminar os marcadores C/D
    if (tentativa === 1) {
      mensagens.push(
        { role: 'assistant', content: texto },
        {
          role: 'user',
          content: `Sua extração não fecha com os saldos do extrato: saldo_anterior (${dados.saldo_anterior.toFixed(2)}) + soma dos valores (${soma.toFixed(2)}) = ${(dados.saldo_anterior + soma).toFixed(2)}, mas saldo_final é ${dados.saldo_final.toFixed(2)} — diferença de ${diferenca.toFixed(2)}.
Dica: um único movimento com sinal trocado gera diferença igual a 2x o valor dele (${Math.abs(diferenca / 2).toFixed(2)}). Reexamine o marcador C/D de cada linha — especialmente as cujo histórico contém palavras como "crédito" — e reenvie a extração completa corrigida.`,
        }
      );
    }
  }

  const pendencias = [];
  if (dados.observacoes && dados.observacoes.trim()) {
    pendencias.push({
      linha_raw: dados.observacoes.slice(0, 500),
      motivo: 'OCR sinalizou linhas ilegíveis/dúvidas',
    });
  }
  if (diferenca !== 0) {
    pendencias.push({
      linha_raw: `Soma dos movimentos não fecha com os saldos do extrato (diferença R$ ${diferenca.toFixed(2)})`,
      motivo: 'OCR: confira sinais/valores dos lançamentos importados deste arquivo',
    });
  }
  return { lancamentos: dados.lancamentos, pendencias };
}

// OCR de FATURA de cartão (PDF imagem/texto). Difere do extrato:
// - cada compra parcelada exibe a parcela do mês ("03/12") -> parcela_num/total;
// - validação fecha pela "total desta fatura" (Σ lançamentos = -total a pagar);
// - id_externo carrega "num/total" da parcela, garantindo hash de dedup único
//   por parcela (a fatura repete a data da compra original em todo mês).
// Retorna { lancamentos: [{data, descricao, valor, id_externo, parcela_num,
//   parcela_total}], pendencias, vencimento (YYYY-MM-DD|null) }.
// CALIBRAR com fatura real (Nubank): conferir layout de parcela e o que entra
// no "total desta fatura" (pagamento anterior/estornos podem ficar de fora).
export async function ocrFaturaPdf({ pdfBuffer, banco }) {
  const schema = {
    type: 'object',
    properties: {
      lancamentos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            data: { type: 'string', description: 'Data da compra em YYYY-MM-DD (nas parceladas, a data da compra original impressa na linha)' },
            descricao: { type: 'string', description: 'Estabelecimento/descrição, sem o marcador de parcela e sem horários' },
            valor: { type: 'number', description: 'Compra/encargo = NEGATIVO; estorno/crédito/pagamento = POSITIVO' },
            parcela_num: { type: 'integer', description: 'Número da parcela desta fatura (o NN em "NN/MM", "NN de MM", "PARC NN/MM"); 0 se a compra NÃO é parcelada' },
            parcela_total: { type: 'integer', description: 'Total de parcelas da compra (o MM); 0 se NÃO é parcelada' },
          },
          required: ['data', 'descricao', 'valor', 'parcela_num', 'parcela_total'],
          additionalProperties: false,
        },
      },
      total_compras: { type: 'number', description: 'Total de COMPRAS do período (NÃO o total a pagar), positivo. Rótulo varia por emissor: "Total de compras do período" (Nubank); "Consumos de DD/MM a DD/MM" (Mercado Pago); soma de "Compras nacionais" + "Compras internacionais" (Banco do Brasil)' },
      total_fatura: { type: 'number', description: 'Linha "Total a pagar"/"Total"/"Valor" do topo da fatura, positivo (pode diferir do total de compras por saldo/fatura anterior)' },
      vencimento: { type: 'string', description: 'Data de "Vencimento"/"Vence em" em YYYY-MM-DD; vazio se ausente' },
      observacoes: { type: 'string', description: 'Linhas ilegíveis ou dúvidas; vazio se nenhuma' },
    },
    required: ['lancamentos', 'total_compras', 'total_fatura', 'vencimento', 'observacoes'],
    additionalProperties: false,
  };

  const mensagens = [
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: `Extraia os lançamentos da SEÇÃO DE TRANSAÇÕES desta fatura de cartão de crédito (emissor: ${banco}).

EXTRAIR como lançamento:
- Cada linha de COMPRA/encargo (data + estabelecimento + valor): valor NEGATIVO.
- Estorno/devolução/crédito de uma compra: valor POSITIVO.

NÃO extrair (viram total_compras/total_fatura ou são ignorados):
- Linhas de resumo: "Saldo fatura anterior", "Saldo em aberto", "Fatura anterior", limites, "Total de compras", "Compras nacionais/internacionais", "Total a pagar", "Total da fatura", "Consumos de ...".
- PAGAMENTO da própria fatura: "Pagamento recebido", "Pagamento da fatura de <mês>", "PGTO ...", e qualquer linha sob o título "Pagamentos/Créditos" que quita a fatura. NUNCA vira lançamento (já entra pelo extrato da conta).
- Títulos de seção/categoria SEM valor ("Restaurantes", "Serviços", "Compras parceladas", nome/final do cartão, "Movimentações na fatura").
- SUBTOTAIS por cartão ou por seção (linha "Total R$ ..." que fecha um bloco). A fatura pode listar transações de VÁRIOS cartões, cada um com seu subtotal — ignore os subtotais e extraia as transações de todos.
- Blocos de limites, IOF, juros/CET, pontos, propaganda e opções/alternativas de pagamento.

PARCELAS:
- Marcador: "Parcela NN/MM", "Parcela NN de MM", "NN/MM" ou "PARC NN/MM" (pode estar no MEIO da descrição, com cidade/UF depois). Preencha parcela_num=NN, parcela_total=MM e REMOVA o marcador da descrição. O valor da linha é o da PARCELA, não o total da compra. À vista/sem parcela: parcela_num=0, parcela_total=0.

CAMPOS:
- valor: o valor à direita da linha da transação. Ignore a coluna de "País" (BR/US) e horários.
- data: a data impressa na linha ("DD/MM" ou "DD MMM"), em YYYY-MM-DD. Sem ano impresso, infira pelo vencimento: meses POSTERIORES ao mês do vencimento pertencem ao ano anterior. Em parceladas a data é a da COMPRA ORIGINAL (pode ser de muitos meses atrás).
- total_compras: total de COMPRAS do período ("Total de compras do período" / "Consumos de DD/MM a DD/MM" / "Compras nacionais"+"Compras internacionais"). NÃO use o "Total a pagar". total_fatura: "Total a pagar"/"Total"/"Valor". vencimento: data de "Vencimento"/"Vence em".
- Não invente linhas; dúvidas/ilegíveis vão em observacoes.`,
        },
      ],
    },
  ];

  let dados = null;
  let diferenca = null;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 32000,
      output_config: { format: { type: 'json_schema', schema } },
      messages: mensagens,
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') throw new Error('OCR de fatura recusado pela IA');

    const texto = response.content.find((b) => b.type === 'text')?.text;
    dados = JSON.parse(texto);

    // Fecha quando Σ transações = -(total de compras do período): compras
    // negativas somam o total; estornos (positivos) abatem. O "total a pagar"
    // NÃO serve aqui — ele inclui saldo/fatura anterior, fora das transações.
    const soma = dados.lancamentos.reduce((s, l) => s + Number(l.valor), 0);
    diferenca = soma + Number(dados.total_compras);
    if (Math.abs(diferenca) < 0.01) {
      diferenca = 0;
      break;
    }
    if (tentativa === 1) {
      mensagens.push(
        { role: 'assistant', content: texto },
        {
          role: 'user',
          content: `Sua extração não fecha com o total de compras do período: soma dos lançamentos (${soma.toFixed(2)}) deveria ser o negativo do total de compras (${Number(dados.total_compras).toFixed(2)}), mas a diferença é ${diferenca.toFixed(2)}.
Dica: um único lançamento com sinal trocado gera diferença igual a 2x o valor dele (${Math.abs(diferenca / 2).toFixed(2)}). Confira se você (a) extraiu o valor da PARCELA e não o total da compra, (b) não incluiu linhas do resumo, (c) não deixou transação de fora. Reenvie a extração completa corrigida.`,
        }
      );
    }
  }

  // id_externo carrega a parcela -> hash de dedup único por parcela
  const lancamentos = dados.lancamentos.map((l) => ({
    data: l.data,
    descricao: l.descricao,
    valor: l.valor,
    parcela_num: l.parcela_total > 0 ? l.parcela_num : null,
    parcela_total: l.parcela_total > 0 ? l.parcela_total : null,
    id_externo: l.parcela_total > 0 ? `${l.parcela_num}/${l.parcela_total}` : '',
  }));

  const pendencias = [];
  if (dados.observacoes && dados.observacoes.trim()) {
    pendencias.push({
      linha_raw: dados.observacoes.slice(0, 500),
      motivo: 'OCR de fatura sinalizou linhas ilegíveis/dúvidas',
    });
  }
  if (diferenca !== 0) {
    pendencias.push({
      linha_raw: `Soma dos lançamentos não fecha com o total da fatura (diferença R$ ${diferenca.toFixed(2)})`,
      motivo: 'OCR de fatura: confira sinais/valores dos lançamentos importados',
    });
  }
  return { lancamentos, pendencias, vencimento: dados.vencimento || null };
}
