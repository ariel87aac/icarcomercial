# Pruebas de aceptación consolidadas del Sistema Comercial ICAR

## 1. Identificación del documento

| Campo | Detalle |
| --- | --- |
| Proyecto | Sistema Comercial ICAR |
| Tipo de documento | Matriz consolidada de pruebas de aceptación |
| Fecha de ejecución registrada | 25 de octubre de 2026 |
| Entorno | Aplicación local ejecutada íntegramente con Docker Compose |
| Dirección de verificación | `http://localhost:8080/` |
| Base de datos | PostgreSQL del contenedor `database` |
| Responsable de ejecución | Equipo de desarrollo del trabajo dirigido |
| Resultado global automatizado | **139 comprobaciones aprobadas, 0 fallidas** |

## 2. Objetivo

Documentar en un solo lugar las pruebas de aceptación que verifican el comportamiento funcional del sistema desde la primera hasta la sexta iteración, incluidas las modificaciones posteriores de Productos, programación de pedidos, Almacén, Producción en planta y capacidad de vehículos.

El documento distingue entre:

- **Pruebas automatizadas:** ejecutadas contra la API y PostgreSQL mediante los scripts incluidos en `backend/scripts`.
- **Pruebas manuales o visuales:** requieren observar o utilizar la interfaz para comprobar textos, distribución, controles, alertas, ventanas y comportamiento interactivo.
- **Pruebas mixtas:** una parte se valida automáticamente y otra necesita inspección visual.

Los identificadores originales se conservan. Algunos números se repiten entre iteraciones debido a la numeración histórica; por ello deben citarse junto con su suite, por ejemplo, **I2–CP-33** o **I3–CP-33**.

## 3. Método y condiciones de aceptación

Las suites automatizadas crean datos temporales, ejecutan solicitudes autenticadas, comprueban las respuestas HTTP y consultan PostgreSQL cuando deben validar persistencia, integridad, auditoría o atomicidad. Al finalizar eliminan sus datos temporales, salvo que se configure expresamente su conservación.

Una prueba se considera aprobada cuando:

1. la respuesta HTTP coincide con el resultado esperado;
2. los datos persistidos conservan las relaciones y valores esperados;
3. una operación rechazada no produce cambios parciales;
4. los permisos impiden el acceso fuera del alcance del usuario;
5. el evento funcional o de auditoría requerido queda registrado; y
6. el script termina con código de salida `0`.

## 4. Resumen de ejecución automatizada

| Suite | Alcance principal | Comando | Casos | Resultado |
| --- | --- | --- | ---: | --- |
| Primera iteración | Autenticación, cuentas, roles, clientes, domicilios, zonas y auditoría | `docker compose exec -T backend npm run test:acceptance` | 20 | Aprobada |
| Segunda iteración y ajustes | Productos, precios, catálogo, pedidos, programación, reservas y Almacén | `docker compose exec -T backend npm run test:acceptance:iteration2` | 46 | Aprobada |
| Tercera iteración | Consolidación, planificación y seguimiento de Producción | `docker compose exec -T backend npm run test:acceptance:iteration3` | 25 | Aprobada |
| Cuarta iteración | Preparación, vehículos, rutas, despacho y entrega | `docker compose exec -T backend npm run test:acceptance:iteration4` | 20 | Aprobada |
| Quinta iteración | Seguimiento público, canal y mensajería | `docker compose exec -T backend npm run test:acceptance:iteration5` | 8 | Aprobada |
| Sexta iteración | Ventas, comprobantes, cobranza y cartera | `docker compose exec -T backend npm run test:acceptance:iteration6` | 13 | Aprobada |
| Producción–Almacén | Áreas, ejecución en planta, entrega y recepción | `docker compose exec -T backend npm run test:acceptance:production-flow` | 7 | Aprobada |
| **Total** |  |  | **139** | **Aprobado** |

Durante la ejecución de la quinta iteración se actualizó su dato de preparación para incluir `fecha_cierre_pedido` y `fecha_preparacion`, campos obligatorios incorporados por la programación de pedidos. Después de actualizar el fixture, sus ocho casos finalizaron correctamente.

## 5. Primera iteración: seguridad, clientes, domicilios, zonas y auditoría

