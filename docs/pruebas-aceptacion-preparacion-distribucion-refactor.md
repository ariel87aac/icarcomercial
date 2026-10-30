# Pruebas de aceptación: refactor de Preparación y Distribución

## Objetivo

Este documento registra el ajuste correctivo de la cuarta iteración realizado el 26 de octubre de 2026. El alcance comprende unicidad de preparación, faltantes y recepciones de Producción, cancelación y reprogramación auditadas, separación de las interfaces de Almacén y Distribución, la división de Almacén en las colas **Preparar** y **Despachar**, pesos de carga y paginación.

## Decisiones funcionales verificables

- Una preparación `DESPACHADA` sigue siendo la preparación válida del pedido y bloquea duplicados.
- Solo una preparación `CANCELADA` permite iniciar nuevamente el trabajo del mismo pedido.
- Cancelar la preparación no libera la reserva del pedido.
- El disponible es `existencia física - reserva total` y puede ser negativo para visibilizar el faltante.
- La cantidad confirmada no puede superar la existencia física que realmente puede separarse.
- Las recepciones de Producción relacionadas se informan como contexto; el ingreso aceptado por Almacén es el que aumenta la existencia.
- Cancelar una ruta antes de su salida devuelve las preparaciones a `PREPARADA`.
- La cola **Preparar** reúne pedidos confirmados todavía no iniciados y preparaciones pendientes, en proceso u observadas.
- La cola **Despachar** contiene únicamente pedidos preparados que todavía no fueron entregados a Distribución.
- **Editar** reabre una preparación y obliga a verificar nuevamente todos los productos antes de volver a prepararla.
- **Entregar** registra el traspaso de Almacén a Distribución, sin descontar inventario; la salida de la ruta sigue siendo el punto de consumo.
- Retirar una preparación de una ruta o cancelar la ruta antes de la salida la devuelve a **Despachar**.
- Reprogramar una ruta modifica su fecha operativa, no la fecha de entrega comprometida del pedido.
- Toda cancelación o reprogramación exige motivo, usuario y fecha.
- Los pesos se registran con valores reales; no se autocompletan con estimaciones.

## Casos automatizados agregados

Fuente: `backend/scripts/iteration-four.acceptance.mjs`.

| Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- |
| CP-140 | Completar el despacho de un pedido e intentar crear otra preparación. | La API responde `409` y el pedido no reaparece entre elegibles. |
| CP-141 | Confirmar un pedido por 45 unidades cuando existen 40. | Se muestran físico `40`, reservado `45`, disponible `-5` y faltante `5`. |
| CP-142 | Abrir la preparación del pedido con faltante. | Se conservan las instantáneas física, disponible y faltante, además de las referencias de Producción relacionadas. |
| CP-143 | Intentar confirmar 45 unidades con solo 40 físicas. | La API responde `422`; al ajustar a 40 y documentar la diferencia, permite confirmar. |
| CP-144 | Reprogramar una ruta sin salida con motivo obligatorio. | Cambia la fecha operativa, conserva la fecha comprometida del pedido y registra historial. |
| CP-145 | Cancelar una ruta sin salida que tiene una preparación asignada. | La ruta queda `CANCELADA`; la preparación regresa a `PREPARADA` y el evento conserva el motivo. |
| CP-146 | Cancelar una preparación liberada e iniciar otra para el mismo pedido. | La primera queda `CANCELADA`, la reserva permanece y la nueva inicia `PENDIENTE`. |
| CP-147 | Actualizar el peso de una presentación y volver a consultarla. | La API devuelve el valor exacto y crea el evento de auditoría. |
| CP-148 | Consultar preparaciones y rutas con `limit=1`. | La respuesta incluye metadatos de página, límite, total y total de páginas. |
| CP-149 | Consultar la cola de trabajo antes y después de iniciar una preparación. | **Preparar** reúne pedidos por iniciar y preparaciones en curso; cada producto inicia con la cantidad solicitada. |
| CP-150 | Preparar un pedido, seleccionar **Editar** y volver a abrirlo. | La preparación regresa a `EN_PREPARACION`, se eliminan las verificaciones anteriores y exige una nueva validación completa. |
| CP-151 | Seleccionar **Entregar** sobre un pedido preparado. | Se registra usuario y fecha del traspaso, el pedido sale de Almacén y queda disponible para crear la ruta sin descontar inventario. |
| CP-152 | Consultar el Resumen antes y después de entregar una preparación a Distribución. | El total general coincide con la suma de etapas y el contador de productos listos para ruta aumenta en uno. |
| CP-153 | Consultar la bandeja de Distribución, seleccionar un pedido y crear la ruta. | La bandeja muestra peso y zona; la ruta y su entrega se crean en una sola transacción, la preparación pasa a `ASIGNADA` y deja de aparecer entre pendientes. |

