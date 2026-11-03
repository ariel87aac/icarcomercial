# Organización del código por dominios

Estado actualizado: los pendientes del núcleo operativo de Producción se cierran en la undécima etapa, al final de este documento. Las etapas anteriores conservan el registro histórico.

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
7. El tamaño no sustituye la separación de responsabilidades: no introducir nuevas cadenas de herencia numeradas para dividir servicios. Las nuevas extracciones deben usar composición y contratos explícitos.
8. `noUnusedLocals` y `noUnusedParameters` se verifican durante la compilación de ambos proyectos. Los símbolos utilizados desde plantillas Angular se validan también con el compilador Angular.

## Refactorización incremental iniciada el 2 de noviembre de 2026

Primera etapa implementada:

- Eliminación de importaciones, tipos locales y copias de constantes sin uso en backend y frontend. Se conservan las copias que tienen consumidores.
- Unificación de las siete declaraciones de `PublicOrderConfirmationView` en `pedidos/aplicacion/public-order-confirmation.view.ts`.
- Extracción de la construcción del snapshot comercial a `pedidos/dominio/order-detail-values.ts`, sin dependencias de NestJS ni TypeORM. El servicio conserva la adaptación desde la entidad y la persistencia.
- Prueba de regresión de precisión de cantidades, importes y reservas iniciales del detalle.
- Incorporación del comando `test:acceptance:production-tracking`; conserva las precondiciones de aislamiento del script existente.

Validación de esta etapa: `npm run calidad` del backend aprobado (373 archivos dentro del límite, compilación y 45 pruebas en 16 archivos); `ngc -p tsconfig.app.json --noEmit` aprobado. La construcción completa de Angular sigue terminando con código 134 en este entorno, también observado antes de esta etapa, sin diagnóstico útil. No se considera validado el empaquetado de producción. No se ejecutaron las pruebas de aceptación contra la base existente.

### Segunda etapa: composición del módulo Pedidos

Se eliminaron `orders.base.ts` y las seis partes numeradas. `OrdersService` conserva el contrato de los controladores y delega en servicios inyectados por constructor, sin firmas de índice `any` ni dependencia circular hacia la fachada.

| Responsabilidad | Implementación |
| --- | --- |
| Listados, resumen, consulta, carrito e historial | `OrderQueriesService` |
| Creación y actualización de borradores | `CreateOrderUseCase`, `UpdateOrderUseCase` |
| Envío y devolución a borrador | `OrderSubmissionService` |
| Confirmación interna y pública | `OrderConfirmationService` |
| Reprogramación | `RescheduleOrderUseCase` |
| Cancelación y eliminación lógica | `OrderCancellationService` |
| Validación de detalles, acceso, enlaces y notificaciones | Servicios específicos de aplicación |
| Confirmación atómica de pedido, reservas, enlace e historial | `OrderConfirmationPort` y `TypeOrmConfirmOrderTransaction` |

El puerto de confirmación está en `aplicacion/puertos`; su adaptador está en `infraestructura` y se vincula en `OrdersModule`. La lógica transaccional, los bloqueos y las rutas HTTP se conservan. El dominio sigue conteniendo la regla pura del snapshot comercial.

Las pruebas de composición construyen los proveedores registrados en el módulo real, sustituyendo las dependencias externas. Verifican resolución de dependencias, reutilización de borradores, restricciones por cliente, auditoría, identidad de confirmación pública y ausencia de notificaciones cuando falla la transacción. Estas pruebas no sustituyen una comprobación de rollback real en PostgreSQL ni la aceptación HTTP.

Validación de la segunda etapa: `npm run calidad` aprobado, con compilación backend, 52 pruebas en 17 archivos y 380 archivos dentro del límite de tamaño. `git diff --check` sin errores. No se modificaron migraciones ni se ejecutaron operaciones contra la base de datos.

### Tercera etapa: puerto de lectura de Pedidos

`OrderQueriesService` y `OrderAccessService` dejan de inyectar repositorios y `DataSource`. Ahora usan `OrderReadPort`, conectado con `TypeOrmOrderReadAdapter` en `OrdersModule`. Las consultas SQL, selección de relaciones, ordenación, carga del borrador, historial y enriquecimiento del flujo se implementan en infraestructura.

