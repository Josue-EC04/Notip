'use strict';

// vis-network & vis-data loaded from script tag or require fallback
const vis = (typeof window !== 'undefined' && window.vis)
  ? window.vis
  : require('vis-network/standalone/umd/vis-network.min');

// ─── State ─────────────────────────────────────────────────────────────────────
let network         = null;
let nodesDS         = null; // vis DataSet
let edgesDS         = null; // vis DataSet
let allNotes        = [];   // raw note objects from vault
let activeFilter    = 'todas';
let searchQuery     = '';
let selectedNodeId  = null;
let physicsEnabled  = true;
let focusModeActive = false;
let currentEdges    = [];

// Connection mode
let connectMode     = false;
let connectSelected = new Set();

// ─── Color map (Editorial Warm & Jewel Palette) ──────────────────────────────
const TYPE_COLORS = {
  idea:           { bg: '#0284C7', border: '#38BDF8', glow: 'rgba(2, 132, 199, 0.35)', highlight: '#0369A1', font: '#1C1917' },
  nota:           { bg: '#7C3AED', border: '#A78BFA', glow: 'rgba(124, 58, 237, 0.35)', highlight: '#6D28D9', font: '#1C1917' },
  tarea:          { bg: '#D97706', border: '#FBBF24', glow: 'rgba(217, 119, 6, 0.35)', highlight: '#B45309', font: '#1C1917' },
  sin_clasificar: { bg: '#78716C', border: '#CBD5E1', glow: 'rgba(120, 113, 108, 0.25)', highlight: '#57534E', font: '#1C1917' },
};

const BADGE_CLASS = {
  idea: 'badge-idea', nota: 'badge-nota', tarea: 'badge-tarea',
};

// ─── Dynamic Neural Cortex & Synapse Engine (Living Knowledge Flow) ─────────
let cosmosCanvas = null;
let cosmosCtx = null;
let cosmosWidth = 0;
let cosmosHeight = 0;
let cosmosAnimId = null;

const SYNAPSE_NODES = [];
const SYNAPSE_PULSES = [];
const CORTEX_WAVES = [
  { xRatio: 0.22, yRatio: 0.28, baseR: 480, color: 'rgba(215, 210, 202, 0.050)', vx: 0.000025, vy: 0.000018, phase: 0 },
  { xRatio: 0.76, yRatio: 0.68, baseR: 520, color: 'rgba(220, 216, 208, 0.045)', vx: -0.000020, vy: 0.000025, phase: 1.8 },
  { xRatio: 0.48, yRatio: 0.42, baseR: 550, color: 'rgba(215, 210, 202, 0.045)', vx: 0.000018, vy: -0.000020, phase: 3.4 },
  { xRatio: 0.84, yRatio: 0.24, baseR: 440, color: 'rgba(225, 220, 212, 0.040)', vx: -0.000020, vy: -0.000018, phase: 4.8 }
];

const neuralMouse = { x: -2000, y: -2000, active: false };

function initCosmosEngine() {
  cosmosCanvas = document.getElementById('cosmos-canvas');
  if (!cosmosCanvas) return;
  cosmosCtx = cosmosCanvas.getContext('2d');

  resizeCosmosCanvas();
  window.addEventListener('resize', resizeCosmosCanvas);

  // Mouse interaction: purely visual, very subtle proximity filament (no pulling of nodes)
  const brainContainer = document.querySelector('.brain-container') || cosmosCanvas.parentElement;
  if (brainContainer) {
    brainContainer.addEventListener('mousemove', (e) => {
      const rect = cosmosCanvas.getBoundingClientRect();
      neuralMouse.x = e.clientX - rect.left;
      neuralMouse.y = e.clientY - rect.top;
      neuralMouse.active = true;
    });
    brainContainer.addEventListener('mouseleave', () => {
      neuralMouse.active = false;
    });
  }

  // Generate floating synaptic points: pure white pearl nodes, soft, elegant, zero color distraction
  SYNAPSE_NODES.length = 0;
  const count = 52;
  for (let i = 0; i < count; i++) {
    SYNAPSE_NODES.push({
      x: Math.random() * (cosmosWidth || 1920),
      y: Math.random() * (cosmosHeight || 1080),
      vx: (Math.random() - 0.5) * 0.07,
      vy: (Math.random() - 0.5) * 0.07,
      r: Math.random() * 0.8 + 2.4, // 2.4px to 3.2px: visible, delicate white pearl
      baseAlpha: Math.random() * 0.15 + 0.75, // clear white, soft
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.006 + Math.random() * 0.008,
    });
  }

  startCosmosLoop();
}

