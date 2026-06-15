# Checkout Pro - Integracion completa

Checkout Pro es una solucion de **redireccion**: el cliente compra en tu sitio y paga en el entorno de Mercado Pago. Ideal para integracion rapida con experiencia preconstruida.

## Caracteristicas

- Experiencia de cobro **en Mercado Pago** (redireccion)
- Medios de pago: Tarjeta credito/debito, Rapipago, Pago Facil, Cuenta MP, Cuotas sin Tarjeta (Argentina)
- Cuotas sin interes configurables
- 3DS 2.0, antifraude, PCI DSS
- URLs de retorno configurables

## Flujo

```
1. Usuario cierra carrito y selecciona pagar con Mercado Pago
2. Backend crea preferencia via API --> devuelve init_point (URL)
3. Usuario es redirigido al checkout de MP (init_point)
4. Elige medio de pago (cuenta MP o invitado)
5. Tras completar, es redirigido a tu sitio (back_urls)
6. Webhook confirma el estado del pago en background
```

---

## API de Preferencias

### Endpoint

```http
POST https://api.mercadopago.com/checkout/preferences
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

### Atributos principales

| Atributo | Tipo | Descripcion |
|----------|------|-------------|
| `items` | array | Lista de productos/servicios |
| `payer` | object | Datos del comprador |
| `back_urls` | object | URLs de retorno tras el pago |
| `auto_return` | string | `"approved"` = redireccion automatica si aprobado |
| `payment_methods` | object | Configuracion de medios de pago |
| `notification_url` | string | URL para webhooks |
| `external_reference` | string | Referencia externa (ej: ID de orden) |
| `statement_descriptor` | string | Nombre que aparece en el resumen de tarjeta |
| `expires` | boolean | Si la preferencia expira |
| `expiration_date_from` | string | ISO 8601 |
| `expiration_date_to` | string | ISO 8601 |
| `purpose` | string | `"wallet_purchase"` = solo usuarios MP; `"onboarding_credits"` = Cuotas sin Tarjeta |

### Estructura de `items`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `id` | string | ID unico del item |
| `title` | string | Nombre del producto |
| `description` | string | Descripcion |
| `picture_url` | string | URL de imagen |
| `category_id` | string | Categoria (ver `/item_categories`) |
| `quantity` | number | Cantidad |
| `unit_price` | number | Precio unitario |
| `currency_id` | string | Ej: `"ARS"`, `"BRL"` |

### Estructura de `payer`

| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `name` | string | Nombre |
| `surname` | string | Apellido |
| `email` | string | Email |
| `phone` | object | `area_code`, `number` |
| `identification` | object | `type` (DNI, etc.), `number` |
| `address` | object | `street_name`, `street_number`, `zip_code` |

### Estructura de `back_urls`

| Campo | Descripcion |
|-------|-------------|
| `success` | URL si pago aprobado |
| `failure` | URL si pago rechazado |
| `pending` | URL si pago pendiente |

**Parametros devueltos en la URL de retorno:**
- `payment_id` - ID del pago
- `status` - Estado (`approved`, `pending`, `rejected`)
- `external_reference` - Tu referencia
- `merchant_order_id` - ID de la orden MP

### Estructura de `payment_methods`

| Campo | Descripcion |
|-------|-------------|
| `excluded_payment_methods` | Array de `{ id: "master" }` para excluir medios |
| `excluded_payment_types` | Array de `{ id: "ticket" }` para excluir tipos |
| `installments` | Numero maximo de cuotas |
| `default_payment_method_id` | Medio por defecto |
| `default_installments` | Cuotas por defecto |

**Tipos de pago (`excluded_payment_types`):**
- `credit_card`, `debit_card`, `prepaid_card`
- `ticket` - Efectivo (Rapipago, Pago Facil, etc.)
- `bank_transfer`, `atm`, `digital_wallet`, `digital_currency`

**Medios de pago (`excluded_payment_methods`):**
- `visa`, `master`, `amex`, `naranja`, `cabal`, `debvisa`, `debmaster`, etc.
- `rapipago`, `pagofacil` - Efectivo Argentina

---

## Backend (Next.js)

### Cliente MercadoPago

```typescript
// src/lib/mercadopago/client.ts
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

