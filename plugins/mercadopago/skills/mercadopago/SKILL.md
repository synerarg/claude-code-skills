---
name: mercadopago
description: >
  Skill UNICA y completa para todo Mercado Pago en aplicaciones web (Next.js, React, Vanilla JS).
  COBRAR: Checkout Pro (redireccion), Checkout Bricks (Payment, Card, Wallet, Status Screen),
  Orders API (nuevo modelo) y Suscripciones (preapproval / pagos recurrentes).
  ENVIAR dinero: Money Out (transferencias/retiros a cuentas bancarias y cuentas MP, Pix) y
  Marketplace / split de pagos (cobrar para terceros con comision).
  Ademas: webhooks con validacion x-signature, reembolsos totales/parciales, cancelaciones,
  capturas manuales, contracargos, comisiones y liberacion de dinero, y medios de pago por pais.
  Incluye adaptadores de base de datos (Supabase, Prisma, Raw pg), troubleshooting detallado,
  tarjetas de test por pais, ejemplos de prompts, y uso del MCP server oficial de MP.
  Usar cuando se necesite: (1) Integrar pagos con MercadoPago en cualquier modalidad,
  (2) Implementar Checkout Pro o Bricks, (3) Usar la Orders API,
  (4) Configurar webhooks/notificaciones, (5) Implementar reembolsos o cancelaciones,
  (6) Troubleshootear errores de integracion MP,
  (7) Hacer un setup asistido con el MCP server oficial de MP (crear app, credenciales, webhooks) y validar calidad,
  (8) Enviar dinero a cuentas bancarias (Money Out / payouts),
  (9) Cobrar para terceros con split de pagos (marketplace),
  (10) Cobrar de forma recurrente (suscripciones), o entender comisiones y costos de MP.
  Triggers: MercadoPago, Mercado Pago, pagos MP, checkout MP, bricks, orders API MP,
  webhook mercadopago, reembolso mercadopago, refund MP, money out, transferencias MP, payout,
  marketplace MP, split de pagos, suscripciones MP, preapproval, comisiones mercadopago, costos MP.
  Soporta: Argentina (ARS), Brasil (BRL), Mexico (MXN), Colombia (COP), Chile (CLP), Peru (PEN), Uruguay (UYU).
---

# Mercado Pago - Guia Profesional de Integracion

Guia completa para integrar pagos con Mercado Pago en aplicaciones web. Cubre todas las modalidades de integracion, desde la mas simple (Checkout Pro) hasta la mas avanzada (Orders API).

---

## Cual integracion usar?

Primero defini **que necesitas hacer**:

| Necesitas... | Solucion | Reference |
|--------------|----------|-----------|
| **Cobrar** un pago unico, rapido (MVP) | **Checkout Pro** (redireccion) | `references/checkout-pro.md` |
| **Cobrar** en tu sitio con branding propio | **Checkout Bricks** | `references/checkout-bricks.md` |
| **Cobrar** con logica avanzada / multi-transaccion / presencial (Point, QR) | **Orders API** | `references/orders-api.md` |
| **Cobrar recurrente** (membresias, abonos, SaaS) | **Suscripciones (preapproval)** | `references/subscriptions.md` |
| **Cobrar para terceros** y quedarte una comision | **Marketplace / split de pagos** | `references/marketplace-split.md` |
| **Enviar dinero** a cuentas bancarias / MP (payouts) | **Money Out** | `references/money-out.md` |
| Entender **comisiones y costos** | (transversal) | `references/fees-pricing.md` |

### Esfuerzo de cada modalidad de cobro

| Escenario | Recomendacion | Esfuerzo |
|-----------|---------------|----------|
| MVP / lanzar rapido | Checkout Pro | Bajo (2/5) |
| E-commerce con branding propio | Checkout Bricks | Medio (3/5) |
| Tarjetas + efectivo en tu sitio | Checkout Bricks (Payment Brick) | Medio (3/5) |
| Logica avanzada / multiples transacciones | Orders API | Alto (5/5) |
| Pagos presenciales (Point, QR) | Orders API | Alto (5/5) |
| Cobro recurrente | Suscripciones (preapproval) | Medio (3/5) |

### Checkout Pro
- Experiencia de cobro **en Mercado Pago** (redireccion)
- El usuario paga en el entorno de MP y vuelve a tu sitio
- Todos los medios de pago sin configurar cada uno
- Ideal: integracion rapida, maxima confianza del comprador

### Checkout Bricks
- Experiencia de cobro **en tu sitio**, sin redireccion
- Modulos preconstruidos pero personalizables
- Bricks: Payment, Card Payment, Wallet, Status Screen, Brand
- Ideal: control total del checkout UX

