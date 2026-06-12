// Classificação de natureza — as 4 regras de ouro (§2 da arquitetura).
//
// Ordem de decisão:
//   1. Regra explícita do Felipe (tabela regras) com natureza definida
//   2. Trânsito interno BB -> MP (anulado: não é gasto nem renda)
//   3. Conta BB é MISTA: pessoal só o reconhecido; resto = Quasar (revisável)
//   4. Conta pessoal (MP, Nubank...): pessoal por padrão

const RE_MERCADO_PAGO = /mercado\s*pago|mercadopago|mer\s*pago/i;
const RE_BANCO_BRASIL = /banco do brasil|bco do brasil|bb\b/i;
// Renda pessoal reconhecida na conta mista: auxílio/INSS e proventos do
// empregador (extrato BB real usa "Recebimento de Proventos")
const RE_RENDA_PESSOAL = /inss|benef[íi]cio|aux[íi]lio|proventos/i;
// Pix entre as próprias contas (BB <-> MP) aparece no extrato com o nome do
// titular (às vezes truncado: "FELIPE PERE") ou com o CPF do Felipe.
// Identificadores fixos são aceitáveis: sistema é pessoal.
const RE_PROPRIO_NOME = /felipe pereira ferreira|felipe pere\b|7644755330/i;
const RE_PIX = /pix\s*-?\s*(enviado|recebido)/i;

export function classificarNatureza({ lanc, conta, regras }) {
  const descNorm = lanc.descricao_normalizada;

  // 1. Regras do Felipe (substring contra descrição normalizada)
  for (const regra of regras) {
    if (regra.natureza && descNorm.includes(regra.padrao_descricao)) {
      return { natureza: regra.natureza, status: 'ok', categoria_id: regra.categoria_id || null };
    }
  }

  // 2. Trânsito interno entre contas próprias (BB <-> MP)
  if (conta.banco === 'bb' && lanc.valor < 0 && RE_MERCADO_PAGO.test(lanc.descricao)) {
    return { natureza: 'transito', status: 'ok', categoria_id: null };
  }
  if (conta.banco === 'mercadopago' && lanc.valor > 0 && RE_BANCO_BRASIL.test(lanc.descricao)) {
    return { natureza: 'transito', status: 'ok', categoria_id: null };
  }
  if (RE_PIX.test(lanc.descricao) && RE_PROPRIO_NOME.test(lanc.descricao)) {
    return { natureza: 'transito', status: 'ok', categoria_id: null };
  }

  // 3. Conta mista (BB): pessoal só o reconhecido, resto = Quasar
  if (conta.natureza_default === 'mista') {
    if (lanc.valor > 0 && RE_RENDA_PESSOAL.test(lanc.descricao)) {
      return { natureza: 'pessoal', status: 'ok', categoria_id: null };
    }
    // Desconhecido na conta mista: default Quasar, marcado pendente p/ revisão
    return { natureza: 'quasar', status: 'pendente', categoria_id: null };
  }

  // 4. Conta pessoal: tudo pessoal por padrão
  return { natureza: 'pessoal', status: 'ok', categoria_id: null };
}

// Aplica regras de categoria (sem natureza) — Camada 1 da categorização.
// Camadas 2 (IA) e 3 (revisão) chegam na Fase 2.
export function aplicarRegraCategoria({ descricaoNormalizada, regras }) {
  for (const regra of regras) {
    if (regra.categoria_id && descricaoNormalizada.includes(regra.padrao_descricao)) {
      return regra.categoria_id;
    }
  }
  return null;
}
