'use strict';

// ── Elements: Header & Navigation ─────────────────────────────────────────────
const btnClose          = document.getElementById('btn-close');
const btnVault          = document.getElementById('btn-vault');
const btnBrain          = document.getElementById('btn-brain');
const btnBoard          = document.getElementById('btn-board');
const btnCanvas         = document.getElementById('btn-canvas');
const btnLogout         = document.getElementById('btn-logout');
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

// Active note banner & controls
const activeNoteBanner   = document.getElementById('active-note-banner');
const activeNoteTitle    = document.getElementById('active-note-title');
const btnBannerNewNote   = document.getElementById('btn-banner-new-note');
const btnActionNewNote   = document.getElementById('btn-action-new-note');

// Settings Elements
const btnSettings             = document.getElementById('btn-settings');
const modalSettings           = document.getElementById('modal-settings');
const btnCloseSettings        = document.getElementById('btn-close-settings');
const settingsAvatar          = document.getElementById('settings-avatar');
const settingsUserEmail       = document.getElementById('settings-user-email');
const settingsCreditsBadge    = document.getElementById('settings-credits-badge');
const settingsKeyBadge        = document.getElementById('settings-key-badge');
const inputCustomApiKey       = document.getElementById('input-custom-api-key');
const btnToggleKeyVisibility  = document.getElementById('btn-toggle-key-visibility');
const btnTestKey              = document.getElementById('btn-test-key');
const btnResetKey             = document.getElementById('btn-reset-key');
const btnSaveKey              = document.getElementById('btn-save-key');
const settingsStatusMsg       = document.getElementById('settings-status-msg');

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
let latestStudyState = {entries:[],sessions:[]};
let chatHistory       = []; // Historial de mensajes de la sesión activa

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

function updateActiveNoteUI(context) {
  if (context && (context.titulo || context.titulo_corto)) {
    const tit = context.titulo_corto || context.titulo;
    document.getElementById('capture-mode').textContent = 'Editando: ' + tit;
    if (activeNoteTitle) activeNoteTitle.textContent = tit;
    activeNoteBanner?.classList.remove('hidden');
    btnActionNewNote?.classList.remove('hidden');
    btnSaveText.textContent = 'Guardar cambios';
    input.placeholder = `Modificando "${tit}"... (o pulsa "+ Nueva nota" / Ctrl+N)`;
    hintLabel.textContent = 'Modificando nota previa';
    if (btnOpenBoardAction && context.tipo === 'tarea') {
      btnOpenBoardAction.classList.remove('hidden');
    }
  } else {
    document.getElementById('capture-mode').textContent = 'Nueva captura';
    activeNoteBanner?.classList.add('hidden');
    btnActionNewNote?.classList.add('hidden');
    btnSaveText.textContent = 'Guardar captura';
    input.placeholder = 'Escribe una tarea, idea o apunte rápido...';
    hintLabel.textContent = 'Clasificación automática activa';
    if (btnOpenBoardAction) {
      btnOpenBoardAction.classList.add('hidden');
    }
  }
}

