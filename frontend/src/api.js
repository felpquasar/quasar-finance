import { supabase } from './supabase.js';

async function token() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token;
}

export async function api(path, { method = 'GET', body, formData } = {}) {
  const headers = { Authorization: `Bearer ${await token()}` };
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: formData || (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.erro || `Erro ${res.status}`);
  return json;
}

// Notifica o shell (badge da sidebar) que dados mudaram
export function notificarMudanca() {
  window.dispatchEvent(new Event('dados-mudaram'));
}

export const fmt = (v) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
