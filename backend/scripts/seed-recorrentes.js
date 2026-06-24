import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Cadastra/atualiza as contas recorrentes reais do Felipe. Idempotente:
// casa por nome (não duplica em rerun). Alimenta o alerta diário do WhatsApp
// e a projeção de fechamento do mês.
// Uso: node scripts/seed-recorrentes.js
const RECORRENTES = [
  { nome: 'TIM', dia_vencimento: 10, valor_estimado: 89.99 },
  { nome: 'Consórcio Honda', dia_vencimento: 15, valor_estimado: 811.13 },
  { nome: 'Suhai (seguro moto)', dia_vencimento: 12, valor_estimado: 57.64 },
  { nome: 'Casa', dia_vencimento: 10, valor_estimado: 366.45 },
  { nome: 'Celular', dia_vencimento: 10, valor_estimado: 268 },
  { nome: 'Vivo', dia_vencimento: 18, valor_estimado: 35 },
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error: errAuth } = await supabase.auth.signInWithPassword({
  email: process.env.SEED_EMAIL,
  password: process.env.SEED_PASSWORD,
});
if (errAuth) throw errAuth;
const userId = auth.user.id;

const { data: existentes, error: errSel } = await supabase
  .from('recorrentes')
  .select('id, nome')
  .eq('user_id', userId);
if (errSel) throw errSel;
const idPorNome = Object.fromEntries((existentes || []).map((r) => [r.nome, r.id]));

for (const r of RECORRENTES) {
  const base = { ...r, ativo: true };
  if (idPorNome[r.nome]) {
    const { error } = await supabase.from('recorrentes').update(base).eq('id', idPorNome[r.nome]);
    if (error) throw error;
    console.log(`~ atualizado: ${r.nome}`);
  } else {
    const { error } = await supabase.from('recorrentes').insert({ user_id: userId, ...base });
    if (error) throw error;
    console.log(`+ criado: ${r.nome}`);
  }
}

const total = RECORRENTES.reduce((s, r) => s + r.valor_estimado, 0);
console.log(`\n${RECORRENTES.length} recorrentes · total mensal estimado R$ ${total.toFixed(2).replace('.', ',')}`);
process.exit(0);