function restoreActiveChat() {
  try {
    const raw = localStorage.getItem('notip_active_chat');
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const isExpired = !parsed.timestamp || (now - parsed.timestamp > 90 * 1000); // 90 segundos de inactividad

      if (Array.isArray(parsed.messages) && !isExpired) {
        activeNoteContext = parsed.activeNoteContext?.explicit ? parsed.activeNoteContext : null;
        sectionZeroState?.classList.add('hidden');
        sectionChatStream?.classList.remove('hidden');

        if (chatStreamMessages) chatStreamMessages.innerHTML = '';

        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          chatHistory = parsed.messages;
          parsed.messages.forEach(m => {
            if (m.isUser) appendUserMessage(m.text, false);
            else appendNotipResponse(m.result, false);
          });
        } else if (parsed.lastUserText && parsed.lastResult) {
          appendUserMessage(parsed.lastUserText, false);
          appendNotipResponse(parsed.lastResult, false);
        }

        updateActiveNoteUI(activeNoteContext);
      } else if (isExpired) {
        // Expirado por inactividad → iniciar de cero automáticamente
        localStorage.removeItem('notip_active_chat');
        activeNoteContext = null;
      }
    }

    // Si no hay chat activo pero sí un borrador de texto en progreso, restaurarlo
    if (!activeNoteContext) {
      const draft = localStorage.getItem('notip_input_draft');
      if (draft && draft.trim()) {
        input.value = draft;
        charCounter.textContent = `${draft.length} / 1000`;
        btnSave.disabled = false;
      }
    }
  } catch (e) {
    console.warn('[capture] restoreActiveChat error:', e);
  }
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
  
  // Guardar borrador en progreso
  localStorage.setItem('notip_input_draft', input.value);

  if (activeNoteContext) {
    btnSaveText.textContent = 'Guardar cambios';
  } else {
    btnSaveText.textContent = 'Guardar captura';
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
btnLogout?.addEventListener('click', async () => {
  if (confirm('¿Deseas cerrar sesión en Notip?')) {
    await window.electronAPI?.authLogout();
  }
});

if (btnNewNote) {
  btnNewNote.addEventListener('click', resetToNewNote);
}
if (btnBannerNewNote) {
  btnBannerNewNote.addEventListener('click', resetToNewNote);
}
if (btnActionNewNote) {
  btnActionNewNote.addEventListener('click', resetToNewNote);
}
if (btnOpenBoardAction) {
  btnOpenBoardAction.addEventListener('click', () => window.electronAPI.openBoard());
}
if (btnDoneClose) {
  btnDoneClose.addEventListener('click', handleClose);
}

// Atajo global Ctrl+N / Cmd+N para empezar nueva nota instantáneamente
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    resetToNewNote();
  }
});

// ── Settings Modal Logic ──────────────────────────────────────────────────────
async function openSettings() {
  modalSettings?.classList.remove('hidden');
  hideSettingsStatus();
  try {
    const data = await window.electronAPI?.getSettings();
    if (!data) return;

    if (data.user) {
      settingsUserEmail.textContent = data.user.email || 'Usuario de Notip';
      const initial = (data.user.name || data.user.email || 'U').charAt(0).toUpperCase();
      settingsAvatar.textContent = initial;
    } else {
      settingsUserEmail.textContent = 'josue.ec.4411@gmail.com';
      settingsAvatar.textContent = 'J';
    }

    if (data.credits) {
      if (data.credits.es_admin) {
        settingsCreditsBadge.textContent = 'Admin · Saldo ilimitado';
        settingsCreditsBadge.style.background = '#D1FAE5';
        settingsCreditsBadge.style.color = '#047857';
      } else {
        const saldo = data.credits.saldo ?? 0;
        if (saldo > 0) {
          settingsCreditsBadge.textContent = `${saldo} créditos restantes`;
          settingsCreditsBadge.style.background = '#E0F2FE';
          settingsCreditsBadge.style.color = '#0369A1';
        } else if (data.hasCustomKey || data.hasDefaultKey) {
          settingsCreditsBadge.textContent = 'IA Activa · Acceso Notip';
          settingsCreditsBadge.style.background = '#D1FAE5';
          settingsCreditsBadge.style.color = '#047857';
        } else {
          settingsCreditsBadge.textContent = '0 créditos · Modo local';
          settingsCreditsBadge.style.background = '#FEE2E2';
          settingsCreditsBadge.style.color = '#B91C1C';
        }
      }
    } else {
      settingsCreditsBadge.textContent = 'IA Activa · Acceso Notip';
      settingsCreditsBadge.style.background = '#D1FAE5';
      settingsCreditsBadge.style.color = '#047857';
    }

    if (data.hasCustomKey) {
      settingsKeyBadge.textContent = 'Clave personalizada';
      settingsKeyBadge.className = 'key-source-badge custom';
      inputCustomApiKey.value = data.customKey || '';
    } else {
      settingsKeyBadge.textContent = 'Clave predeterminada';
      settingsKeyBadge.className = 'key-source-badge default';
      inputCustomApiKey.value = '';
    }
  } catch (err) {
    console.error('[capture] Error loading settings:', err);
  }
}

