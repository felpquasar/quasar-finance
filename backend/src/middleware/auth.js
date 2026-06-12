import { supabase } from '../supabase.js';

// Valida o JWT do Supabase enviado pelo frontend e anexa req.user
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Token ausente' });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
  req.user = data.user;
  next();
}
