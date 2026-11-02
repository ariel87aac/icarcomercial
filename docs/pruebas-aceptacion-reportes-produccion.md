# Pruebas de aceptación — Reportes de Producción

Fecha de actualización: 1 de noviembre de 2026.

## Alcance

La interfaz **Producción > Reportes** sustituye al resumen operativo anterior y permite consultar la producción registrada por fecha y por una o varias áreas. Para este reporte, *producido* corresponde a la suma de las entregas que Producción registró durante el día seleccionado, independientemente de su recepción posterior en Almacén.

La plantilla institucional creada en `backend/src/compartido/reportes` es reutilizable para los siguientes reportes del sistema. Mantiene logotipo, colores ICAR, cabecera, datos de contexto, indicadores, agrupación, tabla y pie de página uniformes.

## Casos de aceptación

| Caso | Acción | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| REP-PROD-01 | Abrir **Producción > Reportes**. | Se muestra el reporte diario, sus indicadores, fecha, selector de áreas y las acciones PDF y Excel. | Manual |
| REP-PROD-02 | Elegir una fecha con entregas registradas. | Se consolidan exclusivamente las entregas cuya fecha local de Bolivia pertenece al día seleccionado. | Mixta |
| REP-PROD-03 | Seleccionar una o varias áreas. | La consulta y ambas exportaciones incluyen sólo las áreas seleccionadas; un usuario de Producción no puede consultar áreas no autorizadas. | Automatizada y manual |
| REP-PROD-04 | Consultar un día sin producción. | La interfaz y los archivos indican que no existen entregas, sin generar errores ni datos ficticios. | Manual |
| REP-PROD-05 | Descargar PDF. | Se genera un archivo tamaño carta horizontal con logotipo, colores ICAR, fecha, áreas, indicadores, agrupación por área, tabla y numeración de páginas. | Automatizada y visual |
| REP-PROD-06 | Descargar Excel. | Se genera un `.xlsx` con la misma información, cantidades numéricas editables, encabezados congelados, agrupación visual y configuración de impresión horizontal. | Automatizada y visual |
| REP-PROD-07 | Comparar pantalla, PDF y Excel con los registros de Producción. | Código, producto, presentación, categoría, cantidad, unidad, número de entregas y horario coinciden en los tres formatos. | Manual |
| REP-PROD-08 | Exportar cualquiera de los formatos. | Auditoría registra usuario, fecha, filtros, formato y resultado exitoso. | Automatizada |

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

## Resultado esperado de aceptación

El caso queda aprobado cuando una misma selección de fecha y áreas produce información coincidente en pantalla, PDF y Excel; el PDF conserva tamaño carta e identidad ICAR; el Excel mantiene valores numéricos; y la exportación queda auditada.