function closeSettings() {
  modalSettings?.classList.add('hidden');
  hideSettingsStatus();
}

function showSettingsStatus(msg, type = 'info') {
  if (!settingsStatusMsg) return;
  settingsStatusMsg.textContent = msg;
  settingsStatusMsg.className = `settings-status-box ${type}`;
}

function hideSettingsStatus() {
  if (!settingsStatusMsg) return;
  settingsStatusMsg.classList.add('hidden');
}

btnSettings?.addEventListener('click', openSettings);
btnCloseSettings?.addEventListener('click', closeSettings);
modalSettings?.addEventListener('click', e => {
  if (e.target === modalSettings) closeSettings();
});

btnToggleKeyVisibility?.addEventListener('click', () => {
  if (inputCustomApiKey.type === 'password') {
    inputCustomApiKey.type = 'text';
    btnToggleKeyVisibility.textContent = '🔒';
  } else {
    inputCustomApiKey.type = 'password';
    btnToggleKeyVisibility.textContent = '👁️';
  }
});

btnSaveKey?.addEventListener('click', async () => {
  const key = inputCustomApiKey.value.trim();
  if (key && !key.startsWith('sk-ant-')) {
    showSettingsStatus('La clave debe ser de Anthropic y comenzar con "sk-ant-"', 'error');
    return;
  }
  btnSaveKey.disabled = true;
  btnSaveKey.textContent = 'Guardando...';
  try {
    const res = await window.electronAPI?.saveCustomApiKey(key);
    btnSaveKey.disabled = false;
    btnSaveKey.textContent = 'Guardar clave';
    if (res?.success) {
      if (res.removed) {
        showSettingsStatus('Clave personalizada eliminada. Usando clave predeterminada de Notip.', 'info');
        settingsKeyBadge.textContent = 'Clave predeterminada';
        settingsKeyBadge.className = 'key-source-badge default';
      } else {
        showSettingsStatus('¡Clave personalizada guardada con éxito!', 'success');
        settingsKeyBadge.textContent = 'Clave personalizada';
        settingsKeyBadge.className = 'key-source-badge custom';
      }
      showToast('Configuración guardada');
    } else {
      showSettingsStatus(res?.error || 'Error al guardar la clave', 'error');
    }
  } catch (err) {
    btnSaveKey.disabled = false;
    btnSaveKey.textContent = 'Guardar clave';
    showSettingsStatus(err.message, 'error');
  }
});

btnResetKey?.addEventListener('click', async () => {
  inputCustomApiKey.value = '';
  try {
    await window.electronAPI?.saveCustomApiKey('');
    settingsKeyBadge.textContent = 'Clave predeterminada';
    settingsKeyBadge.className = 'key-source-badge default';
    showSettingsStatus('Restaurado a la clave predeterminada de Notip.', 'info');
    showToast('Clave restaurada');
  } catch (err) {
    showSettingsStatus(err.message, 'error');
  }
});

btnTestKey?.addEventListener('click', async () => {
  const key = inputCustomApiKey.value.trim();
  btnTestKey.disabled = true;
  btnTestKey.textContent = 'Probando...';
  showSettingsStatus('Conectando con Claude Haiku...', 'info');
  try {
    const res = await window.electronAPI?.testApiKey(key);
    btnTestKey.disabled = false;
    btnTestKey.textContent = 'Probar conexión';
    if (res?.success) {
      showSettingsStatus('¡Conexión exitosa con Claude! La IA está lista para clasificar notas.', 'success');
    } else {
      showSettingsStatus(`Error de conexión: ${res?.error || 'No se pudo conectar'}`, 'error');
    }
  } catch (err) {
    btnTestKey.disabled = false;
    btnTestKey.textContent = 'Probar conexión';
    showSettingsStatus(`Excepción: ${err.message}`, 'error');
  }
});

