import { Router } from 'express';
import { supabase } from '../supabase.js';

export const resumoRouter = Router();

// GET /api/resumo?mes=2026-06
// Visão do mês: entradas, gasto pessoal (compartilhadas entram só com a parte
// do Felipe, conforme split), por categoria, fila de revisão e a receber.
// A régua dos R$ 417/mês entra aqui (motor de metas completo é Fase 3).
resumoRouter.get('/', async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  const inicio = `${mes}-01`;
  const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)
    .toISOString()
    .slice(0, 10);

  const [lancsR, pendR, splitsR, receberR] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, valor, natureza, status, categoria_id, categorias(nome)')
      .eq('user_id', req.user.id)
      .gte('data', inicio)
      .lt('data', fim),
    supabase
      .from('pendencias')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('status', 'aberta'),
    supabase.from('splits').select('lancamento_id, percentual_felipe').eq('user_id', req.user.id),
    supabase.from('a_receber').select('valor').eq('user_id', req.user.id).eq('status', 'aberto'),
  ]);
  const erro = lancsR.error || pendR.error || splitsR.error || receberR.error;
  if (erro) return res.status(500).json({ erro: erro.message });

  const lancs = lancsR.data;
  const pctPor = Object.fromEntries(
    (splitsR.data || []).map((s) => [s.lancamento_id, s.percentual_felipe])
  );

  // valor que conta como SEU: pessoal integral; compartilhada só sua parte
  const valorFelipe = (l) => {
    if (l.natureza === 'pessoal') return Number(l.valor);
    if (l.natureza === 'compartilhada') {
      const pct = pctPor[l.id] ?? 50;
      return Number(l.valor) * (pct / 100);
    }
    return 0;
  };

  const contam = lancs.filter((l) => l.natureza === 'pessoal' || l.natureza === 'compartilhada');
  const entradas = contam.filter((l) => l.valor > 0).reduce((s, l) => s + valorFelipe(l), 0);
  const gastos = contam.filter((l) => l.valor < 0).reduce((s, l) => s + valorFelipe(l), 0);

  const porCategoria = {};
  for (const l of contam) {
    if (l.valor >= 0) continue;
    const nome = l.categorias?.nome || 'Sem categoria';
    porCategoria[nome] = (porCategoria[nome] || 0) + Math.abs(valorFelipe(l));
  }

  const APORTE_META = 417; // R$ 5.000 em 12 meses — régua do sistema inteiro

  res.json({
    mes,
    entradas,
    gastos: Math.abs(gastos),
    sobra: entradas + gastos,
    aporte_meta: APORTE_META,
    distancia_meta: entradas + gastos - APORTE_META,
    por_categoria: Object.entries(porCategoria)
      .map(([nome, total]) => ({ nome, total }))
      .sort((a, b) => b.total - a.total),
    revisao_pendente: lancs.filter((l) => l.status === 'pendente').length,
    pendencias_abertas: pendR.count ?? 0,
    a_receber_aberto: (receberR.data || []).reduce((s, r) => s + Number(r.valor), 0),
  });
});
