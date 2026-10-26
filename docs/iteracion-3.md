# Tercera iteración: planificación y ejecución de Producción

## Alcance actualizado

La tercera iteración genera una orden de Producción para una fecha de entrega a partir de los pedidos confirmados y la existencia que ya fue reservada en Almacén. El cálculo se realiza por **presentación de producto**, de modo que Producción entrega y Almacén recibe exactamente la misma presentación indicada en la orden.

No existe una modalidad separada denominada «orden completamente manual». El único botón es **Generar orden de producción**. La orden incorpora el faltante de los pedidos elegibles y la **Solicitud para stock** enviada previamente por Comercial desde Almacén. Si no existen pedidos, la misma orden puede originarse sólo con esa solicitud. Puede haber varias solicitudes para la misma fecha: Producción procesa cada código desde **Solicitudes pendientes**, creando una orden principal para la primera y órdenes complementarias independientes para las siguientes. Al aceptar una solicitud, el responsable puede modificar la fecha de entrega de la orden sin alterar la fecha solicitada ni las cantidades de origen. Producción únicamente registra el **Ajuste por batch/capacidad** necesario para adaptar el total a su proceso técnico.

Si para la fecha no existen pedidos confirmados ni una solicitud enviada, la transacción de generación se rechaza y no crea una orden vacía.

La iteración incorpora áreas configurables de Producción, ejecución por producto, registro de la cantidad realmente entregada, recepción independiente por Almacén y visibilidad de la etapa de cada producto. No implementa fórmulas, materias primas, maquinaria, calidad ni predicción de demanda.

## Historias y ajustes cubiertos

| Historia o ajuste | Evidencia funcional |
| --- | --- |
| HU-17 | Generación de órdenes desde pedidos Confirmados por fecha de entrega. |
| HU-18 | Consolidación por producto y presentación, conservando factor y unidad base en las fuentes. |
| HU-19 | Trazabilidad hasta los detalles de pedido de origen. |
| HU-20 | Recálculo de Borrador y emisión de versión inmutable. |
| HU-21 | Versiones complementarias para confirmaciones posteriores. |
| HU-22 | Ejecución y entregas parciales por producto. |
| HU-23 | Cierre con cantidad real, diferencia, responsable e incidencia. |
| PA-03-01 | Requerimiento neto según reservas de Almacén. |
| PA-03-02 | La **Solicitud para stock** de Comercial queda separada del **Ajuste por batch/capacidad** de Producción. |
| PA-03-03 | Una misma orden admite demanda de pedidos, solicitud para stock o ambas; no se agregan productos manualmente desde Producción. |
| PA-03-04 | Áreas de Producción configurables mediante asignación de una o varias categorías existentes. |
| PA-03-05 | Pantalla **Producción en planta**, etapas por producto y entrega real. |
| PA-03-06 | Doble validación: Producción entrega y Almacén acepta antes de aumentar la existencia. |

## Cálculo del plan

Cada fila se identifica por presentación. Sus fuentes conservan las cantidades del pedido y su equivalencia en unidad base para auditoría, pero la operación visible y el ingreso a Almacén permanecen en la presentación seleccionada.

```text
Pedidos = cantidad solicitada en la presentación
Cubierto por Almacén = cantidad reservada en la presentación
Faltante de Producción = Pedidos - Cubierto por Almacén
Plan de Producción = Faltante de Producción + Solicitud para stock + Ajuste por batch/capacidad
```

La **Solicitud para stock** la define Comercial en Almacén y se bloquea al enviarla. El **Ajuste por batch/capacidad** lo define Producción únicamente sobre una fila que ya proviene de pedidos o de una solicitud para stock. Ninguno modifica los pedidos, la reserva ni el faltante calculado. El motivo técnico se registra cuando el ajuste es mayor que cero.

El modal **Programar producto** muestra el código y la fecha de la solicitud vinculada, el faltante de pedidos, la cantidad solicitada para stock y la base anterior al batch. De esta manera el responsable aplica el ajuste sobre información visible y el sistema calcula `plan = faltante + solicitud para stock + ajuste técnico`.

Al recalcular se actualizan los pedidos y la solicitud vinculada sin duplicar presentaciones. El ajuste técnico se conserva sobre la fila reconstruida y el plan vuelve a validarse con sus tres componentes.

## Flujo de la orden y etapas del producto

La orden conserva los estados generales:

```text
BORRADOR → EMITIDA → EN_PROCESO → CERRADA
    │          │            └────→ CERRADA_INCOMPLETA
    └──────────┴─────────────────→ CANCELADA
```

