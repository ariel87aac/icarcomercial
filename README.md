# Sistema Comercial ICAR

Base tecnológica del sistema web para la gestión integral del proceso de comercialización y distribución de ICAR Industrias Cárnicas Arancibia.

## Arquitectura inicial

- `frontend/`: Angular 21 LTS + PrimeNG 21, compilado y servido por Nginx.
- `backend/`: API REST con NestJS 12 y TypeScript, organizada como monolito modular.
- `database/`: PostgreSQL 18, scripts de inicialización, migraciones y volumen persistente.
- `compose.yaml`: orquesta todo el stack y publica únicamente Nginx en el puerto configurado.

El navegador se comunica con Nginx. Las rutas `/api/*` se envían al backend y PostgreSQL permanece en una red interna sin puertos publicados.

## Requisitos

- Docker Engine 29 o compatible.
- Docker Compose 2 o compatible.

No es necesario instalar Node.js ni PostgreSQL en el equipo anfitrión.

## Inicio rápido

1. Copiar la configuración de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Cambiar `POSTGRES_PASSWORD` en `.env`.

3. Construir e iniciar el sistema:

   ```bash
   docker compose up --build -d
   ```

4. Abrir `http://localhost:8080` o el puerto definido en `APP_PORT`.

5. Verificar los servicios:

   ```bash
   docker compose ps
   docker compose logs -f backend
   ```

6. Detener los contenedores sin eliminar los datos:

   ```bash
   docker compose down
   ```

> `docker compose down -v` elimina también el volumen de PostgreSQL. Debe usarse solamente cuando se quiera reiniciar la base de datos desde cero.

## Comandos útiles

```bash
# Consultar PostgreSQL desde su contenedor
docker compose exec database psql -U icar_app -d icar_comercial

# Ejecutar las migraciones manualmente
docker compose exec backend npm run migration:run

# Revertir la última migración
docker compose exec backend npm run migration:revert

# Reconstruir un servicio después de cambios
docker compose up --build -d backend
```

La decisión tecnológica y los límites de cada capa están documentados en [`docs/stack-tecnologico.md`](docs/stack-tecnologico.md).

El alcance implementado, las rutas, la matriz de permisos, el modelo de datos y las pruebas de la primera iteración están documentados en [`docs/iteracion-1.md`](docs/iteracion-1.md).
