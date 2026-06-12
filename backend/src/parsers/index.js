import { parseExtratoBB } from './bb.js';
import { parseExtratoMP } from './mercadopago.js';

// Um módulo parser por banco. Fatura de cartão (BB/MP/Nubank) e OCR
// de prints entram na Fase 2.
const PARSERS = {
  bb: parseExtratoBB,
  mercadopago: parseExtratoMP,
};

export function getParser(banco) {
  return PARSERS[banco] || null;
}

export const BANCOS_SUPORTADOS = Object.keys(PARSERS);
