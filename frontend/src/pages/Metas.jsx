import { useEffect, useState, useCallback } from 'react';
import { api, fmt, notificarMudanca } from '../api.js';

export default function Metas() {
  const [metas, setMetas] = useState([]);
  const [recorrentes, setRecorrentes] = useState([]);
  const [erro, setErro] = useState('');
  const [aporte, setAporte] = useState({ valor: '', mes_ref: new Date().toISOString().slice(0, 7) });
  const [novaRec, setNovaRec] = useState({ nome: '', dia_vencimento: '', valor_estimado: '' });

  const carregar = useCallback(() => {
    Promise.all([api('/metas'), api('/recorrentes')])
      .then(([m, r]) => { setMetas(m); setRecorrentes(r); })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function registrarAporte(meta) {
    try {
      await api(`/metas/${meta.id}/aportes`, {
        method: 'POST',
        body: { mes_ref: aporte.mes_ref, valor: parseFloat(String(aporte.valor).replace(',', '.')) },
      });
      setAporte((a) => ({ ...a, valor: '' }));
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function criarRecorrente(e) {
    e.preventDefault();
    try {
      await api('/recorrentes', { method: 'POST', body: novaRec });
      setNovaRec({ nome: '', dia_vencimento: '', valor_estimado: '' });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function alternarRecorrente(r) {
    try {
      await api(`/recorrentes/${r.id}`, { method: 'PATCH', body: { ativo: !r.ativo } });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function excluirRecorrente(r) {
    if (!confirm(`Excluir "${r.nome}"?`)) return;
    try {
      await api(`/recorrentes/${r.id}`, { method: 'DELETE' });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Metas</h1>
          <div className="sub">a régua de tudo: R$ 417/mês p/ a reserva</div>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}

      {metas.map((m) => {
        const acompanhamento = Number(m.valor_alvo) === 0;
        const pct = acompanhamento ? 0 : Math.min(100, (m.acumulado / Number(m.valor_alvo)) * 100);
        return (
          <div className="panel" key={m.id} style={{ marginBottom: 16 }}>
            <div className="panel-head">
              <div>
                <span className="label">{m.nome}</span>
                {m.prazo && (
                  <span className="chart-note" style={{ marginTop: 2 }}>
                    prazo {m.prazo.slice(8, 10)}/{m.prazo.slice(5, 7)}/{m.prazo.slice(0, 4)}
                    {m.meses_restantes !== null && ` · ${m.meses_restantes} meses restantes`}
                  </span>
                )}
              </div>
              {!acompanhamento && m.ritmo_chega !== null && (
                <span className={`pill ${m.ritmo_chega ? 'ok' : 'danger'}`}>
                  {m.ritmo_chega ? '✓ ritmo atual chega lá' : '▲ ritmo atual não chega'}
                </span>
              )}
            </div>

            {acompanhamento ? (
              <div className="chart-note">
                Acompanhamento de fatura até zerar — entra quando o parser de
                faturas de cartão estiver ativo (Fase 2 restante).
              </div>
            ) : (
              <>
                <div className="cat-row">
                  <div className="cat-line">
                    <span className="num" style={{ fontSize: 17, fontWeight: 700 }}>
                      {fmt(m.acumulado)} <span className="tx-muted">de {fmt(m.valor_alvo)}</span>
                    </span>
                    <span className="num">{Math.round(pct)}%</span>
                  </div>
                  <div className="bar" style={{ height: 8 }}>
                    <i style={{ width: `${pct}%`, background: 'var(--mint)' }} />
                  </div>
                </div>

                <div className="chart-note" style={{ marginBottom: 14 }}>
                  Faltam <b className="num">{fmt(m.falta)}</b>
                  {m.meses_restantes > 0 && (
                    <> · aporte necessário <b className="num">{fmt(m.aporte_necessario)}/mês</b></>
                  )}
                  {m.sobra_media_mensal !== null && (
                    <> · sua sobra média é <b className="num">{fmt(m.sobra_media_mensal)}/mês</b></>
                  )}
                </div>

                <div className="filters" style={{ marginBottom: 0 }}>
                  <input type="month" className="mono" value={aporte.mes_ref}
                    onChange={(e) => setAporte({ ...aporte, mes_ref: e.target.value })} />
                  <input placeholder="Valor do aporte" className="mono" style={{ width: 150 }}
                    value={aporte.valor} onChange={(e) => setAporte({ ...aporte, valor: e.target.value })} />
                  <button className="btn primary" disabled={!aporte.valor} onClick={() => registrarAporte(m)}>
                    Registrar aporte
                  </button>
                </div>

                {m.aportes.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    {m.aportes.slice(0, 6).map((a) => (
                      <div className="tx" key={a.id}>
                        <div className="tx-info">
                          <div className="s">{a.mes_ref.slice(5, 7)}/{a.mes_ref.slice(0, 4)}</div>
                        </div>
                        <div className="tx-val v-mint">+{fmt(a.valor)}</div>
                        <button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={async () => {
                            if (!confirm('Desfazer este aporte?')) return;
                            await api(`/metas/aportes/${a.id}`, { method: 'DELETE' });
                            carregar();
                            notificarMudanca();
                          }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <div className="section-title">
        Contas recorrentes <span className="count">· alimentam a projeção do mês e os alertas</span>
      </div>

      <form className="filters" onSubmit={criarRecorrente}>
        <input placeholder="Nome (Energia, Internet...)" value={novaRec.nome}
          onChange={(e) => setNovaRec({ ...novaRec, nome: e.target.value })} required style={{ minWidth: 200 }} />
        <input placeholder="Dia venc." type="number" min="1" max="31" className="mono" style={{ width: 100 }}
          value={novaRec.dia_vencimento} onChange={(e) => setNovaRec({ ...novaRec, dia_vencimento: e.target.value })} required />
        <input placeholder="Valor estimado" className="mono" style={{ width: 140 }}
          value={novaRec.valor_estimado} onChange={(e) => setNovaRec({ ...novaRec, valor_estimado: e.target.value })} />
        <button className="btn primary">Adicionar</button>
      </form>

      {recorrentes.length === 0 ? (
        <div className="vazio">Nenhuma conta recorrente cadastrada.</div>
      ) : (
        <div className="panel" style={{ padding: '6px 16px 10px' }}>
          <table>
            <thead>
              <tr><th>Conta</th><th>Vence dia</th><th className="r">Valor estimado</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {recorrentes.map((r) => (
                <tr key={r.id} style={{ opacity: r.ativo ? 1 : 0.45 }}>
                  <td><b>{r.nome}</b></td>
                  <td className="num">{String(r.dia_vencimento).padStart(2, '0')}</td>
                  <td className="r num">{r.valor_estimado ? fmt(r.valor_estimado) : '—'}</td>
                  <td>
                    <button className="chip" onClick={() => alternarRecorrente(r)}>
                      {r.ativo ? 'ativa' : 'pausada'}
                    </button>
                  </td>
                  <td className="r">
                    <button className="btn ghost" style={{ padding: '3px 9px', fontSize: 12 }}
                      onClick={() => excluirRecorrente(r)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
