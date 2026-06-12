import { Router } from 'express';
import { supabase } from '../supabase.js';

export const pendenciasRouter = Router();

pendenciasRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('pendencias')
    .select('*, contas(nome, banco)')
    .eq('user_id', req.user.id)
    .eq('status', 'aberta')
    .order('criado_em', { ascending: false });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

// PATCH /api/pendencias/:id  body: { status: 'resolvida' | 'descartada' }
// Resolver = Felipe criou o lançamento manual correspondente na tela.
pendenciasRouter.patch('/:id', async (req, res) => {
  const { status } = req.body;
  if (!['resolvida', 'descartada'].includes(status)) {
    return res.status(400).json({ erro: 'Status deve ser resolvida ou descartada' });
  }
  const { data, error } = await supabase
    .from('pendencias')
    .update({ status })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});
