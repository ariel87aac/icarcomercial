# PostgreSQL

La base de datos usa PostgreSQL 18 y se ejecuta exclusivamente dentro de Docker Compose.

## Inicialización y migraciones

- `init/`: scripts que PostgreSQL ejecuta solo al crear un volumen nuevo.
- `../backend/src/database/migrations/`: cambios versionados del esquema de la aplicación.
- `backups/`: destino local ignorado por Git para copias de seguridad.

El backend aplica las migraciones pendientes antes de arrancar. `synchronize` permanece desactivado para evitar cambios implícitos del esquema.

## Acceso administrativo

La base no publica el puerto `5432`. Para una sesión local:

```bash
docker compose exec database psql -U icar_app -d icar_comercial
```

## Respaldo lógico

```bash
docker compose exec database sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /backups/icar-$(date +%Y%m%d-%H%M%S).dump'
```

Los respaldos deben copiarse posteriormente a almacenamiento protegido y se debe comprobar periódicamente su restauración.

