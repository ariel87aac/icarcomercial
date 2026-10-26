# Prueba de aceptación: precios por tipo de cliente

## Objetivo

Verificar la eliminación de la lista comercial, la existencia de los cuatro tipos de cliente y la edición confirmada de precios desde una sola tabla.

## Casos

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| PRE-01 | Abrir el alta o edición de un cliente | Sólo se puede elegir Público, Minorista, Distribuidor o Mayorista; no aparece Lista comercial. |
| PRE-02 | Abrir **Productos → Precios** | La tabla muestra Cod-Producto, Producto/Presentación, Público, Minorista, Distribuidor, Mayorista y Última Modificación, en ese orden. |
| PRE-03 | Cambiar uno o más importes sin pulsar **Actualizar** | Las celdas modificadas se distinguen visualmente y todavía no se escribe en la base de datos. |
| PRE-04 | Pulsar **Actualizar** y luego **Cancelar** | El modal se cierra y no se envía la actualización. |
| PRE-05 | Pulsar **Actualizar** y luego **Aceptar** | Todos los importes modificados se guardan en una sola operación y la tabla se recarga con la fecha de modificación. |
| PRE-06 | Consultar el catálogo con un cliente de cada tipo | Cada cliente recibe exclusivamente el precio vigente de su tipo. |
| PRE-07 | Consultar auditoría después de aceptar | Existe un evento `ACTUALIZAR_PRECIOS_MASIVO` con la cantidad de precios y presentaciones afectadas. |
| PRE-08 | Escribir parte del código o nombre en el buscador de precios | La tabla se filtra dinámicamente, sin pulsar otro botón y sin perder cambios de precios pendientes. |
| PRE-09 | Pulsar las flechas de incremento o disminución de cualquier precio | El importe cambia exactamente en Bs 1 por cada pulsación; el control no realiza incrementos decimales. |
| PRE-10 | Seleccionar una categoría en el filtro de precios | La tabla muestra únicamente productos pertenecientes a esa categoría; el filtro puede combinarse con el buscador y limpiarse para volver a mostrar todas las categorías. |

## Verificación automatizada

El caso `PRICE-MATRIX-01` de `backend/scripts/iteration-two.acceptance.mjs` valida la matriz, su categoría, sus cuatro valores, la operación masiva y su persistencia. Los casos PRE-01 a PRE-05 y PRE-08 a PRE-10 incluyen además la inspección manual de la interfaz y del modal.

```bash
docker compose exec -T backend npm run test:acceptance:iteration2
```
