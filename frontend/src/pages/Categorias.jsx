import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const PALETA = ['#3ce28b', '#ff6b5e', '#58a6ff', '#b48cf2', '#e8b33e', '#56616e'];
const corCategoria = (nome) => {
  let h = 0;
  for (const c of String(nome)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
};

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    api('/categorias').then(setCategorias).catch((e) => setErro(e.message));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar(e) {
    e.preventDefault();
    try {
      await api('/categorias', { method: 'POST', body: { nome } });
      setNome('');
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function renomear(c) {
    const novo = prompt('Novo nome:', c.nome);
    if (!novo || novo === c.nome) return;
    try {
      await api(`/categorias/${c.id}`, { method: 'PATCH', body: { nome: novo } });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function excluir(c) {
    if (!confirm(`Excluir categoria "${c.nome}"?`)) return;
    try {
      await api(`/categorias/${c.id}`, { method: 'DELETE' });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Categorias</h1>
          <div className="sub">{categorias.length} categorias · correções viram regras</div>
        </div>
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}

      <form className="filters" onSubmit={criar}>
        <input placeholder="Nova categoria" value={nome} onChange={(e) => setNome(e.target.value)} required style={{ width: 260 }} />
        <button className="btn primary">Criar</button>
      </form>

      <div className="cat-grid">
        {categorias.map((c) => (
          <div className="cat-card" key={c.id}>
            <span className="dot" style={{ background: corCategoria(c.nome) }} />
            <span className="nome">{c.nome}</span>
            <span className="acoes">
              <button onClick={() => renomear(c)} title="Renomear">✏️</button>
              <button onClick={() => excluir(c)} title="Excluir">✕</button>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
