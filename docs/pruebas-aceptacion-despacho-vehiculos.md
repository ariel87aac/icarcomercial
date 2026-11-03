# Pruebas de aceptación: Despacho de vehículos

## Alcance

Se agregó **Despacho de vehículos** como primer paso operativo de Distribución. Una asignación relaciona un vehículo activo, un encargado de distribución y una o varias zonas. Los pedidos sólo pueden incorporarse a una ruta creada desde una asignación en estado **En custodia**. Al enviar los pedidos a reparto se selecciona únicamente el vehículo disponible: el distribuidor responsable se obtiene automáticamente del despacho activo.

## Flujo implementado

1. Crear la asignación de vehículo, distribuidor y zonas. Queda **Pendiente de entrega**.
2. Mientras el despacho esté pendiente o en custodia se pueden agregar o quitar zonas autorizadas, sin modificar el vehículo ni el distribuidor.
3. Registrar la entrega, kilometraje inicial y observaciones. Cambia a **En custodia**.
4. Seleccionar uno o varios pedidos preparados de una zona y enviarlos al vehículo disponible. El sistema crea la ruta y asigna automáticamente al distribuidor que tiene el vehículo en custodia.
5. El distribuidor recibe la carga, inicia el reparto y registra el resultado de cada pedido.
6. Si no existen devoluciones, el distribuidor finaliza y liquida el recorrido. Si hay productos no entregados, envía una orden de retorno a Almacén y la ruta permanece **En reparto**.
7. Almacén recepciona físicamente la devolución e ingresa las cantidades aceptadas al stock. La ruta continúa abierta, pero queda habilitada para que el distribuidor finalice el recorrido.
8. Sólo después de registrar todas las entregas y, cuando corresponda, recepcionar la devolución, el distribuidor finaliza y liquida el recorrido.
9. Cuando todas las rutas están liquidadas o canceladas y no quedan retornos pendientes, presionar **Devolver vehículo**, registrar kilometraje final y observaciones. Cambia a **Devuelto**.

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
| DV-08 | Crear una ruta con despacho activo. | Vehículo y responsable principal se obtienen de la asignación y no pueden ser sustituidos desde el formulario de ruta. | Aprobada |
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
| DV-19 | Seleccionar varios pedidos preparados de una misma zona y presionar **Enviar a reparto**. | Se crea una sola ruta con todos los pedidos seleccionados. | Aprobada |
| DV-20 | Abrir **Enviar a reparto**. | Sólo se selecciona un vehículo con despacho activo; la pantalla informa automáticamente el distribuidor responsable. | Aprobada |
| DV-21 | Enviar desde un cliente una identificación manual de vehículo o responsable. | La API rechaza los campos ajenos al contrato; vehículo y distribuidor sólo se derivan del despacho activo. | Aprobada |
| DV-22 | El distribuidor asignado recibe la carga e inicia el reparto. | La ruta cambia a **En reparto** y queda registrada la custodia del vehículo y de los productos. | Aprobada |
| DV-23 | Un usuario no asignado intenta iniciar o finalizar la ruta. | La API rechaza la operación; Administrador y Comercial conservan la supervisión operativa. | Aprobada |
| DV-24 | Intentar finalizar el recorrido sin registrar el resultado de todos los pedidos. | El botón permanece deshabilitado y la API impide finalizar. | Aprobada |
| DV-25 | Finalizar una ruta cuyas entregas no generan retornos. | La ruta se liquida automáticamente y queda lista para el cierre del despacho. | Aprobada |
| DV-26 | Completar todas las visitas de una ruta con productos no entregados y presionar **Enviar devolución a Almacén**. | Se genera un retorno pendiente; la ruta permanece **En reparto** y todavía no puede finalizarse. | Aprobada |
| DV-27 | Almacén recibe los productos retornados. | Se registra el ingreso al stock y el retorno cambia a **Recibida**; la ruta permanece abierta y queda habilitada para finalizar. | Aprobada |
| DV-28 | Intentar devolver el vehículo con rutas abiertas o retornos pendientes. | La interfaz deshabilita **Devolver vehículo** e indica el motivo; la API también rechaza la devolución. | Aprobada |
| DV-29 | Consultar la tabla de despachos activos. | Se muestran pedidos asignados, entregados, pendientes, retornos pendientes y la causa que impide cerrar. | Aprobada |
| DV-30 | Ingresar con perfil Repartidor asignado. | Puede recibir/iniciar la carga, registrar visitas y finalizar su recorrido. | Aprobada |
| DV-31 | Abrir **Crear ruta de distribución** para una zona sin vehículo autorizado. | Se muestran todos los vehículos en custodia; los incompatibles quedan deshabilitados e indican sus zonas, y la pantalla explica por qué no pueden seleccionarse. | Aprobada |
| DV-32 | Ingresar al módulo Distribución. | La pestaña **Pesos de carga** y su tabla de edición no se muestran; el cálculo interno de carga y la validación contra la capacidad del vehículo se conservan. | Aprobada |
| DV-33 | Abrir la vista **Rutas**. | El filtro de estados selecciona por defecto **Borrador**, **Planificada** y **En reparto**; permite seleccionar varios estados o limpiarlos para consultar todos. | Aprobada |
| DV-34 | Abrir el mapa de una ruta con domicilios georreferenciados. | Cada punto muestra permanentemente el número de parada y el nombre del cliente; al seleccionarlo presenta el código del pedido y la dirección. | Aprobada |
| DV-35 | Intentar finalizar una ruta con una orden de retorno pendiente de recepción. | El botón se sustituye por la alerta **Almacén debe recepcionar la devolución** y la API bloquea el cierre. | Aprobada |
| DV-36 | Finalizar una ruta después de que Almacén recepcionó la devolución. | Se genera la liquidación con la cantidad efectivamente recibida y la ruta cambia a **Liquidada**. | Aprobada |
| DV-37 | Presionar **Editar zonas** en un despacho pendiente o en custodia. | El modal sólo permite agregar o quitar zonas; vehículo y distribuidor se presentan como información no editable. | Aprobada |
| DV-38 | Quitar una zona que todavía tiene rutas abiertas vinculadas al despacho. | La API rechaza la modificación para conservar la coherencia de las rutas operativas. | Aprobada |
| DV-39 | Consultar un despacho devuelto. | No se muestra la acción **Editar zonas** y su asignación histórica permanece inalterable. | Aprobada |
| DV-40 | Consultar las acciones de un despacho activo. | El botón y el modal utilizan el nombre **Devolver vehículo** en lugar de **Cerrar despacho**. | Aprobada |