En la interfaz, `CERRADA` se presenta como **Completada** y `CERRADA_INCOMPLETA` como **Completada con faltantes**. Los códigos internos no cambian para conservar compatibilidad con la base de datos, auditoría e integraciones.

Cada producto muestra su propia etapa:

```text
PENDIENTE
  → EN_PROCESO
  → PENDIENTE_RECEPCION
  → RECIBIDO_PARCIAL
  → COMPLETADO
     o CERRADO_CON_INCIDENCIA
     o CANCELADO
```

- `PENDIENTE`: aún no fue iniciado.
- `EN_PROCESO`: el área inició su elaboración.
- `PENDIENTE_RECEPCION`: Producción registró una entrega que Almacén todavía no aceptó.
- `RECIBIDO_PARCIAL`: Almacén aceptó una parte y queda cantidad por entregar.
- `COMPLETADO`: la entrega final fue recibida y coincide con el plan.
- `CERRADO_CON_INCIDENCIA`: la entrega final fue recibida con diferencia respecto del plan.
- `CANCELADO`: el responsable canceló la elaboración y dejó un motivo.

Una orden se cierra automáticamente como `CERRADA` sólo cuando todos sus productos alcanzan una etapa terminal y Almacén recibió al menos el plan. Si queda faltante, el responsable utiliza `CERRADA_INCOMPLETA` y registra una observación obligatoria. Una orden sin recepciones puede cancelarse con motivo. Ningún cierre ni cancelación puede omitir una entrega pendiente de recepción.

## Programación flexible

Cada producto conserva `fecha_programada` y `secuencia` dentro de su área. La planificación puede colocar productos de la misma solicitud en fechas diferentes y establecer qué se procesa primero. Estas fechas son informativas: el sistema permite iniciar antes o después y registra `iniciado_at` y `concluido_at` para comparar lo programado con lo realmente ejecutado, sin bloquear la operación.

Cada orden dispone además de un `codigo` numérico autoincremental. La vista **Planificación** se ordena por este código de mayor a menor y muestra solamente código, fecha de orden, fecha de entrega, estado y acciones. En esta vista sólo permanece el filtro múltiple de estados, que comienza con `EMITIDA` y `EN_PROCESO`; la pestaña conserva un contador independiente de órdenes pendientes. La consulta se pagina en el servidor con 30 registros por página de forma predeterminada y permite seleccionar 30, 60 o 90.

## Áreas de Producción

Las áreas no duplican las categorías. La tabla `areas_produccion` guarda el nombre y estado del área, y `areas_produccion_categorias` asigna una o varias categorías ya existentes. La restricción única de `categoria_id` garantiza que cada categoría pertenezca a una sola área, mientras un área puede reunir muchas categorías.

La asignación de responsables se realiza mediante `usuarios_areas_produccion`: un usuario con rol `PRODUCCION` debe tener una o varias áreas activas y un área puede estar a cargo de varios usuarios. Las líneas productivas no participan en ninguna de estas dos relaciones; se conservan únicamente como clasificación del producto.

Antes de emitir, cada producto debe tener un área obtenida de su categoría. Si una categoría no fue configurada, la emisión se rechaza e indica que debe completarse la asignación.

La pantalla **Áreas** permite:

- crear un área;
- editar su nombre y estado;
- seleccionar varias categorías existentes;
- identificar categorías todavía no asignadas.

En **Usuarios**, al seleccionar el rol `PRODUCCION` aparece el selector obligatorio **Áreas de Producción**. La tabla administrativa muestra las áreas asignadas. Un área con usuarios asignados no puede inactivarse hasta reasignar o retirar esos usuarios.

## Producción en planta

La segunda pantalla operativa abre directamente las órdenes `EMITIDA` y `EN_PROCESO`, sin un listado intermedio ni el botón **Procesar orden**. Crea una tabla independiente por cada área de Producción visible para el usuario y dispone únicamente del filtro **Área de Producción**. La autorización se resuelve con las áreas asignadas al usuario de rol `PRODUCCION`; un administrador conserva la vista completa. En cada tabla, las filas muestran orden, fecha de entrega, producto y presentación, plan, producido, recibido, pendiente, fechas reales, entregas acumuladas, estado y acciones. La categoría no se repite porque la información ya está agrupada por área.

La vista de planta está optimizada para teléfonos: en pantallas reducidas cada fila se convierte en una tarjeta compacta, utiliza fechas abreviadas y mantiene los botones operativos en **Acciones**. **Cerrar** aparece una sola vez por orden en esa columna y no ocupa la celda de identificación de la orden.

