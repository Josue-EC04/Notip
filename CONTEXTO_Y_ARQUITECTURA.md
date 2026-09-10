# 📖 NOTIP — Contexto General, Visión, Arquitectura y Guía para Codex

> **Documento Oficial de Contexto Técnico y de Producto**  
> **Versión del Proyecto:** 2.0 (Fase de Pruebas Alfa Cerrada)  
> **Autor / Creador:** Josué  
> **Stack Principal:** Electron, Node.js, SQLite (better-sqlite3), Vanilla JS/HTML5/CSS3, Anthropic Claude API, Supabase (Auth + PostgreSQL), Google Calendar API.

---

## 1. 🌟 ¿Qué es Notip?

**Notip** es un asistente de productividad y segundo cerebro para escritorio (Windows), diseñado con una estética editorial cálida (*Warm Linen & Cream*). A diferencia de las aplicaciones de notas tradicionales o herramientas web lentas, Notip se ejecuta de forma nativa en el sistema con un impacto mínimo en recursos y cuenta con una **mascota interactiva inteligente** que vive en el escritorio.

### Módulos Principales de la Aplicación:
1. **La Mascota de Escritorio (`petWindow`)**: Un compañero visual interactivo (un robot espacial amigable de 96×96 px) que flota sobre la pantalla. Permite acceder a la captura rápida con un clic, arrastrarlo a cualquier borde o esquina, y ver notificaciones contextuales. Posee **passthrough dinámico del ratón** para no bloquear clics a iconos o ventanas debajo.
2. **Captura Rápida Inteligente (`captureWindow`)**: Se abre al instante con un clic en la mascota o con el atajo global `Alt + Barra espaciadora`. Cuenta con procesamiento de lenguaje natural impulsado por **Claude (Anthropic)** para categorizar notas, extraer tareas pendientes, detectar fechas y sugerir conexiones.
3. **Tablero Kanban de Tareas (`boardWindow`)**: Tablero estilo Kanban con columnas *Por Hacer*, *En Progreso* y *Terminadas*, con filtros dinámicos (prioridad, fecha, más recientes), tiempos de entrega y sincronización bidireccional.
4. **El Cerebro Neuronal (`brainWindow`)**: Visualizador interactivo en grafo con física de resortes (D3-force / HTML5 Canvas). Muestra todas las ideas del usuario conectadas como neuronas; la IA analiza el contenido y genera enlaces semánticos automáticos entre notas afines.
5. **Pizarra Infinita / Canvas (`canvasWindow`)**: Espacio libre infinito con tarjetas visuales, conectores manuales y zoom/pan suave para diagramar pensamientos complejos (similar a Miro u Obsidian Canvas).
6. **Integración con Google Calendar**: Detección automática de fechas y eventos dentro de las notas para agendarlos en el Google Calendar real del usuario con un solo clic.

---

## 2. 💡 Historia, Visión de Negocio y Estado Actual

### 2.1. El Plan Original: Sistema de Saldo y Créditos por Usuario
Desde el inicio, se planteó un modelo de negocio basado en consumo de tokens de IA:
- **Concepto**: Cada usuario registrado en Notip tendría un contador de créditos en su cuenta (almacenado en la tabla `creditos` de Supabase).
- **Ejemplo de referencia**: Se consideró una tasa inicial equivalente a **300 créditos = 3 soles peruanos (~$0.80 USD)**, lo que permitía aproximadamente 300 interacciones rápidas con la IA.
- **Mecanismo pensado**: Cada vez que el usuario capturaba una nota con IA, consultaba al chat o autoconectaba su cerebro, la aplicación descontaría créditos de su saldo en Supabase. Si el saldo llegaba a 0, se le invitaría a recargar o el uso de la IA se pausaría.

