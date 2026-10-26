# Pruebas de aceptación: capacidad de vehículos y carga de rutas

## Modificación registrada

Este ajuste corresponde a la cuarta iteración, **Preparación, despacho y distribución**, e integra un dato adicional de la segunda iteración en las presentaciones de producto.

- En **Productos**, cada presentación registra su peso en kg.
- En **Preparación y distribución > Vehículos**, la capacidad máxima en kg es obligatoria.
- En **Rutas**, el sistema calcula la carga total, informa si existe excedente y permite cambiar el vehículo mientras la ruta está en Borrador.
- La ruta no puede planificarse ni registrar salida si supera la capacidad o si falta el peso de una presentación.

## Criterio de cálculo

```text
peso del detalle = cantidad preparada × peso en kg de la presentación
carga total       = suma de los pesos de todos los detalles de la ruta
excedente         = máximo(0, carga total − capacidad máxima del vehículo)
```

El cálculo usa la cantidad efectivamente preparada para despacho, no la cantidad originalmente solicitada.

## Casos incorporados

| Código | Condición | Resultado esperado |
| --- | --- | --- |
| CP-62 | Registrar un vehículo sin capacidad. | HTTP 400; no se crea el vehículo. |
| CP-63 | Asignar una preparación de 10 unidades, con 2 kg por presentación, a un vehículo de 15 kg. | La ruta informa 20 kg de carga, 15 kg de capacidad y 5 kg de excedente. |
| CP-65 | Intentar planificar la ruta con 5 kg de excedente. | HTTP 422; la ruta continúa en Borrador y solicita cambiar el vehículo. |
| CP-68 | Cambiar en Borrador a un vehículo de 30 kg. | La ruta queda dentro de capacidad y registra `CAMBIO_VEHICULO` en el historial. |

## Comprobaciones de interfaz

1. El formulario **Registrar vehículo** solicita placa, descripción y **Capacidad máxima (kg)**.
2. La tabla de vehículos muestra la capacidad con la unidad `kg`.
3. La tabla y el detalle de rutas muestran `carga / capacidad`.
4. Un excedente se presenta con alerta roja, peso excedido y la indicación de cambiar el vehículo.
5. El selector de reemplazo anticipa el margen disponible o el nuevo excedente.
6. **Planificar ruta** queda deshabilitado si existe excedente o falta el peso de alguna presentación.

## Evidencia ejecutada

```bash
docker compose exec backend npm run test:acceptance:iteration4
```

Resultado: **20 comprobaciones superadas**, incluidos CP-62, CP-63, CP-65 y CP-68. También se ejecutaron sin regresiones las 32 comprobaciones de la segunda iteración, las 25 de la tercera iteración, las 7 del flujo Producción–Almacén, las 10 pruebas unitarias y las compilaciones de backend y frontend.
