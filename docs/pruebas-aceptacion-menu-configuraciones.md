# Pruebas de aceptación: menú Configuraciones

## Alcance

Se incorporó el grupo desplegable **Configuraciones** en el menú lateral. Los accesos conservan sus permisos y reutilizan las pantallas existentes, sin duplicar lógica ni datos.

El grupo contiene, en este orden: **Clientes**, **Usuarios**, **Roles y permisos**, **Auditoría**, **Vehículos**, **Plantillas de mensajes** y **Canal**. **Zonas y reparto** continúa como módulo operativo independiente.

## Matriz de aceptación

| Caso | Acción | Resultado esperado | Estado |
| --- | --- | --- | --- |
| CFG-01 | Iniciar sesión con al menos uno de los permisos del grupo. | El menú lateral muestra **Configuraciones** con un indicador para expandir o contraer. | Aprobada |
| CFG-02 | Expandir **Configuraciones**. | Sólo aparecen las opciones autorizadas para el usuario autenticado. | Aprobada |
| CFG-03 | Abrir Clientes, Usuarios, Roles y permisos o Auditoría. | Se abre la pantalla administrativa existente y se conserva su carga de datos. | Aprobada |
| CFG-04 | Abrir **Vehículos**. | Se abre directamente la administración de vehículos; esta opción ya no se duplica en las pestañas de Distribución. | Aprobada |
| CFG-05 | Abrir **Plantillas de mensajes** o **Canal**. | Se abre directamente la configuración solicitada; ambas opciones ya no se duplican en las pestañas de Seguimiento y mensajería. | Aprobada |
| CFG-06 | Seleccionar una opción del grupo. | La opción y el grupo permanecen identificados visualmente, el encabezado muestra el nombre correcto y el menú móvil se cierra. | Aprobada |
| CFG-07 | Iniciar sesión sin ninguno de los permisos del grupo. | **Configuraciones** no se muestra en el menú lateral. | Aprobada |
| CFG-08 | Compilar el frontend y ejecutar el control de tamaño. | La compilación finaliza correctamente y ningún archivo activo supera 300 líneas. | Aprobada |

## Evidencia técnica

- Compilación Angular de producción completada correctamente.
- Imagen Docker del frontend reconstruida y contenedor en estado `healthy`.
- `http://localhost:8080/` sirve el paquete actualizado `main-JDUK4BMH.js`.
- Control aprobado: 495 archivos activos con un máximo de 300 líneas.
- Los permisos utilizados continúan siendo `customers.read`, `users.read`, `roles.read`, `audit.read`, `vehicles.read`, `notifications.templates.read` y `notifications.channel.read`.
