# Notip — Especificación del Proyecto

## 1. Resumen

Notip es una aplicación de escritorio para Windows que funciona como un "segundo cerebro" personal. Vive como una mascota flotante siempre visible en la pantalla, permite capturar notas rápidas (tareas, ideas, información) durante el día, las clasifica y mejora con IA, y organiza las ideas en un grafo de conexiones estilo Obsidian.

## 2. Tecnologías necesarias

### A instalar antes de empezar
- **Node.js** (versión LTS más reciente) — https://nodejs.org — incluye npm
- **Git** (opcional pero recomendado para versionar el código)
- Editor de código (VS Code, o el que use Antigravity internamente)

### Dependencias del proyecto (se instalan con `npm install`, no manualmente)
- `electron` — framework principal de la app de escritorio
- `@supabase/supabase-js` — cliente para conectarse a la base de datos y autenticación (reemplaza a `better-sqlite3` como almacenamiento principal desde v2, ver Sección 3)
- `googleapis` — para crear eventos en Google Calendar
- `@anthropic-ai/sdk` — SDK oficial para llamar a la API de Claude
- `electron-store` — para guardar configuración local de cada usuario: la posición del icono, la opacidad, y **su propia API key de Claude** (ver Sección 10)
- Librería de grafo (elegir una): `vis-network` o `cytoscape.js` — para renderizar la vista del "cerebro"
- `active-win` — para detectar cuándo hay una app en pantalla completa y ocultar la mascota

### Ya no son necesarias desde v2 (reemplazadas por Supabase)
- ~~`better-sqlite3`~~ — las tareas ahora se guardan en la tabla `tareas` de Supabase, no localmente
- ~~`gray-matter` / `chokidar`~~ — ya no hay archivos `.md` locales que leer ni observar; las ideas se guardan en la tabla `ideas` de Supabase (ver Sección 3)

### Ya incluido en Windows
- WebView2 (necesario si en el futuro se migra a Tauri; con Electron no es un requisito)

## 3. Arquitectura de datos

**Decisión de arquitectura (v2, con login)**: al agregar autenticación multiusuario, el almacenamiento pasa de archivos locales (`.md` + SQLite) a **Supabase (Postgres) como fuente única de datos**. Esto es necesario porque el sistema de permisos (Row Level Security) que separa los datos de cada usuario solo funciona sobre una base de datos real, no sobre archivos sueltos en el disco de cada persona. El vault local en formato `.md` queda descartado como almacenamiento principal — ver nota de compatibilidad con Obsidian al final de esta sección.

### Tablas en Supabase

**`ideas`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | |
| user_id | uuid | referencia al usuario autenticado (RLS filtra por esta columna) |
| titulo_corto | text | |
| contenido | text | el texto de la idea, puede incluir `[[nombre de otra idea]]` |
| tags | text[] | |
| tipo | text | `"idea"` o `"nota"` |
| fecha_creacion | timestamp | |

**`tareas`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| titulo | text | |
| curso | text | nullable |
| fecha_entrega | date | nullable |
| estado | text | `"pendiente"` / `"hecho"` |
| fecha_creacion | timestamp | |

**`conexiones`**
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| idea_origen_id | uuid | referencia a `ideas.id` |
| idea_destino_id | uuid | referencia a `ideas.id` |
| origen | text | `"manual"` o `"sugerida_ia"` |

### Cómo se generan las conexiones
El usuario sigue escribiendo `[[nombre de otra idea]]` dentro del campo `contenido`, exactamente igual que en Obsidian — esa parte de la experiencia no cambia. Pero en vez de que el grafo se arme escaneando archivos de texto en tiempo real, **al guardar una idea, el código busca ese patrón, encuentra el `id` de la idea referenciada, y crea una fila en la tabla `conexiones`**. El grafo, entonces, se construye consultando esa tabla directamente — más rápido y confiable que volver a escanear texto cada vez, especialmente con datos en la nube.

### Regla de visibilidad en el grafo (se mantiene igual que en v1)
- Filas de `ideas` con `tipo = "idea"` → siempre aparecen como nodo en el grafo, tengan o no conexiones todavía
- Filas de `ideas` con `tipo = "nota"` → **no aparecen como nodo por defecto**, solo son visibles en el tablero de notas. Si en algún momento se les agrega una conexión `[[...]]` hacia otra idea (y por lo tanto aparece una fila suya en `conexiones`), pasan a formar parte del grafo automáticamente
- Filas de `tareas` → nunca aparecen en el grafo, viven solo en la lista de tareas

Esto evita que el grafo se llene de ruido con datos sueltos sin relación real entre sí.

