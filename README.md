# Sistema Comercial ICAR

Base tecnológica del sistema web para la gestión integral del proceso de comercialización y distribución de ICAR Industrias Cárnicas Arancibia.

## Arquitectura

- `frontend/`: Angular 21 LTS + PrimeNG 21, compilado y servido por Nginx.
- `backend/`: API REST con NestJS 12 y TypeScript, organizada como monolito modular.
- `database/`: PostgreSQL 18, scripts de inicialización, migraciones y volumen persistente.
- `compose.yaml`: orquesta todo el stack y publica únicamente Nginx en el puerto configurado.

Frontend y backend se agrupan por los mismos dominios de negocio en carpetas con nombres en español. La estructura y las reglas de mantenimiento están documentadas en [`docs/arquitectura-organizacion-codigo.md`](docs/arquitectura-organizacion-codigo.md).

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
7. Usuario Inicial
   Usuario: admin@icar.local
Contraseña inicial: Cambiar123!

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

# Verificar el límite de 300 líneas, compilar y ejecutar pruebas
cd backend && npm run calidad
cd ../frontend && npm run calidad
```

# ACTUALIZAR REPOSITORIO

```bash

#1. Agrega los cambios y revisa qué se incluirá:
git add .
git diff --cached --stat

#2. Guarda los cambios en un commit:
git commit -m "Actualiza pedidos, producción, inventario y mensajería"

#3. Integra cualquier cambio que exista en el repositorio remoto:
git pull --rebase origin main

#4. Si el paso anterior termina correctamente, sube tus cambios:
git push origin main

#5. Verifica el resultado:
git status
git log -1 --oneline



```

La decisión tecnológica y los límites de cada capa están documentados en [`docs/stack-tecnologico.md`](docs/stack-tecnologico.md).

El alcance implementado, las rutas, la matriz de permisos, el modelo de datos y las pruebas de la primera iteración están documentados en [`docs/iteracion-1.md`](docs/iteracion-1.md).

La segunda iteración de catálogo, precios, inventario y pedidos está documentada en [`docs/iteracion-2.md`](docs/iteracion-2.md).

La tercera iteración de consolidación y requerimientos para Producción está documentada en [`docs/iteracion-3.md`](docs/iteracion-3.md).

La cuarta iteración de preparación, despacho, rutas y distribución está documentada en [`docs/iteracion-4.md`](docs/iteracion-4.md).

La quinta iteración de seguimiento público y mensajería WhatsApp con LimiteAPI está documentada en [`docs/iteracion-5.md`](docs/iteracion-5.md).

La sexta iteración de ventas, comprobantes internos, pagos, estado de cuenta, cartera y reportes está documentada en [`docs/iteracion-6.md`](docs/iteracion-6.md).

La matriz general, el resultado de las siete suites automatizadas y los controles manuales pendientes de evidencia están consolidados en [`docs/pruebas-aceptacion-consolidadas.md`](docs/pruebas-aceptacion-consolidadas.md).

La eliminación de las líneas productivas autorizadas por usuario y su validación están documentadas en [`docs/pruebas-aceptacion-usuarios.md`](docs/pruebas-aceptacion-usuarios.md).

La simplificación de la tabla de clientes, el código automático y el detalle mediante el botón de información están documentados en [`docs/pruebas-aceptacion-clientes.md`](docs/pruebas-aceptacion-clientes.md).