// ── Save flow (Capture View) ──────────────────────────────────────────────────
let lastCaptureId = null;
async function handleSave() {
  const text = input.value.trim();
  if (!text || isSaving) return;
  isSaving = true; setSavingState(true, 'Guardando en este equipo…');
  try {
    const response = await window.electronAPI.studyCapture(text, forcedType, activeNoteContext);
    if (!response?.success) throw Error(response?.error || 'No se pudo guardar.');
    const entry = response.data; lastCaptureId = entry.id;
    const chatTools = document.getElementById('chat-tools');
    if (chatTools && !chatTools.hidden) {
      chatTools.hidden = true;
      document.getElementById('view-capture')?.classList.remove('tools-open');
    }
    document.getElementById('capture-dynamic-area')?.classList.remove('hidden');
    sectionZeroState?.classList.add('hidden'); sectionChatStream?.classList.remove('hidden');
    appendUserMessage(text);
    appendNotipResponse({tipo:'sin_clasificar',titulo:'Captura guardada',captureId:entry.id,pending:true});
    document.getElementById('welcome-card').hidden = true;
    localStorage.setItem('notip_welcome_seen','1');
    if (input.value.trim() === text) input.value = '';
    localStorage.removeItem('notip_input_draft');
    activeNoteContext = null; updateActiveNoteUI(null);
    saveChatToStorage();
    charCounter.textContent = input.value.length + ' / 1000';
    input.dispatchEvent(new Event('input')); refreshCounter();
  } catch (err) { showToast(err.message, true); }
  finally { isSaving = false; setSavingState(false); input.focus(); }
}

function resetToNewNote() {
  lastCaptureId = null;
  activeNoteContext = null;
  chatHistory = [];
  try {
    localStorage.removeItem('notip_active_chat');
    localStorage.removeItem('notip_input_draft');
  } catch {}
  updateActiveNoteUI(null);
  hideResult();
  input.value = '';
  charCounter.textContent = '0 / 1000';
  btnSave.disabled = true;
  if (btnOpenBoardAction) btnOpenBoardAction.classList.add('hidden');
  showToast('✨ Listo para crear una nueva nota');
  setTimeout(() => input.focus(), 40);
}

let isClosingCapture = false;

function handleClose() {
  if (isClosingCapture) return;
  isClosingCapture = true;
  hideToast();
  hideAiBar();
  setSavingState(false);

  // NOTA: No borramos activeNoteContext ni el chat para permitir al usuario continuar su nota al reabrir el panel

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
    btnSaveText.textContent = activeNoteContext ? 'Guardar cambios' : 'Guardar captura';
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

function saveChatToStorage() {
  try {
    localStorage.setItem('notip_active_chat', JSON.stringify({
      activeNoteContext,
      messages: chatHistory,
      timestamp: Date.now(),
    }));
  } catch {}
}

function appendUserMessage(text, save = true) {
  if (!chatStreamMessages) return;
  const row = document.createElement('div');
  row.className = 'chat-row-user';
  row.innerHTML = `<div class="chat-bubble-user">${escapeHtml(text)}</div>`;
  chatStreamMessages.appendChild(row);
  chatStreamMessages.scrollTop = chatStreamMessages.scrollHeight;

  if (save) {
    chatHistory.push({ isUser: true, text });
    saveChatToStorage();
  }
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = String(dateStr).split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }
    return String(dateStr);
  } catch (_) {
    return String(dateStr);
  }
}

