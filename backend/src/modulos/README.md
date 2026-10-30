# Límites del monolito modular

Cada capacidad funcional se implementa dentro de un dominio estable y no dentro de una carpeta de iteración. Los dominios activos son `seguridad`, `clientes`, `zonas-reparto`, `productos`, `pedidos`, `almacen`, `produccion`, `preparacion`, `distribucion`, `seguimiento-mensajeria`, `ventas-cobranzas` y `resumen`.

Los controladores se limitan a la capa HTTP. Las fachadas de servicio mantienen los contratos consumidos por controladores y módulos, mientras sus operaciones internas se dividen en archivos pequeños por responsabilidad. Las reglas persistentes que abarcan varias escrituras continúan ejecutándose dentro de transacciones.

La estructura equivalente del frontend y las pruebas de aceptación de la reorganización se encuentran en `docs/arquitectura-organizacion-codigo.md`.
