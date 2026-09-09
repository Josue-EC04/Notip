'use strict';

const path = require('path');
const fs   = require('fs');

// Cargar .env tanto en modo dev como empaquetado
const envPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : (process.resourcesPath && fs.existsSync(path.join(process.resourcesPath, '.env'))
      ? path.join(process.resourcesPath, '.env')
      : '.env');
require('dotenv').config({ path: envPath });

const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  screen, nativeImage, shell, globalShortcut, protocol,
} = require('electron');

// ─── Protocolo OAuth: registrar notip:// ANTES de app.whenReady() ──────────────
// Esto permite recibir el callback de Google OAuth sin un servidor web local.
protocol.registerSchemesAsPrivileged([
  { scheme: 'notip', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

// Optimización de GPU: evitar errores de GPU caché en disco en Windows manteniendo la aceleración fluida
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Identificador de aplicación para Windows (asegura agrupación e icono correcto en la barra de tareas y accesos directos)
app.setAppUserModelId('com.notip.app');

// Registrar app como handler del protocolo notip:// en Windows
// En desarrollo, Windows necesita process.execPath y la ruta del proyecto para no intentar ejecutar la URL como módulo
function registerProtocolClient() {
  try {
    if (process.defaultApp || !app.isPackaged) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('notip', process.execPath, [path.resolve(process.argv[1])]);
      } else {
        app.setAsDefaultProtocolClient('notip', process.execPath, [path.resolve(__dirname)]);
      }
    } else {
      app.setAsDefaultProtocolClient('notip');
    }
  } catch (err) {
    console.error('[main] Error registrando protocolo notip://', err);
  }
}
registerProtocolClient();

const appIconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
const appIconIco  = path.join(__dirname, 'src', 'assets', 'icon.ico');

const Store = require('electron-store');
const store = new Store();

// Evitar múltiples instancias simultáneas que causen desincronización
// También necesario para recibir el callback OAuth notip:// en Windows
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', (_e, argv) => {
    console.log('[second-instance] args recibidos:', argv);
    // En Windows el deep link llega como argumento de línea de comandos
    const url = argv.find(arg => 
      typeof arg === 'string' && (
        arg.startsWith('notip://') || 
        arg.includes('notip://') || 
        arg.includes('access_token=') || 
        arg.includes('code=')
      )
    );
    if (url) {
      handleOAuthCallback(url);
      return;
    }
    if (petWindow) {
      if (petWindow.isMinimized()) petWindow.restore();
      petWindow.show();
      petWindow.focus();
    } else if (authWindow) {
      if (authWindow.isMinimized()) authWindow.restore();
      authWindow.show();
      authWindow.focus();
    }
  });
}

let petWindow         = null;
let captureWindow     = null;
let boardWindow       = null;
let brainWindow       = null;
let canvasWindow      = null;
let authWindow        = null;   // Ventana de login (v2)
let tray              = null;
let currentProviderToken = null; // Token de Google para Calendar (se guarda tras login)

// Track whether the user manually hid the pet
let userHidden         = false;
// Track whether we hid it due to fullscreen
let hiddenByFullscreen = false;

// ─── Configuración y Rutas ──────────────────────────────────────────────────
const userDataPath = app.getPath('userData');

// Bóveda de notas: en desarrollo usa ./vault, empaquetado usa userDataPath/vault para permisos de escritura
const defaultVault = app.isPackaged ? path.join(userDataPath, 'vault') : path.join(__dirname, 'vault');
const vaultPath = store.get('vaultPath', defaultVault);
const dataPath  = path.join(userDataPath, 'data');

function ensureDirs() {
  [vaultPath, dataPath].forEach(p => {
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  });
}

