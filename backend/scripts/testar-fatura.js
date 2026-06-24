import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { ocrFaturaPdf } from '../src/services/ia.js';

// Teste isolado do OCR de fatura (sem HTTP/auth/banco): roda a extração
// contra um PDF e imprime lançamentos + totais + validação.
// Uso: node scripts/testar-fatura.js "C:/caminho/Nubank.pdf" nubank
const caminho = process.argv[2];
const banco = process.argv[3] || 'nubank';
if (!caminho) {
  console.error('Uso: node scripts/testar-fatura.js <fatura.pdf> [banco]');
  process.exit(1);
}

const pdfBuffer = readFileSync(caminho);
const { lancamentos, pendencias, vencimento } = await ocrFaturaPdf({ pdfBuffer, banco });

console.log('\n=== LANÇAMENTOS ===');
for (const l of lancamentos) {
  const p = l.parcela_total ? ` [parc ${l.parcela_num}/${l.parcela_total} id=${l.id_externo}]` : '';
  console.log(`${l.data}  ${String(l.valor).padStart(10)}  ${l.descricao}${p}`);
}
const soma = lancamentos.reduce((s, l) => s + Number(l.valor), 0);
console.log('\nΣ lançamentos:', soma.toFixed(2));
console.log('vencimento:', vencimento);
console.log('pendências:', JSON.stringify(pendencias, null, 2));
