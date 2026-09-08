'use strict';

require('dotenv').config();

const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  screen, nativeImage, shell, globalShortcut,
} = require('electron');
const path  = require('path');
const fs    = require('fs');

// Optimización de GPU: evitar errores de GPU caché en disco en Windows manteniendo la aceleración fluida
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Identificador de aplicación para Windows (asegura agrupación e icono correcto en la barra de tareas y accesos directos)
app.setAppUserModelId('com.notip.app');

const appIconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
const appIconIco  = path.join(__dirname, 'src', 'assets', 'icon.ico');

const Store = require('electron-store');
const store = new Store();

// Evitar múltiples instancias simultáneas que causen desincronización
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    }
  });
}

let petWindow     = null;
let captureWindow = null;
let boardWindow   = null;
let brainWindow   = null;
let canvasWindow  = null;
let tray          = null;

// Track whether the user manually hid the pet
let userHidden         = false;
// Track whether we hid it due to fullscreen
let hiddenByFullscreen = false;

// ─── Configuración y Rutas ──────────────────────────────────────────────────
const userDataPath = app.getPath('userData');

// Usamos el directorio del proyecto para la bóveda para evitar problemas de permisos de Windows (Acceso denegado) en la carpeta Documentos.
const vaultPath = store.get('vaultPath', path.join(__dirname, 'vault'));
const dataPath  = path.join(userDataPath, 'data');

