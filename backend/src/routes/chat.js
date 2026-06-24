import { Router } from 'express';
import { supabase } from '../supabase.js';
import { responderPergunta, agenteDisponivel } from '../services/agente.js';

export const chatRouter = Router();

// GET /api/chat — histórico da conversa (ordem cronológica)
chatRouter.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('conversas_agente')
    .select('id, role, conteudo, criado_em')
    .eq('user_id', req.user.id)
    .order('criado_em', { ascending: true })
    .limit(200);
  if (error) return res.status(500).json({ erro: error.message });
  res.json({ disponivel: agenteDisponivel(), mensagens: data });
});

// POST /api/chat  body: { pergunta }
chatRouter.post('/', async (req, res) => {
  const { pergunta } = req.body;
  if (!pergunta?.trim()) return res.status(400).json({ erro: 'pergunta obrigatória' });
  try {
    const { resposta } = await responderPergunta({ userId: req.user.id, pergunta });
    res.json({ resposta });
  } catch (e) {
    console.error('Erro no chat:', e);
    res.status(500).json({ erro: e.message || 'Falha ao responder' });
  }
});

// DELETE /api/chat — limpa o histórico
chatRouter.delete('/', async (req, res) => {
  const { error } = await supabase.from('conversas_agente').delete().eq('user_id', req.user.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.status(204).end();
});
