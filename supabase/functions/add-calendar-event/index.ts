// supabase/functions/add-calendar-event/index.ts
// Edge Function: crea un evento en Google Calendar usando el token OAuth del usuario.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
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

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Obtener usuario y su provider_token (token de Google)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), { status: 401, headers });
    }

    // 2. Obtener el access_token de Google desde la sesión de Supabase
    // Supabase almacena el provider token en la tabla auth.sessions
    const { data: sessionData } = await supabase.auth.admin.getUserById(user.id);
    
    // El provider_token viene del body porque el cliente lo envía desde electron-store
    const body = await req.json();
    const { titulo, descripcion, fecha_entrega, hora_entrega, provider_token } = body;

    if (!provider_token) {
      return new Response(JSON.stringify({ 
        error: "No hay token de Google disponible. Por favor vuelve a iniciar sesión.",
        needs_reauth: true,
      }), { status: 401, headers });
    }

    if (!titulo || !fecha_entrega) {
      return new Response(JSON.stringify({ error: "Título y fecha son requeridos" }), { status: 400, headers });
    }

    // 3. Construir el evento de Google Calendar
    const fechaInicio = hora_entrega
      ? `${fecha_entrega}T${hora_entrega}:00`
      : fecha_entrega;

    const event: any = {
      summary: titulo,
      description: descripcion || `Tarea de Notip: ${titulo}`,
    };

    if (hora_entrega) {
      event.start = { dateTime: `${fechaInicio}-05:00`, timeZone: "America/Lima" };
      event.end   = { dateTime: `${fecha_entrega}T${hora_entrega}:00-05:00`.replace(
        `T${hora_entrega}:00`,
        `T${addHour(hora_entrega)}:00`
      ), timeZone: "America/Lima" };
    } else {
      event.start = { date: fecha_entrega };
      event.end   = { date: fecha_entrega };
    }

    // 4. Llamar a la API de Google Calendar
    const calendarRes = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${provider_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!calendarRes.ok) {
      const errText = await calendarRes.text();
      // Si el token expiró, el cliente necesita re-autenticarse
      if (calendarRes.status === 401) {
        return new Response(JSON.stringify({ 
          error: "Token de Google expirado. Cierra sesión y vuelve a entrar.",
          needs_reauth: true,
        }), { status: 401, headers });
      }
      return new Response(JSON.stringify({ error: `Google Calendar error: ${calendarRes.status}`, detail: errText }), {
        status: 502, headers,
      });
    }

    const calendarEvent = await calendarRes.json();

    return new Response(JSON.stringify({
      success: true,
      event_id: calendarEvent.id,
      event_link: calendarEvent.htmlLink,
    }), { status: 200, headers });

  } catch (err: any) {
    console.error("[add-calendar-event] Error:", err);
    return new Response(JSON.stringify({ error: err.message ?? "Error interno" }), {
      status: 500, headers,
    });
  }
});

/** Suma 1 hora a un string HH:MM */
function addHour(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const newH = (h + 1) % 24;
  return `${String(newH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
