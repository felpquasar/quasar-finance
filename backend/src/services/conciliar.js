import { supabase } from '../supabase.js';
import { normalizarDescricao } from '../lib/normalize.js';

// Conciliação automática no ingest (§ passo [6] da arquitetura):
// "A receber" (Yulae / Quasar) × pix recebido → baixa automática.
//
// Quando entra um pix (lançamento de entrada), tenta casá-lo com uma cobrança
// aberta. Conservador para não baixar cobrança por engano:
//  - devedor 'yulae': a descrição do pix precisa conter o nome (yulae) E o
//    valor casar o da cobrança dentro de tolerância;
//  - devedor 'quasar': sem nome confiável no extrato → exige valor casado.
// Cada pix baixa no máximo uma cobrança; cada cobrança é baixada uma vez.
//
// Retorna { baixados: n }.

const arred = (v) => Math.round(v * 100) / 100;
const NOME_DEVEDOR = { yulae: 'yulae', quasar: null };

export async function conciliarAReceber({ userId, lancamentos }) {
  const entradas = (lancamentos || []).filter((l) => Number(l.valor) > 0);
  if (entradas.length === 0) return { baixados: 0 };

  const { data: abertos, error } = await supabase
    .from('a_receber')
    .select('id, devedor, valor')
    .eq('user_id', userId)
    .eq('status', 'aberto');
  if (error) throw error;
  if (!abertos || abertos.length === 0) return { baixados: 0 };

  const usados = new Set();
  let baixados = 0;

  for (const lanc of entradas) {
    const valor = arred(Math.abs(Number(lanc.valor)));
    const descNorm = normalizarDescricao(lanc.descricao || '');

    const alvo = abertos.find((ar) => {
      if (usados.has(ar.id)) return false;
      const tol = Math.max(Number(ar.valor) * 0.02, 1); // ±2% ou ±R$1
      if (Math.abs(valor - Number(ar.valor)) > tol) return false;
      const nome = NOME_DEVEDOR[ar.devedor];
      if (nome && !descNorm.includes(nome)) return false; // exige nome quando há
      return true;
    });
    if (!alvo) continue;

    const { error: errUpd } = await supabase
      .from('a_receber')
      .update({ status: 'recebido' })
      .eq('id', alvo.id)
      .eq('user_id', userId);
    if (errUpd) throw errUpd;
    usados.add(alvo.id);
    baixados += 1;
  }

  return { baixados };
}
