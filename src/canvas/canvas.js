'use strict';

// ─── DOM References ────────────────────────────────────────────────────────────
const container       = document.getElementById('canvas-container');
const stage           = document.getElementById('canvas-stage');
const grid            = document.getElementById('canvas-grid');
const searchInput     = document.getElementById('search-input');
const searchClear     = document.getElementById('search-clear');
const zoomLevelText   = document.getElementById('zoom-level');
const btnZoomIn       = document.getElementById('btn-zoom-in');
const btnZoomOut      = document.getElementById('btn-zoom-out');
const btnZoomFit      = document.getElementById('btn-zoom-fit');
const btnAddCard      = document.getElementById('btn-add-card');
const btnTidy         = document.getElementById('btn-tidy');
const btnOpenBrain    = document.getElementById('btn-open-brain');
const btnOpenBoard    = document.getElementById('btn-open-board');
const btnClose        = document.getElementById('btn-close');
const counterText     = document.getElementById('counter-text');
const minimapCanvas   = document.getElementById('minimap-canvas');
const minimapViewport = document.getElementById('minimap-viewport');
const minimapBox      = document.getElementById('minimap-box');
const toast           = document.getElementById('toast');
const btnTheme        = document.getElementById('btn-theme');
const themeDropdown   = document.getElementById('theme-dropdown');
const themeLabel      = document.getElementById('theme-label');

const THEME_NAMES = {
  warm: 'Editorial Crema',
  paper: 'Lino Blanco',
  slate: 'Grafito',
  chalkboard: 'Verde',
  blueprint: 'Blueprint',
};

// Modal Elements
const modalOverlay    = document.getElementById('modal-overlay');
const modalTypeBadge  = document.getElementById('modal-type-badge');
const modalTitleInput = document.getElementById('modal-title-input');
const modalTextarea   = document.getElementById('modal-textarea');
const modalDate       = document.getElementById('modal-date');
const modalTags       = document.getElementById('modal-tags');
const modalClose      = document.getElementById('modal-close');
const modalCancel     = document.getElementById('modal-cancel');
const modalSave       = document.getElementById('modal-save');
const modalDelete     = document.getElementById('modal-delete');

// ─── State ────────────────────────────────────────────────────────────────────
let allNotes = [];
let layout = {}; // { [filename]: { x, y, width, height, color } }
let activeEditingNote = null;
let highestZIndex = 100;

// Camera (Pan & Zoom)
const camera = {
  x: 80,
  y: 60,
  scale: 1.0,
  minScale: 0.25,
  maxScale: 2.2,
};

let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let isSpacePressed = false;

// Color Palette for Cards
const COLOR_PRESETS = [
  { name: 'Violeta', hex: '#8B5CF6', glow: 'rgba(139, 92, 246, 0.35)' },
  { name: 'Cian',    hex: '#00F2FE', glow: 'rgba(0, 242, 254, 0.35)' },
  { name: 'Esmeralda', hex: '#10B981', glow: 'rgba(16, 185, 129, 0.35)' },
  { name: 'Ámbar',   hex: '#F59E0B', glow: 'rgba(245, 158, 11, 0.35)' },
  { name: 'Rosa',    hex: '#F43F5E', glow: 'rgba(244, 63, 94, 0.35)' },
  { name: 'Azul',    hex: '#3B82F6', glow: 'rgba(59, 130, 246, 0.35)' },
];

function getDefaultColorForType(type) {
  switch (type) {
    case 'idea':         return '#8B5CF6';
    case 'recordatorio': return '#00F2FE';
    case 'estudio':      return '#10B981';
    case 'tarea':        return '#F59E0B';
    default:             return '#3B82F6';
  }
}

function formatCreationDateTime(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return null;

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const day = d.getDate();
  const month = months[d.getMonth()];

  let label = '';
  if (isToday) {
    label = `Hoy ${timeStr}`;
  } else if (isYesterday) {
    label = `Ayer ${timeStr}`;
  } else {
    label = `${day} ${month} · ${timeStr}`;
  }

  const full = d.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return { label, full, timeStr };
}

