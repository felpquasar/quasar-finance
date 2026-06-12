import { useEffect, useState, useCallback } from 'react';
import { api, fmt, notificarMudanca } from '../api.js';

const NATUREZAS = ['pessoal', 'transito', 'quasar', 'compartilhada'];

export default function Lancamentos() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [natureza, setNatureza] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [lancs, setLancs] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [contas, setContas] = useState([]);
  const [erro, setErro] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const [iaRodando, setIaRodando] = useState(false);
  const [iaMsg, setIaMsg] = useState('');
  const [manual, setManual] = useState({ data: '', descricao: '', valor: '', conta_id: '', categoria_id: '' });

  const carregar = useCallback(() => {
    const params = new URLSearchParams({ mes });
    if (natureza) params.set('natureza', natureza);
    if (categoriaId) params.set('categoria_id', categoriaId);
    api(`/lancamentos?${params}`).then(setLancs).catch((e) => setErro(e.message));
  }, [mes, natureza, categoriaId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    api('/categorias').then(setCategorias).catch(() => {});
    api('/contas').then((cs) => {
      setContas(cs);
      if (cs[0]) setManual((m) => ({ ...m, conta_id: cs[0].id }));
    }).catch(() => {});
  }, []);

  async function editar(id, patch) {
    try {
      await api(`/lancamentos/${id}`, { method: 'PATCH', body: { ...patch, aprender_regra: true } });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function addManual(e) {
    e.preventDefault();
    try {
      await api('/lancamentos', {
        method: 'POST',
        body: {
          ...manual,
          valor: parseFloat(String(manual.valor).replace(',', '.')),
          categoria_id: manual.categoria_id || null,
        },
      });
      setManual((m) => ({ ...m, descricao: '', valor: '' }));
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function excluir(l) {
    if (!confirm(`Excluir "${l.descricao}"?`)) return;
    try {
      await api(`/lancamentos/${l.id}`, { method: 'DELETE' });
      carregar();
      notificarMudanca();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Lançamentos</h1>
          <div className="sub">{lancs.length} no filtro atual</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn ghost"
            disabled={iaRodando}
            onClick={async () => {
              setIaRodando(true);
              setIaMsg('');
              try {
                const r = await api('/ia/categorizar', { method: 'POST' });
                setIaMsg(
                  r.mensagem ||
                    `✓ ${r.categorizados} categorizados pela IA${r.incertos > 0 ? ` · ${r.incertos} incertos foram p/ Revisar` : ''}`
                );
                carregar();
                notificarMudanca();
              } catch (e) {
                setErro(e.message);
              } finally {
                setIaRodando(false);
              }
            }}
          >
            {iaRodando ? 'Categorizando...' : '✦ Categorizar com IA'}
          </button>
          <button className="btn primary" onClick={() => setFormAberto(!formAberto)}>
            {formAberto ? 'Fechar' : '+ Lançamento manual'}
          </button>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}
      {iaMsg && <div className="ok-msg" onClick={() => setIaMsg('')}>{iaMsg}</div>}

      {formAberto && (
        <form className="panel filters" style={{ marginBottom: 16 }} onSubmit={addManual}>
          <input type="date" className="mono" value={manual.data} onChange={(e) => setManual({ ...manual, data: e.target.value })} required />
          <input placeholder="Descrição" value={manual.descricao} onChange={(e) => setManual({ ...manual, descricao: e.target.value })} required style={{ flex: 1, minWidth: 160 }} />
          <input placeholder="-50,00 = gasto" className="mono" value={manual.valor} onChange={(e) => setManual({ ...manual, valor: e.target.value })} required style={{ width: 130 }} />
          <select value={manual.conta_id} onChange={(e) => setManual({ ...manual, conta_id: e.target.value })}>
            {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={manual.categoria_id} onChange={(e) => setManual({ ...manual, categoria_id: e.target.value })}>
            <option value="">Sem categoria</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <button className="btn primary">Adicionar</button>
        </form>
      )}

      <div className="filters">
        <input type="month" className="mono" value={mes} onChange={(e) => setMes(e.target.value)} />
        <select value={natureza} onChange={(e) => setNatureza(e.target.value)}>
          <option value="">Todas naturezas</option>
          {NATUREZAS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Todas categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="panel" style={{ padding: '6px 16px 10px' }}>
        <table>
          <thead>
            <tr>
              <th>Data</th><th>Descrição</th><th>Conta</th>
              <th>Natureza</th><th>Categoria</th><th className="r">Valor</th><th />
            </tr>
          </thead>
          <tbody>
            {lancs.map((l) => (
              <tr key={l.id}>
                <td className="num tx-muted">{l.data.slice(8, 10)}/{l.data.slice(5, 7)}</td>
                <td>
                  <b>{l.descricao}</b>
                  {l.status === 'pendente' && <span className="pill warn" style={{ marginLeft: 8 }}>revisar</span>}
                </td>
                <td className="tx-muted">{l.contas?.nome}</td>
                <td>
                  <select value={l.natureza} onChange={(e) => editar(l.id, { natureza: e.target.value, status: 'ok' })}>
                    {NATUREZAS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
                <td>
                  <select value={l.categoria_id || ''} onChange={(e) => editar(l.id, { categoria_id: e.target.value || null })}>
                    <option value="">—</option>
                    {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </td>
                <td className={`r num ${l.natureza !== 'pessoal' ? 'tx-muted' : l.valor < 0 ? 'v-red' : 'v-mint'}`}>
                  {l.valor < 0 ? '-' : '+'}{fmt(Math.abs(l.valor))}
                </td>
                <td className="r">
                  <button className="btn ghost" style={{ padding: '3px 9px', fontSize: 12 }} onClick={() => excluir(l)}>✕</button>
                </td>
              </tr>
            ))}
            {lancs.length === 0 && (
              <tr><td colSpan="7" className="vazio">Nenhum lançamento neste filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="chart-note">
        Corrigir natureza ou categoria aqui cria uma regra aprendida — a próxima importação classifica sozinha.
      </div>
    </>
  );
}
