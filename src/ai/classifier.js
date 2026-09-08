'use strict';

// ─── System prompt exacto de la especificación ──────────────────────────────
const SYSTEM_PROMPT = `Eres Notip, el segundo cerebro personal y mascota flotante con IA de un estudiante de ingeniería de sistemas. Tu labor es clasificar y mejorar las notas rápidas, ideas y tareas que el usuario te comparte durante su día (en clases, programando, etc.).

Dado el texto que te llega, responde ÚNICAMENTE con un objeto JSON válido,
sin texto adicional antes ni después, sin bloques de código markdown.

El JSON debe tener esta forma exacta:
{
  "tipo": "tarea" | "idea" | "nota",
  "texto_reescrito": string,
  "titulo_corto": string (máximo 6 palabras),
  "descripcion": string o null,
  "curso": string o null,
  "fecha_entrega": string en formato YYYY-MM-DD o null,
  "hora_entrega": string en formato HH:MM o null,
  "prioridad": "alta" | "media" | "normal",
  "es_modificacion_de_anterior": boolean,
  "mensaje_feedback": string,
  "conexiones_sugeridas": string[],
  "tags": string[]
}

Reglas de clasificación:
- "es_modificacion_de_anterior": Si se proporciona contexto de una nota/tarea previa: pon true SOLO si el usuario está pidiendo modificar, corregir, actualizar o hacer preguntas sobre esa nota previa (ej. "cámbialo a las 4pm", "ponle que es urgente", "agrega que lleve el cargador"). Si el usuario está escribiendo una nota o tarea NUEVA e independiente sobre otro tema, pon false. Si no hay contexto previo, pon false.
- IDENTIDAD DE NOTIP: Si el usuario te habla en segunda persona diciendo cosas como "agregarte una mejora", "conectarte con Google Calendar", "ayúdame a recordar", se está dirigiendo a TI (Notip). En el título corto y en el texto reescrito deja claro que es para Notip (ejemplo: "Integrar Google Calendar en Notip" o "Mejora para Notip: sincronización de eventos"), NUNCA digas "otra aplicación de notas" ni hables como si fueras un tercero ajeno.
- "tipo": "tarea" si es cualquier acción a realizar, to-do, entrega, arreglo o actividad pendiente concreta (verbos como "mejorar", "hacer", "arreglar", "estudiar", "entregar"). "idea" si es un concepto creativo de negocio o proyecto. "nota" si es un apunte o información estática.
- "descripcion": Si el texto incluye detalles específicos, contexto, especificaciones técnicas, descansos, lugares o aclaraciones (ej. "en la hora de descanso a las 11 am", "reunión en la sala B"), redacta una descripción breve (1 a 2 oraciones). Si no hay detalles más allá del título, pon null.
- "hora_entrega": Si menciona una hora específica (ej. "a las 11am", "11:00 am", "3pm", "18:00"), extráela en formato militar 24h "HH:MM" (ej. "11:00", "15:00"). Si no hay hora, pon null.
- "fecha_entrega": Si menciona fechas relativas ("hoy", "mañana", "el viernes", "este lunes"), calcula la fecha en formato YYYY-MM-DD respecto a la fecha actual de referencia. Si no hay fecha, pon null.
- "prioridad": Si es una "tarea", evalúa la urgencia:
  * "alta": si contiene palabras como "urgente", "ya", "hoy", "examen mañana", "crítico", "prioridad alta", o fecha límite en las próximas 24 horas.
  * "media": si tiene fecha límite próxima en esta semana, entregas importantes o reuniones clave.
  * "normal": tareas habituales, compras cotidianas, lecturas o pendientes sin urgencia inmediata. (Para "idea" o "nota" devuelve "normal").
- "curso": Si es académico pon la materia/curso (ej. "Cálculo", "Física", "Inteligencia Financiera"). Si es de trabajo pon "Trabajo" o el proyecto/empresa. Si es personal pon "Personal" (ej. compras, gym, salud). Si no aplica o no hay contexto pon null.
- "mensaje_feedback": OBLIGATORIO. Una respuesta breve, cálida, personalizada e inteligente directamente relacionada con lo que el usuario escribió (máximo 1 o 2 oraciones). Debe confirmar lo que se guardó específicamente y añadir un comentario o consejo útil y relevante sobre el tema (ej. "¡Genial! Anoté la integración de Google Calendar en Notip. ¡Será súper útil para tener tus fechas sincronizadas!", o "Anotada tu tarea de Redes para el viernes a las 11:00 am.").
- "tags": Arreglo de 1 a 4 etiquetas temáticas en minúsculas sin espacios (ej. ["notip", "google-calendar"], ["alexa", "echo-dot"], ["aimly", "startup"]).
- "conexiones_sugeridas": Si se proporcionan notas existentes del vault y este texto guarda relación DIRECTA Y EVIDENTE con alguna de ellas (ejemplo: notas del mismo ecosistema como "Alexa" con "Echo Dot 5", o del mismo curso/herramienta), incluye aquí los títulos exactos. NO conectes temas no relacionados (por ejemplo, Aimly con Alexa o con Calendar). Si no hay relación evidente, retorna [].
- Reescribe el texto de forma clara y concisa, corrigiendo gramática, pero sin inventar información que no esté en el texto original.`;

