'use strict';

/**
 * fullscreenWatcher.js
 *
 * Spawns a persistent PowerShell background process that monitors whether
 * the active foreground window is running in true exclusive full-screen
 * (e.g. PC games or full-screen video), ignoring screenshot overlays,
 * system UI, taskbar, desktop, and Notip.
 *
 * Emits:
 *   'change' (isFullscreen: boolean)
 */

const { spawn }        = require('child_process');
const { EventEmitter } = require('events');
const path             = require('path');
const fs               = require('fs');

class FullscreenWatcher extends EventEmitter {
  constructor() {
    super();
    this.isFullscreen = false;
    this._proc = null;
    this._buf  = '';
    this._stopped = false;
    this._reconnectTimer = null;
  }

  start() {
    this._stopped = false;
    if (this._proc) return;

    let scriptPath = path.join(__dirname, 'checkFullscreen.ps1');
    if (scriptPath.includes('app.asar')) {
      const unpacked = scriptPath.replace('app.asar', 'app.asar.unpacked');
      const inResources = process.resourcesPath ? path.join(process.resourcesPath, 'checkFullscreen.ps1') : null;
      if (fs.existsSync(unpacked)) {
        scriptPath = unpacked;
      } else if (inResources && fs.existsSync(inResources)) {
        scriptPath = inResources;
      }
    }

    try {
      this._proc = spawn('powershell', [
        '-NonInteractive',
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch (err) {
      console.error('[FullscreenWatcher] Spawn error:', err);
      return;
    }

    this._proc.on('error', err => {
      console.warn('[FullscreenWatcher] PowerShell process error:', err.message);
    });

    this._proc.stdout.on('data', chunk => {
      this._buf += chunk.toString();
      const lines = this._buf.split('\n');
      this._buf = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const val = line.trim();
        if (val !== '1' && val !== '0') continue;
        const fullscreen = val === '1';
        if (fullscreen !== this.isFullscreen) {
          this.isFullscreen = fullscreen;
          this.emit('change', fullscreen);
        }
      }
    });

    this._proc.on('exit', () => {
      this._proc = null;
      // Auto-restart if exited unexpectedly
      if (!this._stopped) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
          if (!this._stopped) this.start();
        }, 3000);
      }
    });
  }

  stop() {
    this._stopped = true;
    clearTimeout(this._reconnectTimer);
    if (this._proc) {
      try { this._proc.kill(); } catch (_) {}
      this._proc = null;
    }
  }
}

module.exports = new FullscreenWatcher();
