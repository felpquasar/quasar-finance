import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';

const PALETA = ['#3ce28b', '#ff6b5e', '#58a6ff', '#b48cf2', '#e8b33e', '#56616e'];
const corCategoria = (nome) => {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};
const corNatureza = { pessoal: '#3ce28b', transito: '#58a6ff', quasar: '#e8b33e', compartilhada: '#b48cf2' };
const mesLabel = (mes) =>
  new Date(`${mes}-15`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

function GraficoAcumulado({ lancs, entradas }) {
  const gastos = lancs
    .filter((l) => l.natureza === 'pessoal' && l.valor < 0)
    .sort((a, b) => a.data.localeCompare(b.data));
  if (gastos.length === 0) {
    return <div className="vazio">Sem gastos pessoais neste mês para desenhar a curva.</div>;
  }

  const W = 980, H = 240, PAD = 12;
  const dias = 31;
  const porDia = new Array(dias + 1).fill(0);
  for (const g of gastos) porDia[Number(g.data.slice(8, 10))] += Math.abs(Number(g.valor));
  const ultimoDia = Number(gastos[gastos.length - 1].data.slice(8, 10));

  let acum = 0;
  const pontos = [];
  for (let d = 1; d <= ultimoDia; d++) {
    acum += porDia[d];
    pontos.push({ d, acum });
  }

  const teto = entradas > 417 ? entradas - 417 : null;
  const maxY = Math.max(entradas, acum, 1) * 1.12;
  const x = (d) => ((d - 1) / (dias - 1)) * W;
  const y = (v) => H - PAD - (v / maxY) * (H - PAD * 2);

  const path = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.d).toFixed(1)},${y(p.acum).toFixed(1)}`).join(' ');
  const area = `${path} L${x(ultimoDia).toFixed(1)},${H} L${x(1).toFixed(1)},${H} Z`;

  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: 'block' }}>
        {entradas > 0 && (
          <>
            <line x1="0" y1={y(entradas)} x2={W} y2={y(entradas)} stroke="#58a6ff" strokeWidth="1" strokeDasharray="5 6" opacity=".55" />
            <text x={W - 4} y={y(entradas) - 6} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="11" fill="#58a6ff">
              renda {fmt(entradas)}
            </text>
          </>
        )}
        {teto && (
          <>
            <line x1="0" y1={y(teto)} x2={W} y2={y(teto)} stroke="#e8b33e" strokeWidth="1" strokeDasharray="5 6" opacity=".65" />
            <text x={W - 4} y={y(teto) - 6} textAnchor="end" fontFamily="IBM Plex Mono" fontSize="11" fill="#e8b33e">
              teto p/ aporte {fmt(teto)}
            </text>
          </>
        )}
        <defs>
          <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3ce28b" stopOpacity=".22" />
            <stop offset="100%" stopColor="#3ce28b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ga)" />
        <path d={path} fill="none" stroke="#3ce28b" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx={x(ultimoDia)} cy={y(acum)} r="4.5" fill="#3ce28b" />
      </svg>
      {teto && (
        <div className="chart-note">
          Mantenha a curva verde abaixo da linha âmbar até o fim do mês e o aporte da meta está garantido.
        </div>
      )}
    </>
  );
}

export default function Dashboard() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [resumo, setResumo] = useState(null);
  const [lancs, setLancs] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    Promise.all([api(`/resumo?mes=${mes}`), api(`/lancamentos?mes=${mes}`)])
      .then(([r, l]) => { setResumo(r); setLancs(l); })
      .catch((e) => setErro(e.message));
  }, [mes]);

  if (erro) return <div className="erro">{erro}</div>;
  if (!resumo) return <div className="vazio">Carregando...</div>;

  const fila = (resumo.revisao_pendente || 0) + (resumo.pendencias_abertas || 0);
  const sobraOk = resumo.sobra >= resumo.aporte_meta;
  const ultimos = [...lancs].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
  const topCat = resumo.por_categoria[0];
  const totalGasto = resumo.gastos || 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Visão geral</h1>
          <div className="sub">{mesLabel(mes)} · {lancs.length} lançamentos</div>
        </div>
        <input type="month" className="mono" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>

      <div className="kpis">
        <div className="kpi hero">
          <span className="label">{resumo.projecao ? 'Sobra projetada' : 'Sobra do mês'}</span>
          <div className={`valor num ${(resumo.projecao?.sobra_projetada ?? resumo.sobra) >= resumo.aporte_meta ? 'v-mint' : 'v-red'}`}>
            {fmt(resumo.projecao?.sobra_projetada ?? resumo.sobra)}
          </div>
          <div className="hint">
            {resumo.projecao
              ? <>sobra atual <b className="num">{fmt(resumo.sobra)}</b> · projeção até o dia 30{resumo.projecao.recorrentes_a_vencer > 0 && <> · {fmt(resumo.projecao.recorrentes_a_vencer)} em contas a vencer</>}</>
              : sobraOk
                ? <>✓ aporte de <b className="num">{fmt(resumo.aporte_meta)}</b> garantido</>
                : <>faltam <b className="num">{fmt(Math.abs(resumo.distancia_meta))}</b> p/ aporte de R$ 417</>}
          </div>
        </div>
        <div className="kpi">
          <span className="label">Gasto pessoal</span>
          <div className="valor num v-white">{fmt(resumo.gastos)}</div>
          <div className="hint">trânsito e Quasar já excluídos</div>
        </div>
        <div className="kpi">
          <span className="label">Entradas</span>
          <div className="valor num v-mint">{fmt(resumo.entradas)}</div>
          <div className="hint">natureza pessoal</div>
        </div>
        <div className="kpi">
          <span className="label">Fila de revisão</span>
          <div className={`valor num ${fila > 0 ? 'v-amber' : 'v-mint'}`}>{fila}</div>
          {fila > 0
            ? <Link className="hint link" to="/revisar">decidir em 1 toque →</Link>
            : <div className="hint">tudo em dia ✓</div>}
        </div>
      </div>

      <div className="grid-main">
        <div className="panel">
          <div className="panel-head">
            <span className="label">Gasto acumulado · {mesLabel(mes)}</span>
            {topCat && (
              <span className="pill warn">▲ top categoria: {topCat.nome.toLowerCase()} {fmt(topCat.total)}</span>
            )}
          </div>
          <GraficoAcumulado lancs={lancs} entradas={resumo.entradas} />
        </div>
      </div>

      <div className="grid-3">
        <div className="panel">
          <div className="panel-head">
            <span className="label">Últimos lançamentos</span>
            <Link to="/lancamentos" className="pill ok" style={{ textDecoration: 'none' }}>ver tudo →</Link>
          </div>
          {ultimos.length === 0 && <div className="vazio">Nada ainda. Suba um extrato.</div>}
          {ultimos.map((l) => (
            <div className="tx" key={l.id}>
              <div className="tx-ico" style={{ color: corNatureza[l.natureza] || '#7d8895' }}>
                {(l.categorias?.nome || l.descricao).slice(0, 2).toUpperCase()}
              </div>
              <div className="tx-info">
                <div className="t">{l.descricao}</div>
                <div className="s">
                  {l.data.slice(8, 10)}/{l.data.slice(5, 7)} · {l.categorias?.nome || l.natureza}
                </div>
              </div>
              <div className={`tx-val ${l.natureza !== 'pessoal' ? 'tx-muted' : l.valor < 0 ? 'v-red' : 'v-mint'}`}>
                {l.valor < 0 ? '-' : '+'}{fmt(Math.abs(l.valor))}
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="label">Gastos por categoria</span></div>
          {resumo.por_categoria.length === 0 && <div className="vazio">Sem gastos no mês.</div>}
          {resumo.por_categoria.slice(0, 7).map((c) => (
            <div className="cat-row" key={c.nome}>
              <div className="cat-line">
                <span>{c.nome}</span>
                <span className="num"><b>{fmt(c.total)}</b> · {Math.round((c.total / totalGasto) * 100)}%</span>
              </div>
              <div className="bar">
                <i style={{ width: `${Math.min(100, (c.total / totalGasto) * 100)}%`, background: corCategoria(c.nome) }} />
              </div>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="label">Fila de revisão</span>
            {fila > 0 && <span className="pill warn">{fila} {fila === 1 ? 'item' : 'itens'}</span>}
          </div>
          {fila === 0 && <div className="vazio">✓ Nenhuma decisão pendente.</div>}
          {resumo.revisao_pendente > 0 && (
            <div className="tx">
              <div className="tx-ico" style={{ color: '#e8b33e' }}>?</div>
              <div className="tx-info">
                <div className="t">{resumo.revisao_pendente} natureza{resumo.revisao_pendente > 1 ? 's' : ''} incerta{resumo.revisao_pendente > 1 ? 's' : ''}</div>
                <div className="s">conta mista BB</div>
              </div>
            </div>
          )}
          {resumo.pendencias_abertas > 0 && (
            <div className="tx">
              <div className="tx-ico" style={{ color: '#ff6b5e' }}>!</div>
              <div className="tx-info">
                <div className="t">{resumo.pendencias_abertas} linha{resumo.pendencias_abertas > 1 ? 's' : ''} não lida{resumo.pendencias_abertas > 1 ? 's' : ''}</div>
                <div className="s">parser não entendeu</div>
              </div>
            </div>
          )}
          {fila > 0 && (
            <div style={{ marginTop: 14 }}>
              <Link to="/revisar">
                <button className="btn primary" style={{ width: '100%' }}>Revisar agora</button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