### Orders API (Nuevo modelo)
- Procesamiento automatico o manual
- Multiples transacciones por orden
- Pagos online + presenciales (Point, QR)
- Ideal: logica de negocio avanzada, captura manual, dos tarjetas

### Suscripciones (Preapproval)
- Cobro **recurrente** automatico (frecuencia configurable)
- Con o sin plan asociado (`preapproval_plan`)
- Ideal: membresias, SaaS, abonos. Ver `references/subscriptions.md`

### Marketplace / Split de pagos
- Cobras en nombre de vendedores y MP **reparte automaticamente** (su comision primero, luego la tuya)
- `marketplace_fee` (Checkout Pro) / `application_fee` (Checkout API); vendedor se vincula via OAuth
- Ideal: marketplaces, plataformas multi-vendedor. Ver `references/marketplace-split.md`

### Money Out (enviar dinero)
- Transferencias/retiros desde tu saldo a **cuentas bancarias**, cuentas MP o Pix (Brasil)
- Requiere **autorizacion comercial** de MP + cifrado punta a punta e idempotencia
- Ideal: payouts a proveedores/vendedores/usuarios. Ver `references/money-out.md`

---

## Antes de comenzar

### 0. (Recomendado) Setup asistido con el MCP de Mercado Pago

Si el MCP server oficial de MP esta conectado, automatiza casi todo el setup de cuenta y
mantiene la documentacion al dia. Convierte "anda al panel, copia el token, crea usuarios de
test, configura el webhook" en algo que el agente resuelve solo. Detalle completo (tools,
parametros, flujo): `references/mcp-server.md`.

| Necesitas... | Tool del MCP |
|--------------|--------------|
| Credenciales (access token + public key, prod y test) sin entrar al panel | `application_list` -> `create_application` -> `get_credentials` |
| Configurar el webhook (prod/sandbox + topicos) | `save_webhook` |
| Docs / contratos / test cards al dia | `search_documentation` |
| Validar calidad de la integracion | `quality_checklist` (build) + `quality_evaluation` (post-pago) |
| Diagnosticar webhooks que no llegan | `notifications_history` |
| Homologar la app para produccion | `form_homologation` |

Nota: este MCP no crea usuarios de prueba; usa las credenciales de TEST de `get_credentials`
y crea las cuentas de prueba desde el panel. Set completo de campos que evalua MP (verificado
en vivo): `references/mcp-server.md` (seccion "Quality checklist real").

Conectar: `claude mcp add --transport http mercadopago https://mcp.mercadopago.com/mcp`,
luego `/mcp` para autenticar (OAuth) y reiniciar la sesion. Si no esta disponible, seguir el
setup manual de los pasos 1-3.

### 1. Prerequisitos

```bash
npm install mercadopago zod
```

### 2. Variables de entorno

```env
MERCADOPAGO_ACCESS_TOKEN=TEST-xxxx   # Backend only, NUNCA con NEXT_PUBLIC_
NEXT_PUBLIC_MP_PUBLIC_KEY=TEST-xxxx   # Solo para Bricks (frontend)
NEXT_PUBLIC_APP_URL=http://localhost:3000  # HTTPS en produccion
```

Obtener credenciales: https://www.mercadopago.com/developers/panel/app

### 3. Base de datos

Ejecutar `assets/migration.sql` en tu base de datos PostgreSQL.
Ver `references/database-adapters.md` para implementar el helper segun tu ORM/cliente.

---

## Flujo general

```
                     Checkout Pro
                    +-----------+
  Tu sitio -------->| MP hosted |-------> Redirect back + Webhook
                    +-----------+

                     Checkout Bricks
                    +-----------+
  Tu sitio -------->| Brick UI  |-------> POST /api/payments + Webhook
                    +-----------+

                     Orders API
                    +-----------+
  Tu sitio -------->| Custom UI |-------> POST /v1/orders + Webhook
                    +-----------+
```

---

## Implementation steps por modalidad

### Checkout Pro
1. Crear helper de DB (`references/database-adapters.md`)
2. Crear cliente MP y preferencia (`references/checkout-pro.md`)
3. Crear API route `/api/checkout`
4. Crear webhook handler (`references/webhooks.md`)
5. Crear pagina de exito con verificacion server-side
6. Crear hook de checkout con proteccion anti-doble-click

