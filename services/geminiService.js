import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3.6-flash';

const responseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumen ejecutivo breve del estado comercial del cliente.' },
    nextAction: { type: 'string', description: 'Una única acción concreta y priorizada para el vendedor.' },
    suggestedEmailDraft: { type: 'string', description: 'Correo personalizado en español, listo para enviar.' },
    urgencyLevel: { type: 'string', enum: ['BAJA', 'MEDIA', 'ALTA'], description: 'Urgencia comercial basada en etapa, nota y días inactivo.' }
  },
  required: ['summary', 'nextAction', 'suggestedEmailDraft', 'urgencyLevel'],
  additionalProperties: false
};

let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function cleanText(value, field, maxLength = 2000) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error(field + ' debe ser texto.');
  return value.trim().slice(0, maxLength);
}

function normalizeLead(lead) {
  if (!lead || typeof lead !== 'object') throw new Error('Se requiere la información del cliente.');
  const name = cleanText(lead.name, 'name', 200);
  if (!name) throw new Error('name es obligatorio.');
  const daysInactive = Number(lead.daysInactive ?? 0);
  if (!Number.isFinite(daysInactive) || daysInactive < 0 || daysInactive > 3650) {
    throw new Error('daysInactive debe ser un número entre 0 y 3650.');
  }
  return {
    name,
    company: cleanText(lead.company, 'company', 200) || 'No especificada',
    funnelStage: cleanText(lead.funnelStage, 'funnelStage', 100) || 'Nuevo',
    lastNote: cleanText(lead.lastNote, 'lastNote') || 'Sin nota registrada',
    daysInactive: Math.floor(daysInactive)
  };
}

function validateResult(result) {
  const urgencyLevels = new Set(['BAJA', 'MEDIA', 'ALTA']);
  if (!result || typeof result !== 'object' || !urgencyLevels.has(result.urgencyLevel)) {
    throw new Error('Gemini devolvió una respuesta con formato no válido.');
  }
  for (const key of ['summary', 'nextAction', 'suggestedEmailDraft']) {
    if (typeof result[key] !== 'string' || !result[key].trim()) {
      throw new Error('Gemini devolvió una respuesta incompleta.');
    }
  }
  return {
    summary: result.summary.trim(),
    nextAction: result.nextAction.trim(),
    suggestedEmailDraft: result.suggestedEmailDraft.trim(),
    urgencyLevel: result.urgencyLevel
  };
}
function parseJsonResponse(text) {
  const fence = String.fromCharCode(96).repeat(3);
  let normalized = String(text).trim();
  if (normalized.startsWith(fence)) normalized = normalized.slice(fence.length).replace(/^json\s*/i, '').trim();
  if (normalized.endsWith(fence)) normalized = normalized.slice(0, -fence.length).trim();
  try {
    return JSON.parse(normalized);
  } catch (firstError) {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(normalized.slice(start, end + 1));
    throw firstError;
  }
}

export async function generateClientFollowUp(lead) {
  const clientData = normalizeLead(lead);
  const prompt = [
    'Analiza este cliente de un CRM de distribuidores Evobike y responde únicamente con el JSON solicitado.',
    'Datos del cliente:',
    JSON.stringify(clientData, null, 2),
    '',
    'Criterios:',
    '- Escribe en español mexicano, directo y profesional.',
    '- summary: máximo 70 palabras.',
    '- nextAction: una acción concreta y ejecutable hoy.',
    '- suggestedEmailDraft: correo breve, personalizado, con asunto incluido.',
    '- urgencyLevel: BAJA, MEDIA o ALTA. Usa ALTA cuando requiera seguimiento inmediato.'
  ].join('\n');

  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      maxOutputTokens: 700
    }
  });

  if (!response.text) throw new Error('Gemini no devolvió contenido.');
  try {
    return validateResult(parseJsonResponse(response.text));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Gemini devolvió JSON inválido.');
    throw error;
  }
}
