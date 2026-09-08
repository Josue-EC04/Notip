'use strict';

/**
 * database.js — SQLite usando sql.js (100% JavaScript con WebAssembly)
 * sql.js mantiene la DB en memoria y la persiste como archivo binario notip.db
 */

const fs   = require('fs');
const path = require('path');

let db     = null;
let dbFile = null;

// ─── Init ──────────────────────────────────────────────────────────────────────
async function initDatabase(dataPath) {
  if (db) return db;

  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  const initSqlJs = require('sql.js');
  dbFile = path.join(dataPath, 'notip.db');

  const SQL = await initSqlJs({
    locateFile: file => path.join(path.dirname(require.resolve('sql.js')), file),
  });

  if (fs.existsSync(dbFile)) {
    try {
      const data = fs.readFileSync(dbFile);
      db = new SQL.Database(data);
    } catch (err) {
      console.error('[database] Error leyendo DB existente, creando nueva:', err);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Crear tabla tareas si no existe
  db.run(`
    CREATE TABLE IF NOT EXISTS tareas (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo         TEXT    NOT NULL,
      curso          TEXT,
      fecha_entrega  TEXT,
      estado         TEXT    NOT NULL DEFAULT 'pendiente',
      fecha_creacion TEXT    NOT NULL,
      nota_origen    TEXT,
      prioridad      TEXT    DEFAULT 'normal'
    );
  `);

  try {
    db.run(`ALTER TABLE tareas ADD COLUMN prioridad TEXT DEFAULT 'normal'`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE tareas ADD COLUMN descripcion TEXT DEFAULT ''`);
  } catch (_) {}
  try {
    db.run(`ALTER TABLE tareas ADD COLUMN hora_entrega TEXT DEFAULT NULL`);
  } catch (_) {}

  persist();
  return db;
}

function getDatabase() {
  return db;
}

/** Escribe el estado actual de la DB al archivo binario */
function persist() {
  if (!db || !dbFile) return;
  try {
    const data = db.export();
    fs.writeFileSync(dbFile, Buffer.from(data));
  } catch (err) {
    console.error('[database] Error al persistir DB:', err);
  }
}

// ─── Task CRUD ─────────────────────────────────────────────────────────────────
function addTask(tarea) {
  if (!db) return null;
  const now         = new Date().toISOString();
  const estado      = tarea.estado || 'pendiente';
  const prioridad   = tarea.prioridad || 'normal';
  const descripcion = tarea.descripcion || null;
  const hora        = tarea.hora_entrega || null;
  db.run(
    `INSERT INTO tareas (titulo, descripcion, curso, fecha_entrega, hora_entrega, estado, fecha_creacion, nota_origen, prioridad)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tarea.titulo?.trim() || 'Sin título',
      descripcion?.trim()  || null,
      tarea.curso?.trim()  || null,
      tarea.fecha_entrega  || null,
      hora?.trim()         || null,
      estado,
      tarea.fecha_creacion || now,
      tarea.nota_origen    || null,
      prioridad,
    ]
  );
  persist();
  const rows = db.exec('SELECT max(id) FROM tareas');
  const id = rows[0]?.values[0][0];
  return { id, ...tarea, descripcion, hora_entrega: hora, estado, prioridad, fecha_creacion: now };
}

function getTasks(filtro = 'todas') {
  if (!db) return [];

  let query = `
    SELECT * FROM tareas
  `;

  if (filtro === 'pendientes') {
    query += ` WHERE estado = 'pendiente'`;
  } else if (filtro === 'completadas') {
    query += ` WHERE estado = 'hecho'`;
  }

  query += `
    ORDER BY
      CASE WHEN estado = 'hecho' THEN 1 ELSE 0 END ASC,
      CASE WHEN fecha_entrega IS NULL OR fecha_entrega = '' THEN 1 ELSE 0 END ASC,
      fecha_entrega ASC,
      fecha_creacion DESC
  `;

  const rows = db.exec(query);
  if (!rows.length) return [];
  const [{ columns, values }] = rows;
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

function toggleTaskStatus(id) {
  if (!db) return null;
  const numId = Number(id);
  const current = db.exec('SELECT estado FROM tareas WHERE id = ' + numId);
  if (!current.length || !current[0].values.length) return null;

  const prevEstado = current[0].values[0][0];
  const nuevoEstado = prevEstado === 'hecho' ? 'pendiente' : 'hecho';

  db.run('UPDATE tareas SET estado = ? WHERE id = ?', [nuevoEstado, numId]);
  persist();
  return { id: numId, estado: nuevoEstado };
}

function deleteTask(id) {
  if (!db) return false;
  const numId = Number(id);
  db.run('DELETE FROM tareas WHERE id = ?', [numId]);
  persist();
  return true;
}

function updateTask(id, campos) {
  if (!db) return null;
  const updates = [];
  const values = [];

  if (campos.titulo !== undefined) {
    updates.push('titulo = ?');
    values.push(campos.titulo);
  }
  if (campos.descripcion !== undefined) {
    updates.push('descripcion = ?');
    values.push(campos.descripcion);
  }
  if (campos.curso !== undefined) {
    updates.push('curso = ?');
    values.push(campos.curso);
  }
  if (campos.fecha_entrega !== undefined) {
    updates.push('fecha_entrega = ?');
    values.push(campos.fecha_entrega);
  }
  if (campos.hora_entrega !== undefined) {
    updates.push('hora_entrega = ?');
    values.push(campos.hora_entrega);
  }
  if (campos.estado !== undefined) {
    updates.push('estado = ?');
    values.push(campos.estado);
  }
  if (campos.prioridad !== undefined) {
    updates.push('prioridad = ?');
    values.push(campos.prioridad);
  }

  if (!updates.length) return null;
  values.push(id);

  db.run(`UPDATE tareas SET ${updates.join(', ')} WHERE id = ?`, values);
  persist();
  return true;
}

/** Mueve una tarea a un estado de columna Kanban */
function updateTaskState(id, estado) {
  if (!db) return null;
  const numId = Number(id);
  db.run('UPDATE tareas SET estado = ? WHERE id = ?', [estado, numId]);
  persist();
  return { id: numId, estado };
}

function closeDatabase() {
  if (db) {
    persist();
    try { db.close(); } catch (_) {}
    db = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  addTask,
  getTasks,
  toggleTaskStatus,
  deleteTask,
  updateTask,
  updateTaskState,
  closeDatabase,
  persist,
};
