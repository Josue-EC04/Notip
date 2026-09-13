'use strict';

// ─── Fondo animado de nodos ─────────────────────────────────────────────────
const canvas = document.getElementById('bg-canvas');
const ctx    = canvas.getContext('2d');

let nodes = [];
let W, H;

function resizeCanvas() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function initNodes(count = 35) {
  nodes = Array.from({ length: count }, () => ({
    x:  Math.random() * W,
    y:  Math.random() * H,
    vx: (Math.random() - 0.5) * 0.18,
    vy: (Math.random() - 0.5) * 0.18,
    r:  Math.random() * 2.5 + 1,
  }));
}

function drawBg() {
  ctx.clearRect(0, 0, W, H);

  // Conexiones entre nodos cercanos
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 110) {
        const alpha = (1 - dist / 110) * 0.22;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(139, 115, 85, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }

  // Nodos blancos perla
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(165, 150, 130, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // Mover
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < -5) n.x = W + 5;
    if (n.x > W + 5) n.x = -5;
    if (n.y < -5) n.y = H + 5;
    if (n.y > H + 5) n.y = -5;
  }

  requestAnimationFrame(drawBg);
}

resizeCanvas();
initNodes();
drawBg();
window.addEventListener('resize', () => { resizeCanvas(); initNodes(); });

// ─── UI Elements ────────────────────────────────────────────────────────────
const btnClose       = document.getElementById('btn-close');
const btnGoogleLogin = document.getElementById('btn-google-login');
const loginStatus    = document.getElementById('login-status');
const statusText     = document.getElementById('status-text');
const errorBanner    = document.getElementById('error-banner');
const errorText      = document.getElementById('error-text');

// ─── Cerrar ventana ──────────────────────────────────────────────────────────
btnClose.addEventListener('click', () => {
  window.electronAPI?.closeAuth();
});

// ─── Login con Google ────────────────────────────────────────────────────────
btnGoogleLogin.addEventListener('click', async () => {
  if (!navigator.onLine) { showError('Conéctate a internet para iniciar sesión con Google por primera vez o después de cerrar sesión.'); return; }
  hideError();
  showStatus('Abriendo el navegador de Google…');
  btnGoogleLogin.disabled = true;

  try {
    const result = await window.electronAPI?.authLogin();
    if (result?.error) {
      showError(result.error);
      hideStatus();
      btnGoogleLogin.disabled = false;
    }
    // Si el login fue exitoso, el main process cierra esta ventana y abre la app
  } catch (err) {
    showError('No se pudo conectar. Verifica tu conexión a internet.');
    hideStatus();
    btnGoogleLogin.disabled = false;
  }
});

// Escuchar eventos del proceso principal
if (window.electronAPI?.on) {
  window.electronAPI.on('auth-error', (msg) => {
    showError(msg || 'Error de autenticación');
    hideStatus();
    btnGoogleLogin.disabled = false;
  });
}

function showStatus(msg) {
  statusText.textContent = msg;
  loginStatus.style.display = 'flex';
}

function hideStatus() {
  loginStatus.style.display = 'none';
}

function showError(msg) {
  errorText.textContent = msg;
  errorBanner.style.display = 'flex';
}

function hideError() {
  errorBanner.style.display = 'none';
}

function updateConnectionHelp() {
  document.getElementById('connection-help').textContent = navigator.onLine
    ? 'Inicia sesión con Google una vez. Después podrás usar tus notas sin conexión en este equipo.'
    : 'Sin conexión. Para entrar por primera vez o después de cerrar sesión, conecta internet e inicia sesión con Google.';
  if (navigator.onLine) btnGoogleLogin.disabled = false;
}
window.addEventListener('online', updateConnectionHelp);
window.addEventListener('offline', updateConnectionHelp);
updateConnectionHelp();
