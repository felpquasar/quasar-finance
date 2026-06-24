import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const SUGESTOES = [
  'Quanto gastei com mercado esse mês?',
  'Meu ritmo chega na reserva de R$ 5.000?',
  'Quais minhas maiores categorias de gasto?',
  'Se eu cortar R$ 200/mês, em quantos meses chego na meta?',
];

export default function Chat() {
  const [mensagens, setMensagens] = useState([]);
  const [pergunta, setPergunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [disponivel, setDisponivel] = useState(true);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);

  useEffect(() => {
    api('/chat')
      .then((r) => { setMensagens(r.mensagens || []); setDisponivel(r.disponivel); })
      .catch((e) => setErro(e.message));
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens, enviando]);

  async function enviar(texto) {
    const q = (texto ?? pergunta).trim();
    if (!q || enviando) return;
    setPergunta('');
    setErro('');
    setMensagens((m) => [...m, { role: 'user', conteudo: q, id: `tmp-${Date.now()}` }]);
    setEnviando(true);
    try {
      const { resposta } = await api('/chat', { method: 'POST', body: { pergunta: q } });
      setMensagens((m) => [...m, { role: 'assistant', conteudo: resposta, id: `a-${Date.now()}` }]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  async function limpar() {
    if (!confirm('Limpar todo o histórico da conversa?')) return;
    try {
      await api('/chat', { method: 'DELETE' });
      setMensagens([]);
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Assistente</h1>
          <div className="sub">Pergunte sobre suas finanças — respostas com base nos seus dados reais</div>
        </div>
        {mensagens.length > 0 && (
          <button className="btn ghost" onClick={limpar}>Limpar conversa</button>
        )}
      </div>

      {erro && <div className="erro" onClick={() => setErro('')}>{erro}</div>}
      {!disponivel && (
        <div className="erro">O chat precisa da ANTHROPIC_API_KEY configurada no backend (com saldo).</div>
      )}

      <div className="panel chat-janela">
        {mensagens.length === 0 && !enviando && (
          <div className="chat-vazio">
            <p>Comece com uma pergunta:</p>
            <div className="chat-sugestoes">
              {SUGESTOES.map((s) => (
                <button key={s} className="btn ghost" onClick={() => enviar(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m) => (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <div className="chat-bolha">{m.conteudo}</div>
          </div>
        ))}
        {enviando && (
          <div className="chat-msg assistant">
            <div className="chat-bolha chat-pensando">pensando…</div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => { e.preventDefault(); enviar(); }}
      >
        <input
          placeholder="Pergunte algo sobre suas finanças…"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          disabled={enviando || !disponivel}
        />
        <button className="btn primary" disabled={enviando || !disponivel || !pergunta.trim()}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
    </>
  );
}
