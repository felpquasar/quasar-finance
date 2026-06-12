import { supabase } from '../supabase.js';

// Deriva obrigações de um lançamento conforme a natureza (§2 da arquitetura):
//
// - compartilhada (Yulae): split (default 50% Felipe, ajustável) e a parte
//   dela vira "a receber" até o pix cair. Só a parte do Felipe é gasto.
// - quasar em conta PESSOAL (MP/Nubank/cartões): Quasar-reembolso — despesa
//   da Quasar paga com dinheiro pessoal, 100% a receber.
//   Na conta mista (BB), quasar é dinheiro da própria Quasar: nada a receber.
//
// Mudança de natureza remove derivados ainda em aberto (recebidos ficam).

export async function sincronizarDerivados({ userId, lanc, contaNaturezaDefault }) {
  const ehGasto = Number(lanc.valor) < 0;
  const querSplit = lanc.natureza === 'compartilhada' && ehGasto;
  const querReembolso =
    lanc.natureza === 'quasar' && contaNaturezaDefault === 'pessoal' && ehGasto;

  // Remove derivados abertos que não se aplicam mais
  const manter = [];
  if (querSplit) manter.push('yulae');
  if (querReembolso) manter.push('quasar');
  let limpeza = supabase
    .from('a_receber')
    .delete()
    .eq('lancamento_id', lanc.id)
    .eq('status', 'aberto');
  if (manter.length > 0) limpeza = limpeza.not('devedor', 'in', `(${manter.join(',')})`);
  await limpeza;

  const { data: split } = await supabase
    .from('splits')
    .select('*')
    .eq('lancamento_id', lanc.id)
    .maybeSingle();

  if (querSplit) {
    const pct = split?.percentual_felipe ?? 50;
    if (!split) {
      await supabase
        .from('splits')
        .insert({ user_id: userId, lancamento_id: lanc.id, percentual_felipe: pct });
    }
    await upsertAReceber({
      userId,
      lancamentoId: lanc.id,
      devedor: 'yulae',
      valor: arred(Math.abs(lanc.valor) * (100 - pct) / 100),
    });
  } else if (split) {
    await supabase.from('splits').delete().eq('id', split.id);
  }

  if (querReembolso) {
    await upsertAReceber({
      userId,
      lancamentoId: lanc.id,
      devedor: 'quasar',
      valor: Math.abs(lanc.valor),
    });
  }
}

async function upsertAReceber({ userId, lancamentoId, devedor, valor }) {
  const { data: existente } = await supabase
    .from('a_receber')
    .select('id, status')
    .eq('lancamento_id', lancamentoId)
    .eq('devedor', devedor)
    .maybeSingle();

  if (existente) {
    // Já recebido não se mexe; aberto acompanha o valor recalculado
    if (existente.status === 'aberto') {
      await supabase.from('a_receber').update({ valor }).eq('id', existente.id);
    }
    return;
  }
  await supabase.from('a_receber').insert({
    user_id: userId,
    lancamento_id: lancamentoId,
    devedor,
    valor,
    status: 'aberto',
  });
}

const arred = (v) => Math.round(v * 100) / 100;