### Seguridad de los datos (Row Level Security)
Cada una de las 3 tablas tiene una política de RLS en Supabase que exige `user_id = auth.uid()` — es decir, la base de datos rechaza automáticamente cualquier consulta que intente leer o modificar datos de otro usuario, sin que el código de la app tenga que verificarlo manualmente.

### Nota de compatibilidad con Obsidian (opcional, fuera del MVP de v2)
Si más adelante se quiere mantener la posibilidad de ver las ideas en Obsidian (como se probó en la v1 de un solo usuario), se podría agregar una función de **"exportar a vault local"** que genere archivos `.md` a partir de las tablas de Supabase bajo demanda. Esto es un nice-to-have, no un requisito de esta actualización.

## 4. Módulos y funcionalidades

### 4.1 Mascota flotante
- Ventana sin bordes, siempre visible ("always on top"), en Electron
- Inicio automático al encender Windows (acceso directo en `shell:startup` o configuración equivalente de Electron)
- Arrastrable manteniendo clic; se puede mover a otro monitor
- Opacidad/transparencia ajustable desde configuración
- **Auto-ocultar en pantalla completa**: la app debe detectar cuándo la ventana activa del sistema ocupa toda la pantalla (juegos en fullscreen exclusivo, video en fullscreen, etc.) y ocultar la mascota automáticamente mientras dure, mostrándola de nuevo al salir de ese modo. Se puede implementar consultando periódicamente (cada 1-2 segundos) las dimensiones de la ventana en foco con una librería como `active-win`, comparándolas contra la resolución de la pantalla.
- Animación con spritesheet PNG (imagen ya generada, con fondo transparente): estados de reposo, escribiendo/pensando, parpadeo, reacciones
- Icono en la bandeja del sistema (system tray) para acceso rápido a configuración/salir

### 4.2 Panel de captura rápida
- Se abre con un clic sobre la mascota
- Ventana pequeña con un campo de texto
- Al enviar el texto, se llama a la API de Claude (modelo **Haiku 4.5**) para:
  1. Clasificar el contenido: tarea / idea / nota
  2. Reescribirlo de forma más clara
- El resultado se guarda automáticamente en el destino correspondiente (archivo .md si es idea/nota, o fila en SQLite si es tarea)

#### 4.2.1 Detalle técnico de la llamada a la API

**Formato de respuesta esperado**

Para que el código pueda procesar la respuesta de forma confiable, Claude debe devolver **solo JSON**, sin texto adicional antes o después. Estructura esperada:

```json
{
  "tipo": "tarea",
  "texto_reescrito": "Entregar el informe de Redes el viernes 12 de septiembre.",
  "titulo_corto": "Informe de Redes",
  "curso": "Redes",
  "fecha_entrega": "2026-09-12",
  "conexiones_sugeridas": []
}
```

Notas sobre los campos:
- `tipo`: solo puede ser `"tarea"`, `"idea"` o `"nota"`
- `curso` y `fecha_entrega`: solo se llenan si `tipo` es `"tarea"`; si no aplica, van como `null`
- `conexiones_sugeridas`: solo aplica si `tipo` es `"idea"` — una lista de títulos de ideas ya existentes con las que podría conectarse (vacío en la v1, hasta implementar la fase 6 del roadmap)

**Prompt sugerido (system prompt)**

```
Eres un asistente que clasifica y mejora notas rápidas capturadas por un
estudiante de ingeniería de sistemas durante su día (en clases, viendo
videos, jugando, etc.).

Dado el texto que te llega, responde ÚNICAMENTE con un objeto JSON válido,
sin texto adicional antes ni después, sin bloques de código markdown.

El JSON debe tener esta forma exacta:
{
  "tipo": "tarea" | "idea" | "nota",
  "texto_reescrito": string,
  "titulo_corto": string (máximo 6 palabras),
  "curso": string o null,
  "fecha_entrega": string en formato YYYY-MM-DD o null,
  "conexiones_sugeridas": []
}

Reglas de clasificación:
- "tarea": algo con una fecha de entrega o una acción pendiente concreta
  (ej. "entregar informe el viernes", "revisar capítulo 3 para el examen")
- "idea": un concepto, proyecto o pensamiento propio que se le ocurrió al
  usuario (ej. una idea de app, una idea para una manualidad)
- "nota": información que quiere recordar pero que no es ni tarea ni idea
  propia (ej. un dato que dijo el profesor, una definición)

Si el texto es ambiguo, elige el tipo más probable — no dejes el campo vacío.
Reescribe el texto de forma clara y concisa, corrigiendo gramática, pero sin
inventar información que no esté en el texto original.
```

