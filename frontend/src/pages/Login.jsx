import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    if (error) setErro('E-mail ou senha inválidos');
    setCarregando(false);
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={entrar}>
        <div className="brand">
          <div className="brand-dot" />
          <div className="brand-name">
            <span className="label">Painel</span>
            <strong>Felipe</strong>
          </div>
        </div>
        {erro && <div className="erro">{erro}</div>}
        <input
          type="email" placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)} required
        />
        <input
          type="password" placeholder="Senha" value={senha}
          onChange={(e) => setSenha(e.target.value)} required
        />
        <button className="btn primary" disabled={carregando}>
          {carregando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
