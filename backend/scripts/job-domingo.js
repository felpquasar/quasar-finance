import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { resumoSemanal } from '../src/services/mensagens.js';
import { enviarWhatsApp, whatsappConfigurado } from '../src/services/whatsapp.js';

// Job de domingo: monta o resumo da semana e envia no WhatsApp.
// Agendar no Task Scheduler (Windows) p/ rodar domingo de manhã.
// Uso manual: node scripts/job-domingo.js [--dry]
const dry = process.argv.includes('--dry');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: auth, error } = await supabase.auth.signInWithPassword({
  email: process.env.SEED_EMAIL,
  password: process.env.SEED_PASSWORD,
});
if (error) throw error;

const texto = await resumoSemanal(auth.user.id);
console.log(texto);

if (dry || !whatsappConfigurado()) {
  console.log(`\n[${dry ? '--dry' : 'WHATSAPP_DESTINO ausente'}] não enviado.`);
  process.exit(0);
}
await enviarWhatsApp(texto);
console.log('\n✓ Resumo enviado no WhatsApp.');
process.exit(0);
