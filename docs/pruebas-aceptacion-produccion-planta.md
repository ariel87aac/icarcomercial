# Modificación y pruebas de aceptación: Producción en planta

## Objetivo

Este documento registra la modificación solicitada después de la revisión funcional del módulo Producción. Complementa las iteraciones primera a cuarta y sirve como evidencia para el informe del proyecto.

## Decisiones aprobadas

| N.º | Decisión | Implementación |
| --- | --- | --- |
| 1 | Diferenciar la solicitud comercial del ajuste técnico. | La interfaz muestra **Solicitud para stock** y **Ajuste por batch/capacidad** en columnas separadas. |
| 2 | Eliminar la orden completamente manual como flujo separado. | Sólo existe **Generar orden de producción**. Sin pedidos, la orden se genera desde una solicitud de abastecimiento enviada por Comercial. |
| 3 | Configurar áreas con categorías existentes. | Un área admite una o varias categorías; una categoría no puede pertenecer a dos áreas. |
| 4 | Implementar Producción en planta. | Segunda vista con una tabla por cada área autorizada; la categoría se identifica en cada producto. |
| 5 | Registrar cantidad real y diferencia. | Cada entrega guarda cantidad real. La entrega final diferente al plan exige incidencia. |
| 6 | Ingreso a Almacén, opción 1. | Doble validación: Producción entrega y Almacén acepta. Sólo la aceptación incrementa la existencia. |
| 7 | Conservar presentación. | La orden, entrega, recepción y movimiento usan la misma presentación. |
| 8 | Permitir ajustar entrega del pedido por faltante. | Preparación puede reducir **Cantidad a entregar**, nunca aumentarla sobre lo solicitado, y debe documentar la diferencia. |
| 9 | Mostrar estado de cada producto. | Cada fila expone una etapa desde `PENDIENTE` hasta `COMPLETADO` o `CERRADO_CON_INCIDENCIA`. |
| 10 | Crear interfaces necesarias. | Producción contiene Planificación, Producción en planta, Áreas y Resumen; la recepción operativa pertenece a Almacén. |
| 11 | Documentar el impacto por iteración. | Se actualizaron `iteracion-1.md`, `iteracion-2.md`, `iteracion-3.md` e `iteracion-4.md`. |
| 12 | Permitir una planificación flexible. | Cada producto tiene fecha programada y secuencia por área. La fecha sólo informa y ordena: no bloquea un inicio anticipado ni demorado. |
| 13 | Cancelar productos u órdenes. | Toda cancelación exige motivo, responsable y fecha. Una orden con recepción en Almacén no se cancela; se cierra incompleta. |
| 14 | Cerrar una solicitud de abastecimiento incompleta. | Si queda cantidad pendiente, la orden y su solicitud asociada pasan a `CERRADA_INCOMPLETA` con observación obligatoria. |
| 15 | Visibilizar solicitudes pendientes. | Producción dispone de una bandeja para ver las solicitudes enviadas por Almacén y generar la orden correspondiente. |
| 16 | Simplificar la planificación para Producción. | El modal de la orden muestra únicamente fecha y secuencia, área y categoría, producto y presentación, planificado, producido, recibido, etapa y acciones. El desglose comercial no ocupa columnas operativas. |
| 17 | Identificar y priorizar órdenes pendientes. | Cada orden recibe un código numérico automático. Planificación ordena por código descendente, filtra varios estados y abre mostrando `EMITIDA` y `EN_PROCESO`; su pestaña indica cuántas órdenes permanecen en esos estados. La tabla pagina en el servidor con 30 registros iniciales. |
| 18 | Controlar entregas parciales con hora de fin. | El sistema determina automáticamente si la cantidad ingresada es parcial o final. Después de recibir un parcial, vuelve a habilitar **Entregar** sin exigir otro inicio. Cada entrega conserva su fecha y hora de fin de Producción, separada de la recepción. |
| 19 | Abrir directamente el trabajo de planta. | Se elimina el listado intermedio y el botón **Procesar orden**. Producción en planta presenta directamente las órdenes emitidas o en proceso, reunidas por área, y conserva únicamente el filtro **Área de Producción**. |
| 20 | Cerrar la producción con faltantes. | Cada orden visible ofrece **Cerrar producción**. Si todavía existe cantidad pendiente, el cierre usa `CERRADA_INCOMPLETA` y exige un motivo; no permite cerrar mientras Almacén tenga entregas pendientes. |
| 21 | Ubicar la recepción en el módulo responsable. | La opción **Recepciones** se retira de Producción y se incorpora en **Almacén**, conservando permisos, doble validación, auditoría y movimiento de existencia. |

