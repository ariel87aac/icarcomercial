# Pruebas de aceptación: módulo Almacén

## Objetivo

Verificar que el módulo antes identificado como **Inventario** se presente como **Almacén** y que su sección **Existencias** permita reconocer rápidamente los productos con saldo físico.

## Cambio realizado

- El menú lateral y el encabezado principal se renombran a **Almacén**.
- Las opciones internas **Existencias**, **Movimientos** y **Reservas** se conservan.
- **Recepciones** se incorpora en Almacén y se retira de Producción, porque Almacén es responsable de verificar y aceptar el ingreso físico.
- **Existencias** utiliza una tabla cuya primera columna es el código de producto, seguida por categoría, línea, producto, presentación, cantidad física, reservada, disponible, faltante y estado.
- La columna de imagen se retira para aprovechar mejor el ancho de la tabla.
- En la parte superior se incorporan filtros combinables por categoría y línea, además del buscador existente.
- La tabla consulta registros con cantidad física o reservada; así un producto sin físico pero con compromisos pendientes continúa visible.
- Cuando el total reservado supera al físico, Disponible conserva el valor negativo, **Faltante** muestra explícitamente la cantidad no cubierta, la fila se identifica en rojo y aparece una alerta superior con acceso directo a **Crear solicitud**. La pestaña Existencias conserva además un contador rojo mientras exista algún faltante.
- El servidor ordena los registros por código de producto de menor a mayor y, cuando un producto tiene varias presentaciones, por descripción.
- El buscador admite código, nombre del producto o presentación y actualiza la tabla automáticamente mientras se escribe.
- En el detalle de una solicitud, el filtro **Solo negativos** limita la tabla a productos cuyo Disponible sea menor que cero. **Ver todos** restablece la lista sin perder cantidades u observaciones ingresadas.

## Casos de aceptación

| Caso | Condición | Acción | Resultado esperado | Tipo |
| --- | --- | --- | --- | --- |
| CP-121A | Existen presentaciones sin físico y sin reservas, y otras con físico o compromisos | Abrir **Almacén → Existencias** | Se ocultan únicamente las presentaciones sin físico ni reservas | Automatizada |
| CP-121B | Un producto tiene saldo físico positivo | Consultar la tabla | La primera columna muestra su código y no existe una columna de imagen | Automatizada y visual |
| CP-121C | Existen productos con códigos diferentes | Revisar el orden de las filas | Los códigos aparecen numéricamente de menor a mayor | Automatizada y visual |
| CP-121D | Usuario sin permiso `inventory.read` | Revisar el menú | La opción **Almacén** no se muestra | Visual |
| CP-121E | Existen saldos de distintas categorías y líneas | Seleccionar categoría y línea | La tabla devuelve únicamente registros que cumplen ambos filtros | Automatizada y visual |
| CP-121F | Existen productos visibles | Escribir parte del código, nombre o presentación | La tabla se actualiza automáticamente sin presionar un botón y conserva categoría y línea | Visual |
| CP-121G | Producción envió una entrega parcial o final | Abrir **Almacén → Recepciones** | La entrega pendiente muestra área, producto, presentación, cantidad, tipo, responsable y fecha | Automatizada y visual |
| CP-121H | El responsable tiene permiso de aceptación | Verificar la cantidad y presionar **Aceptar e ingresar** | Se registra la recepción, desaparece de pendientes y se actualizan existencias y movimientos | Automatizada y visual |
| CP-121I | Se abre el módulo Producción | Revisar sus opciones internas | No existe una pestaña **Recepciones** | Visual |
| CP-121J | Ya existe una solicitud para una fecha requerida | Crear otra solicitud con la misma fecha | Se crea un nuevo Borrador con código propio, sin conflicto por fecha | Automatizada y visual |
| CP-121K | Hay dos solicitudes enviadas para la misma fecha | Generarlas desde **Solicitudes pendientes** | Cada solicitud se vincula a una orden independiente y sus cantidades no se mezclan | Automatizada |
| CP-121L | Existen solicitudes con códigos discontinuos | Aplicar la migración y crear dos solicitudes | Los registros quedan numerados desde 1 por orden de creación y los nuevos códigos son enteros positivos consecutivos | Automatizada |
| CP-121M | Existen pedidos confirmados no cubiertos para la fecha requerida | Abrir el detalle de una solicitud | No aparecen columnas de Demanda ni Faltante; Disponible conserva el saldo proyectado negativo y lo muestra en rojo | Automatizada y visual |
| CP-121N | Existen productos en una solicitud de abastecimiento | Revisar la tabla en escritorio y pantalla estrecha | La primera columna muestra el ID numérico del producto y las columnas usan anchos compactos sin ocultar cantidades ni controles | Visual |
| CP-121O | Un pedido reserva 200 unidades y el producto tiene 170 físicas | Abrir **Almacén → Existencias** | Reservado muestra 200, Disponible muestra −30, Faltante muestra 30, la pestaña tiene contador rojo y aparece **Se requiere abastecimiento** con acceso a una nueva solicitud | Automatizada y visual |
| CP-121P | Al confirmar un pedido queda cantidad sin cobertura física | Confirmar desde **Pedidos** | Aparece una alerta inmediata con la cantidad no cubierta y Almacén mantiene la alerta persistente mientras exista Disponible negativo | Visual |
| CP-121Q | La fecha ya tiene una solicitud y una orden de Producción emitida o cerrada | Crear y enviar otra solicitud para la misma fecha | La nueva solicitud se registra con otro código y queda disponible para generar una orden complementaria, sin modificar la anterior | Automatizada y visual |
| CP-121R | Una solicitud contiene productos con Disponible positivo, cero y negativo | Presionar **Solo negativos** y luego **Ver todos** | Primero se muestran únicamente los productos con Disponible menor que cero; al restaurar se recupera la lista y se conservan cantidades y observaciones editadas | Visual |

