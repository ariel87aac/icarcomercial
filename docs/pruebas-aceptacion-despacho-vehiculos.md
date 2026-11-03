# Pruebas de aceptación: Despacho de vehículos

## Alcance

Se agregó **Despacho de vehículos** como primer paso operativo de Distribución. Una asignación relaciona un vehículo activo, un encargado de distribución y una o varias zonas. Los pedidos sólo pueden incorporarse a una ruta creada desde una asignación en estado **En custodia**.

## Flujo implementado

1. Crear la asignación de vehículo, distribuidor y zonas. Queda **Pendiente de entrega**.
2. Registrar la entrega, kilometraje inicial y observaciones. Cambia a **En custodia**.
3. Crear rutas para las zonas autorizadas y asociar pedidos preparados.
4. Completar o cancelar las rutas abiertas.
5. Registrar devolución, kilometraje final y observaciones. Cambia a **Devuelto**.

## Matriz de aceptación

| Código | Acción | Resultado esperado | Estado |
| --- | --- | --- | --- |
| DV-01 | Abrir Distribución con permiso de lectura. | **Despacho de vehículos** aparece como primera pestaña y vista inicial. | Aprobada |
| DV-02 | Crear una asignación con vehículo, distribuidor y una o varias zonas activas. | Se genera un código numérico incremental y queda **Pendiente de entrega**. | Aprobada |
| DV-03 | Intentar crear otra asignación abierta para el mismo vehículo o distribuidor. | La API rechaza la duplicidad. | Aprobada |
| DV-04 | Entregar el vehículo sin kilometraje inicial. | El formulario impide confirmar. | Aprobada |
| DV-05 | Confirmar entrega con kilometraje inicial. | La asignación cambia a **En custodia** y registra usuario, fecha, hora y observación. | Aprobada |
| DV-06 | Crear una ruta sin seleccionar un despacho activo. | El formulario y la API rechazan la operación. | Aprobada |
| DV-07 | Seleccionar una zona no autorizada para el despacho. | La asignación no aparece como opción y la API rechaza cualquier solicitud inconsistente. | Aprobada |
| DV-08 | Crear una ruta con despacho activo. | Vehículo y responsable principal se obtienen de la asignación; se permiten responsables de apoyo. | Aprobada |
| DV-09 | Agregar pedidos cuando la asignación dejó de estar activa. | La API rechaza la incorporación. | Aprobada |
| DV-10 | Devolver el vehículo con rutas en Borrador, Planificadas o En reparto. | La devolución se bloquea e informa cuántas rutas deben cerrarse o cancelarse. | Aprobada |
| DV-11 | Registrar kilometraje final menor al inicial. | El frontend y la API rechazan el valor. | Aprobada |
| DV-12 | Registrar devolución válida. | Cambia a **Devuelto**, almacena kilometraje final, usuario, fecha, hora y observación. | Aprobada |
| DV-13 | Consultar una asignación. | Se muestran vehículo, distribuidor, zonas, kilometrajes, fechas, estado y cantidad de rutas. | Aprobada |
| DV-14 | Revisar auditoría. | Se registran creación, entrega y devolución de la asignación. | Aprobada |
| DV-15 | Presionar **Reporte** en la asignación o en Configuraciones → Vehículos. | Se descarga un PDF institucional ICAR en hoja Carta vertical correspondiente únicamente al vehículo seleccionado. | Aprobada |
| DV-16 | Generar el reporte de un vehículo con varios despachos devueltos. | El consolidado muestra primer kilometraje inicial, último kilometraje final, suma de recorridos, tiempo acumulado y número de despachos. | Aprobada |
| DV-17 | Revisar el detalle del reporte. | Cada despacho muestra distribuidor, zonas, fechas, kilometrajes, recorrido, tiempo de uso, rutas y observaciones de entrega y recepción. | Aprobada |
| DV-18 | Generar el reporte de un vehículo activo o sin despachos. | El activo calcula el tiempo hasta la generación; el vehículo sin historial genera un reporte válido con métricas en cero. | Aprobada |

## Preparación para reportes

Cada ruta nueva conserva `despacho_vehiculo_id`. Desde esa relación se podrá consolidar por rango de fechas: distribuidor, vehículo, zonas, rutas, pedidos visitados, entregas completas, parciales, no entregadas y kilómetros recorridos.

## Evidencia

- Migración `AddVehicleDispatches1720000056000` aplicada en PostgreSQL.
- Cuatro permisos creados y asignados a los perfiles correspondientes.
- Regresión completa aprobada: 36 archivos de prueba y 150 pruebas del backend.
- Cinco pruebas específicas aprobadas: entrega, bloqueo de devolución, devolución válida y dos escenarios del reporte histórico.
- Reporte PDF por vehículo generado con la plantilla institucional ICAR y evento de descarga auditado.
- TypeScript de backend y plantillas Angular verificados sin errores.
- Construcciones Docker de backend y frontend completadas.
- Backend y frontend en estado `healthy`.
- Control de tamaño aprobado: ningún archivo activo supera 300 líneas.
