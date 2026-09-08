'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Pet
  petClicked:         ()       => ipcRenderer.send('pet-clicked'),
  showPetContextMenu: ()       => ipcRenderer.send('show-pet-menu'),
  movePet:            (dx, dy) => ipcRenderer.send('move-pet', dx, dy),
  startPetDrag:       (x, y)   => ipcRenderer.send('start-pet-drag', x, y),
  petDragMove:        ()       => ipcRenderer.send('pet-drag-move'),
  stopPetDrag:        ()       => ipcRenderer.send('stop-pet-drag'),

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

  // Events from main → renderer
  on: (channel, callback) => {
    const allowed = [
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
    ];
    if (allowed.includes(channel)) {
      ipcRenderer.on(channel, (_e, ...args) => callback(...args));
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});
