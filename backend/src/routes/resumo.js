import { Router } from 'express';
import { supabase } from '../supabase.js';

export const resumoRouter = Router();

// GET /api/resumo?mes=2026-06
// Visão do mês: entradas, gasto pessoal, por categoria, pendências abertas.
// A régua dos R$ 417/mês entra aqui (motor de metas completo é Fase 3).
resumoRouter.get('/', async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  const inicio = `${mes}-01`;
  const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)
    .toISOString()
    .slice(0, 10);

  const [{ data: lancs, error: e1 }, { data: pend, error: e2 }] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('valor, natureza, status, categoria_id, categorias(nome)')
      .eq('user_id', req.user.id)
      .gte('data', inicio)
      .lt('data', fim),
    supabase
      .from('pendencias')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('status', 'aberta'),
  ]);
  if (e1 || e2) return res.status(500).json({ erro: (e1 || e2).message });

  const pessoais = lancs.filter((l) => l.natureza === 'pessoal');
  const entradas = pessoais.filter((l) => l.valor > 0).reduce((s, l) => s + Number(l.valor), 0);
  const gastos = pessoais.filter((l) => l.valor < 0).reduce((s, l) => s + Number(l.valor), 0);

  const porCategoria = {};
  for (const l of pessoais) {
    if (l.valor >= 0) continue;
    const nome = l.categorias?.nome || 'Sem categoria';
    porCategoria[nome] = (porCategoria[nome] || 0) + Math.abs(Number(l.valor));
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
    pendencias_abertas: pend?.count ?? 0,
  });
});
