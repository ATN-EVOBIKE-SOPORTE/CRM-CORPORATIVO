import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { generateClientFollowUp } from './services/geminiService.js';

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/clients/ai-follow-up', async (req, res) => {
  try {
    const recommendation = await generateClientFollowUp(req.body);
    res.status(200).json(recommendation);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno.';
    const clientError = /obligatorio|debe ser|Se requiere/.test(message);
    console.error('AI follow-up error:', message);
    res.status(clientError ? 400 : 502).json({ error: message });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.listen(port, () => {
  console.log('Evobike AI API listening on port ' + port);
});