const preference = new Preference(client);
const payment = new Payment(client);

interface CreatePreferenceParams {
  items: { id: string; title: string; quantity: number; unit_price: number }[];
  purchaseId: string;
  buyerEmail?: string;
}

export async function createPreference({
  items, purchaseId, buyerEmail,
}: CreatePreferenceParams) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  return preference.create({
    body: {
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        unit_price: item.unit_price,
        currency_id: 'ARS', // Ajustar segun pais (ver references/payment-methods.md)
      })),
      ...(buyerEmail ? { payer: { email: buyerEmail } } : {}),
      back_urls: {
        success: `${baseUrl}/payment-success?purchase=${purchaseId}`,
        failure: `${baseUrl}/payment-failure?purchase=${purchaseId}`,
        pending: `${baseUrl}/payment-success?purchase=${purchaseId}&status=pending`,
      },
      // CRITICO: auto_return requiere HTTPS. Omitir en localhost o MP devuelve 400.
      ...(baseUrl.startsWith('https') ? { auto_return: 'approved' as const } : {}),
      external_reference: purchaseId,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'YOUR_BRAND', // Reemplazar con marca del usuario
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });
}

export async function getPayment(paymentId: string) {
  return payment.get({ id: paymentId });
}
```

### API Route - Checkout

```typescript
// src/app/api/checkout/route.ts
import { NextResponse } from 'next/server';
import { createPurchase, updatePurchase } from '@/lib/db/purchases';
import { createPreference } from '@/lib/mercadopago/client';
import { z } from 'zod';

const checkoutSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string().min(1),
    quantity: z.number().positive(),
    unit_price: z.number().positive(),
  })).min(1),
  email: z.string().email().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }

    const { items, email } = validation.data;
    const totalAmount = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    const purchase = await createPurchase({
      user_email: email || 'pending@checkout',
      status: 'pending',
      total_amount: totalAmount,
    });

    const mpPreference = await createPreference({
      items, purchaseId: purchase.id, buyerEmail: email,
    });

    await updatePurchase(purchase.id, {
      mercadopago_preference_id: mpPreference.id,
    });

    return NextResponse.json({
      preferenceId: mpPreference.id,
      initPoint: mpPreference.init_point,
      purchaseId: purchase.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
```

### API Route - Estado de compra (verificacion)

La pagina de exito consulta este endpoint para verificar el estado **server-side**
(nunca confiar solo en la `back_url`).

```typescript
// src/app/api/purchases/[id]/route.ts
import { NextResponse } from 'next/server';
import { getPurchaseStatus } from '@/lib/db/purchases';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = await getPurchaseStatus(id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ id: data.id, status: data.status });
}
```

---

## Frontend

### React (Next.js) - Boton Checkout Pro

```tsx
'use client';

import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    MercadoPago: new (publicKey: string, options?: { locale: string }) => {
      checkout: (config: { preference: { id: string } }) => { open: () => void };
    };
  }
}

export function CheckoutProButton({ preferenceId }: { preferenceId: string }) {
  const scriptLoaded = useRef(false);

  const openCheckout = useCallback(() => {
    if (!window.MercadoPago || !preferenceId) return;
    const mp = new window.MercadoPago(process.env.NEXT_PUBLIC_MP_PUBLIC_KEY!, {
      locale: 'es-AR'
    });
    const checkout = mp.checkout({ preference: { id: preferenceId } });
    checkout.open();
  }, [preferenceId]);

  useEffect(() => {
    if (scriptLoaded.current) return;
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => { scriptLoaded.current = true; };
    document.body.appendChild(script);
  }, []);

  return (
    <button onClick={openCheckout} type="button">
      Pagar con Mercado Pago
    </button>
  );
}
```

### Hook useCheckout (anti-doble-click)

```typescript
'use client';
import { useCallback, useRef, useState } from 'react';

