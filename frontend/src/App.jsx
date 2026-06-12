import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase } from './supabase.js';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Lancamentos from './pages/Lancamentos.jsx';
import Revisar from './pages/Revisar.jsx';
import Categorias from './pages/Categorias.jsx';

const ICONES = {
  visao: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  lancamentos: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" /><circle cx="4" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" />
    </svg>
  ),
  revisar: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9" />
    </svg>
  ),
  categorias: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 12l9 4 9-4" /><path d="M3 17l9 4 9-4" />
    </svg>
  ),
  upload: (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </svg>
  ),
};

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const carregarBadge = useCallback(async () => {
    try {
      const r = await api('/resumo');
      setBadge((r.revisao_pendente || 0) + (r.pendencias_abertas || 0));
    } catch {
      /* badge é cosmético; não bloqueia o app */
    }
  }, []);

  useEffect(() => {
    if (!sessao) return;
    carregarBadge();
    window.addEventListener('dados-mudaram', carregarBadge);
    return () => window.removeEventListener('dados-mudaram', carregarBadge);
  }, [sessao, carregarBadge]);

  if (sessao === undefined) return null;
  if (!sessao) return <Login />;

  return (
    <>
      <nav className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div className="brand-name">
            <span className="label">Painel</span>
            <strong>Felipe</strong>
          </div>
        </div>

        <NavLink to="/" end className="nav-item">{ICONES.visao}Visão geral</NavLink>
        <NavLink to="/lancamentos" className="nav-item">{ICONES.lancamentos}Lançamentos</NavLink>
        <NavLink to="/revisar" className="nav-item">
          {ICONES.revisar}Revisar
          {badge > 0 && <span className="nav-badge">{badge}</span>}
        </NavLink>
        <NavLink to="/categorias" className="nav-item">{ICONES.categorias}Categorias</NavLink>
        <NavLink to="/upload" className="nav-item">{ICONES.upload}Subir extratos</NavLink>

        <div className="sidebar-meta">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#1f2733" strokeWidth="5" />
            <circle
              cx="22" cy="22" r="18" fill="none" stroke="#3ce28b" strokeWidth="5"
              strokeDasharray="113" strokeDashoffset="113" strokeLinecap="round"
              transform="rotate(-90 22 22)"
            />
          </svg>
          <div>
            <span className="label">Reserva</span>
            <span className="num">R$ 0,00</span>
          </div>
        </div>
        <button className="sair" onClick={() => supabase.auth.signOut()}>Sair →</button>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/revisar" element={<Revisar />} />
          <Route path="/categorias" element={<Categorias />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </>
  );
}