// ─── Auth window (login) ────────────────────────────────────────────────
function createAuthWindow() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.show();
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width:       480,
    height:      600,
    icon:        appIconPath,
    frame:       false,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    resizable:   false,
    center:      true,
    backgroundColor: '#F5F2EB',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  authWindow.loadFile(path.join(__dirname, 'src', 'auth', 'auth.html'));

  authWindow.on('close', e => {
    e.preventDefault();
    // Si el usuario cierra el login sin autenticarse, salir de la app
    app.exit(0);
  });
}

/**
 * Procesa la URL de callback OAuth (notip://auth-callback#access_token=... o ?code=...)
 * Soporta tanto flujo implícito (fragmento #) como flujo PKCE (código ?code=).
 */
async function handleOAuthCallback(rawUrl) {
  console.log('[auth] OAuth callback recibido:', rawUrl);
  try {
    const { getSupabaseClient, storeSession } = require('./src/supabase/client');
    const sb = getSupabaseClient();
    if (!sb) return;

    let url = typeof rawUrl === 'string' ? rawUrl.replace(/^["']|["']$/g, '').trim() : '';

    if (url.includes('notip://')) {
      const idx = url.indexOf('notip://');
      url = url.substring(idx);
    }

    // ── Caso A: Flujo implícito (tokens en fragmento #access_token=...) ────────
    if (url.includes('access_token=')) {
      console.log('[auth] Token de acceso detectado en URL fragment');
      const fragment = url.includes('#') ? url.split('#')[1] : (url.includes('?') ? url.split('?')[1] : url);
      const params = new URLSearchParams(fragment);
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      const provider_token = params.get('provider_token');

      if (access_token) {
        const { data, error } = await sb.auth.setSession({
          access_token,
          refresh_token: refresh_token || '',
        });

        if (error) {
          console.error('[auth] setSession error:', error.message);
          authWindow?.webContents.send('auth-error', error.message);
          return;
        }

        const session = data?.session;
        if (session) {
          const googleToken = provider_token || session.provider_token;
          currentProviderToken = googleToken || null;
          storeSession(session);
          if (googleToken) {
            store.set('notip-provider-token', googleToken);
          }
          console.log('[auth] Sesión iniciada con éxito para:', session.user?.email);
          onLoginSuccess();
          return;
        }
      }
    }

    // ── Caso B: Flujo PKCE (código en query ?code=...) ────────────────────────
    if (url.includes('code=')) {
      console.log('[auth] Código OAuth detectado en URL query');
      const { data, error } = await sb.auth.exchangeCodeForSession(url);
      if (error) {
        console.error('[auth] exchangeCodeForSession error:', error.message);
        authWindow?.webContents.send('auth-error', error.message);
        return;
      }

      const session = data?.session;
      if (session) {
        currentProviderToken = session.provider_token || null;
        storeSession(session);
        if (session.provider_token) {
          store.set('notip-provider-token', session.provider_token);
        }
        console.log('[auth] Sesión iniciada para:', session.user?.email);
        onLoginSuccess();
        return;
      }
    }

    console.warn('[auth] URL de callback no reconocida:', url);
    authWindow?.webContents.send('auth-error', 'Respuesta de autenticación no reconocida');
  } catch (err) {
    console.error('[auth] handleOAuthCallback error:', err);
    authWindow?.webContents.send('auth-error', err.message);
  }
}

/** Cierra la ventana de login y abre la app principal */
function onLoginSuccess() {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.removeAllListeners('close');
    authWindow.destroy();
    authWindow = null;
  }
  // Iniciar la app principal
  createPetWindow();
  createCaptureWindow();
  createBoardWindow();
  createBrainWindow();
  createTray();
  setupGlobalShortcut();
  setupFullscreenWatcher();

  // Sincronizar datos locales con la nube en segundo plano
  try {
    const { syncAllLocalToCloud } = require('./src/sync/syncManager');
    syncAllLocalToCloud(vaultPath, dataPath).catch(err => console.warn('[sync] syncAllLocalToCloud error:', err.message));
  } catch (_) {}
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

  petWindow.setAlwaysOnTop(true, 'pop-up-menu');
  try {
    petWindow.setIgnoreMouseEvents(true, { forward: true });
  } catch (_) {}
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
    width: 490, height: 560,
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
  const CW = 490;
  const CH = 560;
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

  petWindow.setAlwaysOnTop(true, 'pop-up-menu');
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
  captureWindow.setAlwaysOnTop(true, 'pop-up-menu');
  positionCaptureNearPet(px, py);
  
  // Re-confirmar posición tras el paint inicial de Windows DWM
  setTimeout(() => {
    if (captureWindow && captureWindow.isVisible() && petWindow) {
      const [curPx, curPy] = petWindow.getPosition();
      positionCaptureNearPet(curPx, curPy);
      petWindow.setAlwaysOnTop(true, 'pop-up-menu');
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
      { type: 'separator' },
      {
        label: 'Cerrar sesión',
        click: () => performLogout(),
      },
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

// Permitir que clics fuera de la mascota pasen a las ventanas/escritorio de abajo
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  win?.setIgnoreMouseEvents(ignore, options);
});

// Menú contextual con clic derecho sobre la mascota
ipcMain.on('show-pet-menu', () => {
  const { getStoredUser } = require('./src/supabase/client');
  const user = getStoredUser();
  const userEmail = user?.email || 'Usuario';
  const currentOpacity = store.get('petOpacity', 1.0);

  const menu = Menu.buildFromTemplate([
    { label: `Notip (${userEmail})`, enabled: false },
    { type: 'separator' },
    { label: 'Nueva captura / Chat (Ctrl+Shift+N)', click: () => showCapture() },
    { label: 'Tablero Kanban (Ctrl+Shift+K)', click: () => showBoard() },
    { label: 'El Cerebro (Grafo 2D/3D)', click: () => showBrain() },
    { label: 'Pizarra Canvas (Ctrl+Shift+P)', click: () => showCanvas() },
    { label: 'Abrir carpeta Vault', click: () => shell.openPath(vaultPath) },
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
          label: '40% (Translúcido)',
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
    { label: 'Ocultar mascota (Ctrl+Shift+H)', click: () => hidePet() },
    {
      label: 'Cerrar sesión',
      click: () => performLogout(),
    },
    { type: 'separator' },
    { label: 'Salir de Notip', click: () => app.exit(0) },
  ]);

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.focus();
    menu.popup({ window: petWindow });
  } else {
    menu.popup();
  }
});

// ─── Auth IPC (v2) ─────────────────────────────────────────────────────────────
ipcMain.on('close-auth', () => app.exit(0));

/** Inicia el flujo de login con Google vía Supabase */
ipcMain.handle('auth-login', async () => {
  try {
    const { getSupabaseClient } = require('./src/supabase/client');
    const sb = getSupabaseClient();
    if (!sb) return { error: 'Supabase no configurado. Revisa tu .env (SUPABASE_URL y SUPABASE_ANON_KEY).' };

    const { data, error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo:    'notip://auth-callback',
        scopes:        'openid email profile https://www.googleapis.com/auth/calendar.events',
        queryParams:   { access_type: 'offline', prompt: 'consent' },
        skipBrowserRedirect: false,
      },
    });

    if (error) return { error: error.message };

    // Abrir la URL de autorización en el navegador del sistema
    if (data?.url) {
      shell.openExternal(data.url);
      return { success: true, pending: true };
    }

    return { error: 'No se generó la URL de autorización' };
  } catch (err) {
    console.error('[auth-login] Error:', err);
    return { error: err.message };
  }
});

