'use strict';

const fs     = require('fs');
const path   = require('path');
const matter = require('gray-matter');

// ─── Guardar nota cruda (Phase 1 fallback) ────────────────────────────────────
function saveRawNote(texto, vaultPath) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  // Generar nombre de archivo 100% seguro para Windows
  const safeTitle = texto
    .slice(0, 20)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase() || 'nota';
  const filename = `${dateStr}_${Date.now()}_${safeTitle}.md`;
  const filePath = path.join(vaultPath, filename);

  const content = matter.stringify(texto, {
    fecha:   dateStr,
    tipo:    'sin_clasificar',
    tags:    [],
    estado:  'pendiente_clasificacion',
    creado:  now.toISOString(),
  });

  if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, filename, filePath };
}

// ─── Actualizar nota con clasificación de IA ──────────────────────────────────
/**
 * Sobreescribe el archivo .md con los metadatos y texto clasificados por IA.
 * @param {string} filePath      - Ruta al archivo existente
 * @param {object} clasificacion - Respuesta del clasificador de IA
 */
function updateNoteClassification(filePath, clasificacion) {
  if (!fs.existsSync(filePath)) return;

  const {
    tipo,
    texto_reescrito,
    titulo_corto,
    tags,
    conexiones_sugeridas,
    error_clasificacion,
  } = clasificacion;

  // Leer metadatos existentes para conservar fecha/creado
  const raw    = fs.readFileSync(filePath, 'utf8');
  const parsed = matter(raw);

  const frontmatter = {
    ...parsed.data,
    tipo,
    titulo:               titulo_corto || parsed.data.titulo,
    tags:                 tags ?? parsed.data.tags ?? [],
    estado:               'clasificado',
    clasificado_con_ia:   !error_clasificacion,
    conexiones_sugeridas: conexiones_sugeridas ?? [],
  };

  const newContent = matter.stringify(texto_reescrito || parsed.content, frontmatter);
  fs.writeFileSync(filePath, newContent, 'utf8');
}

// ─── Guardar idea/nota clasificada (crea archivo nuevo con nombre limpio) ──────
/**
 * Para ideas y notas: crea un nuevo .md con nombre basado en el título IA.
 * Elimina el archivo crudo temporal.
 * @param {string} texto          - Texto original del usuario
 * @param {object} clasificacion  - Respuesta del clasificador
 * @param {string} vaultPath
 * @param {string} rawFilePath    - Ruta del archivo crudo a reemplazar
 * @returns {{ filename: string, filePath: string }}
 */
function saveClassifiedNote(texto, clasificacion, vaultPath, rawFilePath) {
  const {
    tipo,
    texto_reescrito,
    titulo_corto,
    conexiones_sugeridas,
    error_clasificacion,
  } = clasificacion;

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const safeTitle = (titulo_corto || tipo)
    .slice(0, 25)
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase();
    
  const filename = `${dateStr}_${safeTitle}_${Date.now()}.md`;
  const filePath = path.join(vaultPath, filename);

  // Manejar colisión de nombre
  let finalPath = filePath;
  if (fs.existsSync(finalPath)) {
    finalPath = filePath.replace('.md', `_${Date.now()}.md`);
  }

  const frontmatter = {
    fecha:                dateStr,
    tipo,
    titulo:               titulo_corto,
    tags:                 Array.isArray(clasificacion.tags) ? clasificacion.tags : [],
    estado:               'clasificado',
    clasificado_con_ia:   !error_clasificacion,
    conexiones_sugeridas: Array.isArray(conexiones_sugeridas) ? conexiones_sugeridas : [],
    creado:               now.toISOString(),
  };

  const content = matter.stringify(texto_reescrito || texto, frontmatter);
  if (!fs.existsSync(vaultPath)) fs.mkdirSync(vaultPath, { recursive: true });
  fs.writeFileSync(finalPath, content, 'utf8');

  // Eliminar el archivo crudo temporal
  if (rawFilePath && fs.existsSync(rawFilePath)) {
    try { fs.unlinkSync(rawFilePath); } catch { /* ignorar */ }
  }

  return { filename: path.basename(finalPath), filePath: finalPath };
}

// ─── Actualizar nota existente desde el chat ──────────────────────────────────
function updateExistingNote(filePath, clasificacion) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw    = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);

    const frontmatter = {
      ...parsed.data,
      tipo:        clasificacion.tipo || parsed.data.tipo,
      titulo:      clasificacion.titulo_corto || parsed.data.titulo,
      tags:        Array.isArray(clasificacion.tags) ? clasificacion.tags : (parsed.data.tags || []),
      conexiones_sugeridas: Array.isArray(clasificacion.conexiones_sugeridas)
        ? [...new Set([...(parsed.data.conexiones_sugeridas || []), ...clasificacion.conexiones_sugeridas])]
        : (parsed.data.conexiones_sugeridas || []),
      modificado:  new Date().toISOString(),
    };

    const newContent = matter.stringify(clasificacion.texto_reescrito || parsed.content, frontmatter);
    fs.writeFileSync(filePath, newContent, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('[notesManager] Error updating existing note:', err);
    return null;
  }
}

