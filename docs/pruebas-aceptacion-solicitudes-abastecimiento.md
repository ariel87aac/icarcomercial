# Modificación y pruebas de aceptación: solicitudes de abastecimiento

## Objetivo

Separar la cantidad adicional solicitada por el área Comercial para mantener stock del ajuste técnico que Producción realiza por batch o capacidad de planta.

## Flujo implementado

1. Comercial crea en **Almacén → Solicitudes de abastecimiento** una o varias solicitudes para una fecha requerida. Cada Borrador recibe automáticamente el siguiente código numérico correlativo, comenzando en 1.
2. El sistema muestra existencias físicas, reservas y el **Disponible**, sin exponer columnas independientes de demanda o faltante. La confirmación compromete toda la cantidad pedida, por lo que `Disponible = físico - reservado` puede ser negativo. Ese resultado se presenta en rojo y sirve como referencia para Comercial.
3. Comercial registra únicamente **Adicional para stock**, guarda el Borrador y lo envía. El sistema también conserva con valor cero una presentación cuyo Disponible es negativo y cuyo faltante corresponde a pedidos de la fecha seleccionada, porque ese faltante ya forma parte automática del requerimiento de Producción.
4. Al enviar, las cantidades y sus snapshots quedan bloqueados.
5. Producción genera cada orden desde **Solicitudes pendientes**. La primera solicitud de la fecha origina la orden principal y las siguientes generan órdenes complementarias independientes, incluso cuando una orden anterior de esa fecha ya fue emitida o cerrada; cada solicitud cambia a `PROGRAMADA` y conserva su vínculo propio.
6. Producción puede agregar un **Ajuste por batch/capacidad**, independiente de la solicitud comercial.
7. El plan se valida como `faltante de pedidos + solicitud para stock + ajuste técnico`.
8. Cuando la orden termina y Almacén recibe todos los productos, la solicitud cambia a `CERRADA`.
9. Si Producción cancela la orden o la cierra con faltantes, la solicitud cambia a `CERRADA_INCOMPLETA`; conserva quién cerró, la fecha y la observación obligatoria.

## Relaciones y restricciones

- Una solicitud pertenece a una fecha requerida y tiene muchos detalles.
- Varias solicitudes pueden compartir la misma fecha requerida sin compartir código, detalles ni orden vinculada.
- Una presentación aparece una sola vez dentro de la solicitud.
- El guardado reemplaza el contenido del Borrador y evita conservar filas ocultas o cantidades antiguas.
- Una solicitud sólo puede vincularse a una orden de Producción.
- Cada detalle consolidado conserva, cuando corresponde, el detalle de solicitud que originó la cantidad para stock.
- Una categoría sólo puede pertenecer a un área de Producción.
- Una solicitud enviada no puede modificarse. Una nueva solicitud para una fecha que ya tiene Producción se procesa posteriormente como una orden complementaria independiente, sin alterar las órdenes anteriores.

## Casos de aceptación

| Código | Resultado esperado |
| --- | --- |
| SA-01 | Se crean varios Borradores para la misma fecha con códigos numéricos consecutivos e identificadores independientes. |
| SA-02 | El Disponible proyectado y el área se calculan desde sus tablas de origen; un saldo negativo permanece negativo y se identifica en rojo. |
| SA-03 | Guardar actualiza o retira cantidades; enviar las bloquea. |
| SA-04 | Cada solicitud de la misma fecha genera su propia orden y conserva sus cantidades sin mezclarlas con otra solicitud. |
| SA-05 | El ajuste técnico no modifica la solicitud comercial ni el faltante. |
| SA-06 | La generación directa por fecha exige seleccionar la solicitud cuando hay más de una enviada; desde **Solicitudes pendientes** cada una puede procesarse sin ambigüedad. |
| SA-07 | Los roles Comercial y Administrador editan; Almacén sólo consulta. |
| SA-08 | En un Borrador, **Guardar borrador** y **Enviar a Producción** permanecen visibles en el encabezado; no se repiten al final de la tabla y se adaptan a pantallas pequeñas. |
| SA-09 | Una solicitud `ENVIADA` aparece en la bandeja de Producción y desde allí genera su orden para la misma fecha requerida. |
| SA-10 | Cancelar o cerrar incompleta la orden actualiza la solicitud a `CERRADA_INCOMPLETA` con motivo trazable. |
| SA-11 | Los códigos existentes se normalizan desde 1 por orden de creación; una nueva solicitud recibe el valor máximo más uno, sin colisiones concurrentes. |
| SA-12 | La tabla no muestra Demanda confirmada ni Faltante por cubrir; Disponible es el único indicador de déficit visible. |
| SA-13 | Cuando existen disponibilidades negativas, Almacén muestra una alerta y permite abrir directamente la creación de una solicitud. |
| SA-14 | Un pedido de 200 con físico 170 genera 30 de faltante automático; una solicitud con `Para stock = 0` no duplica ese faltante y la orden de Producción conserva un total base de 30. |
| SA-15 | Aunque para la fecha exista una orden emitida o cerrada, Comercial puede crear y enviar otra solicitud; Producción la recibe pendiente y genera una orden complementaria independiente. |

## Evidencia automatizada

```bash
docker compose exec -T backend npm run test:acceptance:stock-requests
```

La prueba automatizada crea dos solicitudes para la misma fecha, verifica que sus códigos sean enteros positivos y consecutivos, el flujo Borrador → Enviada → Programada, sus órdenes principal y complementaria, las cantidades separadas y la eliminación de los datos temporales.
