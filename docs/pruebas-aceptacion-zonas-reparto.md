# Pruebas de aceptación: inactivación de zonas de reparto

## Alcance

La opción de baja realiza una inactivación lógica. La zona y todas sus relaciones se conservan para mantener el historial de domicilios, rutas, configuraciones y días de reparto.

| Código | Escenario | Resultado esperado |
|---|---|---|
| ZR-01 | Un administrador abre **Zonas y reparto** | Cada zona activa muestra el botón **Inactivar**. |
| ZR-02 | El usuario pulsa **Inactivar** y luego **Cancelar** | El diálogo se cierra y la zona continúa activa. |
| ZR-03 | El usuario confirma la inactivación | La zona cambia a **Inactiva**, aparece una confirmación y la lista se actualiza. |
| ZR-04 | La zona tiene domicilios relacionados | La zona se inactiva sin eliminar ni modificar los domicilios. |
| ZR-05 | La zona tiene rutas relacionadas | La zona se inactiva y se conserva todo el historial de distribución. |
| ZR-06 | La zona tiene configuraciones o días de reparto | La zona se inactiva y se conservan todas las configuraciones relacionadas. |
| ZR-07 | Un usuario sin `zones.delete` intenta llamar `DELETE /api/zones/:id` | La API rechaza la operación por falta de permiso. |
| ZR-08 | La inactivación se completa | Auditoría registra `DESACTIVAR_ZONA`, el identificador, el estado anterior y el nuevo estado. |
| ZR-09 | El usuario abre **Zonas y reparto** | El filtro inicia en **Activas** y sólo muestra zonas con estado activo. |
| ZR-10 | El usuario selecciona **Inactivas** o **Todas** | La lista cambia inmediatamente y muestra las zonas correspondientes al filtro. |
| ZR-11 | Un usuario con `zones.update` revisa el calendario de una zona. | Cada día activo muestra un botón para eliminarlo, organizado junto a su horario y estado. |
| ZR-12 | El usuario pulsa el botón de eliminar y luego **Cancelar**. | El diálogo se cierra y el día continúa activo. |
| ZR-13 | El usuario confirma **Eliminar del calendario**. | El día cambia a inactivo, desaparece de la tarjeta y deja de estar disponible para nuevos domicilios y pedidos, conservando el historial. |
| ZR-14 | El usuario vuelve a agregar el mismo día eliminado. | El registro se reactiva con el nuevo horario, sin duplicar el día de la semana. |
| ZR-15 | La eliminación lógica se completa. | Auditoría registra `DESACTIVAR_DIA_DISTRIBUCION` con zona, día, estado anterior y nuevo estado. |

## Criterio de aprobación

La prueba se acepta cuando las bajas cambian el estado a **Inactivo** sin eliminar físicamente la zona, el día de reparto ni ninguna relación histórica.