function resizeCosmosCanvas() {
  if (!cosmosCanvas) return;
  const parent = cosmosCanvas.parentElement;
  if (!parent) return;
  cosmosWidth = parent.clientWidth || window.innerWidth;
  cosmosHeight = parent.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cosmosCanvas.width = cosmosWidth * dpr;
  cosmosCanvas.height = cosmosHeight * dpr;
  if (cosmosCtx) {
    cosmosCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

function renderCosmosFrame() {
  if (!cosmosCtx || cosmosWidth === 0 || cosmosHeight === 0) return;

  // 1. Serene warm linen paper background
  cosmosCtx.fillStyle = '#F5F2EB';
  cosmosCtx.fillRect(0, 0, cosmosWidth, cosmosHeight);

  // 2. Harmonic thought waves (subtle silk-like atmospheric parchment auras)
  for (let i = 0; i < CORTEX_WAVES.length; i++) {
    const wave = CORTEX_WAVES[i];
    wave.xRatio += wave.vx;
    wave.yRatio += wave.vy;
    if (wave.xRatio > 1.15) wave.xRatio = -0.15;
    if (wave.xRatio < -0.15) wave.xRatio = 1.15;
    if (wave.yRatio > 1.15) wave.yRatio = -0.15;
    if (wave.yRatio < -0.15) wave.yRatio = 1.15;

    wave.phase += 0.003;
    const currentR = wave.baseR * (1 + Math.sin(wave.phase) * 0.08);
    const wx = wave.xRatio * cosmosWidth;
    const wy = wave.yRatio * cosmosHeight;

    const grad = cosmosCtx.createRadialGradient(wx, wy, 20, wx, wy, currentR);
    grad.addColorStop(0, wave.color);
    grad.addColorStop(0.65, wave.color.replace(/[\d.]+\)$/, '0.012)'));
    grad.addColorStop(1, 'rgba(245, 242, 235, 0)');

    cosmosCtx.fillStyle = grad;
    cosmosCtx.beginPath();
    cosmosCtx.arc(wx, wy, currentR, 0, Math.PI * 2);
    cosmosCtx.fill();
  }

  // 3. Update synaptic node positions & physics (calm, zen drift, zero aggressive pull)
  for (let i = 0; i < SYNAPSE_NODES.length; i++) {
    const node = SYNAPSE_NODES[i];

    // Maintain calm constant drift
    node.vx *= 0.996;
    node.vy *= 0.996;
    if (Math.abs(node.vx) < 0.020) node.vx += (Math.random() - 0.5) * 0.02;
    if (Math.abs(node.vy) < 0.020) node.vy += (Math.random() - 0.5) * 0.02;

    // Clamp maximum velocity to avoid any fast movement
    node.vx = Math.max(-0.08, Math.min(0.08, node.vx));
    node.vy = Math.max(-0.08, Math.min(0.08, node.vy));

    node.x += node.vx;
    node.y += node.vy;

    // Soft toroidal boundary wrap
    if (node.x < -20) node.x = cosmosWidth + 20;
    if (node.x > cosmosWidth + 20) node.x = -20;
    if (node.y < -20) node.y = cosmosHeight + 20;
    if (node.y > cosmosHeight + 20) node.y = -20;

    node.pulsePhase += node.pulseSpeed;
  }

  // 4. Synaptic filaments between nearby nodes (visible and elegant, neutral linen tone)
  const maxConnDist = 145;
  const connectedPairs = [];

  for (let i = 0; i < SYNAPSE_NODES.length; i++) {
    const nA = SYNAPSE_NODES[i];
    for (let j = i + 1; j < SYNAPSE_NODES.length; j++) {
      const nB = SYNAPSE_NODES[j];
      const dx = nB.x - nA.x;
      const dy = nB.y - nA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < maxConnDist) {
        connectedPairs.push({ nA, nB, dist });
        const strength = (1 - dist / maxConnDist);
        const alpha = strength * 0.28;

        cosmosCtx.strokeStyle = `rgba(175, 168, 158, ${alpha.toFixed(3)})`;
        cosmosCtx.lineWidth = strength * 1.0;
        cosmosCtx.beginPath();
        cosmosCtx.moveTo(nA.x, nA.y);
        cosmosCtx.lineTo(nB.x, nB.y);
        cosmosCtx.stroke();
      }
    }

    // Faint connection to cursor if near (neutral, non-distracting)
    if (neuralMouse.active) {
      const dx = neuralMouse.x - nA.x;
      const dy = neuralMouse.y - nA.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        const strength = (1 - dist / 120);
        cosmosCtx.strokeStyle = `rgba(175, 168, 158, ${(strength * 0.30).toFixed(3)})`;
        cosmosCtx.lineWidth = strength * 1.0;
        cosmosCtx.beginPath();
        cosmosCtx.moveTo(nA.x, nA.y);
        cosmosCtx.lineTo(neuralMouse.x, neuralMouse.y);
        cosmosCtx.stroke();
      }
    }
  }

  // 5. Very occasional and elegant soft white action potential impulses
  if (connectedPairs.length > 0 && SYNAPSE_PULSES.length < 3 && Math.random() < 0.02) {
    const pair = connectedPairs[Math.floor(Math.random() * connectedPairs.length)];
    SYNAPSE_PULSES.push({
      fromX: pair.nA.x,
      fromY: pair.nA.y,
      toX: pair.nB.x,
      toY: pair.nB.y,
      progress: 0,
      speed: 0.010 + Math.random() * 0.008,
    });
  }

  for (let i = SYNAPSE_PULSES.length - 1; i >= 0; i--) {
    const pulse = SYNAPSE_PULSES[i];
    pulse.progress += pulse.speed;
    if (pulse.progress >= 1) {
      SYNAPSE_PULSES.splice(i, 1);
      continue;
    }
    const px = pulse.fromX + (pulse.toX - pulse.fromX) * pulse.progress;
    const py = pulse.fromY + (pulse.toY - pulse.fromY) * pulse.progress;

    // Glowing white pulse bead
    cosmosCtx.fillStyle = '#FFFFFF';
    cosmosCtx.globalAlpha = 0.85;
    cosmosCtx.beginPath();
    cosmosCtx.arc(px, py, 2.0, 0, Math.PI * 2);
    cosmosCtx.fill();
    cosmosCtx.globalAlpha = 1.0;
  }

  // 6. Draw synaptic nodes (White pearl nodes: visible, delicate, zero colored halos)
  for (let i = 0; i < SYNAPSE_NODES.length; i++) {
    const n = SYNAPSE_NODES[i];
    const alpha = Math.max(0.65, Math.min(0.92, n.baseAlpha + Math.sin(n.pulsePhase) * 0.08));

    // Delicate perimeter definition so white stands out crisply on linen background
    cosmosCtx.globalAlpha = alpha * 0.50;
    cosmosCtx.strokeStyle = 'rgba(165, 158, 148, 0.45)';
    cosmosCtx.lineWidth = 0.85;
    cosmosCtx.beginPath();
    cosmosCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    cosmosCtx.stroke();

    // White core fill
    cosmosCtx.globalAlpha = alpha;
    cosmosCtx.fillStyle = '#FFFFFF';
    cosmosCtx.beginPath();
    cosmosCtx.arc(n.x, n.y, n.r - 0.3, 0, Math.PI * 2);
    cosmosCtx.fill();
  }
  cosmosCtx.globalAlpha = 1.0;
}

function startCosmosLoop() {
  if (cosmosAnimId) cancelAnimationFrame(cosmosAnimId);
  function loop() {
    renderCosmosFrame();
    cosmosAnimId = requestAnimationFrame(loop);
  }
  cosmosAnimId = requestAnimationFrame(loop);
}

function getDisplayTitle(note) {
  if (note && note.titulo && typeof note.titulo === 'string' && note.titulo.trim()) {
    return note.titulo.trim();
  }
  const raw = (note && note.filename) ? note.filename : '';
  return raw
    .replace(/\.md$/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}_/, '')
    .replace(/_\d+$/, '')
    .replace(/[-_]/g, ' ')
    .trim() || 'Nota sin título';
}

