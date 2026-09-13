# Chat más sencillo

Rama: `feat/chat-claridad`. El acceso directo habitual abre esta carpeta de trabajo. Cierra Notip completamente y vuelve a abrirlo para cargar los cambios.

## Cambios de interfaz

- Encabezado con «Mis notas», «Tareas» y «Más». Mis notas abre la pizarra existente, que incluye también las notas antiguas. Más conserva conexiones, pizarra, carpeta, ajustes y ayuda. Cerrar sesión está dentro de ajustes.
- Cuadro de escritura pequeño que crece al escribir; contador visible solo cerca del límite. Selector «Tipo: Automático» con las opciones manuales originales.
- Una confirmación por captura. Distingue IA pausada, falta de conexión, falta de configuración, error y organización en curso. Cuando termina, la misma tarjeta muestra el resultado y sus accesos, incluido Calendar cuando corresponde.
- Indicador persistente de clase con nombre, número de apuntes y botón Terminar. El resumen aparece antes del formulario para empezar otra clase; conceptos, dudas y preguntas se despliegan cuando se necesitan.
- En enfoque se muestra primero la tarea, el primer paso y el botón de iniciar. Los ajustes de duración se despliegan debajo. Un temporizador compacto permite regresar al bloque desde el chat.
- Bienvenida breve una sola vez, dos ejemplos y explicación de dónde encontrar notas y tareas. Puede reabrirse desde Más → Cómo usar Notip.

## Cambio de comportamiento aprobado

Cada envío crea una captura nueva por defecto. Para modificar una nota, pulsa «Continuar esta nota» en su resultado: el cuadro indicará «Editando: …» y el botón dirá «Guardar cambios». Después del envío vuelve a crear capturas independientes. Los contextos automáticos guardados por versiones anteriores no activan la edición. Durante una clase no se modifica una nota anterior mediante este acceso.

Se conserva la clasificación, el guardado offline, las clases, las recomendaciones, el temporizador, las relaciones y Calendar. No se cambió el motor de IA ni la base de datos.

## Validación y continuidad

Pasaron las 22 pruebas de lógica y autenticación. Las pruebas de Electron verifican captura, estados, edición, clases, resumen, enfoque, relaciones, menú, bienvenida, ausencia de superposición en el encabezado y creación de notas independientes frente a continuación explícita. La interfaz se revisó mediante capturas en ventanas de 440 y 490 píxeles de ancho. Las respuestas de IA se simulan; no se consumieron créditos.

Los archivos principales son `src/capture/capture.html`, `capture.js`, `chatTools.js`, `chatExperience.js` y `chatExperience.css`. La presentación reutiliza la tipografía y los colores originales.

Había cambios locales de Antigravity en board, brain, canvas y `src/utils/fuzzySearch.js` antes de comenzar. Se dejaron intactos y no se incluyen en el commit de esta mejora. Continúan en la carpeta de trabajo; no sobrescribirlos al cambiar de rama o integrar cambios.