**Ejemplo de código (Node.js, usando el SDK oficial)**

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function clasificarNota(textoUsuario) {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    system: SYSTEM_PROMPT, // el prompt de arriba
    messages: [
      { role: "user", content: textoUsuario }
    ]
  });

  const textoRespuesta = response.content
    .filter(bloque => bloque.type === "text")
    .map(bloque => bloque.text)
    .join("");

  try {
    return JSON.parse(textoRespuesta);
  } catch (error) {
    // Si el JSON viene mal formado, no perder la nota del usuario
    return {
      tipo: "nota",
      texto_reescrito: textoUsuario,
      titulo_corto: textoUsuario.slice(0, 40),
      curso: null,
      fecha_entrega: null,
      conexiones_sugeridas: [],
      error_clasificacion: true
    };
  }
}
```

**Manejo de errores**

La app debe seguir funcionando aunque la API falle. Casos a cubrir:

| Situación | Qué debe hacer la app |
|---|---|
| Sin conexión a internet | Guardar el texto crudo localmente marcado como "sin procesar" y reintentar cuando vuelva la conexión |
| Error de facturación (créditos agotados) | Mostrar un aviso discreto en la app y guardar el texto sin clasificar, igual que sin internet |
| JSON de respuesta mal formado | Usar el texto crudo como "nota" por defecto (ver ejemplo de código arriba) en vez de perder la captura |
| Rate limit (muchas peticiones seguidas) | Reintentar la llamada con espera progresiva (1s, 2s, 4s) antes de rendirse |

Regla general: **nunca se debe perder lo que el usuario escribió**, incluso si la IA falla por completo — siempre se guarda al menos el texto crudo.

### 4.3 Panel expandido (ventana grande, bajo demanda)
Se abre con un botón "expandir" desde el panel de captura. Contiene pestañas o secciones:

**Tablero de notas** (tipo Kanban)
- Columnas: Tareas / Ideas / Notas sueltas / Sin clasificar
- Cada nota es una tarjeta arrastrable entre columnas (para recategorizar manualmente)
- Barra de búsqueda y filtros por fecha, curso o palabra clave
- Clic en una tarjeta abre el contenido completo para editar

**El cerebro (vista de grafo)**
- Nodos = ideas, líneas = conexiones (sólida = manual, punteada = sugerida por IA)
- Clic en un nodo resalta sus conexiones directas y atenúa el resto
- Doble clic abre la nota completa
- Hover muestra vista previa del contenido
- Clic derecho / selección múltiple para crear conexiones manuales
- Zoom y arrastre libre del lienzo
- Tamaño del nodo proporcional a su cantidad de conexiones

### 4.4 Lista de tareas
- Checklist simple ordenado por fecha de entrega próxima
- Cada tarea con curso, fecha límite y estado (pendiente/hecho)

## 5. Paleta de colores (propuesta, basada en el diseño de la mascota)

| Uso | Color | Hex |
|---|---|---|
| Primario (morado del robot) | Morado principal | `#6C5CE7` |
| Primario oscuro (acentos, hover) | Morado oscuro | `#4C3789` |
| Fondo general | Blanco hueso | `#F5F4FA` |
| Texto principal | Casi negro | `#1E1B2E` |
| Etiqueta "Tarea" | Ámbar | `#F59E0B` |
| Etiqueta "Idea" | Verde azulado | `#14B8A6` |
| Etiqueta "Nota" | Azul | `#3B82F6` |
| Conexión sugerida por IA | Gris lavanda | `#B8B0DB` |

Esta paleta es un punto de partida — ajustable si al ver la app renderizada algo no se ve bien.

## 6. Roadmap de desarrollo (fases)

1. **Captura básica**: mascota flotante + panel de captura + guardado crudo (sin IA todavía)
2. **Clasificación con IA**: integrar Claude Haiku 4.5 para clasificar y reescribir
3. **Lista de tareas**: vista simple con SQLite
4. **Tablero de notas**: vista Kanban de todo lo capturado
5. **Grafo de ideas (el cerebro)**: vista de nodos conectados, primero con conexiones manuales
6. **Pulido**: animaciones de la mascota, opacidad, configuración, sugerencias automáticas de conexión por IA

## 7. Notas de costos

- Todas las herramientas (Electron, Node.js, SQLite) son gratuitas y de código abierto
- Único costo recurrente: uso de la API de Claude (Haiku 4.5), estimado en ~S/ 3–20 al mes según volumen de uso personal
- Sin costos de licencias, hosting ni certificados para uso personal

## 8. Fuera de alcance (por ahora)

- Módulo de noticias — descartado
- Versión móvil — considerada para una fase futura, una vez terminada la versión de escritorio
- Opción B de monetización (pool de créditos compartido, pagos de terceros) — considerada para una fase de negocio futura, no se desarrolla todavía