## Criterios de aceptación funcional

### PA-PROD-01 — Generación única

**Dado** un usuario con permiso de planificación  
**Cuando** presiona **Generar orden de producción** para una fecha  
**Entonces** se crea un Borrador con el faltante de los pedidos confirmados y la solicitud para stock de la misma fecha, sin mostrar una opción independiente de orden manual. Si no existe ninguno de esos dos orígenes, la generación se rechaza y no deja una orden vacía.

### PA-PROD-02 — Solicitud para stock y ajuste técnico

**Dado** un Borrador  
**Cuando** Producción agrega cantidad para completar un batch o ajustar la capacidad  
**Entonces** esa cantidad se registra como ajuste técnico, el plan es `faltante + solicitud para stock + ajuste técnico` y la solicitud comercial permanece sin cambios.

### PA-PROD-03 — Producto sin pedido

**Dada** una solicitud de abastecimiento enviada para una presentación sin pedidos  
**Cuando** el responsable genera la orden para la misma fecha  
**Entonces** se agrega la fila con Pedidos y Faltante iguales a cero y la cantidad queda identificada como Solicitud para stock.

### PA-PROD-04 — Área obligatoria

**Dado** que una categoría incluida no tiene área  
**Cuando** se intenta emitir la orden  
**Entonces** el sistema rechaza la emisión e identifica la configuración faltante.

**Dado** un área configurada  
**Cuando** se asignan una o varias categorías existentes  
**Entonces** los productos aparecen agrupados en esa área y ninguna categoría queda asignada a dos áreas.

### PA-PROD-05 — Ejecución por producto

**Dada** una orden Emitida  
**Cuando** el encargado inicia una fila  
**Entonces** su etapa cambia a `EN_PROCESO` sin cambiar las demás filas.

### PA-PROD-06 — Cantidad real e incidencia

**Dado** un producto En proceso  
**Cuando** se registra una entrega final menor o mayor que el plan  
**Entonces** la incidencia es obligatoria y la diferencia queda guardada como negativa o positiva.

### PA-PROD-07 — Entrega sin ingreso anticipado

**Dado** que Producción registró una entrega  
**Cuando** Almacén todavía no la aceptó  
**Entonces** el producto queda `PENDIENTE_RECEPCION` y la existencia física no cambia.

### PA-PROD-08 — Recepción de Almacén

**Dada** una entrega pendiente  
**Cuando** el responsable abre **Almacén → Recepciones** y acepta la cantidad recibida  
**Entonces** incrementa la existencia de la misma presentación y crea un único movimiento `INGRESO_PRODUCCION`.

Si la cantidad recibida difiere de la entregada, la observación de Almacén es obligatoria.

La opción **Recepciones** no debe aparecer entre las vistas del módulo Producción.

### PA-PROD-09 — Etapa y cierre

**Dadas** entregas parciales y finales  
**Cuando** Almacén las acepta  
**Entonces** cada producto muestra `RECIBIDO_PARCIAL`, `COMPLETADO` o `CERRADO_CON_INCIDENCIA`, según corresponda.

La orden sólo llega a `CERRADA` cuando todos sus productos fueron recibidos por una cantidad igual o superior al plan. Un cierre con faltantes debe usar `CERRADA_INCOMPLETA` y registrar el motivo; no se permite omitir una recepción pendiente.

### PA-PROD-10 — Preparación con faltante

**Dado** un pedido cuya presentación no fue producida en cantidad suficiente  
**Cuando** el preparador registra una cantidad de entrega menor que la solicitada  
**Entonces** el sistema acepta la reducción, exige observación, conserva la diferencia y no permite superar la cantidad solicitada.

### PA-PROD-11 — Programación flexible por producto

**Dado** un producto en una orden en Borrador  
**Cuando** el responsable define fecha programada, secuencia y ajuste técnico  
**Entonces** el producto se ordena por fecha, área y secuencia. La fecha programada se muestra junto a las fechas reales de inicio y conclusión, pero no impide elaborar antes ni después.