Fuente automatizada: `backend/scripts/iteration-one.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-01 | Iniciar sesión con una cuenta interna activa devuelve una sesión válida. | Aprobada |
| CP-02 | Las credenciales inválidas se rechazan sin revelar si falló el usuario o la contraseña. | Aprobada |
| CP-03 | Una cuenta inactiva no puede autenticarse. | Aprobada |
| CP-04A | La contraseña inicial de una cuenta de cliente debe tener exactamente ocho caracteres. | Aprobada |
| CP-04B | Un cliente que ya tiene cuenta habilitada no admite una segunda cuenta. | Aprobada |
| CP-04 | La cuenta del cliente inicia sesión con su NIT o CI y conserva el vínculo con el cliente correcto. | Aprobada |
| CP-05 | Un cliente no puede consultar registros pertenecientes a otro cliente. | Aprobada |
| CP-06 | Una operación sin permiso obtiene HTTP 403 y no se ejecuta. | Aprobada |
| CP-07 | El rol de Ventas consulta los clientes autorizados por su perfil. | Aprobada |
| CP-08 | El alta de un cliente genera el evento de auditoría correspondiente. | Aprobada |
| CP-09 | Un NIT o CI duplicado se rechaza mediante un conflicto controlado. | Aprobada |
| CP-10 | Las coordenadas fuera de rango se rechazan y no alteran el domicilio persistido. | Aprobada |
| CP-11 | Una zona activa conserva y expone su día programado de distribución. | Aprobada |
| CP-12 | La consulta de auditoría permite filtrar eventos y no expone contraseñas, tokens ni secretos. | Aprobada |
| CP-04C | Los cambios de NIT o CI, correo y contacto del cliente se sincronizan con su cuenta principal. | Aprobada |
| HU-01 | Cerrar sesión invalida en el servidor la sesión renovable anterior. | Aprobada |
| CP-USU-07 | Los usuarios reciben un código numérico automático y se listan de menor a mayor. | Aprobada |
| CP-USU-08 | Un usuario sin operaciones puede eliminarse; la cuenta en uso se protege y la acción queda auditada. | Aprobada |
| CP-CLI-01 | Los clientes reciben un código numérico automático, se ordenan de menor a mayor y pueden buscarse por ese código. | Aprobada |
| CP-CLI-06 | Un cliente sin relaciones puede eliminarse; los clientes relacionados permanecen protegidos y el borrado queda auditado. | Aprobada |

## 6. Segunda iteración y modificaciones posteriores

Fuente automatizada: `backend/scripts/iteration-two.acceptance.mjs`.

### 6.1 Programación y alcance de pedidos

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-36 | Los horarios de cierre y límite de consolidación sólo pueden configurarlos usuarios autorizados. | Aprobada |
| CP-37 | El calendario ofrece los días activos de la zona, exige cliente al personal interno y respeta el alcance del cliente autenticado. | Aprobada |
| CP-38 | El pedido conserva separadas la fecha de registro, el cierre, la preparación y la entrega. | Aprobada |
| CP-39 | El cliente puede modificar cantidades de su pedido `RECIBIDO` mientras el cierre siga abierto. | Aprobada |
| CP-40 | Al vencer el cierre se bloquea la edición y se permite reprogramar a la siguiente fecha abierta o cancelar. | Aprobada |

### 6.2 Administración de Productos

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-123 | Una unidad sin asignaciones puede eliminarse y la acción queda auditada. | Aprobada |
| CP-124 | Una unidad utilizada por productos o presentaciones no puede eliminarse. | Aprobada |
| CP-125 | Las unidades tienen código numérico estable y se listan de menor a mayor. | Aprobada |
| CP-126 | Una línea productiva sin asignaciones puede eliminarse y la acción queda auditada. | Aprobada |
| CP-127 | Una línea asignada a productos no puede eliminarse. | Aprobada |
| CP-128 | Las líneas productivas tienen código numérico estable y orden ascendente. | Aprobada |
| CP-129 | Una categoría sin asignaciones puede eliminarse y la acción queda auditada. | Aprobada |
| CP-130 | Una categoría utilizada por productos, áreas o producción no puede eliminarse. | Aprobada |
| CP-131 | Las categorías tienen código numérico estable y se listan de menor a mayor. | Aprobada |
| CP-132 | Un producto sin presentaciones ni producción asociada puede eliminarse y la acción queda auditada. | Aprobada |
| CP-133 | Un producto con presentaciones o producción asociada no puede eliminarse. | Aprobada |
| CP-134 | El código de producto se genera automáticamente como entero, no admite ingreso manual y se ordena numéricamente. | Aprobada |
| CP-135 | Un producto sin imagen puede crearse o modificarse y queda disponible el logotipo ICAR como reemplazo visual. | Aprobada |
| CAT-EDIT-01 | La edición de categoría y línea de un producto persiste y se conserva después de recargarlo. | Aprobada |
| IMG-01 | Una imagen PNG mayor a 1 MB y menor o igual al límite de 2 MB se guarda en PostgreSQL y puede leerse autenticadamente. | Aprobada |

### 6.3 Precios y catálogo comercial

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| PRICE-MATRIX-01 | La matriz presenta Público, Minorista, Distribuidor y Mayorista y persiste los cambios mediante una actualización masiva. | Aprobada |
| PRICE-EDIT-01 | El precio modificado persiste y se refleja tanto en la lista administrativa como en el catálogo. | Aprobada |
| CP-13 | El catálogo del cliente muestra únicamente productos activos con su precio aplicable. | Aprobada |
| CP-14 | Una presentación inactiva desaparece del catálogo sin eliminarse físicamente. | Aprobada |
| CP-15 | Cada tipo de cliente recibe exclusivamente su precio vigente. | Aprobada |
| CP-16 | Se rechazan periodos de precio superpuestos para la misma presentación y tipo de cliente. | Aprobada |

### 6.4 Pedidos, inventario, reservas y cancelación

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-17 | El cliente crea y consulta un pedido propio en estado `BORRADOR` con su detalle. | Aprobada |
| CP-18 | Un cliente no accede a pedidos ajenos y el intento rechazado queda auditado. | Aprobada |
| CP-19 | El personal comercial registra un pedido para un cliente autorizado. | Aprobada |
| CP-20 | Se rechaza una entrega cuyo cierre configurable ya finalizó. | Aprobada |
| CP-21 | Se rechaza una fecha incompatible con el día de reparto del domicilio. | Aprobada |
| CP-22 | Enviar un borrador registra el estado `RECIBIDO`, responsable y fecha. | Aprobada |
| CP-23 | Devolver un pedido conserva la observación y ambos estados en el historial. | Aprobada |
| CP-24 | Un pedido `CONFIRMADO` conserva su versión y rechaza modificaciones comerciales. | Aprobada |
| CP-25 | La confirmación con saldo suficiente reserva toda la cantidad solicitada. | Aprobada |
| CP-26 | Un pedido superior al físico compromete la cantidad completa, conserva la cobertura de Almacén y deja Disponible negativo. | Aprobada |
| CP-27 | Dos confirmaciones concurrentes comprometen todos los pedidos y calculan la cobertura física sin colisiones. | Aprobada |
| CP-28 | Un error durante la confirmación revierte reservas, historial y estado. | Aprobada |
| CP-29 | Ingresos y ajustes conservan saldo, motivo, usuario y fecha. | Aprobada |
| CP-30 | Un ajuste que dejaría saldo negativo se rechaza sin alterar inventario. | Aprobada |
| CP-31 | La disponibilidad equivale a físico menos toda la cantidad reservada; si es negativa activa la alerta de abastecimiento. | Aprobada |
| CP-32 | El historial conserva cronológicamente los estados y responsables del pedido. | Aprobada |
| CP-33 | Cancelar un borrador no lo elimina, conserva el motivo y evita una segunda cancelación. | Aprobada |
| CP-34 | El cliente puede cancelar su pedido `RECIBIDO` y la transición queda registrada. | Aprobada |
| CP-35 | Cancelar un pedido `CONFIRMADO` libera la reserva sin modificar la existencia física. | Aprobada |
| CP-121 | Almacén devuelve sólo productos con existencia física, ordenados por código ascendente, con filtros dinámicos de búsqueda, categoría y línea. | Aprobada |

## 7. Tercera iteración: consolidación y Producción

Fuente automatizada: `backend/scripts/iteration-three.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-38 | Una presentación sin factor de conversión válido se rechaza de forma controlada. | Aprobada |
| CP-33 | La consolidación agrupa pedidos confirmados sin mezclar presentaciones. | Aprobada |
| CP-34 | Las fechas de entrega se mantienen en consolidaciones separadas. | Aprobada |
| CP-35 | Las líneas productivas se mantienen separadas. | Aprobada |
| CP-36 | Cada presentación se convierte a unidad base antes de sumar. | Aprobada |
| CP-122 | El requerimiento descuenta únicamente el saldo reservado por Almacén para cada pedido. | Aprobada |
| CP-37 | Se conserva trazabilidad desde el consolidado hasta cada detalle de pedido de origen. | Aprobada |
| CP-123 | El ajuste por batch/capacidad completa un lote sin alterar el faltante ni la solicitud para stock. | Aprobada |
| CP-124 | El recálculo conserva por separado la solicitud para stock y el ajuste técnico. | Aprobada |
| CP-39 | Recalcular es idempotente y no duplica fuentes ni consolidaciones principales. | Aprobada |
| CP-41 | Una versión `EMITIDA` queda inmutable. | Aprobada |
| CP-42 | Una confirmación posterior se incorpora solamente en una versión complementaria. | Aprobada |
| CP-43 | Pendiente y diferencia se calculan a partir del plan y la cantidad producida. | Aprobada |
| CP-44 | El primer avance válido cambia la orden de `EMITIDA` a `EN_PROCESO`. | Aprobada |
| CP-45 | Los avances parciales son acumulativos y recalculan la diferencia. | Aprobada |
| CP-46 | La orden se cierra automáticamente al recibir la entrega final sin diferencia. | Aprobada |
| CP-47 | Un faltante final produce diferencia negativa y exige observación. | Aprobada |
| CP-48 | Un excedente produce diferencia positiva y conserva su observación. | Aprobada |
| CP-49 | La consolidación conserva la secuencia de estados y eventos. | Aprobada |
| CP-50 | El historial identifica usuario, fecha y observación de cada avance. | Aprobada |
| CP-51 | La matriz de permisos separa Comercialización, Producción y Gerencia. | Aprobada |
| CP-40 | Dos generaciones concurrentes no duplican versiones ni fuentes. | Aprobada |
| CP-52 | Un fallo durante la emisión revierte estado, historial y auditoría. | Aprobada |
| CP-53 | El resumen filtra por fecha y línea y muestra solicitado, producido, pendiente y diferencia. | Aprobada |
| CP-54 | El rol de Producción accede a todas las líneas y conserva el filtro de línea operativo. | Aprobada |

