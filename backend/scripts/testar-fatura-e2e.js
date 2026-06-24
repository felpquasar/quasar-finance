import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ocrFaturaPdf } from '../src/services/ia.js';
import { ingestLancamentos } from '../src/services/ingest.js';

// Teste fim-a-fim do caminho de fatura: OCR -> ingest (origem fatura) ->
// motor de parcelas -> confere compras_parceladas + compromissos.
// Uso: node scripts/testar-fatura-e2e.js "C:/.../Nubank.pdf" nubank
const caminho = process.argv[2];
const banco = process.argv[3] || 'nubank';
if (!caminho) {
  console.error('Uso: node scripts/testar-fatura-e2e.js <fatura.pdf> [banco]');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: errAuth } = await supabase.auth.signInWithPassword({
  email: process.env.SEED_EMAIL,
  password: process.env.SEED_PASSWORD,
});
if (errAuth) throw errAuth;
const userId = auth.user.id;

const { data: conta, error: errConta } = await supabase
  .from('contas')
  .select('*')
  .eq('user_id', userId)
  .eq('banco', banco)
  .eq('tipo', 'cartao')
  .single();
if (errConta || !conta) throw new Error(`Cartão do banco "${banco}" não encontrado`);

const { lancamentos, pendencias, vencimento } = await ocrFaturaPdf({
  pdfBuffer: readFileSync(caminho),
  banco: conta.banco,
});
const base = /^\d{4}-\d{2}-\d{2}$/.test(vencimento || '') ? new Date(vencimento) : new Date();
const mesRefFatura = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`;

const resultado = await ingestLancamentos({
  userId,
  conta,
  brutos: lancamentos,
  pendencias,
  nomeArquivo: caminho.split(/[\\/]/).pop(),
  origem: 'fatura',
  mesRefFatura,
});
console.log('mesRefFatura:', mesRefFatura);
console.log('resultado:', JSON.stringify(resultado, null, 2));

const { data: compras } = await supabase
  .from('compras_parceladas')
  .select('descricao, valor_total, parcelas_total, data_compra')
  .eq('user_id', userId)
  .order('descricao');
console.log('\n=== compras_parceladas ===');
console.table(compras);

const { data: comps } = await supabase
  .from('compromissos')
  .select('mes_ref, valor, compra_id')
  .eq('user_id', userId)
  .order('mes_ref');
console.log('=== compromissos (parcelas vincendas) ===');
console.table(comps);
