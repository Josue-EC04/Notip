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
- "titulo_corto": OBLIGATORIO. TÍTULO SINTETIZADO, LIMPIO Y PROFESIONAL (máximo 5 palabras), ideal para eventos de Google Calendar y títulos de notas. NUNCA copies frases incompletas ni recortes palabras al azar (ejemplo: NO pongas "Tengo una reunion mañana a las", pon "Reunión de Redes"; NO pongas "este jueves inicia una pequeña hackaton", pon "Hackatón"). Elimina muletillas como "tengo que", "inicia una", "a las 6pm", "mañana".
- "tipo": Si el texto menciona un evento, reunión, hackatón, clase, examen, entrega, to-do o tiene fecha/hora, SIEMPRE clasifícalo como "tarea" para habilitar su sincronización con Google Calendar. "idea" si es un concepto creativo o de negocio. "nota" sólo para información estática sin acciones.
- "es_modificacion_de_anterior": Si se proporciona contexto de una nota/tarea previa: pon true SOLO si el usuario está pidiendo modificar, corregir, actualizar o hacer preguntas sobre esa nota previa (ej. "cámbialo a las 4pm", "ponle que es urgente", "agrega que lleve el cargador"). Si el usuario está escribiendo una nota o tarea NUEVA e independiente sobre otro tema, pon false. Si no hay contexto previo, pon false.
- "IDENTIDAD DE NOTIP": Si el usuario te habla en segunda persona diciendo cosas como "agregarte una mejora", "conectarte con Google Calendar", "ayúdame a recordar", se está dirigiendo a TI (Notip). En el título corto y en el texto reescrito deja claro que es para Notip (ejemplo: "Integrar Google Calendar en Notip"), NUNCA digas "otra aplicación de notas" ni hables como si fueras un tercero ajeno.
- "descripcion": Si el texto incluye detalles específicos, contexto, especificaciones técnicas, lugares o aclaraciones, redacta una descripción breve (1 a 2 oraciones). Si no hay detalles más allá del título, pon null.
- "hora_entrega": Si menciona una hora específica (ej. "a las 6 pm", "8pm", "11am", "11:00 am", "18:00"), extráela en formato militar 24h "HH:MM" (ej. "18:00", "20:00"). Si no hay hora, pon null.
- "fecha_entrega": Si menciona fechas relativas ("hoy", "mañana", "este jueves", "el viernes", "este lunes"), calcula la fecha en formato YYYY-MM-DD respecto a la fecha actual de referencia. Si no hay fecha, pon null.
- "prioridad": Si es una "tarea", evalúa la urgencia:
  * "alta": si contiene palabras como "urgente", "ya", "hoy", "examen mañana", "crítico", "prioridad alta", o fecha límite en las próximas 24 horas.
  * "media": si tiene fecha límite próxima en esta semana, entregas importantes o reuniones clave.
  * "normal": tareas habituales, compras cotidianas, lecturas o pendientes sin urgencia inmediata. (Para "idea" o "nota" devuelve "normal").
