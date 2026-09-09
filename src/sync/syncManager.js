'use strict';

/**
 * src/sync/syncManager.js
 * Capa de sincronización híbrida: SQLite local (offline) ↔ Supabase (nube).
 * 
 * Estrategia:
 *  - SQLite es la fuente principal de verdad en local (la app siempre funciona offline)
 *  - Supabase recibe los cambios cuando hay sesión + conexión
 *  - Al iniciar sesión, se descargan los datos de la nube y se fusionan con lo local
 *  - Conflictos: gana la versión más reciente (fecha_creacion)
 */

const { getSupabaseClient, getStoredUser } = require('../supabase/client');

/**
 * Sube una tarea nueva a Supabase (si hay sesión activa).
 * No bloquea — si falla, la tarea ya está guardada en SQLite.
 * @param {object} tarea - Objeto tarea tal como se guarda en SQLite
 * @returns {Promise<string|null>} - UUID de Supabase si se subió, null si falló/no hay sesión
 */
async function uploadTask(tarea) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return null;

  try {
    const { data, error } = await sb
      .from('tareas')
      .insert({
        user_id:       user.id,
        titulo:        tarea.titulo,
        descripcion:   tarea.descripcion || null,
        curso:         tarea.curso || null,
        fecha_entrega: tarea.fecha_entrega || null,
        hora_entrega:  tarea.hora_entrega || null,
        estado:        tarea.estado || 'pendiente',
        prioridad:     tarea.prioridad || 'normal',
        nota_origen:   tarea.nota_origen || null,
        fecha_creacion: tarea.fecha_creacion || new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[sync] uploadTask error:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn('[sync] uploadTask exception:', e.message);
    return null;
  }
}

/**
 * Actualiza una tarea en Supabase (si tiene supabase_id).
 * @param {string} supabaseId - UUID de la tarea en Supabase
 * @param {object} campos - Campos a actualizar
 */
async function updateTaskInCloud(supabaseId, campos) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user || !supabaseId) return;

  try {
    const { error } = await sb
      .from('tareas')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', supabaseId)
      .eq('user_id', user.id);
    if (error) console.warn('[sync] updateTaskInCloud error:', error.message);
  } catch (e) {
    console.warn('[sync] updateTaskInCloud exception:', e.message);
  }
}

/**
 * Elimina una tarea de Supabase.
 */
async function deleteTaskInCloud(supabaseId) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user || !supabaseId) return;

  try {
    const { error } = await sb
      .from('tareas')
      .delete()
      .eq('id', supabaseId)
      .eq('user_id', user.id);
    if (error) console.warn('[sync] deleteTaskInCloud error:', error.message);
  } catch (e) {
    console.warn('[sync] deleteTaskInCloud exception:', e.message);
  }
}

/**
 * Sube una nota/idea a Supabase.
 */