function drawNeuralGlow(ctx) {
  // Draw radiant neural auras and clean focus ripples around nodes
  if (nodesDS && network) {
    const positions = network.getPositions();
    nodesDS.forEach(node => {
      const pos = positions[node.id];
      if (!pos) return;

      const size = node.size || 10;
      const tipo = node._note?.tipo || 'sin_clasificar';
      const c = TYPE_COLORS[tipo] || TYPE_COLORS.sin_clasificar;
      const isSelected = (node.id === selectedNodeId);

      // Organic neural halo
      const haloRadius = size * (isSelected ? 3.0 : 2.0);
      const grad = ctx.createRadialGradient(pos.x, pos.y, 2, pos.x, pos.y, haloRadius);
      grad.addColorStop(0, c.glow || 'rgba(79, 70, 229, 0.22)');
      grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.4)');
      grad.addColorStop(1, 'rgba(251, 249, 245, 0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // If selected: clean, elegant focus rings
      if (isSelected) {
        ctx.strokeStyle = c.highlight || '#4F46E5';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * 1.35, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(79, 70, 229, 0.25)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, size * 1.75, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }
}

// ─── DOM refs ──────────────────────────────────────────────────────────────────
const graphCanvas     = document.getElementById('graph-canvas');
const searchInput     = document.getElementById('search-input');
const searchClear     = document.getElementById('search-clear');
const filterChips     = document.querySelectorAll('.chip[data-filter]');
const statNodes       = document.getElementById('stat-nodes');
const statEdges       = document.getElementById('stat-edges');
const btnClose        = document.getElementById('btn-close');

// Titlebar & Actions
const btnNewNoteBrain = document.getElementById('btn-new-note-brain');
const btnToggleSidebar= document.getElementById('btn-toggle-sidebar');
const btnOpenBoard    = document.getElementById('btn-open-board');

// 2D / 3D Mode
let currentDimension   = '2d'; // '2d' | '3d'
let graph3DInstance    = null;
const graph3DContainer = document.getElementById('graph-3d');
const btnMode2D        = document.getElementById('btn-mode-2d');
const btnMode3D        = document.getElementById('btn-mode-3d');

// Sidebar (Explorer & Detail)
const sidebarPanel         = document.getElementById('sidebar-panel');
const sidebarCloseBtn      = document.getElementById('sidebar-close-btn');
const sidebarTabNotes      = document.getElementById('sidebar-tab-notes');
const sidebarTabClusters   = document.getElementById('sidebar-tab-clusters');
const sidebarTabDetail     = document.getElementById('sidebar-tab-detail');
const viewSidebarNotes     = document.getElementById('view-sidebar-notes');
const viewSidebarClusters  = document.getElementById('view-sidebar-clusters');
const viewSidebarDetail    = document.getElementById('view-sidebar-detail');
const badgeSidebarNotes    = document.getElementById('badge-sidebar-notes');
const badgeSidebarClusters = document.getElementById('badge-sidebar-clusters');
const sidebarSearchInput   = document.getElementById('sidebar-search-input');
const sidebarNotesList     = document.getElementById('sidebar-notes-list');
const sidebarClustersList  = document.getElementById('sidebar-clusters-list');
const btnBackToList        = document.getElementById('btn-back-to-list');
const btnFocusCurrentNote  = document.getElementById('btn-focus-current-note');

// Detail Preview Elements
const previewTitle    = document.getElementById('preview-title');
const previewBadge    = document.getElementById('preview-badge');
const previewDate     = document.getElementById('preview-date');
const previewTags     = document.getElementById('preview-tags');
const previewContent  = document.getElementById('preview-content');
const connectionsList = document.getElementById('connections-list');
const previewConns    = document.getElementById('preview-connections');
const btnEditNote     = document.getElementById('btn-edit-note');
const btnDeleteNote   = document.getElementById('btn-delete-note');

// Toolbar floating
const btnZoomIn      = document.getElementById('btn-zoom-in');
const btnZoomOut     = document.getElementById('btn-zoom-out');
const btnFit         = document.getElementById('btn-fit');
const btnPhysics     = document.getElementById('btn-physics');
const btnFocusMode   = document.getElementById('btn-focus-mode');
const btnAutoConnect = document.getElementById('btn-auto-connect');
const btnConnect     = document.getElementById('btn-connect');
const connectBanner  = document.getElementById('connect-banner');
const connectCancel  = document.getElementById('connect-cancel');
const connectConfirm = document.getElementById('connect-confirm');

// Modal Edit / Create
const modalOverlay  = document.getElementById('modal-overlay');
const modalTitle    = document.getElementById('modal-title');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalSave     = document.getElementById('modal-save');
const fieldFilename = document.getElementById('edit-filename');
const fieldTitulo   = document.getElementById('field-titulo');
const fieldContenido= document.getElementById('field-contenido');
const fieldTipo     = document.getElementById('field-tipo');
const fieldTags     = document.getElementById('field-tags');
const toast         = document.getElementById('toast');

// ─── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setupEvents(); // Configurar eventos y atajos de inmediato
  initCosmosEngine();
  try {
    allNotes = await window.electronAPI.getVaultNotes();
    buildGraph();
  } catch (err) {
    console.error('Error al inicializar el grafo:', err);
    showToast('Error cargando notas: ' + err.message, 'error');
  }
}

// ─── Build graph from vault notes ──────────────────────────────────────────────
function buildGraph() {
  const notes = filterNotes(allNotes);
  const { nodes, edges } = buildNodesAndEdges(notes);
  currentEdges = edges;

  // Update stats
  statNodes.textContent = `${nodes.length} nodo${nodes.length !== 1 ? 's' : ''}`;
  statEdges.textContent = `${edges.length} conexi${edges.length !== 1 ? 'ones' : 'on'}`;

  // Update sidebar
  renderSidebar();

  if (currentDimension === '3d') {
    render3DGraph(nodes, edges);
    return;
  }

  build2DGraph(nodes, edges);
}

function getEdgeBetween(nodeAId, nodeBId) {
  if (!currentEdges) return null;
  return currentEdges.find(e =>
    (e.from === nodeAId && e.to === nodeBId) ||
    (e.from === nodeBId && e.to === nodeAId)
  );
}

function build2DGraph(nodes, edges) {
  nodesDS = new vis.DataSet(nodes);
  edgesDS = new vis.DataSet(edges);

  const options = {
    nodes: {
      shape: 'dot',
      borderWidth: 1.5,
      borderWidthSelected: 2.5,
      font: {
        color: '#1C1917',
        size: 11.5,
        face: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        strokeWidth: 0,
        background: 'rgba(255, 255, 255, 0.95)',
        borderWidth: 1,
        borderColor: '#E8E3DA',
        borderRadius: 6,
        padding: 5,
        vadjust: 6,
      },
      shadow: {
        enabled: true,
        color: 'rgba(28, 25, 23, 0.08)',
        size: 8,
        x: 0, y: 2,
      },
    },
    edges: {
      color: {
        color: 'rgba(120, 113, 108, 0.35)',
        highlight: '#4F46E5',
        hover: '#0284C7',
      },
      width: 1.5,
      smooth: {
        type: 'continuous',
        roundness: 0.25,
      },
      shadow: {
        enabled: false,
      },
      hoverWidth: 0.8,
    },
    physics: {
      enabled: physicsEnabled,
      barnesHut: {
        gravitationalConstant: -3600,
        centralGravity: 0.15,
        springLength: 180,
        springConstant: 0.03,
        damping: 0.10,
        avoidOverlap: 0.45,
      },
      stabilization: {
        iterations: 150,
        fit: true,
      },
    },
    interaction: {
      hover: true,
      tooltipDelay: 200,
      multiselect: true,
      navigationButtons: false,
      keyboard: {
        enabled: true,
        bindToWindow: false,
      },
      zoomView: true,
      dragView: true,
    },
    layout: {
      improvedLayout: true,
      randomSeed: 42,
    },
  };

  if (network) {
    network.destroy();
  }

  network = new vis.Network(graphCanvas, { nodes: nodesDS, edges: edgesDS }, options);

  // Draw neural glow & auras before rendering elements
  network.on('beforeDraw', (ctx) => {
    drawNeuralGlow(ctx);
  });

  // ── Network events ─────────────────────────────────────────────────────────
  network.on('click', (params) => {
    if (connectMode) {
      handleConnectClick(params);
      return;
    }
    if (params.nodes.length === 1) {
      selectNode(params.nodes[0]);
    } else if (params.nodes.length === 0) {
      deselectNode();
    }
  });

  network.on('doubleClick', (params) => {
    if (params.nodes.length === 1) {
      openEditModal(params.nodes[0]);
    }
  });

  network.on('hoverNode', () => {
    graphCanvas.style.cursor = 'pointer';
  });

  network.on('blurNode', () => {
    graphCanvas.style.cursor = 'default';
  });

  network.on('selectNode', (params) => {
    if (!connectMode && params.nodes.length > 1) {
      btnConnect.classList.remove('hidden');
    }
  });

  network.on('deselectNode', () => {
    if (!connectMode) {
      btnConnect.classList.add('hidden');
    }
  });

  // Guardar posiciones al arrastrar nodos o estabilizar
  network.on('dragEnd', () => {
    try { saveBrainPositions(); } catch (_) {}
  });

  // Stabilization done → fit view & save positions
  network.on('stabilizationIterationsDone', () => {
    try { saveBrainPositions(); } catch (_) {}
    try {
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    } catch (_) {}
  });
}

// ─── 3D Force Graph Render ───────────────────────────────────────────────────
function render3DGraph(nodes, edges) {
  const FG3D = (typeof ForceGraph3D !== 'undefined') ? ForceGraph3D : (window.ForceGraph3D || null);
  if (!FG3D) {
    showToast('Motor 3D no disponible', 'info');
    return;
  }

  const gData = {
    nodes: nodes.map(n => ({
      id: n.id,
      name: n.label,
      tipo: n._note?.tipo || 'sin_clasificar',
      color: TYPE_COLORS[n._note?.tipo]?.bg || '#6C5CE7',
      val: Math.max(3.5, (n.size || 14) / 3.8),
      _note: n._note,
    })),
    links: edges.map(e => ({
      source: e.from,
      target: e.to,
      color: e.dashes ? 'rgba(20, 184, 166, 0.75)' : 'rgba(108, 92, 231, 0.85)',
      name: e.title || '',
    })),
  };

  if (!graph3DInstance) {
    graph3DContainer.innerHTML = '';
    const width = graph3DContainer.clientWidth || (window.innerWidth - 320);
    const height = graph3DContainer.clientHeight || (window.innerHeight - 80);

    try {
      graph3DInstance = FG3D()(graph3DContainer)
        .width(width)
        .height(height)
        .backgroundColor('rgba(0, 0, 0, 0)')
        .graphData(gData)
        .nodeId('id')
        .nodeLabel(node => {
          const createdInfo = formatCreationDateTime(node._note?.creado || node._note?.fecha);
          const timeBadge = createdInfo ? `<span style="font-size:10.5px; color:#78716C; margin-left:6px; font-weight:normal;">· ${escapeHtml(createdInfo.label)}</span>` : '';
          return `<div style="background:#FFFFFF; padding:7px 14px; border-radius:10px; border:1px solid #E8E3DA; color:#1C1917; font-family:Inter,sans-serif; font-size:12px; box-shadow:0 8px 24px rgba(28,25,23,0.12); font-weight:500;"><span style="color:${node.color}; font-family:monospace; font-weight:700;">[${(node.tipo||'nota').toUpperCase()}]</span> ${escapeHtml(node.name)}${timeBadge}</div>`;
        })
        .nodeColor(node => node.color)
        .nodeVal('val')
        .nodeResolution(28)
        .linkColor(link => link.color)
        .linkWidth(2.2)
        .linkDirectionalParticles(3)
        .linkDirectionalParticleWidth(2.2)
        .linkDirectionalParticleSpeed(0.007)
        .linkDirectionalParticleColor(link => link.color)
        .onNodeClick(node => {
          flyToAndSelectNode(node.id);
        })
        .onNodeHover(node => {
          graph3DContainer.style.cursor = node ? 'pointer' : 'default';
        });

      // Make Three.js WebGL renderer transparent so the dynamic galaxy shines through!
      try {
        const renderer = graph3DInstance.renderer();
        if (renderer) {
          renderer.setClearColor(0x000000, 0);
        }
      } catch (_) {}

      const controls = graph3DInstance.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.6;
      }

      window.addEventListener('resize', () => {
        if (currentDimension === '3d' && graph3DInstance && graph3DContainer.clientWidth > 0) {
          graph3DInstance.width(graph3DContainer.clientWidth);
          graph3DInstance.height(graph3DContainer.clientHeight);
        }
      });

      setTimeout(() => {
        if (graph3DInstance && graph3DContainer.clientWidth > 0) {
          graph3DInstance.width(graph3DContainer.clientWidth);
          graph3DInstance.height(graph3DContainer.clientHeight);
        }
      }, 60);
    } catch (err) {
      console.error('Error al inicializar 3D:', err);
      showToast('Error en 3D: ' + err.message, 'error');
    }
  } else {
    graph3DInstance.graphData(gData);
    if (physicsEnabled) {
      graph3DInstance.resumeAnimation();
    } else {
      graph3DInstance.pauseAnimation();
    }
    setTimeout(() => {
      if (graph3DInstance && graph3DContainer.clientWidth > 0) {
        graph3DInstance.width(graph3DContainer.clientWidth);
        graph3DInstance.height(graph3DContainer.clientHeight);
      }
    }, 40);
  }
}

function switchDimension(dim) {
  if (currentDimension === dim) return;
  currentDimension = dim;

  if (dim === '3d') {
    btnMode2D.classList.remove('mode-active');
    btnMode3D.classList.add('mode-active');
    graphCanvas.classList.add('hidden');
    graph3DContainer.classList.remove('hidden');
    buildGraph();
    showToast('Vista espacial 3D activada', 'info');
  } else {
    btnMode3D.classList.remove('mode-active');
    btnMode2D.classList.add('mode-active');
    graph3DContainer.classList.add('hidden');
    graphCanvas.classList.remove('hidden');
    buildGraph();
    showToast('Vista plana 2D activada', 'info');
  }
}

// ─── Thematic Affinity & Keyword Matching ─────────────────────────────────────
const THEMATIC_CLUSTERS = [
  { name: 'Alexa / Echo Dot', words: ['alexa', 'echodot', 'echo', 'dot'] },
  { name: 'Google Calendar',  words: ['googlecalendar', 'calendar', 'calendario', 'google'] },
  { name: 'Proyecto Aimly',   words: ['aimly'] },
  { name: 'Proyectos y Desarrollo', words: ['proyecto', 'proyectos', 'accesibilidad', 'frontend', 'backend', 'desarrollo', 'web', 'software'] },
  { name: 'Finanzas / Economía', words: ['financiera', 'finanzas', 'dinero', 'inversion', 'banco'] },
  { name: 'Universidad / Carrera', words: ['universidad', 'facultad', 'carrera', 'materia', 'clase', 'clases', 'parcial', 'examen', 'estudio', 'discapacidad'] },
  { name: 'Redes y Sistemas', words: ['cisco', 'subredes', 'enrutamiento', 'wireshark', 'tcp', 'ip', 'route53', 'aws', 'servidor'] },
  { name: 'Bases de Datos',   words: ['sqlite', 'postgres', 'mysql', 'sql', 'database'] },
];

const STOP_WORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para',
  'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o',
  'este', 'si', 'porque', 'esta', 'son', 'entre', 'esta', 'cuando', 'muy', 'sin', 'sobre',
  'tambien', 'me', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante',
  'todos', 'uno', 'les', 'ni', 'contra', 'otros', 'ese', 'eso', 'ante', 'ellos', 'e',
  'esto', 'mi', 'antes', 'algunos', 'que', 'unos', 'yo', 'otro', 'otras', 'otra', 'el',
  'tanto', 'esa', 'estos', 'mucho', 'quienes', 'nada', 'muchos', 'cual', 'poco', 'ella',
  'estar', 'estas', 'algunas', 'algo', 'nosotros', 'mi', 'mis', 'tu', 'te', 'ti', 'tarea',
  'nota', 'idea', 'hacer', 'crear', 'agregar', 'nuevo', 'nueva', 'recordar', 'comprar',
  'mejorar', 'integrar', 'preparar', 'ver', 'revisar'
]);

