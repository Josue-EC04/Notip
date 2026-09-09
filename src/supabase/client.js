'use strict';

/**
 * src/supabase/client.js
 * Cliente Supabase singleton con adaptador electron-store para persistencia de sesión.
 * En Electron, localStorage no funciona igual que en navegador, por eso usamos electron-store.
 */

const { createClient } = require('@supabase/supabase-js');
const Store = require('electron-store');

const store = new Store({ name: 'notip-auth' });

let _supabase = null;

/**
 * Devuelve el cliente Supabase singleton.
 * Requiere que SUPABASE_URL y SUPABASE_ANON_KEY estén en process.env.
 */
function getSupabaseClient() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[supabase] SUPABASE_URL o SUPABASE_ANON_KEY no configuradas — modo offline.');
    return null;
  }

  // En Electron, el proceso principal no tiene WebSocket nativo aunque Node sea v22+.
  // Usamos el paquete 'ws' como transporte explícito para Supabase.
  const WebSocket = require('ws');

  _supabase = createClient(url, key, {
    auth: {
      // Adaptador de almacenamiento basado en electron-store
      // (localStorage del navegador no está disponible en el proceso principal de Electron)
      storage: {
        getItem:    (k) => store.get(k) ?? null,
        setItem:    (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      autoRefreshToken: true,
      persistSession:   true,
      detectSessionInUrl: false,
    },
    realtime: {
      // Proveer WebSocket explícitamente (requerido en Electron main process)
      transport: WebSocket,
      params: { eventsPerSecond: 2 },
    },
    global: {
      headers: { 'X-Client-Info': 'notip-electron/2.0' },
    },
  });


  return _supabase;
}

/**
 * Obtiene la sesión activa del store (sin llamada a red).
 */
function getStoredSession() {
  try {
    const raw = store.get('sb-session');
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    // Verificar que no haya expirado
    if (parsed?.expires_at && parsed.expires_at * 1000 < Date.now()) {
      store.delete('sb-session');
      return null;
    }
    return parsed;
  } catch { return null; }
}

/**
 * Obtiene el usuario actual desde la sesión almacenada.
 */
function getStoredUser() {
  const session = getStoredSession();
  return session?.user ?? null;
}

/**
 * Guarda una sesión manualmente en el store.
 */
function storeSession(session) {
  if (session) {
    store.set('sb-session', session);
  } else {
    store.delete('sb-session');
  }
}

/**
 * Cierra la sesión local y en Supabase.
 */
async function signOut() {
  try {
    const sb = getSupabaseClient();
    if (sb) await sb.auth.signOut();
  } catch (e) {
    console.error('[supabase] Error en signOut:', e);
  }
  storeSession(null);
}

module.exports = {
  getSupabaseClient,
  getStoredSession,
  getStoredUser,
  storeSession,
  signOut,
};
