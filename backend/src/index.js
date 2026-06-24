import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth.js';
import { uploadRouter } from './routes/upload.js';
import { lancamentosRouter } from './routes/lancamentos.js';
import { categoriasRouter } from './routes/categorias.js';
import { contasRouter } from './routes/contas.js';
import { pendenciasRouter } from './routes/pendencias.js';
import { resumoRouter } from './routes/resumo.js';
import { areceberRouter } from './routes/areceber.js';
import { iaRouter } from './routes/ia.js';
import { metasRouter } from './routes/metas.js';
import { recorrentesRouter } from './routes/recorrentes.js';
import { chatRouter } from './routes/chat.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);
app.use('/api/upload', uploadRouter);
app.use('/api/lancamentos', lancamentosRouter);
app.use('/api/categorias', categoriasRouter);
app.use('/api/contas', contasRouter);
app.use('/api/pendencias', pendenciasRouter);
app.use('/api/resumo', resumoRouter);
app.use('/api/areceber', areceberRouter);
app.use('/api/ia', iaRouter);
app.use('/api/metas', metasRouter);
app.use('/api/recorrentes', recorrentesRouter);
app.use('/api/chat', chatRouter);

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API financeira rodando em http://localhost:${port}`));
