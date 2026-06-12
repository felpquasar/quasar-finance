// Verificação visual: faz login no app real e tira screenshots das telas.
// Uso: node scripts/verificar-ui.mjs  (lê credenciais do ../backend/.env)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(here, '../../backend/.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const BASE = 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const erros = [];
page.on('pageerror', (e) => erros.push(e.message));

await page.goto(BASE);
await page.fill('input[type=email]', env.SEED_EMAIL);
await page.fill('input[type=password]', env.SEED_PASSWORD);
await page.click('button');
await page.waitForSelector('.sidebar', { timeout: 10000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: join(here, 'shot-dashboard.png') });

for (const [rota, nome] of [['/lancamentos', 'lancamentos'], ['/revisar', 'revisar'], ['/upload', 'upload'], ['/categorias', 'categorias']]) {
  await page.goto(BASE + rota);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(here, `shot-${nome}.png`) });
}

console.log('Erros de página:', erros.length === 0 ? 'nenhum ✓' : erros.join(' | '));
await browser.close();
