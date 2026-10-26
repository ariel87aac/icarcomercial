# Pruebas de aceptación: requerimiento neto, solicitud para stock y ajuste técnico

## Objetivo

Verificar que la orden de Producción fabrique el faltante de los pedidos confirmados después de considerar la cantidad reservada en Almacén, incorpore la **Solicitud para stock** enviada por Comercial y permita a Producción registrar únicamente el **Ajuste por batch/capacidad**, sin modificar la demanda ni la solicitud.

## Regla de cálculo

```text
Pedidos = cantidad solicitada en la presentación
cubierto por Almacén = cantidad reservada en la presentación
faltante de Producción = Pedidos - cubierto por Almacén
plan de Producción = faltante de Producción + solicitud para stock + ajuste por batch/capacidad
diferencia = cantidad entregada por Producción - plan de Producción
```

La fuente del saldo de Almacén es la reserva concreta del detalle confirmado. No se consulta ni se descuenta nuevamente el disponible global durante la generación.

## Casos

| Caso | Precondición | Acción | Resultado esperado | Estado |
| --- | --- | --- | --- | --- |
| CP-122A | Pedido confirmado por 8 unidades; 3 quedaron reservadas y 5 pendientes | Generar consolidación | Demanda 8, cubierto por Almacén 3, faltante 5 y plan inicial 5 | Automatizada |
| CP-122B | Dos pedidos del mismo producto con presentaciones y factores distintos | Generar consolidación | Cada solicitado, reservado y pendiente se convierte antes de sumar | Automatizada |
| CP-122C | Pedido totalmente cubierto por reserva | Generar consolidación | El producto queda trazable con faltante y plan iguales a cero; no admite avances | Automatizada por reglas de servicio |
| CP-123A | Orden en Borrador con faltante 8 y batch de 10 | Registrar ajuste técnico de 2 | Faltante permanece 8, ajuste queda 2 y plan queda 10 | Automatizada |
| CP-123B | Faltante más solicitud para stock igual a 8 | Intentar guardar un plan 7 | La API responde 422 y no modifica el detalle | Automatizada |
| CP-123C | Usuario de Producción con áreas asignadas | Abrir un Borrador y registrar ajuste técnico | Sólo consulta y trabaja con productos de sus áreas | Automatizada y visual |
| CP-123D | Usuario de Gerencia | Intentar registrar ajuste técnico | La API responde 403 y registra el acceso denegado | Automatizada |
| CP-124A | Plan manual 10 con faltante 8 | Recalcular el Borrador sin cambiar demanda | Conserva plan 10 y ajuste 2 | Automatizada |
| CP-124B | Plan manual 10; el nuevo faltante supera 10 | Recalcular | El plan sube al nuevo faltante y el ajuste queda cero | Regla implementada |
| CP-124C | Consolidación Emitida | Intentar ajustar el plan | La API responde 409; la versión emitida permanece inmutable | Automatizada |
| CP-124D | Plan 10 y producción acumulada 10 | Registrar avances y cerrar | Pendiente y diferencia quedan cero; el cierre no exige observación | Cubierta por regresión |

## Revisión visual

1. Ingresar con un usuario `PRODUCCION` o `COMERCIALIZACION` que posea `production.plan.adjust`.
2. Abrir **Producción → Planificación** y consultar un Borrador.
3. Comprobar las columnas: Pedidos, Cubierto, Faltante, Solicitud para stock, Ajuste técnico, Plan, Producido, Recibido y Etapa.
4. Abrir **Pedidos de origen** y verificar solicitado, reservado, pendiente, factor y los tres aportes en unidad base.
5. Pulsar **Ajustar lote**, indicar el ajuste por batch/capacidad y revisar el plan resultante.
6. Guardar y comprobar el evento `PRODUCCION_ADICIONAL` en el historial.
7. Emitir la versión y verificar que desaparezca la acción de ajuste.

## Evidencia automatizada

```bash
docker compose exec -T backend npm test
docker compose exec -T backend npm run test:acceptance:iteration3
```

La suite debe finalizar con 10 pruebas unitarias y 25 comprobaciones de aceptación superadas. El build Docker debe completar backend y frontend y los tres servicios deben quedar saludables.

## Integración posterior

La planificación se conserva por presentación. Producción entrega esa misma presentación y Almacén la acepta antes de crear el movimiento `INGRESO_PRODUCCION`; por tanto, ya no existe una asignación ambigua del excedente ni un ingreso manual separado.