/** Cierra la sesión y muestra la pantalla de login */
async function performLogout() {
  try {
    const { signOut } = require('./src/supabase/client');
    await signOut();
    store.delete('notip-provider-token');
    currentProviderToken = null;

    // Destruir todas las ventanas de la app principal
    petWindow?.destroy(); petWindow = null;
    captureWindow?.destroy(); captureWindow = null;
    boardWindow?.destroy(); boardWindow = null;
    brainWindow?.destroy(); brainWindow = null;
    canvasWindow?.destroy(); canvasWindow = null;
    tray?.destroy(); tray = null;
    globalShortcut.unregisterAll();

    // Mostrar login nuevamente
    createAuthWindow();
    return { success: true };
  } catch (err) {
    console.error('[auth-logout] Error:', err);
    return { error: err.message };
  }
}

ipcMain.handle('auth-logout', async () => performLogout());

/** Devuelve el usuario y sesión activos */
ipcMain.handle('auth-get-session', async () => {
  try {
    const { getStoredUser, getStoredSession, getSupabaseClient } = require('./src/supabase/client');
    const user = getStoredUser();
    if (!user) return { user: null, session: null };
    const session = getStoredSession();
    return {
      user: { id: user.id, email: user.email, name: user.user_metadata?.full_name, avatar: user.user_metadata?.avatar_url },
      has_provider_token: !!currentProviderToken,
    };
  } catch (err) {
    return { user: null, error: err.message };
  }
});

