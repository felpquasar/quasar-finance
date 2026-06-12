import { parseValorBR, parseDataBR } from '../lib/normalize.js';

// Parser de extrato de conta do Mercado Pago (PDF -> texto).
//
// Layout real (calibrado com extrato de 2026): cada movimento ocupa
// MÚLTIPLAS linhas no texto extraído do PDF:
//
//   03-05-2026                                 <- data sozinha na linha
//   Pix recebido Gilcilea Pereira              <- descrição (pode quebrar
//   Ferreira                                      em 2+ linhas)
//   157496898512R$ 236,41R$ 1.497,66           <- ID + valor + saldo, grudados
//
// Máquina de estados: data abre movimento -> acumula descrição -> linha
// com dois "R$" fecha (1º valor = movimento, 2º = saldo, ignorado).
// O ID da operação vira id_externo (deduplicação perfeita).

const DATA_SOZINHA = /^(\d{2}-\d{2}-\d{4})$/;
const FECHAMENTO = /^(\d*)\s*R\$\s*(-?[\d.]+,\d{2})\s*R\$\s*(-?[\d.]+,\d{2})$/;
const IGNORAR = /^(extrato de conta|detalhe dos movimentos|datadescri|cpf\/cnpj|de \d{2}-\d{2}-\d{4}|saldo inicial|entradas:|saidas:|sa[íi]das:|per[íi]odo|\d+\/\d+$)/i;

export function parseExtratoMP(texto) {
  const lancamentos = [];
  const pendencias = [];
  let atual = null; // { data, descParts: [] }

  const abandonar = (motivo) => {
    if (!atual) return;
    pendencias.push({
      linha_raw: `${atual.data} ${atual.descParts.join(' ')}`.trim(),
      motivo,
    });
    atual = null;
  };

  for (const linhaRaw of texto.split('\n')) {
    const linha = linhaRaw.replace(/\s+/g, ' ').trim();
    if (!linha || IGNORAR.test(linha)) continue;

    const mData = linha.match(DATA_SOZINHA);
    if (mData) {
      // Nova data com movimento anterior ainda aberto = anterior incompleto
      abandonar('Movimento sem linha de valor no extrato MP');
      atual = { data: parseDataBR(mData[1]), descParts: [] };
      continue;
    }

    if (!atual) continue; // texto fora de movimento (cabeçalhos etc.)

    const mFecha = linha.match(FECHAMENTO);
    if (mFecha) {
      const valor = parseValorBR(mFecha[2]);
      const descricao = atual.descParts.join(' ').trim();
      if (valor !== null && descricao) {
        lancamentos.push({
          data: atual.data,
          descricao,
          valor,
          id_externo: mFecha[1] || null,
        });
      } else {
        abandonar('Movimento ilegível no extrato MP');
      }
      atual = null;
      continue;
    }

    atual.descParts.push(linha);
  }
  abandonar('Movimento sem linha de valor no fim do extrato MP');

  // Rede de segurança: arquivo tem a seção de movimentos mas nada foi lido
  // -> layout mudou; sinaliza em vez de retornar silêncio.
  if (lancamentos.length === 0 && pendencias.length === 0 && /detalhe dos movimentos/i.test(texto)) {
    pendencias.push({
      linha_raw: texto.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5).join(' | '),
      motivo: 'Layout do extrato MP não reconhecido — parser precisa de ajuste',
    });
  }

  return { lancamentos, pendencias };
}