function appendNotipResponse(result, save = true) {
  if (!chatStreamMessages) return;
  try {
    const tipo = result.tipo ?? 'nota';
    const labels = { tarea: 'Tarea', idea: 'Idea', nota: 'Nota', sin_clasificar: 'Nota' };
    const badgeLabel = labels[tipo] ?? tipo;

    const row = document.createElement('div');
    row.className = 'chat-row-notip';
    if(result.captureId) row.dataset.captureId = result.captureId;

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

    // Si es tarea o tiene fecha de entrega, mostrar botón para sincronizar con Google Calendar
    const isTaskOrCalendar = (result.tipo === 'tarea' || Boolean(result.fecha_entrega));
    let calendarBoxHtml = '';
    if (isTaskOrCalendar) {
      const dLabel = result.fecha_entrega ? formatShortDate(result.fecha_entrega) : 'Fecha pendiente';
      const tLabel = result.hora_entrega ? ` · ${result.hora_entrega}` : '';
      calendarBoxHtml = `
        <div class="calendar-action-box">
          <div class="calendar-action-info">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
            <span>${escapeHtml(dLabel + tLabel)}</span>
          </div>
          <button class="btn-add-calendar" type="button">
            📅 Agregar a Google Calendar
          </button>
        </div>
      `;
    }

    row.innerHTML = result.pending
      ? '<div class="capture-receipt"><span class="capture-status"></span><button class="receipt-open">Ver pendientes</button></div>'
      : `<div class="chat-card-result"><div class="card-result-top"><span class="chat-card-badge ${tipo}">${badgeLabel}</span><strong>${escapeHtml(result.titulo || result.titulo_corto || 'Nota guardada')}</strong></div><p class="result-status">${result.es_modificacion_de_anterior ? 'Cambios guardados' : badgeLabel + ' creada'}</p>${metaTagsHtml ? '<div class="card-result-pills">' + metaTagsHtml + '</div>' : ''}${calendarBoxHtml}<div class="receipt-actions"><button class="receipt-open">${tipo==='tarea'?'Ver tarea':'Ver nota'}</button>${result.filePath?'<button class="continue-note">Continuar esta nota</button>':''}</div></div>`;
    if(result.pending) row.querySelector('.capture-status').textContent = captureStatus(result.captureId);
    row.querySelector('.receipt-open').onclick = () => result.pending ? window.electronAPI.openStudy('inbox') : tipo==='tarea' ? window.electronAPI.openBoard() : window.electronAPI.openCanvas();
    const continuation = row.querySelector('.continue-note');
    if(continuation) continuation.onclick = () => {
      if(latestStudyState.activeSessionId){showToast('Termina la clase antes de modificar una nota anterior.',true);return;}
      activeNoteContext = {...result,texto:result.texto_reescrito,explicit:true,timestamp:Date.now()};
      updateActiveNoteUI(activeNoteContext);saveChatToStorage();input.focus();
    };

    // Listener del botón de Google Calendar
    const btnCal = row.querySelector('.btn-add-calendar');
    if (btnCal) {
      btnCal.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btnCal.dataset.added === 'true') {
          if (btnCal.dataset.link) {
            window.electronAPI.openExternal(btnCal.dataset.link);
          }
          return;
        }

        btnCal.disabled = true;
        btnCal.textContent = 'Agregando a Google...';
        try {
          const calRes = await window.electronAPI.addCalendarEvent({
            titulo: result.titulo || result.texto_reescrito,
            descripcion: result.descripcion || result.mensaje_feedback,
            fecha_entrega: result.fecha_entrega,
            hora_entrega: result.hora_entrega,
          });

          if (calRes?.success) {
            btnCal.dataset.added = 'true';
            btnCal.dataset.link = calRes.htmlLink || '';
            btnCal.disabled = false;
            btnCal.innerHTML = '🔗 Abrir en Google Calendar';
            btnCal.classList.add('calendar-success');
            btnCal.title = 'Abrir en Google Calendar web';
            showToast('✓ Evento sincronizado en Google Calendar');
          } else {
            btnCal.disabled = false;
            btnCal.textContent = 'Reintentar Calendar';
            showToast(calRes?.error || 'No se pudo agregar a Google Calendar', true);
          }
        } catch (err) {
          btnCal.disabled = false;
          btnCal.textContent = 'Reintentar Calendar';
          showToast('Error al conectar con Google Calendar', true);
        }
      });
    }

    const previous = result.captureId && [...chatStreamMessages.querySelectorAll('[data-capture-id]')].find(el=>el.dataset.captureId===result.captureId);
    if(previous) previous.replaceWith(row); else chatStreamMessages.appendChild(row);
    chatStreamMessages.scrollTop = chatStreamMessages.scrollHeight;

    if (save) {
      const index = result.captureId ? chatHistory.findIndex(m=>m.result?.captureId===result.captureId) : -1;
      if(index >= 0) chatHistory[index] = {isUser:false,result};
      else chatHistory.push({ isUser: false, result });
      saveChatToStorage();
    }
  } catch (err) {
    console.error('[capture] appendNotipResponse error:', err);
  }
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

  toastTimer = setTimeout(() => toast.classList.add('hidden'), 5000);
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

  // Si han pasado más de 90 segundos desde la última nota o si no hay conversación activa reciente,
  // reiniciar a nota nueva para que nunca capture encima de una nota anterior por error
  if (activeNoteContext) {
    const elapsed = Date.now() - (activeNoteContext.timestamp || 0);
    if (elapsed > 90 * 1000) {
      resetToNewNote();
    }
  }

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

