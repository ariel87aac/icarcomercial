# Definición del flujo de pedido, disponibilidad y seguimiento

Fecha: 29 de octubre de 2026.

Estado: requisitos acordados y propuesta de implementación; no constituye evidencia de funcionalidades implementadas ni de pruebas ejecutadas. La documentación de todo desarrollo se mantiene en `docs`.

## Flujo acordado

```text
Borrador → Recibido → Aprobado
                         ↓
                 En preparación
                         ↓
              Disponible para preparar
                         ↓
                     Preparado → Asignado → En reparto → Entregado
```

- Aprobado corresponde al estado comercial actual `CONFIRMADO`.
- Confirmar reserva la cantidad completa solicitada y recalcula el saldo global: físico menos reservado. El saldo puede ser negativo.
- En preparación: falta cobertura física para al menos un producto del pedido; incluye espera de producción o reposición.
- Disponible para preparar: todos los detalles tienen cobertura completa. Un pedido con cobertura completa al aprobarse pasa directamente a esta etapa.
- Preparado: Almacén verificó y entregó el pedido a Distribución. El traspaso no descuenta inventario; se conserva el consumo en la salida o entrega directa en fábrica.
- Asignado: incorporado a una ruta con vehículo y responsables. No implica que el vehículo haya salido.
- En reparto: salida registrada.
- Entregado: recepción completa registrada. Se conservan resultados diferenciados para entrega parcial y no entregada, y la cancelación con motivo e historial.
- La entrega en fábrica conserva su recorrido propio sin simular asignación ni reparto.

## Disponibilidad y prioridad

La disponibilidad se registra por detalle de pedido: Pendiente de stock, Stock parcial o Disponible, mostrando solicitado, cubierto y faltante. Un saldo global igual a cero no impide que un pedido esté completamente cubierto.

La prioridad acordada es la fecha de creación del pedido: primero el más antiguo, entre pedidos confirmados con reservas activas. La fecha de entrega no determina esta prioridad. Las cantidades ya separadas por Almacén se conservan. Se propone desempatar fechas idénticas mediante un identificador estable; la implementación debe verificar el formato y unicidad del código antes de utilizarlo.

Las recepciones y cambios de inventario deben recalcular la cobertura por pedido sin asignar una misma unidad a dos pedidos. Debe revisarse también el efecto de confirmaciones, cancelaciones y liberaciones. El cambio de cobertura no debe sobrescribir las cantidades históricas usadas como fuentes de planes de Producción ya emitidos.

## Enlace de seguimiento

El cliente debe consultar todos los cambios de estado del pedido desde el borrador, con fecha y hora, estado actual e historial cronológico. El historial operativo se conserva independientemente de la existencia o renovación de un enlace público. El enlace protege el acceso y no expone información de otros clientes.

Durante el reparto se muestra el turno restante incluyendo el propio pedido:

```text
Turno actual = visitas anteriores sin resultado + 1
```

Ejemplo: en una ruta de cinco pedidos, el pedido en posición cuatro muestra «Tu pedido es la entrega número 4». Al resolver visitas anteriores avanza a 3, 2 y finalmente «Tu pedido es la próxima entrega». Se propone acompañar el turno con «Tienes 3 pedidos antes del tuyo» para evitar ambigüedad.

Una visita anterior resuelta como entregada, parcial o no entregada deja de contar como pendiente. Registrar una visita posterior no reduce el turno del pedido. El resultado del propio pedido reemplaza el indicador de turno. La página abierta debe actualizarse automáticamente; el mecanismo técnico queda pendiente de implementación.

La prioridad de stock por fecha de pedido es independiente de la secuencia física de visitas guardada en la ruta.

## Notificaciones WhatsApp solicitadas

| Momento | Contenido requerido |
| --- | --- |
| Generación del borrador | Detalle del pedido y solicitud de revisión y confirmación mediante enlace. |
| Confirmación del pedido | Constancia de confirmación, detalle confirmado y enlace de seguimiento. |
| Inicio del reparto | Aviso de que el pedido está en camino y enlace para consultar su turno. |
| Entrega registrada | Confirmación de entrega y opción para solicitar modificación o cambio de productos si no está conforme. |

La asignación se muestra en el historial; el mensaje «en camino» se dispara al registrar la salida, no al asignar una ruta. Esta es la interpretación operativa propuesta de «asignado cuando inicia la distribución».

Cada estado debe disponer de un check para decidir si envía WhatsApp. Desactivar el envío no suprime la transición ni su historial en el enlace. La preferencia es independiente de la plantilla del mensaje.

