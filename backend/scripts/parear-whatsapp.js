import 'dotenv/config';
import { parearWhatsApp } from '../src/services/whatsapp.js';

// 1º uso: pareia o WhatsApp escaneando o QR (WhatsApp > Aparelhos conectados).
// Depois a sessão fica salva em .wwebjs_auth/ e os jobs enviam sozinhos.
// Uso: node scripts/parear-whatsapp.js
await parearWhatsApp();
process.exit(0);