// ─── Performance & Layout Cache ───────────────────────────────────────────────
let cachedContainerWidth = 0;
let cachedContainerHeight = 0;
let cameraRafId = null;
let minimapRafId = null;

function updateCachedContainerSize() {
  if (container) {
    cachedContainerWidth = container.clientWidth || window.innerWidth;
    cachedContainerHeight = container.clientHeight || (window.innerHeight - 46);
  }
}
window.addEventListener('resize', updateCachedContainerSize);

function requestMinimapRender() {
  if (minimapRafId) return;
  minimapRafId = requestAnimationFrame(() => {
    minimapRafId = null;
    renderMinimap();
  });
}

// ─── Initialization ───────────────────────────────────────────────────────────
async function init() {
  updateCachedContainerSize();
  initCanvasTheme();
  setupEventListeners();
  await loadData();
  renderAllCards();
  updateCamera();
}

function applyCanvasTheme(themeName) {
  ['theme-warm', 'theme-paper', 'theme-slate', 'theme-chalkboard', 'theme-blueprint', 'theme-cosmos', 'theme-obsidian'].forEach(cls => {
    container.classList.remove(cls);
  });
  container.classList.add(`theme-${themeName}`);

  if (themeLabel) themeLabel.textContent = THEME_NAMES[themeName] || 'Fondo';

  document.querySelectorAll('#theme-dropdown .theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === themeName);
  });

  try { localStorage.setItem('notip_canvas_theme', themeName); } catch (_) {}
}

function initCanvasTheme() {
  let savedTheme = 'warm';
  try {
    savedTheme = localStorage.getItem('notip_canvas_theme') || 'warm';
  } catch (_) {}
  applyCanvasTheme(savedTheme);
}

async function loadData() {
  try {
    const [notes, savedLayout] = await Promise.all([
      window.electronAPI.getVaultNotes(),
      window.electronAPI.getCanvasLayout(),
    ]);
    allNotes = notes || [];
    layout = savedLayout || {};
    assignPositionsToNewNotes();
    updateCounter();
  } catch (err) {
    console.error('[canvas.js] Error al cargar notas o layout:', err);
    allNotes = [];
    layout = {};
  }
}

function assignPositionsToNewNotes() {
  let col = 0;
  let row = 0;
  const colWidth = 320;
  const rowHeight = 260;
  const maxCols = 4;

  allNotes.forEach((note, idx) => {
    if (!layout[note.filename]) {
      const x = 120 + col * colWidth;
      const y = 100 + row * rowHeight;
      layout[note.filename] = {
        x,
        y,
        width: 280,
        height: 200,
        color: getDefaultColorForType(note.tipo),
      };

      col++;
      if (col >= maxCols) {
        col = 0;
        row++;
      }
    }
  });
}

function updateCounter() {
  if (counterText) {
    counterText.textContent = `${allNotes.length} nota${allNotes.length === 1 ? '' : 's'}`;
  }
}

// ─── Camera (Pan & Zoom Engine) ───────────────────────────────────────────────
function updateCamera() {
  if (cameraRafId) cancelAnimationFrame(cameraRafId);
  cameraRafId = requestAnimationFrame(() => {
    cameraRafId = null;
    stage.style.transform = `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`;
    grid.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
    grid.style.backgroundSize = `${28 * camera.scale}px ${28 * camera.scale}px, ${112 * camera.scale}px ${112 * camera.scale}px`;
    zoomLevelText.textContent = `${Math.round(camera.scale * 100)}%`;
    requestMinimapRender();
  });
}