### Checkout Bricks
1. Crear helper de DB (`references/database-adapters.md`)
2. Cargar SDK de MP en frontend (`references/checkout-bricks.md`)
3. Renderizar el Brick deseado (Payment, Card, Wallet)
4. Crear API route para procesar el pago
5. Crear webhook handler (`references/webhooks.md`)
6. Mostrar resultado con Status Screen Brick

### Orders API
1. Crear helper de DB (`references/database-adapters.md`)
2. Tokenizar tarjeta en frontend (o usar Brick)
3. Crear order via API (`references/orders-api.md`)
4. Configurar webhook para orders (`references/webhooks.md`)
5. Implementar captura/cancelacion/reembolso segun necesidad (`references/refunds-cancellations.md`)

### Suscripciones (recurrente)
1. (Opcional) Crear plan `preapproval_plan`
2. Crear `preapproval` (con `card_token_id` o redireccion al `init_point`)
3. Webhook `subscription_authorized_payment` por cada cobro del ciclo (`references/subscriptions.md`)

### Marketplace / Split
1. Vincular al vendedor via OAuth (topico `mp-connect`)
2. Crear preferencia/pago con `marketplace_fee` / `application_fee` usando las credenciales del vendedor (`references/marketplace-split.md`)

### Money Out (enviar dinero)
1. Pedir habilitacion comercial a MP (no es self-serve)
2. `POST /v1/transaction-intents/process` con `X-Idempotency-Key` + cifrado punta a punta (`references/money-out.md`)

---

## Checklist general

- [ ] `mercadopago` + `zod` instalados
- [ ] `MERCADOPAGO_ACCESS_TOKEN` en `.env` (TEST token para dev, NUNCA `NEXT_PUBLIC_`)
- [ ] `NEXT_PUBLIC_APP_URL` en `.env` (HTTPS en produccion)
- [ ] Migration ejecutada en DB
- [ ] DB helper implementado
- [ ] API route de checkout/payment creada con validacion Zod
- [ ] Webhook handler con idempotencia y GET endpoint
- [ ] `auto_return` solo para HTTPS
- [ ] Pagina de exito verifica estado server-side
- [ ] Proteccion anti-doble-click (useRef guard)
- [ ] `useSearchParams` envuelto en `<Suspense>`
- [ ] Webhook signature validation (produccion)
- [ ] (Opcional) MCP de MP conectado para setup asistido (`references/mcp-server.md`)
- [ ] (Opcional) Calidad validada con `quality_checklist` (build) y `quality_evaluation` (post-pago)

---

## Comisiones (tener en cuenta)

MP descuenta su comision **automaticamente** del monto recibido (cobras bruto, te acredita neto).
La comision depende de **pais + medio de pago + plazo de liberacion** (cuanto antes recibis el
dinero, mayor la comision). Si cobras para terceros, ademas se descuenta tu `marketplace_fee`/
`application_fee` (despues de la de MP).

**No hardcodear porcentajes**: cambian y son por pais. Ver el modelo completo y donde consultar
los costos vigentes en `references/fees-pricing.md`.

---

## Referencias

| Archivo | Contenido |
|---------|-----------|
| `references/checkout-pro.md` | API de Preferencias, frontend React/Vanilla, flujo completo |
| `references/checkout-bricks.md` | Payment, Card, Wallet, Status Screen Bricks + 3DS |
| `references/orders-api.md` | Nuevo modelo, modo auto/manual, endpoints, transacciones |
| `references/webhooks.md` | Configuracion, topicos, payloads, validacion x-signature, estados |
| `references/refunds-cancellations.md` | Reembolsos, cancelaciones, capturas, contracargos |
| `references/subscriptions.md` | Suscripciones / pagos recurrentes (preapproval, preapproval_plan, webhooks) |
| `references/marketplace-split.md` | Marketplace / split de pagos (marketplace_fee, application_fee, OAuth) |
| `references/money-out.md` | Enviar dinero a cuentas bancarias / MP / Pix (Money Out API) |
| `references/fees-pricing.md` | Comisiones, liberacion de dinero y como ver costos vigentes |
| `references/payment-methods.md` | Medios de pago por pais, currencies, test cards |
| `references/troubleshooting.md` | Errores comunes y soluciones detalladas |
| `references/mcp-server.md` | MCP server oficial de MP: tools, conexion, setup asistido y validacion de calidad |
| `references/database-adapters.md` | Helpers para Supabase, Prisma, Raw pg |
| `references/usage-examples.md` | Prompts de ejemplo listos para usar |
| `assets/migration.sql` | Schema PostgreSQL para purchases |

Docs oficiales: https://www.mercadopago.com.ar/developers/es/docs
SDK Node: https://github.com/mercadopago/sdk-nodejs
