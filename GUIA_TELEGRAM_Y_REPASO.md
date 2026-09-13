# Telegram y consultas de estudio en Notip

## Ver los cambios

Cierra Notip por completo desde su icono en la bandeja de Windows y vuelve a abrir tu acceso directo habitual. Los cambios están en `feat/chat-claridad`; no requieren unirlos a `main` para probarlos en este proyecto.

## Conectar tu bot en cinco minutos

El código del bot ya está incluido. Solo tú puedes registrar su cuenta usando tu Telegram:

1. En el chat de la mascota, abre **Más → Ajustes → Recordatorios por Telegram**.
2. Pulsa **Abrir BotFather**, inicia la conversación y envía `/newbot`.
3. Elige el nombre que verás, por ejemplo **Mis pendientes de Notip**. Después elige un usuario único terminado en `bot`, como `notip_pendientes_juan_bot`.
4. BotFather te entrega un **token** (una cadena que empieza con números y contiene `:`). Pégalo en el campo de Notip y pulsa **Conectar bot**. No necesitas enviarlo a ninguna persona.
5. Pulsa **Abrir mi bot y pulsar Iniciar** y, dentro de Telegram, pulsa **Iniciar/Start**. Usa ese enlace de Notip: abrir el bot por su nombre no vincula tu cuenta. El enlace vence en diez minutos; si vence, desconecta y vuelve a conectar con el mismo token.
6. Regresa a Notip. En unos segundos aparecerá **Conectado**. Ajusta los horarios, guárdalos y pulsa **Enviar prueba**.

Cada instalación debe usar su propio bot. Tus amigos pueden repetir estos pasos con sus cuentas; compartir el mismo token entre varios Notip hace que compitan por recibir los mensajes.

## Qué te recordará

- Resumen diario de tareas pendientes a las **18:00**, configurable. Muestra hasta cinco tareas y el número total; las demás siguen disponibles en Notip.
- Avisos de entregas en las próximas **24 horas** y **2 horas**, con identificación de entregas vencidas. Si no indicas una hora, se considera el final del día.
- Descanso entre **22:00 y 08:00**, configurable. Los avisos automáticos no interrumpen ese horario.
- Como máximo un aviso automático por hora. Las tareas que pospongas explícitamente pueden generar sus propios recordatorios; también respetan el descanso.
- **Hecho** completa la tarea en Notip; **En 1 hora** la pospone; **Ver pendientes** muestra el resumen actual.
- `/pendientes` consulta tus tareas, `/pausa` detiene los avisos y `/reanudar` los activa. Una consulta que tú envíes puede responderse durante el descanso.

Los horarios y recordatorios sobreviven al reinicio. Si el equipo está apagado, suspendido, sin internet, Notip cerrado o tu sesión cerrada, el bot no puede responder ni enviar avisos. Al regresar se revisan los pendientes; no se reproduce un historial de todos los avisos perdidos. Para funcionar con el equipo apagado haría falta alojar el servicio fuera de tu PC, algo que esta versión no incluye.

## Consultas mejoradas con Claude

En **Resolver esta duda**, revisa o escribe la consulta y pulsa **Mejorar consulta con IA** si quieres que Claude la reformule. Esta acción usa una llamada a la API y su saldo; abrir el formulario o copiar la plantilla local no la usa. Si falla, tu texto se conserva. Si editas mientras llega la respuesta, no se sobrescriben tus cambios.

Después puedes **Solo copiar** o **Copiar y abrir** Claude, Gemini o ChatGPT. Pega con `Ctrl+V` y envía cuando quieras; se aplican los límites de la cuenta del sitio que elijas.

En **Mis clases**, cuando el resumen esté listo:

- Abre **Dudas que anotaste** y pulsa **Resolver esta duda** junto a la que quieras trabajar. Se incluye el resumen y hasta tres apuntes relacionados de esa clase.
- Pulsa **Repasar esta clase** para preparar una sesión con preguntas de una en una basada en sus apuntes.

## Validación

Se incluyen pruebas del guardado offline, sesión, clases, consultas editables, errores de conexión y del bot con Telegram simulado: vinculación, horarios, deduplicación, posposición y tareas completadas. No se han realizado llamadas a tu API ni enviado mensajes reales a Telegram durante las pruebas. La comprobación real se hace con **Enviar prueba**, después de registrar y vincular tu bot.
