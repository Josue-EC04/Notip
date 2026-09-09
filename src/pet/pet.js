'use strict';

const petSprite  = document.getElementById('pet-sprite');
const ripple     = document.getElementById('click-ripple');
const bubble     = document.getElementById('speech-bubble');
const bubbleText = document.getElementById('speech-text');

// ── Absolute Cursor Drag ──────────────────────────────────────────────────────
let isDragging = false;
let startScreenX = 0, startScreenY = 0;
let hasMoved = false;

petSprite.addEventListener('pointerdown', e => {
  if (e.button !== 0) return; // Only left click
  isDragging = true;
  hasMoved = false;
  startScreenX = e.screenX;
  startScreenY = e.screenY;
  
  // Guardar el punto de agarre exacto dentro de la ventana de 260x170 (centro del robot ~ 130, 114)
  const cx = (typeof e.clientX === 'number' && Number.isFinite(e.clientX)) ? e.clientX : 130;
  const cy = (typeof e.clientY === 'number' && Number.isFinite(e.clientY)) ? e.clientY : 114;
  window.electronAPI.startPetDrag(cx, cy);
  
  try { petSprite.setPointerCapture(e.pointerId); } catch (_) {}
  e.preventDefault();
});

petSprite.addEventListener('pointermove', e => {
  if (!isDragging) return;
  
  if (!hasMoved && (Math.abs(e.screenX - startScreenX) > 4 || Math.abs(e.screenY - startScreenY) > 4)) {
    hasMoved = true;
  }
  
  if (hasMoved) {
    window.electronAPI.petDragMove();
  }
});

function onPointerEnd(e) {
  if (!isDragging) return;
  isDragging = false;
  
  try {
    if (e.pointerId !== undefined && petSprite.hasPointerCapture(e.pointerId)) {
      petSprite.releasePointerCapture(e.pointerId);
    }
  } catch (_) {}

  window.electronAPI.stopPetDrag();

  if (!hasMoved) {
    triggerClick();
  } else {
    // Reacción divertida al ser reubicado
    const movedPool = CREATIVE_MESSAGES.moved;
    showBubble(movedPool[Math.floor(Math.random() * movedPool.length)], 2800);
  }
}

petSprite.addEventListener('pointerup', onPointerEnd);
petSprite.addEventListener('pointercancel', onPointerEnd);

function triggerClick() {
  ripple.classList.remove('active');
  void ripple.offsetWidth;
  ripple.classList.add('active');
  window.electronAPI.petClicked();
}
ripple.addEventListener('animationend', () => ripple.classList.remove('active'));

// ── Passthrough para clics fuera del sprite (evita bloquear el escritorio/ventanas) ──
let isIgnoringMouse = false;

function setWindowIgnore(ignore) {
  if (isIgnoringMouse !== ignore) {
    isIgnoringMouse = ignore;
    window.electronAPI?.setIgnoreMouseEvents(ignore, { forward: true });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // Inicialmente ignorar para clics en zonas transparentes
  setWindowIgnore(true);
});

// Al mover el cursor, comprobar si está sobre el sprite de la mascota o la burbuja
window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    setWindowIgnore(false);
    return;
  }

  const rect = petSprite?.getBoundingClientRect();
  const overSprite = rect && (
    e.clientX >= rect.left &&
    e.clientX <= rect.right &&
    e.clientY >= rect.top &&
    e.clientY <= rect.bottom
  );

  let overBubble = false;
  if (bubble && !bubble.classList.contains('hidden')) {
    const bRect = bubble.getBoundingClientRect();
    overBubble = (
      e.clientX >= bRect.left &&
      e.clientX <= bRect.right &&
      e.clientY >= bRect.top &&
      e.clientY <= bRect.bottom
    );
  }

  if (overSprite || overBubble) {
    setWindowIgnore(false);
  } else {
    setWindowIgnore(true);
  }
});

window.addEventListener('mouseleave', () => {
  if (!isDragging) {
    setWindowIgnore(true);
  }
});

