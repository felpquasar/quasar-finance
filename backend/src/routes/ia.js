import { Router } from 'express';
import { supabase } from '../supabase.js';
import { iaDisponivel, aplicarCategorizacaoIA } from '../services/ia.js';

export const iaRouter = Router();

// POST /api/ia/categorizar — categoriza lançamentos sem categoria
// (pessoais e compartilhados). Usado para o legado e para re-rodadas.
iaRouter.post('/categorizar', async (req, res) => {
  if (!iaDisponivel()) {
    return res.status(422).json({ erro: 'ANTHROPIC_API_KEY não configurada no backend' });
  }

  const { data: lancs, error } = await supabase
    .from('lancamentos')
    .select('id, data, descricao, valor')
    .eq('user_id', req.user.id)
    .is('categoria_id', null)
    .in('natureza', ['pessoal', 'compartilhada'])
    .limit(150);
  if (error) return res.status(500).json({ erro: error.message });

  if (lancs.length === 0) {
    return res.json({ categorizados: 0, incertos: 0, mensagem: 'Nada sem categoria.' });
  }

  const resultado = await aplicarCategorizacaoIA({
    supabase,
    userId: req.user.id,
    lancamentos: lancs,
  });
  if (resultado.erro) return res.status(502).json({ erro: resultado.erro });
  res.json(resultado);
});
