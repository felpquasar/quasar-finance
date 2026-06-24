import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resumoSemanal, alertasVencimento } from '../src/services/mensagens.js';

// Imprime as mensagens proativas (resumo de domingo + alertas) sem enviar.
// Uso: node scripts/testar-mensagens.js
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await supabase.auth.signInWithPassword({
  email: process.env.SEED_EMAIL,
  password: process.env.SEED_PASSWORD,
});
if (error) throw error;
const userId = auth.user.id;

console.log('\n──────── RESUMO DE DOMINGO ────────\n');
console.log(await resumoSemanal(userId));
console.log('\n──────── ALERTAS DE VENCIMENTO ────────\n');
const a = await alertasVencimento(userId);
console.log(a ?? '(nenhum vencimento na janela — não enviaria mensagem)');
console.log('');