function ensureDirs() {
  [vaultPath, dataPath].forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

// ─── Pet window ────────────────────────────────────────────────────────────────
function createPetWindow() {
  // Clamp stored position to the primary display work area
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: wa_x, y: wa_y, width: wa_w, height: wa_h } = primaryDisplay.workArea;
  const savedX = store.get('petX', null);
  const savedY = store.get('petY', null);

  const PW = 260;
  const PH = 170;

  // If no saved position OR saved position is completely off-screen, use center
  const petX = (savedX !== null && savedX >= wa_x - 150 && savedX <= wa_x + wa_w - 110)
    ? savedX
    : Math.round(wa_x + wa_w / 2 - PW / 2);
  const petY = (savedY !== null && savedY >= wa_y - 134 && savedY <= wa_y + wa_h - 94)
    ? savedY
    : Math.round(wa_y + 80);

  console.log(`Spawning pet at x:${petX} y:${petY}`);

  petWindow = new BrowserWindow({
    width: 260, height: 170,
    x: petX,
    y: petY,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    hasShadow:   false,
    show:        true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  petWindow.loadFile(path.join(__dirname, 'src', 'pet', 'pet.html'));

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  try {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } catch (_) {}

  // Prevent the red X from killing the process
  petWindow.on('close', e => { e.preventDefault(); petWindow.hide(); });

  // Save position whenever moved
  petWindow.on('moved', () => {
    const [nx, ny] = petWindow.getPosition();
    store.set('petX', nx);
    store.set('petY', ny);
  });

  // Send saved opacity and docking state when ready
  petWindow.webContents.on('did-finish-load', () => {
    const savedOpacity = store.get('petOpacity', 1.0);
    petWindow.webContents.send('set-opacity', savedOpacity);
    checkPetDocking();
  });
}

function checkPetDocking(targetPx = null, targetPy = null) {
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    let px, py;
    if (targetPx !== null && targetPy !== null) {
      px = targetPx;
      py = targetPy;
    } else {
      [px, py] = petWindow.getPosition();
    }
    const display = screen.getDisplayNearestPoint({ x: px + 130, y: py + 85 });
    const wa = display.workArea;

    const robotCenterX = px + 130;
    const distFromLeft = robotCenterX - wa.x;
    const distFromRight = (wa.x + wa.width) - robotCenterX;
    const distFromBottom = (wa.y + wa.height) - (py + 162);
    const distFromTop = (py + 66) - wa.y;

    let dock = 'center';
    if (distFromLeft < 140) {
      dock = 'left';
    } else if (distFromRight < 140) {
      dock = 'right';
    }

    // Detectar si el robot está parcialmente escondido en el borde o esquina
    const isTucked = (distFromLeft < 70 || distFromRight < 70 || distFromBottom < -15 || distFromTop < -15);
    petWindow.webContents.send('set-dock', { dock, isTucked });
  } catch (_) {}
}

function dockPetToCorner(corner = 'bottom-right') {
  if (!petWindow || petWindow.isDestroyed()) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const wa = primaryDisplay.workArea;
  let targetX, targetY;

  if (corner === 'bottom-right') {
    targetX = wa.x + wa.width - 110;
    targetY = wa.y + wa.height - 94;
  } else if (corner === 'bottom-left') {
    targetX = wa.x - 150;
    targetY = wa.y + wa.height - 94;
  } else if (corner === 'top-right') {
    targetX = wa.x + wa.width - 110;
    targetY = wa.y - 134;
  } else if (corner === 'top-left') {
    targetX = wa.x - 150;
    targetY = wa.y - 134;
  } else {
    // center
    targetX = Math.round(wa.x + wa.width / 2 - 130);
    targetY = Math.round(wa.y + 80);
  }

  petWindow.setPosition(targetX, targetY);
  store.set('petX', targetX);
  store.set('petY', targetY);
  checkPetDocking(targetX, targetY);
}

// ─── Capture window ────────────────────────────────────────────────────────────
function createCaptureWindow() {
  captureWindow = new BrowserWindow({
    width: 450, height: 470,
    icon:        appIconPath,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show:        false,
    resizable:   false,
    hasShadow:   false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  captureWindow.loadFile(path.join(__dirname, 'src', 'capture', 'capture.html'));

  captureWindow.on('blur', () => {
    setTimeout(() => {
      if (captureWindow?.isVisible() && !captureWindow.isFocused()) {
        try {
          captureWindow.webContents.send('request-close');
        } catch (_) {
          hideCapture();
        }
      }
    }, 120);
  });
}

// ─── Board window ──────────────────────────────────────────────────────────────────
function createBoardWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  boardWindow = new BrowserWindow({
    width:  Math.min(1200, width - 80),
    height: Math.min(760, height - 80),
    minWidth: 780,
    minHeight: 500,
    icon: appIconPath,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FBF9F5',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  boardWindow.loadFile(path.join(__dirname, 'src', 'board', 'board.html'));

  // Center it
  boardWindow.center();

  boardWindow.on('close', e => {
    e.preventDefault();
    boardWindow.hide();
  });
}

function showBoard() {
  if (!boardWindow) createBoardWindow();
  if (!boardWindow.isVisible()) boardWindow.show();
  boardWindow.focus();
}

function notifyBoardTasksUpdated() {
  boardWindow?.webContents.send('board-tasks-updated');
}

// ─── Brain window ──────────────────────────────────────────────────────────────────
function createBrainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  brainWindow = new BrowserWindow({
    width:  Math.min(1250, width - 60),
    height: Math.min(800, height - 60),
    minWidth: 800,
    minHeight: 550,
    icon: appIconPath,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FBF9F5',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  brainWindow.loadFile(path.join(__dirname, 'src', 'brain', 'brain.html'));
  brainWindow.center();

  brainWindow.on('close', e => {
    e.preventDefault();
    brainWindow.hide();
  });
}

function showBrain() {
  if (!brainWindow) createBrainWindow();
  if (!brainWindow.isVisible()) brainWindow.show();
  brainWindow.focus();
}

function notifyBrainNotesUpdated() {
  brainWindow?.webContents.send('brain-notes-updated');
}

// ─── Canvas window (Pizarra de Notas) ──────────────────────────────────────────────
function createCanvasWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  canvasWindow = new BrowserWindow({
    width:  Math.min(1280, width - 60),
    height: Math.min(820, height - 60),
    minWidth: 800,
    minHeight: 550,
    icon: appIconPath,
    frame: false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    backgroundColor: '#FBF9F5',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  canvasWindow.loadFile(path.join(__dirname, 'src', 'canvas', 'canvas.html'));
  canvasWindow.center();

  canvasWindow.on('close', e => {
    e.preventDefault();
    canvasWindow.hide();
  });
}

function showCanvas() {
  if (!canvasWindow) createCanvasWindow();
  if (!canvasWindow.isVisible()) canvasWindow.show();
  canvasWindow.focus();
}

function notifyCanvasNotesUpdated() {
  canvasWindow?.webContents.send('canvas-notes-updated');
}

function notifyBoardTasksUpdated() {
  boardWindow?.webContents.send('board-tasks-updated');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function positionCaptureNearPet(targetPx = null, targetPy = null) {
  if (!petWindow || !captureWindow) return;
  let px, py;
  if (targetPx !== null && targetPy !== null) {
    px = targetPx;
    py = targetPy;
  } else {
    const pos = petWindow.getPosition();
    px = pos[0];
    py = pos[1];
  }

  if (!Number.isFinite(px) || !Number.isFinite(py)) return;

  const PW = 260;
  const PH = 170;
  const CW = 450;
  const CH = 470;
  const wa = screen.getPrimaryDisplay().workArea;

  // El sprite del robot (96x96) está centrado en el petWindow de 260x170:
  // Offset horizontal del sprite: [px + 82] a [px + 178]
  // Offset vertical del centro del sprite: py + 114
  let cx;
  if (px + 178 + 10 + CW <= wa.x + wa.width) {
    cx = px + 178 + 10;
  } else {
    cx = px + 82 - CW - 10;
  }

  // Alinear verticalmente centrado con el robot y asegurar límites de pantalla
  let cy = (py + 114) - Math.round(CH / 2);
  cy = Math.max(wa.y + 8, Math.min(cy, wa.y + wa.height - CH - 8));
  cx = Math.max(wa.x + 8, Math.min(cx, wa.x + wa.width - CW - 8));

  const targetX = Math.round(cx);
  const targetY = Math.round(cy);
  captureWindow.setBounds({ x: targetX, y: targetY, width: CW, height: CH });
}

function showPet(focus = false) {
  if (!petWindow) {
    createPetWindow();
    return;
  }
  userHidden = false;
  hiddenByFullscreen = false;

  if (petWindow.isMinimized()) petWindow.restore();
  if (!petWindow.isVisible()) petWindow.show();

  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.moveTop();
  if (focus) petWindow.focus();
}

function hidePet() {
  userHidden = true;
  petWindow?.hide();
  hideCapture();
}

function showCapture() {
  if (hiddenByFullscreen) return; // don't pop up mid-game
  if (!petWindow) createPetWindow();

  // Asegurar que la mascota esté SIEMPRE visible y al frente junto al panel de captura
  showPet();

  const [px, py] = petWindow.getPosition();
  captureWindow.show();
  captureWindow.setAlwaysOnTop(true, 'screen-saver');
  positionCaptureNearPet(px, py);
  
  // Re-confirmar posición tras el paint inicial de Windows DWM
  setTimeout(() => {
    if (captureWindow && captureWindow.isVisible() && petWindow) {
      const [curPx, curPy] = petWindow.getPosition();
      positionCaptureNearPet(curPx, curPy);
      petWindow.setAlwaysOnTop(true, 'screen-saver');
      petWindow.moveTop();
    }
  }, 40);

  captureWindow.focus();
  captureWindow.webContents.send('focus-input');
  const [curPx] = petWindow.getPosition();
  const side = (curPx + 178 + 10 + 440 <= screen.getPrimaryDisplay().workArea.width) ? 'right' : 'left';
  petWindow?.webContents.send('capture-opened', { side });
}

function hideCapture() {
  captureWindow?.hide();
  petWindow?.webContents.send('capture-closed');
}

function toggleCapture() {
  captureWindow?.isVisible() ? hideCapture() : showCapture();
}

// ─── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, 'src', 'assets', 'tray-icon.png');
  let img;
  try {
    img = nativeImage.createFromPath(iconPath);
    // Resize to 16x16 for tray (Windows requirement)
    if (!img.isEmpty()) img = img.resize({ width: 16, height: 16 });
    else img = nativeImage.createEmpty();
  } catch { img = nativeImage.createEmpty(); }

  tray = new Tray(img);

  const rebuildMenu = () => {
    const visible = petWindow?.isVisible() && !userHidden;
    const menu = Menu.buildFromTemplate([
      { label: 'Notip — Tu segundo cerebro', enabled: false },
      { type: 'separator' },
      { label: 'Nueva captura / Chat', click: showCapture },
      { label: 'Tablero de tareas (Kanban)', click: showBoard },
      {
        label: visible ? 'Ocultar mascota' : 'Mostrar mascota',
        click: () => {
          if (visible) {
            hidePet();
          } else {
            showPet();
            petWindow?.webContents.send('show-feedback', '¡Aquí estoy!');
          }
          rebuildMenu();
        },
      },
      { label: 'Tablero Kanban', click: () => showBoard() },
      { label: 'El Cerebro (Grafo)', click: () => showBrain() },
      { label: 'Pizarra de notas (Canvas)', click: () => showCanvas() },
      { label: 'Abrir carpeta Vault', click: () => shell.openPath(vaultPath) },
      {
        label: 'Opacidad de la mascota',
        submenu: [
          {
            label: '100% (Sólido)',
            type: 'radio',
            checked: Math.abs(store.get('petOpacity', 1.0) - 1.0) < 0.05,
            click: () => {
              store.set('petOpacity', 1.0);
              petWindow?.webContents.send('set-opacity', 1.0);
              rebuildMenu();
            },
          },
          {
            label: '80%',
            type: 'radio',
            checked: Math.abs(store.get('petOpacity', 1.0) - 0.8) < 0.05,
            click: () => {
              store.set('petOpacity', 0.8);
              petWindow?.webContents.send('set-opacity', 0.8);
              rebuildMenu();
            },
          },
          {
            label: '60%',
            type: 'radio',
            checked: Math.abs(store.get('petOpacity', 1.0) - 0.6) < 0.05,
            click: () => {
              store.set('petOpacity', 0.6);
              petWindow?.webContents.send('set-opacity', 0.6);
              rebuildMenu();
            },
          },
          {
            label: '40% (Translúcido)',
            type: 'radio',
            checked: Math.abs(store.get('petOpacity', 1.0) - 0.4) < 0.05,
            click: () => {
              store.set('petOpacity', 0.4);
              petWindow?.webContents.send('set-opacity', 0.4);
              rebuildMenu();
            },
          },
        ],
      },
      { type: 'separator' },
      { label: `Atajo: Ctrl+Shift+H (mascota)`, enabled: false },
      { label: `Atajo: Ctrl+Shift+N (captura)`, enabled: false },
      { label: `Atajo: Ctrl+Shift+B (cerebro)`, enabled: false },
      { label: `Atajo: Ctrl+Shift+P (pizarra)`, enabled: false },
      { type: 'separator' },
      { label: 'Salir', click: () => app.exit(0) },
    ]);
    tray.setContextMenu(menu);
  };

  tray.setToolTip('Notip — Tu segundo cerebro');
  rebuildMenu();

  tray.on('click', () => {
    const wasHidden = !petWindow?.isVisible() || userHidden || hiddenByFullscreen;
    showPet();
    rebuildMenu();

    if (wasHidden) {
      // Si la mascota estaba oculta, al pulsar en la barra de tareas la restauramos visible con saludo
      petWindow?.webContents.send('show-feedback', '¡Aquí estoy!');
    } else {
      // Si ya estaba visible, alternar el cuadro de captura
      toggleCapture();
    }
  });

  tray.on('double-click', () => showBoard());
}

// ─── Fullscreen auto-hide & auto-restore ─────────────────────────────────────────
function setupFullscreenWatcher() {
  const watcher = require('./src/utils/fullscreenWatcher');

  watcher.on('change', isFullscreen => {
    if (isFullscreen) {
      // Si entra a pantalla completa real (ej. juego o video F11), ocultar Notip
      if (petWindow?.isVisible()) {
        hiddenByFullscreen = true;
        petWindow.hide();
        hideCapture();
      }
    } else {
      // ¡Al salir de pantalla completa, reaparece automáticamente de inmediato!
      if (hiddenByFullscreen && !userHidden) {
        showPet();
      } else {
        hiddenByFullscreen = false;
      }
    }
  });

  watcher.start();
  app.on('before-quit', () => watcher.stop());
}

// ─── Global shortcut ───────────────────────────────────────────────────────────
function setupGlobalShortcut() {
  // Ctrl+Shift+H → toggle pet visibility
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (petWindow?.isVisible() && !userHidden) {
      hidePet();
    } else {
      showPet(true);
      petWindow?.webContents.send('show-feedback', '¡Aquí estoy!');
    }
  });

  // Ctrl+Shift+N → open capture panel quickly (even from other apps)
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    showCapture();
  });

  // Ctrl+Shift+B → open/toggle brain graph window
  globalShortcut.register('CommandOrControl+Shift+B', () => {
    if (brainWindow?.isVisible()) {
      brainWindow.hide();
    } else {
      showBrain();
    }
  });

  // Ctrl+Shift+P → open/toggle canvas whiteboard window
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (canvasWindow?.isVisible()) {
      canvasWindow.hide();
    } else {
      showCanvas();
    }
  });
}