El encargado puede:

1. Iniciar un producto pendiente.
2. Registrar una entrega parcial o final.
3. Indicar la cantidad real entregada.
4. Documentar una incidencia obligatoria cuando la entrega final queda por debajo o por encima del plan.

El formulario sólo solicita la cantidad entregada. Si el acumulado continúa por debajo del plan, el sistema la registra automáticamente como parcial; si alcanza o supera el plan, la registra como final. Después de una recepción parcial, el producto queda `RECIBIDO_PARCIAL` y **Entregar** se habilita nuevamente sin exigir otro inicio. No se admite enviar dos entregas simultáneas pendientes de recepción.

Cada orden activa presenta **Cerrar producción**. Si aún queda cantidad por entregar, el sistema abre el cierre incompleto y exige el motivo. La operación pasa la orden y su solicitud de abastecimiento a `CERRADA_INCOMPLETA`; si Almacén mantiene una entrega pendiente, primero debe recibirla.

Cada registro de `entregas_produccion` guarda automáticamente `entregado_at`, presentado en la interfaz como **hora de fin** del tramo. La entrega final fija `concluido_at` del producto en ese mismo instante. La recepción posterior guarda su propia hora en `recibido_at` y no reemplaza la conclusión real de Producción.

Las entregas son acumulativas. La diferencia se calcula así:

```text
diferencia = cantidad entregada por Producción - plan de Producción
pendiente = máximo(plan de Producción - cantidad entregada, 0)
```

Un valor negativo representa faltante; cero, cumplimiento; y un valor positivo, excedente. El producto conserva la presentación de la orden durante toda la operación.

## Recepción en Almacén

Se implementa la opción de **doble validación**:

1. Producción registra la entrega. Esto no altera la existencia.
2. Almacén consulta la entrega pendiente desde **Almacén → Recepciones**, verifica la presentación e indica la cantidad recibida.
3. Si la cantidad recibida difiere de la entregada, la observación de Almacén es obligatoria.
4. Al aceptar, se incrementa `cantidad_fisica` de esa presentación y se crea un movimiento inmutable `INGRESO_PRODUCCION` relacionado con la entrega.

La relación única entre movimiento y entrega impide contabilizar una recepción dos veces. La existencia y el movimiento se guardan en la misma transacción. La recepción no aparece como vista de Producción, porque la aceptación y el ingreso físico corresponden al responsable de Almacén.

## Matriz de permisos

| Rol | Planificación | Planta | Recepción | Áreas |
| --- | --- | --- | --- | --- |
| `ADMINISTRADOR` | Según permisos asignados | Según permisos asignados | Según permisos asignados | Según permisos asignados |
| `COMERCIALIZACION` | Solicita stock desde Almacén; genera, recalcula, emite y consulta la orden | Consulta | Sin aceptación | Consulta y configura |
| `PRODUCCION` | Consulta y ajusta únicamente productos de sus áreas asignadas | Inicia y entrega únicamente productos de sus áreas | Sin aceptación | Consulta sus áreas |
| `ALMACEN` | Consulta autorizada | Consulta | Consulta y acepta entregas | Consulta |
| `GERENCIA` | Consulta | Consulta | Consulta si se asigna el permiso | Consulta |

Permisos anteriores conservados:

- `production.consolidations.read`
- `production.consolidations.create`
- `production.consolidations.edit`
- `production.consolidations.emit`
- `production.plan.adjust`
- `production.traceability.read`
- `production.requirements.read`
- `production.progress.create`
- `production.close`
- `production.history.read`
- `production.summary.read`

Permisos agregados:

- `production.areas.read`
- `production.areas.manage`
- `production.execution.manage`
- `production.receipts.read`
- `production.receipts.accept`

## Interfaces

El módulo Producción contiene cinco vistas y Almacén incorpora la recepción:

| Vista | Función |
| --- | --- |
| **Solicitudes pendientes** | Recibir solicitudes enviadas desde Almacén y generar su orden de Producción. |
| **Planificación** | Generar, recalcular y emitir la orden; visualizar la solicitud para stock y registrar sólo el ajuste técnico. |
| **Producción en planta** | Trabajar por área y categoría; iniciar y entregar cada producto; ver su etapa. |
| **Áreas** | Configurar la relación entre áreas y categorías existentes. |
| **Resumen** | Consultar totales por fecha, área, categoría, producto y presentación. |

En **Almacén → Recepciones**, el responsable consulta las entregas pendientes, verifica la cantidad, registra diferencias y acepta el ingreso a existencias.