## 9. Notip v2 — Login y conexión con Google Calendar

### Cuentas/servicios a configurar antes de implementar
- **Cuenta de Supabase** + crear un proyecto (gratis): provee la base de datos (Postgres) y el sistema de autenticación
- **Proyecto en Google Cloud Console** (gratis): un solo proyecto sirve tanto para el login como para la Calendar API
  - Habilitar la Google Calendar API
  - Configurar la pantalla de consentimiento OAuth, agregando como "usuarios de prueba" los correos de quienes probarán la app (mientras el proyecto no esté verificado por Google, límite de 100 usuarios de prueba) — **incluir aquí también la cuenta del propio desarrollador (josue.ec.4411@gmail.com)**, ya que incluso el dueño del proyecto necesita estar en esta lista para poder iniciar sesión sin quedar bloqueado, si usa una cuenta distinta a la que creó el proyecto en Cloud Console
  - Crear credenciales OAuth (Client ID + Client Secret) pidiendo los scopes: identidad básica (login) + `https://www.googleapis.com/auth/calendar.events` (crear/editar eventos)
- **No se necesita Vercel** ni ningún hosting web — Notip es una app de escritorio, Supabase ya provee el backend necesario (DB + Auth con su propia URL de callback)

### Login (Google Sign-In vía Supabase Auth)
- Se implementa con `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Al ser Electron (no una app web), el flujo OAuth debe abrir el navegador del sistema y volver a la app mediante un protocolo personalizado registrado (ej. `notip://auth-callback`), configurado como "Additional Redirect URL" en Supabase
- Cada usuario autenticado queda identificado con un `user_id` en Supabase; todas sus tablas (ideas, tareas, conexiones) se filtran por esa columna con Row Level Security
- **Sesión persistente (requisito explícito)**: la app NO debe pedir iniciar sesión cada vez que se abre. Se configura el cliente de Supabase con `persistSession: true` y un adaptador de almacenamiento basado en `electron-store` (en vez del `localStorage` por defecto, que no aplica igual en Electron). El token se renueva automáticamente en segundo plano; la sesión solo se cierra si el usuario le da clic explícito a "cerrar sesión" en la configuración

### Conexión con Google Calendar
- Cuando una nota es clasificada como `tipo: "tarea"` y tiene `fecha_entrega`, la app usa la librería `googleapis` (Node.js) junto con el token de Google obtenido en el login (Supabase lo almacena) para crear un evento
- **Flujo de confirmación (no automático)**: antes de crear el evento, la propia mascota muestra una ventana emergente propia (no una notificación nativa del sistema, por soporte inconsistente de botones de acción en Windows) preguntando "¿Agregar '[título]' a tu Google Calendar el [fecha]?" con opciones Sí/No
- Configuración futura opcional: interruptor para agregar automáticamente sin confirmar, una vez que el usuario confíe en la precisión de la clasificación
- Manejo de errores: si la creación del evento falla (sin internet, token expirado, permisos revocados), la tarea igual queda guardada en Supabase con normalidad — la sincronización con el calendario nunca debe bloquear ni perder el guardado de la tarea en sí

## 10. Distribución a otros usuarios (ej. compartir con familiares/amigos para pruebas)

Con la migración a Supabase, el problema de "rutas locales quemadas al usuario" (mencionado antes para el vault de v1) ya no aplica — los datos ahora viven en la nube, no en carpetas del disco de cada persona. Lo que sigue siendo necesario resolver antes de compartir el `.exe`:

- **Cada usuario configura su propia API key de Claude**: la app debe tener una pantalla de configuración simple donde cada persona pegue su propia clave (obtenida gratis en console.anthropic.com/platform.claude.com), guardada localmente con `electron-store` en su propia máquina. Nunca se debe empaquetar una clave personal dentro del instalador que se comparte.
- **Empaquetado con `electron-builder`**: generar un instalador `.exe` o una versión portable, en vez de compartir la carpeta del proyecto o el código fuente. Se configura en el `package.json` del proyecto.
- **Probar en "modo usuario nuevo"** antes de distribuir: instalar el `.exe` con una cuenta de Windows distinta (o al menos borrar la configuración local de `electron-store`) para confirmar que la app pide la API key y el login de Google desde cero, sin depender de configuración que solo existe en la máquina de desarrollo.
- El login de Google (Sección 9) y el almacenamiento en Supabase (Sección 3) ya están pensados para múltiples usuarios desde el diseño, así que no requieren ajuste adicional para esta distribución — cada persona que inicie sesión con su cuenta de Google automáticamente obtiene su propio espacio de datos aislado.