/**
 * Llama a Claude Haiku 4.5 y retorna la clasificación como objeto JS.
 * Si el JSON viene malformado, devuelve un fallback seguro en vez de lanzar.
 * @param {string} texto          - Texto crudo del usuario
 * @param {string} apiKey         - API key de Anthropic
 * @param {string} [forcedType]   - Tipo forzado por el usuario si hizo clic en un chip
 * @param {object} [contextoPrevio]- Contexto de la nota/chat previa si el usuario continúa la conversación
 * @param {Array}  [notasExistentes]- Títulos y tipos de notas existentes en el vault
 * @returns {Promise<object>}
 */
async function clasificarNota(texto, apiKey, forcedType = null, contextoPrevio = null, notasExistentes = []) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey });

  const now = new Date();
  const hoyStr = now.toISOString().split('T')[0];
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaSemana = diasSemana[now.getDay()];
  const fechaReferencia = `[FECHA ACTUAL DE REFERENCIA: ${hoyStr} (${diaSemana})]`;

  let userPrompt = '';
  if (contextoPrevio) {
    userPrompt = `${fechaReferencia}\n[CONTINUACIÓN DE LA CONVERSACIÓN - NOTA O TAREA PREVIA]
Título previo: "${contextoPrevio.titulo || 'Nota'}" (tipo: ${contextoPrevio.tipo || 'nota'})
Contenido previo: "${contextoPrevio.texto || ''}"
${contextoPrevio.curso ? `Curso: ${contextoPrevio.curso}` : ''}
${contextoPrevio.fecha_entrega ? `Fecha actual de entrega: ${contextoPrevio.fecha_entrega}` : ''}

El usuario ahora escribe en el mismo chat:
"${texto}"

INSTRUCCIONES CLAVE:
1. Si el usuario pide cambiar, modificar o corregir algo (ej. "cámbialo para el viernes", "cambia de lugar para el parque y no en la universidad", "ponle que es de Matemáticas"):
   - Actualiza "texto_reescrito" reflejando el nuevo lugar, tema o requerimiento.
   - Si cambia fecha (ej. "para el viernes"), calcula la nueva "fecha_entrega" en formato YYYY-MM-DD respecto a hoy (${hoyStr}).
   - Actualiza "titulo_corto" si es necesario.
   - En "mensaje_feedback", confirma con claridad, calidez y precisión el cambio realizado.
2. Si el usuario hace una pregunta o pide tips/comandos técnicos:
   - Responde de forma muy útil y didáctica en "mensaje_feedback" manteniendo los datos previos en el resto de campos.
3. Si el usuario añade más requerimientos:
   - Enriquecer "texto_reescrito" combinando lo anterior con lo nuevo.`;
  } else if (forcedType && ['tarea', 'idea', 'nota'].includes(forcedType)) {
    userPrompt = `${fechaReferencia}\n[IMPORTANTE: Clasifica esta entrada obligatoriamente como tipo "${forcedType}"]\n\nTexto:\n${texto}`;
  } else {
    userPrompt = `${fechaReferencia}\nTexto:\n${texto}`;
  }

  // Si hay notas existentes en el vault, adjuntarlas para permitir vincular temas hermanos
  if (notasExistentes && notasExistentes.length > 0) {
    const listado = notasExistentes
      .slice(0, 30) // limitar a 30 notas más recientes
      .map(n => `- "${n.titulo || n.filename}" (tipo: ${n.tipo || 'nota'}${n.tags?.length ? `, tags: ${n.tags.join(', ')}` : ''})`)
      .join('\n');
    userPrompt += `\n\n[NOTAS EXISTENTES EN EL VAULT PARA BUSCAR AFINIDAD/CONEXIÓN]:\n${listado}\nSi el texto anterior comparte temática o tecnología con alguna de estas notas (ejemplo: Alexa ↔ Echo Dot 5, Calendar ↔ Calendario), agrega el título exacto en "conexiones_sugeridas".`;
  }

  const response = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userPrompt }],
  });

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : rawText;
    const parsed = JSON.parse(jsonString);
    
    // Sanitize tipo
    if (!['tarea', 'idea', 'nota'].includes(parsed.tipo)) {
      parsed.tipo = contextoPrevio?.tipo || 'nota';
    }
    // Sanitize prioridad
    if (!['alta', 'media', 'normal'].includes(parsed.prioridad)) {
      parsed.prioridad = contextoPrevio?.prioridad || 'normal';
    }
    // Sanitize descripcion
    if (typeof parsed.descripcion !== 'string' || !parsed.descripcion.trim()) {
      parsed.descripcion = parsed.texto_reescrito && parsed.texto_reescrito !== parsed.titulo_corto ? parsed.texto_reescrito : null;
    } else {
      parsed.descripcion = parsed.descripcion.trim();
    }
    // Sanitize hora_entrega
    if (typeof parsed.hora_entrega !== 'string' || !parsed.hora_entrega.trim()) {
      parsed.hora_entrega = null;
    } else {
      parsed.hora_entrega = parsed.hora_entrega.trim();
    }
    if (!parsed.mensaje_feedback) {
      parsed.mensaje_feedback = `Guardado: "${parsed.titulo_corto || texto.slice(0, 30)}"`;
    }
    if (!Array.isArray(parsed.conexiones_sugeridas)) {
      parsed.conexiones_sugeridas = [];
    }
    if (!Array.isArray(parsed.tags)) {
      parsed.tags = [];
    }
    parsed.es_modificacion_de_anterior = Boolean(contextoPrevio && parsed.es_modificacion_de_anterior);
    return parsed;
  } catch (err) {
    console.error('[classifier] Parse error:', err.message, 'Raw text:', rawText);
    // JSON malformado → no perder la nota del usuario
    return {
      tipo:                contextoPrevio?.tipo || 'nota',
      texto_reescrito:     texto,
      titulo_corto:        texto.slice(0, 40),
      descripcion:         texto,
      curso:               contextoPrevio?.curso || null,
      fecha_entrega:       contextoPrevio?.fecha_entrega || null,
      hora_entrega:        null,
      prioridad:           contextoPrevio?.prioridad || 'normal',
      mensaje_feedback:    `Anotado: "${texto.slice(0, 35)}..."`,
      conexiones_sugeridas: [],
      tags:                [],
      error_clasificacion: true,
    };
  }
}

