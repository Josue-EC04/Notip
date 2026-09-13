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
    if (store.get('signed-out', false)) return null;
    const raw = store.get('sb-session');
    if (!raw) return null;
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return session?.user?.id && session.access_token && session.refresh_token ? session : null;
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
    return getStoredSession();
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
        if (getStoredSession()?.refresh_token !== session.refresh_token) return getStoredSession();
        storeSession(data.session);
        return data.session;
      }

      if (error) {
        console.warn('[auth] Aviso al refrescar token:', error.message);
        // Si el token fue revocado definitivamente en el servidor:
        if (error.message.includes('Invalid Refresh Token') || error.message.includes('Already Used')) {
          console.warn('[auth] Refresh token inválido en el servidor. Requiere nuevo login.');
          if (getStoredSession()?.refresh_token === session.refresh_token) storeSession(null);
          return getStoredSession();
        }
      }
    } catch (err) {
      console.warn('[auth] Error de red al refrescar (modo offline):', err.message);
    }
  }

  // Si falló por falta de conexión o red temporal, conservamos la sesión local para modo offline
  return getStoredSession();
}

/**
 * Guarda una sesión manualmente en el store.
 */
function storeSession(session) {
  if (session) {
    store.delete('signed-out');
    store.set('sb-session', session);
  } else {
    store.set('signed-out', true);
    store.delete('sb-session');
  }
}

/**
 * Cierra la sesión local y en Supabase.
 */
async function signOut() {
  // Clear remembered access before any network request, including when offline.
  storeSession(null);
  try {
    const sb = getSupabaseClient();
    if (sb) void sb.auth.signOut({ scope: 'local' }).catch(e => console.warn('[auth] Remote logout unavailable:', e.message));
  } catch (e) {
    console.error('[supabase] Error en signOut:', e);
  }
}

module.exports = {
  getSupabaseClient,
  getStoredSession,
  getStoredUser,
  restoreOrRefreshSession,
  storeSession,
  signOut,
};
