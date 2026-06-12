import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Seed inicial: cria o usuário do Felipe, contas, categorias e metas.
// Idempotente — rodar 2x não duplica nada.
// Uso: npm run seed  (exige SEED_EMAIL e SEED_PASSWORD no .env)

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EMAIL = process.env.SEED_EMAIL;
const SENHA = process.env.SEED_PASSWORD;
if (!EMAIL || !SENHA) {
  console.error('Defina SEED_EMAIL e SEED_PASSWORD no .env');
  process.exit(1);
}

async function obterOuCriarUsuario() {
  const { data: lista } = await supabase.auth.admin.listUsers();
  const existente = lista?.users?.find((u) => u.email === EMAIL);
  if (existente) {
    console.log(`Usuário já existe: ${EMAIL}`);
    return existente;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: SENHA,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Usuário criado: ${EMAIL}`);
  return data.user;
}

async function seed() {
  const user = await obterOuCriarUsuario();
  const uid = user.id;

  // Contas (cartões de repasse Caixa/Neon ficam FORA — vivem em repasses_familia)
  const contas = [
    { nome: 'Banco do Brasil — Conta Corrente', tipo: 'corrente', banco: 'bb', natureza_default: 'mista' },
    { nome: 'Mercado Pago — Conta', tipo: 'corrente', banco: 'mercadopago', natureza_default: 'pessoal' },
    { nome: 'Cartão Nubank', tipo: 'cartao', banco: 'nubank', natureza_default: 'pessoal' },
    { nome: 'Cartão BB', tipo: 'cartao', banco: 'bb', natureza_default: 'pessoal' },
    { nome: 'Cartão Mercado Pago', tipo: 'cartao', banco: 'mercadopago', natureza_default: 'pessoal' },
  ];
  for (const c of contas) {
    const { data: existe } = await supabase
      .from('contas')
      .select('id')
      .eq('user_id', uid)
      .eq('nome', c.nome)
      .maybeSingle();
    if (!existe) {
      const { error } = await supabase.from('contas').insert({ ...c, user_id: uid });
      if (error) throw error;
      console.log(`Conta criada: ${c.nome}`);
    }
  }

  // Categorias iniciais (§5 da arquitetura)
  const categorias = [
    'Moradia', 'Mercado', 'Alimentação fora/Delivery', 'Transporte', 'Saúde',
    'Lazer', 'Assinaturas', 'Vestuário', 'Educação', 'Casa (compartilhada)',
    'Quasar-reembolso', 'Outros',
  ];
  for (const nome of categorias) {
    const { error } = await supabase
      .from('categorias')
      .upsert(
        { user_id: uid, nome, criada_por: 'sistema' },
        { onConflict: 'user_id,nome', ignoreDuplicates: true }
      );
    if (error) throw error;
  }
  console.log(`${categorias.length} categorias garantidas.`);

  // Metas iniciais (§7)
  const metas = [
    { nome: 'Reserva de emergência', valor_alvo: 5000, prazo: '2027-06-30', prioridade: 1 },
    { nome: 'Zerar fatura Nubank', valor_alvo: 0, prazo: '2026-12-31', prioridade: 2 },
  ];
  for (const m of metas) {
    const { data: existe } = await supabase
      .from('metas')
      .select('id')
      .eq('user_id', uid)
      .eq('nome', m.nome)
      .maybeSingle();
    if (!existe) {
      const { error } = await supabase.from('metas').insert({ ...m, user_id: uid });
      if (error) throw error;
      console.log(`Meta criada: ${m.nome}`);
    }
  }

  console.log('\nSeed concluído ✓');
}

seed().catch((e) => {
  console.error('Falha no seed:', e.message || e);
  process.exit(1);
});
