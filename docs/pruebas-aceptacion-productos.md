# Prueba de aceptación: identificación del módulo Productos

## Objetivo

Verificar que el módulo administrativo de productos y configuración se identifique de forma clara como **Productos**, sin modificar su ruta, permisos ni funciones.

## Cambio realizado

- La opción **Catálogo y precios** del menú lateral se renombra a **Productos**.
- El título principal de la pantalla se renombra a **Productos**.
- El contexto del encabezado se muestra como **Productos y configuración**.
- Se conservan las opciones internas **Productos**, **Categorías**, **Líneas**, **Unidades** y **Precios**; esta última utiliza la tabla unificada por tipo de cliente.
- Se conserva el identificador interno `catalog-admin` y el permiso `catalog.manage`; no se modifican rutas ni servicios de la API.
- En **Unidades**, cada registro incorpora la acción **Eliminar** con confirmación previa.
- Solo se eliminan unidades sin referencias; las unidades asignadas como base de un producto o utilizadas por una presentación permanecen registradas y muestran un mensaje explicativo.
- La tabla de **Unidades** incorpora **Cod-Unidad** como primera columna y se ordena numéricamente de menor a mayor.
- La tabla de **Líneas** incorpora **Cod-Línea** como primera columna y se ordena numéricamente de menor a mayor.
- Cada línea incorpora la acción **Eliminar** con confirmación; solo se eliminan líneas sin productos asignados.
- La tabla de **Categorías** incorpora **Cod-Categoría** como primera columna, ordenada numéricamente de menor a mayor, y la acción **Eliminar**.
- La tabla de **Productos** muestra **Cod-Producto** como primera columna, ordena numéricamente por ese código y agrega la acción **Eliminar**.
- Al crear un producto, la base de datos genera automáticamente un código correlativo compuesto únicamente por números. El usuario no puede ingresarlo ni modificarlo.
- Las categorías solo se eliminan cuando no tienen productos, áreas ni producción asociada; los productos solo cuando no tienen presentaciones ni producción asociada.
- La imagen deja de ser obligatoria al crear o modificar un producto. Cuando no existe una imagen propia, la administración, el catálogo, el carrito y Almacén muestran el logotipo de ICAR.

## Caso de aceptación

| Caso | Condición | Acción | Resultado esperado |
| --- | --- | --- | --- |
| CP-120 | Usuario autenticado con permiso `catalog.manage` | Observar el menú, ingresar en **Productos** y recorrer sus opciones internas | El menú y el título muestran **Productos**. La pantalla permite acceder a Productos, Categorías, Líneas, Unidades y Precios con las mismas funciones existentes |
| CP-122 | Usuario con `pricing.manage` y productos con presentaciones activas | Editar varios importes, pulsar **Actualizar**, cancelar una vez y aceptar en el segundo intento | La tabla respeta el orden Cod-Producto, Producto/Presentación, Público, Minorista, Distribuidor, Mayorista y Última Modificación; cancelar no persiste y aceptar actualiza todos los cambios juntos |
| CP-123 | Unidad sin productos ni presentaciones asociadas | Pulsar **Eliminar** y confirmar | La unidad desaparece de la tabla y queda registrado el evento `ELIMINAR_UNIDAD` en auditoría |
| CP-124 | Unidad asignada como base de un producto o usada en una presentación | Pulsar **Eliminar** y confirmar | La API responde con conflicto, la interfaz explica que la unidad está en uso y el registro permanece sin cambios |
| CP-125 | Existen varias unidades registradas | Abrir **Productos → Unidades** | La primera columna muestra un código numérico estable y las filas aparecen ordenadas por `Cod-Unidad` de menor a mayor |
| CP-126 | Línea sin productos asociados | Pulsar **Eliminar** y confirmar | La línea desaparece y queda registrado el evento `ELIMINAR_LINEA_PRODUCTIVA` en auditoría |
| CP-127 | Línea asignada a un producto o usuario | Pulsar **Eliminar** y confirmar | La API responde con conflicto, la interfaz explica que la línea está en uso y conserva el registro |
| CP-128 | Existen varias líneas productivas | Abrir **Productos → Líneas** | La primera columna muestra un código numérico estable y las filas aparecen ordenadas por `Cod-Línea` de menor a mayor |
| CP-129 | Categoría sin productos, áreas ni producción asociados | Pulsar **Eliminar** y confirmar | La categoría desaparece y queda registrado el evento `ELIMINAR_CATEGORIA` en auditoría |
| CP-130 | Categoría en uso | Pulsar **Eliminar** y confirmar | La API responde con conflicto, la interfaz explica que está en uso y conserva la categoría |
| CP-131 | Existen varias categorías | Abrir **Productos → Categorías** | `Cod-Categoría` es la primera columna y sus valores aparecen de menor a mayor |
| CP-132 | Producto sin presentaciones ni producción asociada | Pulsar **Eliminar** y confirmar | El producto desaparece y queda registrado el evento `ELIMINAR_PRODUCTO` en auditoría |
| CP-133 | Producto con presentaciones o producción asociada | Pulsar **Eliminar** y confirmar | La API responde con conflicto y conserva el producto y sus relaciones |
| CP-134 | Usuario crea un producto sin indicar código | Completar nombre, categoría, línea y unidad; guardar y volver a editar | La base asigna un código numérico correlativo, la tabla lo ordena de menor a mayor y la edición lo presenta como dato no modificable |
| CP-135 | Producto sin imagen propia | Crear o modificar el producto sin seleccionar un archivo y abrirlo en las vistas del sistema | El producto se guarda correctamente y se muestra el logotipo de ICAR como imagen predeterminada |

