# Resolver una duda en otro chat

En el chat de la mascota, cada captura muestra «Resolver esta duda», incluso si todavía está pendiente de organizar. Abre una consulta editable con el apunte y su curso cuando está disponible.

1. Revisa o modifica el texto.
2. Elige Claude, Gemini o ChatGPT.
3. Pulsa «Copiar y abrir». En el navegador, inicia un chat nuevo si hace falta, pega con Ctrl+V y envía cuando quieras.

«Solo copiar» permite preparar la consulta sin internet. Se recuerda el último servicio elegido. El borrador editado se conserva al cerrar y reabrir el diálogo de la misma consulta mientras la ventana siga abierta; no se guarda como nota ni sustituye el apunte.

La consulta se construye con una plantilla local, sin llamar a Claude ni consumir la API de Notip. No se adjunta el historial completo. El contenido no se introduce en la URL y no se envía automáticamente: el usuario lo pega y lo envía en el sitio elegido. El acceso y los límites de esos sitios dependen de su cuenta.

Si el navegador no abre, la consulta sigue copiada y aparece un aviso. Si falla el portapapeles, el texto permanece editable para copiarlo manualmente.

Implementación: `src/capture/questionHelper.js`, diálogo en `capture.html`, y `src/study/externalQuestion.js` para portapapeles y apertura del navegador. IPC con destinos fijos y validación de longitud. Las pruebas de Electron verifican los tres destinos, la copia exacta tras editar, copia sin abrir, ausencia de acciones antes de confirmar, conservación del texto y fallo del navegador. El portapapeles y el navegador se simulan en pruebas: no se abrieron chats reales ni se gastaron créditos.