## 8. Cuarta iteración: preparación y distribución

Fuente automatizada: `backend/scripts/iteration-four.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-55 | Sólo son elegibles pedidos confirmados que no tengan preparación activa. | Aprobada |
| CP-56 | No puede existir una segunda preparación activa para el mismo pedido. | Aprobada |
| CP-57 | Se exponen cantidades solicitada, reservada, disponible, preparada y pendiente. | Aprobada |
| CP-59 | No se permite preparar una cantidad superior a la solicitada. | Aprobada |
| CP-58 | Una cantidad menor calcula diferencia negativa y deja la preparación `OBSERVADA`. | Aprobada |
| CP-60 | Una diferencia no puede confirmarse sin observación. | Aprobada |
| CP-61 | La confirmación verifica todos los detalles y registra historial. | Aprobada |
| CP-62 | La capacidad máxima en kg es obligatoria al registrar un vehículo. | Aprobada |
| CP-63 | La ruta calcula la carga total e informa cuánto excede la capacidad del vehículo. | Aprobada |
| CP-65 | Una ruta cuya carga supera la capacidad no puede planificarse. | Aprobada |
| CP-68 | El vehículo puede cambiarse mientras la ruta esté en borrador y el cambio queda en historial. | Aprobada |
| CP-64 | Una preparación no puede asignarse a dos rutas activas. | Aprobada |
| CP-67 | Las posiciones manuales de entrega se guardan únicas y consecutivas. | Aprobada |
| CP-66 | La ruta planificada conserva coordenadas válidas para el mapa. | Aprobada |
| CP-70 | Registrar la salida consume reservas, disminuye existencia y cambia estados dentro de una transacción. | Aprobada |
| CP-79 | Dos salidas simultáneas no consumen dos veces la misma reserva. | Aprobada |
| CP-72 | Un repartidor no asignado no puede registrar una visita. | Aprobada |
| CP-73 | La entrega completa conserva cantidades, fecha y responsable. | Aprobada |
| CP-78 | La liquidación operativa no registra pagos ni comprobantes financieros. | Aprobada |
| CP-80 | El historial conserva eventos cronológicos con usuario y fecha. | Aprobada |

## 9. Quinta iteración: seguimiento y mensajería

Fuente automatizada: `backend/scripts/iteration-five.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-81 | La migración registra los permisos de seguimiento y mensajería. | Aprobada |
| CP-83 | Un token inexistente devuelve una respuesta pública uniforme sin revelar información. | Aprobada |
| CP-82 | El token de seguimiento se muestra una vez y PostgreSQL conserva únicamente su hash. | Aprobada |
| CP-84 | La vista pública expone sólo referencia protegida, estado, estimación e historial autorizado. | Aprobada |
| CP-85 | Renovar un enlace revoca el anterior y deja exactamente un enlace activo. | Aprobada |
| CP-86 | La consulta autenticada reutiliza el seguimiento sin volver a revelar el token. | Aprobada |
| CP-87 | Revocar el enlace lo invalida inmediatamente. | Aprobada |
| CP-88 | El token de LimiteAPI se cifra y la API sólo devuelve una máscara con sus últimos tres caracteres. | Aprobada |
| CP-89 | El registro de pruebas enmascara destinatarios y no expone credenciales. | Aprobada |
| CP-90–CP-95 | La prueba manual del canal valida permisos, registra respuestas sanitizadas y separa el diagnóstico de la cola operativa. | Implementada; entrega real pendiente de validación manual con credenciales y destinatario autorizados. |