document.getElementById('btn-study-inbox').onclick = () => window.electronAPI.openStudy('inbox');
document.getElementById('btn-study-focus').onclick = () => window.electronAPI.openStudy('focus');
document.getElementById('btn-study-class').onclick = () => window.electronAPI.openStudy('classes');
function updateStudyStrip(state) {
  latestStudyState = state;
  for (const message of [...chatHistory]) {
    if (!message.result?.pending) continue;
    const entry = state.entries.find(e=>e.id===message.result.captureId);
    if (entry?.status === 'done') appendNotipResponse({...entry.result,titulo:entry.result.titulo_corto,taskId:entry.taskId,filePath:entry.filePath,captureId:entry.id});
  }
  document.querySelectorAll('[data-capture-id] .capture-status').forEach(el=>el.textContent=captureStatus(el.closest('[data-capture-id]').dataset.captureId));
  document.getElementById('study-pending').textContent = state.entries.filter(e => e.status !== 'done').length;
  const session = state.sessions.find(s => s.id === state.activeSessionId);
  document.getElementById('btn-study-class').textContent = session ? 'En clase: ' + session.name.slice(0,20) : 'Iniciar clase';
  document.getElementById('study-local-status').textContent = state.paused ? 'IA pausada' : state.processing ? 'Organizando…' : 'Guardado local';
  if (session) { activeNoteContext = null; updateActiveNoteUI(null); }
}
function captureStatus(id) {
  const entry = latestStudyState.entries.find(e=>e.id===id);
  if (entry?.status === 'done') return 'Guardado y organizado';
  if (latestStudyState.paused) return 'Guardado · IA pausada';
  if (!navigator.onLine) return 'Guardado · esperando conexión';
  if (!latestStudyState.configured) return 'Guardado · configura la IA en Ajustes';
  if (entry?.status === 'processing') return 'Organizando…';
  if (entry?.status === 'error') return 'Guardado · no se pudo organizar. Puedes reintentar.';
  return 'Guardado · pendiente de organizar';
}
window.electronAPI.studyState().then(r => { if(r.success) updateStudyStrip(r.data); }).catch(()=>{});
window.electronAPI.on('study-updated', updateStudyStrip);
window.electronAPI.on('study-organized', async entry => {
  if (!chatHistory.some(m=>m.result?.captureId===entry.id)) return;
  const r = entry.result;
  const result = {...r,titulo:r.titulo_corto,taskId:entry.taskId,filePath:entry.filePath,captureId:entry.id};
  appendNotipResponse(result);
  try {
    const response = await window.electronAPI.studyRelated(r.texto_reescrito,entry.filename);
    if (!response.success || !response.data.length) return;
    const panel = document.createElement('div'); panel.className = 'study-related';
    const title = document.createElement('p');title.textContent = 'Esto conecta con una idea tuya';panel.append(title);
    response.data.forEach(note => {
      const b = document.createElement('button');b.textContent = note.titulo + ' · Conectar';
      const reason=document.createElement('p');reason.textContent=note.reason;
      b.onclick = async () => {const res=await window.electronAPI.studyConnect(entry.id,note.filename);if(res.success){b.disabled=true;b.textContent='Conectada: '+note.titulo;}else showToast(res.error,true);};
      panel.append(b,reason);
    });chatStreamMessages.append(panel);chatStreamMessages.scrollTop=chatStreamMessages.scrollHeight;
  } catch (_) {}
});
window.addEventListener('online', () => window.electronAPI.studyOnline());
