import { Router } from 'express';
import { supabase } from '../supabase.js';

export const areceberRouter = Router();

// GET /api/areceber?status=aberto|recebido (default: aberto)
areceberRouter.get('/', async (req, res) => {
  const status = req.query.status || 'aberto';
  const { data, error } = await supabase
    .from('a_receber')
    .select('*, lancamentos(descricao, data, valor)')
    .eq('user_id', req.user.id)
    .eq('status', status)
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });

  // anexa o percentual do split (para os de devedor yulae)
  const ids = data.map((r) => r.lancamento_id).filter(Boolean);
  let splits = [];
  if (ids.length > 0) {
    const r = await supabase
      .from('splits')
      .select('lancamento_id, percentual_felipe')
      .in('lancamento_id', ids);
    splits = r.data || [];
  }
  const pctPor = Object.fromEntries(splits.map((s) => [s.lancamento_id, s.percentual_felipe]));
  res.json(data.map((r) => ({ ...r, percentual_felipe: pctPor[r.lancamento_id] ?? null })));
});

// PATCH /api/areceber/:id
// body: { status: 'recebido' | 'aberto' }  -> baixa manual / reabre
// body: { percentual_felipe: 0-100 }       -> ajusta split e recalcula valor
areceberRouter.patch('/:id', async (req, res) => {
  const { status, percentual_felipe } = req.body;

  const { data: item, error: errItem } = await supabase
    .from('a_receber')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (errItem || !item) return res.status(404).json({ erro: 'Item não encontrado' });

  if (percentual_felipe !== undefined) {
    const pct = Number(percentual_felipe);
    if (!(pct >= 0 && pct <= 100)) return res.status(400).json({ erro: 'Percentual inválido' });
    if (item.devedor !== 'yulae' || item.status !== 'aberto') {
      return res.status(400).json({ erro: 'Split só ajusta cobrança aberta da Yulae' });
    }
    const { error: e1 } = await supabase
      .from('splits')
      .update({ percentual_felipe: pct })
      .eq('lancamento_id', item.lancamento_id)
      .eq('user_id', req.user.id);
    if (e1) return res.status(500).json({ erro: e1.message });

    const { data: lanc } = await supabase
      .from('lancamentos')
      .select('valor')
      .eq('id', item.lancamento_id)
      .single();
    const novoValor = Math.round(Math.abs(lanc.valor) * (100 - pct)) / 100;
    const { data, error } = await supabase
      .from('a_receber')
      .update({ valor: novoValor })
      .eq('id', item.id)
      .select()
      .single();
    if (error) return res.status(500).json({ erro: error.message });
    return res.json({ ...data, percentual_felipe: pct });
  }

  if (!['recebido', 'aberto'].includes(status)) {
    return res.status(400).json({ erro: 'Status deve ser recebido ou aberto' });
  }
  const { data, error } = await supabase
    .from('a_receber')
    .update({ status })
    .eq('id', item.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});