function normalizeWord(w) {
  return (w || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractNoteTerms(note) {
  const text = `${note.titulo || ''} ${note.content || ''} ${(note.tags || []).join(' ')}`;
  const rawWords = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/);
  const terms = new Set();
  rawWords.forEach(w => {
    if (w.length >= 4 && !STOP_WORDS.has(w)) {
      terms.add(w);
    }
  });
  return terms;
}

function findMatchingNode(targetTitle, notes, currentFilename) {
  if (!targetTitle) return null;
  const targetClean = normalizeWord(targetTitle);
  if (!targetClean) return null;

  for (const n of notes) {
    if (n.filename === currentFilename) continue;
    const t = normalizeWord(n.titulo || '');
    const f = normalizeWord(n.filename.replace(/\.md$/, ''));
    if (t === targetClean || f === targetClean) return n.filename;
  }

  if (targetClean.length >= 4) {
    for (const n of notes) {
      if (n.filename === currentFilename) continue;
      const t = normalizeWord(n.titulo || '');
      if (t && (t.includes(targetClean) || targetClean.includes(t))) {
        return n.filename;
      }
    }
  }
  return null;
}

function checkThematicAffinity(termsA, termsB, noteA, noteB) {
  // 1. Etiquetas en común (máxima precisión)
  const tagsA = (noteA?.tags || []).map(t => normalizeWord(t)).filter(t => t.length >= 3);
  const tagsB = (noteB?.tags || []).map(t => normalizeWord(t)).filter(t => t.length >= 3);
  const commonTags = tagsA.filter(t => tagsB.includes(t));
  if (commonTags.length > 0) {
    return {
      match: true,
      topic: `Etiqueta #${commonTags[0]}`,
      relationType: 'tag',
      keywords: commonTags.map(t => '#' + t),
      description: `Etiquetas en común: #${commonTags.join(', #')}`,
    };
  }

  // 2. Clúster temático: deben compartir al menos una palabra clave del clúster en ambas notas
  for (const cluster of THEMATIC_CLUSTERS) {
    const commonClusterWords = cluster.words.filter(w => termsA.has(w) && termsB.has(w));
    if (commonClusterWords.length > 0) {
      return {
        match: true,
        topic: cluster.name,
        relationType: 'thematic',
        keywords: commonClusterWords,
        description: `Constelación temática "${cluster.name}" (palabra clave: "${commonClusterWords.join(', ')}")`,
      };
    }
  }

  // 3. Términos específicos en común (al menos 2 términos de >= 4 letras)
  const commonTerms = [];
  for (const t of termsA) {
    if (termsB.has(t) && t.length >= 4 && !STOP_WORDS.has(t)) {
      commonTerms.push(t);
    }
  }
  if (commonTerms.length >= 2) {
    return {
      match: true,
      topic: 'Conceptos afines',
      relationType: 'terms',
      keywords: commonTerms.slice(0, 3),
      description: `Conceptos afines: "${commonTerms.slice(0, 3).join(', ')}"`,
    };
  }

  return { match: false, keywords: [] };
}

// ─── Posiciones de Nodos Guardadas (Persistencia) ───────────────────────────
function getSavedBrainPositions() {
  try {
    const raw = localStorage.getItem('notip_brain_positions');
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveBrainPositions() {
  if (!network) return;
  try {
    const pos = network.getPositions();
    const existing = getSavedBrainPositions();
    const merged = { ...existing, ...pos };
    localStorage.setItem('notip_brain_positions', JSON.stringify(merged));
  } catch (_) {}
}

// ─── Build nodes & edges ───────────────────────────────────────────────────────
function buildNodesAndEdges(notes) {
  const nodes = [];
  const edges = [];
  const edgeSet = new Set();
  const noteTermsMap = new Map();

  notes.forEach(n => {
    noteTermsMap.set(n.filename, extractNoteTerms(n));
  });

  const savedPositions = getSavedBrainPositions();

  notes.forEach(note => {
    const tipo = note.tipo || 'sin_clasificar';
    const colors = TYPE_COLORS[tipo] || TYPE_COLORS.sin_clasificar;

    const connections = extractConnections(note.content || '');
    const suggestedConns = note.conexiones_sugeridas || [];
    const totalConns = connections.length + suggestedConns.length;

    const size = Math.min(22, Math.max(9, 9 + totalConns * 2.2));
    const savedPos = savedPositions[note.filename];

    const nodeDef = {
      id: note.filename,
      label: getDisplayTitle(note),
      title: buildTooltip(note),
      size,
      color: {
        background: colors.bg,
        border: colors.border,
        highlight: { background: colors.highlight, border: colors.border },
        hover: { background: colors.highlight, border: colors.border },
      },
      borderWidth: 1.5,
      borderWidthSelected: 2.5,
      font: {
        color: '#1C1917',
        size: 11,
        face: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        strokeWidth: 0,
        background: 'rgba(255, 255, 255, 0.95)',
        borderWidth: 1,
        borderColor: '#E8E3DA',
        borderRadius: 6,
        padding: 5,
        vadjust: 6,
      },
      _note: note,
    };

    if (savedPos && Number.isFinite(savedPos.x) && Number.isFinite(savedPos.y)) {
      nodeDef.x = savedPos.x;
      nodeDef.y = savedPos.y;
    }

    nodes.push(nodeDef);

    connections.forEach(connTitle => {
      const target = findMatchingNode(connTitle, notes, note.filename);
      if (target && target !== note.filename) {
        const edgeKey = [note.filename, target].sort().join('↔');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            from: note.filename,
            to: target,
            dashes: false,
            width: 1.8,
            relationType: 'direct',
            relationTitle: 'Enlace directo',
            keywords: [connTitle],
            description: `Mención directa en el contenido: [[${connTitle}]]`,
            color: {
              color: 'rgba(56, 189, 248, 0.6)',
              highlight: '#00F2FE',
              hover: '#38BDF8',
            },
            shadow: {
              enabled: true,
              color: 'rgba(0, 242, 254, 0.35)',
              size: 5,
            },
            title: `Conexión directa: [[${connTitle}]]\nMención explícita en el texto`,
          });
        }
      }
    });

    suggestedConns.forEach(sugTarget => {
      const target = findMatchingNode(sugTarget, notes, note.filename);
      if (target && target !== note.filename) {
        const edgeKey = [note.filename, target].sort().join('↔');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          edges.push({
            from: note.filename,
            to: target,
            dashes: false,
            width: 1.3,
            relationType: 'ai',
            relationTitle: 'Sugerencia de IA',
            keywords: [sugTarget],
            description: `Afinidad sugerida por IA: "${sugTarget}"`,
            color: {
              color: 'rgba(192, 132, 252, 0.45)',
              highlight: '#E879F9',
              hover: '#F3E8FF',
            },
            shadow: {
              enabled: true,
              color: 'rgba(192, 132, 252, 0.25)',
              size: 4,
            },
            title: `Afinidad sugerida por IA: "${sugTarget}"`,
          });
        }
      }
    });
  });

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      const noteA = notes[i];
      const noteB = notes[j];
      const edgeKey = [noteA.filename, noteB.filename].sort().join('↔');
      if (edgeSet.has(edgeKey)) continue;

      const termsA = noteTermsMap.get(noteA.filename);
      const termsB = noteTermsMap.get(noteB.filename);
      if (!termsA || !termsB) continue;

      const affinity = checkThematicAffinity(termsA, termsB, noteA, noteB);
      if (affinity.match) {
        edgeSet.add(edgeKey);
        const kwDetails = (affinity.keywords && affinity.keywords.length) ? `\nPalabras clave: ${affinity.keywords.join(', ')}` : '';
        edges.push({
          from: noteA.filename,
          to: noteB.filename,
          dashes: false,
          width: 1.2,
          relationType: affinity.relationType || 'thematic',
          relationTitle: affinity.topic,
          keywords: affinity.keywords || [],
          description: affinity.description,
          color: {
            color: 'rgba(192, 132, 252, 0.38)',
            highlight: '#E879F9',
            hover: '#F3E8FF',
          },
          shadow: {
            enabled: true,
            color: 'rgba(192, 132, 252, 0.25)',
            size: 4,
          },
          title: `✦ ${affinity.description}${kwDetails}`,
        });
      }
    }
  }

  return { nodes, edges };
}

