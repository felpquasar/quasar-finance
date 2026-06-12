import { Router } from 'express';
import { supabase } from '../supabase.js';

export const contasRouter = Router();

contasRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('contas')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('ativo', true)
    .order('nome');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});
