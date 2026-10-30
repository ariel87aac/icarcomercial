# Seguimiento de órdenes de producción

Implementado y validado el 29 de octubre de 2026.

## Uso

En **Producción → Seguimiento** se consultan las órdenes de todos los estados, con búsqueda por código, fecha de entrega y selección múltiple de estados. La tabla se pagina en el servidor (30, 60 o 90 registros) y se actualiza cada 30 segundos mientras la vista permanezca abierta. También dispone de actualización manual y avisa cuando una consulta falla.

Cada orden muestra su estado actual, cumplimiento producido, cumplimiento recibido por Almacén, entregas pendientes de recepción y la siguiente acción operativa. **Ver seguimiento** abre:

- Etapas de la orden con sus fechas registradas: Borrador, Emitida, En proceso y Completada, o su resultado de cancelación/cierre con faltantes.
- Estado por producto, presentación, área, cantidades planificadas, producidas, recibidas y pendientes, y fechas reales de inicio y fin.
- Cada entrega parcial/final, responsables y fechas de entrega y recepción, incidencias de Producción y observaciones de Almacén.
- Historial cronológico con evento, responsable, fecha, observación y cambios de estado, según el permiso de historial.

Los estados se actualizan mediante las operaciones existentes de emisión, inicio, entrega, recepción, cierre y cancelación. El seguimiento consulta estos registros, sin crear otra fuente de estados ni exigir recapturarlos. Las órdenes anteriores también se pueden consultar.

## Cálculo e integridad

El cumplimiento se calcula como el promedio de los porcentajes individuales de las presentaciones con plan mayor que cero. Cada porcentaje se limita entre 0 y 100 antes de promediar. Así no se suman unidades incompatibles y un excedente no compensa el faltante de otro producto. Las filas canceladas con plan positivo conservan su faltante. Si no hay cantidades planificadas se muestra «Sin cantidad planificada».

El porcentaje producido y el recibido se calculan por separado. Producir el 100 % no implica completar la orden: sigue siendo necesaria la recepción en Almacén y se mantienen las validaciones existentes de cierre.

## API y permisos

`GET /api/production-consolidations/tracking` utiliza `ProductionConsolidationQueryDto`, con el nuevo filtro opcional `code`, y exige `production.consolidations.read`. Reutiliza los filtros de estados y las restricciones de acceso de la consulta de órdenes. Los productos y porcentajes se calculan únicamente sobre las áreas autorizadas al usuario; el estado de cabecera sigue correspondiendo a la orden completa.

El detalle utiliza `GET /api/production-consolidations/:id` y el historial utiliza `GET /api/production-consolidations/:id/history`, conservando sus permisos. No se necesitan migraciones ni permisos nuevos.

El resumen carga los detalles de toda la página en una consulta agrupada, sin solicitar cada orden por separado. El detalle carga sus relaciones explícitas, omitiendo las relaciones automáticas de roles/permisos de los responsables que multiplicaban las filas y demoraban las consultas. Producción y la pestaña Seguimiento se cargan bajo demanda.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| Pruebas unitarias de backend | 26 aprobadas en 9 archivos; incluye 5 casos de cálculo del seguimiento. |
| `production-plant.acceptance.mjs` | 12 casos aprobados; seguimiento desde borrador hasta cierre, entregas parciales, recepción, excedentes, faltantes, cancelación, filtros, sesión e historial con responsables. |
| `production-tracking-scope.acceptance.mjs` | Aprobada: orden compartida entre dos áreas; administrador ve 50 % producido, responsable del primer producto ve 100 %, responsable del segundo ve 0 %; una tercera área no obtiene la orden y recibe 403 al abrirla. |
| Compilación de backend | Aprobada. |
| Compilador Angular y compilación de producción Docker | Aprobadas; bundle inicial de 1,93 MB. Permanecen advertencias de tamaño inicial y estilos generales existentes. |
| Revisión de interfaz local | Navegación, carga bajo demanda, lista con datos existentes, búsqueda por código y detalle con etapas, cantidades, entregas e historial verificados. |

La integración se ejecutó en una base nueva y aislada, `icar_production_tracking_validation`, con las extensiones `pgcrypto` y `uuid-ossp`, migraciones aplicadas y `NOTIFICATION_WORKER_ENABLED=false`. Las pruebas no enviaron mensajes. El contenedor y la base temporales se eliminan al terminar la validación.

Para repetir, preparar ese entorno aislado y ejecutar dentro del backend de prueba:

```bash
node scripts/production-plant.acceptance.mjs
node scripts/production-tracking-scope.acceptance.mjs
```

La segunda prueba exige explícitamente el nombre de la base temporal y el trabajador desactivado; crea datos que se descartan eliminando esa base. No ejecutar estas pruebas sobre la base operativa.