### PA-PROD-12 — Cierre incompleto

**Dada** una orden Emitida o En proceso con cantidades no recibidas  
**Cuando** el responsable intenta el cierre normal  
**Entonces** el sistema lo rechaza y solicita usar **Cerrar incompleta**. Esta acción exige una observación de al menos cinco caracteres, cierra la orden como `CERRADA_INCOMPLETA` y aplica el mismo estado a la solicitud de abastecimiento vinculada.

### PA-PROD-13 — Cancelación

**Dada** una orden sin cantidades recibidas en Almacén  
**Cuando** el responsable registra un motivo y confirma la cancelación  
**Entonces** la orden pasa a `CANCELADA`, sus productos pendientes pasan a `CANCELADO` y la solicitud asociada se cierra incompleta con trazabilidad.

Si ya existe una recepción, la cancelación total se bloquea y debe utilizarse el cierre incompleto. Una entrega pendiente también debe ser resuelta por Almacén antes de cancelar o cerrar.

### PA-PROD-14 — Tabla operativa simplificada

**Dada** una orden abierta desde Planificación  
**Cuando** el responsable revisa los productos a elaborar  
**Entonces** la tabla presenta sólo **Fecha / orden**, **Área / categoría**, **Producto / presentación**, **Planificado**, **Producido**, **Recibido**, **Etapa** y **Acciones**. No muestra las columnas Pedidos, Cubierto, Faltante, Stock, Ajuste ni Fuentes.

### PA-PROD-15 — Listado y contador de planificación

**Dadas** órdenes en diferentes estados  
**Cuando** el usuario abre **Planificación**  
**Entonces** la tabla presenta **Código**, **Fecha de orden**, **Fecha de entrega**, **Estado** y **Acciones**, ordenada desde el código mayor al menor. Planificación sólo ofrece el filtro múltiple de estados, seleccionado por defecto en `EMITIDA` y `EN_PROCESO`; los filtros de fecha de entrega, área y categoría se conservan únicamente en las vistas operativas que los necesitan. La insignia informa el total pendiente y el paginador consulta 30 órdenes por página de manera predeterminada.

### PA-PROD-16 — Tablas por área y entregas parciales

**Dado** un usuario de Producción con una o varias áreas asignadas  
**Cuando** ingresa a **Producción en planta**  
**Entonces** el sistema abre directamente una tabla independiente por cada área autorizada y sólo incluye los productos de órdenes emitidas o en proceso pertenecientes a esas áreas. No existe una lista previa ni el botón **Procesar orden**. Cada fila muestra, en este orden: **Orden**, **Fecha de entrega**, **Producto / presentación**, **Plan**, **Producido**, **Recibido**, **Pendiente**, **Inicio / fin**, **Entregas**, **Estado** y **Acciones**. La categoría no se repite porque la tabla ya está agrupada por Área de Producción.

**Dado** que la operación se realiza principalmente desde teléfonos
**Cuando** el ancho de pantalla es reducido
**Entonces** cada producto se presenta como una tarjeta compacta con etiquetas breves, fechas abreviadas y acciones visibles, sin una tabla horizontal de ancho excesivo. El botón **Cerrar** se encuentra en **Acciones** y aparece una sola vez por orden dentro de cada área.

**Dado** un producto iniciado  
**Cuando** Producción registra una entrega parcial  
**Entonces** el sistema identifica automáticamente que la cantidad acumulada todavía es menor al plan, registra el tramo como parcial y conserva su fecha y hora de fin. Después de la recepción de Almacén, el botón **Entregar** vuelve a estar disponible directamente, sin seleccionar **Continuar** ni volver a iniciar el producto.

**Dadas** una o varias entregas parciales recibidas  
**Cuando** Producción registra la entrega final  
**Entonces** `concluido_at` conserva la hora de esa entrega final y no es reemplazado por la hora posterior de recepción de Almacén. La tabla mantiene visibles todos los tramos, su tipo, cantidad, estado y hora de fin.

**Dada** una orden con cantidades aún pendientes y sin entregas esperando recepción  
**Cuando** el responsable presiona **Cerrar producción**  
**Entonces** el sistema solicita un motivo obligatorio y cierra la orden y su solicitud de abastecimiento como incompletas. Si existe una entrega pendiente de Almacén, el cierre permanece bloqueado hasta resolverla.