## Casos de interfaz

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| PA-RPD-01 | Abrir **Almacén**. | La pestaña **Preparación** está integrada junto a las funciones de Almacén. |
| PA-RPD-02 | Abrir **Distribución**. | Se muestran Vehículos, Pesos de carga, Rutas, Mi reparto y Resumen; Preparación no se duplica aquí. |
| PA-RPD-03 | Buscar pedido o cliente y cambiar filtros de fecha, zona o estado. | La consulta se actualiza dinámicamente y el paginador vuelve a la primera página. |
| PA-RPD-04 | Abrir un pedido con reserva superior al físico. | El disponible negativo y el faltante aparecen resaltados; también se muestran las recepciones relacionadas de Producción. |
| PA-RPD-05 | Cancelar una preparación sin asignar. | El modal exige un motivo y la tabla refleja `CANCELADA`. |
| PA-RPD-06 | Retirar una entrega de una ruta en Borrador. | La fila desaparece de la ruta y la preparación queda disponible para otra ruta. |
| PA-RPD-07 | Reprogramar o cancelar una ruta sin salida. | El modal exige motivo; se distingue la fecha operativa de la fecha comprometida del pedido. |
| PA-RPD-08 | Abrir **Pesos de carga**. | Se identifican primero las presentaciones sin peso, se editan valores exactos y se guardan en bloque. |
| PA-RPD-09 | Navegar tablas de preparaciones, vehículos, pesos, rutas y resumen. | Cada tabla muestra 25 registros por defecto y ofrece 25, 50 o 100 por página. |
| PA-RPD-10 | Reducir el ancho de la pantalla. | Los filtros, acciones y tablas siguen operables mediante distribución adaptable y desplazamiento horizontal controlado. |
| PA-RPD-11 | Abrir **Almacén > Preparación**. | La pantalla muestra dos tablas independientes: **Preparar** y **Despachar**. |
| PA-RPD-12 | Abrir el modal de preparación. | Las columnas se presentan en este orden: Cod-Producto, Nombre, Stock disponible, Solicitado, Cantidad a entregar, Diferencia, Verificado y Observación. |
| PA-RPD-13 | Abrir por primera vez una preparación. | La cantidad a entregar toma por defecto la solicitada; si supera el stock separable, el formulario exige reducirla y justificar la diferencia. |
| PA-RPD-14 | Dejar al menos un producto sin marcar en **Verificado**. | El botón **Preparar** permanece deshabilitado. |
| PA-RPD-15 | Reducir una cantidad sin registrar observación. | Se muestra la diferencia y **Preparar** permanece deshabilitado hasta justificarla. |
| PA-RPD-16 | Verificar todos los productos y preparar el pedido. | El pedido desaparece de **Preparar** y aparece en **Despachar**. |
| PA-RPD-17 | Usar **Editar** desde **Despachar**. | El pedido vuelve al modal editable y todos sus productos deben verificarse nuevamente. |
| PA-RPD-18 | Usar **Entregar** desde **Despachar**. | El pedido sale de la cola de Almacén y queda disponible en Distribución; no se descuenta inventario. |
| PA-RPD-19 | Usar **Cancelar** desde **Despachar**. | Se exige un motivo, se conserva la reserva del pedido y la cancelación queda auditada. |
| PA-RPD-20 | Abrir Preparación desde un dispositivo móvil. | Las filas se convierten en tarjetas legibles, las cantidades admiten controles táctiles y las acciones permanecen accesibles. |
| PA-RPD-21 | Abrir **Pedidos** y luego **Resumen**. | Pedidos ya no muestra un flujo duplicado; Resumen presenta el flujo principal Pedidos → Producción → Preparación → Distribución, los pendientes por etapa y el total visible. |
| PA-RPD-22 | Seleccionar una etapa disponible del flujo principal. | El sistema abre el módulo correspondiente; las etapas sin permiso se muestran deshabilitadas y no revelan cantidades. |
| PA-RPD-23 | Abrir **Distribución > Pedidos pendientes**. | Se muestran los pedidos entregados por Almacén todavía no asignados, con cliente, compromiso, zona, productos, peso y fecha de recepción. |
| PA-RPD-24 | Seleccionar pedidos de zonas diferentes. | El sistema informa que una ruta corresponde a una sola zona y bloquea la creación hasta corregir la selección. |
| PA-RPD-25 | Seleccionar pedidos de una zona y abrir **Crear ruta con seleccionados**. | El modal conserva la zona, muestra carga y capacidad, y al confirmar crea la ruta con una secuencia inicial válida. |
| PA-RPD-26 | Abrir una preparación, modificar verificaciones sin guardar, cerrarla y abrir otro pedido con cantidades diferentes. | El segundo pedido muestra sus propias cantidades y verificaciones; no hereda controles ni valores visuales del pedido anterior y **Preparar** se habilita al verificar sus productos. |

## Ejecución

Con el stack levantado y saludable:

```bash
docker compose run --rm backend npm run test:acceptance:iteration4
```

La prueba crea datos identificables, valida 34 casos y elimina pedidos, notificaciones, seguimiento, preparaciones, rutas, inventario y catálogos temporales al finalizar.

## Dato pendiente de negocio

Al momento de la intervención existen 15 presentaciones activas sin `peso_kg`. La interfaz permite completarlas y bloquea la planificación de cualquier ruta que las incluya. Los valores no fueron inferidos porque descripciones como “caja de 12 unidades” o “bolsa de 10 unidades” no determinan por sí solas el peso real. Los responsables deben ingresar el peso verificado del empaque comercial.