// ─── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('pet-clicked',   () => toggleCapture());
ipcMain.on('close-capture', () => hideCapture());
ipcMain.on('open-board',    () => showBoard());
ipcMain.on('close-board',   () => boardWindow?.hide());
ipcMain.on('open-brain',    () => showBrain());
ipcMain.on('close-brain',   () => brainWindow?.hide());
ipcMain.on('open-canvas',   () => showCanvas());
ipcMain.on('close-canvas',  () => canvasWindow?.hide());

ipcMain.on('show-pet-menu', () => {
  const currentOpacity = store.get('petOpacity', 1.0);
  const menu = Menu.buildFromTemplate([
    { label: 'Notip — Mascota', enabled: false },
    { type: 'separator' },
    {
      label: 'Opacidad',
      submenu: [
        {
          label: '100% (Sólido)',
          type: 'radio',
          checked: Math.abs(currentOpacity - 1.0) < 0.05,
          click: () => {
            store.set('petOpacity', 1.0);
            petWindow?.webContents.send('set-opacity', 1.0);
          },
        },
        {
          label: '80%',
          type: 'radio',
          checked: Math.abs(currentOpacity - 0.8) < 0.05,
          click: () => {
            store.set('petOpacity', 0.8);
            petWindow?.webContents.send('set-opacity', 0.8);
          },
        },
        {
          label: '60%',
          type: 'radio',
          checked: Math.abs(currentOpacity - 0.6) < 0.05,
          click: () => {
            store.set('petOpacity', 0.6);
            petWindow?.webContents.send('set-opacity', 0.6);
          },
        },
        {
          label: '40% (Translúcido / Fantasma)',
          type: 'radio',
          checked: Math.abs(currentOpacity - 0.4) < 0.05,
          click: () => {
            store.set('petOpacity', 0.4);
            petWindow?.webContents.send('set-opacity', 0.4);
          },
        },
      ],
    },
    {
      label: 'Posición rápida',
      submenu: [
        { label: 'Esquina inferior derecha', click: () => dockPetToCorner('bottom-right') },
        { label: 'Esquina inferior izquierda', click: () => dockPetToCorner('bottom-left') },
        { label: 'Esquina superior derecha', click: () => dockPetToCorner('top-right') },
        { label: 'Centrar mascota en pantalla', click: () => dockPetToCorner('center') },
      ],
    },
    { type: 'separator' },
    { label: 'Nueva captura / Chat', click: () => showCapture() },
    { label: 'Tablero de tareas (Kanban)', click: () => showBoard() },
    { label: 'El Cerebro (Grafo 2D/3D)', click: () => showBrain() },
    { label: 'Pizarra de notas (Canvas)', click: () => showCanvas() },
    { label: 'Abrir carpeta Vault', click: () => shell.openPath(vaultPath) },
    { type: 'separator' },
    { label: 'Ocultar mascota (Ctrl+Shift+H)', click: () => hidePet() },
    { label: 'Salir de Notip', click: () => app.exit(0) },
  ]);
  if (petWindow) {
    menu.popup({ window: petWindow });
  }
});