### 2.2. La Decisión Actual: Fase de Prueba Alfa Cerrada (Sin Cobro)
Al preparar el lanzamiento y las primeras pruebas reales, se tomó una decisión estratégica fundamental:
- **Priorizar la experiencia y el feedback**: Bloquear a los primeros usuarios por falta de saldo o cobrarles en esta fase inicial frenaría el testeo del producto. Por ello, **el sistema de descuento de créditos se congeló temporalmente**.
- **Distribución a 2 amigos de confianza**: Se generó el instalador ejecutable (`dist/Notip Setup 1.0.0.exe`) y se compartió directamente con **2 amigos cercanos**. El objetivo es que ellos prueben intensivamente la app en sus computadoras de uso diario (laptop personal, trabajo, estudios).
- **La API Key de Claude en el instalador**:
  - Para que estos 2 amigos pudieran disfrutar de la IA de Claude sin tener que crearse una cuenta de desarrollador en Anthropic ni pagar por su propia clave, **el instalador incluye la API Key de Claude del propio creador**.
  - **Motivo**: Existe plena confianza mutua con estos testers.
  - **Panel de configuración de API Key**: A pesar de incluir la API Key por defecto, se diseñó e implementó un panel de ajustes en la interfaz (`#modal-settings` en Quick Capture). Allí, cualquier usuario puede consultar el estado de la IA o ingresar su propia clave de Anthropic si lo desea, la cual tiene prioridad sobre la clave predeterminada.

### 2.3. Próximo Paso (Fase Comercial y Saldo Real)
Una vez finalizada la fase de pruebas y validados los casos de uso, el plan es reactivar el sistema de créditos:
- Integrar pasarela de pago (MercadoPago / Stripe / Yape / Plin) para comprar paquetes de créditos.
- Ofrecer un plan gratuito básico (ej. 30 consultas mensuales) y saldo recargable para usuarios intensivos.
- Opcionalmente, permitir el modo *Bring Your Own Key* (BYOK) para desarrolladores o usuarios avanzados.

---

## 3. 🏗️ Arquitectura Técnica del Sistema

### 3.1. Paradigma "Local-First" con Sincronización en la Nube
Notip adopta el principio de arquitectura **Local-First**:
1. **Velocidad y Offline**: Todo lo que el usuario escribe se guarda primero y de inmediato en su máquina:
   - **Notas**: Se guardan como archivos Markdown (`.md`) con encabezados YAML en la carpeta de usuario (`%APPDATA%/Notip/vault/` en Windows). El usuario es dueño de sus archivos y puede abrirlos incluso con Obsidian o cualquier editor de texto.
   - **Tareas**: Se guardan en una base de datos local SQLite (`tasks.db`) usando `better-sqlite3`.
   - **Posiciones del Canvas**: Se guardan en `.canvas_layout.json` dentro de la bóveda local.
   - **Posición de la Mascota**: Se guarda en el almacenamiento de configuración local (`electron-store`), respetando la resolución de pantalla de cada equipo.
2. **Sincronización en Supabase (PostgreSQL en la Nube)**:
   - En cuanto hay conexión a internet y el usuario ha iniciado sesión con su cuenta de Google, Notip sincroniza las notas a la tabla `ideas` y las tareas a la tabla `tareas`.
   - La seguridad está garantizada por **Row Level Security (RLS)** de Supabase: cada fila está ligada al `user_id` de la cuenta de Google del usuario.

---

## 4. 🪟 Sistema Multi-Ventana de Electron (`main.js`)

| Ventana | Dimensiones / Modo | Propósito | Comportamiento Clave |
| :--- | :--- | :--- | :--- |
| **`petWindow`** | `260 × 170` (Frameless, Transparente, Always-on-top) | Mascota de escritorio y burbuja de diálogo | **Passthrough Dinámico**: Solo el sprite del robot (96×96) captura el ratón (`setIgnoreMouseEvents(false)`). El resto del área transparente deja pasar los clics hacia el fondo (`setIgnoreMouseEvents(true, { forward: true })`). La burbuja tiene `pointer-events: none` para no estorbar. |
| **`captureWindow`** | `460 × auto` (Frameless, Flotante) | Captura rápida de notas y chat con IA | Se posiciona automáticamente al lado del robot. Atajo global: `Alt + Espacio`. Cierra con `Escape`. Incluye panel de configuración de API Key. |
| **`boardWindow`** | `1120 × 740` (Ventana completa con controles nativos simulados) | Tablero Kanban de tareas | Filtros por estado, ordenamiento por fecha/prioridad, edición in-place y creación de tareas sincronizadas. |
| **`brainWindow`** | `1200 × 800` (Pantalla de grafo) | El Cerebro (Grafo de Conocimiento) | Renderiza nodos interconectados con física. Ejecuta el algoritmo de auto-conexión semántica con Claude. |
| **`canvasWindow`** | `1280 × 820` (Pizarra Infinita) | Pizarra de Notas y tarjetas libres | Zoom interactivo, conexiones visuales y arrastre de tarjetas con persistencia de coordenadas (X, Y). |
| **`authWindow`** | `480 × 600` (Ventana de Login centrada) | Inicio de sesión con Google | Interfaz elegante con botón de Google OAuth. Maneja deep linking vía protocolo `notip://`. |

