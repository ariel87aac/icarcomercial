# Organización del código por dominios

## Objetivo

El frontend y el backend se organizan con el mismo lenguaje funcional. La estructura ya no depende de las iteraciones del informe: las iteraciones permanecen como documentación histórica y el código se agrupa por responsabilidad de negocio.

## Estructura compartida

| Dominio | Backend | Frontend |
| --- | --- | --- |
| Seguridad | `backend/src/modulos/seguridad` | `frontend/src/app/modulos/seguridad` |
| Clientes | `backend/src/modulos/clientes` | `frontend/src/app/modulos/clientes` |
| Zonas de reparto | `backend/src/modulos/zonas-reparto` | `frontend/src/app/modulos/zonas-reparto` |
| Productos y precios | `backend/src/modulos/productos` | `frontend/src/app/modulos/productos` |
| Pedidos | `backend/src/modulos/pedidos` | `frontend/src/app/modulos/pedidos` |
| Almacén | `backend/src/modulos/almacen` | `frontend/src/app/modulos/almacen` |
| Producción | `backend/src/modulos/produccion` | `frontend/src/app/modulos/produccion` |
| Preparación | `backend/src/modulos/preparacion` | `frontend/src/app/modulos/preparacion` |
| Distribución | `backend/src/modulos/distribucion` | `frontend/src/app/modulos/distribucion` |
| Seguimiento y mensajería | `backend/src/modulos/seguimiento-mensajeria` | `frontend/src/app/modulos/seguimiento-mensajeria` |
| Ventas y cobranzas | `backend/src/modulos/ventas-cobranzas` | `frontend/src/app/modulos/ventas-cobranzas` |
| Resumen | `backend/src/modulos/resumen` | `frontend/src/app/modulos/resumen` |

Además, `compartido` contiene contratos transversales, `nucleo` contiene configuración técnica y autenticación de la aplicación, y `base-datos` contiene el origen de datos y las migraciones.

## Reglas de mantenimiento

1. Una funcionalidad nueva se crea dentro del dominio al que pertenece; no se crean carpetas por número de iteración.
2. Los controladores conservan la capa HTTP y las operaciones internas de los servicios se dividen por responsabilidad.
3. Los componentes de interfaz separan plantilla, estilos, estado y operaciones cuando su tamaño lo requiere.
4. Ningún archivo activo TypeScript, HTML, SCSS o CSS puede superar 300 líneas.
5. Las migraciones históricas son la única excepción al límite: una migración aplicada no se divide ni se reescribe, porque debe conservar su identidad y contenido.
6. `npm run verificar:tamano` impide que un archivo activo supere el límite.

## Compatibilidad preservada

La reorganización no cambia rutas HTTP, nombres de tablas, relaciones, migraciones aplicadas ni rutas visibles del sistema. Los módulos NestJS y componentes Angular siguen exponiendo los mismos contratos públicos; las fachadas delegan el trabajo en archivos internos más pequeños.

## Prueba de aceptación de la reorganización

| Código | Criterio | Resultado esperado |
| --- | --- | --- |
| ARQ-01 | No existen carpetas de frontend por iteración | El código se encuentra bajo `modulos/<dominio>` |
| ARQ-02 | Backend y frontend usan dominios equivalentes | La ubicación de una función puede identificarse por el mismo nombre funcional |
| ARQ-03 | Límite de tamaño | El verificador informa cero archivos activos mayores a 300 líneas |
| ARQ-04 | Compilación backend | NestJS compila sin errores |
| ARQ-05 | Pruebas backend | Las pruebas automatizadas existentes permanecen aprobadas |
| ARQ-06 | Compilación frontend | Angular compila las plantillas y TypeScript sin errores |
| ARQ-07 | Migraciones | TypeORM sigue cargando `base-datos/migraciones` sin alterar migraciones históricas |
| ARQ-08 | Despliegue | Los contenedores construyen y el endpoint de salud responde correctamente |

### Evidencia ejecutada el 29 de octubre de 2026

| Control | Resultado |
| --- | --- |
| Verificador de tamaño | Aprobado: 344 archivos activos, ninguno mayor a 300 líneas |
| Compilación NestJS | Aprobada |
| Pruebas unitarias backend | Aprobadas: 9 archivos y 26 pruebas |
| Compilación Angular estricta en Docker | Aprobada; plantillas y TypeScript compilados |
| Inicio de PostgreSQL, backend y frontend | Aprobado; los tres contenedores quedaron saludables |
| Migraciones y arranque NestJS | Aprobado; la aplicación inició y registró sus rutas |
| Salud HTTP | Aprobado: `/api/health` respondió `status: ok` y base de datos `up` |
| Portada web | Aprobada: Nginx respondió HTTP 200 en `/` |

La compilación de Angular conserva dos advertencias no bloqueantes ya visibles en el proyecto: tamaño del paquete inicial y presupuesto del estilo principal. No impiden la construcción ni el inicio del sistema.