// ─── Listar notas ─────────────────────────────────────────────────────────────
function getAllNotes(vaultPath) {
  if (!fs.existsSync(vaultPath)) return [];

  return fs.readdirSync(vaultPath)
    .filter(f => f.endsWith('.md'))
    .sort().reverse()
    .map(filename => {
      try {
        const fullPath = path.join(vaultPath, filename);
        const raw    = fs.readFileSync(fullPath, 'utf8');
        const parsed = matter(raw);

        let creado = parsed.data.creado;
        if (!creado) {
          const matchTs = filename.match(/_(\d{13})\.md$/);
          if (matchTs) {
            creado = new Date(parseInt(matchTs[1], 10)).toISOString();
          } else {
            try {
              const st = fs.statSync(fullPath);
              creado = (st.birthtime && st.birthtime.getFullYear() > 1970)
                ? st.birthtime.toISOString()
                : st.mtime.toISOString();
            } catch (_) {
              creado = parsed.data.fecha ? `${parsed.data.fecha}T12:00:00.000Z` : new Date().toISOString();
            }
          }
        }

        return { filename, content: parsed.content.trim(), ...parsed.data, creado };
      } catch {
        return { filename, content: '', tipo: 'error' };
      }
    });
}

// ─── Eliminar nota ────────────────────────────────────────────────────────────
function deleteNote(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (err) {
    console.error('[notesManager] Error deleting note:', err);
    return false;
  }
}

// ─── Actualizar campos de una nota (título, contenido, tipo, tags) ────────────
function updateNoteFields(filePath, campos) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw    = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);

    const frontmatter = { ...parsed.data };
    if (campos.titulo !== undefined) frontmatter.titulo = campos.titulo;
    if (campos.tipo   !== undefined) frontmatter.tipo   = campos.tipo;
    if (campos.tags   !== undefined) frontmatter.tags   = campos.tags;
    frontmatter.modificado = new Date().toISOString();

    const content = campos.content !== undefined ? campos.content : parsed.content;
    const newFile = matter.stringify(content, frontmatter);
    fs.writeFileSync(filePath, newFile, 'utf8');
    return { success: true, filePath };
  } catch (err) {
    console.error('[notesManager] Error updating note fields:', err);
    return null;
  }
}

// ─── Agregar conexión [[titulo]] al contenido de una nota ─────────────────────
function addConnectionToNote(filePath, targetTitle) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const raw    = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const link   = `[[${targetTitle}]]`;

    // Avoid duplicates
    if (parsed.content.includes(link)) return true;

    const newContent = parsed.content.trimEnd() + '\n\n' + link + '\n';
    const newFile = matter.stringify(newContent, parsed.data);
    fs.writeFileSync(filePath, newFile, 'utf8');
    return true;
  } catch (err) {
    console.error('[notesManager] Error adding connection:', err);
    return false;
  }
}

// ─── Agregar conexión sugerida al frontmatter de una nota ─────────────────────
function addSuggestedConnection(filePath, targetTitle) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    const existing = Array.isArray(parsed.data.conexiones_sugeridas) ? parsed.data.conexiones_sugeridas : [];
    if (existing.some(t => t.toLowerCase() === targetTitle.toLowerCase())) return true;

    const frontmatter = {
      ...parsed.data,
      conexiones_sugeridas: [...existing, targetTitle],
      modificado: new Date().toISOString(),
    };
    const newContent = matter.stringify(parsed.content, frontmatter);
    fs.writeFileSync(filePath, newContent, 'utf8');
    return true;
  } catch (err) {
    console.error('[notesManager] Error adding suggested connection:', err);
    return false;
  }
}

// ─── Obtener nota individual por ruta ─────────────────────────────────────────
function getNoteByPath(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(raw);
    return {
      filename: path.basename(filePath),
      filePath,
      titulo: parsed.data.titulo || path.basename(filePath, '.md'),
      contenido: parsed.content || '',
      content: parsed.content || '',
      tipo: parsed.data.tipo || 'nota',
      tags: parsed.data.tags || [],
      prioridad: parsed.data.prioridad || 'normal',
      conexiones: parsed.data.conexiones || [],
      conexiones_ia: parsed.data.conexiones_sugeridas || [],
      fecha_creacion: parsed.data.creado || new Date().toISOString(),
    };
  } catch (err) {
    console.error('[notesManager] Error in getNoteByPath:', err);
    return null;
  }
}

module.exports = {
  saveRawNote,
  updateNoteClassification,
  saveClassifiedNote,
  updateExistingNote,
  getAllNotes,
  getNoteByPath,
  deleteNote,
  updateNoteFields,
  addConnectionToNote,
  addSuggestedConnection,
};