function setZoom(newScale, focalX = null, focalY = null) {
  const targetScale = Math.max(camera.minScale, Math.min(newScale, camera.maxScale));
  if (targetScale === camera.scale) return;

  const rect = container.getBoundingClientRect();
  const fx = focalX !== null ? focalX - rect.left : rect.width / 2;
  const fy = focalY !== null ? focalY - rect.top : rect.height / 2;

  // Preserve focal point
  camera.x = fx - (fx - camera.x) * (targetScale / camera.scale);
  camera.y = fy - (fy - camera.y) * (targetScale / camera.scale);
  camera.scale = targetScale;

  updateCamera();
}

function fitAllNotes() {
  if (allNotes.length === 0) {
    camera.x = 80;
    camera.y = 60;
    camera.scale = 1.0;
    updateCamera();
    return;
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  allNotes.forEach(note => {
    const l = layout[note.filename];
    if (l) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + (l.width || 280));
      maxY = Math.max(maxY, l.y + (l.height || 200));
    }
  });

  const padding = 80;
  const boundingW = (maxX - minX) + padding * 2;
  const boundingH = (maxY - minY) + padding * 2;
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  const scaleX = containerW / boundingW;
  const scaleY = containerH / boundingH;
  const targetScale = Math.max(camera.minScale, Math.min(Math.min(scaleX, scaleY), 1.2));

  camera.scale = targetScale;
  camera.x = (containerW - (maxX - minX) * targetScale) / 2 - (minX * targetScale);
  camera.y = (containerH - (maxY - minY) * targetScale) / 2 - (minY * targetScale);

  updateCamera();
  showToast('Vista ajustada a todas las notas', 'info');
}

// ─── Render Sticky Note Cards ─────────────────────────────────────────────────
function renderAllCards() {
  stage.innerHTML = '';
  allNotes.forEach(note => {
    const card = createCardElement(note);
    stage.appendChild(card);
  });
  renderMinimap();
}

