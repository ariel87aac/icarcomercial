# Límites del monolito modular

Cada capacidad funcional se implementa como un módulo NestJS cohesivo. Las dos primeras iteraciones ya contienen `auth`, `users`, `access-control`, `customers`, `zones`, `audit`, `catalog`, `pricing`, `inventory` y `orders`, además del módulo técnico `health`. Los siguientes módulos se agregarán según las iteraciones del Trabajo Dirigido:

- Iteración 1: `auth`, `users`, `access-control`, `customers`, `addresses`, `zones`, `audit`.
- Iteración 2: `catalog`, `pricing`, `inventory` y `orders`; el historial de estados forma parte de `orders`.
- Iteración 3: `production-consolidation`.
- Iteración 4: `dispatch`, `vehicles`, `routes`, `deliveries`, `route-settlement`.
- Iteración 5: `public-tracking`, `notifications`.
- Iteración 6: `sales`, `receipts`, `payments`, `accounts-receivable`, `reports`.

Los controladores se limitan a la capa HTTP; los servicios de aplicación coordinan casos de uso y las reglas persistentes se ejecutan dentro de transacciones.
