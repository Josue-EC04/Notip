'use strict';

// ─── State ──────────────────────────────────────────────────────────────────
let allTasks     = [];
let activeFilter = 'todas';
let searchQuery  = '';
let currentSort  = 'prioridad';
let dragTaskId   = null;
let toastTimer   = null;
let editTaskId   = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const searchInput  = document.getElementById('search-input');
const searchClear  = document.getElementById('search-clear');
const btnAddQuick  = document.getElementById('btn-add-quick');
const btnClose     = document.getElementById('btn-close');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalClose   = document.getElementById('modal-close');
const modalCancel  = document.getElementById('modal-cancel');
const modalSave    = document.getElementById('modal-save');
const fieldTitulo      = document.getElementById('field-titulo');
const fieldDescripcion = document.getElementById('field-descripcion');
const fieldCurso       = document.getElementById('field-curso');
const fieldFecha       = document.getElementById('field-fecha');
const fieldHora        = document.getElementById('field-hora');
const fieldEstado      = document.getElementById('field-estado');
const fieldPrioridad   = document.getElementById('field-prioridad');
const editTaskIdEl     = document.getElementById('edit-task-id');
const toast            = document.getElementById('toast');
const statPending      = document.getElementById('stat-pending');
const statDone         = document.getElementById('stat-done');

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  await loadTasks();
  setupEvents();
}

