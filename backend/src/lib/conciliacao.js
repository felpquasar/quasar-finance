// Conciliação leve de recorrentes contra o extrato do mês.
//
// Uma recorrente é considerada PAGA no mês quando existe uma saída (gasto)
// cujo valor casa o estimado dentro de uma tolerância. O casamento é só por
// VALOR — o nome da recorrente ("Casa", "Celular") não bate com a descrição
// do extrato ("Pix enviado ...", "Débito ..."), então valor é o sinal viável.
//
// Conservador de propósito: tolerância apertada e cada saída casa no máximo
// uma recorrente. Em dúvida, a recorrente fica "a vencer" — melhor a projeção
// superestimar o gasto do que esconder uma conta certa do mês.

// Retorna as recorrentes do mês ainda NÃO pagas (a vencer) — base da projeção.
// recorrentes: [{ nome, dia_vencimento, valor_estimado, ... }]
// saidasDoMes: valores POSITIVOS dos gastos do mês (já na ótica do Felipe).
export function recorrentesAVencer(recorrentes, saidasDoMes) {
  const saidas = (saidasDoMes || []).map((v) => Math.abs(Number(v)));
  const usado = new Array(saidas.length).fill(false);
  const aVencer = [];

  for (const r of recorrentes || []) {
    const alvo = Number(r.valor_estimado);
    if (!alvo) {
      // sem valor estimado não há como conciliar — mantém como a vencer
      aVencer.push(r);
      continue;
    }
    const tol = Math.max(alvo * 0.1, 2); // ±10% ou ±R$2, o maior
    let casa = -1;
    for (let i = 0; i < saidas.length; i++) {
      if (!usado[i] && Math.abs(saidas[i] - alvo) <= tol) { casa = i; break; }
    }
    if (casa >= 0) usado[casa] = true; // paga: não entra na projeção
    else aVencer.push(r);
  }
  return aVencer;
}

// Soma do valor estimado de uma lista de recorrentes (ignora as sem valor).
export function somaRecorrentes(recorrentes) {
  return (recorrentes || []).reduce((s, r) => s + (Number(r.valor_estimado) || 0), 0);
}
