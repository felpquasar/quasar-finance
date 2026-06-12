import { useEffect, useState, useCallback } from 'react';
import { api, fmt, notificarMudanca } from '../api.js';

const DEVEDOR = {
  yulae: { rotulo: 'Yulae', classe: 'compartilhada' },
  quasar: { rotulo: 'Quasar', classe: 'quasar' },
};

export default function AReceber() {
  const [abertos, setAbertos] = useState([]);
  const [recebidos, setRecebidos] = useState([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    Promise.all([api('/areceber?status=aberto'), api('/areceber?status=recebido')])
      .then(([a, r]) => { setAbertos(a); setRecebidos(r.slice(0, 10)); })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function marcar(id, status) {
    try {
      await api(`/areceber/${id}`, { method: 'PATCH', body: { status } });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function ajustarSplit(item) {
    const atual = item.percentual_felipe ?? 50;
    const novo = prompt('Sua parte da conta (%):', atual);
    if (novo === null || Number(novo) === atual) return;
    try {
      await api(`/areceber/${item.id}`, { method: 'PATCH', body: { percentual_felipe: Number(novo) } });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  const total = abertos.reduce((s, r) => s + Number(r.valor), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>A receber</h1>
          <div className="sub">
            {abertos.length === 0 ? 'nada em aberto ✓' : `${abertos.length} em aberto · ${fmt(total)}`}
          </div>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}
      {abertos.length === 0 && <div className="ok-msg">✓ Ninguém te devendo. Tudo conciliado.</div>}

      {abertos.map((r) => (
        <div className="review-card" key={r.id}>
          <span className={`badge ${DEVEDOR[r.devedor].classe}`}>{DEVEDOR[r.devedor].rotulo}</span>
          <div className="review-info">
            <div className="t">{r.lancamentos?.descricao || '—'}</div>
            <div className="s">
              {r.lancamentos?.data && `${r.lancamentos.data.slice(8, 10)}/${r.lancamentos.data.slice(5, 7)} · `}
              conta de {fmt(Math.abs(r.lancamentos?.valor ?? 0))}
              {r.devedor === 'yulae' && ` · sua parte ${r.percentual_felipe ?? 50}%`}
            </div>
          </div>
          <div className="tx-val v-amber num">{fmt(r.valor)}</div>
          <div className="review-actions">
            {r.devedor === 'yulae' && (
              <button className="chip purple" onClick={() => ajustarSplit(r)}>Ajustar split</button>
            )}
            <button className="chip" onClick={() => marcar(r.id, 'recebido')}>Recebido ✓</button>
          </div>
        </div>
      ))}

      {recebidos.length > 0 && (
        <>
          <div className="section-title">
            Recebidos <span className="count">· últimos {recebidos.length}</span>
          </div>
          {recebidos.map((r) => (
            <div className="review-card" key={r.id} style={{ opacity: 0.55 }}>
              <span className={`badge ${DEVEDOR[r.devedor].classe}`}>{DEVEDOR[r.devedor].rotulo}</span>
              <div className="review-info">
                <div className="t">{r.lancamentos?.descricao || '—'}</div>
              </div>
              <div className="tx-val v-mint num">{fmt(r.valor)}</div>
              <div className="review-actions">
                <button className="chip" onClick={() => marcar(r.id, 'aberto')}>Reabrir</button>
              </div>
            </div>
          ))}
        </>
      )}
      <p className="chart-note">
        Conciliação automática com o pix do extrato chega na Fase 3 — por
        enquanto a baixa é manual.
      </p>
    </>
  );
}