function extractConnections(content) {
  const matches = content.match(/\[\[(.*?)\]\]/g) || [];
  return matches.map(m => m.slice(2, -2).trim()).filter(Boolean);
}

function filterNotes(notes) {
  return notes.filter(note => {
    if (activeFilter !== 'todas' && note.tipo !== activeFilter) {
      return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = (note.titulo || '').toLowerCase();
      const content = (note.content || '').toLowerCase();
      const tags = (note.tags || []).join(' ').toLowerCase();
      if (!title.includes(q) && !content.includes(q) && !tags.includes(q)) {
        return false;
      }
    }
    return true;
  });
}

function buildTooltip(note) {
  const tipo = (note.tipo || 'nota').toUpperCase();
  const titulo = getDisplayTitle(note);
  const createdInfo = formatCreationDateTime(note.creado || note.fecha);
  const fechaStr = createdInfo ? `Creada: ${createdInfo.label}` : (note.fecha ? `Fecha: ${note.fecha}` : '');
  const tags = note.tags && note.tags.length ? `Tags: ${note.tags.join(', ')}` : '';
  const conns = extractConnections(note.content || '');
  const connStr = conns.length ? `Conexiones: ${conns.join(', ')}` : '';

  return [
    `[${tipo}] ${titulo}`,
    fechaStr,
    tags,
    connStr,
  ].filter(Boolean).join('\n');
}

// ─── Sidebar Rendering (Notes & Clusters) ──────────────────────────────────────
function renderSidebar() {
  renderSidebarNotes();
  renderSidebarClusters();
}

function renderSidebarNotes(filterText = '') {
  const notes = filterNotes(allNotes);
  const q = (filterText || sidebarSearchInput?.value || '').trim().toLowerCase();

  const filtered = notes.filter(n => {
    if (!q) return true;
    const t = (n.titulo || '').toLowerCase();
    const c = (n.content || '').toLowerCase();
    const tags = (n.tags || []).join(' ').toLowerCase();
    return t.includes(q) || c.includes(q) || tags.includes(q);
  });

  if (badgeSidebarNotes) {
    badgeSidebarNotes.textContent = filtered.length;
  }

  if (!sidebarNotesList) return;
  sidebarNotesList.innerHTML = '';

  if (filtered.length === 0) {
    sidebarNotesList.innerHTML = `<p class="preview-placeholder" style="padding:16px; text-align:center;">No se encontraron notas.</p>`;
    return;
  }

  filtered.forEach(note => {
    const card = document.createElement('div');
    card.className = `note-card ${note.filename === selectedNodeId ? 'active-card' : ''}`;
    card.dataset.id = note.filename;
    card.style.borderLeftColor = TYPE_COLORS[note.tipo]?.bg || '#00F2FE';

    const tipo = note.tipo || 'nota';
    const titulo = getDisplayTitle(note);
    const createdInfo = formatCreationDateTime(note.creado || note.fecha);
    const dateStr = createdInfo ? createdInfo.label : formatCardDate(note.fecha);

    const titleEl = document.createElement('div');
    titleEl.className = 'note-card-title';
    titleEl.textContent = titulo;

    const metaEl = document.createElement('div');
    metaEl.className = 'note-card-meta';
    metaEl.innerHTML = `
      <span class="note-card-badge badge-${tipo}-bg">${tipo.toUpperCase()}</span>
      <span title="${createdInfo ? escapeHtml(createdInfo.full) : ''}">${escapeHtml(dateStr)}</span>
    `;

    card.appendChild(titleEl);
    card.appendChild(metaEl);

    card.addEventListener('click', () => {
      flyToAndSelectNode(note.filename);
    });

    sidebarNotesList.appendChild(card);
  });
}

