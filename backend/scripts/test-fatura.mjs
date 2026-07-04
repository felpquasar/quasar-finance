import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { ocrFaturaPdf } from '../src/services/ia.js';

// Valida a calibração do OCR de fatura contra faturas reais (BB + Mercado Pago).
// Rodar do diretório backend/:  node scripts/test-fatura.mjs
// Requer ANTHROPIC_API_KEY com saldo no backend/.env.
// Faturas de referência ficam em ../faturas_bancos (gitignored se contiverem dados).

const base = '../../faturas_bancos';
const casos = [
  { banco: 'mercadopago', path: `${base}/credit-card-mp-statement.pdf`, esperaCompras: 577.71, esperaVenc: '2026-06-22' },
  { banco: 'bb', path: `${base}/fatura.pdf`, esperaCompras: 1012.78, esperaVenc: '2026-06-10' },
];

for (const c of casos) {
  console.log(`\n===== ${c.banco} =====`);
  let pdfBuffer;
  try {
    pdfBuffer = readFileSync(new URL(c.path, import.meta.url));
  } catch {
    console.log(`  (pulado: ${c.path} não encontrado)`);
    continue;
  }
  const { lancamentos, pendencias, vencimento } = await ocrFaturaPdf({ pdfBuffer, banco: c.banco });
  const soma = lancamentos.reduce((s, l) => s + Number(l.valor), 0);
  const fecha = Math.abs(soma + c.esperaCompras) < 0.01 ? 'OK' : 'FALHOU';
  console.log(`lançamentos: ${lancamentos.length} | soma: ${soma.toFixed(2)} | espera -${c.esperaCompras} | ${fecha}`);
  console.log(`vencimento: ${vencimento} | espera ${c.esperaVenc} | ${vencimento === c.esperaVenc ? 'OK' : 'DIVERGE'}`);
  console.log(`pendências: ${pendencias.length}`);
  for (const p of pendencias) console.log('  !', p.motivo, '—', p.linha_raw);
  for (const l of lancamentos) {
    const pc = l.parcela_total ? ` [${l.parcela_num}/${l.parcela_total}]` : '';
    console.log(`  ${l.data}  ${String(l.valor.toFixed(2)).padStart(9)}  ${l.descricao}${pc}`);
  }
}
