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

  const url = process.env.SUPABASE_URL || 'https://gsfushthupgviwymlodj.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzZnVzaHRodXBndml3eW1sb2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5MTI2NzQsImV4cCI6MjEwNDQ4ODY3NH0.GL-XEV5L1BQSJSLr99AMjxCiw2WTP4HqHTaKUz9sX84';

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
 * Obtiene la sesión activa del store (sin llamada a red y sin borrarla).
 */
function getStoredSession() {
  try {
    const raw = store.get('sb-session');
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
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
 * Restaura y renueva la sesión al iniciar la aplicación.
 * Si el access_token expiró, utiliza el refresh_token para renovarlo con Supabase.
 * Si está offline, mantiene la sesión local para que el usuario pueda seguir trabajando.
 */
async function restoreOrRefreshSession() {
  const session = getStoredSession();
  if (!session || !session.user) return null;

  const sb = getSupabaseClient();
  if (!sb) return session;

  const now = Date.now();
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  // Margen de 2 minutos antes de la expiración para renovar con tiempo
  const isExpiredOrSoon = expiresAt <= (now + 120000);

  if (!isExpiredOrSoon && session.access_token) {
    try {
      await sb.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token || '',
      });
    } catch (_) {}
    return session;
  }

  // Si ha expirado pero tenemos refresh_token, renovar con Supabase
  if (session.refresh_token) {
    try {
      console.log('[auth] Renovando sesión con refresh_token...');
      const { data, error } = await sb.auth.refreshSession({
        refresh_token: session.refresh_token,
      });

      if (!error && data?.session) {
        console.log('[auth] Sesión renovada con éxito para:', data.session.user?.email);
        storeSession(data.session);
        return data.session;
      }

      if (error) {
        console.warn('[auth] Aviso al refrescar token:', error.message);
        // Si el token fue revocado definitivamente en el servidor:
        if (error.message.includes('Invalid Refresh Token') || error.message.includes('Already Used')) {
          console.warn('[auth] Refresh token inválido en el servidor. Requiere nuevo login.');
          storeSession(null);
          return null;
        }
      }
    } catch (err) {
      console.warn('[auth] Error de red al refrescar (modo offline):', err.message);
    }
  }

  // Si falló por falta de conexión o red temporal, conservamos la sesión local para modo offline
  return session;
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
  restoreOrRefreshSession,
  storeSession,
  signOut,
};