function createCardElement(note) {
  const noteLayout = layout[note.filename] || {
    x: 100,
    y: 100,
    width: 280,
    height: 200,
    color: getDefaultColorForType(note.tipo),
  };

  const card = document.createElement('div');
  card.className = 'canvas-card';
  card.dataset.filename = note.filename;
  card.style.left = `${noteLayout.x}px`;
  card.style.top = `${noteLayout.y}px`;
  if (noteLayout.width) card.style.width = `${noteLayout.width}px`;
  if (noteLayout.height) card.style.height = `${noteLayout.height}px`;

  const color = noteLayout.color || getDefaultColorForType(note.tipo);
  card.style.setProperty('--card-color', color);
  card.style.setProperty('--card-glow', `${color}40`);

  // Content rendering
  const titleText = note.titulo || note.filename.replace(/\.md$/, '');
  const bodyText = note.content || 'Sin contenido...';
  const typeText = note.tipo || 'nota';

  const createdInfo = formatCreationDateTime(note.creado || note.fecha);
  const createdBadgeHtml = createdInfo ? `
    <span class="card-created-pill" title="Fecha y hora de creación: ${escapeHtml(createdInfo.full)}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      ${escapeHtml(createdInfo.label)}
    </span>
  ` : '';

  const tagsHtml = (note.tags && Array.isArray(note.tags) && note.tags.length > 0)
    ? `<div class="card-tags">${note.tags.slice(0, 3).map(t => `<span class="card-tag">#${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  card.innerHTML = `
    <div class="card-header">
      <div class="card-header-left">
        <span class="card-type-badge">${escapeHtml(typeText)}</span>
        <span class="card-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</span>
      </div>
      <div class="card-header-right">
        <div class="color-picker-wrap">
          <button class="color-swatch-btn" title="Cambiar color"></button>
          <div class="color-dropdown hidden">
            ${COLOR_PRESETS.map(c => `<div class="color-opt" style="background:${c.hex};" data-color="${c.hex}" title="${c.name}"></div>`).join('')}
          </div>
        </div>
        <button class="card-btn btn-open" title="Abrir y editar detalle">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="card-btn btn-del" title="Eliminar nota">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-text">${formatMarkdownSnippet(bodyText)}</div>
      <div class="card-meta-bar">
        ${createdBadgeHtml}
        ${tagsHtml}
      </div>
    </div>
    <div class="card-resize-handle" title="Arrastra para redimensionar"></div>
  `;

  // Attach card event handlers
  setupCardEvents(card, note);

  return card;
}

function setupCardEvents(card, note) {
  const header = card.querySelector('.card-header');
  const btnDel = card.querySelector('.btn-del');
  const btnOpen = card.querySelector('.btn-open');
  const colorBtn = card.querySelector('.color-swatch-btn');
  const colorDropdown = card.querySelector('.color-dropdown');
  const resizeHandle = card.querySelector('.card-resize-handle');

  // Open Edit Modal on double click
  card.addEventListener('dblclick', e => {
    e.stopPropagation();
    openEditModal(note);
  });

  btnOpen.addEventListener('click', e => {
    e.stopPropagation();
    openEditModal(note);
  });

  // Delete Card
  btnDel.addEventListener('click', async e => {
    e.stopPropagation();
    const confirmed = confirm(`¿Deseas eliminar la nota "${note.titulo || note.filename}"?`);
    if (confirmed) {
      await deleteNote(note.filename);
    }
  });

  // Color Dropdown Toggle
  colorBtn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.color-dropdown').forEach(d => {
      if (d !== colorDropdown) d.classList.add('hidden');
    });
    colorDropdown.classList.toggle('hidden');
  });

  colorDropdown.querySelectorAll('.color-opt').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const newColor = opt.dataset.color;
      card.style.setProperty('--card-color', newColor);
      card.style.setProperty('--card-glow', `${newColor}40`);
      if (!layout[note.filename]) layout[note.filename] = {};
      layout[note.filename].color = newColor;
      colorDropdown.classList.add('hidden');
      saveLayoutDebounced();
      renderMinimap();
    });
  });

  // Dragging the card from ANYWHERE (header, body, edges) — GPU-Accelerated
  card.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; // Only left click
    if (e.target.closest('.card-btn') || e.target.closest('.color-picker-wrap') || e.target.closest('.card-resize-handle') || e.target.closest('.color-dropdown')) return;
    e.stopPropagation();

    // Bring this card to front
    highestZIndex++;
    card.style.zIndex = highestZIndex;

    const startX = e.clientX;
    const startY = e.clientY;
    const initialLeft = parseFloat(card.style.left) || 0;
    const initialTop = parseFloat(card.style.top) || 0;
    let hasMoved = false;
    let currentDx = 0;
    let currentDy = 0;
    let dragRafId = null;

    try { card.setPointerCapture(e.pointerId); } catch (_) {}

    function onPointerMove(moveEvent) {
      const dist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (dist > 3) {
        if (!hasMoved) {
          hasMoved = true;
          card.classList.add('is-dragging');
        }
        currentDx = (moveEvent.clientX - startX) / camera.scale;
        currentDy = (moveEvent.clientY - startY) / camera.scale;

        if (!dragRafId) {
          dragRafId = requestAnimationFrame(() => {
            dragRafId = null;
            card.style.transform = `translate3d(${currentDx}px, ${currentDy}px, 0)`;
          });
        }
      }
    }

    function onPointerUp(upEvent) {
      if (dragRafId) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      card.classList.remove('is-dragging');
      try { card.releasePointerCapture(upEvent.pointerId); } catch (_) {}
      card.removeEventListener('pointermove', onPointerMove);
      card.removeEventListener('pointerup', onPointerUp);
      card.removeEventListener('pointercancel', onPointerUp);

      if (hasMoved) {
        const finalLeft = Math.round(initialLeft + currentDx);
        const finalTop = Math.round(initialTop + currentDy);

        card.style.transform = '';
        card.style.left = `${finalLeft}px`;
        card.style.top = `${finalTop}px`;

        if (!layout[note.filename]) layout[note.filename] = {};
        layout[note.filename].x = finalLeft;
        layout[note.filename].y = finalTop;

        requestMinimapRender();
        saveLayoutDebounced();
      }
    }

    card.addEventListener('pointermove', onPointerMove);
    card.addEventListener('pointerup', onPointerUp);
    card.addEventListener('pointercancel', onPointerUp);
  });

  // Resizing the card — RAF Throttled
  resizeHandle.addEventListener('mousedown', e => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = card.offsetWidth;
    const initialH = card.offsetHeight;
    let targetW = initialW;
    let targetH = initialH;
    let resizeRafId = null;

    function onResizeMove(moveEvent) {
      const dw = (moveEvent.clientX - startX) / camera.scale;
      const dh = (moveEvent.clientY - startY) / camera.scale;
      targetW = Math.max(220, Math.round(initialW + dw));
      targetH = Math.max(140, Math.round(initialH + dh));

      if (!resizeRafId) {
        resizeRafId = requestAnimationFrame(() => {
          resizeRafId = null;
          card.style.width = `${targetW}px`;
          card.style.height = `${targetH}px`;
        });
      }
    }

    function onResizeUp() {
      if (resizeRafId) {
        cancelAnimationFrame(resizeRafId);
        resizeRafId = null;
      }
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeUp);

      card.style.width = `${targetW}px`;
      card.style.height = `${targetH}px`;

      if (!layout[note.filename]) layout[note.filename] = {};
      layout[note.filename].width = targetW;
      layout[note.filename].height = targetH;

      saveLayoutDebounced();
      requestMinimapRender();
    }

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeUp);
  });
}

// ─── Auto-Organize in Clean Grid ──────────────────────────────────────────────
function autoOrganizeGrid() {
  if (allNotes.length === 0) return;

  const cardWidth = 300;
  const cardHeight = 240;
  const gap = 36;
  const cols = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(allNotes.length * 1.3))));

  allNotes.forEach((note, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const targetX = 100 + col * (cardWidth + gap);
    const targetY = 100 + row * (cardHeight + gap);

    if (!layout[note.filename]) layout[note.filename] = {};
    layout[note.filename].x = targetX;
    layout[note.filename].y = targetY;
    layout[note.filename].width = cardWidth;
    layout[note.filename].height = cardHeight;

    const el = stage.querySelector(`.canvas-card[data-filename="${note.filename}"]`);
    if (el) {
      el.style.transition = 'left 0.35s cubic-bezier(0.16, 1, 0.3, 1), top 0.35s cubic-bezier(0.16, 1, 0.3, 1), width 0.35s, height 0.35s';
      el.style.left = `${targetX}px`;
      el.style.top = `${targetY}px`;
      el.style.width = `${cardWidth}px`;
      el.style.height = `${cardHeight}px`;
      setTimeout(() => { el.style.transition = ''; }, 400);
    }
  });

  saveLayoutDebounced();
  setTimeout(fitAllNotes, 200);
  showToast('Notas organizadas en cuadrícula', 'success');
}

// ─── Interactive Minimap (Radar) ──────────────────────────────────────────────
function renderMinimap() {
  if (!minimapCanvas) return;
  const ctx = minimapCanvas.getContext('2d');
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;

  ctx.clearRect(0, 0, w, h);

  if (allNotes.length === 0) return;

  // Calculate world bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  allNotes.forEach(n => {
    const l = layout[n.filename];
    if (l) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + (l.width || 280));
      maxY = Math.max(maxY, l.y + (l.height || 200));
    }
  });

  const cw = cachedContainerWidth || (container ? container.clientWidth : window.innerWidth);
  const ch = cachedContainerHeight || (container ? container.clientHeight : window.innerHeight);

  // Include current viewport in bounding box
  const viewLeft = -camera.x / camera.scale;
  const viewTop = -camera.y / camera.scale;
  const viewRight = viewLeft + cw / camera.scale;
  const viewBottom = viewTop + ch / camera.scale;

  minX = Math.min(minX, viewLeft) - 80;
  minY = Math.min(minY, viewTop) - 80;
  maxX = Math.max(maxX, viewRight) + 80;
  maxY = Math.max(maxY, viewBottom) + 80;

  const worldW = maxX - minX;
  const worldH = maxY - minY;
  if (worldW <= 0 || worldH <= 0) return;

  const mapScale = Math.min(w / worldW, h / worldH);

  // Draw cards on minimap
  allNotes.forEach(n => {
    const l = layout[n.filename];
    if (l) {
      const mx = (l.x - minX) * mapScale;
      const my = (l.y - minY) * mapScale;
      const mw = (l.width || 280) * mapScale;
      const mh = (l.height || 200) * mapScale;

      ctx.fillStyle = l.color || '#8B5CF6';
      ctx.globalAlpha = 0.75;
      ctx.fillRect(mx, my, Math.max(3, mw), Math.max(3, mh));
    }
  });

  ctx.globalAlpha = 1.0;

  // Update viewport indicator box
  const vpX = (viewLeft - minX) * mapScale;
  const vpY = (viewTop - minY) * mapScale;
  const vpW = (cw / camera.scale) * mapScale;
  const vpH = (ch / camera.scale) * mapScale;

  minimapViewport.style.left = `${Math.max(0, vpX)}px`;
  minimapViewport.style.top = `${Math.max(0, vpY)}px`;
  minimapViewport.style.width = `${Math.min(w, vpW)}px`;
  minimapViewport.style.height = `${Math.min(h, vpH)}px`;
}

// Click on minimap to jump
minimapBox.addEventListener('click', e => {
  if (allNotes.length === 0) return;
  const rect = minimapBox.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  allNotes.forEach(n => {
    const l = layout[n.filename];
    if (l) {
      minX = Math.min(minX, l.x);
      minY = Math.min(minY, l.y);
      maxX = Math.max(maxX, l.x + (l.width || 280));
      maxY = Math.max(maxY, l.y + (l.height || 200));
    }
  });

  const viewLeft = -camera.x / camera.scale;
  const viewTop = -camera.y / camera.scale;
  const viewRight = viewLeft + container.clientWidth / camera.scale;
  const viewBottom = viewTop + container.clientHeight / camera.scale;

  minX = Math.min(minX, viewLeft) - 80;
  minY = Math.min(minY, viewTop) - 80;
  maxX = Math.max(maxX, viewRight) + 80;
  maxY = Math.max(maxY, viewBottom) + 80;

  const worldW = maxX - minX;
  const worldH = maxY - minY;
  const mapScale = Math.min(minimapCanvas.width / worldW, minimapCanvas.height / worldH);

  const targetWorldX = minX + clickX / mapScale;
  const targetWorldY = minY + clickY / mapScale;

  camera.x = container.clientWidth / 2 - targetWorldX * camera.scale;
  camera.y = container.clientHeight / 2 - targetWorldY * camera.scale;

  updateCamera();
});

// ─── Fast New Note on Double-Click Empty Canvas ───────────────────────────────
container.addEventListener('dblclick', async e => {
  if (e.target.closest('.canvas-card') || e.target.closest('.minimap-box') || e.target.closest('.canvas-hint') || e.target.closest('.canvas-counter')) return;

  const rect = container.getBoundingClientRect();
  const clickX = (e.clientX - rect.left - camera.x) / camera.scale;
  const clickY = (e.clientY - rect.top - camera.y) / camera.scale;

  await createNewNoteAt(clickX, clickY);
});

async function createNewNoteAt(worldX = null, worldY = null) {
  const defaultText = 'Nueva idea o nota rápida...';
  try {
    const res = await window.electronAPI.saveNote(defaultText, 'idea');
    if (res && res.success) {
      const filename = res.titulo || res.filePath?.split(/[\\/]/).pop() || `nota_${Date.now()}.md`;
      
      const posX = worldX !== null ? Math.round(worldX - 140) : Math.round((-camera.x + container.clientWidth / 2) / camera.scale - 140);
      const posY = worldY !== null ? Math.round(worldY - 100) : Math.round((-camera.y + container.clientHeight / 2) / camera.scale - 100);

      layout[filename] = {
        x: posX,
        y: posY,
        width: 280,
        height: 200,
        color: '#8B5CF6',
      };
      saveLayoutDebounced();

      showToast('Nueva nota creada en la pizarra', 'success');
      await loadData();
      renderAllCards();

      const createdNote = allNotes.find(n => n.filename === filename);
      if (createdNote) openEditModal(createdNote);
    }
  } catch (err) {
    showToast('Error al crear la nota', 'error');
  }
}

// ─── Modal Note Editor ────────────────────────────────────────────────────────
function openEditModal(note) {
  activeEditingNote = note;
  modalTypeBadge.textContent = note.tipo || 'nota';
  modalTitleInput.value = note.titulo || note.filename.replace(/\.md$/, '');
  modalTextarea.value = note.content || '';

  const createdInfo = formatCreationDateTime(note.creado || note.fecha);
  const dateDisplay = createdInfo ? `Creada: ${createdInfo.label}` : (note.fecha || new Date().toISOString().split('T')[0]);
  modalDate.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(dateDisplay)}`;
  if (createdInfo) {
    modalDate.title = `Creada el ${createdInfo.full}`;
  } else {
    modalDate.removeAttribute('title');
  }

  modalTags.innerHTML = '';
  if (note.tags && Array.isArray(note.tags)) {
    note.tags.forEach(t => {
      const tagEl = document.createElement('span');
      tagEl.className = 'card-tag';
      tagEl.textContent = `#${t}`;
      modalTags.appendChild(tagEl);
    });
  }

  modalOverlay.classList.remove('hidden');
  modalTitleInput.focus();
}

