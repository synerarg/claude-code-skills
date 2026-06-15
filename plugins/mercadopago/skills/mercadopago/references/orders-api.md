# Orders API - Nuevo modelo de integracion

El **Checkout API** (Argentina) ahora procesa pagos con **Orders**. Una sola API para pagos online y presenciales.

## Comparacion: API de Pagos vs API de Orders

| Funcionalidad | API de Pagos | API de Orders |
|---------------|--------------|---------------|
| Procesamiento | Automatico | Automatico o manual |
| Transacciones | Una por request | Multiples por request |
| Operaciones | Solo online | Online + presencial (Point, QR) |
| Notificaciones | `notification_url` por pago | Panel Tus integraciones |
| Errores | Uno a la vez | Lista de errores |

---

## Modos de procesamiento

### Modo automatico (`processing_mode: "automatic"`)

- Crear y procesar en una sola etapa
- Operaciones: Crear y procesar, Obtener, Buscar, Capturar, Cancelar, Reembolsar

### Modo manual (`processing_mode: "manual"`)

- Crear order, agregar/modificar transacciones, procesar despues
- Operaciones: Crear (sin procesar), Agregar transaccion, Modificar, Eliminar, Procesar, Capturar, Cancelar, Reembolsar

---

## Endpoints

Base: `https://api.mercadopago.com/v1/orders`

### Crear y procesar order (modo automatico)

```http
POST /v1/orders
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body ejemplo:**

```json
{
  "processing_mode": "automatic",
  "external_reference": "ORD-12345",
  "notification_url": "https://tusitio.com/webhooks/orders",
  "items": [
    {
      "id": "item-1",
      "title": "Producto",
      "quantity": 1,
      "unit_price": "1500.50",
      "currency_id": "ARS"
    }
  ],
  "payer": {
    "email": "comprador@email.com"
  },
  "transactions": [
    {
      "payment_method_id": "visa",
      "payment_method_type": "credit_card",
      "token": "CARD_TOKEN",
      "installments": 1,
      "description": "Compra en tienda"
    }
  ]
}
```

### Crear order (modo manual, sin procesar)

```http
POST /v1/orders
```

Body con `processing_mode: "manual"` y transacciones opcionales.

### Agregar transaccion (solo modo manual)

```http
POST /v1/orders/{order_id}/transactions
```

### Procesar order (modo manual)

```http
POST /v1/orders/{order_id}/process
```

### Obtener order

```http
GET /v1/orders/{order_id}
```

### Buscar orders

```http
GET /v1/orders/search?external_reference=ORD-12345
```

### Capturar order (tarjetas)

```http
POST /v1/orders/{order_id}/capture
```

### Cancelar order

```http
POST /v1/orders/{order_id}/cancel
```

### Reembolsar order

```http
POST /v1/orders/{order_id}/refund
```

**Reembolso total:** body vacio
**Reembolso parcial:** `{ "transaction_id": "...", "amount": 500 }`

---

## Transacciones - Atributos

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `payment_method_id` | string | Ej: `visa`, `master`, `rapipago`, `pagofacil` |
| `payment_method_type` | string | `credit_card`, `debit_card`, `ticket`, etc. |
| `token` | string | Token de tarjeta (frontend) |
| `installments` | number | Cuotas (tarjetas) |
| `description` | string | Descripcion del pago |

Para efectivo (Rapipago/Pagofacil): `payment_method_type: "ticket"`, `payment_method_id` segun medio.

---

## Medios de pago Orders (Argentina)

| Medio | payment_method_id | payment_method_type |
|-------|-------------------|---------------------|
| Visa | `visa` | `credit_card` / `debit_card` |
| Mastercard | `master` | `credit_card` / `debit_card` |
| Rapipago | `rapipago` | `ticket` |
| Pago Facil | `pagofacil` | `ticket` |

---

## Implementacion Next.js

### Crear order (modo automatico)

```typescript
// app/api/orders/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();

  const response = await fetch('https://api.mercadopago.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      processing_mode: 'automatic',
      external_reference: body.orderId,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/mercadopago`,
      items: body.items,
      payer: { email: body.email },
      transactions: body.transactions,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json({ error: data }, { status: response.status });
  }

  return NextResponse.json(data);
}
```

### Obtener order

```typescript
// app/api/orders/[id]/route.ts
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const response = await fetch(`https://api.mercadopago.com/v1/orders/${id}`, {
    headers: {
      'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,
    },
  });

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
```

---

## Webhook para Orders

Ver `references/webhooks.md` para la estructura del payload de orders.

Acciones tipicas: `order.processed`, `order.failed`, `order.cancelled`

---

## API de Pagos (alternativa legacy)

Para integraciones con Card Payment Brick o Payment Brick que usan token de tarjeta:

```http
POST https://api.mercadopago.com/v1/payments
Authorization: Bearer ACCESS_TOKEN
```

**Body:**

```json
{
  "transaction_amount": 1500.50,
  "token": "CARD_TOKEN_FROM_BRICK",
  "description": "Compra en tienda",
  "installments": 1,
  "payment_method_id": "visa",
  "payer": {
    "email": "comprador@email.com",
    "identification": { "type": "DNI", "number": "12345678" }
  },
  "notification_url": "https://tusitio.com/webhooks/mercadopago"
}
```