- "curso": Si es académico pon la materia/curso (ej. "Cálculo", "Física", "Inteligencia Financiera", "Redes"). Si es de trabajo pon "Trabajo". Si es personal pon "Personal". Si no aplica o no hay contexto pon null.
- "mensaje_feedback": OBLIGATORIO (TIP DE NOTIP). Una respuesta cálida, personalizada, inteligente y con un consejo práctico directo sobre el tema (máximo 2 oraciones). Confirma el evento/fecha/hora y añade una recomendación útil (ej. "¡Hackatón agendada para el jueves a las 6:00 PM! Tip: Define previamente los roles y arquitectura con tu equipo para iniciar con ventaja.", o "¡Reunión sobre Redes agendada para mañana a las 8:00 PM! Tip: Ten listos los diagramas y notas previas para aprovechar al máximo la sesión.").
- "tags": Arreglo de 1 a 4 etiquetas temáticas en minúsculas sin espacios (ej. ["redes", "reunion"], ["hackaton", "programacion"]).
- "conexiones_sugeridas": Si se proporcionan notas existentes del vault y este texto guarda relación DIRECTA Y EVIDENTE con alguna de ellas, incluye aquí los títulos exactos. Si no hay relación evidente, retorna [].
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
function toLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function clasificarNota(texto, apiKey, forcedType = null, contextoPrevio = null, notasExistentes = []) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic.default({ apiKey });

  const now = new Date();
  const hoyStr = toLocalDateString(now);
  const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaSemana = diasSemana[now.getDay()];
  const fechaReferencia = `[FECHA ACTUAL DE REFERENCIA: ${hoyStr} (${diaSemana})]`;

  let userPrompt = '';
  const forcedInstruction = (forcedType && ['tarea', 'idea', 'nota'].includes(forcedType))
    ? `\n[IMPORTANTE: El usuario ha seleccionado explícitamente la categoría "${forcedType}". Clasifícala obligatoriamente como tipo "${forcedType}"]\n`
    : '';

  if (contextoPrevio) {
    userPrompt = `${fechaReferencia}${forcedInstruction}\n[CONTINUACIÓN DE LA CONVERSACIÓN - NOTA O TAREA PREVIA]
Título previo: "${contextoPrevio.titulo || 'Nota'}" (tipo: ${contextoPrevio.tipo || 'nota'})
Contenido previo: "${contextoPrevio.texto || ''}"
${contextoPrevio.curso ? `Curso: ${contextoPrevio.curso}` : ''}
${contextoPrevio.fecha_entrega ? `Fecha actual de entrega: ${contextoPrevio.fecha_entrega}` : ''}

El usuario ahora escribe en el mismo chat:
"${texto}"

INSTRUCCIONES CLAVE:
1. DETECCIÓN CRÍTICA DE TEMA NUEVO VS MODIFICACIÓN:
   - Si el nuevo texto parece una tarea, apunte, idea, evento o tema DISTINTO e independiente al previo (ejemplo: la nota previa era sobre "Reunión de Redes" y el usuario ahora escribe "Examen de Cálculo el lunes", "Comprar café", "Idea: aplicación móvil", "Hackatón el jueves"):
     DEBES poner "es_modificacion_de_anterior": false.
     Clasifica el nuevo texto de forma 100% independiente, con su propio tipo, título sintético y tip.
   - Pon "es_modificacion_de_anterior": true ÚNICAMENTE si el usuario se refiere directamente a la nota previa o busca modificarla/ampliarla/preguntar por ella (ej: "cámbialo para el viernes", "ponle urgente", "cambia la hora a las 4pm", "agrega que lleve la laptop", "qué comando uso?").
2. Si "es_modificacion_de_anterior" es true:
   - Actualiza "texto_reescrito" reflejando el nuevo lugar, tema o requerimiento.
   - Si cambia fecha (ej. "para el viernes"), calcula la nueva "fecha_entrega" en formato YYYY-MM-DD respecto a hoy (${hoyStr}).
   - Actualiza "titulo_corto" si es necesario.
   - En "mensaje_feedback", confirma con claridad, calidez y precisión el cambio realizado.
3. Si el usuario hace una pregunta o pide tips/comandos técnicos sobre la nota previa:
   - Mantén "es_modificacion_de_anterior": true y responde didácticamente en "mensaje_feedback".
4. Si el usuario añade más requerimientos a la nota previa:
   - Enriquecer "texto_reescrito" combinando lo anterior con lo nuevo.`;
  } else {
    userPrompt = `${fechaReferencia}${forcedInstruction}\nTexto:\n${texto}`;
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

function tieneApiKey(key) {
  return typeof key === 'string' && key.trim().length > 10 && !key.includes('tu_api_key') && !key.includes('your_api_key');
}

/**
 * Clasificador local inteligente por reglas y análisis de lenguaje natural.
 * Se activa de inmediato si la API de Claude no responde o no tiene saldo/clave activa.
 */
function localFallbackClassifier(texto, forcedType = null, contextoPrevio = null) {
  const lower = texto.toLowerCase();
  const now = new Date();

  // 0. Detección temprana: ¿es continuación/modificación o un tema nuevo?
  let esModificacion = false;
  if (contextoPrevio) {
    const esComandoModificar = /^(cambia|modifica|corrige|ponle|agrega|pasa|mueve|a\s+las|para\s+el|para\s+la)\b/i.test(texto);
    const esNuevoTema = /^(examen|parcial|tarea|entrega|informe|clase|reunion|reunión|hackaton|hackathon|comprar|idea|proyecto|recordar)\b/i.test(texto);
    esModificacion = esComandoModificar || !esNuevoTema;
  }

  // 1. Extraer hora (ej. "a las 6 pm", "8pm", "11:00 am", "18:00")
  let hora_entrega = esModificacion ? (contextoPrevio?.hora_entrega || null) : null;
  const horaRegex = /(?:(?:a\s+las|las|desde\s+las)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?|(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{1,2})\s*(am|pm))/i;
  const horaMatch = texto.match(horaRegex);
  if (horaMatch) {
    let rawH, rawM, rawAmpm;
    if (horaMatch[1] !== undefined) {
      rawH = horaMatch[1];
      rawM = horaMatch[2];
      rawAmpm = horaMatch[3];
    } else if (horaMatch[4] !== undefined) {
      rawH = horaMatch[4];
      rawM = horaMatch[5];
      rawAmpm = horaMatch[6];
    } else if (horaMatch[7] !== undefined) {
      rawH = horaMatch[7];
      rawM = null;
      rawAmpm = horaMatch[8];
    }

    let h = parseInt(rawH, 10);
    const m = (rawM !== undefined && rawM !== null) ? parseInt(rawM, 10) : 0;
    const ampm = rawAmpm ? rawAmpm.toLowerCase() : null;

    if (!isNaN(h) && !isNaN(m) && m >= 0 && m <= 59) {
      if (ampm === 'pm' && h < 12) h += 12;
      else if (ampm === 'am' && h === 12) h = 0;

      if (h >= 0 && h <= 23) {
        hora_entrega = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
  }

  // 2. Extraer fecha relativa (soporta todos los días de la semana)
  let fecha_entrega = esModificacion ? (contextoPrevio?.fecha_entrega || null) : null;
  const diasSemana = {
    'domingo': 0, 'lunes': 1, 'martes': 2,
    'miercoles': 3, 'miércoles': 3,
    'jueves': 4, 'viernes': 5,
    'sabado': 6, 'sábado': 6
  };

  if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    fecha_entrega = toLocalDateString(d);
  } else if (lower.includes('mañana') || lower.includes('manana')) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    fecha_entrega = toLocalDateString(d);
  } else if (lower.includes('hoy')) {
    fecha_entrega = toLocalDateString(now);
  } else {
    for (const [diaNombre, diaNum] of Object.entries(diasSemana)) {
      if (lower.includes(diaNombre)) {
        const d = new Date(now);
        const hoyDia = d.getDay();
        const diff = (diaNum - hoyDia + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        fecha_entrega = toLocalDateString(d);
        break;
      }
    }
  }

  // 3. Extraer curso o materia académica
  let curso = esModificacion ? (contextoPrevio?.curso || null) : null;
  if (lower.includes('inteligencia financiera')) curso = 'Inteligencia Financiera';
  else if (lower.includes('redes') || lower.includes('fis-redes')) curso = 'Redes';
  else if (lower.includes('calculo') || lower.includes('cálculo')) curso = 'Cálculo';
  else if (lower.includes('fisica') || lower.includes('física')) curso = 'Física';
  else if (lower.includes('sistemas')) curso = 'Ing. Sistemas';
  else if (lower.includes('software')) curso = 'Diseño de Software';
  else if (lower.includes('base de datos') || lower.includes('bd')) curso = 'Base de Datos';
  else if (lower.includes('optimizacion') || lower.includes('optimización')) curso = 'Optimización';

  // 4. Detectar tipo
  let tipo = forcedType || (esModificacion ? contextoPrevio?.tipo : null) || 'nota';
  if (!forcedType && !esModificacion) {
    if (
      lower.includes('hackaton') || lower.includes('hackathon') ||
      lower.includes('reunión') || lower.includes('reunion') ||
      lower.includes('meet') || lower.includes('zoom') ||
      lower.includes('clase') || lower.includes('examen') ||
      lower.includes('tarea') || lower.includes('entrega') ||
      lower.includes('taller') || lower.includes('inicia') ||
      lower.includes('hacer') || lower.includes('estudiar') ||
      Boolean(fecha_entrega) || Boolean(hora_entrega)
    ) {
      tipo = 'tarea';
    } else if (lower.includes('idea') || lower.includes('proyecto') || lower.includes('crear') || lower.includes('app') || lower.includes('startup')) {
      tipo = 'idea';
    }
  }

  // 5. Síntesis inteligente del título y contenido
  let titulo_corto = '';
  let texto_reescrito = texto;
  let descripcion = texto;

  if (esModificacion && contextoPrevio) {
    titulo_corto = contextoPrevio.titulo || '';
    texto_reescrito = contextoPrevio.texto ? `${contextoPrevio.texto} (${texto})` : texto;
    descripcion = contextoPrevio.texto || texto;
  } else {
    if (lower.includes('hackaton') || lower.includes('hackathon')) {
      titulo_corto = 'Hackatón';
    } else if (lower.includes('reunion') || lower.includes('reunión')) {
      titulo_corto = curso ? `Reunión de ${curso}` : 'Reunión de Coordinación';
    } else if (lower.includes('examen') || lower.includes('parcial')) {
      titulo_corto = curso ? `Examen de ${curso}` : 'Examen';
    } else if (lower.includes('entrega') || lower.includes('informe')) {
      titulo_corto = curso ? `Entrega de ${curso}` : 'Entrega de Informe';
    } else if (lower.includes('clase')) {
      titulo_corto = curso ? `Clase de ${curso}` : 'Clase';
    } else {
      let limpio = texto
        .replace(/^(tengo\s+que\s+|tengo\s+una\s+|recordar\s+|inicia\s+una\s+pequeña\s+|inicia\s+|hay\s+)/i, '')
        .replace(/(?:este\s+)?(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo|hoy|mañana)/gi, '')
        .replace(/(?:a\s+las\s+|las\s+)?\d{1,2}(?::\d{2})?\s*(am|pm)?/gi, '')
        .trim();

      const palabras = limpio.split(/\s+/).filter(Boolean).slice(0, 5).join(' ');
      if (palabras.length > 2) {
        titulo_corto = palabras.charAt(0).toUpperCase() + palabras.slice(1);
      } else {
        const fallbackPalabras = texto.split(/\s+/).slice(0, 5).join(' ');
        titulo_corto = fallbackPalabras.charAt(0).toUpperCase() + fallbackPalabras.slice(1);
      }
    }
  }

  // 6. Mensaje de feedback enriquecido (TIP DE NOTIP)
  let feedback = '';
  const fechaLabel = fecha_entrega ? `el ${fecha_entrega}` : '';
  const horaLabel = hora_entrega ? ` a las ${hora_entrega}` : '';

  if (esModificacion) {
    feedback = `Nota actualizada correctamente${fechaLabel ? ` para ${fechaLabel}` : ''}${horaLabel ? `${horaLabel}` : ''}.`;
  } else if (lower.includes('hackaton') || lower.includes('hackathon')) {
    feedback = `¡Hackatón agendada para ${fechaLabel}${horaLabel}! Tip: Coordina previamente los roles de tu equipo y ten preparado el entorno de desarrollo para arrancar con ventaja.`;
  } else if (lower.includes('reunion') || lower.includes('reunión')) {
    feedback = `¡Reunión programada para ${fechaLabel}${horaLabel}! Tip: Ten listos los temas principales o dudas clave para que la sesión sea ágil y productiva.`;
  } else if (lower.includes('examen') || lower.includes('parcial')) {
    feedback = `¡Examen agendado para ${fechaLabel}${horaLabel}! Tip: Programa sesiones de repaso corto y resuelve ejercicios clave con anticipación.`;
  } else if (fecha_entrega && hora_entrega) {
    feedback = `Tarea organizada para ${fechaLabel}${horaLabel}. ¡Puedes sincronizarla directamente con tu Google Calendar!`;
  } else if (fecha_entrega) {
    feedback = `Tarea programada para ${fechaLabel}. Tip: Divide el objetivo en pasos pequeños para completarlo sin prisas.`;
  } else {
    feedback = `Anotado en tu segundo cerebro como ${tipo.toUpperCase()}.`;
  }

  return {
    tipo,
    texto_reescrito,
    titulo_corto,
    descripcion,
    curso,
    fecha_entrega,
    hora_entrega,
    prioridad: (lower.includes('urgente') || lower.includes('hoy') || lower.includes('examen')) ? 'alta' : 'normal',
    mensaje_feedback: feedback,
    es_modificacion_de_anterior: esModificacion,
    conexiones_sugeridas: [],
    tags: [tipo, ...(curso ? [curso.toLowerCase().replace(/\s+/g, '-')] : [])],
    error_clasificacion: false,
    usando_fallback_local: true,
    origen: 'local',
  };
}

module.exports = { clasificarConReintentos, descubrirConexionesGlobales, tieneApiKey, localFallbackClassifier };