// Menú contextual con clic derecho (opacidad, tablero, cerebro, cerrar sesión, etc.)
function handleContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  setWindowIgnore(false);
  window.electronAPI?.showPetContextMenu();
}

petSprite?.addEventListener('contextmenu', handleContextMenu);
if (bubble) bubble.addEventListener('contextmenu', handleContextMenu);
window.addEventListener('contextmenu', handleContextMenu);

// Respaldo para clic derecho en caso de que el sistema operativo no despache contextmenu
petSprite?.addEventListener('pointerup', (e) => {
  if (e.button === 2) {
    handleContextMenu(e);
  }
});

// Clic en la mascota: gestionado por triggerClick() en onPointerEnd
// (El doble clic hacia el tablero ha sido desactivado a petición del usuario)

// Clic en la burbuja para cerrarla o alternar mensaje
if (bubble) {
  bubble.addEventListener('click', (e) => {
    e.stopPropagation();
    hideBubble();
  });
}

// ── Mensajes Creativos y Dinámicos ───────────────────────────────────────────
const CREATIVE_MESSAGES = {
  manana: [
    '¡Buenos días! ¿Qué gran idea forjaremos hoy?',
    'Mente fresca, café listo... ¿Cuál es la primera meta?',
    'El día apenas comienza: a conquistar tus objetivos.',
    'Un nuevo día en Notip. ¡Listo para comenzar!',
    'Planifica hoy para que tu futuro yo te lo agradezca.',
    'Despeja tus pendientes matutinos y domina el día.'
  ],
  tarde: [
    '¿Cómo va esa productividad? Seguimos en marcha.',
    'No dejes escapar esa idea fugaz: anótala aquí.',
    'Un paso más cerca de tus metas de la semana.',
    'Tu segundo cerebro está sincronizado y atento.',
    '¿Momento de una pausa activa para revisar prioridades?',
    'Organiza tus pendientes del día y fluye sin estrés.',
    'Construyendo tu red de conocimiento personal...'
  ],
  noche: [
    'Sesión nocturna activa. ¿Últimos pendientes del día?',
    'Las mejores ideas a veces llegan de noche: captúrala.',
    'Despeja tu mente antes de descansar, yo cuido tus notas.',
    'Gran jornada hoy. Cierra ciclos y recarga energías.',
    'El archivo de tus proyectos sigue a salvo aquí.',
    'Una última nota rápida y a descansar la mente.'
  ],
  general: [
    '¿Alguna chispa de inspiración? Haz clic y anótala.',
    'Tu segundo cerebro nunca olvida una buena idea.',
    'Organiza tus notas y tareas con un solo clic.',
    'Explora El Cerebro para ver tus notas conectadas.',
    'Una idea anotada vale más que diez en el olvido.',
    'Pequeños hábitos diarios crean grandes resultados.',
    '¿Sabías que tus notas se conectan en un mapa de ideas?',
    'Notip activo: tu copiloto de ideas y tareas.',
    'El orden exterior genera claridad interior.',
    'Convierte pensamientos dispersos en proyectos reales.'
  ],
  captureOpened: [
    '¡Te escucho! ¿Qué tienes en mente?',
    '¡Cuéntame! Todo queda registrado en tu bóveda.',
    'Dime, estoy listo para estructurarlo.',
    'Escribe aquí, yo organizo el resto.',
    'Nueva semilla para tu segundo cerebro.'
  ],
  aiThinking: [
    'Analizando con Claude...',
    'Estructurando notas y conexiones...',
    'Sintetizando información...',
    'Identificando fechas y prioridades...'
  ],
  noteSaved: [
    '¡Nota guardada y estructurada en tu bóveda!',
    '¡Listo! Una idea más a salvo en tu archivo.',
    'Guardado en tu grafo de conocimiento.',
    '¡Procesado y sincronizado con éxito!'
  ],
  moved: [
    '¡Buena vista desde aquí!',
    'Reubicación completada.',
    'Nuevo puesto de trabajo asignado.'
  ]
};

