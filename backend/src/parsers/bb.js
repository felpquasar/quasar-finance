import { parseValorBR, parseDataBR } from '../lib/normalize.js';

// Parser de extrato de conta corrente do Banco do Brasil (PDF -> texto).
//
// Formato típico de linha do extrato BB:
//   "01/06/2026 Pix - Enviado 123456 FULANO DE TAL 150,00 D"
//   "05/06/2026 Crédito de Benefício INSS 1.412,00 C"
// Data no início, valor + sufixo C (crédito) / D (débito) no fim.
//
// Linha que parece transação mas não casa -> pendência (nada é descartado).

const LINHA_TRANSACAO = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.]+,\d{2})\s*([CD])\b/;
const IGNORAR = /saldo anterior|^s\s*a\s*l\s*d\s*o|saldo do dia|saldo atual|extrato de conta|cliente|ag[êe]ncia|conta corrente|lan[çc]amentos?\s+futuros|total\b/i;
const PARECE_TRANSACAO = /\d{2}\/\d{2}\/\d{4}.*[\d.]+,\d{2}/;

export function parseExtratoBB(texto) {
  const lancamentos = [];
  const pendencias = [];

  for (const linhaRaw of texto.split('\n')) {
    const linha = linhaRaw.replace(/\s+/g, ' ').trim();
    if (!linha || IGNORAR.test(linha)) continue;

    const m = linha.match(LINHA_TRANSACAO);
    if (m) {
      const data = parseDataBR(m[1]);
      const valorAbs = parseValorBR(m[3]);
      if (data && valorAbs !== null) {
        lancamentos.push({
          data,
          descricao: m[2].trim(),
          valor: m[4] === 'D' ? -valorAbs : valorAbs,
        });
        continue;
      }
    }

    if (PARECE_TRANSACAO.test(linha)) {
      pendencias.push({ linha_raw: linha, motivo: 'Linha do extrato BB não reconhecida pelo parser' });
    }
  }

  return { lancamentos, pendencias };
}
