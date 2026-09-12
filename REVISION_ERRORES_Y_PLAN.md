# Revisión de errores y plan de solución de Notip

Fecha: 12 de septiembre de 2026.

## Alcance y resultados

Se revisaron el proceso principal de Electron, el puente IPC, los módulos de notas, SQLite, IA, autenticación, sincronización, Calendar, captura, tablero, cerebro, pizarra y detección de pantalla completa; también el esquema SQL, las funciones de Supabase, los HTML y la configuración del proyecto.

**Resultado: 48 hallazgos**, separados entre fallos demostrables en el código y riesgos cuyo impacto depende de la configuración o de condiciones concretas. Las prioridades más urgentes son proteger las credenciales, separar los datos por cuenta, impedir confirmaciones falsas de guardado y corregir la sincronización.

Esta revisión no garantiza que sean todos los errores posibles. No se ejecutó la interfaz de Electron ni se comprobó el despliegue remoto. Por tanto, las observaciones de interfaz describen consecuencias del código, no una inspección visual en vivo. No se modificó el código de la aplicación ni se accedió a las notas personales para hacer pruebas. No se realizaron llamadas de pago a Claude ni escrituras en Supabase o Calendar.

### Evidencia y comprobaciones realizadas

- Todos los archivos JavaScript versionados pasaron `node --check`. Eso comprueba sintaxis, no funcionamiento.
- Se ejecutaron diez pruebas locales con Node v24.12.0: todas reprodujeron los defectos que buscaban comprobar. Esto significa que los errores existen, no que la aplicación haya superado diez pruebas de corrección.
- Las pruebas usaron funciones reales, adaptadores simulados y bases temporales dentro de `scratch`, sin utilizar la base del usuario. El script queda en `scratch/audit-checks.cjs`, carpeta ya ignorada por Git.
- Se comprobó el contrato de `exchangeCodeForSession` en el código del SDK instalado.
- Se contrastaron el final exclusivo de eventos de Google y la diferencia entre permisos de fila y columna de Supabase con documentación oficial, citada en los hallazgos correspondientes.
- No hay scripts de pruebas o lint declarados en `package.json`. No se compiló un instalador nuevo, no se ejecutó Deno/Postgres y no se hizo una auditoría de vulnerabilidades de dependencias.

**Leyenda:** “Reproducido” indica una prueba local; “Código” indica una contradicción verificable en las rutas revisadas; “Condicional” indica que el problema necesita un entorno, entrada o configuración concreta. Las ubicaciones por función permiten localizar el hallazgo aunque cambien las líneas.

## Prioridad crítica: credenciales, cuentas y permisos

### 01. Clave de Anthropic incluida directamente en el código

- **Ubicación:** `main.js:1260`, manejador `save-note`; `package.json`, `build.extraResources`.
- **Evidencia:** Código. Existe una clave con formato de credencial dentro de `defaultApiKey`; además, el empaquetado copia `.env` a los recursos distribuibles. No se comprobó si la clave sigue siendo válida y no se reproduce aquí su valor.
- **Por qué es un error:** Cualquier persona con el repositorio o el instalador puede extraer una clave incorporada al cliente. Si está activa, puede consumir la cuenta del propietario. Copiar `.env` también expone cualquier secreto que contenga.
- **Plan:** Retirar la clave del código y del empaquetado, reemplazar la configuración distribuida por una lista explícita de valores públicos y trasladar la clave del servicio al servidor. Revocar y reemplazar la credencial expuesta; revisar el historial y los artefactos distribuidos sin volver a publicar su valor.
- **Validación:** Inspeccionar el paquete final y buscar secretos en los archivos versionados; comprobar que la IA del servicio funciona sin claves privadas dentro del instalador.

### 02. Los datos locales se comparten entre todas las cuentas

- **Ubicación:** `main.js:107–110`, `performLogout`, `onLoginSuccess`; `src/sync/syncManager.js`, `syncAllLocalToCloud`.
- **Evidencia:** Código. Vault, SQLite y preferencias no dependen del ID del usuario. Cerrar sesión conserva los datos y el siguiente inicio los sube con el usuario actual.
- **Por qué es un error:** Si A cierra sesión y B entra en la misma instalación, B ve los datos de A y puede recibirlos también en su nube. La clave personalizada y el chat guardado tampoco están separados por cuenta.
- **Plan:** Crear almacenamiento por `user.id`, asociar cada registro a su propietario y cancelar operaciones pendientes al cambiar de cuenta. Migrar los datos existentes a un propietario identificado, sin asignarlos automáticamente al siguiente usuario.
- **Validación:** Usar dos cuentas de prueba y confirmar que ninguna puede ver, editar ni sincronizar los datos de la otra, incluso si cambia la sesión durante una petición.

### 03. La política de créditos permite modificar campos privilegiados