## Guion de verificación visual

1. Iniciar sesión con un usuario que tenga `inventory.read`.
2. Confirmar que el menú lateral muestre **Almacén** y no **Inventario**.
3. Ingresar a **Almacén** y comprobar que el encabezado use el mismo nombre.
4. Abrir **Existencias** y comprobar que la información se muestre en una tabla.
5. Verificar las columnas Código producto, Categoría, Línea, Producto, Presentación, Físico, Reservado, Disponible, Faltante y Estado; no debe existir Imagen.
6. Confirmar que no aparezcan productos sin cantidad física ni reservada; una reserva sin físico debe permanecer visible.
7. Revisar que la primera columna esté ordenada numéricamente de menor a mayor.
8. Seleccionar una categoría y una línea y comprobar que ambos filtros se apliquen de forma combinada.
9. Escribir parte de un código, nombre o presentación y comprobar que la tabla se actualice automáticamente sin perder los filtros.
10. Abrir **Recepciones** y comprobar que sólo muestre entregas pendientes enviadas por Producción.
11. Abrir una recepción, verificar que la cantidad declarada se precargue y cancelar sin guardar.
12. Abrir **Movimientos** y **Reservas** para confirmar que continúan funcionando dentro de Almacén.
13. Registrar un ingreso para una presentación sin saldo y comprobar que aparezca en la tabla después de guardarlo.
14. Abrir **Solicitudes de abastecimiento** y comprobar que la primera columna muestre solamente el código numérico correlativo.
15. Abrir una solicitud y comprobar que no existan columnas de Demanda ni Faltante; un Disponible negativo debe conservar el signo y mostrarse en rojo.
16. Comprobar que **ID producto** sea la primera columna y que producto, clasificación, cantidades y observación conserven un ancho legible y compacto.
17. Confirmar un pedido mayor al físico y comprobar que Disponible sea negativo, Faltante muestre la diferencia positiva, el estado indique **Requiere abastecimiento**, la pestaña muestre un contador rojo y la alerta permita abrir una nueva solicitud.
18. Abrir el detalle de una solicitud, presionar **Solo negativos** y comprobar que todas las filas visibles tengan Disponible menor que cero; presionar **Ver todos** y verificar que reaparezcan las demás filas sin perder ediciones.

## Ejecución automatizada

```bash
docker compose exec -T backend npm run test:acceptance:iteration2
```

La comprobación CP-121 valida que `onlyWithStock=true` excluya únicamente registros sin físico ni reservas, que los códigos estén ordenados de menor a mayor, que las opciones de categoría y línea provengan de existencias reales y que ambos filtros puedan combinarse. CP-121O verifica la reserva total, el Disponible negativo y el contador global de alertas.

## Criterio de aprobación

El cambio se acepta cuando CP-121A a CP-121F cumplen su resultado esperado, backend y frontend compilan sin errores y los servicios Docker permanecen saludables.

## Actualización: flujo unificado de pedidos — 29 de octubre de 2026

La prioridad por fecha de creación, cobertura por detalle, preparación completa, traspaso, historial desde borrador, turno dinámico y checks por estado se documentan en [Implementación del flujo unificado](./implementacion-flujo-unificado-pedidos.md). La evidencia ejecutada y las reglas que sustituyen los casos anteriores están en [Pruebas del flujo unificado](./pruebas-aceptacion-flujo-unificado-pedidos.md).
