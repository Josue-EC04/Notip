-- ============================================================
-- Notip v2 — Esquema de Supabase
-- Ejecutar este SQL en el editor SQL de tu proyecto Supabase
-- ============================================================

-- ─── Extensión para UUIDs ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Tabla: creditos ─────────────────────────────────────────
-- Una fila por usuario. Se crea automáticamente al hacer login.
CREATE TABLE IF NOT EXISTS public.creditos (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  saldo         INTEGER     NOT NULL DEFAULT 0,         -- tokens disponibles
  total_gastado INTEGER     NOT NULL DEFAULT 0,         -- historial total consumido
  es_admin      BOOLEAN     NOT NULL DEFAULT false,     -- true = sin límite (tú)
  recargas      JSONB       NOT NULL DEFAULT '[]'::jsonb, -- historial de recargas
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tabla: tareas ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tareas (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo          TEXT        NOT NULL,
  descripcion     TEXT,
  curso           TEXT,
  fecha_entrega   DATE,
  hora_entrega    TEXT,
  estado          TEXT        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente','en_progreso','hecho')),
  prioridad       TEXT        NOT NULL DEFAULT 'normal'
                              CHECK (prioridad IN ('alta','media','normal')),
  nota_origen     TEXT,       -- filename del .md de origen (compatibilidad vault local)
  calendar_event_id TEXT,     -- ID del evento creado en Google Calendar (si se agregó)
  sincronizado_local BOOLEAN  NOT NULL DEFAULT false,  -- vino desde SQLite local pendiente
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tabla: ideas (notas del cerebro) ───────────────────────
CREATE TABLE IF NOT EXISTS public.ideas (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename        TEXT        NOT NULL,  -- nombre del archivo .md (para compatibilidad local)
  titulo          TEXT        NOT NULL,
  contenido       TEXT,
  tipo            TEXT        NOT NULL DEFAULT 'nota'
                              CHECK (tipo IN ('idea','nota','tarea')),
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  prioridad       TEXT        NOT NULL DEFAULT 'normal',
  conexiones      TEXT[]      NOT NULL DEFAULT '{}',  -- títulos de ideas conectadas [[...]]
  conexiones_ia   TEXT[]      NOT NULL DEFAULT '{}',  -- sugeridas por IA
  fecha_creacion  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, filename)
);

-- ─── Tabla: conexiones (grafo del cerebro) ──────────────────
CREATE TABLE IF NOT EXISTS public.conexiones (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idea_origen_id  UUID        NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  idea_destino_id UUID        NOT NULL REFERENCES public.ideas(id) ON DELETE CASCADE,
  origen          TEXT        NOT NULL DEFAULT 'manual'
                              CHECK (origen IN ('manual','sugerida_ia')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, idea_origen_id, idea_destino_id)
);

-- ─── Función: crear créditos al registrarse ─────────────────
-- Se ejecuta automáticamente cuando un usuario hace su primer login con Google
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  admin_email TEXT := 'josue.ec.4411@gmail.com';
  is_user_admin BOOLEAN;
BEGIN
  -- El dueño de la app tiene créditos ilimitados (es_admin = true)
  is_user_admin := (NEW.email = admin_email);

  INSERT INTO public.creditos (user_id, saldo, es_admin)
  VALUES (
    NEW.id,
    CASE WHEN is_user_admin THEN 999999999 ELSE 0 END,
    is_user_admin
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que llama a la función al registrarse
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security (RLS) ────────────────────────────────
-- Cada usuario solo puede ver y modificar SUS PROPIOS datos.

ALTER TABLE public.creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conexiones ENABLE ROW LEVEL SECURITY;

-- Políticas para creditos
CREATE POLICY "creditos_select_own" ON public.creditos
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "creditos_update_own" ON public.creditos
  FOR UPDATE USING (auth.uid() = user_id);

-- Políticas para tareas
CREATE POLICY "tareas_select_own" ON public.tareas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "tareas_insert_own" ON public.tareas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tareas_update_own" ON public.tareas
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "tareas_delete_own" ON public.tareas
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para ideas
CREATE POLICY "ideas_select_own" ON public.ideas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ideas_insert_own" ON public.ideas
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ideas_update_own" ON public.ideas
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "ideas_delete_own" ON public.ideas
  FOR DELETE USING (auth.uid() = user_id);

-- Políticas para conexiones
CREATE POLICY "conexiones_select_own" ON public.conexiones
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "conexiones_insert_own" ON public.conexiones
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "conexiones_delete_own" ON public.conexiones
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Índices para rendimiento ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tareas_user_id ON public.tareas(user_id);
CREATE INDEX IF NOT EXISTS idx_tareas_fecha_entrega ON public.tareas(user_id, fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_ideas_user_id ON public.ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_conexiones_origen ON public.conexiones(user_id, idea_origen_id);