/**
 * Reintenta la clasificación con espera progresiva (1s → 2s → 4s).
 * Solo reintenta en rate-limit (429) o errores de servidor (5xx).
 */
async function clasificarConReintentos(texto, apiKey, forcedType = null, contextoPrevio = null, notasExistentes = [], maxRetries = 3) {
  const delays = [1000, 2000, 4000];
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await clasificarNota(texto, apiKey, forcedType, contextoPrevio, notasExistentes);
    } catch (err) {
      lastError = err;

      const status = err?.status ?? err?.statusCode ?? 0;
      const isRetryable = status === 429 || (status >= 500 && status < 600);

      if (!isRetryable || i === maxRetries - 1) break;

      await new Promise(resolve => setTimeout(resolve, delays[i]));
    }
  }

  throw lastError;
}

/**
 * Analiza todo el conjunto de notas del vault con IA para descubrir conexiones cruzadas.
 * Retorna pares de notas conectables con su explicación.
 * @param {Array} notas - Lista de notas del vault
 * @param {string} apiKey
 * @returns {Promise<Array<{ origen: string, destino: string, motivo: string }>>}
 */
async function descubrirConexionesGlobales(notas, apiKey) {
  if (!notas || notas.length < 2) return [];

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey });

  const resumenNotas = notas.map((n, idx) => ({
    id: n.filename,
    titulo: n.titulo || n.filename,
    tipo: n.tipo || 'nota',
    tags: n.tags || [],
    extracto: (n.content || '').slice(0, 140).replace(/\n+/g, ' '),
  }));

  const prompt = `Analiza estas notas del segundo cerebro de un estudiante (Notip) e identifica ÚNICAMENTE las parejas que guarden una relación directa, concreta y evidente (por ejemplo: notas que pertenezcan al mismo dispositivo o ecosistema como Alexa / Echo Dot, o a la misma herramienta de calendario).

REGLAS ESTRICTAS DE CONEXIÓN:
1. Conecta notas SOLO si tratan del mismo ecosistema, dispositivo o proyecto específico.
2. NUNCA conectes notas solo porque ambas mencionen palabras comunes de desarrollo o tareas (como "mejorar", "proyecto", "optimizar", "app" o "tarea"). Por ejemplo: un proyecto de software como "Aimly" NO debe conectarse con "Echo Dot 5" ni con "Google Calendar", a menos que el texto diga explícitamente que se integran.
3. Si no estás 100% seguro de que dos notas están directamente emparentadas, NO las conectes.

NOTAS:
${JSON.stringify(resumenNotas, null, 2)}

Responde ÚNICAMENTE con un JSON con esta estructura exacta:
{
  "conexiones": [
    {
      "origenId": "nombre_archivo_1.md",
      "destinoId": "nombre_archivo_2.md",
      "motivo": "Explicación breve de 5 a 10 palabras sobre por qué están relacionadas"
    }
  ]
}
Si no hay notas con relación directa, retorna { "conexiones": [] }.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const rawText = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    return Array.isArray(parsed?.conexiones) ? parsed.conexiones : [];
  } catch (err) {
    console.error('[classifier] Error parsing global connections:', err);
    return [];
  }
}

/**
 * Detecta si hay una API key real configurada.
 * @param {string} [apiKey]
 * @returns {boolean}
 */
function tieneApiKey(apiKey) {
  return !!(apiKey && apiKey.trim() && apiKey !== 'tu_api_key_aqui');
}

module.exports = { clasificarConReintentos, descubrirConexionesGlobales, tieneApiKey };