function renderSidebarClusters() {
  if (!sidebarClustersList) return;
  sidebarClustersList.innerHTML = '';

  const detectedClusters = [];

  THEMATIC_CLUSTERS.forEach(cluster => {
    const matchingNotes = allNotes.filter(n => {
      const terms = extractNoteTerms(n);
      return cluster.words.some(w => terms.has(w));
    });

    if (matchingNotes.length > 0) {
      detectedClusters.push({
        name: cluster.name,
        notes: matchingNotes,
      });
    }
  });

  if (badgeSidebarClusters) {
    badgeSidebarClusters.textContent = detectedClusters.length;
  }

  if (detectedClusters.length === 0) {
    sidebarClustersList.innerHTML = `<p class="preview-placeholder" style="padding:16px; text-align:center;">No se detectaron grupos temáticos aún.</p>`;
    return;
  }

  detectedClusters.forEach(c => {
    const card = document.createElement('div');
    card.className = 'cluster-card';
    card.dataset.cluster = c.name;

    const previewTitles = c.notes.map(n => n.titulo || n.filename.replace(/\.md$/, '')).join(', ');

    card.innerHTML = `
      <div class="cluster-header">
        <div class="cluster-name">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
          <span>${escapeHtml(c.name)}</span>
        </div>
        <span class="cluster-count">${c.notes.length} nota${c.notes.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="cluster-notes-preview">${escapeHtml(previewTitles)}</div>
    `;

    card.addEventListener('click', () => {
      focusCluster(c.name, c.notes.map(n => n.filename));
    });

    sidebarClustersList.appendChild(card);
  });
}

function focusCluster(clusterName, noteIds) {
  if (currentDimension === '3d' && graph3DInstance) {
    showToast(`Enfocando clúster: "${clusterName}" (${noteIds.length} notas)`, 'info');
    if (noteIds.length > 0) {
      flyToAndSelectNode(noteIds[0]);
    }
  } else if (network && nodesDS) {
    network.selectNodes(noteIds);
    network.fit({ nodes: noteIds, animation: { duration: 600, easingFunction: 'easeInOutQuad' } });
    showToast(`Enfocando clúster: "${clusterName}" (${noteIds.length} notas)`, 'success');
  }
}

function updateActiveCard(nodeId) {
  document.querySelectorAll('.note-card').forEach(c => {
    c.classList.toggle('active-card', c.dataset.id === nodeId);
  });
}

function switchSidebarTab(tab) {
  sidebarTabNotes.classList.toggle('active', tab === 'notes');
  sidebarTabClusters.classList.toggle('active', tab === 'clusters');
  sidebarTabDetail.classList.toggle('active', tab === 'detail');

  viewSidebarNotes.classList.toggle('hidden', tab !== 'notes');
  viewSidebarClusters.classList.toggle('hidden', tab !== 'clusters');
  viewSidebarDetail.classList.toggle('hidden', tab !== 'detail');
}

