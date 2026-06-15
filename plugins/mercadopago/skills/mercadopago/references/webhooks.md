# Webhooks y Notificaciones

**IPN esta en descontinuacion.** Usar Webhooks.

## Configuracion

1. Ir a [Tus integraciones](https://www.mercadopago.com.ar/developers/panel/app)
2. Seleccionar aplicacion -> **Webhooks** / **Notificaciones**
3. Configurar URL de produccion (y sandbox si aplica)
4. Seleccionar topicos: `payment`, `order`, `merchant_order`, etc.

## Topicos disponibles

| Topico | Descripcion |
|--------|-------------|
| `payment` | Creacion y actualizacion de pagos |
| `order` | Orders (nuevo modelo) |
| `merchant_order` | Ordenes comerciales (Checkout Pro) |
| `chargebacks` | Contracargos |
| `topic_card_id_wh` | Card Updater |
| `delivery_cancellation` | Alertas de fraude |

---

## Estructura del webhook

Mercado Pago envia un **POST** a tu URL. Puede incluir:

- **Query params:** `topic`, `id` (o `data.id`)
- **Body:** Objeto JSON con datos del recurso

### Payload de Payment

```json
{
  "id": 123456789,
  "live_mode": true,
  "type": "payment",
  "date_created": "2025-01-10T12:00:00.000-03:00",
  "data": {
    "id": "123456789"
  }
}
```

### Payload de Order (Orders API)

```json
{
  "action": "order.processed",
  "api_version": "v1",
  "application_id": "123456",
  "data": {
    "external_reference": "ORD-12345",
    "id": "ORD01JY0PGGPZ4DBV73E2PXRBCQ84",
    "status": "processed",
    "status_detail": "accredited",
    "total_paid_amount": "1500.50",
    "transactions": {
      "payments": [
        {
          "id": "PAY01JY0PGGPZ4DBV73E2Q0DQZQCJ",
          "status": "processed",
          "status_detail": "accredited",
          "amount": "1500.50"
        }
      ]
    }
  },
  "type": "order"
}
```

**Acciones tipicas orders:** `order.processed`, `order.failed`, `order.cancelled`

---

## Validacion con x-signature

Header `x-signature` para verificar que el webhook viene de Mercado Pago.

- **Formato:** `ts=timestamp,v1=hash`
- **Hash:** HMAC-SHA256 de `id:{data.id};request-id:{request_id};ts:{ts}` con tu Webhook Secret
- **Obtener secret:** Tus integraciones -> Tu app -> Webhooks -> Secret

### Implementacion (Node.js)

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  webhookSecret: string
): boolean {
  const parts = xSignature.split(',');
  const tsEntry = parts.find(p => p.startsWith('ts='));
  const hashEntry = parts.find(p => p.startsWith('v1='));

  if (!tsEntry || !hashEntry) return false;

  const ts = tsEntry.split('=')[1];
  const receivedHash = hashEntry.split('=')[1];

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts}`;
  const expectedHash = crypto
    .createHmac('sha256', webhookSecret)
    .update(manifest)
    .digest('hex');

  return receivedHash === expectedHash;
}
```

### Uso en el webhook handler

```typescript
export async function POST(request: Request) {
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');
  const body = await request.json();

  // Verificar firma en produccion
  if (process.env.NODE_ENV === 'production' && xSignature && xRequestId) {
    const isValid = verifyWebhookSignature(
      xSignature,
      xRequestId,
      String(body.data?.id),
      process.env.MP_WEBHOOK_SECRET!
    );
    if (!isValid) {
      return new Response('Invalid signature', { status: 401 });
    }
  }

  // Procesar webhook...
}
```

---

## Acciones tras recibir notificacion

1. **Responder HTTP 200 o 201** en menos de 22 segundos
2. Si no respondes, MP reintenta cada 15 minutos
3. Consultar el recurso por ID para obtener datos completos:
   - Payment: `GET https://api.mercadopago.com/v1/payments/{id}`
   - Order: `GET https://api.mercadopago.com/v1/orders/{id}`
   - Merchant Order: `GET https://api.mercadopago.com/merchant_orders/{id}`

---

## Endpoint receptor completo (Next.js)

```typescript
// app/api/webhooks/mercadopago/route.ts
import { NextResponse } from 'next/server';
import { getPurchaseStatus, updatePurchase } from '@/lib/db/purchases';
import { getPayment } from '@/lib/mercadopago/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic = body.type;
    const id = body?.data?.id;

    if (!id) return NextResponse.json({ received: true });

    // Procesar segun topico
    if (topic === 'payment') {
      const payment = await getPayment(id.toString());
      if (!payment?.external_reference) {
        return NextResponse.json({ received: true });
      }

      let status: 'pending' | 'approved' | 'rejected' = 'pending';
      if (payment.status === 'approved') status = 'approved';
      else if (['rejected', 'cancelled', 'refunded'].includes(payment.status || '')) {
        status = 'rejected';
      }

      // Idempotencia: no actualizar si ya esta en estado terminal
      const existing = await getPurchaseStatus(payment.external_reference);
      if (existing?.status === 'approved' || existing?.status === 'rejected') {
        return NextResponse.json({ received: true });
      }

      const payerEmail = payment.payer?.email;
      await updatePurchase(payment.external_reference, {
        status,
        mercadopago_payment_id: id.toString(),
        ...(payerEmail ? { user_email: payerEmail } : {}),
        updated_at: new Date().toISOString(),
      });
    }

    if (topic === 'order') {
      // Obtener order completa
      const orderRes = await fetch(
        `https://api.mercadopago.com/v1/orders/${id}`,
        { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } }
      );
      const order = await orderRes.json();
      // Procesar order segun tu logica de negocio
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Siempre retornar 200 para evitar reintentos infinitos
    return NextResponse.json({ received: true });
  }
}

// GET endpoint para pings de verificacion de MercadoPago
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

---

## notification_url (Checkout Pro / Preferencias)

Al crear preferencia o pago, puedes enviar `notification_url`:

```json
{
  "notification_url": "https://tusitio.com/webhooks/mercadopago"
}
```

Para forzar IPN en lugar de webhook: `?source_news=ipn` en la URL.

---

## Estados de pago

| Estado | Descripcion |
|--------|-------------|
| `pending` | Pendiente |
| `approved` | Aprobado |
| `authorized` | Autorizado (captura manual) |
| `in_process` | En revision |
| `in_mediation` | En disputa |
| `rejected` | Rechazado |
| `cancelled` | Cancelado |
| `refunded` | Reembolsado |
| `charged_back` | Contracargo |
