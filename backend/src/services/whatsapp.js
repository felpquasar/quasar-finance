import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

// Envio de WhatsApp via whatsapp-web.js (Puppeteer + WhatsApp Web).
// Não-oficial, escolhido para a V1 conforme a arquitetura (Selenium/automação
// frágil aceitável; API oficial fica para V2). A sessão é persistida em disco
// por LocalAuth (.wwebjs_auth/) — após o 1º pareamento via QR, os jobs
// agendados enviam sozinhos.
//
// Modelo de uso: cada job sobe o client, envia e encerra (Task Scheduler roda
// 1x/dia e 1x/semana — não compensa daemon de longa duração).
//
// Config no .env:
//   WHATSAPP_DESTINO = 55DDDNUMERO (ex 5599981234567) — para quem enviar
//   WHATSAPP_AUTH_DIR = pasta da sessão (opcional; default .wwebjs_auth)

export function whatsappConfigurado() {
  return Boolean(process.env.WHATSAPP_DESTINO);
}

// Sobe o client, espera ficar pronto e devolve { client, jaPareado }.
// Em primeiro uso (sem sessão), imprime o QR no terminal para parear.
function abrirClient({ onQr } = {}) {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: process.env.WHATSAPP_AUTH_DIR || '.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      // Usa o Chrome do sistema (CHROME_PATH no .env) e evita o download do
      // Chromium bundled do puppeteer. Sem CHROME_PATH, cai no bundled.
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  return new Promise((resolve, reject) => {
    let pareou = false;
    client.on('qr', (qr) => {
      pareou = false;
      console.log('\nEscaneie o QR no WhatsApp (Aparelhos conectados):\n');
      qrcode.generate(qr, { small: true });
      if (onQr) onQr(qr);
    });
    client.on('authenticated', () => { pareou = true; });
    client.on('auth_failure', (m) => reject(new Error(`Falha de autenticação do WhatsApp: ${m}`)));
    client.on('ready', () => resolve({ client, jaPareado: pareou }));
    client.initialize().catch(reject);
  });
}

// Envia uma mensagem de texto para WHATSAPP_DESTINO (ou número informado).
// Encerra o client ao final. Lança erro se não configurado/sem sessão.
export async function enviarWhatsApp(texto, numero = process.env.WHATSAPP_DESTINO) {
  if (!numero) throw new Error('WHATSAPP_DESTINO não configurado no .env');
  const { client } = await abrirClient();
  try {
    // Resolve o número pelo WhatsApp (LID/serialized id) antes de enviar —
    // mandar direto para "<num>@c.us" quebra com "No LID for user".
    const limpo = String(numero).replace(/\D/g, '');
    const numberId = await client.getNumberId(limpo);
    if (!numberId) throw new Error(`Número ${limpo} não está no WhatsApp`);
    const msg = await client.sendMessage(numberId._serialized, texto);

    // Espera o servidor confirmar o envio (ack >= 1 = SERVER). Sem isso, o
    // destroy() abaixo fecha o browser antes de a mensagem sair de fato.
    await aguardarAck(client, msg, 20000);
  } finally {
    await client.destroy();
  }
}

// Resolve quando a mensagem é confirmada pelo servidor (ack >= 1) ou no
// timeout (fallback: espera fixa para dar tempo de o WhatsApp Web transmitir).
function aguardarAck(client, msg, timeoutMs) {
  return new Promise((resolve) => {
    let pronto = false;
    const fim = (v) => { if (!pronto) { pronto = true; client.removeListener('message_ack', onAck); resolve(v); } };
    const onAck = (m, ack) => { if (m.id?._serialized === msg.id?._serialized && ack >= 1) fim('ack'); };
    client.on('message_ack', onAck);
    if (msg.ack >= 1) fim('ack');
    setTimeout(() => fim('timeout'), timeoutMs);
  });
}

// Setup interativo: só sobe o client e mostra o QR para o 1º pareamento.
// Mantém aberto até parear; depois a sessão fica salva para os jobs.
export async function parearWhatsApp() {
  const { client } = await abrirClient();
  console.log('✓ WhatsApp pareado. Sessão salva — os jobs já podem enviar.');
  await client.destroy();
}