La aplicación conserva las decisiones de autorización: impone el cliente autenticado, rechaza acceso a pedidos ajenos, registra el rechazo y autoriza la lectura de historial y seguimiento antes de consultarlos. El contrato diferencia `customerId: null` (cliente sin cuenta asociada) de `undefined` (consulta interna sin filtro). Los filtros, la paginación y los contratos HTTP se mantienen.

Se añadieron seis pruebas del servicio usando un puerto de lectura simulado: alcance del cliente, cliente sin cuenta asociada, selección interna, bloqueo de historial y seguimiento ajenos, pedido inexistente y consultas autorizadas. La prueba de composición verifica también la vinculación del nuevo puerto con su adaptador real.

Validación de esta etapa: `npm run calidad` aprobado (compilación, 58 pruebas en 18 archivos y 383 archivos dentro del límite de tamaño); `git diff --check` sin errores. Las pruebas usan dependencias externas simuladas; no se ejecutó aceptación HTTP ni validación contra PostgreSQL.

### Cuarta etapa: persistencia de creación y actualización

`CreateOrderUseCase` y `UpdateOrderUseCase` delegan sus escrituras a `OrderDraftWritePort`, implementado por `TypeOrmOrderDraftWriteAdapter`. El contrato transporta identificadores, fechas, importes y snapshots de los detalles; no recibe repositorios, entidades ni un `EntityManager`. La búsqueda del borrador reutilizable pasa por `OrderReadPort.findDraftId`.

El adaptador mantiene `workflowTransaction`, la secuencia de códigos, las escrituras de cabecera/detalles/historial y la actualización de enlaces cuando cambia la programación. En actualización conserva el bloqueo pesimista y la comprobación del estado dentro de la transacción. La aplicación conserva validación, normalización, cálculo del total y efectos posteriores al guardado.

Se añadieron cinco casos del adaptador (incluidos dos estados inmutables) y dos de propagación de fallos desde la fachada. Comprueban conservación de observaciones y plazos, actualización del vencimiento, reemplazo de detalles y ausencia de auditoría de éxito tras un fallo de escritura. Usan un administrador de persistencia simulado y ejecutan el callback transaccional real; no prueban rollback ni concurrencia contra PostgreSQL.

Validación: `npm run calidad` aprobado, con compilación, 65 pruebas en 19 archivos y 386 archivos dentro del límite. No se alteraron rutas HTTP ni migraciones.

### Quinta etapa: envío, devolución, reprogramación y cancelación

Los servicios de aplicación utilizan ahora `OrderSubmissionPort`, `OrderReschedulePort` y `OrderCancellationPort`. Cada contrato se conecta con un adaptador TypeORM explícito en `OrdersModule`. Los contratos transportan datos de la operación; no exponen un administrador de entidades ni repositorios.

La reprogramación conserva la validación de detalles y precios dentro de la transacción, usando su mismo `EntityManager`. La cancelación conserva el orden de bloqueos, las comprobaciones de preparación/entrega/venta asociada, el rechazo de reservas consumidas y la liberación de stock reservado. La eliminación sigue siendo lógica y exige un pedido cancelado bajo bloqueo. Envío y devolución conservan la revocación de enlaces, el hash de confirmación y el historial.

Se incorporaron trece casos de adaptadores y cinco de fallo de los servicios de aplicación. Cubren restricciones de cancelación, liberación de reservas sin alterar stock físico, cambios de estado concurrentes simulados, envío/devolución, reprogramación y ausencia de mensajes, seguimiento o auditoría de éxito si falla la transacción. La prueba de composición verifica los tres nuevos enlaces de puerto a adaptador.

Las pruebas ejecutan los callbacks transaccionales con persistencia simulada: no acreditan rollback ni concurrencia real en PostgreSQL. No se modificaron rutas HTTP ni migraciones.

Validación: `npm run calidad` aprobado (compilación, 83 pruebas en 21 archivos y 394 archivos dentro del límite de tamaño); `git diff --check` sin errores.

### Sexta etapa: validación y enlaces de confirmación