---

## 5. 🔐 Autenticación y Persistencia de Sesión

### 5.1. Flujo OAuth con Google y Supabase
1. El usuario hace clic en "Iniciar sesión con Google".
2. Se genera la URL de autorización de Supabase y se abre en el navegador predeterminado del sistema operativo.
3. Google valida la identidad del usuario y redirige al callback de Supabase.
4. Supabase redirige al deep link personalizado registrado en Windows: `notip://auth-callback#access_token=...&refresh_token=...`.
5. El proceso principal de Electron intercepta la URL, intercambia los tokens y almacena la sesión.

### 5.2. Persistencia y Renovación Automática de Token (`refresh_token`)
- **Problema resuelto**: Los tokens JWT de Supabase caducan en 1 hora (`3600s`). Anteriormente, si el usuario apagaba su PC por más de 1 hora, al encenderla la app detectaba la expiración y borraba la sesión, obligando a iniciar sesión todos los días.
- **Solución implementada (`restoreOrRefreshSession`)**:
  - Al arrancar la aplicación, `client.js` verifica la sesión guardada en `notip-auth`.
  - Si el token está próximo a expirar o ya expiró, utiliza automáticamente el **`refresh_token`** para solicitar un nuevo token de acceso a Supabase sin molestar al usuario.
  - Si el equipo está sin internet (modo offline), **no borra la sesión**: permite al usuario entrar y usar su segundo cerebro local sin ningún bloqueo.

---

## 6. 🤖 Motor de Inteligencia Artificial (Claude / Anthropic)

Ubicación: `src/ai/classifier.js`

### Capacidades del Motor de IA:
1. **Auto-Clasificación Inteligente**:
   - Analiza el texto crudo introducido por el usuario.
   - Determina si se trata de una **idea**, una **tarea accionable** o una **nota de estudio/reunión**.
   - Asigna título sintetizado, etiquetas (`tags`) relevantes y nivel de prioridad (`urgente`, `alta`, `normal`, `baja`).
2. **Extracción Temporal para Google Calendar**:
   - Si el texto menciona fechas o plazos (ej. *"Reunión con el equipo el viernes a las 4pm"*), la IA extrae la fecha en formato ISO y parámetros para crear el evento en Calendar.
3. **Prevención de Sobrescritura de Notas (Contexto Previo)**:
   - Para evitar que el usuario continúe escribiendo accidentalmente sobre la misma nota anterior, el sistema detecta si la nueva captura es continuación de la anterior o un pensamiento nuevo independiente.
4. **Auto-Conexión del Grafo (El Cerebro)**:
   - Analiza todas las notas existentes en la bóveda y descubre relaciones semánticas entre conceptos aparentemente desconectados, creando enlaces bidireccionales en el grafo.

---

## 7. 📁 Estructura del Repositorio