// ─── Node selection & Flight ──────────────────────────────────────────────────
function flyToAndSelectNode(nodeId) {
  if (currentDimension === '3d' && graph3DInstance) {
    const node3D = graph3DInstance.graphData()?.nodes?.find(n => n.id === nodeId);
    if (node3D) {
      const distance = 70;
      const distRatio = 1 + distance / Math.hypot(node3D.x, node3D.y, node3D.z);
      graph3DInstance.cameraPosition(
        { x: node3D.x * distRatio, y: node3D.y * distRatio, z: node3D.z * distRatio },
        node3D,
        800
      );
    }
  } else if (network) {
    network.selectNodes([nodeId]);
    network.focus(nodeId, { scale: 1.3, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
  }
  selectNode(nodeId);
}

function selectNode(nodeId) {
  selectedNodeId = nodeId;
  const nodeData = nodesDS ? nodesDS.get(nodeId) : null;
  const note = nodeData?._note || allNotes.find(n => n.filename === nodeId);
  if (!note) return;

  // Open sidebar if collapsed
  sidebarPanel.classList.remove('collapsed');

  const tipo = note.tipo || 'nota';
  previewBadge.className = `preview-type-badge badge-${tipo}`;
  previewTitle.textContent = getDisplayTitle(note);
  previewTitle.title = previewTitle.textContent;

  const createdInfo = formatCreationDateTime(note.creado || note.fecha);
  previewDate.innerHTML = createdInfo
    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg><span title="${escapeHtml(createdInfo.full)}">Creada: ${escapeHtml(createdInfo.label)}</span>`
    : (note.fecha ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${escapeHtml(note.fecha)}` : '');
  previewTags.innerHTML = (note.tags && note.tags.length)
    ? note.tags.map(t => `<span class="tag-pill" style="padding:1px 6px; background:rgba(255,255,255,0.06); border-radius:4px; font-size:10px;">#${t}</span>`).join(' ')
    : '';

  previewContent.textContent = note.content || 'Sin contenido adicional.';

  // Connections
  let connectedNodeIds = [];
  if (network && typeof network.getConnectedNodes === 'function') {
    connectedNodeIds = network.getConnectedNodes(nodeId);
  } else if (currentEdges) {
    connectedNodeIds = currentEdges
      .filter(e => e.from === nodeId || e.to === nodeId)
      .map(e => e.from === nodeId ? e.to : e.from);
  }

  connectionsList.innerHTML = '';
  if (connectedNodeIds.length > 0) {
    previewConns.classList.remove('hidden');

    const connHeader = previewConns.querySelector('h4');
    if (connHeader) {
      connHeader.innerHTML = `Conexiones <span class="conn-count-badge">${connectedNodeIds.length}</span>`;
    }

    connectedNodeIds.forEach(cId => {
      const cNode = nodesDS ? nodesDS.get(cId) : null;
      const cNote = cNode?._note || allNotes.find(n => n.filename === cId);
      const cTitle = cNote?.titulo || cId.replace(/\.md$/, '');
      const rawTipo = (cNote?.tipo || 'nota').toLowerCase();
      const cTipo = rawTipo.toUpperCase();

      const edge = getEdgeBetween(nodeId, cId);
      const reasonText = edge?.description || (edge?.relationTitle ? `Tema: ${edge.relationTitle}` : 'Relación temática');
      const keywordsBadges = (edge?.keywords && edge.keywords.length)
        ? edge.keywords.slice(0, 2).map(kw => `<span class="conn-kw">${escapeHtml(kw)}</span>`).join('')
        : '';

      const li = document.createElement('li');
      li.className = 'conn-item';
      li.innerHTML = `
        <div class="conn-header-row">
          <span class="conn-tag tag-${rawTipo}">[${cTipo}]</span>
          <span class="conn-name" title="${escapeHtml(cTitle)}">${escapeHtml(cTitle)}</span>
          ${keywordsBadges ? `<span class="conn-kw-compact">${keywordsBadges}</span>` : ''}
        </div>
        <div class="conn-reason-compact" title="${escapeHtml(reasonText)}">
          <span class="conn-icon">✦</span>
          <span class="conn-reason-text">${escapeHtml(reasonText)}</span>
        </div>
      `;
      li.addEventListener('click', () => {
        flyToAndSelectNode(cId);
      });
      connectionsList.appendChild(li);
    });
  } else {
    previewConns.classList.add('hidden');
  }

  // Highlight connections in 2D
  if (network) highlightConnections(nodeId);

  // Switch to detail view
  sidebarTabDetail.classList.remove('hidden');
  switchSidebarTab('detail');

  // Highlight active note card in list
  updateActiveCard(nodeId);
}

function deselectNode() {
  selectedNodeId = null;
  if (focusModeActive) {
    toggleFocusMode();
  }
  sidebarTabDetail.classList.add('hidden');
  switchSidebarTab('notes');
  if (network) resetHighlights();
  updateActiveCard(null);
}

function highlightConnections(nodeId) {
  const connectedNodes = network.getConnectedNodes(nodeId);
  const connectedEdges = network.getConnectedEdges(nodeId);
  const allNodes = nodesDS.getIds();
  const allEdges = edgesDS.getIds();

  // Dim non-connected nodes
  const updates = [];
  allNodes.forEach(id => {
    if (id === nodeId || connectedNodes.includes(id)) {
      const node = nodesDS.get(id);
      const tipo = node._note?.tipo || 'sin_clasificar';
      const colors = TYPE_COLORS[tipo] || TYPE_COLORS.sin_clasificar;
      updates.push({
        id,
        opacity: 1,
        color: {
          background: colors.bg,
          border: colors.border,
          highlight: { background: colors.highlight, border: colors.border },
          hover: { background: colors.highlight, border: colors.border },
        },
      });
    } else {
      updates.push({ id, opacity: 0.15 });
    }
  });
  nodesDS.update(updates);

  // Dim non-connected edges
  const edgeUpdates = [];
  allEdges.forEach(id => {
    if (connectedEdges.includes(id)) {
      edgeUpdates.push({ id, hidden: false, color: { opacity: 1 } });
    } else {
      edgeUpdates.push({ id, hidden: false, color: { opacity: 0.08 } });
    }
  });
  edgesDS.update(edgeUpdates);
}

function resetHighlights() {
  if (!nodesDS || !edgesDS) return;
  const allNodes = nodesDS.getIds();
  const updates = allNodes.map(id => {
    const node = nodesDS.get(id);
    const tipo = node._note?.tipo || 'sin_clasificar';
    const colors = TYPE_COLORS[tipo] || TYPE_COLORS.sin_clasificar;
    return {
      id,
      opacity: 1,
      hidden: false,
      color: {
        background: colors.bg,
        border: colors.border,
        highlight: { background: colors.highlight, border: colors.border },
        hover: { background: colors.highlight, border: colors.border },
      },
    };
  });
  nodesDS.update(updates);

  const allEdges = edgesDS.getIds();
  const edgeUpdates = allEdges.map(id => ({ id, hidden: false, color: { opacity: 1 } }));
  edgesDS.update(edgeUpdates);
}

// ─── Focus Mode ───────────────────────────────────────────────────────────────
function toggleFocusMode() {
  if (!selectedNodeId) {
    showToast('Selecciona primero una nota para enfocarla', 'info');
    return;
  }

  focusModeActive = !focusModeActive;
  btnFocusMode?.classList.toggle('tool-active', focusModeActive);
  btnFocusCurrentNote?.classList.toggle('tool-active', focusModeActive);

  if (!focusModeActive) {
    resetHighlights();
    showToast('Modo enfoque desactivado', 'info');
    return;
  }

  const connectedNodes = network ? network.getConnectedNodes(selectedNodeId) : [];
  const neighborSet = new Set([selectedNodeId, ...connectedNodes]);

  if (currentDimension === '2d' && nodesDS && edgesDS) {
    const allNodeIds = nodesDS.getIds();
    const nodeUpdates = allNodeIds.map(id => ({
      id,
      hidden: !neighborSet.has(id),
    }));
    nodesDS.update(nodeUpdates);

    const allEdgeIds = edgesDS.getIds();
    const edgeUpdates = allEdgeIds.map(id => {
      const edge = edgesDS.get(id);
      return {
        id,
        hidden: !(neighborSet.has(edge.from) && neighborSet.has(edge.to)),
      };
    });
    edgesDS.update(edgeUpdates);
    network.fit({ nodes: [...neighborSet], animation: { duration: 500 } });
  }

  showToast(`Modo enfoque: viendo ${neighborSet.size} nota(s) conectadas`, 'success');
}

// ─── Connection mode ───────────────────────────────────────────────────────────
function enterConnectMode() {
  connectMode = true;
  connectSelected.clear();
  connectBanner.classList.remove('hidden');
  connectConfirm.disabled = true;
  btnConnect.classList.add('hidden');
  if (network) network.unselectAll();
  showToast('Haz clic en 2 nodos para conectarlos');
}

function exitConnectMode() {
  connectMode = false;
  connectSelected.clear();
  connectBanner.classList.add('hidden');
  if (network) network.unselectAll();
}

function handleConnectClick(params) {
  if (params.nodes.length === 1) {
    const nodeId = params.nodes[0];
    if (connectSelected.has(nodeId)) {
      connectSelected.delete(nodeId);
    } else if (connectSelected.size < 2) {
      connectSelected.add(nodeId);
    }

    network.selectNodes([...connectSelected]);
    connectConfirm.disabled = connectSelected.size !== 2;
  }
}

async function performConnection() {
  if (connectSelected.size !== 2) return;

  const [fromId, toId] = [...connectSelected];
  const fromNode = nodesDS.get(fromId);
  const toNode = nodesDS.get(toId);

  if (!fromNode?._note || !toNode?._note) return;

  const fromTitle = fromNode._note.titulo || fromNode._note.filename;
  const toTitle = toNode._note.titulo || toNode._note.filename;

  try {
    await window.electronAPI.saveNoteConnections(fromId, toTitle);
    await window.electronAPI.saveNoteConnections(toId, fromTitle);

    showToast(`Conexión creada: "${fromTitle}" ↔ "${toTitle}"`, 'success');

    exitConnectMode();
    await reloadGraph();
  } catch (err) {
    showToast('Error al crear conexión: ' + err.message, 'error');
  }
}

// ─── Modal Edit / Create ───────────────────────────────────────────────────────
function openCreateNoteModal() {
  fieldFilename.value = '';
  fieldTitulo.value = '';
  fieldContenido.value = '';
  fieldTipo.value = 'idea';
  fieldTags.value = '';
  modalTitle.textContent = 'Nueva nota en El Cerebro';
  modalOverlay.classList.remove('hidden');
  setTimeout(() => fieldTitulo.focus(), 100);
}

function openEditModal(nodeId) {
  const nodeData = nodesDS ? nodesDS.get(nodeId) : null;
  const note = nodeData?._note || allNotes.find(n => n.filename === nodeId);
  if (!note) return;

  fieldFilename.value = note.filename;
  fieldTitulo.value = note.titulo || '';
  fieldContenido.value = note.content || '';
  fieldTipo.value = note.tipo || 'nota';
  fieldTags.value = (note.tags || []).join(', ');
  modalTitle.textContent = 'Editar nota';
  modalOverlay.classList.remove('hidden');

  setTimeout(() => fieldTitulo.focus(), 100);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

async function saveModal() {
  const filename = fieldFilename.value;
  const titulo = fieldTitulo.value.trim();
  const contenido = fieldContenido.value.trim();
  const tipo = fieldTipo.value;
  const tags = fieldTags.value.split(',').map(t => t.trim()).filter(Boolean);

  if (!filename) {
    // New Note
    if (!titulo && !contenido) {
      showToast('Por favor escribe un título o contenido', 'warning');
      return;
    }
    const fullText = titulo ? `${titulo}\n\n${contenido}` : contenido;
    try {
      await window.electronAPI.saveNote(fullText, tipo);
      showToast('¡Nota creada con éxito en el cerebro!', 'success');
      closeModal();
      await reloadGraph();
    } catch (err) {
      showToast('Error al crear nota: ' + err.message, 'error');
    }
    return;
  }

  // Edit Note
  try {
    await window.electronAPI.updateNoteContent(filename, {
      titulo, content: contenido, tipo, tags,
    });
    showToast('Nota actualizada', 'success');
    closeModal();
    await reloadGraph();

    if (selectedNodeId === filename) {
      setTimeout(() => selectNode(filename), 200);
    }
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error');
  }
}

async function deleteNote() {
  if (!selectedNodeId) return;
  const nodeData = nodesDS ? nodesDS.get(selectedNodeId) : null;
  const title = nodeData?._note?.titulo || selectedNodeId;

  if (!confirm(`¿Eliminar "${title}" permanentemente?`)) return;

  try {
    // Guardar posiciones actuales de los nodos para que nada se mueva
    saveBrainPositions();

    await window.electronAPI.deleteNote(selectedNodeId);
    showToast(`"${title}" eliminada`, 'success');

    // Remover la posición de la nota eliminada
    try {
      const posMap = getSavedBrainPositions();
      delete posMap[selectedNodeId];
      localStorage.setItem('notip_brain_positions', JSON.stringify(posMap));
    } catch (_) {}

    deselectNode();
    await reloadGraph();
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
}

// ─── Reload graph ──────────────────────────────────────────────────────────────
async function reloadGraph() {
  allNotes = await window.electronAPI.getVaultNotes();
  buildGraph();
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout = null;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
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

function formatCardDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length === 3) {
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${parts[2]} ${months[parseInt(parts[1], 10) - 1] || ''}`;
  }
  return dateStr;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Setup events ──────────────────────────────────────────────────────────────
function setupEvents() {
  // Search input
  searchInput.addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    searchClear.classList.toggle('hidden', !searchQuery);
    buildGraph();
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
    buildGraph();
  });

  // Filter chips
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      activeFilter = chip.dataset.filter;
      buildGraph();
    });
  });

  // Sidebar Controls
  if (btnToggleSidebar && sidebarPanel && !sidebarPanel.classList.contains('collapsed')) {
    btnToggleSidebar.classList.add('btn-header-active');
  }

  btnToggleSidebar?.addEventListener('click', () => {
    const isCollapsed = sidebarPanel.classList.toggle('collapsed');
    btnToggleSidebar.classList.toggle('btn-header-active', !isCollapsed);
    setTimeout(() => {
      resizeCosmosCanvas();
      if (network) {
        network.redraw();
        network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
      }
      if (currentDimension === '3d' && graph3DInstance && graph3DContainer.clientWidth > 0) {
        graph3DInstance.width(graph3DContainer.clientWidth);
        graph3DInstance.height(graph3DContainer.clientHeight);
      }
    }, 300);
  });

  sidebarCloseBtn?.addEventListener('click', () => {
    sidebarPanel.classList.add('collapsed');
    btnToggleSidebar?.classList.remove('btn-header-active');
    setTimeout(() => {
      resizeCosmosCanvas();
      if (network) {
        network.redraw();
        network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
      }
      if (currentDimension === '3d' && graph3DInstance && graph3DContainer.clientWidth > 0) {
        graph3DInstance.width(graph3DContainer.clientWidth);
        graph3DInstance.height(graph3DContainer.clientHeight);
      }
    }, 300);
  });

  sidebarTabNotes?.addEventListener('click', () => switchSidebarTab('notes'));
  sidebarTabClusters?.addEventListener('click', () => switchSidebarTab('clusters'));
  sidebarTabDetail?.addEventListener('click', () => switchSidebarTab('detail'));

  sidebarSearchInput?.addEventListener('input', e => {
    renderSidebarNotes(e.target.value);
  });

  btnBackToList?.addEventListener('click', () => {
    switchSidebarTab('notes');
  });

  btnFocusCurrentNote?.addEventListener('click', toggleFocusMode);
  btnFocusMode?.addEventListener('click', toggleFocusMode);
  btnNewNoteBrain?.addEventListener('click', openCreateNoteModal);

  // Close window
  const triggerCloseBrain = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.electronAPI && typeof window.electronAPI.closeBrain === 'function') {
      window.electronAPI.closeBrain();
    }
  };

  if (btnClose) {
    btnClose.addEventListener('click', triggerCloseBrain);
    btnClose.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // Zoom controls
  btnZoomIn.addEventListener('click', () => {
    if (currentDimension === '3d' && graph3DInstance) {
      const pos = graph3DInstance.cameraPosition();
      graph3DInstance.cameraPosition({ x: pos.x * 0.8, y: pos.y * 0.8, z: pos.z * 0.8 }, null, 200);
    } else if (network) {
      const scale = network.getScale();
      network.moveTo({ scale: scale * 1.3, animation: { duration: 200 } });
    }
  });

  btnZoomOut.addEventListener('click', () => {
    if (currentDimension === '3d' && graph3DInstance) {
      const pos = graph3DInstance.cameraPosition();
      graph3DInstance.cameraPosition({ x: pos.x * 1.25, y: pos.y * 1.25, z: pos.z * 1.25 }, null, 200);
    } else if (network) {
      const scale = network.getScale();
      network.moveTo({ scale: scale / 1.3, animation: { duration: 200 } });
    }
  });

  btnFit.addEventListener('click', () => {
    if (currentDimension === '3d' && graph3DInstance) {
      graph3DInstance.cameraPosition({ x: 0, y: 0, z: 250 }, { x: 0, y: 0, z: 0 }, 600);
    } else if (network) {
      network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
    }
  });

  // Physics toggle
  btnPhysics.addEventListener('click', () => {
    physicsEnabled = !physicsEnabled;
    btnPhysics.classList.toggle('tool-active', physicsEnabled);
    if (currentDimension === '3d' && graph3DInstance) {
      physicsEnabled ? graph3DInstance.resumeAnimation() : graph3DInstance.pauseAnimation();
    } else if (network) {
      network.setOptions({ physics: { enabled: physicsEnabled } });
    }
  });

  // 2D / 3D Switch
  btnMode2D?.addEventListener('click', () => switchDimension('2d'));
  btnMode3D?.addEventListener('click', () => switchDimension('3d'));

  // Abrir Tablero Kanban
  btnOpenBoard?.addEventListener('click', () => window.electronAPI.openBoard());

  // Abrir Pizarra Canvas
  const btnOpenCanvas = document.getElementById('btn-open-canvas');
  btnOpenCanvas?.addEventListener('click', () => window.electronAPI.openCanvas());

  // Auto-connect with AI
  btnAutoConnect?.addEventListener('click', async () => {
    btnAutoConnect.classList.add('tool-active');
    showToast('Analizando relaciones del vault con IA...', 'info');
    try {
      const res = await window.electronAPI.autoConnectBrain();
      if (res.success) {
        if (res.count > 0) {
          showToast(`¡Se descubrieron y conectaron ${res.count} relaciones con IA!`, 'success');
        } else {
          showToast('No se encontraron nuevas relaciones entre las notas actuales.', 'info');
        }
        await reloadGraph();
      } else {
        showToast(res.error || 'Error al conectar con IA', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      btnAutoConnect.classList.remove('tool-active');
    }
  });

  // Connect mode
  btnConnect.addEventListener('click', enterConnectMode);
  connectCancel.addEventListener('click', exitConnectMode);
  connectConfirm.addEventListener('click', performConnection);

  // Edit / Delete
  btnEditNote.addEventListener('click', () => {
    if (selectedNodeId) openEditModal(selectedNodeId);
  });
  btnDeleteNote.addEventListener('click', deleteNote);

  // Modal
  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalSave.addEventListener('click', saveModal);
  modalOverlay.addEventListener('click', e => {
    if (e.target === modalOverlay) closeModal();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!modalOverlay.classList.contains('hidden')) {
        closeModal();
      } else if (connectMode) {
        exitConnectMode();
      } else if (selectedNodeId) {
        deselectNode();
      } else {
        triggerCloseBrain(e);
      }
    }
    // Ctrl+W / Cmd+W → close window
    if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
      e.preventDefault();
      triggerCloseBrain(e);
    }
    // Ctrl+Shift+B → toggle/close window
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      triggerCloseBrain(e);
    }
    // Ctrl+F → focus search
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Listen for updates from main process
  window.electronAPI.on('brain-notes-updated', async () => {
    await reloadGraph();
  });
}

// ─── Start ─────────────────────────────────────────────────────────────────────
init();