`OrderDetailsService` valida mediante `OrderValidationPort`/`OrderValidationReader`; ya no recibe un `EntityManager`, inyecta repositorios ni construye entidades TypeORM. El adaptador de validación proporciona las lecturas de cliente, domicilio, presentación y precio, y delega la programación existente. Las reglas de detalle vacío, duplicados, actividad y precio aplicable permanecen en aplicación.

En confirmación y reprogramación, infraestructura crea una sesión de lectura con `forTransaction(manager)` y la pasa a la validación. Cada sesión captura su propio administrador, sin mutar el proveedor singleton. Cliente, domicilio, presentación y precios usan ese administrador; la resolución de programación conserva el servicio y comportamiento anteriores. La construcción de entidades para reprogramar se trasladó a su adaptador.

`OrderLinksService` resuelve y guarda enlaces mediante `OrderLinkPort`, conectado con `TypeOrmOrderLinkAdapter`. La aplicación conserva el hash, los límites de longitud, los estados permitidos y el vencimiento. No se alteró la validación transaccional del token durante la confirmación.

Se incorporaron siete casos de validación, siete de enlaces y dos de sesiones de lectura. Cubren validación sin TypeORM, selección exclusiva de la sesión transaccional, separación entre sesiones, pertenencia del domicilio, detalle/precio inválido y enlaces activos, usados, revocados o vencidos. La composición verifica las nuevas vinculaciones.

Validación: `npm run calidad` aprobado (compilación, 99 pruebas en 24 archivos y 401 archivos dentro del límite). Las dependencias externas están simuladas; sigue pendiente aceptación HTTP y comprobación real de concurrencia/rollback con PostgreSQL.

### Séptima etapa: integraciones externas de Pedidos

La aplicación utiliza `OrderSchedulingPort`, `OrderAuditPort`, `OrderTrackingPort`, `OrderMessagingPort` y `OrderPublicUrlPort`. Ya no importa los servicios concretos de programación, auditoría, seguimiento y notificaciones ni `ConfigService`. Los contratos exponen únicamente las operaciones utilizadas por Pedidos.

`order-integration.providers.ts` conecta los contratos con los proveedores existentes mediante factories con retorno tipado. Esto verifica compatibilidad durante la compilación y reutiliza las mismas instancias, sin duplicar el comportamiento de auditoría o mensajería. La configuración de URL se resuelve en `ConfigOrderPublicUrlAdapter`. `OrderScheduleWindow` vive en el contrato de programación y se reexporta desde el servicio anterior para conservar compatibilidad.

Las pruebas verifican identidad de las instancias, orden enlace/mensaje/historial/stock, propagación de errores inesperados y precedencia de `PUBLIC_APP_URL`, `CORS_ORIGIN` y valor predeterminado. Las pruebas existentes de fallos transaccionales siguen comprobando que no se emitan efectos de éxito antes del commit.

Validación: `npm run calidad` aprobado (compilación, 105 pruebas en 26 archivos y 411 archivos dentro del límite); `git diff --check` sin errores. No se ejecutó aceptación HTTP ni PostgreSQL real.

Límite actual: los modelos de respuesta y ciertos contratos aún usan tipos de entidades y DTO HTTP. La capa de aplicación sigue utilizando decoradores y excepciones NestJS; esto es una migración incremental, no una independencia completa del framework. Siguen pendientes esos límites, las cadenas de herencia de otros módulos, las pantallas administrativas del componente raíz y, hasta la octava etapa, la aceptación reproducible en una base aislada.

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


## Octava etapa: aceptación real en PostgreSQL aislado

Se incorporó `backend/scripts/orders-isolated.acceptance.mjs` y el comando `test:acceptance:isolated`. Compila las fuentes actuales fuera del árbol de trabajo, excluye migraciones locales no versionadas y utiliza contenedores y red propios, credenciales exclusivas de prueba, almacenamiento PostgreSQL temporal y trabajador WhatsApp desactivado. No utiliza la base operativa ni publica puertos. Conserva logs en `output/acceptance` y retira el entorno al finalizar, incluso si falla una suite.

