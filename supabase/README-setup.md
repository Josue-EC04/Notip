# 🔧 Guía de Setup — Notip v2 (Login + Google Calendar)

Esta guía te explica paso a paso cómo configurar todos los servicios externos necesarios para que funcione el login con Google y la integración con Calendar.

---

## Paso 1: Configurar Supabase

### 1.1 Crear proyecto
1. Ve a [supabase.com](https://supabase.com) → Dashboard → "New project"
2. Elige nombre "notip" y una contraseña segura para la base de datos
3. Elige la región más cercana (us-east-1 o sa-east-1 para Latinoamérica)
4. Espera ~2 minutos a que el proyecto se inicialice

### 1.2 Ejecutar el esquema SQL
1. En tu proyecto Supabase → **SQL Editor** (icono de base de datos en el menú lateral)
2. Haz clic en **"New query"**
3. Copia y pega todo el contenido de `supabase/schema.sql`
4. Clic en **"Run"** (o F5)
5. Deberías ver "Success. No rows returned" → las tablas se crearon correctamente

### 1.3 Obtener las claves de API
1. En tu proyecto → **Settings** → **API**
2. Copia:
   - **Project URL** → `SUPABASE_URL` en tu `.env`
   - **anon public** key → `SUPABASE_ANON_KEY` en tu `.env`
3. También copia la **service_role** key (la necesitarás para las Edge Functions)

---

## Paso 2: Configurar Google OAuth

### 2.1 Crear proyecto en Google Cloud Console
1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. Crea un nuevo proyecto → nombre: "Notip"
3. Habilitar APIs:
   - Busca **"Google Calendar API"** → "Enable"
   - Busca **"Google Identity"** → ya viene habilitado

### 2.2 Configurar la pantalla de consentimiento OAuth
1. Menú izquierdo → **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → Create
3. Rellena:
   - App name: `Notip`
   - User support email: `josue.ec.4411@gmail.com`
   - Developer contact: `josue.ec.4411@gmail.com`
4. Scopes → **Add or remove scopes**:
   - Agrega: `email`, `profile`, `openid`
   - Agrega: `https://www.googleapis.com/auth/calendar.events`
5. **Test users** → Add users → Agrega aquí los correos de todos los que van a usar la app:
   ```
   josue.ec.4411@gmail.com
   correo-de-tu-amigo@gmail.com
   (hasta 100 usuarios de prueba)
   ```
6. Guarda

### 2.3 Crear credenciales OAuth
1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
2. Application type: **Web application** (aunque es Electron, Supabase lo maneja como web)
3. Name: `Notip Desktop`
4. **Authorized redirect URIs** → Add URI:
   ```
   https://TU-PROYECTO.supabase.co/auth/v1/callback
   ```
   (reemplaza TU-PROYECTO con el ID de tu proyecto Supabase)
5. Create → Copia el **Client ID** y **Client Secret**

### 2.4 Configurar Google en Supabase
1. Tu proyecto Supabase → **Authentication** → **Providers** → **Google**
2. Toggle **Enable** → ON
3. Pega tu **Client ID** y **Client Secret**
4. **Authorized redirect URIs** en Supabase → Add:
   ```
   notip://auth-callback
   ```
5. Save

---

## Paso 3: Configurar Edge Functions

### 3.1 Instalar Supabase CLI (si no la tienes)
```bash
npm install -g supabase
```

### 3.2 Login y link al proyecto
```bash
supabase login
supabase link --project-ref TU-PROJECT-REF
```
El project-ref está en tu URL de Supabase: `https://TU-PROJECT-REF.supabase.co`

### 3.3 Configurar secretos en las Edge Functions
```bash
supabase secrets set ANTHROPIC_API_KEY=tu_clave_anthropic
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

### 3.4 Desplegar las Edge Functions
```bash
supabase functions deploy classify
supabase functions deploy add-calendar-event
```

---

## Paso 4: Configurar tu .env local

Copia `.env.example` a `.env` y rellena:
```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
ANTHROPIC_API_KEY=tu_clave_anthropic   # Solo para desarrollo local
```

---

## Paso 5: Verificar que todo funciona

```bash
npm start
```

Deberías ver la pantalla de login de Notip. Al hacer clic en "Continuar con Google":
1. Se abre el navegador con la pantalla de Google
2. Inicias sesión con `josue.ec.4411@gmail.com`
3. El navegador redirige a `notip://auth-callback`
4. Windows abre Notip automáticamente
5. La app se carga con tu cuenta → tienes créditos ilimitados (es_admin = true)

---

## ¿Problemas frecuentes?

| Problema | Solución |
|---|---|
| "Supabase no configurado" | Verifica que `.env` tiene SUPABASE_URL y SUPABASE_ANON_KEY |
| El navegador no redirige a Notip | Verifica que `notip://auth-callback` está en las redirect URIs de Supabase |
| "Token inválido" | Cierra sesión y vuelve a iniciar |
| "Créditos insuficientes" | Tu cuenta debería tener es_admin=true si tienes josue.ec.4411@gmail.com |
| Error en Google Calendar | El scope de Calendar puede requerir reverificar permisos → cerrar sesión y volver a entrar |
