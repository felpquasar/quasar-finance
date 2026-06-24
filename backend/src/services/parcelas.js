import { supabase } from '../supabase.js';
import { normalizarDescricao } from '../lib/normalize.js';

// Motor de parcelas (Fase 2 — faturas de cartão).
//
// Uma fatura mostra, para cada compra parcelada, APENAS a parcela do mês
// (ex: "NETFLIX 03/12"). A partir dela o motor:
//   [1] agrupa a compra em compras_parceladas (idempotente por compra),
//   [2] vincula o lançamento à compra (compra_id),
//   [3] projeta as parcelas vincendas em compromissos (alimenta a projeção).
//
// Idempotência: reenviar a mesma fatura, ou subir a fatura do mês seguinte,
// reconverge a mesma compra (chave estável: descrição base + total +
// data_compra recuada) e reescreve os compromissos futuros sem duplicar.

const arred = (v) => Math.round(v * 100) / 100;

// "yyyy-mm-01" + n meses -> "yyyy-mm-01" (n pode ser negativo)
function addMeses(mesIso, n) {
  const [a, m] = mesIso.split('-').map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Remove o marcador de parcela ("03/12", "03 de 12", "parc 3/12") da
// descrição para obter a chave estável da compra — a mesma compra aparece
// com descrição idêntica em faturas de meses diferentes.
function descricaoBase(descricao) {
  return normalizarDescricao(
    String(descricao)
      .replace(/\bparc(ela)?\b/gi, ' ')
      .replace(/\b\d{1,2}\s*(\/|de)\s*\d{1,2}\b/gi, ' ')
  );
}

// lancamentos: linhas recém-inseridas da fatura (id, descricao, valor,
//   parcela_num, parcela_total).
// mesRefFatura: "yyyy-mm-01" — mês de competência da fatura (mês em que cai
//   a parcela exibida). Definido pela rota de upload a partir do vencimento.
export async function sincronizarParcelas({ userId, lancamentos, mesRefFatura }) {
  const parcelados = (lancamentos || []).filter(
    (l) => Number(l.parcela_total) > 1 && Number(l.parcela_num) >= 1 && Number(l.valor) < 0
  );
  let comprasCriadas = 0;
  let compromissosGerados = 0;

  for (const lanc of parcelados) {
    const total = Number(lanc.parcela_total);
    const num = Number(lanc.parcela_num);
    const valorParcela = arred(Math.abs(Number(lanc.valor)));
    const base = descricaoBase(lanc.descricao);
    // data_compra estável = mês da parcela atual recuado (num-1) meses
    const dataCompra = addMeses(mesRefFatura, -(num - 1));

    // [1] compra (idempotente por descrição base + total + data_compra)
    let { data: compra } = await supabase
      .from('compras_parceladas')
      .select('id')
      .eq('user_id', userId)
      .eq('descricao', base)
      .eq('parcelas_total', total)
      .eq('data_compra', dataCompra)
      .maybeSingle();

    if (!compra) {
      const ins = await supabase
        .from('compras_parceladas')
        .insert({
          user_id: userId,
          descricao: base,
          valor_total: arred(valorParcela * total),
          parcelas_total: total,
          data_compra: dataCompra,
        })
        .select('id')
        .single();
      if (ins.error) throw ins.error;
      compra = ins.data;
      comprasCriadas += 1;
    }

    // [2] vincula o lançamento à compra
    await supabase
      .from('lancamentos')
      .update({ compra_id: compra.id, parcela_num: num, parcela_total: total })
      .eq('id', lanc.id);

    // [3] compromissos vincendos: parcelas num+1..total, uma por mês.
    // Reescreve tudo a partir deste mês (a parcela atual já é lançamento real,
    // não compromisso) para reconvergir em reenvio / fatura do mês seguinte.
    await supabase
      .from('compromissos')
      .delete()
      .eq('user_id', userId)
      .eq('compra_id', compra.id)
      .gte('mes_ref', mesRefFatura);

    const futuros = [];
    for (let k = num + 1; k <= total; k++) {
      futuros.push({
        user_id: userId,
        compra_id: compra.id,
        mes_ref: addMeses(mesRefFatura, k - num),
        valor: valorParcela,
      });
    }
    if (futuros.length) {
      const { error } = await supabase.from('compromissos').insert(futuros);
      if (error) throw error;
      compromissosGerados += futuros.length;
    }
  }

  return {
    parcelados: parcelados.length,
    compras: comprasCriadas,
    compromissos: compromissosGerados,
  };
}
