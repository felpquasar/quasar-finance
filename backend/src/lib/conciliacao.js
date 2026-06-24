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

// Classifica as recorrentes do mês em pagas (conciliadas no extrato) e a
// vencer. recorrentes: [{ nome, dia_vencimento, valor_estimado, ... }];
// saidasDoMes: valores POSITIVOS dos gastos do mês (ótica do Felipe).
// Cada saída casa no máximo uma recorrente; tolerância conservadora.
export function classificarRecorrentes(recorrentes, saidasDoMes) {
  const saidas = (saidasDoMes || []).map((v) => Math.abs(Number(v)));
  const usado = new Array(saidas.length).fill(false);
  const pagas = [];
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
    if (casa >= 0) { usado[casa] = true; pagas.push(r); }
    else aVencer.push(r);
  }
  return { pagas, aVencer };
}

// Atalho: só as recorrentes ainda não pagas (base da projeção).
export function recorrentesAVencer(recorrentes, saidasDoMes) {
  return classificarRecorrentes(recorrentes, saidasDoMes).aVencer;
}

// Soma do valor estimado de uma lista de recorrentes (ignora as sem valor).
export function somaRecorrentes(recorrentes) {
  return (recorrentes || []).reduce((s, r) => s + (Number(r.valor_estimado) || 0), 0);
}
