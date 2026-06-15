# Reembolsos, Cancelaciones, Capturas y Contracargos

## Generalidades

Los reembolsos permiten devolver dinero al comprador. Solo se pueden reembolsar **pagos aprobados** ya capturados.

**Plazo maximo:** 180 dias desde la fecha de aprobacion del pago.

---

## Reembolsos - API de Pagos (Payments)

Para pagos creados con `/v1/payments`.

### Reembolso total

```http
POST https://api.mercadopago.com/v1/payments/{payment_id}/refunds
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body:** vacio `{}` o sin body.

### Reembolso parcial

```http
POST https://api.mercadopago.com/v1/payments/{payment_id}/refunds
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "amount": 500.50
}
```

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `amount` | number | Monto a reembolsar. Debe ser <= monto total del pago. |

### Con SDK Node.js

```javascript
const { Payment, MercadoPagoConfig } = require('mercadopago');
const client = new MercadoPagoConfig({ accessToken: 'ACCESS_TOKEN' });
const payment = new Payment(client);

// Reembolso total
await payment.refund({ id: paymentId });

// Reembolso parcial
await payment.refund({ id: paymentId, body: { amount: 500.50 } });
```

### API Route (Next.js)

```typescript
// app/api/payments/[id]/refund/route.ts
import { NextResponse } from 'next/server';
import { Payment, MercadoPagoConfig } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!
});
const paymentClient = new Payment(client);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json(); // { amount?: number } para parcial

  try {
    const result = await paymentClient.refund({
      id,
      body: body.amount ? { amount: body.amount } : undefined
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
```

### Desde React (llamar al backend)

```tsx
async function handleRefund(paymentId: string, amount?: number) {
  const res = await fetch(`/api/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: amount ? JSON.stringify({ amount }) : '{}'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Reembolso total
await handleRefund('123456789');

// Reembolso parcial de 500
await handleRefund('123456789', 500);
```

---

## Reembolsos - API de Orders

Para ordenes creadas con `/v1/orders`.

### Reembolso total

```http
POST https://api.mercadopago.com/v1/orders/{order_id}/refund
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body:** vacio `{}`.

### Reembolso parcial (por transaccion)

```http
POST https://api.mercadopago.com/v1/orders/{order_id}/refund
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "transaction_id": "PAY01JY0PGGPZ4DBV73E2Q0DQZQCJ",
  "amount": 500.50
}
```

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `transaction_id` | string | ID de la transaccion a reembolsar parcialmente |
| `amount` | number | Monto a reembolsar de esa transaccion |

En modo manual, puedes reembolsar por transaccion. En modo automatico, el reembolso total aplica a toda la order.

---

## Cancelaciones

### Cancelar orden (Orders API)

Solo orders que **aun no han sido procesadas**:

```http
POST https://api.mercadopago.com/v1/orders/{order_id}/cancel
Authorization: Bearer ACCESS_TOKEN
```

No requiere body.

### Cancelar pago (API de Pagos)

Solo pagos en estado `pending` o `in_process`:

```http
PUT https://api.mercadopago.com/v1/payments/{payment_id}
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body:**
```json
{
  "status": "cancelled"
}
```

---

## Capturas (solo tarjetas de credito)

Para pagos **autorizados** pero no capturados (`status: authorized`). Permite capturar todo o parte del monto autorizado.

### Capturar order (Orders API)

```http
POST https://api.mercadopago.com/v1/orders/{order_id}/capture
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body (opcional):**
```json
{
  "amount": 1000
}
```

Si no envias body, se captura el monto total autorizado.

### Capturar pago (API de Pagos)

```http
POST https://api.mercadopago.com/v1/payments/{payment_id}/capture
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

**Body (opcional):**
```json
{
  "transaction_amount": 1000
}
```

---

## Estados tras reembolso

| Tipo reembolso | Estado en MP | status_detail |
|----------------|--------------|---------------|
| Parcial | `approved` | `partially_refunded` |
| Total | `refunded` | `refunded` |

---

## Contracargos (chargebacks)

Un **contracargo** ocurre cuando el banco del comprador revierte el pago (ej: disputa, robo de tarjeta). No es algo que inicies tu; Mercado Pago te notifica.

- **Webhook:** Topico `chargebacks`
- **Estado del pago:** `charged_back`
- **Consulta:** `GET https://api.mercadopago.com/v1/chargebacks/{id}`

Implementar el webhook para actualizar tu sistema cuando ocurra un contracargo.

---

## Webhooks y reembolsos

Tras un reembolso recibiras notificacion webhook con `type: "payment"` y el `id` del pago. Consulta el pago para ver el estado actualizado:

```http
GET https://api.mercadopago.com/v1/payments/{id}
```

El campo `status` sera `refunded` o `approved` (si parcial), y `refunds` tendra el detalle de los reembolsos.

---

## Pagos con dos tarjetas (Checkout Pro)

Si el pago se hizo con dos tarjetas:
- Reembolso parcial de uno de los pagos
- Reembolso parcial de ambos
- Reembolso total de uno o ambos

El sistema distribuye el importe del reembolso entre los pagos cuando corresponde.

---

## Errores comunes en reembolsos

| Error | Causa |
|-------|-------|
| **Importe invalido** | El monto debe ser > 0 y no superar el total del pago |
| **Pago pendiente** | Solo se puede reembolsar pagos ya aprobados |
| **Credenciales invalidas** | Access token incorrecto o expirado |
| **Saldo insuficiente** | No hay saldo suficiente en la cuenta del vendedor |
| **Pago muy antiguo** | Han pasado mas de 180 dias desde la aprobacion |
| **Error interno** | Reintentar mas tarde o contactar soporte |
