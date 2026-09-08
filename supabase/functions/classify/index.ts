// supabase/functions/classify/index.ts
// Edge Function: proxy seguro para Claude con verificación de créditos.
// Tu API key de Anthropic vive aquí (en Supabase), NUNCA en el cliente.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Costo en tokens por cada llamada de clasificación (1 unidad ≈ ~1 llamada)
const COSTO_POR_LLAMADA = 1;

const SYSTEM_PROMPT = `Eres Notip, el segundo cerebro personal y mascota flotante con IA de un estudiante de ingeniería de sistemas. Tu labor es clasificar y mejorar las notas rápidas, ideas y tareas que el usuario te comparte durante su día.

Dado el texto que te llega, responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, sin bloques de código markdown.

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

Reglas:
- "tipo": "tarea" si es acción pendiente, "idea" si es concepto creativo, "nota" si es apunte.
- "prioridad": "alta" si es urgente/hoy/mañana, "media" si es esta semana, "normal" en otro caso.
- "mensaje_feedback": respuesta breve, cálida y útil que confirma lo guardado.
- Reescribe con claridad y concisión sin inventar información.`;

serve(async (req) => {
  // CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    // 1. Verificar autenticación
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers });
    }

    // 2. Verificar créditos
    const { data: credito, error: creditError } = await supabase
      .from("creditos")
      .select("saldo, es_admin")
      .eq("user_id", user.id)
      .single();

    if (creditError || !credito) {
      return new Response(JSON.stringify({ error: "Sin cuenta de créditos" }), { status: 402, headers });
    }

    if (!credito.es_admin && credito.saldo < COSTO_POR_LLAMADA) {
      return new Response(JSON.stringify({
        error: "Créditos insuficientes",
        saldo: credito.saldo,
        sin_creditos: true,
      }), { status: 402, headers });
    }

    // 3. Leer body de la petición
    const { texto, forcedType, contextoPrevio, notasExistentes, fechaActual, diaSemana } = await req.json();

    if (!texto?.trim()) {
      return new Response(JSON.stringify({ error: "Texto vacío" }), { status: 400, headers });
    }

    // 4. Construir prompt para Claude
    const fechaRef = `[FECHA ACTUAL DE REFERENCIA: ${fechaActual || new Date().toISOString().split("T")[0]} (${diaSemana || ""})]`;
    let userPrompt = "";

    if (contextoPrevio) {
      userPrompt = `${fechaRef}\n[CONTINUACIÓN DE CONVERSACIÓN]\nTítulo previo: "${contextoPrevio.titulo}" (tipo: ${contextoPrevio.tipo})\nContenido previo: "${contextoPrevio.texto}"\n\nEl usuario ahora escribe: "${texto}"`;
    } else if (forcedType && ["tarea", "idea", "nota"].includes(forcedType)) {
      userPrompt = `${fechaRef}\n[IMPORTANTE: tipo obligatorio "${forcedType}"]\n\nTexto:\n${texto}`;
    } else {
      userPrompt = `${fechaRef}\nTexto:\n${texto}`;
    }

    if (notasExistentes?.length > 0) {
      const listado = notasExistentes.slice(0, 30)
        .map((n: any) => `- "${n.titulo}" (tipo: ${n.tipo})`).join("\n");
      userPrompt += `\n\n[NOTAS EXISTENTES PARA CONEXIONES]:\n${listado}`;
    }

    // 5. Llamar a Claude Haiku
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      return new Response(JSON.stringify({ error: `Error de Claude: ${claudeRes.status}`, detail: errBody }), {
        status: 502, headers,
      });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content
      ?.filter((b: any) => b.type === "text")
      ?.map((b: any) => b.text)
      ?.join("") ?? "";

    // 6. Parsear respuesta JSON de Claude
    let clasificacion;
    try {
      const match = rawText.match(/\{[\s\S]*\}/);
      clasificacion = JSON.parse(match ? match[0] : rawText);
    } catch {
      clasificacion = {
        tipo: "nota",
        texto_reescrito: texto,
        titulo_corto: texto.slice(0, 40),
        descripcion: null,
        curso: null,
        fecha_entrega: null,
        hora_entrega: null,
        prioridad: "normal",
        mensaje_feedback: `Anotado: "${texto.slice(0, 35)}..."`,
        conexiones_sugeridas: [],
        tags: [],
        error_clasificacion: true,
      };
    }

    // 7. Descontar créditos (solo si no es admin)
    if (!credito.es_admin) {
      await supabase
        .from("creditos")
        .update({
          saldo: credito.saldo - COSTO_POR_LLAMADA,
          total_gastado: supabase.rpc ? undefined : undefined, // se maneja con trigger opcional
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    // 8. Obtener saldo actualizado para devolverlo al cliente
    const saldoActual = credito.es_admin ? 999999999 : credito.saldo - COSTO_POR_LLAMADA;

    return new Response(JSON.stringify({
      ...clasificacion,
      saldo_restante: saldoActual,
      es_admin: credito.es_admin,
    }), { status: 200, headers });

  } catch (err: any) {
    console.error("[classify] Error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Error interno" }), {
      status: 500, headers,
    });
  }
});