## Rutas de la API

| Método | Ruta | Función |
| --- | --- | --- |
| `GET / POST / PATCH` | `/api/production-areas` | Consulta y configura áreas. |
| `GET` | `/api/production-areas/categories` | Lista categorías para su asignación. |
| `GET / POST` | `/api/production-consolidations` | Consulta o genera la orden principal. |
| `GET` | `/api/production-consolidations/:id` | Consulta detalle, etapa, fuentes y entregas. |
| `POST` | `/api/production-consolidations/:id/recalculate` | Recalcula un Borrador. |
| `POST` | `/api/production-consolidations/:id/emit` | Emite y congela la planificación. |
| `PATCH` | `/api/production-consolidations/:id/details/:detailId/plan` | Modifica el ajuste técnico por batch o capacidad sin alterar la solicitud para stock. |
| `PATCH` | `/api/production-consolidations/:id/details/:detailId/schedule` | Programa fecha, secuencia y ajuste técnico del producto. |
| `POST` | `/api/production-consolidations/:id/details/:detailId/start` | Inicia la elaboración de un producto. |
| `POST` | `/api/production-consolidations/:id/details/:detailId/deliveries` | Registra la cantidad real entregada por Producción. |
| `POST` | `/api/production-consolidations/:id/details/:detailId/cancel` | Cancela un producto con motivo. |
| `POST` | `/api/production-consolidations/:id/cancel` | Cancela una orden sin recepciones. |
| `POST` | `/api/production-consolidations/:id/close-incomplete` | Cierra una orden y su abastecimiento con faltantes documentados. |
| `GET` | `/api/production-stock-requests` | Lista solicitudes enviadas pendientes de programación. |
| `GET` | `/api/production-deliveries` | Consulta entregas pendientes o aceptadas. |
| `POST` | `/api/production-deliveries/:id/receive` | Acepta la entrega e ingresa la presentación a Almacén. |
| `GET` | `/api/production-consolidations/:id/sources` | Consulta pedidos de origen. |
| `GET` | `/api/production-consolidations/:id/history` | Consulta historial cronológico. |
| `GET` | `/api/production-summary` | Consulta resumen operativo. |

## Persistencia

La migración `1720000004000-create-iteration-three.ts` contiene las tablas originales de consolidación, detalle, origen, avance e historial. La migración `1720000014000-add-production-net-requirement.ts` agregó la separación entre demanda reservada, faltante y planificación.

La migración `1720000015000-production-plant-and-reception.ts` incorpora:

- `areas_produccion` y `areas_produccion_categorias`;
- categoría, presentación, área, cantidad recibida y etapa en cada detalle;
- `entregas_produccion` con responsables de entrega y recepción;
- `INGRESO_PRODUCCION` y la referencia única desde movimiento de inventario;
- los cinco permisos nuevos del flujo de planta y recepción;
- precisión de seis decimales en existencias y movimientos.

La migración `1720000016000-allow-stock-only-production.ts` permite detalles con demanda de pedidos igual a cero, necesarios para producir exclusivamente para stock.

La migración `1720000032000-add-stock-replenishment-requests.ts` crea la cabecera y los detalles de las solicitudes de abastecimiento, vincula una solicitud con una única consolidación e incorpora `cantidad_solicitada_stock` y su referencia de origen en cada detalle de Producción. La migración `1720000033000-fix-stock-request-detail-delete-rule.ts` asegura que una referencia histórica eliminada se convierta en nula sin borrar el detalle de Producción.

La migración `1720000034000-flexible-production-planning.ts` agrega fechas y secuencia por producto, fechas reales de inicio y conclusión, responsables y motivos de cancelación, cierre incompleto de órdenes y solicitudes, eventos de historial y permisos específicos.

La migración `1720000035000-add-production-order-code.ts` agrega el código numérico único y autoincremental de la orden, asignando códigos correlativos a los registros existentes según su fecha de creación.

La migración `1720000036000-allow-multiple-stock-requests-per-date.ts` elimina la unicidad de `fecha_requerida` y agrega un índice por fecha y código. Cada solicitud continúa vinculada a una única orden; cuando la fecha ya tiene una orden principal, una solicitud adicional genera automáticamente una orden complementaria.

La migración `1720000023000-remove-user-product-line-scope.ts` elimina la tabla puente `usuarios_lineas_productivas`. Las líneas continúan clasificando productos y detalles de Producción, pero ya no se asignan a usuarios ni se utilizan para determinar el alcance operativo.