La suite no envía mensajes reales. La configuración creada durante la prueba permanece inactiva y se elimina al finalizar.

## 10. Sexta iteración: ventas y cobranza

Fuente automatizada: `backend/scripts/iteration-six.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-107 | La migración registra permisos comerciales y de cartera. | Aprobada |
| CP-108 | Los medios de pago activos están disponibles. | Aprobada |
| CP-109 | La venta se genera desde una entrega efectiva con total y saldo consistentes. | Aprobada |
| CP-110 | Una entrega no puede originar dos ventas vigentes. | Aprobada |
| CP-111 | El comprobante interno puede descargarse en PDF. | Aprobada |
| CP-112 | Registrar un pago no modifica el saldo antes de confirmarlo. | Aprobada |
| CP-113 | Confirmar un pago lo aplica atómicamente y actualiza saldo y estado. | Aprobada |
| CP-114 | El estado de cuenta conserva débitos, créditos y saldo resultante. | Aprobada |
| CP-115 | La cartera clasifica ventas por estado y antigüedad. | Aprobada |
| CP-116 | El reporte de ventas se exporta en CSV y PDF utilizando los mismos filtros. | Aprobada |
| CP-117 | Anular un pago genera el contramovimiento y restaura el saldo. | Aprobada |
| CP-118 | Una venta sin pagos vigentes se anula sin eliminación física. | Aprobada |
| CP-119 | Confirmar el pago registra de manera idempotente el evento `payment.received`. | Aprobada |

## 11. Modificación complementaria: Producción en planta y recepción en Almacén

Fuente automatizada: `backend/scripts/production-plant.acceptance.mjs`.

| Caso | Validación realizada | Resultado |
| --- | --- | --- |
| CP-P01 | Las áreas se configuran con categorías existentes y una categoría no se asigna a dos áreas. | Aprobada |
| CP-P02 | Una orden sin origen se rechaza y una orden sin pedidos se genera desde una solicitud comercial para stock. | Aprobada |
| CP-P03 | La solicitud para stock permanece separada del ajuste técnico de Producción. | Aprobada |
| CP-P04 | La planta inicia cada producto y exige documentar diferencias en la cantidad real. | Aprobada |
| CP-P05 | La entrega de Producción no modifica existencias antes de la recepción de Almacén. | Aprobada |
| CP-P06 | Almacén acepta, registra observación, ingresa la misma presentación y permite cerrar la orden. | Aprobada |
| CP-P07 | La trazabilidad conserva generación, emisión, inicio, entrega, recepción y cierre por producto. | Aprobada |

## 12. Pruebas manuales y visuales complementarias

Los siguientes casos están documentados porque su aceptación depende de la presentación o interacción de la interfaz. Cuando una regla también tiene respaldo automatizado se indica como prueba mixta.

- **Automatizada:** la regla ya forma parte de las 139 comprobaciones aprobadas de la sección 4.
- **Mixta:** la regla de negocio está respaldada automáticamente, pero su presentación o interacción visual debe acompañarse con evidencia manual.
- **Manual:** el caso y su resultado esperado están definidos, pero no se incluyen en el total automatizado; deben ejecutarse y adjuntar una captura antes de declararlos aprobados en el informe final.

Los casos de esta sección que repiten una validación automatizada no se vuelven a sumar al total general.

### 12.1 Catálogo, carrito y programación de pedidos

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CP-41 | Con productos en el carrito para un cliente, intentar seleccionar otro cliente. | El cliente no cambia y aparece una alerta para concluir el pedido o vaciar el carrito. | Manual |
| CP-42 | Usar los botones `−` y `+` y luego escribir manualmente una cantidad. | La cantidad varía en una unidad con los botones, admite edición manual y recalcula el subtotal. | Manual |
| CP-43 | Intentar crear o modificar un pedido después del cierre. | Aparece la ventana **Cierre de pedido finalizado** con las opciones de siguiente fecha o cancelación. | Mixta |
| CP-120 | Abrir el módulo administrativo desde el menú. | El menú y el encabezado muestran **Productos** y mantienen Productos, Categorías, Líneas, Unidades y Precios. | Manual |

### 12.2 Precios por tipo de cliente

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| PRE-01 | Abrir el alta o edición de un cliente. | Sólo aparecen Público, Minorista, Distribuidor y Mayorista; no existe Lista comercial. | Manual |
| PRE-02 | Abrir **Productos → Precios**. | Las columnas aparecen en el orden definido para producto, presentación, cuatro tipos y última modificación. | Manual |
| PRE-03 | Cambiar importes sin pulsar **Actualizar**. | Las celdas se distinguen visualmente y todavía no se persisten. | Manual |
| PRE-04 | Pulsar **Actualizar** y cancelar el modal. | No se envía ni persiste la actualización. | Manual |
| PRE-05 | Pulsar **Actualizar** y aceptar el modal. | Los importes se guardan juntos y cambia la última modificación. | Mixta |
| PRE-06 | Consultar el catálogo con un cliente de cada tipo. | Cada cliente recibe exclusivamente el precio vigente de su tipo. | Automatizada |
| PRE-07 | Consultar auditoría después de la actualización. | Existe `ACTUALIZAR_PRECIOS_MASIVO` con el resumen de precios afectados. | Automatizada |
| PRE-08 | Escribir parte del código o nombre en el buscador. | La tabla se filtra dinámicamente sin perder cambios pendientes. | Manual |
| PRE-09 | Pulsar las flechas de un precio. | Cada pulsación incrementa o disminuye exactamente Bs 1. | Manual |
| PRE-10 | Seleccionar y limpiar una categoría. | La tabla combina categoría y búsqueda y vuelve a mostrar todo al limpiar. | Manual |

### 12.3 Almacén

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CP-121A | Abrir Existencias con productos de saldo positivo y cero. | Sólo aparecen presentaciones con existencia física mayor que cero. | Automatizada |
| CP-121B | Revisar una fila con existencia. | La primera columna muestra el código de producto; se muestran categoría, línea, producto y presentación, sin columna de imagen. | Mixta |
| CP-121C | Revisar productos con códigos diferentes. | La primera columna queda ordenada numéricamente de menor a mayor. | Mixta |
| CP-121D | Iniciar sesión sin permiso `inventory.read`. | La opción **Almacén** no aparece. | Manual |
| CP-121E | Seleccionar categoría y línea en Existencias. | Ambos filtros se combinan y sólo se muestran los saldos coincidentes. | Mixta |
| CP-121F | Escribir parte de un código, producto o presentación. | La tabla se filtra automáticamente sin presionar un botón y conserva los demás filtros. | Manual |
| CP-121J | Crear dos solicitudes de abastecimiento con la misma fecha requerida. | Ambas quedan en Borrador con códigos numéricos consecutivos. | Automatizada |
| CP-121K | Enviar y generar dos solicitudes de la misma fecha desde la bandeja de Producción. | Cada solicitud conserva su propia orden y cantidades; la segunda orden es complementaria. | Automatizada |
| CP-121L | Migrar solicitudes con códigos discontinuos y crear dos nuevas. | Los registros quedan numerados desde 1 y las nuevas solicitudes continúan la correlación sin duplicados. | Automatizada |
| CP-121M | Consultar una solicitud con pedidos confirmados no cubiertos. | La tabla omite Demanda y Faltante; Disponible muestra en rojo el saldo proyectado negativo. | Mixta |
| CP-121N | Revisar el detalle de una solicitud de abastecimiento. | La primera columna muestra el ID numérico del producto y el resto de columnas utiliza anchos compactos. | Manual |
| CP-121O | Confirmar un pedido de 200 unidades con 170 físicas. | Reservado global queda en 200, Disponible en −30 y Almacén muestra una alerta para crear la solicitud de abastecimiento. | Automatizada y visual |

### 12.4 Planificación neta de Producción

| Caso | Acción manual o regla | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CP-122A | Generar orden para demanda 8 con 3 reservadas. | Pedidos 8, cubierto por Almacén 3, faltante 5 y plan inicial 5. | Automatizada |
| CP-122B | Consolidar dos presentaciones con factores diferentes. | Cada cantidad se convierte antes de sumar. | Automatizada |
| CP-122C | Consolidar un pedido totalmente cubierto. | El detalle conserva trazabilidad con faltante y plan en cero. | Automatizada |
| CP-123A | Agregar un ajuste técnico de 2 unidades para completar un batch de 10 con base 8. | La base permanece 8, el ajuste queda 2 y el plan 10. | Automatizada |
| CP-123B | Intentar guardar plan 7 cuando faltante más solicitud para stock es 8. | HTTP 422 y ningún cambio. | Automatizada |
| CP-123C | Consultar con un usuario de Producción que tenga áreas asignadas. | Sólo puede trabajar con los productos de sus áreas. | Mixta |
| CP-123D | Intentar ajustar con usuario de Gerencia. | HTTP 403 y registro del rechazo. | Automatizada |
| CP-124A | Recalcular un plan 10 cuya base sigue en 8. | Conserva plan 10 y ajuste técnico 2. | Automatizada |
| CP-124B | Recalcular cuando la nueva base supera el plan anterior. | El plan respeta la nueva base y conserva sus componentes sin duplicarlos. | Automatizada |
| CP-124C | Intentar ajustar una orden emitida. | HTTP 409 y versión inmutable. | Automatizada |
| CP-124D | Completar exactamente un plan de 10. | Pendiente y diferencia quedan en cero y no exige incidencia. | Automatizada |

### 12.5 Producción en planta

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| PA-PROD-01 | Generar una orden para una fecha con pedidos o solicitud para stock. | Se crea un único borrador; sin ninguno de esos orígenes se rechaza y no existe una opción separada de orden manual. | Mixta |
| PA-PROD-02 | Agregar cantidad para completar batch o capacidad. | Se registra como ajuste técnico sin alterar pedidos, faltante ni solicitud para stock. | Mixta |
| PA-PROD-03 | Enviar una solicitud para stock de un producto sin pedido y generar la orden. | Pedidos y faltante quedan en cero y el plan usa la cantidad solicitada por Comercial. | Mixta |
| PA-PROD-04 | Emitir con categoría sin área y luego configurarla. | Se rechaza la emisión sin área; cada categoría pertenece como máximo a un área. | Mixta |
| PA-PROD-05 | Iniciar una fila de una orden emitida. | Sólo esa fila cambia a `EN_PROCESO`. | Mixta |
| PA-PROD-06 | Entregar una cantidad real diferente del plan. | La incidencia es obligatoria y se conserva la diferencia. | Mixta |
| PA-PROD-07 | Entregar desde Producción sin recepción. | Queda `PENDIENTE_RECEPCION` y la existencia no cambia. | Automatizada |
| PA-PROD-08 | Aceptar la entrega en Almacén. | Aumenta la misma presentación y se crea un movimiento `INGRESO_PRODUCCION`; una diferencia exige observación. | Automatizada |
| PA-PROD-09 | Aceptar entregas parciales y finales. | Cada fila muestra su etapa y la orden sólo cierra cuando todas son terminales. | Mixta |
| PA-PROD-10 | Preparar menos cantidad que la solicitada. | Se exige observación, se conserva la diferencia y nunca se supera lo solicitado. | Mixta |

### 12.6 Vehículos, rutas y mapas

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CP-62 | Intentar registrar un vehículo sin capacidad. | La operación se rechaza y el vehículo no se crea. | Automatizada |
| CP-63 | Asignar 20 kg a un vehículo de 15 kg. | La ruta informa 20 kg de carga, 15 kg de capacidad y 5 kg de excedente. | Mixta |
| CP-65 | Intentar planificar la ruta excedida. | La planificación se rechaza y solicita cambiar el vehículo. | Automatizada |
| CP-68 | Cambiar por un vehículo con capacidad suficiente. | La ruta queda dentro de capacidad y el cambio aparece en el historial. | Mixta |
| Control visual de capas | Abrir el mapa de distribución y cambiar de capa. | El usuario puede alternar entre OpenStreetMap y vista satélite sin perder puntos ni secuencia. | Manual |

### 12.7 Maestro de clientes

| Caso | Acción manual | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CLI-01 | Crear clientes, consultar la lista y buscar uno por su código. | El código se genera automáticamente, la lista queda ordenada y la búsqueda localiza al cliente. | Automatizada |
| CLI-02 | Abrir el módulo Clientes. | La tabla muestra `Cod-Cliente`, `Cliente`, `Tipo`, `Contacto`, `Estado` y `Acciones`, sin columnas de detalle repetidas. | Manual |
| CLI-03 | Comparar clientes Público, Minorista, Distribuidor y Mayorista. | El tipo conserva su texto y se resalta con un color diferenciable. | Manual |
| CLI-04 | Presionar el botón de información. | El modal muestra identificación, contacto, condición comercial, cuenta, domicilios, distribución, coordenadas y fechas. | Manual |
| CLI-06 | Presionar eliminar para un cliente libre y para uno relacionado. | Se muestra confirmación; el cliente libre se elimina y el relacionado presenta un rechazo controlado. | Mixta |
| CLI-07 | Escribir en el buscador y cambiar tipo, estado o zona. | Los resultados se actualizan automáticamente; no aparece filtro por día ni botón de aplicación. | Manual |

## 13. Evidencia y trazabilidad

| Área | Documento detallado |
| --- | --- |
| Primera iteración | `docs/iteracion-1.md` |
| Segunda iteración | `docs/iteracion-2.md` |
| Tercera iteración | `docs/iteracion-3.md` |
| Cuarta iteración | `docs/iteracion-4.md` |
| Quinta iteración | `docs/iteracion-5.md` |
| Sexta iteración | `docs/iteracion-6.md` |
| Productos | `docs/pruebas-aceptacion-productos.md` |
| Precios por tipo | `docs/pruebas-aceptacion-precios-por-tipo.md` |
| Programación de pedidos | `docs/pruebas-aceptacion-programacion-pedidos.md` |
| Almacén | `docs/pruebas-aceptacion-almacen.md` |
| Producción neta | `docs/pruebas-aceptacion-produccion-neta.md` |
| Producción en planta | `docs/pruebas-aceptacion-produccion-planta.md` |
| Capacidad de vehículos | `docs/pruebas-aceptacion-capacidad-vehiculos.md` |
| Usuarios y líneas productivas | `docs/pruebas-aceptacion-usuarios.md` |
| Clientes | `docs/pruebas-aceptacion-clientes.md` |

## 14. Procedimiento de repetición

1. Levantar el entorno mediante `docker compose up -d --build`.
2. Confirmar que `database`, `backend` y `frontend` estén saludables.
3. Ejecutar las siete suites en el orden indicado en la sección 4.
4. Verificar que cada suite termine con código `0` y elimine sus datos temporales.
5. Ejecutar los controles manuales de la sección 12 con los roles indicados.
6. Adjuntar capturas de los controles visuales y la salida de consola de las suites al informe final.

Las suites deben ejecutarse secuencialmente porque comparten la misma base de datos local y crean datos temporales relacionados.

## 15. Criterio global de aprobación

El sistema se considera aceptado para el alcance implementado cuando:

- las **139 comprobaciones automatizadas** continúan aprobadas;
- no existe ninguna prueba automatizada fallida;
- los controles manuales aplicables muestran el comportamiento documentado;
- las alertas y rechazos no dejan cambios parciales;
- la auditoría identifica usuario, acción, entidad y fecha sin guardar secretos; y
- cualquier nueva modificación incorpora o actualiza su caso de aceptación y mantiene la regresión completa aprobada.
