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
  try {
    db.run(`ALTER TABLE tareas ADD COLUMN supabase_id TEXT DEFAULT NULL`);
  } catch (_) {}

  const columns = db.exec('PRAGMA table_info(tareas)')[0].values.map(r => r[1]);
  if (!columns.includes('duracion_min')) db.run('ALTER TABLE tareas ADD COLUMN duracion_min INTEGER DEFAULT NULL');
  if (!columns.includes('primer_paso')) db.run('ALTER TABLE tareas ADD COLUMN primer_paso TEXT DEFAULT NULL');
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
    const temporary = dbFile + '.tmp';
    fs.writeFileSync(temporary, Buffer.from(data));
    fs.renameSync(temporary, dbFile);
  } catch (err) {
    console.error('[database] Error al persistir DB:', err);
    throw err;
  }
}

// ─── Task CRUD ─────────────────────────────────────────────────────────────────
function addTask(tarea) {
  if (!db) return null;
  const now         = new Date().toISOString();
  const estado      = tarea.estado || 'pendiente';
  const prioridad   = tarea.prioridad || 'normal';
  const descripcion = tarea.descripcion ? String(tarea.descripcion).trim() : null;
  const hora        = tarea.hora_entrega ? String(tarea.hora_entrega).trim() : null;
  const titulo      = tarea.titulo ? String(tarea.titulo).trim() : 'Sin título';
  const fechaC      = tarea.fecha_creacion || now;

  db.run(
    `INSERT INTO tareas (titulo, descripcion, curso, fecha_entrega, hora_entrega, estado, fecha_creacion, nota_origen, prioridad, supabase_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      titulo,
      descripcion,
      tarea.curso?.trim() || null,
      tarea.fecha_entrega || null,
      hora,
      estado,
      fechaC,
      tarea.nota_origen   || null,
      prioridad,
      tarea.supabase_id   || null,
    ]
  );
  persist();
  const rows = db.exec('SELECT max(id) FROM tareas');
  const id = rows[0]?.values[0][0];
  if (!id) return null;

  const taskRow = db.exec('SELECT * FROM tareas WHERE id = ' + Number(id));
  if (taskRow.length && taskRow[0].values.length) {
    const cols = taskRow[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, taskRow[0].values[0][i]]));
  }

  return { id, titulo, descripcion, curso: tarea.curso || null, fecha_entrega: tarea.fecha_entrega || null, hora_entrega: hora, estado, prioridad, fecha_creacion: fechaC, nota_origen: tarea.nota_origen || null, supabase_id: tarea.supabase_id || null };
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
  const check = db.exec('SELECT id FROM tareas WHERE id = ' + numId);
  if (!check.length || !check[0].values.length) return false;

  db.run('DELETE FROM tareas WHERE id = ?', [numId]);
  persist();
  return true;
}

function updateTask(id, campos) {
  if (!db) return null;
  const numId = Number(id);
  const check = db.exec('SELECT id FROM tareas WHERE id = ' + numId);
  if (!check.length || !check[0].values.length) return null;

  const updates = [];
  const values = [];

  if (campos.titulo !== undefined) {
    updates.push('titulo = ?');
    values.push(campos.titulo ? String(campos.titulo).trim() : 'Sin título');
  }
  if (campos.descripcion !== undefined) {
    updates.push('descripcion = ?');
    values.push(campos.descripcion ? String(campos.descripcion).trim() : null);
  }
  if (campos.curso !== undefined) {
    updates.push('curso = ?');
    values.push(campos.curso ? String(campos.curso).trim() : null);
  }
  if (campos.fecha_entrega !== undefined) {
    updates.push('fecha_entrega = ?');
    values.push(campos.fecha_entrega || null);
  }
  if (campos.hora_entrega !== undefined) {
    updates.push('hora_entrega = ?');
    values.push(campos.hora_entrega ? String(campos.hora_entrega).trim() : null);
  }
  if (campos.estado !== undefined) {
    updates.push('estado = ?');
    values.push(campos.estado);
  }
  if (campos.prioridad !== undefined) {
    updates.push('prioridad = ?');
    values.push(campos.prioridad || 'normal');
  }
  if (campos.supabase_id !== undefined) {
    updates.push('supabase_id = ?');
    values.push(campos.supabase_id || null);
  }

  if (campos.duracion_min !== undefined) {
    if (![5, 15, 30, 60].includes(Number(campos.duracion_min))) throw Error('Duración no válida');
    updates.push('duracion_min = ?'); values.push(Number(campos.duracion_min));
  }
  if (campos.primer_paso !== undefined) { updates.push('primer_paso = ?'); values.push(String(campos.primer_paso || '').slice(0,500)); }
  if (!updates.length) return true;
  values.push(numId);

  db.run(`UPDATE tareas SET ${updates.join(', ')} WHERE id = ?`, values);
  persist();

  const updatedRow = db.exec('SELECT * FROM tareas WHERE id = ' + numId);
  if (updatedRow.length && updatedRow[0].values.length) {
    const cols = updatedRow[0].columns;
    return Object.fromEntries(cols.map((col, i) => [col, updatedRow[0].values[0][i]]));
  }
  return true;
}

/** Mueve una tarea a un estado de columna Kanban */
function updateTaskState(id, estado) {
  if (!db) return null;
  const numId = Number(id);
  const check = db.exec('SELECT id FROM tareas WHERE id = ' + numId);
  if (!check.length || !check[0].values.length) return null;

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
