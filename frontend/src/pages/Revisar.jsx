import { useEffect, useState, useCallback } from 'react';
import { api, fmt, notificarMudanca } from '../api.js';

export default function Revisar() {
  const [incertos, setIncertos] = useState([]);
  const [pendencias, setPendencias] = useState([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    Promise.all([api('/lancamentos?status=pendente'), api('/pendencias')])
      .then(([l, p]) => { setIncertos(l); setPendencias(p); })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Decisão em 1 toque: define natureza, tira da fila, vira regra aprendida
  async function decidir(lanc, natureza) {
    try {
      await api(`/lancamentos/${lanc.id}`, {
        method: 'PATCH',
        body: { natureza, status: 'ok', aprender_regra: true },
      });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function marcarPendencia(id, status) {
    try {
      await api(`/pendencias/${id}`, { method: 'PATCH', body: { status } });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  const total = incertos.length + pendencias.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Revisar</h1>
          <div className="sub">
            {total === 0 ? 'nada pendente ✓' : `${total} ${total === 1 ? 'decisão pendente' : 'decisões pendentes'} · cada toque vira regra`}
          </div>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}
      {total === 0 && <div className="ok-msg">✓ Fila limpa. As regras aprendidas estão fazendo o trabalho.</div>}

      {incertos.length > 0 && (
        <>
          <div className="section-title">
            Natureza incerta <span className="count">· conta mista BB · {incertos.length} {incertos.length === 1 ? 'item' : 'itens'}</span>
          </div>
          {incertos.map((l) => (
            <div className="review-card flag" key={l.id}>
              <div className="review-info">
                <div className="t">{l.descricao}</div>
                <div className="s">
                  {l.contas?.nome} · {l.data.slice(8, 10)}/{l.data.slice(5, 7)} ·{' '}
                  {l.valor < 0 ? '-' : '+'}{fmt(Math.abs(l.valor))} · marcado {l.natureza} por padrão
                </div>
              </div>
              <div className="review-actions">
                <button className="chip" onClick={() => decidir(l, 'pessoal')}>Pessoal</button>
                <button className="chip amber" onClick={() => decidir(l, 'quasar')}>
                  Quasar{l.natureza === 'quasar' ? ' ✓' : ''}
                </button>
                <button className="chip blue" onClick={() => decidir(l, 'transito')}>Trânsito</button>
                <button className="chip purple" onClick={() => decidir(l, 'compartilhada')}>Compart.</button>
              </div>
            </div>
          ))}
        </>
      )}

      {pendencias.length > 0 && (
        <>
          <div className="section-title">
            Linhas não lidas <span className="count">· parser não entendeu · {pendencias.length} {pendencias.length === 1 ? 'item' : 'itens'}</span>
          </div>
          {pendencias.map((p) => (
            <div className="review-card" key={p.id}>
              <div className="review-info">
                <div className="raw">{p.linha_raw}</div>
                <div className="s" style={{ marginTop: 7 }}>
                  {p.arquivo} · {p.motivo}{p.contas?.nome ? ` · ${p.contas.nome}` : ''}
                </div>
              </div>
              <div className="review-actions">
                <button className="chip" onClick={() => marcarPendencia(p.id, 'resolvida')} title="Já criei o lançamento manual correspondente">
                  Resolvida
                </button>
                <button className="chip red" onClick={() => marcarPendencia(p.id, 'descartada')}>Descartar</button>
              </div>
            </div>
          ))}
          <div className="chart-note">
            Linha relevante? Crie o lançamento manual em Lançamentos e marque "Resolvida" aqui.
          </div>
        </>
      )}
    </>
  );
}
