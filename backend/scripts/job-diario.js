import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { alertasVencimento } from '../src/services/mensagens.js';
import { enviarWhatsApp, whatsappConfigurado } from '../src/services/whatsapp.js';

// Job diário: alerta de vencimentos próximos (recorrentes, contas avulsas,
// repasses da família). Não envia nada se não há vencimento na janela.
// Agendar no Task Scheduler (Windows) p/ rodar 1x/dia de manhã.
// Uso manual: node scripts/job-diario.js [--dry]
const dry = process.argv.includes('--dry');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await supabase.auth.signInWithPassword({
  email: process.env.SEED_EMAIL,
  password: process.env.SEED_PASSWORD,
});
if (error) throw error;

const texto = await alertasVencimento(auth.user.id);
if (!texto) {
  console.log('Nenhum vencimento na janela — nada a enviar.');
  process.exit(0);
}
console.log(texto);

if (dry || !whatsappConfigurado()) {
  console.log(`\n[${dry ? '--dry' : 'WHATSAPP_DESTINO ausente'}] não enviado.`);
  process.exit(0);
}
await enviarWhatsApp(texto);
console.log('\n✓ Alertas enviados no WhatsApp.');
process.exit(0);
