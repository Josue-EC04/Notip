# Notip: modo estudiante

Implementado en `feat/modo-estudiante`, separado de `main`. La rama conserva como base las correcciones de Antigravity que estaban presentes al iniciar el trabajo.

## Qué incluye

1. **Bandeja sin internet.** Cada captura se guarda primero en este equipo. La bandeja muestra pendientes, errores y notas organizadas; permite editar, eliminar o elegir un tipo manualmente. La IA reintenta al recuperar conexión, al abrir la aplicación y periódicamente mientras esté abierta. También puedes pulsar «Reintentar». No requiere iniciar sesión para guardar.
2. **Modo clase.** Inicia una clase, captura apuntes y termina la sesión. Cuando sus capturas estén organizadas, la IA prepara un resumen, conceptos, dudas y preguntas de repaso. Las tareas quedan en el tablero. La clase activa sobrevive al cierre de la aplicación.
3. **Tengo 15 minutos.** Recomienda una tarea según urgencia, prioridad y duración. Incluye un primer paso editable y bloques de 5, 15, 30 o 60 minutos. El temporizador continúa al reabrir la ventana. Terminar un bloque no marca automáticamente la tarea como hecha. Esta función funciona sin IA y sin internet.
4. **Notas relacionadas.** Sugiere hasta dos notas con términos relevantes en común y explica la coincidencia. Puedes leer una vista previa y guardar la conexión. La búsqueda es local; no consume llamadas a la IA.

Las funciones están en el chat normal de la mascota. Debajo del encabezado aparecen «Por organizar», «Iniciar clase» y «Tengo 15 minutos». Las herramientas se abren dentro del mismo panel y mantienen el cuadro habitual de escritura. «Volver al chat» recupera la conversación. El guardado offline es automático: no hay una ventana offline separada. Los accesos del menú de la mascota y del tablero también abren este chat; `Ctrl+Shift+E` muestra sus pendientes.

## Probar la rama sin tocar tus notas normales

Desde `C:\Users\HOME\Desktop\Notip\scratch\modo-estudiante`:

```powershell
npm.cmd run preview
```

La vista previa usa su propio perfil en `scratch/preview-data`, incluidas sus notas y tareas. Cierra otra instancia de Notip antes de iniciarla. Selecciona «Continuar en este equipo · sin internet». Para clasificar necesitas una clave de Anthropic configurada en ajustes o en tu `.env` local. Las claves no se incluyen en el instalador.

## Demostración para la minihackatón

1. Pausa la IA o desconecta internet y guarda dos apuntes. Cierra y abre la aplicación para mostrar que siguen guardados.
2. Inicia «Redes», escribe un concepto, una duda y una entrega; termina la clase.
3. Reconecta internet y activa la IA. Muestra cómo aparecen las notas, la tarea y el resumen de clase.
4. Abre «Tengo 15 minutos», ajusta el primer paso de la tarea y comienza un bloque.
5. Captura otro apunte que comparta dos términos específicos con una nota anterior y guarda su conexión sugerida.

## Almacenamiento y límites de esta versión

- La bandeja y las clases se guardan en `data/study.json`; las capturas tienen copia Markdown en el vault. Las tareas usan la base SQLite existente. Se conserva el texto original.
- La cola evita aplicar respuestas de IA a capturas editadas o eliminadas mientras se procesaban y reutiliza la identidad de la tarea al reintentar.
- El procesamiento requiere que Notip esté abierto, internet y una clave válida. Las clases y la bandeja son locales; no se sincronizan entre los equipos de tus amigos.
- La recomendación y las conexiones usan reglas locales. El resumen usa IA y conviene revisarlo antes de estudiar; no sustituye los apuntes.
- Las pruebas automáticas simulan las respuestas de IA: no verifican el servicio de pago ni consumen créditos. La demostración con tu clave e internet sigue siendo una comprobación manual.

## Verificación

```powershell
npm.cmd test
npm.cmd run test:ui
npm.cmd run pack
```

Las pruebas cubren persistencia tras reinicio, reintentos sin duplicados, cambios durante una petición, clases, recomendaciones, relaciones y SQLite. Las pruebas de interfaz usan Electron, preload e IPC reales con datos temporales: comprueban captura, edición, resumen, enfoque, conexión y arranque desde `main.js`. Las capturas de pantalla de estas pruebas quedan en `tests/artifacts` y no se versionan.
