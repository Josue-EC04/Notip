# 🦔 Notip

> **Tu asistente editorial de escritorio, gestor de tareas y cerebro visual de notas.**

Notip es una aplicación de escritorio moderna construida sobre **Electron** que combina captura rápida con IA (Claude), un tablero Kanban intuitivo, una pizarra de notas interactiva y un cerebro neuronal visual para conectar todas tus ideas.

> 📚 **¿Desarrollando con Codex o IA?** Consulta el documento maestro de arquitectura y contexto del producto en [CONTEXTO_Y_ARQUITECTURA.md](CONTEXTO_Y_ARQUITECTURA.md).

---

## ✨ Características Principales

- **🐱 Mascota de Escritorio & Captura Inteligente**: Acceso rápido con atajos globales (`Alt + Barra espaciadora`) para capturar pensamientos, notas y conversar con Claude.
- **📋 Tablero Kanban de Tareas**:
  - Columnas organizadas: *Por Hacer*, *En Progreso*, *Terminadas*.
  - Filtros de ordenamiento dinámicos: por importancia/prioridad, más recientes, más antiguos o fecha de entrega.
  - Tiempos exactos y marcas temporales de creación.
- **🧠 El Cerebro Neuronal**: Visualización en grafo interactivo con física de resortes y fondo de nodos cuánticos interactivos con el cursor, sin distracciones visuales.
- **🎨 Pizarra de Notas (Canvas)**: Espacio infinito con tarjetas flotantes, conectores y zoom/pan suave.
- **🎨 Paleta Cálida & Estética Editorial**: Diseñada con una sofisticada paleta *Warm Linen & Cream* pensada para largas jornadas de trabajo sin fatiga visual.

---

## 🚀 Instalación y Uso

### Prerrequisitos

- [Node.js](https://nodejs.org/) (versión 18 o superior)
- Cuenta o clave de API de [Anthropic Claude](https://console.anthropic.com/)

### 1. Clonar el repositorio

```bash
git clone https://github.com/Josue-EC04/Notip.git
cd Notip
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y coloca tu API key:

```bash
cp .env.example .env
```

Edita `.env` con tu clave:
```env
ANTHROPIC_API_KEY=tu_clave_de_anthropic_aqui
```

### 4. Ejecutar la aplicación

```bash
npm start
```

---

## 🛠️ Tecnologías

- **Electron** (Backend y ventanas nativas de escritorio)
- **Node.js** & **SQLite (better-sqlite3)** (Persistencia local robusta)
- **Vanilla CSS & HTML5 Canvas** (Rendimiento extremo sin frameworks pesados)
- **Anthropic Claude API** (Procesamiento de lenguaje natural y clasificación inteligente)

---

## 📄 Licencia

Este proyecto está bajo la Licencia ISC.
