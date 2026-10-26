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
- La búsqueda espera 300 ms después de escribir y actualiza la tabla sin un botón intermedio. Los filtros de tipo, estado y zona se aplican inmediatamente; el filtro por día se retiró.
- El botón **Eliminar cliente** sólo se muestra con `customers.delete`. La eliminación se rechaza si existen cuentas, domicilios, pedidos, ventas u otras operaciones relacionadas.

## Matriz de aceptación

| Caso | Preparación y acción | Resultado esperado | Evidencia | Estado |
| --- | --- | --- | --- | --- |
| CLI-01 | Crear dos clientes y consultar la lista. | Ambos reciben códigos enteros únicos, la lista se ordena ascendentemente y el código permite localizar al cliente. | Suite de primera iteración, `CP-CLI-01`. | Aprobada |
| CLI-02 | Ingresar al módulo **Clientes**. | La tabla contiene las seis columnas definidas y no repite cuenta, condición comercial ni domicilios. | Verificación visual de interfaz. | Aprobada |
| CLI-03 | Consultar clientes de los cuatro tipos. | Cada tipo presenta una etiqueta de color consistente y mantiene su nombre explícito. | Verificación visual de interfaz. | Aprobada |
| CLI-04 | Presionar el botón de información de un cliente. | Se abre un modal con toda la información comercial, de acceso y de domicilios disponible. | Verificación visual de interfaz. | Aprobada |
| CLI-05 | Consultar un cliente con permisos de actualización. | Las acciones de cuenta, domicilio y edición permanecen disponibles y respetan los permisos. | Revisión funcional y de visibilidad. | Aprobada |
| CLI-06 | Eliminar un cliente nuevo sin relaciones y luego intentar eliminar uno con cuenta. | El primero se elimina y se audita; el segundo obtiene HTTP 409 y conserva todos sus datos. | Suite de primera iteración, `CP-CLI-06`. | Aprobada |
| CLI-07 | Escribir en el buscador y cambiar tipo, estado o zona. | La tabla se actualiza automáticamente; no existe filtro por día ni botón **Filtrar**. | Verificación visual de interfaz. | Aprobada |

## Persistencia

La migración `1720000025000-add-customer-code.ts` crea la secuencia `clientes_codigo_seq`, asigna códigos a los registros existentes según su fecha de creación y añade una restricción única. Los nuevos clientes toman el siguiente valor automáticamente.

La migración `1720000026000-add-customer-delete.ts` incorpora `customers.delete` y lo asigna inicialmente al rol `ADMINISTRADOR`. La API captura restricciones de integridad y nunca elimina en cascada pedidos, ventas, domicilios ni cuentas para forzar el borrado del cliente.

## Ejecución automatizada

Con el stack iniciado:

```bash
docker compose exec -T backend npm run test:acceptance
```

Las pruebas `CP-CLI-01` y `CP-CLI-06` validan código, orden, búsqueda, eliminación segura, rechazo por relaciones y auditoría; luego utilizan la limpieza habitual de la suite.
