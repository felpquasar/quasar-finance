import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../supabase.js';

// Chat reativo (§6 da arquitetura — modo reativo): perguntas livres
// respondidas com consulta aos dados reais. Estratégia V1: montar um snapshot
// abrangente das finanças (vários meses, metas, a receber, recorrentes) e
// deixar o Claude raciocinar sobre ele. Sem text-to-SQL (segurança) e sem
// tool-use (simplicidade) — o snapshot cobre as perguntas do dia a dia.
//
// Régua do sistema: R$ 417/mês (R$ 5.000 em 12 meses).

const MODEL = process.env.IA_MODEL || 'claude-opus-4-8';
const APORTE_META = 417;
const MESES_SNAPSHOT = 6;
const arred = (v) => Math.round(v * 100) / 100;

let client = null;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

export function agenteDisponivel() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---- snapshot dos dados reais (ótica do Felipe) ----
function primeiroDiaMes(ano, mes) {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

async function montarSnapshot(userId, hoje = new Date()) {
  const inicio = primeiroDiaMes(hoje.getFullYear(), hoje.getMonth() - (MESES_SNAPSHOT - 1));

  const [lancsR, splitsR, metasR, aportesR, receberR, recR] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, data, valor, natureza, status, categorias(nome)')
      .eq('user_id', userId)
      .gte('data', inicio),
    supabase.from('splits').select('lancamento_id, percentual_felipe').eq('user_id', userId),
    supabase.from('metas').select('*').eq('user_id', userId),
    supabase.from('aportes').select('meta_id, valor').eq('user_id', userId),
    supabase.from('a_receber').select('devedor, valor, status').eq('user_id', userId).eq('status', 'aberto'),
    supabase.from('recorrentes').select('nome, dia_vencimento, valor_estimado').eq('user_id', userId).eq('ativo', true),
  ]);
  const erro = lancsR.error || splitsR.error || metasR.error || aportesR.error || receberR.error || recR.error;
  if (erro) throw erro;

  const pctPor = Object.fromEntries((splitsR.data || []).map((s) => [s.lancamento_id, s.percentual_felipe]));
  const valorFelipe = (l) => {
    if (l.natureza === 'pessoal') return Number(l.valor);
    if (l.natureza === 'compartilhada') return Number(l.valor) * ((pctPor[l.id] ?? 50) / 100);
    return 0; // transito/quasar não contam como do Felipe
  };

  // agrega por mês
  const meses = {};
  for (const l of lancsR.data || []) {
    if (l.natureza !== 'pessoal' && l.natureza !== 'compartilhada') continue;
    const mes = l.data.slice(0, 7);
    const m = (meses[mes] ||= { entradas: 0, gastos: 0, por_categoria: {} });
    const v = valorFelipe(l);
    if (v > 0) m.entradas += v;
    else if (v < 0) {
      m.gastos += Math.abs(v);
      const cat = l.categorias?.nome || 'Sem categoria';
      m.por_categoria[cat] = (m.por_categoria[cat] || 0) + Math.abs(v);
    }
  }
  const mesAtual = hoje.toISOString().slice(0, 7);
  const porMes = Object.entries(meses)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, m]) => ({
      mes,
      entradas: arred(m.entradas),
      gastos: arred(m.gastos),
      sobra: arred(m.entradas - m.gastos),
      por_categoria: Object.fromEntries(
        Object.entries(m.por_categoria).map(([k, v]) => [k, arred(v)]).sort((a, b) => b[1] - a[1])
      ),
    }));

  const fechados = porMes.filter((m) => m.mes < mesAtual);
  const sobraMedia = fechados.length ? arred(fechados.reduce((s, m) => s + m.sobra, 0) / fechados.length) : null;

  // metas com progresso e ritmo
  const acumPorMeta = {};
  for (const a of aportesR.data || []) acumPorMeta[a.meta_id] = (acumPorMeta[a.meta_id] || 0) + Number(a.valor);
  const metas = (metasR.data || []).map((meta) => {
    const acum = acumPorMeta[meta.id] || 0;
    const falta = Math.max(0, Number(meta.valor_alvo) - acum);
    let mesesRestantes = null;
    if (meta.prazo) {
      const p = new Date(meta.prazo);
      mesesRestantes = Math.max(0, (p.getFullYear() - hoje.getFullYear()) * 12 + (p.getMonth() - hoje.getMonth()));
    }
    return {
      nome: meta.nome,
      valor_alvo: Number(meta.valor_alvo),
      acumulado: arred(acum),
      falta: arred(falta),
      prazo: meta.prazo,
      meses_restantes: mesesRestantes,
      status: meta.status,
    };
  });

  return {
    hoje: hoje.toISOString().slice(0, 10),
    regua_aporte_mensal: APORTE_META,
    sobra_media_mensal: sobraMedia,
    por_mes: porMes,
    metas,
    a_receber_aberto: (receberR.data || []).reduce((s, r) => s + Number(r.valor), 0),
    a_receber_detalhe: receberR.data || [],
    recorrentes: (recR.data || []).map((r) => ({ nome: r.nome, dia: r.dia_vencimento, valor: r.valor_estimado })),
    recorrentes_total_mensal: arred((recR.data || []).reduce((s, r) => s + (Number(r.valor_estimado) || 0), 0)),
  };
}

const SYSTEM = `Você é o assistente financeiro pessoal do Felipe (dono da barbearia Quasar Barber, mora em Codó-MA).
Responda em português do Brasil, direto e curto, com números em reais (R$ 1.234,56).
Use SOMENTE os dados do snapshot fornecido — não invente valores. Se faltar dado para responder, diga o que falta.
A régua do sistema é o aporte de R$ 417/mês (meta de R$ 5.000 de reserva em 12 meses): sempre que fizer sentido,
relacione a resposta a se isso aproxima ou afasta dessa meta. Para simulações ("se eu cortar X"), calcule com a
sobra média mensal e a falta da meta. Os valores já estão na ótica do Felipe (gastos compartilhados entram só na
fração dele; trânsito e Quasar não contam como gasto/renda pessoal).`;

// Responde uma pergunta consultando os dados e salva a conversa.
// Retorna { resposta }.
export async function responderPergunta({ userId, pergunta }) {
  if (!agenteDisponivel()) throw new Error('Chat requer ANTHROPIC_API_KEY no backend');
  if (!pergunta?.trim()) throw new Error('Pergunta vazia');

  const snapshot = await montarSnapshot(userId);

  // histórico recente para dar continuidade à conversa
  const { data: hist } = await supabase
    .from('conversas_agente')
    .select('role, conteudo')
    .eq('user_id', userId)
    .order('criado_em', { ascending: false })
    .limit(10);
  const historico = (hist || []).reverse().map((m) => ({ role: m.role, content: m.conteudo }));

  const messages = [
    ...historico,
    {
      role: 'user',
      content: `Snapshot das finanças (JSON):\n${JSON.stringify(snapshot)}\n\nPergunta: ${pergunta.trim()}`,
    },
  ];

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    messages,
  });
  if (response.stop_reason === 'refusal') throw new Error('Resposta recusada pela IA');
  const resposta = response.content.find((b) => b.type === 'text')?.text?.trim() || '(sem resposta)';

  // persiste a troca (pergunta do usuário + resposta)
  await supabase.from('conversas_agente').insert([
    { user_id: userId, role: 'user', conteudo: pergunta.trim() },
    { user_id: userId, role: 'assistant', conteudo: resposta },
  ]);

  return { resposta };
}
