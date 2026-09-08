'use strict';

// ── Elements: Header & Navigation ─────────────────────────────────────────────
const btnClose          = document.getElementById('btn-close');
const btnVault          = document.getElementById('btn-vault');
const btnBrain          = document.getElementById('btn-brain');
const btnBoard          = document.getElementById('btn-board');
const btnCanvas         = document.getElementById('btn-canvas');
const notesCounter      = document.getElementById('notes-counter');

// ── Elements: Capture & Chat ──────────────────────────────────────────────────
const input             = document.getElementById('note-input');
const btnSave           = document.getElementById('btn-save');
const btnSaveText       = document.getElementById('btn-save-text');
const btnSaveIcon       = document.getElementById('btn-save-icon');
const btnSaveSpinner    = document.getElementById('btn-save-spinner');
const btnCancel         = document.getElementById('btn-cancel');
const charCounter       = document.getElementById('char-counter');
const toast             = document.getElementById('toast');
const toastMsg          = document.getElementById('toast-msg');
const toastSvgSuccess   = document.getElementById('toast-svg-success');
const toastSvgError     = document.getElementById('toast-svg-error');
const aiBar             = document.getElementById('ai-bar');
const hintLabel         = document.getElementById('hint-label');

// Dynamic Lower Console Elements
const sectionZeroState        = document.getElementById('section-zero-state');
const sectionChatStream       = document.getElementById('section-chat-stream');
const chatStreamMessages      = document.getElementById('chat-stream-messages');
const recentItemsContainer    = document.getElementById('recent-items-container');
const btnSwitchTasksLink      = document.getElementById('btn-switch-tasks-link');

// ── State ──────────────────────────────────────────────────────────────────────
let isSaving          = false;
let forcedType        = null;
let toastTimer        = null;
let activeNoteContext = null; // Contexto de la nota activa para permitir continuar el chat

