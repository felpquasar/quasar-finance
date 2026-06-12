import { Router } from 'express';
import { supabase } from '../supabase.js';

export const categoriasRouter = Router();

categoriasRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('categorias')
    .select('*')
    .eq('user_id', req.user.id)
    .order('nome');
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

categoriasRouter.post('/', async (req, res) => {
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome obrigatório' });
  const { data, error } = await supabase
    .from('categorias')
    .insert({ user_id: req.user.id, nome: nome.trim(), criada_por: 'felipe' })
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

categoriasRouter.patch('/:id', async (req, res) => {
  const { nome } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome obrigatório' });
  const { data, error } = await supabase
    .from('categorias')
    .update({ nome: nome.trim() })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

categoriasRouter.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('categorias')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) {
    // FK em uso (lançamentos apontando pra ela)
    return res.status(409).json({ erro: 'Categoria em uso por lançamentos' });
  }
  res.status(204).end();
});
