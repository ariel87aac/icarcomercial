# Pruebas de aceptación: domicilios activos y predeterminados

Fecha: 2 de noviembre de 2026.

## Alcance

- La información del cliente permite marcar un domicilio activo como predeterminado.
- La misma pantalla permite pasar un domicilio a estado inactivo sin eliminarlo ni afectar pedidos históricos.
- Un cliente conserva como máximo un domicilio activo predeterminado.
- Si se inactiva el predeterminado, el sistema selecciona automáticamente el domicilio activo más antiguo restante.
- El primer domicilio activo de un cliente se convierte automáticamente en predeterminado.
- Catálogo y gestión de pedidos muestran sólo domicilios activos y seleccionan primero el predeterminado.
- Un borrador que apuntaba a un domicilio posteriormente inactivado propone el predeterminado activo al continuar la compra.

## Matriz de aceptación

| Caso | Condición | Acción | Resultado esperado | Resultado técnico |
| --- | --- | --- | --- | --- |
| DOM-01 | Cliente sin domicilios activos | Crear un domicilio sin marcarlo como predeterminado | El nuevo domicilio queda activo y predeterminado | Aprobado por prueba automatizada |
| DOM-02 | Cliente con dos domicilios activos | Presionar **Predeterminar** en el domicilio secundario | El domicilio elegido queda predeterminado y el anterior deja de serlo | Aprobado por prueba automatizada |
| DOM-03 | El domicilio predeterminado tiene otro domicilio activo disponible | Presionar **Pasar a inactivo** | El domicilio conserva su historial, deja de aparecer en compras y el otro domicilio pasa a predeterminado | Aprobado por prueba automatizada y compilación |
| DOM-04 | El cliente tiene un único domicilio activo | Pasarlo a inactivo | El cliente queda sin domicilio seleccionable y no puede completar un nuevo pedido hasta registrar o reactivar uno | Implementado |
| DOM-05 | Existe un domicilio inactivo | Abrir el catálogo o un pedido nuevo | El domicilio inactivo no aparece en el selector | Implementado |
| DOM-06 | Existe un domicilio activo predeterminado | Abrir el carrito o crear un pedido | El sistema selecciona automáticamente ese domicilio | Implementado |
| DOM-07 | Un borrador conserva un domicilio que luego fue inactivado | Continuar comprando | El formulario reemplaza la selección por el domicilio activo predeterminado | Implementado |
| DOM-08 | Existen pedidos anteriores relacionados con el domicilio inactivado | Consultar el historial | Los pedidos mantienen la relación y la copia histórica de la dirección | Conservado por baja lógica y relaciones `RESTRICT` |

## Evidencia ejecutada

- Compilación NestJS: aprobada.
- Compilación Angular con `ngc`: aprobada.
- Suite backend completa: 131 pruebas aprobadas en 31 archivos.
- Casos automatizados de domicilios: 3 de 3 aprobados dentro de la suite.
- Control de tamaño: todos los archivos activos tienen como máximo 300 líneas.