El arranque limpio detectó la falta de `uuid-ossp`, requerida por una migración histórica. Se añadió al inicializador sin reescribir esa migración. La suite histórica del flujo esperaba mensajes de borrador y múltiples borradores simultáneos del mismo cliente; se adaptó al carrito reutilizable y silencioso ya documentado, manteniendo las comprobaciones de inventario, preparación y reparto.

Resultados del 2 de noviembre de 2026:

- Pedidos, catálogo e inventario: **47 comprobaciones aprobadas**, incluidas confirmaciones concurrentes y rollback real de reservas/estado tras un error. Logs: `output/acceptance/icar-acceptance-1793623534227-47389/orders.log`.
- Flujo unificado: **22 comprobaciones aprobadas**, desde borrador hasta preparación, reparto, seguimiento y entrega. Logs: `output/acceptance/icar-acceptance-1793623794068-48293/workflow.log`.
- Ambos entornos temporales fueron retirados. No se enviaron mensajes al proveedor WhatsApp.

La aceptación cubre backend y base de datos; no sustituye pruebas visuales del frontend ni pruebas con un proveedor real de mensajería. Sigue pendiente extender la migración arquitectónica a los demás módulos.

## Novena etapa: migración arquitectónica de Producción

Se eliminó la cadena de trece clases numeradas y `production.base.ts`, incluido su índice dinámico `any`. `ProductionService` conserva la API pública y delega en servicios de aplicación para consultas, áreas, generación, planificación, emisión, ejecución, entregas, recepción, solicitudes de stock, cancelación y cierre.

La aplicación depende de contratos de lectura, escritura y seguimiento; no importa TypeORM, repositorios, `DataSource` ni implementaciones de infraestructura. Los adaptadores conservan los límites transaccionales, bloqueos, auditoría e historial. La recepción actualiza el seguimiento de stock después de completar la transacción. La política de acceso centraliza las restricciones por área, los permisos de consulta y los motivos obligatorios.

La infraestructura separa construcción del borrador, validación, resolución de áreas, lectura de fuentes, filtros y operaciones transaccionales. No se modificaron rutas HTTP, tablas ni migraciones históricas. Los cálculos y estados operativos conservan su comportamiento.

Se añadieron ocho pruebas de composición, políticas y propagación de fallos: resuelven los proveedores reales de NestJS, comprueban aislamiento por áreas y verifican que una escritura fallida no dispare lecturas ni seguimiento de éxito. El ejecutor aislado admite ahora cuatro suites de Producción, cada una con base propia.

Resultados del 2 de noviembre de 2026:

| Suite | Resultado | Evidencia en `output/acceptance/` |
| --- | --- | --- |
| Producción general | 27 comprobaciones, incluida generación concurrente y rollback real de emisión | `icar-acceptance-1793624952093-54745/production.log` |
| Flujo Producción–Almacén | 12 comprobaciones de entregas, recepción, programación, cancelación y cierre | `icar-acceptance-1793624913234-54561/production-plant.log` |
| Alcance por área | Aprobado: listados, detalle, porcentajes y entregas restringidos | `icar-acceptance-1793624964502-54857/production-scope.log` |
| Solicitudes para stock | 6 comprobaciones, incluida devolución y reenvío | `icar-acceptance-1793624982384-55012/stock-requests.log` |

La suite histórica de Producción suponía que las recepciones de pedidos anteriores quedaban libres para pedidos posteriores. La regla vigente reserva toda la demanda (documentada en el flujo unificado), por lo que esos saldos ya estaban comprometidos. Se corrigieron las cantidades de los escenarios de faltante y excedente y se añadió la precondición explícita de plan igual a 10; se mantienen las diferencias esperadas de −3 y +2,5. No se cambió la lógica de reservas para satisfacer la prueba.

Validación local: `npm run calidad` aprobado con 113 pruebas en 27 archivos. La revisión adicional de tipos incluyendo todos los tests (`tsc --noEmit --incremental false --rootDir . -p tsconfig.json`) detecta errores fuera de Producción en fixtures de Pedidos, reportes y cifrado de canales; no hay errores en los nuevos tests de Producción. La compilación normal del backend y Vitest pasan.

