import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { supabase } from '../supabase.js';
import { ingestExtrato, ingestLancamentos } from '../services/ingest.js';
import { iaDisponivel, ocrExtratoPdf, ocrFaturaPdf } from '../services/ia.js';

// "yyyy-mm-01" do mês de competência da fatura (a partir do vencimento).
function mesRefDeVencimento(vencimento) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(vencimento || '') ? new Date(vencimento) : new Date();
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-01`;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
export const uploadRouter = Router();

// POST /api/upload  (multipart: arquivo=PDF, conta_id)
uploadRouter.post('/', upload.single('arquivo'), async (req, res) => {
  try {
    const { conta_id } = req.body;
    if (!req.file) return res.status(400).json({ erro: 'Arquivo ausente' });
    if (!conta_id) return res.status(400).json({ erro: 'conta_id ausente' });

    const { data: conta, error } = await supabase
      .from('contas')
      .select('*')
      .eq('id', conta_id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !conta) return res.status(404).json({ erro: 'Conta não encontrada' });

    const pdf = await pdfParse(req.file.buffer);
    const temTexto = pdf.text.replace(/\s/g, '').length > 50;

    let resultado;
    if (conta.tipo === 'cartao') {
      // Fatura de cartão: sempre via OCR (extrai parcelas e fecha pelo total).
      if (!iaDisponivel()) {
        return res.status(422).json({ erro: 'Fatura de cartão requer ANTHROPIC_API_KEY no backend (OCR).' });
      }
      const { lancamentos, pendencias, vencimento } = await ocrFaturaPdf({
        pdfBuffer: req.file.buffer,
        banco: conta.banco,
      });
      resultado = await ingestLancamentos({
        userId: req.user.id,
        conta,
        brutos: lancamentos,
        pendencias,
        nomeArquivo: req.file.originalname,
        origem: 'fatura',
        mesRefFatura: mesRefDeVencimento(vencimento),
      });
      resultado.ocr = true;
      resultado.fatura = true;
      resultado.vencimento = vencimento;
    } else if (temTexto) {
      resultado = await ingestExtrato({
        userId: req.user.id,
        conta,
        textoPdf: pdf.text,
        nomeArquivo: req.file.originalname,
      });
    } else if (iaDisponivel()) {
      // PDF sem camada de texto (ex: app do BB exporta imagem) -> OCR via IA
      const { lancamentos, pendencias } = await ocrExtratoPdf({
        pdfBuffer: req.file.buffer,
        banco: conta.banco,
      });
      resultado = await ingestLancamentos({
        userId: req.user.id,
        conta,
        brutos: lancamentos,
        pendencias,
        nomeArquivo: req.file.originalname,
      });
      resultado.ocr = true;
    } else {
      return res.status(422).json({
        erro: 'PDF sem texto (imagem). OCR requer ANTHROPIC_API_KEY no backend.',
      });
    }

    res.json(resultado);
  } catch (e) {
    console.error('Erro no upload:', e);
    res.status(500).json({ erro: e.message || 'Falha ao processar arquivo' });
  }
});
