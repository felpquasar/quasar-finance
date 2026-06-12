import { Router } from 'express';
import { supabase } from '../supabase.js';

export const metasRouter = Router();

// Sobra "do Felipe" por mês: pessoal integral + compartilhada na fração do split
function calcularSobrasMensais(lancs, pctPor) {
  const porMes = {};
  for (const l of lancs) {
    if (l.natureza !== 'pessoal' && l.natureza !== 'compartilhada') continue;
    const pct = l.natureza === 'compartilhada' ? (pctPor[l.id] ?? 50) / 100 : 1;
    const mes = l.data.slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + Number(l.valor) * pct;
  }
  return porMes;
}

// GET /api/metas — metas com progresso, ritmo e ajuste (§7 da arquitetura)
metasRouter.get('/', async (req, res) => {
  const [metasR, aportesR, lancsR, splitsR] = await Promise.all([
    supabase.from('metas').select('*').eq('user_id', req.user.id).order('prioridade'),
    supabase.from('aportes').select('*').eq('user_id', req.user.id),
    supabase.from('lancamentos').select('id, data, valor, natureza').eq('user_id', req.user.id),
    supabase.from('splits').select('lancamento_id, percentual_felipe').eq('user_id', req.user.id),
  ]);
  const erro = metasR.error || aportesR.error || lancsR.error || splitsR.error;
  if (erro) return res.status(500).json({ erro: erro.message });

  const pctPor = Object.fromEntries(
    (splitsR.data || []).map((s) => [s.lancamento_id, s.percentual_felipe])
  );
  const sobras = calcularSobrasMensais(lancsR.data, pctPor);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const mesesFechados = Object.entries(sobras).filter(([m]) => m < mesAtual);
  const sobraMedia =
    mesesFechados.length > 0
      ? mesesFechados.reduce((s, [, v]) => s + v, 0) / mesesFechados.length
      : null;

  const hoje = new Date();
  const resultado = metasR.data.map((m) => {
    const aportesMeta = (aportesR.data || []).filter((a) => a.meta_id === m.id);
    const acumulado = aportesMeta.reduce((s, a) => s + Number(a.valor), 0);
    const falta = Math.max(0, Number(m.valor_alvo) - acumulado);

    let mesesRestantes = null;
    if (m.prazo) {
      const prazo = new Date(m.prazo);
      mesesRestantes = Math.max(
        0,
        (prazo.getFullYear() - hoje.getFullYear()) * 12 + (prazo.getMonth() - hoje.getMonth())
      );
    }

    const aporteNecessario =
      mesesRestantes && mesesRestantes > 0 ? falta / mesesRestantes : falta;
    const ritmoChega =
      sobraMedia !== null && mesesRestantes !== null
        ? sobraMedia * mesesRestantes >= falta
        : null;

    return {
      ...m,
      acumulado,
      falta,
      meses_restantes: mesesRestantes,
      aporte_necessario: Math.round(aporteNecessario * 100) / 100,
      sobra_media_mensal: sobraMedia !== null ? Math.round(sobraMedia * 100) / 100 : null,
      ritmo_chega: ritmoChega,
      aportes: aportesMeta.sort((a, b) => b.mes_ref.localeCompare(a.mes_ref)),
    };
  });

  res.json(resultado);
});

// POST /api/metas/:id/aportes  body: { mes_ref: 'YYYY-MM', valor }
metasRouter.post('/:id/aportes', async (req, res) => {
  const { mes_ref, valor } = req.body;
  if (!mes_ref || !valor || Number(valor) <= 0) {
    return res.status(400).json({ erro: 'mes_ref e valor (> 0) obrigatórios' });
  }
  const { data: meta } = await supabase
    .from('metas')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .single();
  if (!meta) return res.status(404).json({ erro: 'Meta não encontrada' });

  const { data, error } = await supabase
    .from('aportes')
    .insert({
      user_id: req.user.id,
      meta_id: req.params.id,
      mes_ref: `${mes_ref}-01`,
      valor: Number(valor),
    })
    .select()
    .single();
  if (error) return res.status(500).json({ erro: error.message });
  res.status(201).json(data);
});

// DELETE /api/metas/aportes/:aporteId — desfaz aporte registrado errado
metasRouter.delete('/aportes/:aporteId', async (req, res) => {
  const { error } = await supabase
    .from('aportes')
    .delete()
    .eq('id', req.params.aporteId)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ erro: error.message });
  res.status(204).end();
});
