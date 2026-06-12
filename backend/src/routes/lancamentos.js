import { Router } from 'express';
import { supabase } from '../supabase.js';
import { normalizarDescricao, hashDedup } from '../lib/normalize.js';
import { sincronizarDerivados } from '../services/derivados.js';

export const lancamentosRouter = Router();

// GET /api/lancamentos?mes=2026-06&natureza=pessoal&categoria_id=&conta_id=
lancamentosRouter.get('/', async (req, res) => {
  const { mes, natureza, categoria_id, conta_id, status } = req.query;
  let q = supabase
    .from('lancamentos')
    .select('*, categorias(nome), contas(nome, banco)')
    .eq('user_id', req.user.id)
    .order('data', { ascending: false })
    .limit(500);

  if (mes) {
    const inicio = `${mes}-01`;
    const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)
      .toISOString()
      .slice(0, 10);
    q = q.gte('data', inicio).lt('data', fim);
  }
  if (natureza) q = q.eq('natureza', natureza);
  if (categoria_id) q = q.eq('categoria_id', categoria_id);
  if (conta_id) q = q.eq('conta_id', conta_id);
  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// POST /api/lancamentos — lançamento manual (dinheiro vivo, pix avulso)
lancamentosRouter.post('/', async (req, res) => {
  const { conta_id, data, descricao, valor, natureza, categoria_id } = req.body;
  if (!conta_id || !data || !descricao || valor === undefined) {
    return res.status(400).json({ erro: 'Campos obrigatórios: conta_id, data, descricao, valor' });
  }

  const descricao_normalizada = normalizarDescricao(descricao);
  const row = {
    user_id: req.user.id,
    conta_id,
    data,
    descricao,
    descricao_normalizada,
    valor: Number(valor),
    natureza: natureza || 'pessoal',
    categoria_id: categoria_id || null,
    origem: 'manual',
    status: 'ok',
    hash_dedup: hashDedup({
      contaId: conta_id,
      data,
      valor: Number(valor),
      descricaoNormalizada: descricao_normalizada,
    }),
  };

  const { data: inserido, error } = await supabase
    .from('lancamentos')
    .upsert(row, { onConflict: 'user_id,hash_dedup', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ erro: error.message });
  if (!inserido) return res.status(409).json({ erro: 'Lançamento duplicado' });
  res.status(201).json(inserido);
});

// PATCH /api/lancamentos/:id — edição (categoria, natureza, status)
// body opcional: aprender_regra=true -> correção vira regra permanente
lancamentosRouter.patch('/:id', async (req, res) => {
  const { categoria_id, natureza, status, aprender_regra } = req.body;

  const patch = {};
  if (categoria_id !== undefined) patch.categoria_id = categoria_id;
  if (natureza !== undefined) patch.natureza = natureza;
  if (status !== undefined) patch.status = status;
  if (Object.keys(patch).length === 0) return res.status(400).json({ erro: 'Nada para atualizar' });

  const { data: lanc, error } = await supabase
    .from('lancamentos')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('*, contas(natureza_default)')
    .single();
  if (error) return res.status(500).json({ erro: error.message });

  // Natureza mudou -> recalcula split/a_receber derivados
  if (natureza !== undefined) {
    await sincronizarDerivados({
      userId: req.user.id,
      lanc,
      contaNaturezaDefault: lanc.contas?.natureza_default,
    });
  }

  // Correção do Felipe vira regra aprendida (ex: "mercado sao luis = Mercado, sempre").
  // Padrão já conhecido é atualizado em vez de duplicado.
  if (aprender_regra && lanc) {
    const { data: existente } = await supabase
      .from('regras')
      .select('id, categoria_id, natureza')
      .eq('user_id', req.user.id)
      .eq('padrao_descricao', lanc.descricao_normalizada)
      .limit(1)
      .maybeSingle();

    const regra = {
      categoria_id: lanc.categoria_id ?? existente?.categoria_id ?? null,
      natureza: natureza !== undefined ? lanc.natureza : existente?.natureza ?? null,
    };

    const { error: errRegra } = existente
      ? await supabase.from('regras').update(regra).eq('id', existente.id)
      : await supabase.from('regras').insert({
          ...regra,
          user_id: req.user.id,
          padrao_descricao: lanc.descricao_normalizada,
          origem: 'aprendida',
        });
    if (errRegra) console.error('Falha ao salvar regra aprendida:', errRegra.message);
  }

  res.json(lanc);
});

// DELETE /api/lancamentos/:id
lancamentosRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('lancamentos')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.status(204).end();
});
