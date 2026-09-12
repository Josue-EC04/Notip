'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listenerMap = new Map();

contextBridge.exposeInMainWorld('electronAPI', {
  // Estudio: todas las capturas se guardan antes de llamar a IA.
  openStudy: (tab) => ipcRenderer.send('open-study', tab),
  authLocal: () => ipcRenderer.invoke('auth-local'),
  studyOnline: () => ipcRenderer.send('study-online'),
  studyState: () => ipcRenderer.invoke('study-state'),
  studyCapture: (text, type, context) => ipcRenderer.invoke('study-capture', text, type, context),
  studyEdit: (id, text) => ipcRenderer.invoke('study-edit', id, text),
  studyDelete: (id) => ipcRenderer.invoke('study-delete', id),
  studyManual: (id, type) => ipcRenderer.invoke('study-manual', id, type),
  studyRetry: () => ipcRenderer.invoke('study-retry'),
  studyPause: (paused) => ipcRenderer.invoke('study-pause', paused),
  studyStartClass: (name) => ipcRenderer.invoke('study-start-class', name),
  studyEndClass: () => ipcRenderer.invoke('study-end-class'),
  studyRecommend: (minutes) => ipcRenderer.invoke('study-recommend', minutes),
  studyRelated: (text, filename) => ipcRenderer.invoke('study-related', text, filename),
  studyConnect: (id, filename) => ipcRenderer.invoke('study-connect', id, filename),
  studyTaskEffort: (id, minutes, step) => ipcRenderer.invoke('study-task-effort', id, minutes, step),
  // Pet
  petClicked:         ()       => ipcRenderer.send('pet-clicked'),
  showPetContextMenu: (coords) => ipcRenderer.send('show-pet-menu', coords),
  movePet:            (dx, dy) => ipcRenderer.send('move-pet', dx, dy),
  startPetDrag:       (x, y)   => ipcRenderer.send('start-pet-drag', x, y),
  petDragMove:        ()       => ipcRenderer.send('pet-drag-move'),
  stopPetDrag:        ()       => ipcRenderer.send('stop-pet-drag'),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),

  // Capture
  closeCapture:  ()                                   => ipcRenderer.send('close-capture'),
  saveNote:      (text, forcedType, contextoPrevio)   => ipcRenderer.invoke('save-note', text, forcedType, contextoPrevio),
  getNotesCount: ()                                   => ipcRenderer.invoke('get-notes-count'),
  openVault:     ()                  => ipcRenderer.invoke('open-vault'),

  // Tasks (Phase 3)
  getTasks:      (filtro)            => ipcRenderer.invoke('get-tasks', filtro),
  toggleTask:    (id)                => ipcRenderer.invoke('toggle-task', id),
  addTask:       (tarea)             => ipcRenderer.invoke('add-task', tarea),
  deleteTask:    (id)                => ipcRenderer.invoke('delete-task', id),
  updateTask:    (id, campos)        => ipcRenderer.invoke('update-task', id, campos),

  // Board (Phase 4)
  closeBoard:       ()               => ipcRenderer.send('close-board'),
  updateTaskState:  (id, estado)     => ipcRenderer.invoke('update-task-state', id, estado),
  openBoard:        ()               => ipcRenderer.send('open-board'),

  // Brain (Phase 5)
  openBrain:             ()                    => ipcRenderer.send('open-brain'),
  closeBrain:            ()                    => ipcRenderer.send('close-brain'),
  getVaultNotes:         ()                    => ipcRenderer.invoke('get-vault-notes'),
  saveNoteConnections:   (filename, title)     => ipcRenderer.invoke('save-note-connections', filename, title),
  updateNoteContent:     (filename, campos)    => ipcRenderer.invoke('update-note-content', filename, campos),
  deleteNote:            (filename)            => ipcRenderer.invoke('delete-note', filename),
  autoConnectBrain:      ()                    => ipcRenderer.invoke('auto-connect-brain'),

  // Canvas (Pizarra de Notas)
  openCanvas:            ()                    => ipcRenderer.send('open-canvas'),
  closeCanvas:           ()                    => ipcRenderer.send('close-canvas'),
  getCanvasLayout:       ()                    => ipcRenderer.invoke('get-canvas-layout'),
  saveCanvasLayout:      (layout)              => ipcRenderer.invoke('save-canvas-layout', layout),

  // ─── Auth v2 ─────────────────────────────────────────────────────────────────
  /** Inicia el flujo OAuth de Google (abre el navegador) */
  authLogin:     ()                            => ipcRenderer.invoke('auth-login'),
  /** Cierra la sesión y vuelve a la pantalla de login */
  authLogout:    ()                            => ipcRenderer.invoke('auth-logout'),
  /** Devuelve el usuario actual { id, email, name, avatar } o null */
  getSession:    ()                            => ipcRenderer.invoke('auth-get-session'),
  /** Cierra la ventana de auth (si el usuario quiere salir desde el login) */
  closeAuth:     ()                            => ipcRenderer.send('close-auth'),

  // ─── Créditos v2 ──────────────────────────────────────────────────────────────
  /** Devuelve { saldo, es_admin } o null si no hay sesión */
  getCredits:    ()                            => ipcRenderer.invoke('get-credits'),

  // ─── Google Calendar v2 ───────────────────────────────────────────────────────
  /** Crea un evento en el Google Calendar del usuario */
  addCalendarEvent: (params)                   => ipcRenderer.invoke('add-calendar-event', params),
  /** Abre un link externo en el navegador predeterminado */
  openExternal:     (url)                      => ipcRenderer.invoke('open-external', url),

  // ─── Settings & Custom API Key ───────────────────────────────────────────────
  getSettings:       ()                            => ipcRenderer.invoke('get-settings'),
  saveCustomApiKey:  (key)                         => ipcRenderer.invoke('save-custom-api-key', key),
  testApiKey:        (key)                         => ipcRenderer.invoke('test-api-key', key),

  // Events from main → renderer
  on: (channel, callback) => {
    const allowed = [
      'study-updated', 'study-organized', 'study-tab',
      'capture-opened', 'capture-closed',
      'focus-input', 'ai-thinking',
      'set-thinking', 'tasks-updated',
      'switch-tab',
      'board-tasks-updated',
      'show-feedback',
      'brain-notes-updated',
      'canvas-notes-updated',
      'set-opacity',
      'set-dock',
      'request-close',
      // v2
      'auth-changed',
      'auth-error',
      'credits-updated',
    ];
    if (allowed.includes(channel) && typeof callback === 'function') {
      const subscription = (_e, ...args) => callback(...args);
      if (!listenerMap.has(channel)) {
        listenerMap.set(channel, new Map());
      }
      listenerMap.get(channel).set(callback, subscription);
      ipcRenderer.on(channel, subscription);
    }
  },
  off: (channel, callback) => {
    const channelMap = listenerMap.get(channel);
    if (channelMap && callback && channelMap.has(callback)) {
      const subscription = channelMap.get(callback);
      ipcRenderer.removeListener(channel, subscription);
      channelMap.delete(callback);
    } else if (!callback) {
      if (channelMap) {
        for (const subscription of channelMap.values()) {
          ipcRenderer.removeListener(channel, subscription);
        }
        listenerMap.delete(channel);
      } else {
        ipcRenderer.removeAllListeners(channel);
      }
    }
  },
});
