# Primera iteración seguridad usuarios y clientes

## Alcance

La primera iteración implementa exclusivamente autenticación, autorización por roles y permisos, auditoría, usuarios internos, cuentas vinculadas a clientes, clientes, domicilios, coordenadas, zonas y días de distribución.

La cuenta de cliente queda vinculada a un solo registro comercial y solo puede consultar la información de ese cliente. La creación y gestión de pedidos no pertenece a esta iteración.

## Historias cubiertas

| Historia | Evidencia funcional |
| --- | --- |
| HU-01 | Inicio, renovación y cierre de sesión; rechazo de credenciales o cuentas inactivas. |
| HU-02 | Cuenta de tipo `CLIENTE`, vínculo en `clientes_usuarios` y alcance de datos por `customerId`. |
| HU-03 | Administración de usuarios internos, roles y permisos. |
| HU-04 | Creación, habilitación y deshabilitación de cuentas vinculadas a clientes. |
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
| `GET / POST` | `/api/roles` | Consulta o registra roles y permisos. |
| `GET / POST` | `/api/clientes` | Consulta o registra clientes según alcance. |
| `PATCH` | `/api/clientes/:id` | Modifica un cliente autorizado. |
| `POST` | `/api/clientes/:id/usuarios` | Crea una cuenta vinculada al cliente. |
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

## Auditoría

Se registran inicios y cierres de sesión, accesos denegados, creación y modificación de registros, cambios de estado y administración de cuentas de clientes. Los metadatos pasan por un saneamiento que elimina campos relacionados con contraseñas, tokens, cookies, autorización y secretos.

La consulta admite `userId`, `action`, `entity`, `result`, `from` y `to`, además de módulo e identificador de entidad.

## Pruebas de aceptación

El script `backend/scripts/iteration-one.acceptance.mjs` ejecuta CP-01 a CP-12: acceso válido, credenciales inválidas, cuenta inactiva, cuenta de cliente, aislamiento entre clientes, permiso insuficiente, gestión institucional, alta auditada, duplicidad, coordenadas inválidas, zona con día y auditoría filtrada. También comprueba que el cierre de sesión invalide la sesión anterior.

Con el stack en ejecución:

```bash
docker compose exec backend npm run test:acceptance
```