async function loadTasks() {
  try {
    allTasks = await window.electronAPI.getTasks('todas');
  } catch (e) {
    allTasks = [];
  }
  renderBoard();
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderBoard() {
  // Guardar posición de scroll actual de cada columna
  const scrollPositions = {
    pendiente: document.getElementById('list-pendiente')?.scrollTop || 0,
    progreso:  document.getElementById('list-progreso')?.scrollTop || 0,
    hecho:     document.getElementById('list-hecho')?.scrollTop || 0,
  };

  const filtered = filterTasks(allTasks, activeFilter, searchQuery);

  const cols = { pendiente: [], progreso: [], hecho: [] };
  filtered.forEach(t => {
    const est = t.estado === 'progreso' ? 'progreso' : t.estado === 'hecho' ? 'hecho' : 'pendiente';
    cols[est].push(t);
  });

  // Ordenar determinísticamente cada columna: Alta prioridad primero, luego fechas más próximas
  renderCol('pendiente', sortColumnTasks(cols.pendiente));
  renderCol('progreso',  sortColumnTasks(cols.progreso));
  renderCol('hecho',     sortColumnTasks(cols.hecho));

  // Restaurar posiciones de scroll para evitar que salte arriba
  Object.keys(scrollPositions).forEach(estado => {
    const el = document.getElementById(`list-${estado}`);
    if (el && scrollPositions[estado] > 0) {
      el.scrollTop = scrollPositions[estado];
    }
  });

  updateStats();
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

function sortColumnTasks(tasks) {
  const prioWeights = { alta: 3, media: 2, normal: 1, baja: 0 };
  return [...tasks].sort((a, b) => {
    if (currentSort === 'recientes') {
      // Más recientes primero (por fecha de creación o ID descendente)
      const ta = a.fecha_creacion ? new Date(a.fecha_creacion).getTime() : 0;
      const tb = b.fecha_creacion ? new Date(b.fecha_creacion).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return (b.id || 0) - (a.id || 0);
    }

    if (currentSort === 'antiguos') {
      // Más antiguos primero (por fecha de creación o ID ascendente)
      const ta = a.fecha_creacion ? new Date(a.fecha_creacion).getTime() : Infinity;
      const tb = b.fecha_creacion ? new Date(b.fecha_creacion).getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      return (a.id || 0) - (b.id || 0);
    }

    if (currentSort === 'fecha_entrega') {
      // Por fecha de entrega más próxima
      if (a.fecha_entrega && !b.fecha_entrega) return -1;
      if (!a.fecha_entrega && b.fecha_entrega) return 1;
      if (a.fecha_entrega && b.fecha_entrega) {
        const cmp = a.fecha_entrega.localeCompare(b.fecha_entrega);
        if (cmp !== 0) return cmp;
        if (a.hora_entrega && b.hora_entrega) {
          return a.hora_entrega.localeCompare(b.hora_entrega);
        }
      }
      return (b.id || 0) - (a.id || 0);
    }

    // Por defecto: 'prioridad' (Por importancia: Alta > Media > Normal)
    const pa = prioWeights[a.prioridad || 'normal'] || 1;
    const pb = prioWeights[b.prioridad || 'normal'] || 1;
    if (pa !== pb) return pb - pa;

    if (a.fecha_entrega && !b.fecha_entrega) return -1;
    if (!a.fecha_entrega && b.fecha_entrega) return 1;
    if (a.fecha_entrega && b.fecha_entrega) {
      const cmp = a.fecha_entrega.localeCompare(b.fecha_entrega);
      if (cmp !== 0) return cmp;
      if (a.hora_entrega && b.hora_entrega) {
        return a.hora_entrega.localeCompare(b.hora_entrega);
      }
    }

    return (b.id || 0) - (a.id || 0);
  });
}

function getTaskCategory(task) {
  const cursoLower = (task.curso || '').toLowerCase().trim();
  // 1. Coincidencia directa por nombre de categoría
  if (cursoLower === 'universidad' || cursoLower === 'uni') return 'universidad';
  if (cursoLower === 'trabajo' || cursoLower === 'laboral') return 'trabajo';
  if (cursoLower === 'personal') return 'personal';
  if (cursoLower === 'otro') return 'otro';

  // 2. Coincidencia contextual inteligente analizando curso Y título
  const text = `${task.curso || ''} ${task.titulo || ''}`.toLowerCase();
  
  if (text.match(/trabajo|empresa|laboral|jefe|cliente|reunión|reunion|oficina|reporte|informe|sprint|standup|ticket|deploy|factura|presupuesto|entrevista|sueldo|salario|aws|route 53|route53|cloud|servidor|produccion|infraestructura|api|backend|frontend/)) {
    return 'trabajo';
  }
  if (text.match(/univ|facultad|carrera|curso|materia|clase|profesor|profe|docente|parcial|examen|final|práctica|practica|laboratorio|tesis|tarea|deber|calcul|física|fisica|química|quimica|biolog|historia|derecho|ingeni|programac|algoritmo|matemát|matemat|estadíst|estadist|filosofía|filosofia|financier|finanza|econom|investig|apunte|estudio|estudiar/)) {
    return 'universidad';
  }
  if (text.match(/personal|casa|hogar|familia|gym|gimnasio|entreno|rutina|salud|médico|medico|doctor|cita|comprar|compra|supermercado|mercado|pago|servicio|amigo|viaje|cumple|calendar|calendario|echo|alexa|steam|hábito|habito/)) {
    return 'personal';
  }
  return 'otro';
}

function filterTasks(tasks, filter, query) {
  return tasks.filter(t => {
    // Filter by category
    if (filter !== 'todas') {
      const cat = getTaskCategory(t);
      if (filter !== cat) return false;
    }
    // Search
    if (query) {
      const q = query.toLowerCase();
      const haystack = `${t.titulo} ${t.curso || ''} ${t.descripcion || ''} ${t.fecha_entrega || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function renderCol(estado, tasks) {
  const listEl  = document.getElementById(`list-${estado}`);
  const emptyEl = document.getElementById(`empty-${estado}`);
  const countEl = document.getElementById(`count-${estado}`);

  const prevScroll = listEl ? listEl.scrollTop : 0;

  // Remove old cards but keep the empty placeholder
  const cards = listEl.querySelectorAll('.task-card');
  cards.forEach(c => c.remove());

  countEl.textContent = tasks.length;

  if (tasks.length === 0) {
    emptyEl.classList.remove('hidden');
    const pEl = emptyEl.querySelector('p');
    if (pEl) {
      if (activeFilter !== 'todas') {
        const catLabel = activeFilter.charAt(0).toUpperCase() + activeFilter.slice(1);
        pEl.textContent = `Sin tareas en "${catLabel}"`;
      } else {
        const defaultMsgs = {
          pendiente: 'Sin tareas pendientes',
          progreso:  'Ninguna en progreso',
          hecho:     'Ninguna completada aún',
        };
        pEl.textContent = defaultMsgs[estado] || 'Sin tareas';
      }
    }
    return;
  }
  emptyEl.classList.add('hidden');

  const fragment = document.createDocumentFragment();
  tasks.forEach(t => {
    const card = buildCard(t, estado);
    fragment.appendChild(card);
  });
  listEl.appendChild(fragment);

  if (prevScroll > 0) {
    listEl.scrollTop = prevScroll;
  }
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function moveTaskDirect(taskId, newEstado) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  const prevEstado = task.estado;
  if (prevEstado === newEstado) return;

  try {
    await window.electronAPI.updateTaskState(taskId, newEstado);
    task.estado = newEstado;
    renderBoard();
    showToast(`Tarea movida a "${colLabel(newEstado)}"`, 'success');
  } catch (err) {
    showToast('Error al mover la tarea', 'error');
  }
}

function buildCard(task, colState) {
  const card = document.createElement('div');
  const prio = task.prioridad || 'normal';
  card.className = `task-card prio-${prio}` + (colState === 'hecho' ? ' done-card' : '');
  card.dataset.id = task.id;
  if (task.curso) card.dataset.curso = task.curso;
  card.draggable = true;

  // 1. Header row: Priority Badge + Hover Actions
  const headerRow = document.createElement('div');
  headerRow.className = 'card-header-row';

  const prioBadge = document.createElement('span');
  prioBadge.className = `prio-badge prio-${prio}`;
  if (prio === 'alta') {
    prioBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> Alta`;
  } else if (prio === 'media') {
    prioBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> Media`;
  } else {
    prioBadge.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 14 14"/></svg> Normal`;
  }
  headerRow.appendChild(prioBadge);

  // Quick hover action buttons (Edit, Delete)
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const btnEdit = document.createElement('button');
  btnEdit.className = 'card-btn btn-edit';
  btnEdit.title = 'Editar tarea';
  btnEdit.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  btnEdit.addEventListener('click', e => { e.stopPropagation(); openEditModal(task); });

  const btnDel = document.createElement('button');
  btnDel.className = 'card-btn btn-delete';
  btnDel.title = 'Eliminar tarea';
  btnDel.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>`;
  btnDel.addEventListener('click', e => { e.stopPropagation(); deleteTask(task.id, task.titulo); });

  actions.appendChild(btnEdit);
  actions.appendChild(btnDel);
  headerRow.appendChild(actions);

  card.appendChild(headerRow);

  // 2. Title
  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = task.titulo || 'Sin título';
  title.addEventListener('click', () => openEditModal(task));
  card.appendChild(title);

  // 2.1 Description snippet
  if (task.descripcion && task.descripcion.trim()) {
    const descEl = document.createElement('div');
    descEl.className = 'card-desc';
    descEl.textContent = task.descripcion.trim();
    descEl.title = task.descripcion.trim();
    descEl.addEventListener('click', () => openEditModal(task));
    card.appendChild(descEl);
  }

  // 3. Meta row: Category + Due Date & Time
  const meta = document.createElement('div');
  meta.className = 'card-meta';

  const detectedCategory = getTaskCategory(task);
  const displayCat = task.curso || (detectedCategory !== 'otro' ? (detectedCategory.charAt(0).toUpperCase() + detectedCategory.slice(1)) : null);
  if (displayCat) {
    const tagCurso = document.createElement('span');
    tagCurso.className = 'meta-tag tag-curso';
    tagCurso.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> ${escapeHtml(displayCat)}`;
    meta.appendChild(tagCurso);
  }

  if (task.fecha_entrega || task.hora_entrega) {
    const tagDate = document.createElement('span');
    let dateLabel = '';
    let cls = '';
    if (task.fecha_entrega) {
      const dateInfo = getDateInfo(task.fecha_entrega);
      dateLabel = dateInfo.label;
      cls = dateInfo.cls;
    }
    if (task.hora_entrega) {
      const timeVal = task.hora_entrega.trim();
      dateLabel = dateLabel ? `${dateLabel} · ${timeVal}` : `A las ${timeVal}`;
      if (!cls) cls = 'soon';
    }
    tagDate.className = `meta-tag tag-date ${cls}`;
    tagDate.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${escapeHtml(dateLabel)}`;
    meta.appendChild(tagDate);
  }

  // Fecha y hora de creación
  if (task.fecha_creacion) {
    const createdInfo = formatCreationDateTime(task.fecha_creacion);
    if (createdInfo) {
      const tagCreated = document.createElement('span');
      tagCreated.className = 'meta-tag card-created';
      tagCreated.title = `Creada el ${createdInfo.full}`;
      tagCreated.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg> Creada: ${escapeHtml(createdInfo.label)}`;
      meta.appendChild(tagCreated);
    }
  }

  if (meta.children.length) {
    card.appendChild(meta);
  }

  // 4. Footer Actions: Direct 1-Click State Movers
  const footerRow = document.createElement('div');
  footerRow.className = 'card-footer-actions';

  const moveBtns = document.createElement('div');
  moveBtns.className = 'card-move-btns';

  if (colState === 'pendiente') {
    const btnToProg = document.createElement('button');
    btnToProg.type = 'button';
    btnToProg.className = 'btn-card-move';
    btnToProg.title = 'Pasar a En Progreso';
    btnToProg.innerHTML = `<span>Iniciar</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>`;
    btnToProg.addEventListener('click', e => {
      e.stopPropagation();
      moveTaskDirect(task.id, 'progreso');
    });

    const btnDone = document.createElement('button');
    btnDone.type = 'button';
    btnDone.className = 'btn-card-move btn-move-done';
    btnDone.title = 'Marcar como Completado';
    btnDone.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><span>Listo</span>`;
    btnDone.addEventListener('click', e => {
      e.stopPropagation();
      moveTaskDirect(task.id, 'hecho');
    });

    moveBtns.appendChild(btnToProg);
    moveBtns.appendChild(btnDone);
  } else if (colState === 'progreso') {
    const btnToPend = document.createElement('button');
    btnToPend.type = 'button';
    btnToPend.className = 'btn-card-move';
    btnToPend.title = 'Regresar a Pendiente';
    btnToPend.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>`;
    btnToPend.addEventListener('click', e => {
      e.stopPropagation();
      moveTaskDirect(task.id, 'pendiente');
    });

    const btnDone = document.createElement('button');
    btnDone.type = 'button';
    btnDone.className = 'btn-card-move btn-move-done';
    btnDone.title = 'Completar tarea';
    btnDone.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg><span>Completar</span>`;
    btnDone.addEventListener('click', e => {
      e.stopPropagation();
      moveTaskDirect(task.id, 'hecho');
    });

    moveBtns.appendChild(btnToPend);
    moveBtns.appendChild(btnDone);
  } else {
    // hecho
    const btnReopen = document.createElement('button');
    btnReopen.type = 'button';
    btnReopen.className = 'btn-card-move btn-move-reopen';
    btnReopen.title = 'Reabrir tarea';
    btnReopen.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg><span>Reabrir</span>`;
    btnReopen.addEventListener('click', e => {
      e.stopPropagation();
      moveTaskDirect(task.id, 'pendiente');
    });
    moveBtns.appendChild(btnReopen);
  }

  footerRow.appendChild(moveBtns);
  card.appendChild(footerRow);

  // Drag events
  card.addEventListener('dragstart', e => {
    dragTaskId = task.id;
    setTimeout(() => card.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragTaskId = null;
    document.querySelectorAll('.col-body').forEach(b => b.classList.remove('drag-over'));
  });

  return card;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getDateInfo(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((d - today) / 86400000);

  let label = formatDate(d);
  let cls = '';

  if (diff < 0)       { cls = 'overdue'; label = `Vencida · ${label}`; }
  else if (diff === 0){ cls = 'soon';    label = `Hoy · ${label}`; }
  else if (diff === 1){ cls = 'soon';    label = `Mañana · ${label}`; }
  else if (diff <= 3) { cls = 'soon'; }

  return { label, cls };
}

function formatDate(d) {
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

// ─── Drag & Drop handlers (called from HTML) ──────────────────────────────────
window.handleDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const body = e.currentTarget;
  if (!body.classList.contains('drag-over')) {
    body.classList.add('drag-over');
  }
};

window.handleDragLeave = function(e) {
  const body = e.currentTarget;
  if (!body.contains(e.relatedTarget)) {
    body.classList.remove('drag-over');
  }
};

window.handleDrop = async function(e, newEstado) {
  e.preventDefault();
  const body = e.currentTarget;
  body.classList.remove('drag-over');

  if (!dragTaskId) return;

  const task = allTasks.find(t => t.id === dragTaskId);
  if (!task) return;

  const currentCol = task.estado === 'hecho' ? 'hecho' : task.estado === 'progreso' ? 'progreso' : 'pendiente';
  if (currentCol === newEstado) return;

  try {
    await window.electronAPI.updateTaskState(dragTaskId, newEstado);
    // Update local state
    task.estado = newEstado;
    renderBoard();
    showToast(`Tarea movida a "${colLabel(newEstado)}"`, 'success');
  } catch (err) {
    showToast('Error al mover la tarea', 'error');
  }
};

function colLabel(estado) {
  return estado === 'pendiente' ? 'Pendiente' : estado === 'progreso' ? 'En progreso' : 'Completado';
}

// ─── Actions ─────────────────────────────────────────────────────────────────
async function toggleDone(id) {
  try {
    const result = await window.electronAPI.toggleTask(id);
    const task = allTasks.find(t => t.id === id);
    if (task && result) {
      task.estado = result.estado;
      renderBoard();
    }
  } catch (e) {
    showToast('Error al actualizar la tarea', 'error');
  }
}

async function deleteTask(id, nombre) {
  try {
    await window.electronAPI.deleteTask(id);
    allTasks = allTasks.filter(t => t.id !== id);
    renderBoard();
    showToast(`"${nombre || 'Tarea'}" eliminada`, 'info');
  } catch (e) {
    showToast('Error al eliminar la tarea', 'error');
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  const total   = allTasks.length;
  const done    = allTasks.filter(t => t.estado === 'hecho').length;
  const pending = total - done;

  statPending.textContent = `${pending} pendiente${pending !== 1 ? 's' : ''}`;
  statDone.textContent    = `${done} completada${done !== 1 ? 's' : ''}`;

  // Telemetry progress bar
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const telemetryPercent = document.getElementById('telemetry-percent');
  const telemetryStatus  = document.getElementById('telemetry-status');
  const telemetryBar     = document.getElementById('telemetry-bar');

  if (telemetryPercent) telemetryPercent.textContent = `${pct}%`;
  if (telemetryStatus)  telemetryStatus.textContent  = `${done} de ${total} listas`;
  if (telemetryBar)     telemetryBar.style.width     = `${pct}%`;

  // Category counts
  const countTodas = document.getElementById('chip-count-todas');
  const countUniv  = document.getElementById('chip-count-universidad');
  const countTrab  = document.getElementById('chip-count-trabajo');
  const countPers  = document.getElementById('chip-count-personal');
  const countOtro  = document.getElementById('chip-count-otro');

  if (countTodas) countTodas.textContent = total;
  if (countUniv)  countUniv.textContent  = filterTasks(allTasks, 'universidad', '').length;
  if (countTrab)  countTrab.textContent  = filterTasks(allTasks, 'trabajo', '').length;
  if (countPers)  countPers.textContent  = filterTasks(allTasks, 'personal', '').length;
  if (countOtro)  countOtro.textContent  = filterTasks(allTasks, 'otro', '').length;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openAddModal(defaultState = 'pendiente') {
  editTaskId = null;
  editTaskIdEl.value = '';
  modalTitle.textContent = 'Nueva tarea';
  fieldTitulo.value = '';
  if (fieldDescripcion) fieldDescripcion.value = '';
  fieldCurso.value  = '';
  fieldFecha.value  = '';
  if (fieldHora) fieldHora.value = '';
  fieldEstado.value = defaultState;
  if (fieldPrioridad) fieldPrioridad.value = 'normal';
  modalOverlay.classList.remove('hidden');
  modalOverlay.style.display = 'flex';
  setTimeout(() => fieldTitulo.focus(), 50);
}

function openEditModal(task) {
  editTaskId = task.id;
  editTaskIdEl.value = task.id;
  modalTitle.textContent = 'Editar tarea';
  fieldTitulo.value = task.titulo || '';
  if (fieldDescripcion) fieldDescripcion.value = task.descripcion || '';
  fieldCurso.value  = task.curso  || '';
  fieldFecha.value  = task.fecha_entrega || '';
  if (fieldHora) fieldHora.value = task.hora_entrega || '';
  // Map DB estado to select options
  const est = task.estado === 'hecho' ? 'hecho' : task.estado === 'progreso' ? 'progreso' : 'pendiente';
  fieldEstado.value = est;
  if (fieldPrioridad) fieldPrioridad.value = task.prioridad || 'normal';
  modalOverlay.classList.remove('hidden');
  modalOverlay.style.display = 'flex';
  setTimeout(() => fieldTitulo.focus(), 50);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalOverlay.style.display = 'none';
  editTaskId = null;
}

async function saveModal() {
  const titulo = fieldTitulo.value.trim();
  if (!titulo) { fieldTitulo.focus(); return; }

  const data = {
    titulo,
    descripcion:   fieldDescripcion && fieldDescripcion.value.trim() ? fieldDescripcion.value.trim() : null,
    curso:         fieldCurso.value.trim() || null,
    fecha_entrega: fieldFecha.value || null,
    hora_entrega:  fieldHora && fieldHora.value ? fieldHora.value.trim() : null,
    estado:        fieldEstado.value,
    prioridad:     fieldPrioridad ? fieldPrioridad.value : 'normal',
  };

  try {
    if (editTaskId) {
      // Edit existing
      await window.electronAPI.updateTask(editTaskId, data);
      const idx = allTasks.findIndex(t => t.id === editTaskId);
      if (idx !== -1) Object.assign(allTasks[idx], data);
      showToast('Tarea actualizada', 'success');
    } else {
      // New task
      const created = await window.electronAPI.addTask({
        ...data,
        fecha_creacion: new Date().toISOString(),
      });
      if (created) allTasks.push(created);
      showToast('Tarea creada', 'success');
    }
    renderBoard();
    closeModal();
  } catch (e) {
    showToast('Error al guardar la tarea', 'error');
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
  // Close window
  btnClose.addEventListener('click', () => window.electronAPI.closeBoard());

  // Open brain button
  const btnOpenBrain = document.getElementById('btn-open-brain');
  btnOpenBrain?.addEventListener('click', () => window.electronAPI.openBrain());

  // Open canvas button
  const btnOpenCanvas = document.getElementById('btn-open-canvas');
  btnOpenCanvas?.addEventListener('click', () => window.electronAPI.openCanvas());

  // New task button
  btnAddQuick.addEventListener('click', openAddModal);

  // Modal
  modalClose?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeModal(); });
  modalCancel?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeModal(); });
  modalSave?.addEventListener('click', (e) => { e.preventDefault(); saveModal(); });
  modalOverlay?.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalOverlay?.classList.contains('hidden')) {
      e.preventDefault();
      closeModal();
    }
  });

  // Modal enter key
  [fieldTitulo, fieldCurso, fieldFecha, fieldHora].filter(Boolean).forEach(el => {
    el.addEventListener('keydown', e => { if (e.key === 'Enter') saveModal(); });
  });
  fieldEstado.addEventListener('keydown', e => { if (e.key === 'Enter') saveModal(); });
  if (fieldDescripcion) {
    fieldDescripcion.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveModal();
    });
  }

  // Search
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !searchQuery);
    renderBoard();
  });

  // Sort selector
  const selectSort = document.getElementById('select-sort');
  if (selectSort) {
    selectSort.value = currentSort;
    selectSort.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderBoard();
    });
  }
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
    renderBoard();
    searchInput.focus();
  });

  // Filter chips
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      activeFilter = chip.dataset.filter;
      renderBoard();
    });
  });

  // Column header quick add buttons
  document.querySelectorAll('.btn-col-add').forEach(btn => {
    btn.addEventListener('click', () => {
      const col = btn.dataset.col || 'pendiente';
      openAddModal(col);
    });
  });

  // Modal quick date chips
  document.querySelectorAll('.btn-quick-date').forEach(btn => {
    btn.addEventListener('click', () => {
      const days = btn.dataset.days;
      if (days === 'clear') {
        fieldFecha.value = '';
      } else {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(days, 10));
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        fieldFecha.value = `${yyyy}-${mm}-${dd}`;
      }
    });
  });

  // Modal quick time chips
  document.querySelectorAll('.btn-quick-time').forEach(btn => {
    btn.addEventListener('click', () => {
      const time = btn.dataset.time;
      if (time === 'clear') {
        if (fieldHora) fieldHora.value = '';
      } else {
        if (fieldHora) fieldHora.value = time;
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openAddModal();
    }
    if (e.key === 'Escape') {
      if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      } else {
        window.electronAPI.closeBoard();
      }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      window.electronAPI.closeBoard();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Listen for external task updates (from capture window)
  window.electronAPI.on('board-tasks-updated', async () => {
    await loadTasks();
  });
}

// ─── Start ───────────────────────────────────────────────────────────────────
init();