## Preparación para reportes

Cada ruta nueva conserva `despacho_vehiculo_id`. Desde esa relación se podrá consolidar por rango de fechas: distribuidor, vehículo, zonas, rutas, pedidos visitados, entregas completas, parciales, no entregadas y kilómetros recorridos.

## Evidencia

- Migración `AddVehicleDispatches1720000056000` aplicada en PostgreSQL.
- Cuatro permisos creados y asignados a los perfiles correspondientes.
- Migración `GrantDriverRouteCustody1720000057000` aplicada para otorgar al perfil Repartidor los permisos de inicio y finalización de sus rutas.
- Regresión completa aprobada: 38 archivos de prueba y 166 pruebas del backend.
- Diez pruebas específicas aprobadas para despacho y custodia: asignación automática, autorización del distribuidor, bloqueo por entregas pendientes, envío y recepción del retorno, bloqueo de cierre y liquidación final.
- Siete pruebas específicas aprobadas para despacho de vehículos, incluidas la edición exclusiva de zonas, la protección de rutas abiertas y la conservación del historial de vehículos devueltos.
- Reporte PDF por vehículo generado con la plantilla institucional ICAR y evento de descarga auditado.
- TypeScript de backend y plantillas Angular verificados sin errores.
- Construcciones Docker de backend y frontend completadas.
- Backend y frontend en estado `healthy`.
- Control de tamaño aprobado: ningún archivo activo supera 300 líneas.