/** Obtiene el saldo de créditos del usuario */
ipcMain.handle('get-credits', async () => {
  try {
    const { getCredits } = require('./src/sync/syncManager');
    return await getCredits();
  } catch (err) {
    return { error: err.message };
  }
});

/** Obtiene configuración de API Key y usuario para el modal de settings */
ipcMain.handle('get-settings', async () => {
  try {
    const { getStoredUser } = require('./src/supabase/client');
    const { getCredits } = require('./src/sync/syncManager');
    const user = getStoredUser();
    let credits = null;
    try {
      credits = await getCredits();
    } catch (_) {}
    const customKey = store.get('anthropic_custom_key', '');
    return {
      user: user ? { email: user.email, name: user.user_metadata?.full_name, avatar: user.user_metadata?.avatar_url } : null,
      credits,
      customKey: customKey || '',
      hasCustomKey: Boolean(customKey),
      hasDefaultKey: Boolean(process.env.ANTHROPIC_API_KEY),
    };
  } catch (err) {
    return { error: err.message };
  }
});

/** Guarda o limpia la API Key personalizada del usuario */
ipcMain.handle('save-custom-api-key', async (_e, key) => {
  try {
    if (!key || !key.trim()) {
      store.delete('anthropic_custom_key');
      return { success: true, removed: true };
    }
    const trimmed = key.trim();
    if (!trimmed.startsWith('sk-ant-')) {
      return { success: false, error: 'La API Key de Anthropic debe empezar con "sk-ant-"' };
    }
    store.set('anthropic_custom_key', trimmed);
    return { success: true, saved: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/** Prueba una API Key conectando con Claude Haiku */
ipcMain.handle('test-api-key', async (_e, keyToTest) => {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const customKey = store.get('anthropic_custom_key');
    const key = keyToTest?.trim() || customKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { success: false, error: 'No hay ninguna API Key configurada para probar.' };
    }
    const client = new Anthropic.default({ apiKey: key });
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Responde solo "Conexión exitosa"' }],
    });
    const text = resp.content?.[0]?.text || 'Conexión exitosa';
    return { success: true, response: text };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

let _google = null;
function getGoogleApi() {
  if (!_google) {
    _google = require('googleapis').google;
  }
  return _google;
}

/** Crea un evento en Google Calendar del usuario */
ipcMain.handle('add-calendar-event', async (_e, params) => {
  try {
    const providerToken = currentProviderToken || store.get('notip-provider-token');
    if (!providerToken) {
      return { error: 'No hay token de Google disponible. Cierra sesión y vuelve a entrar con Google.', needs_reauth: true };
    }

    const google = getGoogleApi();
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: providerToken });
    const calendar = google.calendar({ version: 'v3', auth });

    const { titulo, descripcion, fecha_entrega, hora_entrega } = params;

    let timeZone = 'America/Lima';
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Lima';
    } catch (_) {}

    const eventBody = {
      summary: titulo || 'Tarea de Notip',
      description: descripcion || 'Creado automáticamente desde Notip',
    };

    if (fecha_entrega && hora_entrega) {
      const parts = hora_entrega.trim().split(':');
      let h = parseInt(parts[0], 10);
      let m = parseInt(parts[1] || '0', 10);
      if (isNaN(h)) h = 10;
      if (isNaN(m)) m = 0;

      const hStartStr = String(h).padStart(2, '0');
      const mStartStr = String(m).padStart(2, '0');

      // Calcular offset local RFC 3339 (ej: -05:00 para America/Lima)
      const d = new Date();
      const offset = -d.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const pad = num => String(Math.floor(Math.abs(num))).padStart(2, '0');
      const offsetStr = sign + pad(offset / 60) + ':' + pad(offset % 60);

      const startDateTimeStr = `${fecha_entrega}T${hStartStr}:${mStartStr}:00${offsetStr}`;

      // 1 hora de duración por defecto
      let hEnd = h + 1;
      let mEnd = m;
      let endDateStr = fecha_entrega;
      if (hEnd >= 24) {
        hEnd = hEnd % 24;
        const dNext = new Date(fecha_entrega + 'T12:00:00');
        dNext.setDate(dNext.getDate() + 1);
        endDateStr = dNext.toISOString().split('T')[0];
      }
      const hEndStr = String(hEnd).padStart(2, '0');
      const mEndStr = String(mEnd).padStart(2, '0');
      const endDateTimeStr = `${endDateStr}T${hEndStr}:${mEndStr}:00${offsetStr}`;

      eventBody.start = { dateTime: startDateTimeStr, timeZone };
      eventBody.end   = { dateTime: endDateTimeStr,   timeZone };
    } else if (fecha_entrega) {
      eventBody.start = { date: fecha_entrega };
      eventBody.end   = { date: fecha_entrega };
    } else {
      const today = new Date().toISOString().split('T')[0];
      eventBody.start = { date: today };
      eventBody.end   = { date: today };
    }

    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: eventBody,
    });

    console.log('[calendar] Evento creado con éxito en Google Calendar:', res.data.id);
    return { success: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
  } catch (err) {
    console.error('[calendar] Error creando evento:', err);
    return { error: err.message };
  }
});