La migración `1720000031000-add-user-production-area-scope.ts` crea `usuarios_areas_produccion`, con clave primaria compuesta y claves foráneas en cascada hacia `usuarios` y `areas_produccion`. Para conservar el acceso al desplegar, los usuarios existentes con rol `PRODUCCION` reciben inicialmente todas las áreas activas. Desde ese momento el alcance operativo se configura por usuario. Los filtros operativos por línea se reemplazan por **Área de Producción** y **Categoría**.

## Reglas de integridad

- Una orden principal por fecha y órdenes complementarias para pedidos posteriores o solicitudes de abastecimiento adicionales de la misma fecha.
- Al aceptar una solicitud, su fecha requerida identifica los pedidos y cantidades de origen; la fecha de entrega de la orden puede modificarse y organiza el trabajo operativo.
- Una orden nueva requiere al menos un pedido confirmado o una solicitud de abastecimiento enviada.
- Un detalle por presentación dentro de la orden.
- La solicitud para stock sólo cambia en `BORRADOR` de Almacén; después de enviarla queda bloqueada.
- El ajuste por batch/capacidad sólo cambia con la orden en `BORRADOR` y el plan nunca queda por debajo del faltante más la solicitud para stock.
- Una fila sin pedidos sólo puede originarse en una solicitud de abastecimiento enviada; Producción no puede crear ni retirar productos manualmente.
- La emisión exige un área asignada a cada categoría incluida.
- Una categoría sólo puede pertenecer a un área; un área puede contener muchas categorías.
- Un usuario con rol `PRODUCCION` requiere al menos un área activa y puede tener varias.
- Un usuario de Producción no puede consultar ni modificar detalles pertenecientes a áreas no asignadas.
- Una entrega requiere un producto iniciado y no admite otra entrega pendiente del mismo detalle.
- Una diferencia final exige incidencia de Producción.
- Una diferencia de recepción exige observación de Almacén.
- Sólo la aceptación de Almacén modifica la existencia.
- El evento, auditoría, existencia y movimiento relacionados se guardan transaccionalmente.
- La fecha programada organiza y se muestra, pero nunca bloquea un inicio anticipado o demorado.
- Cancelar y cerrar incompleta exige motivo; una orden con recepción no puede cancelarse.
- `CERRADA` exige recibir el plan completo; todo faltante se resuelve mediante `CERRADA_INCOMPLETA`.

## Pruebas de aceptación

La planificación de Producción ahora separa `cantidad_solicitada_stock` del `ajuste_lote`. El plan final se valida como faltante de pedidos más solicitud comercial para stock más ajuste técnico de Producción. La evidencia se encuentra en `docs/pruebas-aceptacion-solicitudes-abastecimiento.md`.

La regresión histórica de esta iteración se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance:iteration3
```

La nueva suite `backend/scripts/production-plant.acceptance.mjs` valida:

- `CP-P01` / `CP-125`: configuración de un área con varias categorías y rechazo de una categoría ya asignada;
- `CP-126`: asignación obligatoria de una o varias áreas a usuarios de Producción;
- `CP-54`: visibilidad y ejecución restringidas a las áreas asignadas, sin utilizar líneas como alcance;
- `CP-P02`: generación de una orden sin pedidos desde una solicitud de stock enviada;
- `CP-P03`: inicio por producto y obligatoriedad de incidencia ante diferencias;
- `CP-P04`: la entrega de Producción todavía no modifica Almacén;
- `CP-P05`: recepción en la misma presentación y movimiento `INGRESO_PRODUCCION`;
- `CP-P06`: cierre automático cuando todos los productos terminan;
- `CP-P07`: trazabilidad de generación, emisión, inicio, entrega, recepción y cierre.

Se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance:production-flow
```

## Impacto por iteración

| Iteración | Modificación documentada |
| --- | --- |
| Primera: seguridad y auditoría | Se agregan permisos específicos y eventos auditados para áreas, ejecución, entrega y recepción. No se modifica autenticación. |
| Segunda: Productos, Almacén y pedidos | La reserva continúa siendo la fuente del faltante. Almacén recibe producción en la misma presentación mediante `INGRESO_PRODUCCION`. |
| Tercera: Producción | Se separan **Solicitud para stock** y **Ajuste por batch/capacidad**; se habilitan órdenes sin pedidos cuando existe solicitud comercial, áreas configurables, ejecución por producto, diferencias y doble validación. |
| Cuarta: preparación y distribución | Preparación usa las existencias ya aceptadas por Almacén y puede reducir la cantidad a entregar ante faltante de producción, conservando la diferencia y su observación. |
