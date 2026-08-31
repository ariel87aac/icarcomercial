# Stack tecnológico y arquitectura base

## Decisión

La solución adopta una arquitectura web cliente-servidor de tres capas con un backend de tipo monolito modular. Esta estructura coincide con la documentación del Trabajo Dirigido y evita introducir microservicios antes de que el volumen y las necesidades operativas los justifiquen.

| Capa | Tecnología | Versión base | Responsabilidad |
| --- | --- | --- | --- |
| Presentación | Angular + PrimeNG | Angular 21 LTS / PrimeNG 21 | Panel administrativo, portal de clientes, interfaz adaptable de distribución y seguimiento público. |
| Aplicación | NestJS + TypeScript | NestJS 12 / TypeScript 5.9 | API REST, validación, reglas de negocio, autenticación, RBAC, auditoría e integraciones. |
| Persistencia | PostgreSQL + TypeORM | PostgreSQL 18 / TypeORM 0.3 | Datos relacionales, restricciones, transacciones, migraciones, historial y auditoría. |
| Despliegue | Docker Compose + Nginx | Compose v2 / Nginx Alpine | Construcción reproducible, proxy inverso, red interna, health checks y volumen persistente. |
| Ejecución JS | Node.js | 24 LTS | Compilación del frontend y ejecución del backend. |

Se eligió Angular 21 LTS porque PrimeNG 21 dispone de una versión estable compatible. Node.js 24 es una línea LTS compatible tanto con Angular 21 como con NestJS 12. PostgreSQL 18 es una versión estable con soporte oficial hasta 2030.

## Flujo de comunicación

```text
Navegador
    |
    v
Nginx / Angular (único puerto publicado)
    |
    +-- /api/* --> NestJS (red web interna)
                       |
                       v
                 PostgreSQL (red de datos interna)
```

## Criterios aplicados desde el inicio

- PostgreSQL no publica puertos al anfitrión ni a Internet.
- Nginx es el único punto de entrada y sirve la aplicación Angular.
- NestJS expone la API bajo el prefijo `/api`.
- Las migraciones se ejecutan antes de iniciar el backend.
- Los datos se conservan en un volumen administrado por Docker.
- PostgreSQL 18 monta el volumen en `/var/lib/postgresql`, de acuerdo con la estructura versionada de su imagen oficial.
- Todos los servicios incluyen verificación de salud.
- Las marcas de tiempo de aplicación y base de datos usan UTC.
- El esquema usa nombres físicos `snake_case` y migraciones versionadas.
- Las credenciales se reciben por variables de entorno y no se incluyen en el código.

## Límites modulares previstos

Los módulos funcionales se incorporarán por iteraciones sin separar unidades de despliegue:

1. Seguridad, usuarios, roles, permisos, auditoría, clientes, domicilios y zonas.
2. Catálogo, precios, inventario, reservas, movimientos y pedidos.
3. Consolidación y requerimientos para producción.
4. Despacho, vehículos, rutas, entregas y liquidación de rutas.
5. Seguimiento público y notificaciones por WhatsApp.
6. Ventas, comprobantes, pagos, saldos, cuentas por cobrar y reportes.

## Fuentes de versión

- Angular: https://angular.dev/reference/releases
- Node.js: https://nodejs.org/en/about/previous-releases
- PostgreSQL: https://www.postgresql.org/support/versioning/
- Docker Compose: https://docs.docker.com/compose/how-tos/startup-order/
