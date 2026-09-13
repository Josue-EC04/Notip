'use strict';

const DESTINATIONS = Object.freeze({
  claude: 'https://claude.ai/new',
  gemini: 'https://gemini.google.com/app',
  chatgpt: 'https://chatgpt.com/',
});

module.exports = function registerExternalQuestion({ ipcMain, clipboard, shell }) {
  ipcMain.handle('external-question', async (_event, text, provider = null) => {
    if (typeof text !== 'string' || !text.trim() || text.length > 24000) {
      return { success: false, copied: false, error: 'Escribe una consulta de hasta 24 000 caracteres.' };
    }
    if (provider !== null && !Object.hasOwn(DESTINATIONS, provider)) {
      return { success: false, copied: false, error: 'Selecciona Claude, Gemini o ChatGPT.' };
    }
    try { clipboard.writeText(text); }
    catch (_) { return { success: false, copied: false, error: 'No se pudo copiar. Puedes seleccionar el texto y copiarlo manualmente.' }; }
    if (provider === null) return { success: true, copied: true, opened: false };
    try {
      // Only opens the selected service. The note is never placed in the URL or sent automatically.
      await shell.openExternal(DESTINATIONS[provider]);
      return { success: true, copied: true, opened: true };
    } catch (_) {
      return { success: false, copied: true, opened: false, error: 'La consulta está copiada, pero no se pudo abrir el navegador. Abre el chat y pega con Ctrl+V.' };
    }
  });
};