## Guion de verificación

1. Iniciar sesión con un usuario que tenga el permiso `catalog.manage`.
2. Comprobar que el menú lateral muestre **Productos** y no **Catálogo y precios**.
3. Seleccionar **Productos**.
4. Comprobar que el encabezado principal muestre **Productos** y el texto superior **Productos y configuración**.
5. Abrir sucesivamente las opciones **Productos**, **Categorías**, **Líneas**, **Unidades** y **Precios**.
6. Verificar que cada opción conserve sus listados, acciones de registro y acciones de edición.
7. Iniciar sesión con un usuario sin `catalog.manage` y comprobar que la opción administrativa **Productos** no sea visible.
8. Comprobar que el menú comercial **Catálogo** continúa separado y disponible únicamente conforme al permiso `catalog.read`.
9. En **Precios**, comprobar las siete columnas, editar al menos dos tipos y verificar que aún no cambien al recargar sin pulsar **Actualizar**.
10. Editar nuevamente, pulsar **Actualizar** y cancelar el modal; comprobar que la base no cambió.
11. Repetir la edición, aceptar el modal y comprobar que los importes y **Última Modificación** cambian después de la respuesta exitosa.
12. Crear una unidad sin asignaciones, eliminarla desde la tabla y confirmar que desaparezca.
13. Intentar eliminar una unidad utilizada por un producto o presentación y comprobar que el sistema la conserve y muestre el motivo.
14. Comprobar que **Cod-Unidad** sea la primera columna y que sus valores estén en orden numérico ascendente.
15. Abrir **Líneas** y comprobar que **Cod-Línea** sea la primera columna y esté en orden numérico ascendente.
16. Crear una línea sin asignaciones, eliminarla y confirmar que desaparezca de la tabla.
17. Intentar eliminar una línea utilizada por un producto o usuario y comprobar que el sistema la conserve y explique el motivo.
18. Abrir **Categorías** y comprobar la primera columna, el orden ascendente y el botón **Eliminar**.
19. Eliminar una categoría sin uso e intentar eliminar otra que tenga productos o esté asignada a producción.
20. Abrir **Productos**, crear un registro sin ingresar código y comprobar que **Cod-Producto** reciba automáticamente un número y que las filas estén ordenadas de menor a mayor.
21. Eliminar un producto sin presentaciones e intentar eliminar otro que tenga presentaciones o producción asociada.
22. Crear o editar un producto sin cargar imagen; comprobar que se guarde y que el logotipo ICAR aparezca en Productos, Catálogo, carrito y Almacén.

## Criterio de aprobación

CP-120 y CP-122 se consideran aprobados cuando el nuevo nombre aparece en el menú y en el encabezado, las cinco opciones internas continúan accesibles, la tabla de precios respeta los cuatro tipos sin lista comercial, la confirmación controla la persistencia, la visibilidad sigue gobernada por permisos y el proyecto frontend compila sin errores.
