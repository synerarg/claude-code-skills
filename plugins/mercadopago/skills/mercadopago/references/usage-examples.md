# Ejemplos de uso - Prompts listos

Copiar y adaptar estos prompts cuando pidas a Claude integrar MercadoPago.

---

## Checkout Pro - Integracion completa (Supabase)

```
Integrar MercadoPago Checkout Pro siguiendo la skill mercadopago-pro.

Detalles:
- Base de datos: Supabase
- Currency: ARS
- Ruta de exito: /pago-exitoso
- Ruta de fallo: /pago-fallido
- Nombre de marca (statement): MY_BRAND
- Tabla de productos: photos (id, price, title)
- Cart store: src/store/cart.ts (zustand con persist)
- Supabase server client: src/lib/supabase/server.ts (createServiceClient)

Ejecutar la migration, crear todos los archivos, y agregar env vars a .env.example.
```

## Checkout Pro - Integracion completa (Prisma)

```
Integrar MercadoPago Checkout Pro siguiendo la skill mercadopago-pro.

Detalles:
- Base de datos: PostgreSQL en AWS RDS via Prisma
- Currency: BRL
- Ruta de exito: /payment-success
- Ruta de fallo: /payment-failure
- Nombre de marca: MY_STORE
- Tabla de productos: products (id, price, name)
- Prisma client: src/lib/prisma.ts

Usar la referencia de Prisma en references/database-adapters.md para el DB helper.
```

## Checkout Pro - Raw PostgreSQL

```
Integrar MercadoPago Checkout Pro siguiendo la skill mercadopago-pro.

Detalles:
- Base de datos: PostgreSQL (Neon) con driver pg
- Currency: MXN
- Ruta de exito: /pago-exitoso
- Nombre de marca: MI_TIENDA

Usar la referencia de Raw pg en references/database-adapters.md.
```

---

## Checkout Bricks - Payment Brick

```
Integrar MercadoPago con Payment Brick siguiendo la skill mercadopago-pro.
Quiero que el pago se haga dentro de mi sitio, sin redireccion.

Detalles:
- Framework: Next.js App Router
- Base de datos: Supabase
- Currency: ARS
- Quiero usar Payment Brick (todos los medios de pago)

Consultar references/checkout-bricks.md para la implementacion del Brick.
```

## Checkout Bricks - Card Payment

```
Integrar MercadoPago con Card Payment Brick siguiendo la skill mercadopago-pro.
Solo necesito pagos con tarjeta de credito/debito.

Detalles:
- Framework: Next.js 15
- Base de datos: Prisma + PostgreSQL
- Currency: ARS
- Solo tarjetas (Card Payment Brick)

Consultar references/checkout-bricks.md para Card Payment Brick
y references/database-adapters.md para Prisma.
```

---

## Orders API

```
Integrar MercadoPago con la Orders API siguiendo la skill mercadopago-pro.
Necesito modo automatico con procesamiento inmediato.

Detalles:
- Framework: Next.js
- Base de datos: Supabase
- Currency: ARS
- Modo: automatico
- Medios de pago: tarjetas + efectivo

Consultar references/orders-api.md para la implementacion.
```

---

## Agregar webhook a integracion existente

```
Ya tengo MercadoPago Checkout Pro funcionando pero necesito agregar el webhook handler.
Seguir la skill mercadopago-pro para la implementacion del webhook con
chequeo de idempotencia y validacion de x-signature.

Ver references/webhooks.md.
```

## Implementar reembolsos

```
Necesito implementar reembolsos (totales y parciales) para mi integracion
de MercadoPago. Seguir la skill mercadopago-pro.

Detalles:
- Tengo pagos creados con la API de Pagos (no Orders)
- Necesito endpoint para reembolso total y parcial
- Quiero un componente React para manejar reembolsos desde el admin

Ver references/refunds-cancellations.md.
```

---

## Troubleshooting

```
Mi integracion de MercadoPago devuelve un 400 al crear la preferencia.
Usar la skill mercadopago-pro para diagnosticar y arreglar el problema.
```

```
Mi webhook de MercadoPago no esta recibiendo notificaciones.
Usar la skill mercadopago-pro para diagnosticar.
Ver references/troubleshooting.md.
```

---

## Prompt minimo (dejar que Claude explore primero)

```
Integrar pagos con MercadoPago usando la skill mercadopago-pro.
Explorar mi codebase primero para encontrar el cart store, modelo de productos,
setup de base de datos, y rutas existentes antes de implementar.
```

---

## Integracion para Brasil

```
Integrar MercadoPago Checkout Pro para una app brasilena.
Currency: BRL. Seguir la skill mercadopago-pro.
Consultar references/payment-methods.md para medios de pago y test cards de Brasil.
```
