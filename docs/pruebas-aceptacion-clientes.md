# Pruebas de aceptación: maestro de clientes

## Objetivo del ajuste

Simplificar la consulta del maestro de clientes sin perder información comercial. La tabla principal prioriza identificación y estado; el detalle completo se consulta desde una acción específica.

## Reglas implementadas

- Cada cliente recibe un `Cod-Cliente` numérico, único y automático. El operador no lo ingresa ni lo modifica.
- La consulta se ordena de menor a mayor por `Cod-Cliente` y el buscador admite código, nombre, NIT/CI, teléfono o WhatsApp.
- La tabla muestra solamente `Cod-Cliente`, `Cliente`, `Tipo`, `Contacto`, `Estado` y `Acciones`.
- El tipo de cliente se distingue visualmente con un color propio para `Público`, `Minorista`, `Distribuidor` y `Mayorista`.
- El botón **Información del cliente** reúne identificación, contacto, condición comercial, cuenta, domicilios, zona, distribución, coordenadas y fechas de registro/modificación.
- Habilitar cuenta, agregar domicilio y editar cliente continúan disponibles según los permisos del usuario.
- El formulario de cliente guarda un código telefónico internacional y selecciona Bolivia (`+591`) por defecto.
- La cuenta del cliente admite un nombre de usuario independiente del NIT/CI, editable desde la información del cliente y con mínimo 4 caracteres.
- La tabla de clientes expone la columna **Usuario del sistema** y acciones directas para asignar, modificar y restablecer la cuenta sin abandonar el módulo.
- La contraseña temporal predeterminada y de restablecimiento es `123456`. El cliente no puede utilizar los módulos hasta cambiarla por otra de al menos 6 caracteres.
- La búsqueda espera 300 ms después de escribir y actualiza la tabla sin un botón intermedio. Los filtros de tipo, estado y zona se aplican inmediatamente; el filtro por día se retiró. Al ingresar o limpiar los filtros, el estado predeterminado es **Activo**.
- El botón **Eliminar cliente** sólo se muestra con `customers.delete` y para clientes activos. Su acción es una baja lógica: cambia el estado a `INACTIVO`, conserva cuenta, domicilios, pedidos, ventas, cobros y auditoría, y revoca las sesiones renovables de la cuenta vinculada.

## Matriz de aceptación

| Caso | Preparación y acción | Resultado esperado | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| CLI-01 | Crear dos clientes y consultar la lista. | Ambos reciben códigos enteros únicos, la lista se ordena ascendentemente y el código permite localizar al cliente. | Suite de primera iteración, `CP-CLI-01`. | Aprobada |
| CLI-02 | Ingresar al módulo **Clientes**. | La tabla contiene las seis columnas definidas y no repite cuenta, condición comercial ni domicilios. | Verificación visual de interfaz. | Aprobada |
| CLI-03 | Consultar clientes de los cuatro tipos. | Cada tipo presenta una etiqueta de color consistente y mantiene su nombre explícito. | Verificación visual de interfaz. | Aprobada |
| CLI-04 | Presionar el botón de información de un cliente. | Se abre un modal con toda la información comercial, de acceso y de domicilios disponible. | Verificación visual de interfaz. | Aprobada |
| CLI-05 | Consultar un cliente con permisos de actualización. | Las acciones de cuenta, domicilio y edición permanecen disponibles y respetan los permisos. | Revisión funcional y de visibilidad. | Aprobada |
| CLI-06 | Presionar **Eliminar** en un cliente con cuenta, domicilio e historial. | El cliente pasa a `INACTIVO`, se registra `DESACTIVAR_CLIENTE`, sus relaciones permanecen consultables y ya no puede iniciar sesión. | Suite de primera iteración, `CP-CLI-06`. | Aprobada |
| CLI-07 | Ingresar al módulo, limpiar filtros, escribir en el buscador y cambiar tipo, estado o zona. | La vista inicial y la limpieza muestran sólo activos; la tabla se actualiza automáticamente y el filtro de estado permite consultar inactivos o todos. | Verificación visual de interfaz. | Aprobada |
| CLI-08 | Habilitar una cuenta con usuario propio y restablecer su contraseña. | El usuario no depende del NIT/CI; `123456` permite el primer acceso, pero sólo se habilita el sistema después de cambiarla. | Suite de primera iteración, `CP-CLI-08`. | Aprobada |
| CLI-10 | Consultar y administrar el usuario desde la tabla de clientes. | Se visualiza el usuario asignado o “Sin usuario asignado”; editar y restablecer están disponibles en la misma fila según permisos. | Verificación de interfaz del módulo Clientes. | Aprobada |
| CLI-11 | Abrir el mapa de un domicilio nuevo. | Sin coordenadas previas, el mapa inicia centrado en Cochabamba, Bolivia; al editar conserva la ubicación registrada. | Verificación de interfaz del módulo Clientes. | Aprobada |
| CLI-09 | Crear o editar un cliente sin cambiar Código de país. | Se conserva Bolivia (`+591`) y la tabla muestra prefijo y teléfono juntos. | Verificación funcional y visual. | Aprobada |

## Persistencia

La migración `1720000025000-add-customer-code.ts` crea la secuencia `clientes_codigo_seq`, asigna códigos a los registros existentes según su fecha de creación y añade una restricción única. Los nuevos clientes toman el siguiente valor automáticamente.

La migración `1720000026000-add-customer-delete.ts` incorpora `customers.delete` y lo asigna inicialmente al rol `ADMINISTRADOR`. El ajuste de aceptación del 1 de noviembre de 2026 conserva ese permiso, pero reemplaza el borrado físico por la actualización del estado existente; por ello no requiere una migración adicional de estructura.

La migración `1720000052000-add-country-code-and-password-change.ts` incorpora el código telefónico del país y la marca de cambio obligatorio. Los registros existentes reciben `+591` sin alterar teléfonos ni historial; las contraseñas existentes no se modifican.

## Ejecución automatizada

Con el stack iniciado:

```bash
docker compose exec -T backend npm run test:acceptance
```

Las pruebas `CP-CLI-01` y `CP-CLI-06` validan código, orden, búsqueda, baja lógica, conservación de relaciones, bloqueo de acceso y auditoría; luego utilizan la limpieza habitual de la suite.
