# Primera iteración seguridad usuarios y clientes

## Alcance

La primera iteración implementa exclusivamente autenticación, autorización por roles y permisos, auditoría, usuarios internos, cuentas vinculadas a clientes, clientes, domicilios, coordenadas, zonas y días de distribución.

La cuenta de cliente queda vinculada a un solo registro comercial y solo puede consultar la información de ese cliente. Su administración está unificada con el maestro de clientes: no existe un menú paralelo de cuentas. La creación y gestión de pedidos no pertenece a esta iteración.

## Historias cubiertas

| Historia | Evidencia funcional |
| --- | --- |
| HU-01 | Inicio, renovación y cierre de sesión; rechazo de credenciales o cuentas inactivas. |
| HU-02 | Cuenta de tipo `CLIENTE`, vínculo en `clientes_usuarios` y alcance de datos por `customerId`. |
| HU-03 | Administración de usuarios internos, roles y permisos. |
| HU-04 | Habilitación y deshabilitación de una cuenta desde el cliente, usando su NIT/CI como usuario. |
| HU-05 | Registro, edición, activación, desactivación, búsqueda y filtros de clientes. |
| HU-06 | Domicilios, coordenadas validadas, OpenStreetMap, zonas y días programados. |
| HU-07 | Registro y consulta de auditoría sin contraseñas, tokens ni secretos. |

## Matriz de permisos

| Rol | Usuarios y roles | Clientes y cuentas | Domicilios y zonas | Auditoría |
| --- | --- | --- | --- | --- |
| `ADMINISTRADOR` | Gestiona | Gestiona | Gestiona | Consulta |
| `COMERCIALIZACION` | Sin acceso administrativo | Gestiona | Gestiona | Sin acceso salvo asignación expresa |
| `CLIENTE` | Sin acceso | Consulta datos propios | Consulta domicilios propios | Sin acceso |

La interfaz utiliza esta matriz para ocultar funciones. La API vuelve a validar la sesión, el permiso requerido y el vínculo de cliente en cada recurso protegido.

## Rutas de la API

La API conserva las rutas internas en inglés y ofrece los alias en español definidos en la documentación funcional.

| Método | Ruta documentada | Función |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Inicia la sesión y emite cookies HTTP-only. |
| `POST` | `/api/auth/refresh` | Renueva la sesión vigente. |
| `POST` | `/api/auth/logout` | Revoca la sesión renovable. |
| `GET / PATCH` | `/api/me` | Consulta o actualiza nombre y teléfono propios habilitados. |
| `GET / POST` | `/api/usuarios` | Consulta o registra usuarios internos. |
| `PATCH` | `/api/usuarios/:id` | Modifica datos, roles o estado de un usuario interno. |
| `DELETE` | `/api/usuarios/:id` | Elimina un usuario interno sin operaciones asociadas, protegiendo la cuenta en uso y el último administrador activo. |
| `GET / POST` | `/api/roles` | Consulta o registra roles y permisos. |
| `GET / POST` | `/api/clientes` | Consulta o registra clientes según alcance. |
| `PATCH` | `/api/clientes/:id` | Modifica un cliente autorizado. |
| `POST` | `/api/clientes/:id/usuarios` | Habilita la cuenta del cliente con una contraseña inicial de 8 caracteres. |
| `PATCH` | `/api/clientes/:id/usuarios/:userId` | Habilita o deshabilita la cuenta vinculada. |
| `GET / POST` | `/api/clientes/:id/domicilios` | Consulta o registra domicilios. |
| `PATCH` | `/api/domicilios/:id` | Actualiza dirección, zona o coordenadas. |
| `GET / POST / PATCH` | `/api/zonas` | Mantiene zonas y días programados. |
| `GET` | `/api/auditoria` | Filtra eventos por usuario, acción, entidad, resultado y fechas. |

## Persistencia

La migración `1720000002000-add-customer-accounts.ts` incorpora:

- El tipo de usuario `INTERNO` o `CLIENTE`.
- La tabla `clientes_usuarios` con vínculo único de cada cuenta a un cliente.
- Estado y cuenta principal dentro del vínculo.
- El permiso `customer_accounts.create`.
- Los permisos mínimos de `COMERCIALIZACION` y `CLIENTE` para el alcance de la iteración.

Las coordenadas se almacenan juntas y se restringen a latitud `-90..90` y longitud `-180..180`. Los domicilios, zonas y días mantienen claves foráneas, restricciones de horario e índices de consulta.

Como ajuste de aceptación posterior, `1720000018000-unify-customer-types-and-prices.ts` elimina la lista comercial libre y deja exactamente cuatro tipos de cliente: `PUBLICO`, `MINORISTA`, `DISTRIBUIDOR` y `MAYORISTA`. El formulario de cliente y la API utilizan únicamente este tipo; ya no existe un campo paralelo que pueda contradecirlo.

La migración `1720000024000-add-user-code-and-delete.ts` incorpora un código numérico correlativo para cada usuario y el permiso `users.delete`, asignado inicialmente al rol `ADMINISTRADOR`. La tabla administrativa se ordena de menor a mayor por este código. La eliminación es física únicamente cuando las claves foráneas confirman que la cuenta no tiene operaciones asociadas; además se impide eliminar la cuenta autenticada y el último administrador activo.