// Mover la mascota (arrastre fijado exactamente al cursor del mouse)
let dragGrabOffsetX = 130;
let dragGrabOffsetY = 114;

ipcMain.on('start-pet-drag', (_e, clientX, clientY) => {
  dragGrabOffsetX = (typeof clientX === 'number' && Number.isFinite(clientX)) ? Math.round(clientX) : 130;
  dragGrabOffsetY = (typeof clientY === 'number' && Number.isFinite(clientY)) ? Math.round(clientY) : 114;
});

ipcMain.on('pet-drag-move', () => {
  if (!petWindow || petWindow.isDestroyed()) return;
  try {
    const cursor = screen.getCursorScreenPoint();
    if (!cursor || !Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) return;

    const offX = (typeof dragGrabOffsetX === 'number' && Number.isFinite(dragGrabOffsetX)) ? dragGrabOffsetX : 130;
    const offY = (typeof dragGrabOffsetY === 'number' && Number.isFinite(dragGrabOffsetY)) ? dragGrabOffsetY : 114;

    const newX = Math.round(cursor.x - offX);
    const newY = Math.round(cursor.y - offY);

    // Permitir al robot esconderse parcialmente en bordes y esquinas (dejando ~28px visible para interactuar o arrastrar)
    const primaryDisplay = screen.getPrimaryDisplay();
    const wa = primaryDisplay.workArea;
    const minX = wa.x - 150;
    const maxX = wa.x + wa.width - 110;
    const minY = wa.y - 134;
    const maxY = wa.y + wa.height - 94;
    const clampedX = Math.max(minX, Math.min(newX, maxX));
    const clampedY = Math.max(minY, Math.min(newY, maxY));
    
    if (Number.isFinite(clampedX) && Number.isFinite(clampedY)) {
      petWindow.setPosition(clampedX, clampedY);
      checkPetDocking(clampedX, clampedY);
      
      // Mantener el chat pegado pasando las nuevas coordenadas exactas
      if (captureWindow && !captureWindow.isDestroyed() && captureWindow.isVisible()) {
        positionCaptureNearPet(clampedX, clampedY);
      }
    }
  } catch (err) {
    console.error('[pet-drag-move] Error:', err);
  }
});