- **Ubicación:** `supabase/schema.sql`, política `creditos_update_own`.
- **Evidencia:** Condicional respecto al servidor: la política SQL permite actualizar la fila propia y no restringe columnas. No se inspeccionaron los permisos reales del despliegue.
- **Por qué es un error:** Si el rol autenticado tiene permiso UPDATE, el usuario puede cambiar `saldo` y `es_admin` de su propia fila. RLS limita filas; no sustituye restricciones de columnas. Véase [seguridad por columnas de Supabase](https://supabase.com/docs/guides/database/postgres/column-level-security).
- **Plan:** Revocar la actualización de créditos al cliente y dejar la modificación a operaciones de servidor controladas. Definir explícitamente GRANT/REVOKE para no depender de los valores predeterminados del proyecto.
- **Validación:** Con un usuario normal, intentar cambiar saldo y rol en una base de prueba: ambas operaciones deben rechazarse; el servidor debe poder descontar créditos.

## Prioridad alta: integridad y sincronización

### 04. Editar o completar una tarea crea otra fila en la nube

- **Ubicación:** `main.js`, `toggle-task` y `update-task`; `src/sync/syncManager.js`, `uploadTask`.
- **Evidencia:** Código. Ambos manejadores llaman a `uploadTask`, que ejecuta INSERT y genera otro UUID. El UUID devuelto no se guarda en SQLite.
- **Por qué es un error:** Una misma tarea acaba representada por varias filas con estados y textos distintos.
- **Plan:** Asignar una identidad estable, persistir la correspondencia local/remota y utilizar UPDATE o UPSERT por esa identidad.
- **Validación:** Crear una tarea y editarla diez veces; debe seguir existiendo una sola fila remota.

### 05. La sincronización identifica tareas por el título

- **Ubicación:** `src/sync/syncManager.js`, `syncAllLocalToCloud`.
- **Evidencia:** Código: consulta `.eq('titulo', t.titulo).limit(1)`.
- **Por qué es un error:** Dos tareas legítimas llamadas “Estudiar” se fusionan. Renombrar una tarea puede crear otra fila y dejar la antigua.
- **Plan:** Sustituir el título por un ID inmutable y resolver duplicados existentes mediante una migración revisable.
- **Validación:** Sincronizar dos tareas con igual título y distinta fecha; renombrar una y verificar que siguen siendo dos.

### 06. No existe la descarga y fusión anunciada por la sincronización

- **Ubicación:** `src/sync/syncManager.js`, `downloadTasks`, `downloadNotes`, `syncAllLocalToCloud`; arranque en `main.js`.
- **Evidencia:** Código. Las funciones de descarga están exportadas, pero la aplicación no las llama para poblar SQLite o el vault.
- **Por qué es un error:** Iniciar sesión en otro equipo no recupera las notas ni las tareas. La subida tampoco compara versiones; puede sobreescribir cambios más recientes realizados fuera del equipo.
- **Plan:** Implementar descarga, fusión por ID y versiones de modificación; detectar conflictos en vez de resolverlos por título o fecha de creación.
- **Validación:** Crear, modificar y recuperar registros desde dos instalaciones con cambios concurrentes y periodos sin conexión.

### 07. Eliminar datos localmente no los elimina de Supabase

- **Ubicación:** `main.js`, `delete-task`, `delete-note`; `src/sync/syncManager.js`, `deleteTaskInCloud`.
- **Evidencia:** Código. Los manejadores borran solo en local; la función de borrado remoto de tareas no se utiliza y no existe un flujo equivalente para notas.
- **Por qué es un error:** La nube conserva datos que el usuario considera eliminados. Cuando se implemente la descarga, podrían reaparecer.
- **Plan:** Registrar eliminaciones pendientes con identidad estable y sincronizarlas; definir retención y recuperación antes de borrar definitivamente.
- **Validación:** Borrar sin conexión, reconectar y comprobar la propagación al otro equipo.

### 08. Varias modificaciones no se suben al producirse

- **Ubicación:** `main.js`, `save-note`, `update-task-state`, `update-note-content`, `save-note-connections`, `auto-connect-brain`.
- **Evidencia:** Código. Las tareas creadas por chat no llaman a la subida de tareas. Los movimientos Kanban y las ediciones/conexiones de notas tampoco se sincronizan allí.
- **Por qué es un error:** La nube queda desactualizada hasta otro arranque o login, y algunos cambios fallan después por otros defectos de sincronización.
- **Plan:** Centralizar las mutaciones y registrar una operación de sincronización por cada cambio confirmado localmente.
- **Validación:** Comprobar creación desde chat, arrastre Kanban, edición de nota y conexión manual sin reiniciar.

### 09. Los fallos de red no quedan pendientes de reintento

- **Ubicación:** `src/sync/syncManager.js`, funciones de subida y `syncAllLocalToCloud`.
- **Evidencia:** Código. Se registran advertencias y se devuelve `null`; no hay cola persistente. En la rama UPDATE de la sincronización global se incrementa el contador sin comprobar `error`.
- **Por qué es un error:** Cambios sin subir se presentan como sincronizados o se quedan pendientes indefinidamente mientras la aplicación sigue abierta.
- **Plan:** Implementar cola persistente, reintento gradual, resultados comprobados y estado visible de sincronización.
- **Validación:** Simular desconexión y errores remotos; el contador solo debe incluir operaciones confirmadas.

### 10. El estado de progreso no coincide entre SQLite y Supabase

- **Ubicación:** `src/board/board.js`, `renderBoard` y `moveTaskDirect`; `supabase/schema.sql`, CHECK de `tareas.estado`.
- **Evidencia:** Código. El tablero usa `progreso`; Supabase admite `en_progreso`.
- **Por qué es un error:** Subir una tarea en progreso viola la restricción remota; una tarea con `en_progreso` se dibujaría como pendiente en el tablero actual.
- **Plan:** Elegir un único conjunto de estados y migrar los valores existentes en ambos almacenes.
- **Validación:** Recorrer pendiente → progreso → hecho → pendiente y comprobar el mismo estado en interfaz y nube.

### 11. La sincronización global pierde metadatos de notas

- **Ubicación:** `src/notes/notesManager.js`, `getAllNotes`; `src/sync/syncManager.js`, `uploadNote`.
- **Evidencia:** Código. `getAllNotes` devuelve `creado` y `conexiones_sugeridas`; `uploadNote` espera `fecha_creacion` y `conexiones_ia`.
- **Por qué es un error:** Al iniciar sesión se vuelve a asignar la fecha actual y se envía un arreglo vacío para las conexiones de IA, incluso si otra ruta las había subido correctamente. La prioridad tampoco se guarda en el frontmatter de `saveClassifiedNote`.
- **Plan:** Crear un formato único de nota y conversores explícitos para Markdown y Supabase; preservar todos los metadatos al editar y sincronizar.
- **Validación:** Una nota con fecha, prioridad y conexiones debe conservar esos valores tras dos reinicios y dos sincronizaciones.

### 12. El guardado confirma éxito aunque falle la operación final

- **Ubicación:** `main.js:1344–1378`, `save-note`.
- **Evidencia:** Reproducido con un error de escritura simulado: devuelve `success: true` y `filePath: null`.
- **Por qué es un error:** El usuario recibe una confirmación aunque no exista la nota clasificada. Además, se ignora el resultado de `updateExistingNote`, que puede devolver `null`.
- **Plan:** Devolver estados separados de guardado y clasificación; propagar los fallos y confirmar éxito solo después de verificar la persistencia. Conservar el texto recuperable.
- **Validación:** Simular disco lleno, ruta inexistente y nota eliminada antes de una modificación; no debe aparecer una confirmación falsa.

### 13. SQLite oculta errores al escribir el archivo

- **Ubicación:** `src/db/database.js`, `persist`, `addTask`, `updateTask`.
- **Evidencia:** Reproducido: al fallar `writeFileSync`, `addTask` devuelve un ID y la tarea existe solo en memoria.
- **Por qué es un error:** La interfaz trata la tarea como guardada, pero se puede perder al salir.
- **Plan:** Propagar el error de persistencia, controlar la transacción en memoria y mostrar un estado de recuperación cuando no pueda completarse.
- **Validación:** Tras simular el error, reiniciar contra la copia temporal y verificar que no se prometió persistencia inexistente.

### 14. La persistencia no es atómica y la recuperación puede destruir la copia dañada

- **Ubicación:** `src/db/database.js`, `persist` e `initDatabase`; escrituras de `src/notes/notesManager.js`.
- **Evidencia:** Condicional. Se escribe directamente sobre el archivo definitivo. Si falla la lectura inicial de la base, se crea otra y después se persiste sobre la misma ruta.
- **Por qué es un error:** Una interrupción puede dejar archivos truncados. Sustituir inmediatamente una base ilegible elimina evidencia y posibilidades de recuperación.
- **Plan:** Escribir a un temporal y reemplazar de forma atómica, mantener una copia anterior y poner archivos dañados en cuarentena antes de ofrecer recuperación.
- **Validación:** Interrumpir escrituras en un entorno temporal y cargar una base corrupta; conservar siempre el original recuperable.

### 15. Las tareas apuntan a un Markdown que se elimina

- **Ubicación:** `main.js:1294–1307`; `src/notes/notesManager.js`, `saveClassifiedNote`.
- **Evidencia:** Código. `nota_origen` recibe el nombre del archivo crudo, pero la clasificación crea otro archivo y borra el crudo.
- **Por qué es un error:** La relación tarea-nota queda rota desde su creación. Además, editar o borrar una representación no actualiza la otra.
- **Plan:** Guardar primero la identidad definitiva de la nota y enlazarla a la tarea; definir qué campos y eliminaciones deben propagarse entre ambas representaciones.
- **Validación:** Toda `nota_origen` debe resolver a una nota existente; editarla desde tablero y pizarra debe mantener consistencia según el comportamiento definido.

### 16. Una continuación no tiene respaldo previo a la clasificación

- **Ubicación:** `main.js:1244–1252`; `src/capture/capture.js`, `handleSave` y guardado de borrador.
- **Evidencia:** Código. Si hay contexto, no se guarda texto crudo. La captura limpia el input y el borrador antes de recibir la respuesta; los borradores de continuación no se persisten como borradores.
- **Por qué es un error:** Un cierre, fallo o reinicio durante una continuación puede hacer perder el texto. El historial temporal no sustituye una operación durable de guardado.
- **Plan:** Persistir cada envío y borrador con ID de operación antes de llamar a IA; conservar los fallidos y permitir reintentar sin duplicar.
- **Validación:** Cerrar o interrumpir la operación durante una continuación y recuperar el texto exacto.

## Chat, clasificación y validación de datos

### 17. Falta el indicador de modificación en la respuesta del IPC

- **Ubicación:** `main.js`, retorno de `save-note`; `src/capture/capture.js`, `handleSave`.
- **Evidencia:** Reproducido: la respuesta no contiene `es_modificacion_de_anterior`.
- **Por qué es un error:** La captura consulta ese campo y trata toda continuación como tema nuevo, muestra un aviso equivocado y vacía el historial aunque se haya editado la misma nota.
- **Plan:** Devolver el indicador real y formalizar un contrato único de respuesta entre proceso principal e interfaz.
- **Validación:** Editar una nota desde el chat: debe conservar historial, mostrar “Nota actualizada” y mantener su identidad.

### 18. Una nota nueva puede heredar el ID de la tarea anterior

- **Ubicación:** `main.js:1376`, `taskId: taskObj?.id ?? contextoPrevio?.taskId`.
- **Evidencia:** Código.
- **Por qué es un error:** Si tras una tarea se crea una idea independiente, `taskObj` queda vacío y se devuelve el ID anterior. Una modificación posterior de la idea puede terminar actualizando esa tarea ajena.
- **Plan:** Reutilizar IDs previos exclusivamente cuando `esModificacion` sea verdadero; devolver `null` para una nueva nota sin tarea.
- **Validación:** Crear tarea A, idea B en el mismo chat y modificar B; A debe permanecer intacta.

### 19. El clasificador local toma el primer número como hora

- **Ubicación:** `src/ai/classifier.js`, `localFallbackClassifier`, `horaRegex`.
- **Evidencia:** Reproducido. “Resolver 3 ejercicios mañana a las 6 pm” produce `03:00`. “Reunion a las 18:99” produce `18:99`.
- **Por qué es un error:** Se busca el primer número y después se comprueba si hay palabras de hora en cualquier lugar de la frase; tampoco se valida el rango de minutos.
- **Plan:** Exigir que el indicador de hora pertenezca a la coincidencia y validar rangos de horas/minutos y AM/PM.
- **Validación:** Probar cantidades, fechas numéricas, “12 am”, “12 pm”, “18:99” y varias cifras en la misma frase.

### 20. Un tema nuevo hereda fecha, hora y curso anteriores en modo local

- **Ubicación:** `src/ai/classifier.js`, `localFallbackClassifier`.
- **Evidencia:** Reproducido. “Comprar cafe” después de una reunión conserva su fecha, hora y curso, aunque `es_modificacion_de_anterior` sea falso.
- **Por qué es un error:** Los campos se inicializan desde el contexto antes de decidir si existe una modificación.
- **Plan:** Resolver primero la relación con el contexto y construir un registro limpio para cada tema independiente.
- **Validación:** Alternar asuntos sin relación; ninguna fecha, categoría o prioridad debe propagarse sin intención.

### 21. Modificar una nota en modo local sustituye el contenido por la orden

- **Ubicación:** `src/ai/classifier.js`, retorno de `localFallbackClassifier`; `updateExistingNote`.
- **Evidencia:** Reproducido. “cambia la hora a las 4 pm” devuelve esa orden como contenido completo y un título derivado de ella.
- **Por qué es un error:** Se pierden los detalles originales. Además, casi cualquier frase no reconocida como tema nuevo se interpreta como modificación.
- **Plan:** Aplicar cambios parciales a los campos identificados, preservar el contenido y tratar frases ambiguas sin sobrescribir silenciosamente la nota.
- **Validación:** Cambiar solo una hora y comprobar que se mantienen título, participantes, descripción y demás datos.

### 22. El tipo elegido en los chips se ignora cuando hay contexto

- **Ubicación:** `src/ai/classifier.js`, `clasificarNota`; `supabase/functions/classify/index.ts`, construcción del prompt.
- **Evidencia:** Código. `forcedType` se procesa en un `else if` posterior a `contextoPrevio`.
- **Por qué es un error:** La interfaz muestra una categoría fijada, pero la solicitud enviada al modelo no incluye esa instrucción si el chat está activo.
- **Plan:** Aplicar la categoría elegida independientemente de la existencia de contexto y validar el resultado.
- **Validación:** Elegir IDEA después de una tarea activa y comprobar el tipo guardado.

### 23. La respuesta de IA no se valida completamente

- **Ubicación:** `src/ai/classifier.js`, parseo de JSON; `supabase/functions/classify/index.ts`; `src/db/database.js`, CRUD.
- **Evidencia:** Código; se reprodujo que SQLite acepta un estado desconocido.
- **Por qué es un error:** Faltan contratos para títulos, fechas reales, arreglos de strings y booleanos. Por ejemplo, `Boolean('false')` resulta verdadero, y un título numérico puede romper `.slice()` o `.trim()`. Un estado desconocido se guarda sin rechazo.
- **Plan:** Validar los datos en el límite IPC y al recibir IA; distinguir campo ausente de `null`, limitar tamaños y normalizar tipos. Añadir restricciones compatibles en SQLite.
- **Validación:** Usar respuestas JSON válidas pero semánticamente incorrectas y verificar rechazo o recuperación sin perder el texto.

### 24. El modo local se presenta como clasificación con IA

- **Ubicación:** `src/ai/classifier.js`, retorno del fallback; `src/notes/notesManager.js`, `clasificado_con_ia`; `main.js`, respuesta de guardado.
- **Evidencia:** Código. El fallback devuelve `error_clasificacion: false`, lo que se convierte en `clasificado_con_ia: true`; `usando_fallback_local` no llega a la interfaz.
- **Por qué es un error:** Los metadatos y mensajes atribuyen a Claude resultados de reglas locales, dificultando detectar errores de interpretación y conexión.
- **Plan:** Usar un campo explícito de origen (`local` o `ia`) y diferenciar guardado exitoso de disponibilidad de IA.
- **Validación:** Simular un fallo de Claude y comprobar que nota e interfaz identifican correctamente el procesamiento local.

### 25. Los créditos no controlan la clasificación utilizada por la aplicación

- **Ubicación:** `main.js`, `save-note`; `src/sync/syncManager.js`, `classifyViaEdgeFunction`.
- **Evidencia:** Código. La captura llama directamente a Anthropic; la función que verifica créditos no se utiliza en ese flujo.
- **Por qué es un error:** El saldo mostrado no determina el uso del servicio y no se descuenta por estas llamadas. Con la clave compartida, el consumo recae directamente en su propietario.
- **Plan:** Enviar la IA del servicio a la Edge Function y reservar el acceso directo para una clave personal explícita, con origen y consumo claramente diferenciados.
- **Validación:** Comprobar usuario sin saldo, con saldo, administrador y usuario con clave personal.

### 26. El descuento de créditos tiene una condición de carrera

- **Ubicación:** `supabase/functions/classify/index.ts`, pasos 2, 7 y 8.
- **Evidencia:** Código; impacto remoto no probado. Se lee el saldo y después se escribe `saldo - 1` sin operación atómica; se ignoran errores de actualización. `total_gastado` se envía como `undefined` y no hay trigger que lo incremente en el esquema entregado.
- **Por qué es un error:** Dos llamadas simultáneas pueden consumir dos clasificaciones y descontar una sola unidad; también puede informarse un saldo que nunca se guardó.
- **Plan:** Reservar créditos con una operación SQL atómica, registrar consumo con ID de petición y compensar fallos según la política definida.
- **Validación:** Con saldo uno, enviar peticiones concurrentes: solo una debe obtener autorización de consumo; el historial debe coincidir.

### 27. Distintas funciones eligen claves de API distintas

- **Ubicación:** `main.js`, `get-settings`, `test-api-key`, `save-note`, `auto-connect-brain`.
- **Evidencia:** Código. El autoconectado solo mira `.env`; el chat permite clave personalizada y fallback incrustado; la prueba no utiliza ese mismo fallback.
- **Por qué es un error:** Puede funcionar el chat, fallar “Probar conexión” o fallar el autoconectado con una clave personal válida. El estado mostrado no describe la configuración real.
- **Plan:** Centralizar la selección de proveedor y credencial, después de retirar la clave incrustada.
- **Validación:** Probar todas las funciones con solo clave personalizada, solo configuración de servicio y sin configuración.

## Autenticación e integración con Calendar

### 28. El canje PKCE recibe la URL completa en lugar del código

- **Ubicación:** `main.js:210`, `handleOAuthCallback`; SDK instalado, `GoTrueClient.ts`, `exchangeCodeForSession`.
- **Evidencia:** Código. El SDK utiliza el argumento recibido como `auth_code`.
- **Por qué es un error:** La rama `?code=...` envía `notip://...` como código y no puede realizar correctamente el canje esperado. Esto afecta esa rama, no demuestra que todo el login implícito falle.
- **Plan:** Parsear la URL y extraer `searchParams.get('code')`; configurar PKCE de forma coherente con el verificador guardado.
- **Validación:** Simular callback válido, código ausente y error de autorización; comprobar el argumento exacto enviado al SDK.

### 29. Los callbacks OAuth se registran con tokens y se aceptan sin validar su destino

- **Ubicación:** `main.js:64`, `158`, `1580`; selección de argumentos y `handleOAuthCallback`.
- **Evidencia:** Código. Se imprimen argumentos y URL completos; se acepta cualquier cadena que incluya `access_token=` o `code=` y no se comprueba estrictamente host/ruta ni una operación de login pendiente.
- **Por qué es un error:** Los logs pueden contener tokens. Un callback inesperado puede cambiar una sesión o activar repetidamente la creación de ventanas; la explotabilidad concreta depende de cómo se entregue el enlace.
- **Plan:** Eliminar valores sensibles de logs, validar esquema/destino, vincular callback y login pendiente mediante PKCE y hacer el procesamiento idempotente.
- **Validación:** Rechazar URLs ajenas y callbacks repetidos; revisar que los logs no contengan credenciales.

### 30. Hay dos copias de sesión que pueden desactualizarse

- **Ubicación:** `src/supabase/client.js`, adaptador storage, `getStoredSession`, `restoreOrRefreshSession`.
- **Evidencia:** Código. El SDK persiste con su clave de almacenamiento; la aplicación también mantiene `sb-session`, sin suscribirse a cambios de autenticación.
- **Por qué es un error:** La renovación automática puede actualizar la sesión del SDK dejando un refresh token antiguo en `sb-session`. Al reiniciar se intenta restaurar esa copia y se puede forzar un login innecesario o mostrar un usuario desactualizado.
- **Plan:** Mantener una fuente de sesión coherente y reaccionar a renovaciones, cambios de usuario y cierre; distinguir un error transitorio de una revocación.
- **Validación:** Renovar tokens durante una sesión larga, reiniciar y confirmar que se conserva la sesión correcta.

### 31. Cancelar el login puede dejar el botón bloqueado

- **Ubicación:** `src/auth/auth.js`, clic en `btnGoogleLogin`; `main.js`, arranque con `startupUrl`.
- **Evidencia:** Código. El botón permanece deshabilitado tras iniciar OAuth si el navegador se cierra sin callback. Con un deep link inválido al arrancar, se retorna sin crear una ventana de login de recuperación.
- **Por qué es un error:** El usuario queda esperando o con la aplicación sin ventana útil y debe reiniciarla.
- **Plan:** Añadir cancelación/reintento de login y garantizar una ventana de recuperación cuando falle el callback de arranque.
- **Validación:** Cerrar el navegador antes de aceptar y arrancar con un callback inválido; debe ser posible reintentar desde la aplicación.

### 32. Los eventos de día completo tienen inicio y fin iguales

- **Ubicación:** `main.js:1152–1158`; `supabase/functions/add-calendar-event/index.ts`, rama sin hora.
- **Evidencia:** Código. Ambos asignan la misma fecha al inicio y al final.
- **Por qué es un error:** El final de un evento es exclusivo; para un día completo debe ser el día siguiente. La solicitud actual no expresa un intervalo válido de un día. Véase [recurso Events de Google Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events).
- **Plan:** Calcular el día siguiente en calendario local, sin conversiones innecesarias a UTC.
- **Validación:** Eventos de día completo en fin de mes, fin de año y año bisiesto.

### 33. Calendar inventa una fecha si la tarea no tiene vencimiento

- **Ubicación:** `src/capture/capture.js`, botón Calendar; `main.js:1155–1158`.
- **Evidencia:** Código. El botón aparece para cualquier tarea, incluso “Fecha pendiente”; el backend la convierte en un evento de hoy. Si solo hay hora, también se pierde esa hora.
- **Por qué es un error:** Se agenda algo que el usuario no fechó; además, “hoy” se calcula con fecha UTC, que puede ser mañana en Lima por la noche.
- **Plan:** Solicitar una fecha al agregar al calendario o requerir que esté definida; conservar una hora introducida explícitamente.
- **Validación:** Una tarea sin fecha no debe crear silenciosamente un evento para hoy.

### 34. El cálculo de horas de Calendar tiene errores en fechas límite

- **Ubicación:** `main.js:1128–1148`; `supabase/functions/add-calendar-event/index.ts`, `addHour`.
- **Evidencia:** Código, impacto según zona y fecha. El cliente usa el offset de hoy para un evento futuro; la Edge Function suma una hora con módulo 24 sin cambiar de día y fija Lima.
- **Por qué es un error:** Una zona con horario estacional puede producir una hora desplazada. En la Edge Function, un evento a las 23:30 termina a las 00:30 del mismo día, antes del comienzo. Esta función remota no es la ruta usada actualmente por el IPC de escritorio.
- **Plan:** Compartir reglas de construcción de eventos y calcular inicio/fin con zona y fecha del evento, incluyendo cambio de día.
- **Validación:** Evento 23:30–00:30 y eventos futuros a ambos lados de un cambio de horario estacional.

### 35. El token de Google no se renueva

- **Ubicación:** `main.js`, `currentProviderToken`, OAuth y `add-calendar-event`.
- **Evidencia:** Código. Solo se entrega `access_token` a Google; no hay renovación del token del proveedor ni control de expiración.
- **Por qué es un error:** Calendar deja de funcionar cuando el token caduca aunque la sesión de Supabase siga activa. El cliente devuelve un error genérico sin un flujo claro de reconexión.
- **Plan:** Implementar reconexión explícita con Google o renovación segura del token del proveedor; no confundir esa renovación con la de Supabase.
- **Validación:** Simular token expirado y recuperar Calendar sin perder datos locales ni cambiar accidentalmente de cuenta.

### 36. No se conserva la identidad del evento creado y el botón de apertura queda inutilizado

- **Ubicación:** `src/capture/capture.js`, listener de `btnCal`; `main.js`, retorno de Calendar; SQLite.
- **Evidencia:** Código. El botón se deshabilita y no se habilita tras el éxito, aunque se le asigne un `onclick` para abrir el enlace. El ID del evento no se persiste en la tarea ni en el historial.
- **Por qué es un error:** No se puede abrir el enlace con ese botón; restaurar el chat permite volver a crear el evento. Editar la tarea tampoco actualiza el evento previo. Simplemente habilitar el botón dejaría también activo el listener que vuelve a insertar.
- **Plan:** Separar las acciones de crear y abrir, persistir `calendar_event_id` y usarlo para evitar duplicados y actualizar cuando corresponda.
- **Validación:** Crear, abrir, restaurar chat y editar tarea: debe existir un solo evento y abrirse correctamente.

## Pizarra, tablero y cerebro

### 37. La nueva tarjeta utiliza el título como nombre de archivo

- **Ubicación:** `src/canvas/canvas.js`, `createNewNoteAt`.
- **Evidencia:** Reproducido. Con título “Mi idea” y ruta `real.md`, se guarda `layout['Mi idea']`; no se encuentra la nota y no se abre el editor.
- **Por qué es un error:** El título se prioriza sobre el basename real, pero toda la pizarra identifica tarjetas por `filename`.
- **Plan:** Devolver una identidad de nota explícita desde IPC y usarla para posición y edición. Crear la tarjeta vacía localmente sin esperar una clasificación de IA de texto de relleno.
- **Validación:** Doble clic en la pizarra: la nota debe aparecer en ese punto y abrir inmediatamente su editor.

### 38. La recarga de la pizarra puede perder cambios de posición pendientes

- **Ubicación:** `src/canvas/canvas.js`, `saveLayoutDebounced`, `loadData`, `createNewNoteAt` y eventos de actualización.
- **Evidencia:** Código. Se programa guardar en 350 ms, pero `loadData` sustituye la variable `layout` con la copia de disco antes; el temporizador lee esa variable al ejecutarse.
- **Por qué es un error:** Un movimiento, color o posición nueva puede desaparecer si llega una recarga antes del guardado.
- **Plan:** Guardar una instantánea versionada, fusionar cambios pendientes al recargar y esperar la persistencia donde la siguiente operación dependa de ella.
- **Validación:** Arrastrar y editar/recargar en menos de 350 ms; la posición debe conservarse.

### 39. Las tarjetas nuevas se colocan encima de las existentes

- **Ubicación:** `src/canvas/canvas.js`, `assignPositionsToNewNotes`.
- **Evidencia:** Reproducido. Con una tarjeta en `(120,100)`, la siguiente sin posición también recibe `(120,100)`.
- **Por qué es un error:** Los contadores se reinician y solo avanzan para notas nuevas, sin considerar espacios ocupados.
- **Plan:** Buscar posiciones libres o conservar el punto explícito de inserción; usar límites de tarjetas para evitar solapamientos iniciales.
- **Validación:** Añadir notas en cargas sucesivas sobre una pizarra ya organizada.

### 40. “Nueva tarea” entrega un evento DOM como estado inicial

- **Ubicación:** `src/board/board.js`, `setupEvents`: `addEventListener('click', openAddModal)`; `openAddModal(defaultState)`.
- **Evidencia:** Código.
- **Por qué es un error:** El primer argumento es un MouseEvent y no `'pendiente'`; se asigna al select un valor sin opción correspondiente. El formulario aparece sin estado seleccionado y depende del fallback de SQLite al guardarse.
- **Plan:** Registrar `() => openAddModal('pendiente')` y validar que el estado exista antes de mostrar o guardar el formulario.
- **Validación:** Abrir desde el botón principal y desde cada columna; comprobar el estado seleccionado.

### 41. Varias pantallas ignoran resultados negativos y muestran éxito

- **Ubicación:** `src/brain/brain.js`, `saveModal`, `deleteNote`, `performConnection`; `src/canvas/canvas.js`, guardar/eliminar; `src/board/board.js`, acciones CRUD.
- **Evidencia:** Código. Se espera la promesa, pero no se comprueba de forma consistente `false`, `null` o `{success:false}`.
- **Por qué es un error:** Los módulos de notas suelen devolver esos valores sin lanzar excepciones; por eso el `catch` no se ejecuta y aparece un éxito falso. Crear una nota desde el cerebro tampoco transmite las etiquetas escritas en su formulario.
- **Plan:** Unificar el resultado IPC y comprobarlo antes de cerrar formularios o mostrar éxito; enviar y conservar los campos de creación introducidos manualmente.
- **Validación:** Simular rechazo de guardado/borrado y crear una nota con etiquetas manuales; conservar el formulario en caso de fallo.

### 42. Las conexiones por título se rompen al renombrar y pueden ser ambiguas

- **Ubicación:** `src/notes/notesManager.js`, `addConnectionToNote`, `updateNoteFields`; `src/brain/brain.js`, `findMatchingNode`.
- **Evidencia:** Código. Se guardan referencias `[[título]]` y se buscan por texto, incluyendo coincidencias parciales; no se actualizan las referencias al renombrar.
- **Por qué es un error:** Cambiar un título puede eliminar conexiones visibles. Títulos repetidos o similares pueden conectar con otra nota.
- **Plan:** Representar las conexiones mediante IDs estables y resolver el título solo para mostrarlas; migrar enlaces existentes con detección de ambigüedades.
- **Validación:** Renombrar notas conectadas y crear dos notas con el mismo título; deben mantenerse los destinos originales.

### 43. El cerebro conecta notas locales no relacionadas y algunos controles 3D no funcionan como indican

- **Ubicación:** `src/brain/brain.js`, `checkThematicAffinity`, `toggleFocusMode`, `render3DGraph`, `performConnection`; fallback de `src/ai/classifier.js`.
- **Evidencia:** Código. El fallback etiqueta todas las tareas con `tarea`; compartir una etiqueta basta para conectar. El enfoque solo oculta nodos en 2D; el clic 3D no llama a `handleConnectClick`, y la conexión manual depende de `nodesDS` de 2D.
- **Por qué es un error:** Dos tareas sin relación pueden recibir un enlace automático. En 3D, el enfoque anuncia éxito sin aplicar el filtrado y no hay un flujo equivalente para seleccionar los dos nodos de conexión.
- **Plan:** Excluir etiquetas estructurales de afinidad y aplicar un umbral temático; implementar los controles con un estado independiente del motor de dibujo o deshabilitar explícitamente los no soportados en 3D.
- **Validación:** Dos tareas de temas distintos no deben conectarse por ser tareas; ejecutar enfoque y conexión manual tanto en 2D como en 3D.

## Infraestructura y mantenimiento

### 44. Los IPC permiten rutas fuera del vault y URLs externas sin restricciones

- **Ubicación:** `main.js`, `delete-note`, `update-note-content`, `save-note-connections`, modificación por `contextoPrevio.filePath` y `open-external`.
- **Evidencia:** Condicional respecto a explotación. Se aceptan rutas/nombres del renderer, se hace `path.join` sin comprobar contención y se abre cualquier URL recibida. No hay validación del emisor en esos manejadores.
- **Por qué es un error:** Un renderer comprometido puede solicitar operaciones con `..` fuera del vault, usar una ruta absoluta de contexto o activar protocolos del sistema no previstos. `contextIsolation` no valida los argumentos de las funciones expuestas.
- **Plan:** Resolver IDs en el proceso principal, exigir rutas canónicas dentro del vault, validar emisor y limitar enlaces a protocolos/destinos necesarios. Añadir CSP a las páginas que no la tienen como defensa complementaria.
- **Validación:** Rechazar traversal, rutas externas y esquemas no permitidos usando archivos temporales, sin operar sobre datos reales.

### 45. `electronAPI.off` no retira los listeners añadidos con `on`

- **Ubicación:** `preload.js`, `on` y `off`.
- **Evidencia:** Reproducido: queda un listener después de llamar a `off`.
- **Por qué es un error:** `on` registra una función envolvente, pero `off` intenta eliminar el callback original, que no es la misma función.
- **Plan:** Devolver una función de cancelación o mantener un mapa de callbacks y envolventes. Aplicar la misma lista de canales permitidos.
- **Validación:** Suscribir, emitir, cancelar y emitir otra vez; el callback solo debe ejecutarse antes de cancelar.

### 46. La vigilancia de pantalla completa falla en empaquetado y acumula listeners

- **Ubicación:** `src/utils/fullscreenWatcher.js`, `start`; `src/utils/checkFullscreen.ps1`; `main.js`, `setupFullscreenWatcher`, `performLogout`; `package.json`, configuración de recursos.
- **Evidencia:** Código y riesgos de ejecución pendientes de probar. Se pasa a PowerShell un script situado bajo `__dirname`, sin extraerlo del archivo ASAR en el paquete. El proceso hijo no tiene listener `error`, ni `windowsHide`. Cada login agrega otro listener `change` y `before-quit`, sin retirarlos en logout. El script solo consulta la pantalla primaria.
- **Por qué es un error:** PowerShell externo no puede leer una ruta interna de ASAR como archivo normal; puede entrar en reinicios repetidos. Un fallo de spawn no se captura mediante el `try` síncrono. Los relogins multiplican reacciones, y pantalla completa en otro monitor no se detecta.
- **Plan:** Distribuir el script como recurso externo, resolverlo desde `process.resourcesPath`, gestionar `error`/reinicio, ocultar la consola y registrar/retirar listeners una sola vez. Detectar el monitor correspondiente a la ventana activa.
- **Validación:** Instalador empaquetado, PowerShell no disponible, cinco cambios de sesión y dos monitores.

### 47. El CRUD devuelve datos que no coinciden con los almacenados

- **Ubicación:** `src/db/database.js`, `addTask`, `updateTask`, `deleteTask`.
- **Evidencia:** Reproducido para creación. Se guarda la fecha proporcionada, pero se devuelve `now`; se recorta el título en SQLite, pero se devuelve el original. UPDATE/DELETE no verifican que el ID exista.
- **Por qué es un error:** La vista inmediata puede diferir de la que aparece al recargar. Editar o borrar una tarea inexistente se anuncia como una operación válida.
- **Plan:** Leer y devolver la fila definitiva por su ID y comprobar filas afectadas; devolver un resultado explícito de “no encontrado”.
- **Validación:** Crear con espacios y fecha histórica, recargar y comparar; probar IDs inexistentes.

### 48. La instalación y los controles anunciados no coinciden con el repositorio

- **Ubicación:** `README.md`; `package.json`; `main.js`, `setupGlobalShortcut` y menú contextual; `src/supabase/client.js`, configuración por defecto.
- **Evidencia:** Código. El README anuncia Alt+Espacio, pero se registra Ctrl+Shift+N. El menú anuncia Ctrl+Shift+K sin registrarlo. Los scripts `shortcut` y `build:icon` apuntan a `scratch/build_clean_icon.js`, archivo no versionado porque `scratch/` está ignorado. El README menciona `better-sqlite3` e ISC, mientras el proyecto usa `sql.js` y declara MIT. Supabase usa un proyecto incrustado aunque falten variables; el primer inicio exige login.
- **Por qué es un error:** Un clon limpio no puede ejecutar los scripts de icono; los atajos anunciados no responden y la guía no explica los requisitos reales de autenticación ni el alcance del modo offline. El fallback de Supabase impide que “sin configuración” signifique realmente offline.
- **Plan:** Versionar las herramientas necesarias fuera de `scratch`, corregir guía y metadatos, registrar o corregir los atajos y comprobar conflictos de registro. Hacer explícita la configuración de Supabase y definir un acceso local si se desea soportar primer inicio sin red.
- **Validación:** Instalar desde un clon limpio siguiendo solo el README, comprobar los atajos y probar primer inicio sin conexión.

## Orden propuesto de solución

1. **Contener exposición y mezcla de cuentas:** 01–03, 29 y 44. Retirar secretos distribuidos y establecer fronteras de identidad antes de ampliar la sincronización.
2. **Garantizar que guardar significa guardar:** 12–18, 21, 23 y 47. Definir contratos IPC, persistencia durable y recuperación de operaciones.
3. **Reconstruir sincronización sobre IDs estables:** 04–11 y 15. Añadir cola, descarga, conflictos y borrados pendientes; después migrar duplicados sin pérdida.
4. **Alinear IA y créditos:** 19–27. Validar interpretación local, conservar datos originales y comprobar consumo atómico del servicio.
5. **Corregir sesión y calendario:** 28–36. Probar recuperación de login, renovación, intervalos y eventos idempotentes.
6. **Completar interfaz y distribución:** 37–43, 45–46 y 48. Verificar creación/edición, pizarra, 2D/3D y un instalador real.

No recomiendo introducir descarga automática antes de corregir identidad, propietarios y borrados: la nube actual puede contener duplicados o registros que el usuario ya eliminó localmente.

## Validación pendiente antes de dar por corregido el funcionamiento

- Recorrido real de Electron: primer arranque, login cancelado, login correcto, logout, segundo usuario, cierre y reapertura.
- Edición simultánea desde chat, tablero y pizarra; cierre de sesión con una petición de IA en curso.
- Pruebas aisladas de RLS y créditos con roles reales en un proyecto de ensayo; confirmar políticas y permisos efectivamente desplegados.
- Dos instalaciones para probar sincronización, conflictos y eliminaciones sin conexión.
- Calendar con cuenta de prueba: sin fecha, día completo, 23:30, token expirado y restauración del chat.
- Instalador NSIS/portable: recursos PowerShell, credenciales ausentes en el paquete, dos monitores y atajos ocupados por otra aplicación.
- Auditoría de dependencias y verificación de versiones de ejecución. No se atribuyen vulnerabilidades concretas a paquetes sin haberlas comprobado.

Los diez casos de `scratch/audit-checks.cjs` documentan el comportamiento defectuoso actual. Al implementar soluciones deben convertirse en pruebas que exijan el comportamiento correcto, y añadirse pruebas de integración para los puntos anteriores.