function getRandomIdleMessage() {
  const hour = new Date().getHours();
  let timePool = CREATIVE_MESSAGES.general;
  if (hour >= 6 && hour < 12) {
    timePool = CREATIVE_MESSAGES.manana;
  } else if (hour >= 12 && hour < 20) {
    timePool = CREATIVE_MESSAGES.tarde;
  } else {
    timePool = CREATIVE_MESSAGES.noche;
  }
  
  const pool = (Math.random() < 0.65) ? timePool : CREATIVE_MESSAGES.general;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── State from main ──────────────────────────────────────────────────────────
let isOpen     = false;
let isThinking = false;

let captureSide = null;

window.electronAPI.on('capture-opened', (data) => {
  isOpen = true;
  captureSide = data?.side || 'right';
  petSprite.classList.add('is-open');
  const pool = CREATIVE_MESSAGES.captureOpened;
  showBubble(pool[Math.floor(Math.random() * pool.length)], 3000);
  setTimeout(() => petSprite.classList.remove('is-open'), 400);
});

window.electronAPI.on('capture-closed', () => {
  isOpen = false;
  captureSide = null;
  hideBubble();
  if (isThinking) {
    isThinking = false;
    petSprite.classList.remove('is-thinking');
  }
});

// Phase 2: AI thinking state & contextual feedback
window.electronAPI.on('set-thinking', (thinking) => {
  isThinking = thinking;
  if (thinking) {
    petSprite.classList.add('is-thinking');
    const pool = CREATIVE_MESSAGES.aiThinking;
    showBubble(pool[Math.floor(Math.random() * pool.length)], 9000);
  } else {
    petSprite.classList.remove('is-thinking');
  }
});

window.electronAPI.on('show-feedback', (feedbackText) => {
  if (feedbackText) {
    showBubble(feedbackText, 5500);
  } else {
    const pool = CREATIVE_MESSAGES.noteSaved;
    showBubble(pool[Math.floor(Math.random() * pool.length)], 3200);
  }
});

// Opacity customization
let currentOpacity = 1.0;
window.electronAPI.on('set-opacity', (val) => {
  if (typeof val === 'number') {
    currentOpacity = val;
    petSprite.style.opacity = val;
    document.documentElement.style.setProperty('--pet-opacity', val);
    if (bubble) {
      bubble.style.opacity = val;
    }
  }
});

// ── Docking State (alimentado con precisión por main.js) ──────────────────────
let currentDock = 'center';
let isTucked = false;

window.electronAPI.on('set-dock', (payload) => {
  if (typeof payload === 'string') {
    currentDock = payload || 'center';
    isTucked = false;
  } else if (payload && typeof payload === 'object') {
    currentDock = payload.dock || 'center';
    isTucked = !!payload.isTucked;
  }
  applyDockClass();
});

function applyDockClass() {
  if (!bubble) return;
  bubble.classList.remove('dock-left', 'dock-right');
  // Si el panel de captura está abierto al lado derecho, empujar el globo a la izquierda para no taparse
  if (isOpen && captureSide === 'right') {
    bubble.classList.add('dock-left');
  } else if (isOpen && captureSide === 'left') {
    bubble.classList.add('dock-right');
  } else if (currentDock === 'left') {
    bubble.classList.add('dock-left');
  } else if (currentDock === 'right') {
    bubble.classList.add('dock-right');
  }
}

// ── Speech bubble ─────────────────────────────────────────────────────────────
let bubbleTimer = null;

function showBubble(msg, duration) {
  clearTimeout(bubbleTimer);
  if (!msg) return;
  bubbleText.textContent = msg;
  applyDockClass();
  bubble.style.opacity = currentOpacity;
  bubble.classList.remove('hidden');
  
  // Duración inteligente: al menos 3.5s o más si el texto es largo para lectura cómoda
  const readDuration = duration || Math.max(3500, msg.length * 85);
  bubbleTimer = setTimeout(hideBubble, readDuration);
}

function hideBubble() {
  clearTimeout(bubbleTimer);
  bubble.classList.add('hidden');
}

// Mensajes periódicos inteligentes
setInterval(() => {
  if (!isOpen && !isThinking && !isTucked) {
    showBubble(getRandomIdleMessage());
  }
}, 55000);

