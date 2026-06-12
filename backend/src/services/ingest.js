import { supabase } from '../supabase.js';
import { getParser } from '../parsers/index.js';
import { normalizarDescricao, hashDedup } from '../lib/normalize.js';
import { classificarNatureza, aplicarRegraCategoria } from './natureza.js';
import { sincronizarDerivados } from './derivados.js';
import { aplicarCategorizacaoIA } from './ia.js';

// Pipeline da Fase 1: PARSER -> DEDUP -> NATUREZA -> (regras de categoria).
// Princípio inviolável: nunca trava por arquivo ruim — linha ilegível vira
// pendência e o resto processa normalmente.
export async function ingestExtrato({ userId, conta, textoPdf, nomeArquivo }) {
  const parser = getParser(conta.banco);
  if (!parser) {
    throw new Error(`Sem parser para o banco "${conta.banco}"`);
  }

  // [1] PARSER
  const { lancamentos: brutos, pendencias } = parser(textoPdf);
  return ingestLancamentos({ userId, conta, brutos, pendencias, nomeArquivo });
}

// Etapas [2]+ do pipeline para lançamentos já estruturados
// (usado pelo parser de PDF e por importações via OCR/JSON)
export async function ingestLancamentos({ userId, conta, brutos, pendencias = [], nomeArquivo }) {
  // Regras do usuário, carregadas uma vez
  const { data: regras, error: errRegras } = await supabase
    .from('regras')
    .select('id, padrao_descricao, categoria_id, natureza')
    .eq('user_id', userId);
  if (errRegras) throw errRegras;

  // [2]+[3] DEDUP + NATUREZA
  const rows = brutos.map((l) => {
    const descricao_normalizada = normalizarDescricao(l.descricao);
    const { natureza, status, categoria_id } = classificarNatureza({
      lanc: { ...l, descricao_normalizada },
      conta,
      regras,
    });
    return {
      user_id: userId,
      conta_id: conta.id,
      data: l.data,
      descricao: l.descricao,
      descricao_normalizada,
      valor: l.valor,
      natureza,
      status,
      categoria_id:
        categoria_id ?? aplicarRegraCategoria({ descricaoNormalizada: descricao_normalizada, regras }),
      origem: 'extrato',
      hash_dedup: hashDedup({
        contaId: conta.id,
        data: l.data,
        valor: l.valor,
        descricaoNormalizada: descricao_normalizada,
        idExterno: l.id_externo,
      }),
    };
  });

  // Dedup dentro do próprio arquivo (linhas idênticas repetidas no PDF
  // são raras mas possíveis; o banco rejeitaria o batch inteiro)
  const vistos = new Set();
  const unicos = rows.filter((r) => {
    if (vistos.has(r.hash_dedup)) return false;
    vistos.add(r.hash_dedup);
    return true;
  });

  // Upsert ignorando duplicatas já existentes no banco
  let inseridos = [];
  if (unicos.length > 0) {
    const { data, error } = await supabase
      .from('lancamentos')
      .upsert(unicos, { onConflict: 'user_id,hash_dedup', ignoreDuplicates: true })
      .select('id, natureza, valor, data, descricao, categoria_id');
    if (error) throw error;
    inseridos = data || [];
  }

  // Split Yulae / Quasar-reembolso para os recém-inseridos que precisam
  for (const row of inseridos) {
    if (
      row.natureza === 'compartilhada' ||
      (row.natureza === 'quasar' && conta.natureza_default === 'pessoal')
    ) {
      await sincronizarDerivados({ userId, lanc: row, contaNaturezaDefault: conta.natureza_default });
    }
  }

  // Fila de pendências (linhas ilegíveis)
  if (pendencias.length > 0) {
    const { error } = await supabase.from('pendencias').insert(
      pendencias.map((p) => ({
        user_id: userId,
        conta_id: conta.id,
        arquivo: nomeArquivo,
        linha_raw: p.linha_raw,
        motivo: p.motivo,
      }))
    );
    if (error) throw error;
  }

  // [5] CATEGORIZAÇÃO camada 2 (IA): gastos pessoais/compartilhados que as
  // regras (camada 1) não categorizaram. Falha de IA não trava o upload.
  const semCategoria = inseridos.filter(
    (r) =>
      !r.categoria_id &&
      (r.natureza === 'pessoal' || r.natureza === 'compartilhada')
  );
  const ia = await aplicarCategorizacaoIA({ supabase, userId, lancamentos: semCategoria });

  return {
    linhas_lidas: brutos.length,
    inseridos: inseridos.length,
    duplicados: unicos.length - inseridos.length,
    pendencias: pendencias.length,
    ia_categorizados: ia.categorizados,
    ia_incertos: ia.incertos,
  };
}
