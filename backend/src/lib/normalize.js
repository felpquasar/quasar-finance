import crypto from 'node:crypto';

// Normaliza descrição para dedup e casamento de regras:
// minúsculas, sem acento, sem datas embutidas, sem pontuação, espaços únicos.
export function normalizarDescricao(descricao) {
  return String(descricao)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\d{2}\/\d{2}(\/\d{2,4})?/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chave de deduplicação: conta + data + valor + descrição normalizada
// (+ id externo do banco, quando o extrato fornece — ex: ID de operação MP).
// Permite subir o mesmo arquivo 2x ou semanas acumuladas sem duplicar.
export function hashDedup({ contaId, data, valor, descricaoNormalizada, idExterno }) {
  return crypto
    .createHash('sha256')
    .update(`${contaId}|${data}|${Number(valor).toFixed(2)}|${descricaoNormalizada}|${idExterno || ''}`)
    .digest('hex');
}

// "1.234,56" -> 1234.56
export function parseValorBR(str) {
  const limpo = String(str).replace(/[^\d.,-]/g, '');
  const negativo = /-/.test(String(str));
  const num = parseFloat(limpo.replace(/-/g, '').replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(num)) return null;
  return negativo ? -num : num;
}

// "dd/mm/yyyy" ou "dd-mm-yyyy" -> "yyyy-mm-dd"
export function parseDataBR(str) {
  const m = String(str).match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