ipcMain.on('stop-pet-drag', () => {
  if (petWindow && !petWindow.isDestroyed()) {
    try {
      const [nx, ny] = petWindow.getPosition();
      if (Number.isFinite(nx) && Number.isFinite(ny)) {
        store.set('petX', nx);
        store.set('petY', ny);
        checkPetDocking(nx, ny);
      }
    } catch (_) {}
  }
});

// ─── Save note + AI classification ────────────────────────────────────────────
ipcMain.handle('save-note', async (_e, texto, forcedType = null, contextoPrevio = null) => {
  if (!texto?.trim()) return { success: false, error: 'Texto vacío' };
  texto = texto.trim();

  const { saveRawNote, saveClassifiedNote } = require('./src/notes/notesManager');
  const { clasificarConReintentos, tieneApiKey } = require('./src/ai/classifier');

  // Si no hay contexto previo, guardamos archivo crudo inmediatamente
  let rawResult = null;
  if (!contextoPrevio) {
    try {
      rawResult = saveRawNote(texto, vaultPath);
    } catch (err) {
      return { success: false, error: `Error al guardar: ${err.message}` };
    }
  }

  // Sin API key → retornar guardado crudo
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!tieneApiKey(apiKey)) {
    return { success: true, classified: false, tipo: 'sin_clasificar', titulo: rawResult?.filename, sinApiKey: true };
  }

  // Notificar estado "pensando"
  petWindow?.webContents.send('set-thinking', true);
  captureWindow?.webContents.send('ai-thinking');

  let clasificacion;
  try {
    const { getAllNotes } = require('./src/notes/notesManager');
    const existingVaultNotes = getAllNotes(vaultPath).map(n => ({
      filename: n.filename,
      titulo: n.titulo || n.filename,
      tipo: n.tipo,
      tags: n.tags || [],
    }));
    clasificacion = await clasificarConReintentos(texto, apiKey, forcedType, contextoPrevio, existingVaultNotes);
  } catch (err) {
    petWindow?.webContents.send('set-thinking', false);
    return {
      success: true, classified: false,
      tipo: 'sin_clasificar', titulo: rawResult?.filename,
      errorIa: true, errorMsg: getErrorMsg(err),
    };
  }

  petWindow?.webContents.send('set-thinking', false);

  // Guardar clasificado o actualizar la nota existente
  let taskObj = null;
  let fileInfo = null;
  try {
    const { addTask, updateTask } = require('./src/db/database');
    const { saveClassifiedNote, updateExistingNote } = require('./src/notes/notesManager');

    const esModificacion = Boolean(contextoPrevio && clasificacion.es_modificacion_de_anterior);

    if (!esModificacion) {
      if (clasificacion.tipo === 'tarea') {
        taskObj = addTask({
          titulo:         clasificacion.titulo_corto || clasificacion.texto_reescrito || texto,
          descripcion:    clasificacion.descripcion || clasificacion.texto_reescrito || null,
          curso:          clasificacion.curso,
          fecha_entrega:  clasificacion.fecha_entrega,
          hora_entrega:   clasificacion.hora_entrega || null,
          prioridad:      clasificacion.prioridad || 'normal',
          fecha_creacion: new Date().toISOString(),
          nota_origen:    rawResult?.filename,
        });
        captureWindow?.webContents.send('tasks-updated');
        notifyBoardTasksUpdated();
      }
      fileInfo = saveClassifiedNote(texto, clasificacion, vaultPath, rawResult?.filePath);
    } else {
      // Es una modificación o continuación confirmada de la misma nota
      // 1. Actualizar en SQLite si es tarea
      if (contextoPrevio.taskId) {
        updateTask(contextoPrevio.taskId, {
          titulo:        clasificacion.titulo_corto || clasificacion.texto_reescrito,
          descripcion:   clasificacion.descripcion || clasificacion.texto_reescrito,
          curso:         clasificacion.curso,
          fecha_entrega: clasificacion.fecha_entrega,
          hora_entrega:  clasificacion.hora_entrega || undefined,
          prioridad:     clasificacion.prioridad || 'normal',
        });
        taskObj = { id: contextoPrevio.taskId };
        captureWindow?.webContents.send('tasks-updated');
        notifyBoardTasksUpdated();
      } else if (clasificacion.tipo === 'tarea') {
        // Si antes no era tarea y ahora se convirtió en una:
        taskObj = addTask({
          titulo:         clasificacion.titulo_corto || clasificacion.texto_reescrito || texto,
          descripcion:    clasificacion.descripcion || clasificacion.texto_reescrito || null,
          curso:          clasificacion.curso,
          fecha_entrega:  clasificacion.fecha_entrega,
          hora_entrega:   clasificacion.hora_entrega || null,
          prioridad:      clasificacion.prioridad || 'normal',
          fecha_creacion: new Date().toISOString(),
        });
        captureWindow?.webContents.send('tasks-updated');
        notifyBoardTasksUpdated();
      }

      // 2. Actualizar archivo Markdown en el vault
      if (contextoPrevio.filePath) {
        updateExistingNote(contextoPrevio.filePath, clasificacion);
        fileInfo = { filePath: contextoPrevio.filePath };
      }
    }
  } catch (err) {
    console.error('[save-note] post-processing error:', err);
  }

  // Notificar al cerebro, al kanban y a la pizarra
  notifyBrainNotesUpdated();
  notifyCanvasNotesUpdated();

  // (El feedback se muestra directamente en el panel de captura/chat de Notip, no sobre la mascota)

  return {
    success:          true,
    classified:       true,
    tipo:             clasificacion.tipo,
    titulo:           clasificacion.titulo_corto,
    texto_reescrito:  clasificacion.texto_reescrito,
    curso:            clasificacion.curso,
    fecha_entrega:    clasificacion.fecha_entrega,
    mensaje_feedback: clasificacion.mensaje_feedback,
    taskId:           taskObj?.id ?? contextoPrevio?.taskId ?? null,
    filePath:         fileInfo?.filePath ?? contextoPrevio?.filePath ?? null,
    error_ia:         clasificacion.error_clasificacion ?? false,
  };
});

