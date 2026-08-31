# Límites del monolito modular

Cada capacidad funcional se implementará como un módulo NestJS cohesivo. La carpeta contiene por ahora el módulo técnico `health`; los siguientes módulos se agregarán según las iteraciones del Trabajo Dirigido:

- Iteración 1: `auth`, `users`, `access-control`, `customers`, `addresses`, `zones`, `audit`.
- Iteración 2: `catalog`, `pricing`, `inventory`, `orders`, `order-state`.
- Iteración 3: `production-consolidation`.
- Iteración 4: `dispatch`, `vehicles`, `routes`, `deliveries`, `route-settlement`.
- Iteración 5: `public-tracking`, `notifications`.
- Iteración 6: `sales`, `receipts`, `payments`, `accounts-receivable`, `reports`.

Los controladores se limitan a la capa HTTP; los servicios de aplicación coordinan casos de uso y las reglas persistentes se ejecutan dentro de transacciones.

