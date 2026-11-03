# Pruebas de aceptación — Reportes de Producción

Fecha de actualización: 2 de noviembre de 2026.

## Alcance

La interfaz **Producción > Reportes** sustituye al resumen operativo anterior y permite consultar la producción registrada por fecha y por una o varias áreas. Para este reporte, _producido_ corresponde a la suma de las entregas que Producción registró durante el día seleccionado, independientemente de su recepción posterior en Almacén.

La plantilla institucional creada en `backend/src/compartido/reportes` es reutilizable para los siguientes reportes del sistema. Mantiene logotipo, colores ICAR, cabecera, datos de contexto, indicadores, agrupación, tabla y pie de página uniformes.

## Casos de aceptación

| Caso        | Acción                                                                                                       | Resultado esperado                                                                                                                                                                                                                                      | Tipo                  |
| ----------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| REP-PROD-01 | Abrir **Producción > Reportes**.                                                                             | Se muestra el reporte diario, sus indicadores, fecha, selector de áreas y las acciones PDF y Excel.                                                                                                                                                     | Manual                |
| REP-PROD-02 | Elegir una fecha con entregas registradas.                                                                   | Se consolidan exclusivamente las entregas cuya fecha local de Bolivia pertenece al día seleccionado.                                                                                                                                                    | Mixta                 |
| REP-PROD-03 | Seleccionar una o varias áreas.                                                                              | La consulta y ambas exportaciones incluyen sólo las áreas seleccionadas; un usuario de Producción no puede consultar áreas no autorizadas.                                                                                                              | Automatizada y manual |
| REP-PROD-04 | Consultar un día sin producción.                                                                             | La interfaz y los archivos indican que no existen entregas, sin generar errores ni datos ficticios.                                                                                                                                                     | Manual                |
| REP-PROD-05 | Descargar PDF.                                                                                               | Se genera un archivo tamaño carta horizontal con logotipo, colores ICAR, fecha, áreas, indicadores, agrupación por área, tabla y numeración de páginas.                                                                                                 | Automatizada y visual |
| REP-PROD-06 | Descargar Excel.                                                                                             | Se genera un `.xlsx` con la misma información, cantidades numéricas editables, encabezados congelados, agrupación visual y configuración de impresión horizontal.                                                                                       | Automatizada y visual |
| REP-PROD-07 | Comparar pantalla, PDF y Excel con los registros de Producción.                                              | Código, producto, presentación, categoría, cantidad, unidad, número de entregas y horario coinciden en los tres formatos.                                                                                                                               | Manual                |
| REP-PROD-08 | Exportar cualquiera de los formatos.                                                                         | Auditoría registra usuario, fecha, filtros, formato y resultado exitoso.                                                                                                                                                                                | Automatizada          |
| REP-PROD-09 | En **Producción > Planificación**, ubicar una orden en cualquier estado.                                     | Su columna **Acciones** muestra el botón **Imprimir**; no existe un botón de impresión general junto a los filtros.                                                                                                                                     | Manual                |
| REP-PROD-10 | Presionar **Imprimir** en una orden.                                                                         | Se abre un modal identificado con su código OP y ofrece **Total de productos** y **Orden por áreas**.                                                                                                                                                   | Manual                |
| REP-PROD-11 | Elegir **Total de productos**.                                                                               | El PDF incluye únicamente los productos de la orden seleccionada, consolidados por producto, presentación y unidad; su cabecera muestra código, estado y fecha de entrega.                                                                              | Automatizada y manual |
| REP-PROD-12 | Elegir **Orden por áreas**.                                                                                  | El PDF incluye únicamente la orden seleccionada, inicia cada área en una página diferente y organiza sus productos por fecha programada, secuencia y código. Si un área ocupa varias páginas, sus páginas adicionales se identifican como continuación. | Automatizada y manual |
| REP-PROD-13 | Imprimir órdenes en estados Borrador, Emitida, En proceso, Completada, Completada con faltantes o Cancelada. | La generación está disponible en todos los estados, respeta las áreas autorizadas y registra orden, formato y usuario en auditoría.                                                                                                                     | Automatizada y manual |
| REP-PROD-14 | Generar ambos formatos con códigos de producto numéricos y fechas obtenidas directamente de PostgreSQL.      | El sistema normaliza código y fecha antes de ordenar o formatear; ambos archivos se generan sin excepciones y comienzan con la firma `%PDF`.                                                                                                            | Automatizada          |
| REP-PROD-15 | En **Producción > Reportes**, elegir **Por orden de producción**.                                            | Se habilita un selector buscable de órdenes, ordenado del código mayor al menor, con código, estado y fecha de entrega.                                                                                                                                 | Manual                |
| REP-PROD-16 | Consultar una orden de producción.                                                                           | La pantalla agrupa sus productos por área y muestra código, producto, presentación, categoría, cantidad solicitada, cantidad preparada, unidad y estado.                                                                                                | Automatizada y manual |
| REP-PROD-17 | Comparar las cantidades del reporte con la orden.                                                            | **Cantidad solicitada** coincide con la cantidad planificada para planta, incluido el ajuste por batch/capacidad; **Cantidad preparada** coincide con el acumulado efectivamente producido. Los totales se separan por unidad.                          | Automatizada          |
| REP-PROD-18 | Descargar el reporte de una orden en PDF y Excel.                                                            | Ambos archivos contienen exclusivamente la orden elegida, mantienen la plantilla ICAR y registran orden, usuario y formato en auditoría.                                                                                                                | Automatizada y visual |
| REP-PROD-19 | Consultar con un usuario de Producción asignado sólo a determinadas áreas.                                   | El selector y el detalle muestran únicamente órdenes y productos de sus áreas autorizadas.                                                                                                                                                              | Automatizada          |

## Criterios de diseño de la plantilla

- papel carta, orientación horizontal para reportes tabulares;
- encabezado azul institucional, acento rojo y logotipo ICAR;
- título, código del reporte, período, filtro aplicado, usuario y fecha de generación;
- indicadores resumidos antes de la tabla;
- grupos identificados por área de Producción;
- pie con nombre del reporte y página actual sobre total de páginas;
- contenido legible al imprimir y cantidades conservadas como valores numéricos en Excel.

## Evidencia técnica

1. `npm run build` del backend.
2. `npx tsc -p tsconfig.app.json --noEmit` del frontend.
3. `npm test -- --run src/compartido/reportes/icar-report.spec.ts`.
4. Descarga real de PDF y Excel desde `/api/production-reports/daily/export`.
5. Renderizado del PDF y de la hoja Excel para inspección visual.
6. `npm test -- --run src/modulos/produccion/reportes/production-planning-report.spec.ts`.
7. Descarga de ambos formatos desde `/api/production-reports/planning/export`, enviando el identificador exacto de la orden seleccionada.
8. `npm test -- --run src/modulos/produccion/reportes/production-order-report.spec.ts`.
9. Consulta y descarga desde `/api/production-reports/order` y `/api/production-reports/order/export` con una orden seleccionada.

## Resultado esperado de aceptación

El caso queda aprobado cuando una misma selección de fecha/áreas u orden de producción produce información coincidente en pantalla, PDF y Excel; la orden compara correctamente cantidad solicitada y preparada; el PDF conserva tamaño carta e identidad ICAR; el Excel mantiene valores numéricos; y la exportación queda auditada.