ipcMain.handle('get-notes-count', async () => {
  try { return fs.readdirSync(vaultPath).filter(f => f.endsWith('.md')).length; }
  catch { return 0; }
});

ipcMain.handle('open-vault', async () => shell.openPath(vaultPath));

// ─── Tasks IPC (Phase 3) ───────────────────────────────────────────────────────
ipcMain.handle('get-tasks', async (_e, filtro) => {
  const { getTasks } = require('./src/db/database');
  return getTasks(filtro);
});

ipcMain.handle('toggle-task', async (_e, id) => {
  const { toggleTaskStatus } = require('./src/db/database');
  const res = toggleTaskStatus(id);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  return res;
});

ipcMain.handle('add-task', async (_e, tarea) => {
  const { addTask } = require('./src/db/database');
  const res = addTask(tarea);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  return res;
});

ipcMain.handle('delete-task', async (_e, id) => {
  const { deleteTask } = require('./src/db/database');
  const res = deleteTask(id);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  return res;
});

ipcMain.handle('update-task', async (_e, id, campos) => {
  const { updateTask } = require('./src/db/database');
  const res = updateTask(id, campos);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  return res;
});

ipcMain.handle('update-task-state', async (_e, id, estado) => {
  const { updateTaskState } = require('./src/db/database');
  const res = updateTaskState(id, estado);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  return res;
});

