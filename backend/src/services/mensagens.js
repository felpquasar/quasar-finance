import { supabase } from '../supabase.js';

// Geradores das mensagens proativas do WhatsApp (§ "Modo proativo" da
// arquitetura). Texto puro, sem efeito colateral de envio — testável e
// independente do mecanismo de entrega (whatsapp.js cuida do Selenium/QR).
//
//   resumoSemanal(userId)      -> string (cutucão de domingo)
//   alertasVencimento(userId)  -> string | null (job diário; null = nada hoje)
//
// Tudo responde à régua dos R$ 417/mês.

const APORTE_META = 417;
const arred = (v) => Math.round(v * 100) / 100;
const real = (v) =>
  `R$ ${Math.abs(arred(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Valor que conta como do Felipe: pessoal integral, compartilhada só a fração
const valorFelipe = (l, pctPor) => {
  if (l.natureza === 'pessoal') return Number(l.valor);
  if (l.natureza === 'compartilhada') return Number(l.valor) * ((pctPor[l.id] ?? 50) / 100);
  return 0;
};

const isoDia = (d) => d.toISOString().slice(0, 10);
const primeiroDiaMes = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

// ---------------------------------------------------------------------
// Resumo de domingo
// ---------------------------------------------------------------------
export async function resumoSemanal(userId, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const inicioMes = primeiroDiaMes(ano, mes);
  const inicioMesAnterior = primeiroDiaMes(mes === 0 ? ano - 1 : ano, mes === 0 ? 11 : mes - 1);
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(hoje.getDate() - 7);

  const [lancsR, splitsR, recR, receberR, compR, metasR, aportesR] = await Promise.all([
    supabase
      .from('lancamentos')
      .select('id, data, valor, natureza, categoria_id, categorias(nome)')
      .eq('user_id', userId)
      .gte('data', inicioMesAnterior),
    supabase.from('splits').select('lancamento_id, percentual_felipe').eq('user_id', userId),
    supabase.from('recorrentes').select('dia_vencimento, valor_estimado').eq('user_id', userId).eq('ativo', true),
    supabase.from('a_receber').select('valor, devedor').eq('user_id', userId).eq('status', 'aberto'),
    supabase.from('compromissos').select('valor').eq('user_id', userId).eq('mes_ref', inicioMes),
    supabase.from('metas').select('*').eq('user_id', userId).eq('status', 'ativa').order('prioridade'),
    supabase.from('aportes').select('meta_id, valor').eq('user_id', userId),
  ]);
  const erro = lancsR.error || splitsR.error || recR.error || receberR.error || compR.error || metasR.error || aportesR.error;
  if (erro) throw erro;

  const pctPor = Object.fromEntries((splitsR.data || []).map((s) => [s.lancamento_id, s.percentual_felipe]));
  const lancs = lancsR.data || [];
  const doMes = lancs.filter((l) => l.data >= inicioMes);
  const doMesAnterior = lancs.filter((l) => l.data >= inicioMesAnterior && l.data < inicioMes);
  const daSemana = lancs.filter((l) => l.data >= isoDia(seteDiasAtras));

  const gastoSemana = daSemana
    .filter((l) => l.valor < 0)
    .reduce((s, l) => s + Math.abs(valorFelipe(l, pctPor)), 0);

  // Top 3 categorias do mês + gargalo vs mês anterior
  const porCat = (arr) => {
    const m = {};
    for (const l of arr) {
      if (l.valor >= 0) continue;
      const v = Math.abs(valorFelipe(l, pctPor));
      if (v === 0) continue;
      const nome = l.categorias?.nome || 'Sem categoria';
      m[nome] = (m[nome] || 0) + v;
    }
    return m;
  };
  const catMes = porCat(doMes);
  const catAnt = porCat(doMesAnterior);
  const top3 = Object.entries(catMes).sort((a, b) => b[1] - a[1]).slice(0, 3);

  // Gargalo: categoria que mais estourou vs mês passado (>30% e relevante)
  let gargalo = null;
  for (const [nome, val] of Object.entries(catMes)) {
    const ant = catAnt[nome] || 0;
    if (ant > 0 && val > ant * 1.3 && val - ant >= 30) {
      const pct = Math.round((val / ant - 1) * 100);
      if (!gargalo || val - ant > gargalo.delta) gargalo = { nome, pct, delta: val - ant };
    }
  }

  // Projeção de fechamento do mês (gasto atual + média diária + recorrentes
  // a vencer + parcelas vincendas). Mesma lógica do resumo do app.
  const entradasMes = doMes.filter((l) => l.valor > 0).reduce((s, l) => s + valorFelipe(l, pctPor), 0);
  const gastoMes = doMes.filter((l) => l.valor < 0).reduce((s, l) => s + Math.abs(valorFelipe(l, pctPor)), 0);
  const diaHoje = hoje.getDate();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const mediaDiaria = diaHoje > 0 ? gastoMes / diaHoje : 0;
  const recFuturas = (recR.data || [])
    .filter((r) => r.dia_vencimento > diaHoje && r.valor_estimado)
    .reduce((s, r) => s + Number(r.valor_estimado), 0);
  const parcelasMes = (compR.data || []).reduce((s, c) => s + Number(c.valor), 0);
  const gastoProjetado = gastoMes + mediaDiaria * (diasNoMes - diaHoje) + recFuturas + parcelasMes;
  const sobraProjetada = entradasMes - gastoProjetado;

  // Metas
  const acumPorMeta = {};
  for (const a of aportesR.data || []) acumPorMeta[a.meta_id] = (acumPorMeta[a.meta_id] || 0) + Number(a.valor);

  // A receber (cobrança)
  const receberTotal = (receberR.data || []).reduce((s, r) => s + Number(r.valor), 0);

  // ---- monta texto ----
  const L = [];
  L.push('📊 *Resumo da semana*');
  L.push('');
  L.push(`Você gastou *${real(gastoSemana)}* nos últimos 7 dias.`);

  if (top3.length) {
    L.push('');
    L.push('*Top categorias do mês:*');
    top3.forEach(([nome, val], i) => L.push(`${i + 1}. ${nome} — ${real(val)}`));
  }
  if (gargalo) {
    L.push('');
    L.push(`⚠️ *${gargalo.nome}* está ${gargalo.pct}% acima do mês passado.`);
  }

  L.push('');
  const ok = sobraProjetada >= APORTE_META;
  L.push(`*Projeção de fechamento:* sobra de ${real(sobraProjetada)}`);
  L.push(ok
    ? `✅ Acima da régua de ${real(APORTE_META)}/mês — aporte garantido.`
    : `🔴 Régua é ${real(APORTE_META)}/mês — faltam ${real(APORTE_META - sobraProjetada)} no ritmo atual.`);

  if ((metasR.data || []).length) {
    L.push('');
    L.push('*Metas:*');
    for (const m of metasR.data) {
      const acum = acumPorMeta[m.id] || 0;
      const pct = Number(m.valor_alvo) > 0 ? Math.round((acum / Number(m.valor_alvo)) * 100) : 0;
      L.push(`• ${m.nome}: ${real(acum)} / ${real(m.valor_alvo)} (${pct}%)`);
    }
  }

  if (receberTotal > 0) {
    L.push('');
    L.push(`💸 A receber em aberto: *${real(receberTotal)}* — cobrar?`);
  }

  return L.join('\n');
}

// ---------------------------------------------------------------------
// Alertas de vencimento (job diário) — recorrentes, contas avulsas e
// repasses da família (pix do pai/irmã que ainda não caiu).
// Retorna null se não há nada a alertar hoje (não manda mensagem vazia).
// ---------------------------------------------------------------------
export async function alertasVencimento(userId, hoje = new Date(), janelaDias = 3) {
  const diaHoje = hoje.getDate();
  const limite = new Date(hoje);
  limite.setDate(hoje.getDate() + janelaDias);

  const [recR, avulsasR, repassesR] = await Promise.all([
    supabase.from('recorrentes').select('nome, dia_vencimento, valor_estimado').eq('user_id', userId).eq('ativo', true),
    supabase.from('contas_avulsas').select('nome, vencimento, valor').eq('user_id', userId).eq('status', 'aberta'),
    supabase.from('repasses_familia').select('cartao, vencimento, valor_fatura, status').eq('user_id', userId).eq('status', 'aguardando_pix'),
  ]);
  const erro = recR.error || avulsasR.error || repassesR.error;
  if (erro) throw erro;

  const alertas = [];
  const diasAte = (iso) => Math.round((new Date(iso) - new Date(isoDia(hoje))) / 86400000);
  const qdo = (d) => (d <= 0 ? 'hoje' : d === 1 ? 'amanhã' : `em ${d} dias`);

  // Recorrentes: dia do mês dentro da janela (sem rolar virada de mês p/ simplicidade)
  for (const r of recR.data || []) {
    if (r.dia_vencimento >= diaHoje && r.dia_vencimento <= limite.getDate() && limite.getMonth() === hoje.getMonth()) {
      const d = r.dia_vencimento - diaHoje;
      const valor = r.valor_estimado ? ` — ~${real(r.valor_estimado)}` : '';
      alertas.push(`⚠️ ${r.nome} vence ${qdo(d)}${valor}`);
    }
  }
  // Contas avulsas
  for (const c of avulsasR.data || []) {
    const d = diasAte(c.vencimento);
    if (d >= 0 && d <= janelaDias) alertas.push(`⚠️ ${c.nome} vence ${qdo(d)} — ${real(c.valor)}`);
  }
  // Repasses família: risco do pix não cair antes do vencimento
  for (const rp of repassesR.data || []) {
    const d = diasAte(rp.vencimento);
    if (d >= 0 && d <= janelaDias) {
      const quem = rp.cartao === 'caixa_pai' ? 'seu pai' : 'sua irmã';
      alertas.push(`🚨 Fatura ${rp.cartao} vence ${qdo(d)} (${real(rp.valor_fatura)}) — pix d${quem === 'seu pai' ? 'o seu pai' : 'a sua irmã'} ainda não caiu`);
    }
  }

  if (!alertas.length) return null;
  return ['🔔 *Vencimentos próximos*', '', ...alertas].join('\n');
}