```
Notip/
├── .env                         # Variables de entorno activas (Supabase y Anthropic API)
├── .env.example                 # Plantilla de variables para nuevos entornos
├── main.js                      # Proceso principal de Electron (gestión de ventanas, IPC, OAuth, tray)
├── preload.js                   # Puente seguro contextBridge entre Node y las ventanas del navegador
├── package.json                 # Dependencias, scripts y configuración de empaquetado electron-builder
├── CONTEXTO_Y_ARQUITECTURA.md   # Este documento maestro de contexto para el equipo y Codex
├── README.md                    # Descripción pública y guía rápida de arranque
│
├── src/
│   ├── ai/
│   │   └── classifier.js        # Integración con Anthropic Claude (clasificación, conexiones, prompts)
│   ├── assets/
│   │   ├── mascot.png           # Sprite de la mascota interactiva
│   │   └── icons/               # Iconos de la aplicación en formatos .ico y .png
│   ├── auth/
│   │   ├── auth.html            # Pantalla de Login con Google OAuth
│   │   ├── auth.css             # Estilos de la pantalla de Login (Warm Linen)
│   │   └── auth.js              # Controlador del flujo de autenticación en el renderer
│   ├── board/
│   │   ├── board.html           # Interfaz del Tablero Kanban de tareas
│   │   ├── board.css            # Estilos del Tablero Kanban
│   │   └── board.js             # Lógica de estados, drag & drop, filtros y ordenamiento
│   ├── brain/
│   │   ├── brain.html           # Interfaz del Cerebro (Grafo Neuronal)
│   │   ├── brain.css            # Estilos del visualizador del grafo
│   │   └── brain.js             # Motor gráfico con física de resortes y nodos cuánticos
│   ├── canvas/
│   │   ├── canvas.html          # Interfaz de la Pizarra de Notas
│   │   ├── canvas.css           # Estilos de la pizarra infinita
│   │   └── canvas.js            # Lógica de pan/zoom, creación de tarjetas y conexiones
│   ├── capture/
│   │   ├── capture.html         # Ventana de captura rápida y diálogo con el asistente
│   │   ├── capture.css          # Estilos de captura rápida y modal de ajustes
│   │   └── capture.js           # Controlador de entrada de texto, atajos y configuración de API Key
│   ├── db/
│   │   └── database.js          # Inicialización y consultas de la base de datos local SQLite (better-sqlite3)
│   ├── notes/
│   │   └── notesManager.js      # Lectura, escritura, parseo y serialización de notas Markdown en la bóveda
│   ├── pet/
│   │   ├── pet.html             # Estructura del compañero de escritorio
│   │   ├── pet.css              # Animaciones, auras cósmicas y estilos del robot flotante
│   │   └── pet.js               # Passthrough de ratón dinámico, arrastre y menú contextual
│   ├── supabase/
│   │   └── client.js            # Cliente Supabase singleton, electron-store y gestor de sesiones
│   └── sync/
│       └── syncManager.js       # Sincronizador híbrido: SQLite/Markdown locales ↔ Tablas de Supabase
│
├── dist/                        # Binarios compilados listos para distribución
│   ├── Notip Setup 1.0.0.exe    # Instalador automático oficial (NSIS de 1 solo clic)
│   └── Notip 1.0.0.exe          # Versión portable directa sin instalación
│
└── supabase/
    └── migrations/              # Esquemas SQL de PostgreSQL para Supabase (ideas, tareas, creditos)
```

---

## 8. 📌 Reglas de Oro para Desarrollar con Codex / Agentes de Código

Cuando trabajes o pidas a **Codex** o cualquier modelo de código que realice cambios en Notip, ten en cuenta estas directrices inmutables:

1. **Mantener la filosofía Local-First**:
   - Cualquier función nueva de notas o tareas debe guardarse primero de forma local en la bóveda (`.md`) o en SQLite (`tasks.db`).
   - La sincronización con Supabase es un complemento en segundo plano, **nunca una dependencia bloqueante**. Si no hay internet, la app debe funcionar al 100%.
2. **Diseño Visual Vanilla sin Tailwind**:
   - Notip utiliza **Vanilla CSS puro** con variables CSS (`--bg-primary`, `--accent`, etc.) y estética *Warm Linen / Editorial*. No agregues TailwindCSS ni frameworks CSS pesados que rompan la coherencia o aumenten el bundle innecesariamente.
3. **Cuidado con las Ventanas Transparentes en Windows**:
   - La ventana de la mascota (`petWindow`) depende del passthrough inteligente con `window.electronAPI.setIgnoreMouseEvents(ignore, { forward: true })`. Si agregas elementos flotantes en esa ventana, asegúrate de no bloquear accidentalmente los clics del usuario sobre su pantalla.
4. **Rutas en Producción vs Desarrollo (`vaultPath`)**:
   - En desarrollo, la bóveda puede estar en `./vault`, pero cuando la app está empaquetada (`app.isPackaged`), la ruta **siempre** debe ser `path.join(app.getPath('userData'), 'vault')`. Escribir en `process.resourcesPath` o en el directorio de la aplicación instalada falla por permisos de Windows.
5. **Persistencia de Sesión Segura**:
   - Nunca borres la sesión del usuario únicamente porque `expires_at` esté en el pasado; para eso existe `restoreOrRefreshSession()` con el `refresh_token`. Solo se elimina la sesión si el usuario pulsa explícitamente "Cerrar sesión" (`auth-logout`).

---

## 9. 🚀 Comandos de Terminal Frecuentes

```bash
# Iniciar en modo desarrollo
npm start

# Verificar sintaxis de un archivo JS antes de compilar
node -c main.js
node -c src/supabase/client.js

# Compilar los ejecutables de distribución para Windows (.exe e instalador)
npm run dist
```

---
*Este documento resume la visión y arquitectura técnica de Notip. Mantén actualizado este archivo si agregas nuevos módulos o cambias flujos esenciales.*
