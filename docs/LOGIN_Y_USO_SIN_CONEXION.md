# Inicio de sesión y uso sin conexión

La primera entrada requiere Google e internet. Se eliminó la entrada de invitado, su IPC y la preferencia antigua `local_mode`; esa preferencia ya no concede acceso.

Después de iniciar sesión, Notip recuerda la sesión de Google en este equipo. En los siguientes arranques abre el chat directamente, sin mostrar fugazmente el login y sin esperar a que responda la red. La renovación se realiza en segundo plano. Un fallo de conexión conserva el acceso local; una respuesta definitiva de token revocado vuelve a pedir Google.

Cerrar sesión borra inmediatamente el acceso recordado, aunque no haya internet. Al volver a abrir será necesario iniciar sesión con Google. Esto no borra las notas. Una renovación que terminase después del cierre no puede restaurar esa sesión.

El guardado offline sigue siendo automático dentro del chat. La cola reintenta al recibir el evento de reconexión y periódicamente mientras Notip está abierto. Tener internet no determina si aparece el login: lo determina la existencia de una sesión recordada.

## Estado para Antigravity

Esta corrección se hizo sobre `6a656da`, conservando los ajustes del chat ya integrados. La carpeta de trabajo es `C:\Users\HOME\Desktop\Notip`, rama `fix/google-login-offline-session`; el worktree anterior de estudio ya no existe. El acceso directo actual abre esta carpeta, por lo que basta con salir de Notip y abrirlo otra vez. No se realizó un merge a `main` en esta corrección.

Validación: `npm.cmd test` ejecuta 22 pruebas, incluidas cinco de sesión y logout. `npm.cmd run test:ui` comprueba el chat y dos arranques de Electron con datos temporales: primer acceso obligatorio con Google (incluida una preferencia antigua de invitado) y sesión recordada con renovación de red sin respuesta, seguida de logout. Las respuestas de autenticación y de IA se simulan; no se accedió a la cuenta real del usuario ni se consumieron créditos.
