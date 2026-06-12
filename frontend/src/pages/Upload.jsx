import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, notificarMudanca } from '../api.js';

const COR_BANCO = { bb: '#e8b33e', mercadopago: '#58a6ff', nubank: '#b48cf2' };

export default function Upload() {
  const [contas, setContas] = useState([]);
  const [contaId, setContaId] = useState('');
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api('/contas').then((cs) => {
      // Fase 1: só extratos de conta corrente (faturas de cartão = Fase 2)
      const correntes = cs.filter((c) => c.tipo === 'corrente');
      setContas(correntes);
      if (correntes[0]) setContaId(correntes[0].id);
    }).catch((e) => setErro(e.message));
  }, []);

  async function processar(arquivo) {
    if (!arquivo || !contaId) return;
    setErro('');
    setResultado(null);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('conta_id', contaId);
      const r = await api('/upload', { method: 'POST', formData: fd });
      setResultado({ ...r, arquivo: arquivo.name });
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Subir extratos</h1>
          <div className="sub">PDF · dedup automática · pode repetir arquivo</div>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}

      <div className="conta-pills">
        {contas.map((c) => (
          <button
            key={c.id}
            className={`conta-pill ${c.id === contaId ? 'sel' : ''}`}
            onClick={() => setContaId(c.id)}
          >
            <span className="b-dot" style={{ background: COR_BANCO[c.banco] || '#7d8895' }} />
            {c.nome}
          </button>
        ))}
      </div>

      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          processar(e.dataTransfer.files?.[0]);
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3ce28b" strokeWidth="1.6" style={{ margin: '0 auto', display: 'block' }}>
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
        </svg>
        <div className="big">{enviando ? 'Processando...' : 'Arraste o extrato PDF aqui'}</div>
        <div className="sub">ou clique para escolher · até 20 MB</div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => { processar(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      {resultado && (
        <div className="panel" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <span className="pill ok">✓ processado</span>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b>{resultado.arquivo}</b>
            <div className="chart-note" style={{ marginTop: 3 }}>
              <span className="num">{resultado.linhas_lidas}</span> linhas lidas ·{' '}
              <span className="num v-mint">{resultado.inseridos}</span> novas ·{' '}
              <span className="num">{resultado.duplicados}</span> duplicadas ignoradas
              {resultado.pendencias > 0 && (
                <> · <span className="num v-amber">{resultado.pendencias}</span> em revisão</>
              )}
            </div>
          </div>
          {resultado.pendencias > 0 && (
            <Link to="/revisar"><button className="btn ghost">Revisar →</button></Link>
          )}
        </div>
      )}
    </>
  );
}
