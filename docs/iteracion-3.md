# Tercera iteración: consolidación para Producción

## Alcance

La tercera iteración transforma detalles de pedidos `CONFIRMADO` en requerimientos consolidados para Producción. La agrupación se realiza por fecha de entrega, línea productiva, producto y unidad base. Cada cantidad solicitada se convierte mediante el factor de su presentación y conserva la relación con el detalle de pedido que la originó.

La consolidación se genera en estado `BORRADOR`, puede recalcularse de forma idempotente y, al emitirse, queda inmutable. Los pedidos confirmados después de una emisión se incorporan mediante una versión `COMPLEMENTARIA`. Producción registra avances acumulativos y cierra el requerimiento conservando la diferencia final.

Esta iteración no separa pedidos individuales, no descuenta inventario físico y no implementa empaque, despacho, vehículos, rutas, fórmulas, materias primas, lotes, maquinaria, calidad ni predicción de demanda.

## Historias cubiertas

| Historia | Evidencia funcional |
| --- | --- |
| HU-17 | Generación de consolidaciones desde pedidos Confirmados por fecha de entrega. |
| HU-18 | Conversión y agrupación por línea, producto y unidad base. |
| HU-19 | Trazabilidad de cada total hasta sus detalles de pedido de origen. |
| HU-20 | Recálculo idempotente del Borrador y emisión de una versión inmutable. |
| HU-21 | Generación de versiones complementarias para confirmaciones posteriores. |
| HU-22 | Registro acumulativo de avances, pendiente y diferencia. |
| HU-23 | Cierre con historial, responsable, fecha y observación cuando existe diferencia. |

## Estados y cálculos

El flujo permitido es:

```text
BORRADOR → EMITIDA → EN_PROCESO → CERRADA
```

El primer avance válido cambia `EMITIDA` a `EN_PROCESO`. Los avances posteriores se acumulan en la cantidad preparada. La diferencia se calcula como:

```text
diferencia = cantidad preparada - cantidad solicitada
```

- Un valor negativo representa faltante.
- Cero representa cumplimiento exacto.
- Un valor positivo representa excedente.
- El cierre con una diferencia distinta de cero exige observación.

La precisión decimal se configura en la unidad base entre 0 y 6 decimales y se aplica a conversión, acumulación y diferencia.

## Matriz de permisos

| Rol | Consolidación | Trazabilidad y resumen | Avances y cierre |
| --- | --- | --- | --- |
| `ADMINISTRADOR` | Según permisos asignados | Según permisos asignados | Según permisos asignados |
| `COMERCIALIZACION` | Genera, recalcula, emite y consulta | Consulta fuentes, historial y resumen | Sin acceso |
| `PRODUCCION` | Consulta versiones emitidas de sus líneas autorizadas | Consulta fuentes, requerimientos, historial y resumen según alcance | Registra avances y cierra |
| `GERENCIA` | Consulta | Consulta de solo lectura | Sin acceso |

Los permisos incorporados son:

- `production.consolidations.read`
- `production.consolidations.create`
- `production.consolidations.edit`
- `production.consolidations.emit`
- `production.traceability.read`
- `production.requirements.read`
- `production.progress.create`
- `production.close`
- `production.history.read`
- `production.summary.read`

Cuando un usuario tiene líneas productivas asignadas, las consultas, fuentes, avances y cierres se limitan a esas líneas. Una solicitud explícita sobre una línea no autorizada responde `403`.

## Rutas de la API

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/production-consolidations` | Consulta consolidaciones con filtros y paginación. |
| `POST` | `/api/production-consolidations` | Genera la consolidación principal en Borrador. |
| `GET` | `/api/production-consolidations/:id` | Consulta detalle, fuentes visibles y avances. |
| `POST` | `/api/production-consolidations/:id/recalculate` | Recalcula un Borrador. |
| `POST` | `/api/production-consolidations/:id/emit` | Emite y congela la versión. |
| `POST` | `/api/production-consolidations/complementary` | Genera un Borrador complementario. |
| `GET` | `/api/production-consolidations/:id/sources` | Consulta pedidos y aportes de origen. |
| `GET` | `/api/production-requirements` | Consulta requerimientos emitidos por fecha y línea. |
| `POST` | `/api/production-consolidations/:id/progress` | Registra un avance acumulativo. |
| `POST` | `/api/production-consolidations/:id/close` | Cierra el requerimiento. |
| `GET` | `/api/production-consolidations/:id/history` | Consulta la secuencia de eventos y estados. |
| `GET` | `/api/production-summary` | Consulta el resumen por fecha, versión, línea y producto. |

La API utiliza respuestas controladas `400`, `401`, `403`, `404`, `409` y `422` para validación, autenticación, autorización, inexistencia, conflicto de estado e integridad de negocio.

## Persistencia

La migración `1720000004000-create-iteration-three.ts` agrega la precisión decimal a `unidades_medida`, el alcance opcional `usuarios_lineas_productivas` y crea:

- `consolidaciones_produccion`
- `consolidaciones_detalle`
- `consolidaciones_origen`
- `registros_avance_produccion`
- `consolidaciones_historial`

Las fuentes mantienen claves foráneas con `pedidos_detalle` y `presentaciones_producto`. Los detalles se relacionan con `productos`, `lineas_productivas` y `unidades_medida`. Los usuarios responsables se conservan en generación, emisión, avances, cierre e historial.

## Integridad y concurrencia

La generación, recálculo, emisión, avance y cierre se ejecutan en transacciones. Un bloqueo transaccional por fecha evita crear dos versiones principales o asignar dos veces un detalle de pedido. La restricción única sobre la fuente impide que el mismo detalle confirmado pertenezca a más de una versión.

La emisión vuelve a comprobar que:

1. La versión continúe en Borrador.
2. Existan detalles y fuentes.
3. Cada fuente corresponda a un pedido Confirmado de la fecha indicada.
4. El factor sea válido.
5. El aporte convertido coincida con cantidad por factor.
6. La suma de aportes coincida con el total consolidado.

El evento de auditoría y el historial forman parte de la misma transacción. Si cualquiera falla, se revierten todos los cambios.

## Pruebas

Las pruebas unitarias cubren conversión a unidad base, precisión decimal, acumulación, pendiente y diferencia.

La suite `backend/scripts/iteration-three.acceptance.mjs` ejecuta CP-33 a CP-54: agrupación, separación por fecha y línea, conversión, trazabilidad, factor inválido, idempotencia, concurrencia, inmutabilidad, complementarias, avances, faltante, cumplimiento, excedente, historial, permisos, reversión transaccional, resumen y alcance por línea.

Con el stack en ejecución:

```bash
docker compose exec backend npm run test:acceptance:iteration3
```
