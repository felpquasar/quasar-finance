import { Router } from 'express';
import { supabase } from '../supabase.js';

export const recorrentesRouter = Router();

recorrentesRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('recorrentes')
    .select('*')
    .eq('user_id', req.user.id)
    .order('dia_vencimento');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

recorrentesRouter.post('/', async (req, res) => {
  const { nome, dia_vencimento, valor_estimado } = req.body;
  if (!nome?.trim() || !dia_vencimento) {
    return res.status(400).json({ erro: 'nome e dia_vencimento obrigatórios' });
  }
  const { data, error } = await supabase
    .from('recorrentes')
    .insert({
      user_id: req.user.id,
      nome: nome.trim(),
      dia_vencimento: Number(dia_vencimento),
      valor_estimado: valor_estimado ? Number(valor_estimado) : null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

recorrentesRouter.patch('/:id', async (req, res) => {
  const patch = {};
  for (const campo of ['nome', 'dia_vencimento', 'valor_estimado', 'ativo']) {
    if (req.body[campo] !== undefined) patch[campo] = req.body[campo];
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ erro: 'Nada para atualizar' });
  const { data, error } = await supabase
    .from('recorrentes')
    .update(patch)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

recorrentesRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('recorrentes')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.status(204).end();
});