Implementación inicial: control global por los eventos existentes en Plantillas; persistencia mediante `1720000049000-add-notification-event-settings.ts`. Faltan eventos específicos para las nuevas etapas todavía no implementadas. El alcance y verificación están descritos en `iteracion-5.md`.

Cada actualización del turno debe reflejarse en el enlace; no se ha solicitado un WhatsApp por cada visita. Debe revisarse la política existente de mensajes de recibido, cambios relevantes y próxima entrega para que no agregue envíos automáticos fuera de estos momentos sin una decisión explícita. Se conservan idempotencia, cola, reintentos y trazabilidad de envío.

Una entrega parcial o fallida no debe generar un texto que afirme entrega completa.

## Solicitudes de modificación o cambio

El cliente debe tener una vía para solicitar cambios antes de confirmar y para solicitar modificación o cambio de productos por disconformidad después de recibirlos. La solicitud no modifica automáticamente el pedido confirmado, las existencias, una venta ni un cobro; requiere resolución comercial y trazabilidad.

Pendiente de definir: canal de solicitud (respuesta WhatsApp, formulario del enlace o ambos), responsables de atención, aprobación, resolución y efectos sobre devoluciones, reposición y documentos comerciales.

## Diferencias con la implementación revisada

- Pedidos conserva únicamente BORRADOR, RECIBIDO, CONFIRMADO y CANCELADO como estados comerciales.
- La preparación actual pasa a PREPARADA antes del traspaso; se debe alinear la etapa visible con la entrega a Distribución.
- No existe una asignación automática de recepciones a pedidos por antigüedad; la documentación anterior describe expresamente esta limitación.
- Seguimiento calcula visitas anteriores pendientes, pero falta presentar el turno incluyendo el propio pedido conforme al ejemplo acordado.
- El historial de seguimiento actual depende del enlace activo y no reúne el recorrido completo desde borrador.
- Deben revisarse las capturas de seguimiento por visita: su identificador de idempotencia debe permitir actualizar los pedidos restantes cada vez que se resuelve otra visita.
- Los estados públicos actuales no distinguen toda la nueva secuencia ni entrega parcial.

## Criterios de aceptación pendientes de ejecución

| Caso | Resultado esperado |
| --- | --- |
| Reserva superior al físico | Reserva completa, saldo negativo, faltante por detalle y pedido En preparación. |
| Cobertura exacta | Saldo global cero y pedido Disponible para preparar. |
| Dos pedidos con fechas diferentes | El más antiguo recibe primero la cobertura, aunque su entrega sea posterior. |
| Recepción insuficiente | No duplica cobertura y conserva el saldo pendiente del siguiente pedido. |
| Todos los productos cubiertos | Transición registrada a Disponible para preparar. |
| Traspaso a Distribución | Etapa Preparado sin descuento físico anticipado. |
| Ruta de cinco pedidos, posición cuatro | Turno 4 al salir; 3, 2 y próxima entrega al resolver visitas anteriores. |
| Visita anterior parcial o fallida | Reduce el turno restante sin afirmar entrega completa de esa visita. |
| Visita posterior resuelta | No reduce el turno del pedido anterior. |
| Seguimiento abierto | Refleja automáticamente cambios posteriores de turno y estado. |
| Renovación del enlace | Conserva el historial completo del pedido. |
| Eventos repetidos o reintentos | No duplican transiciones ni mensajes del mismo evento. |
| Asignación sin salida | Muestra Asignado y no envía todavía «en camino». |
| Salida y entrega | Envían los mensajes correspondientes con enlace y resultado correcto. |
| Disconformidad | Permite solicitar atención sin alterar automáticamente documentos ni inventario. |

## Documentación que deberá actualizarse al implementar

- `iteracion-2.md`: confirmación, reservas y cobertura por pedido.
- `iteracion-3.md`: impacto de las recepciones y compatibilidad con fuentes de Producción.
- `iteracion-4.md`: preparación, traspaso, asignación y resultados.
- `iteracion-5.md`: historial público, turno y política de WhatsApp.
- Pruebas específicas de Almacén, preparación/distribución, confirmación, seguimiento y entrega/retornos.
- `pruebas-aceptacion-consolidadas.md`: agregar resultados únicamente después de ejecutar las verificaciones correspondientes.

Las reglas anteriores incompatibles se actualizarán al implementar, distinguiendo siempre definición, implementación y evidencia verificada.
