# Pruebas de aceptación: flujo unificado de pedidos

Fecha: 29 de octubre de 2026.

## Entorno y alcance

Se utilizó una copia aislada de la base local denominada `icar_workflow_validation`, con las migraciones 1720000049000 y 1720000050000 aplicadas. El backend de prueba se expuso únicamente en 127.0.0.1:3001 y la interfaz de prueba en 127.0.0.1:8081. El trabajador estuvo desactivado con `NOTIFICATION_WORKER_ENABLED=false`. La prueba exige ambos valores para evitar ejecutarse accidentalmente en la base operativa.

Los mensajes se encolaron y sus contenidos se verificaron; no se contactó al proveedor de WhatsApp. Se comprobó que los pedidos de prueba no tienen intentos de envío.

## Matriz ejecutada

Fuente: `backend/scripts/order-workflow.acceptance.mjs`. Los 22 casos siguientes resultaron aprobados:

| Caso | Comprobación |
| --- | --- |
| WF-01 | El borrador genera enlace protegido e historial; compatibilidad de enlace anterior sin token cifrado. |
| WF-02 | Confirmar reserva toda la demanda y refleja saldo negativo. |
| WF-03 | La fecha de creación prevalece sobre el orden de confirmación: cobertura 10 y 5 al ingresar 15 para dos pedidos de 10. |
| WF-04 | Se rechaza confirmar preparación parcial o sin cobertura por prioridad. |
| WF-05 | El saldo global cero habilita pedidos completamente cubiertos. |
| WF-06 | Preparado se registra al traspasar a Distribución, conservando el físico. |
| WF-07 | Asignar una ruta no genera el mensaje de salida. |
| WF-08 | El cuarto pedido de una ruta de cinco muestra turno cuatro al salir. |
| WF-09 | Resolver el quinto pedido no altera el turno del cuarto. |
| WF-10 | Visitas anteriores entregadas, parciales y fallidas actualizan 4 → 3 → 2 → 1. |
| WF-11 | El historial incluye borrador, recibido, aprobado, preparación, disponibilidad, preparado, asignado, reparto y entregado. |
| WF-12 | Renovar conserva el historial e invalida el enlace anterior. |
| WF-13 | Solicitud, deduplicación y resolución comercial sin alterar el estado de entrega. |
| WF-14 | Borrador, confirmado, reparto y entregado generan un mensaje único con enlace; el último incluye solicitud de cambio. |
| WF-15 | Desmarcar borrador impide el mensaje y conserva seguimiento; crear plantillas no reactiva el check. |
| WF-16 | No existen intentos de WhatsApp real para los pedidos de prueba. |
| WF-17 | Confirmar tardíamente un pedido más antiguo respeta las unidades ya separadas para otro pedido. |
| WF-18 | Cancelar preparación y cancelar pedido redistribuyen cobertura conservando la reserva o liberándola según corresponde. |
| WF-19 | Un pedido de varios productos solo queda disponible al cubrir todas sus líneas. |
| WF-20 | Habilitar Disponible para preparar no envía retroactivamente un cambio ocurrido con el check desmarcado. |
| WF-21 | Marcar Preparado habilita su mensaje específico al entregar a Distribución. |
| WF-22 | Asignado conserva etapa e historial sin mensaje si estaba desmarcado al asignarse. |

## Regresiones ejecutadas

| Suite | Resultado |
| --- | --- |
| Pruebas unitarias backend (`npm test`) | 21 aprobadas, 8 archivos. |
| Segunda iteración: pedidos, reservas e inventario | 47 comprobaciones aprobadas. |
| Cuarta iteración: preparación, reparto, fábrica, ventas y retornos | 46 comprobaciones aprobadas. |
| Producción en planta y recepción en Almacén | 11 comprobaciones aprobadas. |
| Quinta iteración: acceso protegido, enlaces, permisos y canal | 9 comprobaciones aprobadas. |
| Flujo unificado | 22 comprobaciones aprobadas. |

La prueba anterior que confirmaba una preparación reducida por falta de stock se actualizó: debe rechazarla, recibir el faltante y confirmar la cantidad completa. La entrega parcial al cliente y la entrega parcial en fábrica continúan cubiertas por la regresión. El fixture de seguimiento se corrigió para generar el código numérico del pedido mediante la secuencia vigente.

## Compilación y revisión visual

- Backend: compilación aprobada.
- Frontend: compilación de producción Docker aprobada y compilador Angular sin errores. Se mantienen advertencias de presupuesto de tamaño del bundle y de estilos existentes.
- Seguimiento público: revisión visual en una ventana de 488 px, verificando el historial completo y el formulario de modificación/cambio sin desbordamientos.
- El refresco automático está implementado cada 10 segundos. El avance de turnos se verificó mediante consultas reales a la API tras cada visita; no se realizó una prueba visual cronometrada de cada avance.

No se realizó una entrega real ni una prueba de envío al proveedor. Para comprobar la recepción efectiva de WhatsApp debe utilizarse el diagnóstico explícito del canal con un destinatario autorizado.

## Repetición segura

Crear una copia aislada de la base, aplicar las migraciones y levantar el backend con:

```text
DATABASE_NAME=icar_workflow_validation
NOTIFICATION_WORKER_ENABLED=false
ACCEPTANCE_BASE_URL=http://127.0.0.1:3000
PUBLIC_TRACKING_RATE_LIMIT=1000
```

Ejecutar dentro del contenedor aislado:

```bash
node scripts/order-workflow.acceptance.mjs
```

La suite genera fixtures y cambia preferencias únicamente en esa copia. Al terminar la validación se eliminan los contenedores y la base aislada completos. No ejecutar las regresiones de aceptación sobre datos operativos para reproducir esta evidencia.

## Actualización del entorno local

Las migraciones `AddNotificationEventSettings1720000049000` y `UnifyOrderWorkflow1720000050000` quedaron aplicadas en la base local. Backend, frontend y database finalizaron saludables. Se verificó que no quedaron notificaciones operativas retroactivas pendientes después de la migración.

La copia de seguridad anterior a las migraciones se conserva en `/tmp/icar-before-order-workflow-20261029.dump`, con permisos 600, y en el contenedor de base de datos. El archivo del host es temporal y debe trasladarse a almacenamiento de respaldos si se necesita conservación prolongada.

Los contenedores, la base y el volcado de validación se eliminaron al finalizar. Los datos de prueba no se incorporaron a la base operativa.
