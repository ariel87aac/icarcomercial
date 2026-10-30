# Pruebas de aceptación: usuarios y áreas de Producción

## Objetivo

Eliminar la asignación de **líneas productivas autorizadas** y reemplazar el alcance operativo por **áreas de Producción**. Las líneas se conservan como clasificación comercial del producto; las categorías determinan el área responsable.

## Relación revisada

Antes del cambio, `usuarios_lineas_productivas` era una tabla puente entre `usuarios` y `lineas_productivas`. Sus dos claves foráneas utilizaban eliminación en cascada y el backend empleaba esa relación para ocultar o rechazar líneas dentro del módulo Producción.

La relación vigente queda dividida en dos partes: `areas_produccion_categorias` implementa Área 1–N Categorías mediante una restricción única sobre `categoria_id`, y `usuarios_areas_produccion` implementa Usuarios N–M Áreas. No se elimina `lineas_productivas`: los productos y detalles históricos de Producción continúan relacionados con ella.

## Resultado implementado

- El formulario de creación y edición de usuarios ya no muestra el selector **Líneas productivas autorizadas**.
- Las solicitudes y respuestas de usuarios y autenticación ya no incluyen `productLineIds` ni `productLines`.
- La migración `1720000023000-remove-user-product-line-scope.ts` elimina `usuarios_lineas_productivas`.
- La migración `1720000031000-add-user-production-area-scope.ts` crea `usuarios_areas_produccion` y migra a los usuarios de Producción existentes a todas las áreas activas.
- Al asignar el rol `PRODUCCION`, el formulario exige una o varias áreas activas.
- Producción filtra órdenes, resúmenes, catálogos y detalles por las áreas asignadas al usuario; las operaciones fuera de alcance se rechazan.
- Los filtros operativos de Producción son **Área** y **Categoría**, no línea productiva.
- Una línea puede eliminarse cuando no está asignada a productos. Ya no existe una dependencia con usuarios.
- Cada usuario recibe un código numérico automático y la tabla se ordena por dicho código.
- El botón **Eliminar** solicita confirmación y sólo elimina cuentas internas sin operaciones asociadas; la cuenta en uso y el último administrador activo permanecen protegidos.
- El correo es opcional para usuarios internos y se persiste como `NULL` cuando no se informa.
- El nombre de usuario exige al menos 4 caracteres y la contraseña al menos 6, sin requisitos de composición. La migración `1720000042000-make-user-email-optional.ts` habilita el cambio en PostgreSQL.

## Matriz de aceptación

| Caso | Condición o acción | Resultado esperado | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| USU-01 | Abrir **Usuarios → Nuevo usuario**. | Se muestran datos personales, contraseña y roles; no aparece **Líneas productivas autorizadas**. | Verificación visual en `http://localhost:8080/`. | Aprobada |
| USU-02 | Ejecutar la migración y consultar `to_regclass('public.usuarios_lineas_productivas')`. | La consulta devuelve `NULL` y la migración queda registrada. | Consulta directa a PostgreSQL. | Aprobada |
| USU-03 | Iniciar sesión con una cuenta interna activa. | La sesión conserva roles y permisos y no expone `productLineIds`. | Suite de primera iteración, CP-01. | Aprobada |
| USU-04 | Consultar una orden con productos de dos áreas utilizando un usuario asignado a una sola. | Sólo son visibles los detalles del área asignada. | Suite de tercera iteración, CP-54. | Aprobada |
| USU-05 | Eliminar una línea sin productos y luego intentar eliminar otra utilizada por un producto. | La primera se elimina y audita; la segunda se rechaza con conflicto. | Suite de segunda iteración, CP-126 y CP-127. | Aprobada |
| USU-06 | Compilar backend y frontend después de retirar la relación. | Ambos proyectos compilan sin referencias obsoletas. | Compilación local y construcción Docker. | Aprobada |
| USU-07 | Crear un usuario y consultar la tabla administrativa. | Se asigna un código numérico automático y los usuarios aparecen ordenados de menor a mayor. | Suite de primera iteración, CP-USU-07. | Aprobada |
| USU-08 | Intentar eliminar la cuenta en uso y luego un usuario sin operaciones. | La primera se rechaza; la segunda se elimina, desaparece de la consulta y genera `ELIMINAR_USUARIO`. | Suite de primera iteración, CP-USU-08. | Aprobada |
| USU-09 | Crear un usuario con rol `PRODUCCION` sin áreas. | La API rechaza la solicitud con HTTP 400. | Suite de tercera iteración, CP-126. | Aprobada |
| USU-10 | Crear un usuario de Producción con dos áreas y otro con una sola. | Las relaciones se guardan y se devuelven en la interfaz y sesión. | Suite de tercera iteración, CP-126. | Aprobada |
| USU-11 | Intentar iniciar un producto de un área no asignada. | La API rechaza la operación con HTTP 403. | Suite de tercera iteración, CP-54. | Aprobada |
| USU-12 | Asignar la misma categoría a una segunda área. | La restricción y el servicio rechazan la duplicidad con HTTP 409. | Suite de tercera iteración, CP-125. | Aprobada |
| CP-USU-09 | Crear un usuario interno sin correo, con usuario de 4 caracteres y contraseña simple de 6; luego intentar usuario de 3 y contraseña de 5. | El usuario se crea e inicia sesión; los valores inferiores devuelven HTTP 400. | Suite de primera iteración, CP-USU-09. | Aprobada |

## Regresión ejecutada

| Suite | Resultado |
| --- | ---: |
| Pruebas unitarias del backend | 16 aprobadas, 0 fallidas |
| Primera iteración: usuarios, autenticación, permisos y clientes | 21 aprobadas, 0 fallidas |
| Segunda iteración: Productos, pedidos y Almacén | 46 aprobadas, 0 fallidas |
| Tercera iteración: Producción | 27 aprobadas, 0 fallidas |
| Flujo complementario Producción–Almacén | 7 aprobadas, 0 fallidas |

Los tres servicios Docker finalizaron en estado saludable. La compilación del frontend mantiene una advertencia previa sobre el tamaño del paquete inicial, sin impedir la construcción.