export function useCheckout() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(false);

  const submitCheckout = useCallback(async (items: unknown[]) => {
    if (guard.current) return;
    setError(null);
    guard.current = true;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      if (data.initPoint) window.location.href = data.initPoint;
      else throw new Error('No payment link returned');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsSubmitting(false);
      guard.current = false;
    }
  }, []);

  return { submitCheckout, isSubmitting, error };
}
```

### Pagina de exito con verificacion

```tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

type Status = 'loading' | 'approved' | 'pending' | 'rejected' | 'error';

function PaymentResult() {
  const purchaseId = useSearchParams().get('purchase');
  const [status, setStatus] = useState<Status>(purchaseId ? 'loading' : 'approved');

  const verify = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/purchases/${id}`);
      if (!res.ok) { setStatus('error'); return; }
      const { status } = await res.json();
      setStatus(status === 'approved' ? 'approved'
        : status === 'pending' ? 'pending' : 'rejected');
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => { if (purchaseId) verify(purchaseId); }, [purchaseId, verify]);

  return <div>{/* Renderizar UI segun status */}</div>;
}

// IMPORTANTE: Siempre envolver useSearchParams en Suspense
export default function PaymentSuccessPage() {
  return <Suspense fallback={<div>Loading...</div>}><PaymentResult /></Suspense>;
}
```

### Vanilla JavaScript

```html
<script src="https://sdk.mercadopago.com/js/v2"></script>
<script>
const mp = new MercadoPago('PUBLIC_KEY');
const checkout = mp.checkout({
  preference: { id: 'PREFERENCE_ID' }
});
checkout.open();
</script>
```

### Next.js layout con Script

```tsx
// app/layout.tsx
import Script from 'next/script';

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <Script
          src="https://sdk.mercadopago.com/js/v2"
          strategy="lazyOnload"
        />
        {children}
      </body>
    </html>
  );
}
```

---

## Envio (shipments) en preferencia

```json
{
  "shipments": {
    "cost": 1000,
    "mode": "not_specified"
  }
}
```

## Vencimiento para efectivo (Rapipago/Pagofacil)

```json
{
  "date_of_expiration": "2025-03-15T23:59:59.000-03:00"
}
```

Fecha entre 1 y 30 dias desde la creacion.

---

## Ejemplo minimo de preferencia

```json
{
  "items": [
    {
      "id": "item-001",
      "title": "Mi producto",
      "quantity": 1,
      "unit_price": 1500.50,
      "currency_id": "ARS"
    }
  ],
  "payer": {
    "email": "comprador@email.com"
  },
  "back_urls": {
    "success": "https://tusitio.com/success",
    "failure": "https://tusitio.com/failure",
    "pending": "https://tusitio.com/pending"
  },
  "auto_return": "approved",
  "notification_url": "https://tusitio.com/webhooks/mercadopago",
  "external_reference": "ORD-12345"
}
```

---

## Gotchas criticos

| Gotcha | Solucion |
|--------|----------|
| `auto_return` + localhost = 400 | Solo setear cuando URL empieza con `https` |
| `user_email NOT NULL` + sin email = 500 | Usar `'pending@checkout'` placeholder; el webhook lo actualiza |
| Hydration mismatch (localStorage cart) | Agregar `mounted` state guard antes de renderizar |
| Doble compra por doble-click | Usar `useRef` guard, no solo `useState` |
| Pagina de exito confia en redirect URL | Siempre verificar via `/api/purchases/[id]` |
| Webhook duplicados | Chequear si la compra ya esta en estado terminal |
| Webhooks no llegan a localhost | Usar ngrok: `ngrok http 3000` |
| Error `useSearchParams` | Envolver componente en `<Suspense>` |