Límite de la etapa: los contratos todavía comparten entidades persistidas y DTO HTTP, y la aplicación utiliza decoradores y excepciones NestJS. Algunas reglas que requieren datos permanecen dentro de los adaptadores transaccionales. Esta separación permite sustituir dependencias y probar los casos de uso, pero la independencia completa del dominio requiere una etapa posterior. Los reportes de Producción conservan su servicio existente.

## Décima etapa: contratos de entrada y dominio de Producción

`aplicacion/production-inputs.ts` define los comandos y filtros de consulta sin decoradores HTTP. Los casos de uso, puertos y adaptadores consumen esos contratos; los DTO de entrada los implementan y mantienen las transformaciones, valores predeterminados y validaciones existentes. La dirección de dependencia pasa del transporte hacia la aplicación. No se añade un mapeo de objetos porque ambos límites comparten la misma estructura de entrada.

Los estados y cálculos de Producción se ubican en `dominio/`, sin dependencias de NestJS, TypeORM, entidades persistidas ni DTO. El cálculo de seguimiento recibe una estructura mínima de cantidades, etapas y estados de entrega. Sus pruebas utilizan esos valores directamente, sin conversiones forzadas a entidades. Las rutas anteriores reexportan las implementaciones para mantener compatibilidad con otros módulos; no contienen lógica duplicada.

La política de acceso ya no requiere entidades completas de consolidación o pedidos para comprobar áreas y fechas: acepta únicamente los campos que utiliza. Mantiene las excepciones NestJS por compatibilidad HTTP.

Validación del 2 de noviembre de 2026: compilación y 113 pruebas aprobadas; 453 archivos activos dentro del límite de 300 líneas. La suite general de Producción aprobó 27 comprobaciones, incluidas concurrencia, rollback y permisos (`output/acceptance/icar-acceptance-1793625363746-57338/production.log`). El flujo Producción–Almacén aprobó sus 12 comprobaciones (`output/acceptance/icar-acceptance-1793625403353-58092/production-plant.log`). Ambos entornos temporales fueron retirados.

Pendiente: reemplazar las entidades de salida compartidas por modelos de lectura propios, separar las excepciones de aplicación del transporte y extraer las reglas de negocio aún incluidas en adaptadores transaccionales. Esta etapa no modifica el contrato JSON ni el esquema de datos.

## Undécima etapa: cierre de los pendientes de Producción

El cierre corresponde al núcleo operativo de Producción y a los pendientes enumerados en las etapas novena y décima. No implica que todos los demás módulos del repositorio hayan sido migrados.

| Pendiente | Resolución |
| --- | --- |
| Entidades en los contratos de salida | Modelos propios en `aplicacion/modelos`, incluida paginación y resumen con campos explícitos. Los adaptadores satisfacen estructuralmente esos contratos y mantienen la carga y serialización HTTP existentes. |
| Dependencia de la autenticación concreta | `ProductionActor` limita el contexto a identidad, roles, permisos y áreas usados por los casos de uso. |
| Decoradores NestJS en aplicación | Eliminados. `production-application.providers.ts` construye los servicios mediante factories tipadas, verificadas por las pruebas de composición. |
| Excepciones HTTP en aplicación | `ProductionError` describe errores de negocio; el filtro de presentación conserva códigos 400/403/404/409/422, mensajes y sobre HTTP. |
| Cálculos y validación mezclados con persistencia | Dominio concentra demanda y stock, planificación, entregas, recepción, integridad de cantidades, restricciones de estados y condiciones de cierre. |
| Protección de las dependencias | Pruebas de arquitectura rechazan imports de framework, ORM, entidades, DTO HTTP e infraestructura desde las capas internas. |
| Errores de tipos en tests señalados previamente | Corregidos; `calidad` incorpora ahora `typecheck` para revisar también los tests. |

Los adaptadores conservan consultas, bloqueos, comprobaciones de existencia y unicidad contra la base, secuencia de escrituras, historial y auditoría dentro de la misma transacción. Las reglas extraídas reciben valores o estructuras mínimas, sin un gestor de entidades. Las estructuras de lectura no sustituyen los mecanismos de selección de columnas de TypeORM ni actúan como filtros de seguridad de serialización.