**Dado** que el usuario necesita reducir el trabajo visible  
**Cuando** utiliza los filtros de Producción en planta  
**Entonces** sólo encuentra **Área de Producción**; no se muestran filtros por fecha ni categoría en esta pantalla.

### PA-PROD-17 — Aceptación con fecha de entrega modificable

**Dada** una solicitud de abastecimiento enviada por Almacén  
**Cuando** Producción presiona **Aceptar solicitud**  
**Entonces** se abre un modal que muestra el código, la fecha solicitada, los productos y las áreas de la solicitud. La fecha de entrega de la nueva orden se propone con la fecha solicitada, pero puede modificarse antes de generar la orden.

La fecha solicitada permanece como referencia para obtener los pedidos y cantidades de origen; la nueva fecha se guarda como fecha operativa de entrega de la orden. El detalle de la orden muestra ambas fechas cuando existe una solicitud vinculada.

### PA-PROD-18 — Solicitud visible durante el ajuste por batch

**Dado** un producto de una orden en Borrador  
**Cuando** el responsable abre **Programar**  
**Entonces** el modal identifica la solicitud de origen y su fecha, muestra por separado el faltante de pedidos, lo solicitado para stock y la base anterior al batch. El ajuste técnico se suma a esa base y el plan resultante se actualiza sin modificar la solicitud de Almacén.

### PA-PROD-19 — Nombre visible del estado completado

**Dada** una orden que terminó su flujo  
**Cuando** se consulta la tabla, el detalle, los filtros o el historial  
**Entonces** el estado técnico `CERRADA` se presenta al usuario como **Completada** y `CERRADA_INCOMPLETA` como **Completada con faltantes**. Los valores internos se conservan para no romper la trazabilidad ni las integraciones existentes.

## Evidencia automatizada

La suite específica se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance:production-flow
```

Casos automatizados incluidos:

| Caso | Evidencia |
| --- | --- |
| `CP-P01` | Área de Producción con varias categorías. |
| `CP-P02` | Rechazo de orden sin origen y orden sin pedidos generada desde una solicitud comercial para stock; la ruta manual ya no existe. |
| `CP-P03` | Solicitud para stock separada del ajuste técnico. |
| `CP-P04` | Tablero directo filtrado por área, inicio, cantidad real e incidencia obligatoria. |
| `CP-P05` | Entrega pendiente sin modificación de existencia. |
| `CP-P06` | Entrega parcial, recepción, nueva entrega directa, entrega final, hora de fin por tramo, movimientos de inventario y cierre automático. |
| `CP-P07` | Historial y auditoría del flujo completo. |
| `CP-P08` | Programación anterior o posterior a la fecha requerida sin bloqueo de ejecución. |
| `CP-P09` | Entrega parcial con faltante: rechazo del cierre normal, motivo obligatorio y cierre incompleto de Producción y Almacén. |
| `CP-P10` | Cancelación de una orden sin recepciones y conservación del motivo. |
| `CP-P11` | Aceptación de una solicitud con fecha de entrega distinta, preservando la solicitud y sus cantidades para el ajuste por batch. |

La regresión de la consolidación anterior se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance:iteration3
```

## Impacto para el informe por iteración

### Primera iteración

Se reutilizan autenticación, roles, permisos y auditoría. Se agregan permisos de áreas, ejecución y recepción, sin cambiar las reglas de inicio de sesión ni las cuentas de clientes.

### Segunda iteración

Se conserva la reserva de pedidos como origen del faltante. Almacén incorpora el movimiento `INGRESO_PRODUCCION`, la referencia a la entrega y el aumento de precisión. La existencia sólo cambia después de la aceptación de Almacén.

### Tercera iteración

Es la iteración modificada de forma principal: separación entre solicitud comercial y ajuste técnico, orden única con pedidos o solicitud para stock, planificación por presentación, áreas configurables, ejecución por producto, cantidad real, incidencias, entregas, recepciones y etapas visibles.

### Cuarta iteración

Preparación consume el saldo de la presentación después de su ingreso. Ante un faltante, el preparador puede reducir la cantidad que entregará al cliente, dejando observación y diferencia; no puede superar lo solicitado.