function closeEditModal() {
  modalOverlay.classList.add('hidden');
  activeEditingNote = null;
}

modalClose.addEventListener('click', closeEditModal);
modalCancel.addEventListener('click', closeEditModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeEditModal();
});

modalSave.addEventListener('click', async () => {
  if (!activeEditingNote) return;
  const newTitle = modalTitleInput.value.trim();
  const newContent = modalTextarea.value;

  try {
    await window.electronAPI.updateNoteContent(activeEditingNote.filename, {
      titulo: newTitle,
      content: newContent,
    });
    showToast('Nota actualizada en la bóveda', 'success');
    closeEditModal();
    await loadData();
    renderAllCards();
  } catch (err) {
    showToast('Error al guardar los cambios', 'error');
  }
});

modalDelete.addEventListener('click', async () => {
  if (!activeEditingNote) return;
  const confirmed = confirm(`¿Estás seguro de que deseas eliminar la nota "${activeEditingNote.titulo || activeEditingNote.filename}"?`);
  if (confirmed) {
    await deleteNote(activeEditingNote.filename);
    closeEditModal();
  }
});

async function deleteNote(filename) {
  try {
    await window.electronAPI.deleteNote(filename);
    delete layout[filename];
    saveLayoutDebounced();
    showToast('Nota eliminada', 'info');
    await loadData();
    renderAllCards();
  } catch (err) {
    showToast('Error al eliminar la nota', 'error');
  }
}