La corrección de tests incluyó una tabla de casos de Pedidos que expandía los detalles como argumentos de Vitest: ahora comprueba explícitamente los mensajes de detalle vacío y presentación repetida. Los tests de Excel entregan un `ArrayBuffer` del tamaño correcto; el cifrado utiliza un `ConfigService` real de prueba y los fixtures de composición cumplen sus tipos sin una conversión incompatible.

Validación del 2 de noviembre de 2026:

- `npm --prefix backend run calidad`: control de tamaño, compilación, chequeo completo de tipos y **128 pruebas en 30 archivos aprobados**. Los 488 archivos activos cumplen el límite de 300 líneas.
- Producción general: **27 comprobaciones aprobadas**, incluida generación concurrente y rollback de emisión. Evidencia: `output/acceptance/icar-acceptance-1793626727777-66247/production.log`.
- Flujo Producción–Almacén: **12 comprobaciones aprobadas**. Evidencia: `output/acceptance/icar-acceptance-1793626727140-66234/production-plant.log`.
- Alcance por área: **aprobado**, incluidos porcentajes, entregas y rechazo de áreas ajenas. Evidencia: `output/acceptance/icar-acceptance-1793626781501-66566/production-scope.log`.
- Solicitudes para stock: **6 comprobaciones aprobadas**, incluida devolución, corrección y reenvío. Evidencia: `output/acceptance/icar-acceptance-1793626783363-66583/stock-requests.log`.

- Flujo integrado Pedidos–Producción–Almacén–Reparto: **22 comprobaciones aprobadas**. Evidencia: `output/acceptance/icar-acceptance-1793626834723-67507/workflow.log`.
- Los cinco entornos temporales se retiraron al terminar; `git diff --check` no encontró errores.

Los resultados previos y sus limitaciones se conservan como historial; los pendientes de tipos y dependencias internas descritos en las etapas anteriores quedan sustituidos por este estado. Las pruebas se ejecutaron sobre bases descartables, sin desplegar cambios sobre los servicios de trabajo.

## Duodécima etapa: revisión de archivos sin uso

El 2 de noviembre de 2026 se revisaron los grafos de imports y reexports de backend y frontend mediante resolución de módulos TypeScript. Se consideraron los puntos de entrada, las pruebas, el origen de datos de TypeORM y las migraciones cargadas dinámicamente. Se contrastaron los candidatos con referencias del resto del repositorio, comandos de `package.json`, configuración Angular, contenedores y recursos de interfaz.

Se eliminaron cuatro archivos:

| Archivo eliminado | Evidencia |
| --- | --- |
| `backend/src/modulos/seguridad/usuarios/dto/admin-reset-password.dto.ts` | Ninguna referencia a la clase o al archivo. El controlador vigente restablece la contraseña sin recibir ese DTO. |
| `backend/src/modulos/produccion/production-tracking.ts` | Reexportación de compatibilidad sin consumidores; aplicación y pruebas utilizan el dominio. |
| `backend/src/modulos/produccion/production-calculations.ts` | Reexportación utilizada únicamente por una prueba; la prueba ahora importa directamente el dominio. Se conservan las funciones y todas sus pruebas. |
| `frontend/public/favicon.svg` | Sin referencias; `index.html` utiliza `assets/icar-logo.jpg` como icono. |

Después de la limpieza se revisaron 466 archivos TypeScript del backend y 59 del frontend: no se detectaron más módulos de implementación sin conexión a los puntos de entrada. Los 18 recursos de interfaz y reportes restantes tienen referencias o son entradas de construcción. Los scripts de aceptación y operación se conservan porque son comandos ejecutables, no módulos de la aplicación. Las migraciones, respaldos, datos locales, documentación y evidencia de aceptación no se consideran código obsoleto por carecer de imports.

Validación: `npm --prefix backend run calidad` aprobado, con compilación, tipos y **128 pruebas en 30 archivos**; **485 archivos activos** dentro del límite de tamaño. `ngc -p tsconfig.app.json --noEmit` del frontend y `git diff --check` también aprobaron. No se repitió el empaquetado completo del frontend ni la aceptación HTTP: esta etapa eliminó archivos sin consumidores y cambió un import de prueba.

El resultado se refiere a archivos y referencias estáticas; no demuestra que todas las funciones, rutas o ramas de los módulos activos se utilicen en operación.
