import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { ingestLancamentos } from '../src/services/ingest.js';

// Importa lançamentos estruturados (JSON) pelo pipeline normal
// (classificação de natureza + dedup). Usado quando o PDF do banco não tem
// camada de texto e os dados foram extraídos por OCR/visão.
// Uso: node scripts/importar-json.js scripts/dados/bb-2026-05.json

const arquivoJson = process.argv[2];
if (!arquivoJson) {
  console.error('Uso: node scripts/importar-json.js <arquivo.json>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { banco, arquivo, lancamentos } = JSON.parse(readFileSync(arquivoJson, 'utf8'));

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
  .eq('tipo', 'corrente')
  .single();
if (errConta || !conta) throw new Error(`Conta corrente do banco "${banco}" não encontrada`);

const resultado = await ingestLancamentos({
  userId,
  conta,
  brutos: lancamentos,
  nomeArquivo: arquivo,
});

console.log(`${arquivoJson} -> ${JSON.stringify(resultado)}`);