// ─── Pan & Zoom Event Listeners ───────────────────────────────────────────────
function setupEventListeners() {
  // Global Keyboard shortcuts for Pan & Space
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
      isSpacePressed = true;
      container.classList.add('panning');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (!modalOverlay.classList.contains('hidden')) {
        closeEditModal();
      }
      document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
    }
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (!isPanning) container.classList.remove('panning');
    }
  });

  // Pan Stage with Mouse Drag
  container.addEventListener('mousedown', e => {
    if (e.target.closest('.canvas-card') || e.target.closest('.minimap-box') || e.target.closest('.canvas-hint') || e.target.closest('.canvas-counter')) return;

    // Pan with left click (on background or with space) or middle click
    if (e.button === 0 || e.button === 1 || isSpacePressed) {
      isPanning = true;
      panStartX = e.clientX - camera.x;
      panStartY = e.clientY - camera.y;
      container.classList.add('panning');
      document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
    }
  });

  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    camera.x = e.clientX - panStartX;
    camera.y = e.clientY - panStartY;
    updateCamera();
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      if (!isSpacePressed) container.classList.remove('panning');
    }
  });

  // Zoom with Wheel
  container.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom(camera.scale * zoomFactor, e.clientX, e.clientY);
  }, { passive: false });

  // Zoom Buttons
  btnZoomIn.addEventListener('click', () => setZoom(camera.scale * 1.2));
  btnZoomOut.addEventListener('click', () => setZoom(camera.scale * 0.82));
  zoomLevelText.addEventListener('click', () => setZoom(1.0));
  btnZoomFit.addEventListener('click', fitAllNotes);

  // Titlebar Action Buttons
  btnAddCard.addEventListener('click', () => createNewNoteAt());
  btnTidy.addEventListener('click', autoOrganizeGrid);
  btnOpenBrain.addEventListener('click', () => window.electronAPI.openBrain());
  btnOpenBoard.addEventListener('click', () => window.electronAPI.openBoard());
  btnClose.addEventListener('click', () => window.electronAPI.closeCanvas());

  // Theme Picker
  btnTheme?.addEventListener('click', e => {
    e.stopPropagation();
    themeDropdown?.classList.toggle('hidden');
    document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
  });

  document.querySelectorAll('#theme-dropdown .theme-option').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      const theme = opt.dataset.theme;
      applyCanvasTheme(theme);
      themeDropdown?.classList.add('hidden');
      showToast(`Fondo cambiado a: ${THEME_NAMES[theme] || theme}`, 'info');
    });
  });

  // Close dropdowns on outside click
  window.addEventListener('click', () => {
    themeDropdown?.classList.add('hidden');
    document.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
  });

  // Search filter
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('hidden', !q);

    document.querySelectorAll('.canvas-card').forEach(card => {
      const filename = card.dataset.filename;
      const note = allNotes.find(n => n.filename === filename);
      if (!note) return;

      const title = (note.titulo || '').toLowerCase();
      const content = (note.content || '').toLowerCase();
      const tags = (note.tags || []).join(' ').toLowerCase();

      const matches = !q || title.includes(q) || content.includes(q) || tags.includes(q);
      card.classList.toggle('is-filtered-out', !matches);
    });
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  });

  // Live Sync with Vault Updates
  window.electronAPI.on('canvas-notes-updated', async () => {
    await loadData();
    renderAllCards();
  });
}

// ─── Layout Auto-Save (Debounced) ─────────────────────────────────────────────
let saveTimer = null;
function saveLayoutDebounced() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await window.electronAPI.saveCanvasLayout(layout);
    } catch (err) {
      console.error('[canvas.js] Error al guardar layout:', err);
    }
  }, 350);
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────
function formatMarkdownSnippet(text) {
  if (!text) return 'Sin contenido';
  const clean = escapeHtml(text.slice(0, 300));
  return clean
    .replace(/^#+\s+(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- \[ \]\s+(.+)$/gm, '☐ $1')
    .replace(/^- \[x\]\s+(.+)$/gm, '☑ <span style="text-decoration:line-through;opacity:0.6;">$1</span>')
    .replace(/^-\s+(.+)$/gm, '• $1');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// ─── Toast Notifications ─────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'info') {
  clearTimeout(toastTimer);
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2600);
}

// Run!
window.addEventListener('DOMContentLoaded', init);