async function uploadNote(nota) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return null;

  try {
    const { data, error } = await sb
      .from('ideas')
      .upsert({
        user_id:        user.id,
        filename:       nota.filename,
        titulo:         nota.titulo || nota.filename,
        contenido:      nota.content || nota.contenido || '',
        tipo:           ['idea', 'tarea'].includes(nota.tipo) ? nota.tipo : 'nota',
        tags:           nota.tags || [],
        prioridad:      nota.prioridad || 'normal',
        conexiones:     nota.conexiones || [],
        conexiones_ia:  nota.conexiones_ia || [],
        fecha_creacion: nota.fecha_creacion || new Date().toISOString(),
      }, { onConflict: 'user_id,filename' })
      .select('id')
      .single();

    if (error) {
      console.warn('[sync] uploadNote error:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (e) {
    console.warn('[sync] uploadNote exception:', e.message);
    return null;
  }
}

/**
 * Descarga todas las tareas del usuario desde Supabase.
 * @returns {Promise<Array>}
 */
async function downloadTasks() {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return [];

  try {
    const { data, error } = await sb
      .from('tareas')
      .select('*')
      .eq('user_id', user.id)
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.warn('[sync] downloadTasks error:', error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn('[sync] downloadTasks exception:', e.message);
    return [];
  }
}

/**
 * Descarga todas las notas/ideas del usuario desde Supabase.
 * @returns {Promise<Array>}
 */
async function downloadNotes() {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return [];

  try {
    const { data, error } = await sb
      .from('ideas')
      .select('*')
      .eq('user_id', user.id)
      .order('fecha_creacion', { ascending: false });

    if (error) {
      console.warn('[sync] downloadNotes error:', error.message);
      return [];
    }
    return data ?? [];
  } catch (e) {
    console.warn('[sync] downloadNotes exception:', e.message);
    return [];
  }
}

/**
 * Obtiene el saldo de créditos del usuario desde Supabase.
 * @returns {Promise<{saldo: number, es_admin: boolean}|null>}
 */
async function getCredits() {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return null;

  try {
    const { data, error } = await sb
      .from('creditos')
      .select('saldo, es_admin')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.warn('[sync] getCredits error:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[sync] getCredits exception:', e.message);
    return null;
  }
}

/**
 * Llama a la Edge Function de clasificación con IA.
 * Incluye el JWT del usuario para que la Edge Function pueda verificar créditos.
 * @param {object} params - { texto, forcedType, contextoPrevio, notasExistentes }
 * @returns {Promise<object>} - Resultado de clasificación
 */
async function classifyViaEdgeFunction(params) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) throw new Error('Sin sesión activa');

  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Token de sesión no disponible');

  const now        = new Date();
  const diasSemana = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  const { data, error } = await sb.functions.invoke('classify', {
    body: {
      texto:           params.texto,
      forcedType:      params.forcedType || null,
      contextoPrevio:  params.contextoPrevio || null,
      notasExistentes: params.notasExistentes || [],
      fechaActual:     now.toISOString().split('T')[0],
      diaSemana:       diasSemana[now.getDay()],
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Llama a la Edge Function para crear un evento en Google Calendar.
 * @param {object} params - { titulo, descripcion, fecha_entrega, hora_entrega, provider_token }
 * @returns {Promise<object>}
 */
async function addCalendarEvent(params) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) throw new Error('Sin sesión activa');

  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Token de sesión no disponible');

  const { data, error } = await sb.functions.invoke('add-calendar-event', {
    body: params,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Sincroniza todas las notas locales (.md) y tareas (SQLite) a Supabase.
 * Se ejecuta automáticamente al iniciar sesión o abrir la app.
 */
async function syncAllLocalToCloud(vaultPath, dataPath) {
  const sb   = getSupabaseClient();
  const user = getStoredUser();
  if (!sb || !user) return { syncedNotes: 0, syncedTasks: 0 };

  console.log('[sync] Sincronizando notas y tareas con Supabase para:', user.email);

  let syncedNotes = 0;
  let syncedTasks = 0;

  try {
    // 1. Sincronizar notas del vault
    const { getAllNotes } = require('../notes/notesManager');
    const localNotes = getAllNotes(vaultPath);
    for (const n of localNotes) {
      const res = await uploadNote(n);
      if (res) syncedNotes++;
    }

    // 2. Sincronizar tareas de SQLite
    const { getTasks } = require('../db/database');
    const localTasks = getTasks('todos');
    for (const t of localTasks) {
      const { data: existing } = await sb.from('tareas')
        .select('id')
        .eq('user_id', user.id)
        .eq('titulo', t.titulo)
        .limit(1);

      if (existing && existing.length > 0) {
        await sb.from('tareas').update({
          descripcion:   t.descripcion || null,
          curso:         t.curso || null,
          fecha_entrega: t.fecha_entrega || null,
          hora_entrega:  t.hora_entrega || null,
          estado:        t.estado || 'pendiente',
          prioridad:     t.prioridad || 'normal',
          nota_origen:   t.nota_origen || null,
        }).eq('id', existing[0].id);
        syncedTasks++;
      } else {
        const { error } = await sb.from('tareas').insert({
          user_id:        user.id,
          titulo:         t.titulo,
          descripcion:    t.descripcion || null,
          curso:          t.curso || null,
          fecha_entrega:  t.fecha_entrega || null,
          hora_entrega:   t.hora_entrega || null,
          estado:         t.estado || 'pendiente',
          prioridad:      t.prioridad || 'normal',
          nota_origen:    t.nota_origen || null,
          fecha_creacion: t.fecha_creacion || new Date().toISOString()
        });
        if (!error) syncedTasks++;
      }
    }

    console.log(`[sync] Sincronización completa: ${syncedNotes} notas y ${syncedTasks} tareas sincronizadas con Supabase.`);
  } catch (err) {
    console.warn('[sync] Error en syncAllLocalToCloud:', err.message);
  }

  return { syncedNotes, syncedTasks };
}

module.exports = {
  uploadTask,
  updateTaskInCloud,
  deleteTaskInCloud,
  uploadNote,
  downloadTasks,
  downloadNotes,
  getCredits,
  classifyViaEdgeFunction,
  addCalendarEvent,
  syncAllLocalToCloud,
};