La migración `1720000025000-add-customer-code.ts` incorpora un código numérico correlativo, único y automático para cada cliente. Los registros existentes se numeran según su fecha de creación; las altas posteriores usan la secuencia de PostgreSQL. La consulta de clientes se ordena por código y permite buscarlo sin que el operador deba escribirlo durante el alta.

La migración `1720000026000-add-customer-delete.ts` añade `customers.delete` al rol `ADMINISTRADOR`. Un cliente sólo puede eliminarse físicamente cuando no tiene cuenta, domicilios, pedidos, ventas ni otras operaciones asociadas; los rechazos no modifican información y el borrado exitoso registra `ELIMINAR_CLIENTE` en auditoría.

## Ajuste posterior de aceptación: cliente y cuenta unificados

La gestión separada de **Cuentas de clientes** se eliminó porque duplicaba datos y permitía que el operador escribiera una identidad distinta a la registrada en el cliente. La única acción disponible ahora se encuentra en la fila del maestro **Clientes** y se denomina **Habilitar cuenta de cliente**.

Se aplican estas reglas:

- El cliente debe tener NIT o CI y correo antes de habilitar su acceso.
- El nombre de usuario se obtiene del campo NIT/CI; el operador no puede escribir otro valor.
- Nombre, correo y teléfono se toman del registro del cliente.
- La contraseña inicial debe tener exactamente 8 caracteres. Esta regla es exclusiva de la cuenta de cliente; los usuarios internos conservan su política fuerte.
- Solo se permite habilitar una cuenta nueva por cliente. Si ya existe una cuenta, la interfaz ofrece habilitarla o deshabilitarla y la API rechaza un segundo alta.
- Si se modifican NIT/CI, correo, contacto, razón social o teléfono del cliente, la cuenta principal vinculada se mantiene sincronizada.
- Las cuentas históricas adicionales se muestran en la fila del cliente para que ningún acceso existente quede oculto; no se eliminan automáticamente.

El cuerpo de creación ya no acepta identidad duplicada. La API deriva esos datos del cliente:

```json
{
  "password": "Cli12345"
}
```

## Auditoría

Se registran inicios y cierres de sesión, accesos denegados, creación y modificación de registros, cambios de estado y administración de cuentas de clientes. Los metadatos pasan por un saneamiento que elimina campos relacionados con contraseñas, tokens, cookies, autorización y secretos.

La consulta admite `userId`, `action`, `entity`, `result`, `from` y `to`, además de módulo e identificador de entidad.

## Impacto posterior del flujo de Producción

La ampliación operativa de la tercera iteración no cambia la autenticación ni el modelo de usuarios de esta iteración. Sí utiliza su esquema de roles, permisos y auditoría para incorporar `production.areas.read`, `production.areas.manage`, `production.execution.manage`, `production.receipts.read` y `production.receipts.accept`.

Los cambios de áreas, el inicio de elaboración, las cantidades entregadas por Producción y la aceptación de Almacén se registran con usuario y fecha. Las incidencias y observaciones operativas se conservan, pero no se almacenan credenciales ni secretos dentro de esos eventos.

## Pruebas de aceptación

El script `backend/scripts/iteration-one.acceptance.mjs` ejecuta CP-01 a CP-12 y las comprobaciones adicionales CP-04A/CP-04B/CP-04C, CP-USU-07, CP-USU-08, CP-CLI-01 y CP-CLI-06: acceso válido, credenciales inválidas, cuenta inactiva, cuenta de cliente, aislamiento entre clientes, permiso insuficiente, gestión institucional, alta auditada, duplicidad, coordenadas inválidas, zona con día, auditoría filtrada, códigos automáticos y eliminaciones controladas. También comprueba que el cierre de sesión invalide la sesión anterior.

| Caso | Preparación y acción | Resultado esperado |
| --- | --- | --- |
| CP-04 | Cliente con NIT/CI, correo y cuenta habilitada; iniciar sesión con NIT/CI y contraseña inicial | La sesión es de tipo `CLIENTE` y conserva el `customerId` correcto. |
| CP-04A | Intentar habilitar la cuenta con una contraseña de 7 caracteres | HTTP 400; no se crea usuario ni vínculo. |
| CP-04B | Intentar habilitar otra cuenta para un cliente que ya posee una | HTTP 409; se conserva la cuenta existente. |
| CP-04C | Modificar NIT/CI, correo y contacto de un cliente con cuenta | La cuenta principal se sincroniza y permite iniciar sesión con el nuevo NIT/CI. |
| CP-USU-07 | Crear usuarios internos y consultar la tabla | Cada usuario recibe un código numérico automático y la lista se ordena de menor a mayor. |
| CP-USU-08 | Intentar eliminar la cuenta autenticada y luego un usuario nuevo sin operaciones | La cuenta autenticada se protege; el usuario sin operaciones se elimina y queda el evento `ELIMINAR_USUARIO`. |
| CP-CLI-01 | Crear clientes, consultar la lista y buscar por código | Cada cliente recibe un código automático único; la lista está ordenada de menor a mayor y el buscador encuentra el código. |
| CP-CLI-06 | Eliminar un cliente sin relaciones e intentar eliminar otro con cuenta | El primero se elimina y audita; el segundo permanece intacto y devuelve HTTP 409. |

Con el stack en ejecución:

```bash
docker compose exec backend npm run test:acceptance
```
