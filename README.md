# 🦔 Notip

> **Tu asistente editorial de escritorio, gestor de tareas inteligente y segundo cerebro visual con IA.**

[![Electron](https://img.shields.io/badge/Electron-30.0.0-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Anthropic Claude](https://img.shields.io/badge/Claude_AI-Anthropic-D97706?style=for-the-badge&logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_%26_Sync-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Platform](https://img.shields.io/badge/Plataforma-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://microsoft.com/windows)
[![License](https://img.shields.io/badge/Licencia-ISC-orange?style=for-the-badge)](LICENSE)

---

## 🌟 ¿Qué es Notip?

**Notip** es una aplicación de escritorio nativa para Windows diseñada bajo el paradigma **Local-First**, combinando una estética editorial cálida (*Warm Linen & Cream*) con la potencia de la inteligencia artificial de **Claude (Anthropic)**.

A diferencia de las aplicaciones web pesadas o los gestores de notas tradicionales, Notip vive en tu escritorio mediante un **compañero interactivo flotante** que te permite capturar pensamientos, estructurar tareas, conectar ideas en un grafo neuronal y organizar sesiones de estudio o trabajo sin fricción y sin perder el foco.

---

## ✨ Características Principales

### 🐱 1. Mascota de Escritorio Interactiva (`petWindow`)
- **Compañero no intrusivo**: Pequeño sprite de 96×96 px flotante y siempre visible.
- **Passthrough Dinámico del Ratón**: El sprite recibe clics y arrastre, mientras que el resto del área transparente deja pasar los clics hacia las ventanas o iconos de tu escritorio.
- **Acceso Inmediato**: Un clic sobre la mascota o el atajo global **`Alt + Barra espaciadora`** despliega la consola de captura inteligente.

### ⚡ 2. Captura Rápida & Asistente IA (`captureWindow`)
- **Procesamiento de Lenguaje Natural**: Escribe libremente («*Entregar informe de redes este viernes a las 6pm con alta prioridad*») y Claude clasificará automáticamente el texto en tarea, concepto, evento o nota libre.
- **Detección Automática**: Asigna título, fecha/hora de entrega, curso o categoría y nivel de prioridad.
- **Chat Editorial & Aclaraciones**: Conversa con Claude para expandir ideas, pedir resúmenes o reformular notas en tiempo real.
- **Bring Your Own Key (BYOK)**: Configura tu propia API Key de Anthropic Claude directamente desde la interfaz de ajustes de la aplicación.

### 🎓 3. Modo Estudiante & Productividad Sin Conexión (Offline-First)
- **Bandeja Offline Segura**: Cada captura se almacena inmediatamente en tu disco local. Si no tienes conexión a internet, la nota no se pierde: queda en cola y la IA la organiza automáticamente al reconectarse.
- **Modo Clase**: Inicia una sesión de clase, toma apuntes continuos y al finalizar la IA generará:
  - Resumen estructurado del tema.
  - Conceptos clave explicados.
  - Dudas identificadas y preguntas de autoevaluación.
- **«Tengo 15 minutos»**: Algoritmo inteligente que analiza tus tareas pendientes según urgencia, prioridad y esfuerzo estimado, recomendándote una acción concreta con un primer paso editable y bloques de enfoque (5, 15, 30 o 60 min).
- **Notas Relacionadas**: Sugerencia de conexiones entre apuntes afines basada en similitud de términos clave, funcionando de forma local sin consumir créditos de IA.

### 📋 4. Tablero Kanban de Tareas (`boardWindow`)
- **Gestión Visual de Flujo**: Columnas organizadas (*Por Hacer*, *En Progreso*, *Terminadas*).
- **Filtros Dinámicos**: Ordena por prioridad/urgencia, fecha límite, más recientes o más antiguas.
- **Marcas de Tiempo**: Fechas de creación, actualización y seguimiento del ciclo de vida de cada tarea.
- **Sincronización Inmediata**: Cualquier cambio realizado en el chat o en la bandeja se refleja al instante en el tablero.

### 🧠 5. El Cerebro Neuronal (`brainWindow`)
- **Grafo Interactivo de Conocimiento**: Visualiza todas tus notas e ideas como nodos interconectados con simulación física de fuerzas (**D3-force**).
- **Auto-conexión Semántica**: La IA analiza la relación contextual entre distintas notas y genera enlaces semánticos automáticos para descubrir patrones y asociaciones inesperadas.
- **Búsqueda Difusa (Fuzzy Search)**: Encuentra notas al instante incluso si tienes errores tipográficos o recuerdas solo una parte del contenido.
- **Fondo Cuántico Interactivo**: Efecto de partículas dinámicas que interactúan suavemente con el cursor del ratón.

### 🎨 6. Pizarra Infinita / Canvas (`canvasWindow`)
- **Lienzo Libre Estilo Miro/Obsidian**: Espacio bidimensional infinito para diagramar proyectos complejos.
- **Tarjetas y Conectores**: Arrastra notas, organízalas espacialmente y crea conexiones visuales entre ideas.
- **Zoom & Pan Suave**: Navegación fluida y persistencia de coordenadas `(X, Y)` en el almacenamiento local.

### 📅 7. Integración con Google Calendar & Notificaciones Telegram
- **Google Calendar**: Detecta entregas y reuniones para agendarlas en tu calendario real de Google mediante OAuth 2.0.
- **Bot de Telegram**: Vincula tu bot personal para recibir resúmenes matutinos (*Daily Digest*), alertas de entregas urgentes y marcar tareas como completadas desde tu teléfono móvil.

---

## 🏗️ Arquitectura del Sistema

```
                        ┌────────────────────────┐
                        │   Mascota Flotante     │
                        │      (petWindow)       │
                        └───────────┬────────────┘
                                    │ Alt + Espacio
                        ┌───────────▼────────────┐
                        │    Captura & Chat IA   │
                        │    (captureWindow)     │
                        └─────┬────────────┬─────┘
                              │            │
             ┌────────────────▼──┐      ┌──▼─────────────────┐
             │   Motor Local     │      │   Servicios Cloud  │
             │   (Offline-First) │      │   (Opcional/Sync)  │
             └────────┬──────────┘      └──┬─────────────────┘
                      │                    │
    ┌─────────────────┼────────────────────┼─────────────────┐
    │                 │                    │                 │
┌───▼──────────┐ ┌────▼─────────┐ ┌────────▼─────┐ ┌─────────▼──────┐
│  Vault Local │ │ Base SQLite  │ │   Supabase   │ │ Google Cal. /  │
│  (.md YAML)  │ │ (tasks.db)   │ │ (PostgreSQL) │ │ Bot Telegram   │
└──────────────┘ └──────────────┘ └──────────────┘ └────────────────┘
```

- **Local-First por Principio**:
  - **Notas**: Se guardan como archivos Markdown (`.md`) con Frontmatter YAML en `%APPDATA%/Notip/vault/` (o `./vault` en desarrollo). Eres el dueño absoluto de tus archivos y puedes abrirlos con Obsidian, VS Code o cualquier lector Markdown.
  - **Tareas**: Persistencia en base de datos local SQLite mediante `better-sqlite3`.
  - **Configuraciones**: Preferencias guardadas localmente mediante `electron-store`.
- **Sincronización en la Nube**:
  - Integración opcional con Supabase (PostgreSQL con políticas RLS) para respaldo de notas e ideas multi-dispositivo.
  - Autenticación segura mediante Google OAuth 2.0 con renovación automática de sesión (`refresh_token`).

---

## 🛠️ Tecnologías Utilizadas

| Capa | Tecnologías |
| :--- | :--- |
| **Entorno & Desktop** | [Electron](https://www.electronjs.org/), Node.js, IPC Main/Preload seguro con `contextBridge` |
| **Persistencia Local** | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite), File System (Markdown con YAML), `electron-store` |
| **Frontend & UI** | Vanilla JavaScript (ES2022+), CSS3 personalizado (Warm Linen Design System), HTML5 Canvas |
| **Visualización & Grafos** | D3-force (física de nodos e interacciones de resortes) |
| **Inteligencia Artificial** | [Anthropic Claude API](https://docs.anthropic.com/) (Claude 3.5 Haiku) |
| **Nube & Autenticación** | [Supabase](https://supabase.com/) (Auth, PostgreSQL, Row Level Security, Edge Functions) |
| **Integraciones Externas** | Google Calendar API, Telegram Bot API |

---

## 🚀 Instalación y Puesta en Marcha

### Prerrequisitos

- [Node.js](https://nodejs.org/) (versión 18.x o superior)
- [npm](https://www.npmjs.com/) (incluido con Node.js)
- Clave de API de [Anthropic Claude](https://console.anthropic.com/) *(opcional para uso local con IA propia)*

### 1. Clonar el Repositorio

```bash
git clone https://github.com/Josue-EC04/Notip.git
cd Notip
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Copia el archivo de plantilla `.env.example` para crear tu `.env` local:

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales:

```env
# API Key de Anthropic (para clasificación y chat con Claude)
ANTHROPIC_API_KEY=tu_clave_anthropic_aqui

# Configuración de Supabase (opcional si usas solo modo local)
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
```

> 🔒 **Nota de Seguridad**: El archivo `.env` se encuentra en `.gitignore` y **nunca** debe subirse al repositorio. También puedes ingresar tu clave de Claude directamente desde el menú de ajustes de Notip dentro de la aplicación.

### 4. Iniciar la Aplicación

```bash
npm start
```

### 5. Ejecutar Pruebas Automatizadas

Notip cuenta con una suite completa de pruebas unitarias y de integración:

```bash
# Ejecutar pruebas del motor de estudio, sesiones offline y bot de Telegram
npm test

# Ejecutar pruebas de interfaz simuladas con Electron
npm run test:ui
```

---

## ⌨️ Atajos de Teclado Globales

| Atajo | Acción |
| :--- | :--- |
| `Alt + Espacio` | Abrir / Ocultar la consola de Captura Rápida |
| `Ctrl + Shift + E` | Abrir la Bandeja de Estudio y Tareas Pendientes |
| `Escape` | Cerrar ventanas flotantes, modales o volver a la vista principal |
| `Enter` | Guardar captura o enviar mensaje en el chat |
| `Shift + Enter` | Salto de línea dentro del campo de texto |

---

## 📁 Estructura del Proyecto

```
Notip/
├── main.js                  # Proceso principal de Electron (gestión multi-ventana e IPC)
├── preload.js               # Puente seguro (contextBridge) entre Node y el renderer
├── package.json             # Dependencias y scripts del proyecto
├── .env.example             # Plantilla pública de variables de entorno
├── src/
│   ├── ai/                  # Clasificador y motor de prompts para Anthropic Claude
│   ├── auth/                # Interfaz y flujo de autenticación (Google OAuth)
│   ├── board/               # Tablero Kanban (interfaz, filtros y drag-and-drop)
│   ├── brain/               # El Cerebro: grafo interactivo con física de fuerzas
│   ├── canvas/              # Pizarra infinita con tarjetas y zoom/pan
│   ├── capture/             # Ventana de captura rápida, chat y panel de ajustes
│   ├── db/                  # Capa de base de datos SQLite (better-sqlite3)
│   ├── notes/               # Gestor de lectura/escritura de archivos Markdown
│   ├── study/               # Módulos del modo estudiante (clases, bandeja offline, enfoque)
│   ├── supabase/            # Cliente Supabase, sincronización y manejo de tokens
│   ├── telegram/            # Integración con Bot de Telegram y resúmenes diarios
│   └── utils/               # Utilidades generales y algoritmo de fuzzy search
├── supabase/
│   ├── functions/           # Supabase Edge Functions (classify, add-calendar-event)
│   └── schema.sql           # Esquema de base de datos PostgreSQL y políticas RLS
└── tests/                   # Suite de pruebas automatizadas con Node test runner
```

---

## 📄 Licencia

Este proyecto está distribuido bajo la licencia **ISC**. Consulta el archivo `package.json` para más detalles.

---

<div align="center">
  <sub>Desarrollado con ❤️ para transformar la manera en que capturamos, aprendemos y organizamos nuestras ideas.</sub>
</div>