// ─── Brain IPC (Phase 5) ───────────────────────────────────────────────────────
ipcMain.handle('get-vault-notes', async () => {
  const { getAllNotes } = require('./src/notes/notesManager');
  return getAllNotes(vaultPath);
});

ipcMain.handle('save-note-connections', async (_e, filename, targetTitle) => {
  const { addConnectionToNote } = require('./src/notes/notesManager');
  const filePath = path.join(vaultPath, filename);
  const res = addConnectionToNote(filePath, targetTitle);
  notifyBrainNotesUpdated();
  return res;
});

ipcMain.handle('update-note-content', async (_e, filename, campos) => {
  const { updateNoteFields } = require('./src/notes/notesManager');
  const filePath = path.join(vaultPath, filename);
  const res = updateNoteFields(filePath, campos);
  notifyBrainNotesUpdated();
  notifyCanvasNotesUpdated();
  return res;
});

ipcMain.handle('delete-note', async (_e, filename) => {
  const { deleteNote } = require('./src/notes/notesManager');
  const filePath = path.join(vaultPath, filename);
  const res = deleteNote(filePath);
  notifyBrainNotesUpdated();
  notifyCanvasNotesUpdated();
  return res;
});

// ─── Canvas Layout Persistence ────────────────────────────────────────────────
ipcMain.handle('get-canvas-layout', async () => {
  try {
    const layoutPath = path.join(vaultPath, '.canvas_layout.json');
    if (fs.existsSync(layoutPath)) {
      const raw = fs.readFileSync(layoutPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[get-canvas-layout] Error:', err);
  }
  return {};
});

ipcMain.handle('save-canvas-layout', async (_e, layout) => {
  try {
    const layoutPath = path.join(vaultPath, '.canvas_layout.json');
    if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });
    fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('[save-canvas-layout] Error:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('auto-connect-brain', async () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { tieneApiKey, descubrirConexionesGlobales } = require('./src/ai/classifier');
  if (!tieneApiKey(apiKey)) {
    return { success: false, error: 'Sin API key configurada' };
  }
  const { getAllNotes, addSuggestedConnection } = require('./src/notes/notesManager');
  const notes = getAllNotes(vaultPath);
  if (notes.length < 2) {
    return { success: false, error: 'Necesitas al menos 2 notas para encontrar conexiones.' };
  }

  try {
    const conexiones = await descubrirConexionesGlobales(notes, apiKey);
    let count = 0;
    for (const conn of conexiones) {
      const fromNote = notes.find(n => n.filename === conn.origenId);
      const toNote = notes.find(n => n.filename === conn.destinoId);
      if (fromNote && toNote) {
        addSuggestedConnection(path.join(vaultPath, fromNote.filename), toNote.titulo || toNote.filename);
        addSuggestedConnection(path.join(vaultPath, toNote.filename), fromNote.titulo || fromNote.filename);
        count++;
      }
    }
    notifyBrainNotesUpdated();
    return { success: true, count, conexiones };
  } catch (err) {
    console.error('[auto-connect-brain] Error:', err);
    return { success: false, error: err.message };
  }
});

// ─── Error helper ──────────────────────────────────────────────────────────────
function getErrorMsg(err) {
  const s = err?.status ?? err?.statusCode ?? 0;
  if (s === 401) return 'API key inválida';
  if (s === 402 || s === 403) return 'Créditos insuficientes';
  if (s === 429) return 'Rate limit — reintentando…';
  if (!s && err?.code === 'ENOTFOUND') return 'Sin conexión a internet';
  return err?.message ?? 'Error desconocido';
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  ensureDirs();
  try {
    const { initDatabase } = require('./src/db/database');
    await initDatabase(dataPath);
  } catch (err) {
    console.error('[main] Error al iniciar SQLite:', err);
  }
  createPetWindow();
  createCaptureWindow();
  createBoardWindow();
  createBrainWindow();
  createTray();
  setupGlobalShortcut();
  setupFullscreenWatcher();
});

app.on('window-all-closed', e => e.preventDefault());

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  petWindow?.destroy();
  captureWindow?.destroy();
  boardWindow?.destroy();
  brainWindow?.destroy();
  try { require('./src/db/database').closeDatabase(); } catch { /* ignore */ }
});