// ── Elements: Result Card Actions ─────────────────────────────────────────────
const btnNewNote          = document.getElementById('btn-new-note');
const btnOpenBoardAction  = document.getElementById('btn-open-board-action');
const btnDoneClose        = document.getElementById('btn-done-close');

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  return `${d} ${months[m] || parts[1]}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
refreshCounter();
loadRecentActivity();
restoreActiveChat();

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (isNaN(diff)) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

async function loadRecentActivity() {
  if (!recentItemsContainer) return;
  try {
    const allTasks = await window.electronAPI.getTasks('todas');
    recentItemsContainer.innerHTML = '';

    if (!allTasks || allTasks.length === 0) {
      const tip = document.createElement('div');
      tip.className = 'recent-empty-tip';
      tip.innerHTML = `
        <span class="tip-icon">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </span>
        <span>Escribe con lenguaje natural: <em>"Examen de Redes el viernes a las 10am"</em> y Notip organizará fecha y prioridad automáticamente.</span>
      `;
      recentItemsContainer.appendChild(tip);
      return;
    }

    // Ordenar de más reciente a más antiguo y tomar las 2 más recientes
    const sorted = [...allTasks].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 2);

    sorted.forEach(t => {
      const card = document.createElement('div');
      card.className = 'recent-item-card';
      const isDone = t.estado === 'hecho';
      const dotCls = isDone ? 'done' : 'pending';
      const timeStr = formatRelativeTime(t.fecha_creacion);

      card.innerHTML = `
        <span class="recent-dot ${dotCls}" title="${isDone ? 'Completada' : 'Pendiente'}"></span>
        <span class="recent-card-title">${escapeHtml(t.titulo || 'Sin título')}</span>
        <span class="recent-card-meta">${escapeHtml(t.curso ? t.curso + ' · ' : '')}${timeStr}</span>
      `;

      card.addEventListener('click', () => {
        window.electronAPI.openBoard();
      });

      recentItemsContainer.appendChild(card);
    });
  } catch (err) {
    console.error('[capture] Error loading recent activity:', err);
  }
}

function restoreActiveChat() {
  // Las sesiones de captura inician siempre limpias para crear notas/tareas nuevas
  activeNoteContext = null;
}

// ── Chips Selection ───────────────────────────────────────────────────────────
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    let type = null;
    if (chip.classList.contains('chip-task')) type = 'tarea';
    else if (chip.classList.contains('chip-idea')) type = 'idea';
    else if (chip.classList.contains('chip-note')) type = 'nota';

    if (forcedType === type) {
      forcedType = null;
      chip.classList.remove('active');
      hintLabel.textContent = 'Clasificación automática activa';
    } else {
      forcedType = type;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      hintLabel.textContent = `Categoría fijada: ${type.toUpperCase()}`;
    }
  });
});

// Quick Chips (Prompts rápidos de ejemplo)
document.querySelectorAll('.quick-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const text = chip.getAttribute('data-insert') || '';
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
    charCounter.textContent = `${text.length} / 1000`;
    btnSave.disabled = false;
  });
});

if (btnSwitchTasksLink) {
  btnSwitchTasksLink.addEventListener('click', () => window.electronAPI.openBoard());
}

// ── Input (Capture View) ──────────────────────────────────────────────────────
input.addEventListener('input', () => {
  const len = input.value.length;
  charCounter.textContent = `${len} / 1000`;
  charCounter.classList.toggle('near-limit', len > 850);
  btnSave.disabled = len === 0 || isSaving;
  
  if (activeNoteContext) {
    btnSaveText.textContent = 'Enviar al chat';
  } else {
    btnSaveText.textContent = 'Guardar';
  }
});

input.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (!btnSave.disabled) handleSave();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    handleClose();
  }
});

// ── Buttons (Capture View) ────────────────────────────────────────────────────
btnSave.addEventListener('click', handleSave);
btnCancel.addEventListener('click', handleClose);
btnClose.addEventListener('click', handleClose);
btnVault.addEventListener('click', () => window.electronAPI.openVault());
btnBrain?.addEventListener('click', () => window.electronAPI.openBrain());
btnBoard?.addEventListener('click', () => window.electronAPI.openBoard());
btnCanvas?.addEventListener('click', () => window.electronAPI.openCanvas());

if (btnNewNote) {
  btnNewNote.addEventListener('click', resetToNewNote);
}
if (btnOpenBoardAction) {
  btnOpenBoardAction.addEventListener('click', () => window.electronAPI.openBoard());
}
if (btnDoneClose) {
  btnDoneClose.addEventListener('click', handleClose);
}

// ── Save flow (Capture View) ──────────────────────────────────────────────────
async function handleSave() {
  const text = input.value.trim();
  if (!text || isSaving) return;

  isSaving = true;
  hideToast();

  const isContinuation = Boolean(activeNoteContext);
  setSavingState(true, isContinuation ? 'Respondiendo...' : 'Guardando...');

  // 1. Inmediatamente mostrar el mensaje del usuario en el chat
  sectionZeroState?.classList.add('hidden');
  sectionChatStream?.classList.remove('hidden');
  appendUserMessage(text);

  // 2. Limpiar input para feedback visual instantáneo
  input.value = '';
  charCounter.textContent = '0 / 1000';

  // 3. Indicador animado de pensamiento
  appendThinkingRow();
  showAiBar();

  let result;
  try {
    result = await window.electronAPI.saveNote(text, forcedType, activeNoteContext);
  } catch (err) {
    removeThinkingRow();
    hideAiBar();
    setSavingState(false);
    showToast('Error inesperado al conectar con el sistema', true);
    isSaving = false;
    return;
  }

  // Quitar el thinking row y ocultar barra de análisis siempre
  removeThinkingRow();
  hideAiBar();

  if (!result?.success) {
    setSavingState(false);
    showToast(result?.error ?? 'No se pudo procesar la nota', true);
    isSaving = false;
    return;
  }

  // Guardar contexto activo para permitir continuar el chat
  activeNoteContext = {
    tipo:          result.tipo,
    titulo:        result.titulo,
    texto:         result.texto_reescrito || text,
    curso:         result.curso,
    fecha_entrega: result.fecha_entrega,
    hora_entrega:  result.hora_entrega,
    taskId:        result.taskId ?? activeNoteContext?.taskId ?? null,
    filePath:      result.filePath ?? activeNoteContext?.filePath ?? null,
  };

  // Persistir en localStorage
  try {
    localStorage.setItem('notip_active_chat', JSON.stringify({
      activeNoteContext,
      lastResult: result,
      lastUserText: text,
    }));
  } catch {}

  setSavingState(false);
  await refreshCounter();
  await refreshTasks();
  await loadRecentActivity();

  if (result.classified) {
    appendNotipResponse(result);
    showToast(isContinuation ? 'Respuesta de Claude lista' : (result.tipo === 'tarea' ? 'Tarea registrada en la lista' : 'Guardado en notas'));
  } else if (result.sinApiKey) {
    appendNotipResponse({
      tipo: 'sin_clasificar',
      titulo: text.slice(0, 30),
      mensaje_feedback: 'Nota guardada en tu vault (sin API Key de Claude configurada).',
    });
    showToast('Guardada sin clasificar');
  } else if (result.errorIa) {
    appendNotipResponse({
      tipo: 'sin_clasificar',
      titulo: text.slice(0, 30),
      mensaje_feedback: `Guardada · ${result.errorMsg ?? 'IA no disponible'}`,
    });
    showToast('Guardada en Vault');
  } else {
    appendNotipResponse({
      tipo: 'nota',
      titulo: text.slice(0, 30),
      mensaje_feedback: 'Nota guardada en el vault',
    });
    showToast('Nota guardada correctamente');
  }

  // Mostrar u ocultar botón de "Ver en Tablero" según el tipo
  if (btnOpenBoardAction) {
    if (result.tipo === 'tarea') {
      btnOpenBoardAction.classList.remove('hidden');
    } else {
      btnOpenBoardAction.classList.add('hidden');
    }
  }

  // Preparar input para continuar la conversación o escribir más
  btnSave.disabled = true;
  btnSaveText.textContent = 'Enviar al chat';
  input.placeholder = '¿Deseas agregar más detalles o cambiar algo?';
  hintLabel.textContent = 'En conversación con Claude';
  isSaving = false;
  setTimeout(() => input.focus(), 50);
}

function resetToNewNote() {
  activeNoteContext = null;
  try { localStorage.removeItem('notip_active_chat'); } catch {}
  hideResult();
  input.value = '';
  charCounter.textContent = '0 / 1000';
  input.placeholder = 'Escribe una tarea, idea o apunte rápido...';
  btnSaveText.textContent = 'Guardar';
  btnSave.disabled = true;
  if (btnOpenBoardAction) btnOpenBoardAction.classList.add('hidden');
  hintLabel.textContent = 'Clasificación automática activa';
  setTimeout(() => input.focus(), 40);
}

let isClosingCapture = false;

function handleClose() {
  if (isClosingCapture) return;
  isClosingCapture = true;
  hideToast();
  hideAiBar();
  setSavingState(false);
  activeNoteContext = null;
  try { localStorage.removeItem('notip_active_chat'); } catch {}
  hideResult();
  input.value = '';
  charCounter.textContent = '0 / 1000';
  input.placeholder = 'Escribe una tarea, idea o apunte rápido...';
  btnSaveText.textContent = 'Guardar';
  if (btnOpenBoardAction) btnOpenBoardAction.classList.add('hidden');

  const panel = document.getElementById('panel');
  if (panel) {
    panel.classList.remove('panel-entering');
    panel.classList.add('panel-exiting');
    setTimeout(() => {
      window.electronAPI.closeCapture();
      panel.classList.remove('panel-exiting');
      isClosingCapture = false;
    }, 160);
  } else {
    window.electronAPI.closeCapture();
    isClosingCapture = false;
  }
}

// ── UI helpers (Capture View) ─────────────────────────────────────────────────
function setSavingState(active, label = 'Guardar') {
  if (active) {
    btnSave.disabled = true;
    btnSaveText.textContent = label;
    if (btnSaveIcon) btnSaveIcon.classList.add('hidden');
    if (btnSaveSpinner) btnSaveSpinner.classList.remove('hidden');
    btnSave.style.opacity = '0.8';
  } else {
    btnSaveText.textContent = activeNoteContext ? 'Enviar al chat' : 'Guardar';
    if (btnSaveIcon) btnSaveIcon.classList.remove('hidden');
    if (btnSaveSpinner) btnSaveSpinner.classList.add('hidden');
    btnSave.style.opacity = '';
    btnSave.disabled = input.value.trim() === '';
  }
}

function showAiBar() { aiBar.classList.remove('hidden'); }
function hideAiBar() { aiBar.classList.add('hidden'); }

function appendThinkingRow() {
  if (!chatStreamMessages) return;
  removeThinkingRow();
  const row = document.createElement('div');
  row.className = 'chat-row-thinking';
  row.id = 'chat-thinking-row';
  row.innerHTML = `
    <div class="thinking-avatar"></div>
    <div class="thinking-bubble">
      <div class="thinking-dots">
        <span></span><span></span><span></span>
      </div>
      <span class="thinking-text">Claude está analizando y organizando...</span>
    </div>
  `;
  chatStreamMessages.appendChild(row);
  chatStreamMessages.scrollTop = chatStreamMessages.scrollHeight;
}

function removeThinkingRow() {
  const row = document.getElementById('chat-thinking-row');
  if (row) row.remove();
}

function appendUserMessage(text) {
  if (!chatStreamMessages) return;
  const row = document.createElement('div');
  row.className = 'chat-row-user';
  row.innerHTML = `<div class="chat-bubble-user">${escapeHtml(text)}</div>`;
  chatStreamMessages.appendChild(row);
  chatStreamMessages.scrollTop = chatStreamMessages.scrollHeight;
}

function appendNotipResponse(result) {
  if (!chatStreamMessages) return;
  const tipo = result.tipo ?? 'nota';
  const labels = { tarea: 'Tarea', idea: 'Idea', nota: 'Nota', sin_clasificar: 'Nota' };
  const badgeLabel = labels[tipo] ?? tipo;

  const row = document.createElement('div');
  row.className = 'chat-row-notip';

  const feedbackText = result.mensaje_feedback || 'Nota procesada y organizada en tu bóveda.';

  let metaTagsHtml = '';
  if (result.curso) {
    metaTagsHtml += `<span class="res-meta-pill tag-curso"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>${escapeHtml(result.curso)}</span>`;
  }
  if (result.fecha_entrega) {
    const formattedD = formatShortDate(result.fecha_entrega);
    const timeSnippet = result.hora_entrega ? ` · ${result.hora_entrega}` : '';
    metaTagsHtml += `<span class="res-meta-pill tag-date"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(formattedD + timeSnippet)}</span>`;
  } else if (result.hora_entrega) {
    metaTagsHtml += `<span class="res-meta-pill tag-date"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>A las ${escapeHtml(result.hora_entrega)}</span>`;
  }
  if (result.prioridad && result.prioridad !== 'normal') {
    metaTagsHtml += `<span class="res-meta-pill tag-prio tag-prio-${result.prioridad}"><span class="prio-indicator-dot"></span>${result.prioridad.toUpperCase()}</span>`;
  }

  row.innerHTML = `
    <div class="claude-response-hub">
      <div class="claude-hub-header">
        <div class="notip-avatar-badge" title="Claude AI"></div>
        <div class="claude-hub-title-wrap">
          <span class="claude-hub-name">Claude AI</span>
          <span class="claude-hub-sub">Respuesta & Análisis</span>
        </div>
      </div>

      <div class="claude-tip-card">
        <div class="tip-card-badge">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <span>Tip de Claude</span>
        </div>
        <div class="tip-card-content">${escapeHtml(feedbackText)}</div>
      </div>

      <div class="chat-card-result">
        <div class="card-result-top">
          <span class="chat-card-badge ${tipo}">${badgeLabel}</span>
          <span class="chat-card-title">${escapeHtml(result.titulo ?? result.texto_reescrito ?? 'Sin título')}</span>
        </div>
        ${metaTagsHtml ? `<div class="card-result-pills">${metaTagsHtml}</div>` : ''}
      </div>
    </div>
  `;

  chatStreamMessages.appendChild(row);
  chatStreamMessages.scrollTop = chatStreamMessages.scrollHeight;
}

function showResult(result, userText = '') {
  sectionZeroState?.classList.add('hidden');
  sectionChatStream?.classList.remove('hidden');
  if (userText) {
    appendUserMessage(userText);
  }
  appendNotipResponse(result);
  hintLabel.textContent = 'En conversación con Claude';
}

function showResultRaw(tipo, label, userText = '') {
  showResult({
    tipo: 'sin_clasificar',
    titulo: label,
    mensaje_feedback: 'Guardada directamente en tu Vault.',
  }, userText);
}

function hideResult() {
  if (chatStreamMessages) chatStreamMessages.innerHTML = '';
  sectionChatStream?.classList.add('hidden');
  sectionZeroState?.classList.remove('hidden');
  loadRecentActivity();
  hintLabel.textContent = 'Clasificación automática activa';
}

function showToast(msg, isError = false) {
  clearTimeout(toastTimer);
  toastMsg.textContent = msg;

  if (isError) {
    toast.className = 'error';
    if (toastSvgSuccess) toastSvgSuccess.classList.add('hidden');
    if (toastSvgError) toastSvgError.classList.remove('hidden');
  } else {
    toast.className = '';
    if (toastSvgSuccess) toastSvgSuccess.classList.remove('hidden');
    if (toastSvgError) toastSvgError.classList.add('hidden');
  }

  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

function hideToast() {
  clearTimeout(toastTimer);
  toast.classList.add('hidden');
}

async function refreshCounter() {
  try {
    const c = await window.electronAPI.getNotesCount();
    notesCounter.textContent = `${c} ${c === 1 ? 'nota' : 'notas'}`;
  } catch {
    notesCounter.textContent = '0 notas';
  }
}

// ── Events from main ──────────────────────────────────────────────────────────
window.electronAPI.on('focus-input', () => {
  hideToast();
  hideAiBar();

  const panel = document.getElementById('panel');
  if (panel) {
    panel.classList.remove('panel-exiting');
    panel.classList.remove('panel-entering');
    void panel.offsetWidth;
    panel.classList.add('panel-entering');
  }

  setTimeout(() => { input?.focus(); }, 60);
  refreshCounter();
  loadRecentActivity();
});

window.electronAPI.on('request-close', () => {
  handleClose();
});

window.electronAPI.on('ai-thinking', () => {
  setSavingState(true, 'Procesando con Claude...');
  showAiBar();
});

window.electronAPI.on('tasks-updated', () => {
  loadRecentActivity();
});

window.electronAPI.on('switch-tab', () => {
  input?.focus();
});
