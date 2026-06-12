import { Router } from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { supabase } from '../supabase.js';
import { ingestExtrato } from '../services/ingest.js';

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
    const resultado = await ingestExtrato({
      userId: req.user.id,
      conta,
      textoPdf: pdf.text,
      nomeArquivo: req.file.originalname,
    });

    res.json(resultado);
  } catch (e) {
    console.error('Erro no upload:', e);
    res.status(500).json({ erro: e.message || 'Falha ao processar arquivo' });
  }
});