ipcMain.handle('open-external', (_e, url) => {
  if (url) shell.openExternal(url);
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
  const { clasificarConReintentos, tieneApiKey, localFallbackClassifier } = require('./src/ai/classifier');

  // Si no hay contexto previo, guardamos archivo crudo inmediatamente
  let rawResult = null;
  if (!contextoPrevio) {
    try {
      rawResult = saveRawNote(texto, vaultPath);
    } catch (err) {
      return { success: false, error: `Error al guardar: ${err.message}` };
    }
  }

  // Notificar estado "pensando"
  petWindow?.webContents.send('set-thinking', true);
  captureWindow?.webContents.send('ai-thinking');

  let clasificacion = null;
  const customKey = store.get('anthropic_custom_key');
  const defaultApiKey = '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';
  const apiKey = (customKey && customKey.trim()) ? customKey.trim() : (process.env.ANTHROPIC_API_KEY || defaultApiKey);

  if (tieneApiKey(apiKey)) {
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
      console.warn('[save-note] IA falló (' + err.message + '). Usando analizador inteligente local.');
      clasificacion = localFallbackClassifier(texto, forcedType, contextoPrevio);
    }
  } else {
    clasificacion = localFallbackClassifier(texto, forcedType, contextoPrevio);
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

  // Sincronizar nota en segundo plano con Supabase
  if (fileInfo?.filePath) {
    try {
      const { getNoteByPath } = require('./src/notes/notesManager');
      const noteData = getNoteByPath(fileInfo.filePath);
      if (noteData) {
        const { uploadNote } = require('./src/sync/syncManager');
        uploadNote(noteData).catch(() => {});
      }
    } catch (_) {}
  }

  // Notificar al cerebro, al kanban y a la pizarra
  notifyBrainNotesUpdated();
  notifyCanvasNotesUpdated();

  return {
    success:          true,
    classified:       true,
    tipo:             clasificacion.tipo,
    titulo:           clasificacion.titulo_corto,
    texto_reescrito:  clasificacion.texto_reescrito,
    descripcion:      clasificacion.descripcion,
    curso:            clasificacion.curso,
    fecha_entrega:    clasificacion.fecha_entrega,
    hora_entrega:     clasificacion.hora_entrega,
    prioridad:        clasificacion.prioridad || 'normal',
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
  const { toggleTaskStatus, getTasks } = require('./src/db/database');
  const res = toggleTaskStatus(id);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  try {
    const tasks = getTasks('todos');
    const t = tasks.find(x => x.id === id);
    if (t) {
      const { uploadTask } = require('./src/sync/syncManager');
      uploadTask(t).catch(() => {});
    }
  } catch (_) {}
  return res;
});

ipcMain.handle('add-task', async (_e, tarea) => {
  const { addTask } = require('./src/db/database');
  const res = addTask(tarea);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  try {
    const { uploadTask } = require('./src/sync/syncManager');
    uploadTask({ ...tarea, id: res?.id }).catch(() => {});
  } catch (_) {}
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
  const { updateTask, getTasks } = require('./src/db/database');
  const res = updateTask(id, campos);
  captureWindow?.webContents.send('tasks-updated');
  notifyBoardTasksUpdated();
  try {
    const tasks = getTasks('todos');
    const t = tasks.find(x => x.id === id);
    if (t) {
      const { uploadTask } = require('./src/sync/syncManager');
      uploadTask(t).catch(() => {});
    }
  } catch (_) {}
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

  // Iniciar SQLite local (siempre, funciona offline)
  try {
    const { initDatabase } = require('./src/db/database');
    await initDatabase(dataPath);
  } catch (err) {
    console.error('[main] Error al iniciar SQLite:', err);
  }

  // Asegurar registro del protocolo notip:// con argumentos correctos de desarrollo
  registerProtocolClient();

  // Verificar si la app fue abierta directamente mediante un deep link OAuth
  const startupUrl = process.argv.find(arg => 
    typeof arg === 'string' && (
      arg.startsWith('notip://') || 
      arg.includes('notip://') || 
      arg.includes('access_token=') || 
      arg.includes('code=')
    )
  );
  if (startupUrl) {
    console.log('[main] Iniciado con deep link:', startupUrl);
    handleOAuthCallback(startupUrl);
    return;
  }

  // Verificar si hay una sesión activa de Supabase
  const { getStoredUser } = require('./src/supabase/client');
  const user = getStoredUser();

  if (user) {
    // ✅ Sesión válida → abrir app directamente
    console.log('[main] Sesión activa para:', user.email);
    // Restaurar provider token de Calendar si existe
    currentProviderToken = store.get('notip-provider-token') || null;
    createPetWindow();
    createCaptureWindow();
    createBoardWindow();
    createBrainWindow();
    createTray();
    setupGlobalShortcut();
    setupFullscreenWatcher();

    // Sincronizar datos locales con Supabase en segundo plano
    try {
      const { syncAllLocalToCloud } = require('./src/sync/syncManager');
      syncAllLocalToCloud(vaultPath, dataPath).catch(err => console.warn('[sync] syncAllLocalToCloud error:', err.message));
    } catch (_) {}
  } else {
    // 🔐 Sin sesión → mostrar pantalla de login
    console.log('[main] Sin sesión — mostrando login');
    createAuthWindow();
  }
});

// macOS: manejar deep link cuando la app ya está abierta
app.on('open-url', (_e, url) => {
  if (url.startsWith('notip://')) {
    handleOAuthCallback(url);
  }
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
  authWindow?.destroy();
  try { require('./src/db/database').closeDatabase(); } catch { /* ignore */ }
});

